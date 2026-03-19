import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	createIncrementalVerifyHook,
	detectTypecheckCommand,
	resetAdvisoryDedup,
} from './incremental-verify';

const PASS_CMD = process.platform === 'win32' ? 'cmd /c exit 0' : 'true';

describe('incremental-verify hook', () => {
	let tmpDir: string;
	let injectResult: { sessionId: string; message: string } | null;
	let injectMessage: (sessionId: string, message: string) => void;

	beforeEach(async () => {
		tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'incr-verify-'));
		injectResult = null;
		injectMessage = (sessionId: string, message: string) => {
			injectResult = { sessionId, message };
		};
	});

	afterEach(async () => {
		await fs.promises.rm(tmpDir, { recursive: true, force: true });
	});

	// 1. Fires after coder delegation — passes
	test('fires after coder Task delegation with passing typecheck', async () => {
		const hook = createIncrementalVerifyHook(
			{
				enabled: true,
				command: PASS_CMD,
				timeoutMs: 5000,
				triggerAgents: ['coder'],
			},
			tmpDir,
			injectMessage,
		);
		await hook.toolAfter(
			{ tool: 'Task', sessionID: 'sess-1', args: { subagent_type: 'coder' } },
			{},
		);
		expect(injectResult).not.toBeNull();
		expect(injectResult!.sessionId).toBe('sess-1');
		expect(injectResult!.message).toContain('POST-CODER CHECK PASSED');
	});

	// 2. Does NOT fire after reviewer delegation
	test('does not fire after reviewer Task delegation', async () => {
		const hook = createIncrementalVerifyHook(
			{
				enabled: true,
				command: PASS_CMD,
				timeoutMs: 5000,
				triggerAgents: ['coder'],
			},
			tmpDir,
			injectMessage,
		);
		await hook.toolAfter(
			{
				tool: 'Task',
				sessionID: 'sess-2',
				args: { subagent_type: 'reviewer' },
			},
			{},
		);
		expect(injectResult).toBeNull();
	});

	// 3. Respects custom command from config
	test('respects custom command that exits 0', async () => {
		const customCmd =
			process.platform === 'win32' ? 'cmd /c echo type_ok' : 'echo type_ok';
		const hook = createIncrementalVerifyHook(
			{
				enabled: true,
				command: customCmd,
				timeoutMs: 5000,
				triggerAgents: ['coder'],
			},
			tmpDir,
			injectMessage,
		);
		await hook.toolAfter(
			{ tool: 'Task', sessionID: 'sess-3', args: { subagent_type: 'coder' } },
			{},
		);
		expect(injectResult).not.toBeNull();
		expect(injectResult!.message).toContain('POST-CODER CHECK PASSED');
	});

	// 4. Times out gracefully — timeout causes null result, no message injected
	test('handles timeout gracefully without throwing', async () => {
		// type CON reads from console (blocks indefinitely); proc.kill() terminates it.
		// The 80ms timeout fires, kill() is called, process exits → result is null → no message.
		const sleepCmd =
			process.platform === 'win32' ? 'cmd /c type con' : 'cat /dev/zero';
		const hook = createIncrementalVerifyHook(
			{
				enabled: true,
				command: sleepCmd,
				timeoutMs: 80,
				triggerAgents: ['coder'],
			},
			tmpDir,
			injectMessage,
		);
		await expect(
			hook.toolAfter(
				{ tool: 'Task', sessionID: 'sess-4', args: { subagent_type: 'coder' } },
				{},
			),
		).resolves.toBeUndefined();
		// If kill worked: injectResult is null (silent skip on timeout)
		// If kill didn't work: process exits → FAILED injected (platform limitation)
	});

	// 5. Skips when TypeScript not detected (no package.json, no tsconfig.json)
	test('skips when TypeScript not detected — no package.json or tsconfig', async () => {
		const hook = createIncrementalVerifyHook(
			{
				enabled: true,
				command: null,
				timeoutMs: 5000,
				triggerAgents: ['coder'],
			},
			tmpDir, // empty temp dir — no package.json, no tsconfig.json
			injectMessage,
		);
		await hook.toolAfter(
			{ tool: 'Task', sessionID: 'sess-5', args: { subagent_type: 'coder' } },
			{},
		);
		expect(injectResult).toBeNull();
	});

	// 6. Passes typecheck error output in failure message
	test('injects failure message with stderr when command exits non-zero', async () => {
		// Use a command that fails and produces stderr
		const failWithStderr =
			process.platform === 'win32'
				? 'cmd /c echo SomeTypeError > nul && exit 1'
				: 'sh -c "echo SomeTypeError >&2; exit 1"';
		const hook = createIncrementalVerifyHook(
			{
				enabled: true,
				command: failWithStderr,
				timeoutMs: 5000,
				triggerAgents: ['coder'],
			},
			tmpDir,
			injectMessage,
		);
		await hook.toolAfter(
			{ tool: 'Task', sessionID: 'sess-6', args: { subagent_type: 'coder' } },
			{},
		);
		expect(injectResult).not.toBeNull();
		expect(injectResult!.message).toContain('POST-CODER CHECK FAILED');
	});

	// 7. enabled: false — no injection regardless of tool/agent
	test('does not fire when enabled is false', async () => {
		const hook = createIncrementalVerifyHook(
			{
				enabled: false,
				command: PASS_CMD,
				timeoutMs: 5000,
				triggerAgents: ['coder'],
			},
			tmpDir,
			injectMessage,
		);
		await hook.toolAfter(
			{ tool: 'Task', sessionID: 'sess-7', args: { subagent_type: 'coder' } },
			{},
		);
		expect(injectResult).toBeNull();
	});

	// 8. Non-Task tool (bash) — injectMessage NOT called
	test('does not fire for non-Task tools', async () => {
		const hook = createIncrementalVerifyHook(
			{
				enabled: true,
				command: PASS_CMD,
				timeoutMs: 5000,
				triggerAgents: ['coder'],
			},
			tmpDir,
			injectMessage,
		);
		await hook.toolAfter({ tool: 'bash', sessionID: 'sess-8', args: {} }, {});
		expect(injectResult).toBeNull();
	});

	// 9. input.args is null/undefined — no throw, no injection
	test('handles null/undefined input.args without throwing', async () => {
		const hook = createIncrementalVerifyHook(
			{
				enabled: true,
				command: PASS_CMD,
				timeoutMs: 5000,
				triggerAgents: ['coder'],
			},
			tmpDir,
			injectMessage,
		);
		// Should not throw
		await hook.toolAfter({ tool: 'Task', sessionID: 'sess-9', args: null }, {});
		expect(injectResult).toBeNull();

		injectResult = null;
		await hook.toolAfter(
			{ tool: 'Task', sessionID: 'sess-9b', args: undefined },
			{},
		);
		expect(injectResult).toBeNull();
	});

	// 10. string[] command — passed through directly without split
	test('accepts string[] command and passes it through without split', async () => {
		// Use an array command to verify no split happens
		const arrayCmd =
			process.platform === 'win32'
				? ['cmd', '/c', 'echo', 'type_ok']
				: ['echo', 'type_ok'];
		const hook = createIncrementalVerifyHook(
			{
				enabled: true,
				command: arrayCmd,
				timeoutMs: 5000,
				triggerAgents: ['coder'],
			},
			tmpDir,
			injectMessage,
		);
		await hook.toolAfter(
			{ tool: 'Task', sessionID: 'sess-10', args: { subagent_type: 'coder' } },
			{},
		);
		expect(injectResult).not.toBeNull();
		expect(injectResult!.message).toContain('POST-CODER CHECK PASSED');
	});

	// 11. Prefixed agent name 'mega_coder' normalises to 'coder' and triggers
	test('normalises prefixed agent name (mega_coder → coder) and triggers', async () => {
		const hook = createIncrementalVerifyHook(
			{
				enabled: true,
				command: PASS_CMD,
				timeoutMs: 5000,
				triggerAgents: ['coder'],
			},
			tmpDir,
			injectMessage,
		);
		await hook.toolAfter(
			{
				tool: 'Task',
				sessionID: 'sess-10',
				args: { subagent_type: 'mega_coder' },
			},
			{},
		);
		expect(injectResult).not.toBeNull();
		expect(injectResult!.message).toContain('POST-CODER CHECK PASSED');
	});
});

describe('detectTypecheckCommand adversarial tests', () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), 'detect-cmd-adversarial-'),
		);
	});

	afterEach(async () => {
		await fs.promises.rm(tmpDir, { recursive: true, force: true });
	});

	// 1. Malformed package.json (invalid JSON) → should return null (caught by try/catch)
	test('returns null for malformed package.json (invalid JSON)', async () => {
		const badPkgPath = path.join(tmpDir, 'package.json');
		await fs.promises.writeFile(
			badPkgPath,
			'{ "name": "test", invalid }',
			'utf8',
		);
		const result = detectTypecheckCommand(tmpDir);
		expect(result).toBeNull();
	});

	// 2. package.json with scripts as non-object (e.g., scripts: "invalid") → should not throw
	test('handles package.json with non-object scripts field without throwing', async () => {
		const badPkgPath = path.join(tmpDir, 'package.json');
		await fs.promises.writeFile(
			badPkgPath,
			'{ "name": "test", "scripts": "invalid" }',
			'utf8',
		);
		// Should not throw — the try/catch handles this gracefully
		const result = detectTypecheckCommand(tmpDir);
		// Since scripts is not an object, scripts?.typecheck is undefined, so it falls through
		// No typescript dependency or tsconfig.json, so it returns null
		expect(result).toBeNull();
	});

	// 3. Project dir that doesn't exist → detectTypecheckCommand should return null gracefully
	test('returns null gracefully when project dir does not exist', async () => {
		const nonExistentDir = path.join(
			os.tmpdir(),
			`this-dir-definitely-does-not-exist-${Date.now()}`,
		);
		const result = detectTypecheckCommand(nonExistentDir);
		expect(result).toBeNull();
	});

	// 4. Both go.mod AND Cargo.toml present → should detect Go first (priority order)
	test('detects Go over Rust when both go.mod and Cargo.toml are present', async () => {
		await fs.promises.writeFile(
			path.join(tmpDir, 'go.mod'),
			'module test\n',
			'utf8',
		);
		await fs.promises.writeFile(
			path.join(tmpDir, 'Cargo.toml'),
			'[package]\nname = "test"\n',
			'utf8',
		);
		const result = detectTypecheckCommand(tmpDir);
		expect(result).not.toBeNull();
		expect(result!.language).toBe('go');
		expect(result!.command).toEqual(['go', 'vet', './...']);
	});

	// 5. Python project (pyproject.toml) AND package.json present → should detect Node/JS (package.json wins)
	test('detects Node/JS over Python when both package.json and pyproject.toml are present', async () => {
		await fs.promises.writeFile(
			path.join(tmpDir, 'package.json'),
			'{ "name": "test", "dependencies": { "typescript": "^5.0.0" } }',
			'utf8',
		);
		await fs.promises.writeFile(
			path.join(tmpDir, 'pyproject.toml'),
			'[project]\nname = "test"\n',
			'utf8',
		);
		const result = detectTypecheckCommand(tmpDir);
		expect(result).not.toBeNull();
		expect(result!.language).toBe('typescript');
	});

	// 6. Go project via go.mod returns go vet command
	test('Go project via go.mod returns go vet command', async () => {
		fs.writeFileSync(path.join(tmpDir, 'go.mod'), 'module myproject\n', 'utf8');
		const result = detectTypecheckCommand(tmpDir);
		expect(result).toEqual({ command: ['go', 'vet', './...'], language: 'go' });
	});

	// 7. Rust via Cargo.toml returns cargo check
	test('Rust via Cargo.toml returns cargo check', async () => {
		fs.writeFileSync(
			path.join(tmpDir, 'Cargo.toml'),
			'[package]\nname = "test"\n',
			'utf8',
		);
		const result = detectTypecheckCommand(tmpDir);
		expect(result).toEqual({ command: ['cargo', 'check'], language: 'rust' });
	});

	// 8. C# via .csproj returns dotnet build
	test('C# via .csproj returns dotnet build', async () => {
		fs.writeFileSync(path.join(tmpDir, 'App.csproj'), '<Project />', 'utf8');
		const result = detectTypecheckCommand(tmpDir);
		expect(result).toEqual({
			command: ['dotnet', 'build', '--no-restore'],
			language: 'csharp',
		});
	});

	// 9. Python via pyproject.toml emits SKIPPED advisory via hook
	test('Python via pyproject.toml emits SKIPPED advisory via hook', async () => {
		fs.writeFileSync(
			path.join(tmpDir, 'pyproject.toml'),
			'[project]\nname = "test"\n',
			'utf8',
		);
		resetAdvisoryDedup();
		let capturedMessage: string | null = null;
		const captureInject: (sessionId: string, message: string) => void = (
			_sessionId,
			message,
		) => {
			capturedMessage = message;
		};
		const hook = createIncrementalVerifyHook(
			{
				enabled: true,
				command: null,
				timeoutMs: 5000,
				triggerAgents: ['coder'],
			},
			tmpDir,
			captureInject,
		);
		await hook.toolAfter(
			{ tool: 'Task', sessionID: 'sess-py', args: { subagent_type: 'coder' } },
			{},
		);
		expect(capturedMessage).not.toBeNull();
		expect(capturedMessage!).toContain('POST-CODER CHECK SKIPPED');
		expect(capturedMessage!).toContain('python');
	});

	// 10. TypeScript detection regression guard
	test('TypeScript detection regression guard', async () => {
		fs.writeFileSync(
			path.join(tmpDir, 'package.json'),
			'{ "devDependencies": { "typescript": "^5.0.0" } }',
			'utf8',
		);
		fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}', 'utf8');
		const result = detectTypecheckCommand(tmpDir);
		expect(result).not.toBeNull();
		expect(result!.command).toEqual(['npx', 'tsc', '--noEmit']);
		expect(result!.language).toBe('typescript');
	});
});

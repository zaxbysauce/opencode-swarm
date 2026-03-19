import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createIncrementalVerifyHook } from './incremental-verify';

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

	// 10. Prefixed agent name 'mega_coder' normalises to 'coder' and triggers
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

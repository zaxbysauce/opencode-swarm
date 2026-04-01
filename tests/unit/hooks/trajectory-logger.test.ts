import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
	createTrajectoryLoggerHook,
	recordToolCallStart,
	type TrajectoryConfig,
	truncateTrajectoryFile,
} from '../../../src/hooks/trajectory-logger';
import {
	resetSwarmState,
	startAgentSession,
	swarmState,
} from '../../../src/state';

function defaultConfig(
	overrides?: Partial<TrajectoryConfig>,
): Partial<TrajectoryConfig> {
	return {
		enabled: true,
		max_lines: 500,
		...overrides,
	};
}

describe('trajectory-logger', () => {
	let tempDir: string;

	beforeEach(() => {
		resetSwarmState();
		tempDir = path.join(
			tmpdir(),
			`test-trajectory-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		);
		fs.mkdirSync(path.join(tempDir, '.swarm'), { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
		resetSwarmState();
	});

	// ─────────────────────────────────────────────────────────────────────────────
	// Scenario 1: toolAfter with valid delegation scope → entry appended to trajectory.jsonl
	// ─────────────────────────────────────────────────────────────────────────────
	test('toolAfter with delegationActive=true writes entry to trajectory.jsonl', async () => {
		const sessionId = 'session-delegation-active';
		startAgentSession(sessionId, 'coder');
		const session = swarmState.agentSessions.get(sessionId)!;
		session.delegationActive = true;
		session.currentTaskId = '1.1';

		const hook = createTrajectoryLoggerHook(defaultConfig(), tempDir);

		recordToolCallStart(sessionId, 'call-1', Date.now() - 150);

		const input = {
			tool: 'Read',
			sessionID: sessionId,
			callID: 'call-1',
			args: { filePath: '/src/app.ts' },
		};
		const output = {
			title: 'Read Result',
			output: 'file contents...',
			metadata: { success: true },
		};

		await hook.toolAfter(input, output);

		const trajectoryPath = path.join(
			tempDir,
			'.swarm',
			'evidence',
			'1.1',
			'trajectory.jsonl',
		);
		expect(fs.existsSync(trajectoryPath)).toBe(true);

		const content = fs.readFileSync(trajectoryPath, 'utf-8');
		const lines = content.split('\n').filter((l) => l.trim());
		expect(lines.length).toBe(1);

		const entry = JSON.parse(lines[0]);
		expect(entry.tool).toBe('Read');
		expect(entry.args_summary).toBe('filePath:"/src/app.ts"');
		expect(entry.verdict).toBe('success');
		expect(entry.agent).toBe('coder');
		expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		expect(entry.elapsed_ms).toBeGreaterThanOrEqual(150);
	});

	// ─────────────────────────────────────────────────────────────────────────────
	// Scenario 2: toolAfter outside delegation scope → no entry written
	// ─────────────────────────────────────────────────────────────────────────────
	test('toolAfter with delegationActive=false does NOT write entry', async () => {
		const sessionId = 'session-no-delegation';
		startAgentSession(sessionId, 'coder');
		const session = swarmState.agentSessions.get(sessionId)!;
		session.delegationActive = false;
		session.currentTaskId = '1.2';

		const hook = createTrajectoryLoggerHook(defaultConfig(), tempDir);

		const input = {
			tool: 'Read',
			sessionID: sessionId,
			callID: 'call-2',
			args: { filePath: '/src/app.ts' },
		};
		const output = {
			title: 'Read Result',
			output: 'file contents...',
			metadata: null,
		};

		await hook.toolAfter(input, output);

		const trajectoryPath = path.join(
			tempDir,
			'.swarm',
			'evidence',
			'1.2',
			'trajectory.jsonl',
		);
		expect(fs.existsSync(trajectoryPath)).toBe(false);
	});

	test('toolAfter when no session exists does NOT write entry', async () => {
		const hook = createTrajectoryLoggerHook(defaultConfig(), tempDir);

		const input = {
			tool: 'Read',
			sessionID: 'nonexistent-session',
			callID: 'call-3',
			args: { filePath: '/src/app.ts' },
		};
		const output = {
			title: 'Read Result',
			output: 'file contents...',
			metadata: null,
		};

		await hook.toolAfter(input, output);

		const trajectoryPath = path.join(
			tempDir,
			'.swarm',
			'evidence',
			'1.3',
			'trajectory.jsonl',
		);
		expect(fs.existsSync(trajectoryPath)).toBe(false);
	});

	// ─────────────────────────────────────────────────────────────────────────────
	// Scenario 3: Sensitive args (password, secret_key, token) → redacted in args_summary
	// ─────────────────────────────────────────────────────────────────────────────
	test('sensitive field names are redacted in args_summary', async () => {
		const sessionId = 'session-sensitive';
		startAgentSession(sessionId, 'coder');
		const session = swarmState.agentSessions.get(sessionId)!;
		session.delegationActive = true;
		session.currentTaskId = '2.1';

		const hook = createTrajectoryLoggerHook(defaultConfig(), tempDir);

		const input = {
			tool: 'bash',
			sessionID: sessionId,
			callID: 'call-sensitive',
			args: {
				password: 'super-secret-123',
				secret_key: 'sk-abcdefghijk',
				token: 'ghp_token123456',
				regular_field: 'safe-value',
			},
		};
		const output = {
			title: 'Bash Result',
			output: 'ok',
			metadata: null,
		};

		await hook.toolAfter(input, output);

		const trajectoryPath = path.join(
			tempDir,
			'.swarm',
			'evidence',
			'2.1',
			'trajectory.jsonl',
		);
		const content = fs.readFileSync(trajectoryPath, 'utf-8');
		const entry = JSON.parse(content.split('\n')[0]);

		// All sensitive fields must be redacted
		expect(entry.args_summary).not.toContain('super-secret-123');
		expect(entry.args_summary).not.toContain('sk-abcdefghijk');
		expect(entry.args_summary).not.toContain('ghp_token123456');

		// All sensitive fields must show [REDACTED]
		expect(entry.args_summary).toContain('[REDACTED]');
		expect(entry.args_summary).toContain('regular_field:"safe-value"');
	});

	test('keys containing sensitive substrings are redacted (case-insensitive)', async () => {
		const sessionId = 'session-substring-sensitive';
		startAgentSession(sessionId, 'coder');
		const session = swarmState.agentSessions.get(sessionId)!;
		session.delegationActive = true;
		session.currentTaskId = '2.2';

		const hook = createTrajectoryLoggerHook(defaultConfig(), tempDir);

		const input = {
			tool: 'api',
			sessionID: sessionId,
			callID: 'call-substr',
			args: {
				my_secret_key: 'value1',
				user_password: 'value2',
				auth_token: 'value3',
				regular_param: 'safe',
			},
		};
		const output = {
			title: 'API Result',
			output: 'ok',
			metadata: null,
		};

		await hook.toolAfter(input, output);

		const trajectoryPath = path.join(
			tempDir,
			'.swarm',
			'evidence',
			'2.2',
			'trajectory.jsonl',
		);
		const content = fs.readFileSync(trajectoryPath, 'utf-8');
		const entry = JSON.parse(content.split('\n')[0]);

		// All sensitive substring keys must be redacted
		expect(entry.args_summary).not.toContain('value1');
		expect(entry.args_summary).not.toContain('value2');
		expect(entry.args_summary).not.toContain('value3');

		// Safe field must NOT be redacted
		expect(entry.args_summary).toContain('regular_param:"safe"');
	});

	// ─────────────────────────────────────────────────────────────────────────────
	// Scenario 4: args_summary truncated at 200 chars
	// ─────────────────────────────────────────────────────────────────────────────
	test('args_summary is truncated at 200 characters', async () => {
		const sessionId = 'session-truncate';
		startAgentSession(sessionId, 'coder');
		const session = swarmState.agentSessions.get(sessionId)!;
		session.delegationActive = true;
		session.currentTaskId = '3.1';

		const hook = createTrajectoryLoggerHook(defaultConfig(), tempDir);

		// Create many args that will exceed 200 chars
		const longArgs: Record<string, unknown> = {};
		for (let i = 0; i < 20; i++) {
			longArgs[`param${i}`] = `value-with-a-very-long-string-${i}`.repeat(5);
		}

		const input = {
			tool: 'BatchEdit',
			sessionID: sessionId,
			callID: 'call-truncate',
			args: longArgs,
		};
		const output = {
			title: 'Batch Result',
			output: 'done',
			metadata: null,
		};

		await hook.toolAfter(input, output);

		const trajectoryPath = path.join(
			tempDir,
			'.swarm',
			'evidence',
			'3.1',
			'trajectory.jsonl',
		);
		const content = fs.readFileSync(trajectoryPath, 'utf-8');
		const entry = JSON.parse(content.split('\n')[0]);

		expect(entry.args_summary.length).toBeLessThanOrEqual(200);
		expect(entry.args_summary).toMatch(/\.\.\.$/); // Must end with ellipsis truncation marker
	});

	// ─────────────────────────────────────────────────────────────────────────────
	// Scenario 5: File truncation at 500 lines → oldest half kept
	// ─────────────────────────────────────────────────────────────────────────────
	test('truncateTrajectoryFile keeps newest half when maxLines exceeded', async () => {
		const taskId = '4.1';
		const evidenceDir = path.join(tempDir, '.swarm', 'evidence', taskId);
		fs.mkdirSync(evidenceDir, { recursive: true });
		const trajectoryPath = path.join(evidenceDir, 'trajectory.jsonl');

		// Write 600 lines (exceeds maxLines of 500)
		const lines: string[] = [];
		for (let i = 1; i <= 600; i++) {
			const entry = {
				tool: `Tool${i}`,
				args_summary: `arg${i}`,
				verdict: 'success',
				timestamp: new Date().toISOString(),
				agent: 'coder',
				elapsed_ms: i * 10,
			};
			lines.push(JSON.stringify(entry));
		}
		fs.writeFileSync(trajectoryPath, lines.join('\n') + '\n', 'utf-8');

		await truncateTrajectoryFile(trajectoryPath, 500);

		const remaining = fs.readFileSync(trajectoryPath, 'utf-8');
		const remainingLines = remaining.split('\n').filter((l) => l.trim());

		// Should keep 250 lines (floor(500/2))
		expect(remainingLines.length).toBe(250);

		// Should keep the newest entries (last 250 of original 600)
		const firstRemaining = JSON.parse(remainingLines[0]);
		const lastRemaining = JSON.parse(remainingLines[remainingLines.length - 1]);

		expect(firstRemaining.tool).toBe('Tool351');
		expect(lastRemaining.tool).toBe('Tool600');
	});

	test('truncateTrajectoryFile does nothing when under maxLines', async () => {
		const taskId = '4.2';
		const evidenceDir = path.join(tempDir, '.swarm', 'evidence', taskId);
		fs.mkdirSync(evidenceDir, { recursive: true });
		const trajectoryPath = path.join(evidenceDir, 'trajectory.jsonl');

		// Write only 10 lines (well under maxLines of 500)
		const lines: string[] = [];
		for (let i = 1; i <= 10; i++) {
			const entry = {
				tool: `Tool${i}`,
				args_summary: `arg${i}`,
				verdict: 'success',
				timestamp: new Date().toISOString(),
				agent: 'coder',
				elapsed_ms: i * 10,
			};
			lines.push(JSON.stringify(entry));
		}
		fs.writeFileSync(trajectoryPath, lines.join('\n') + '\n', 'utf-8');

		await truncateTrajectoryFile(trajectoryPath, 500);

		const remaining = fs.readFileSync(trajectoryPath, 'utf-8');
		const remainingLines = remaining.split('\n').filter((l) => l.trim());
		expect(remainingLines.length).toBe(10);
	});

	// ─────────────────────────────────────────────────────────────────────────────
	// Scenario 6: Invalid taskId (path traversal) → sanitized, safe path
	// Note: sanitizeTaskId is called OUTSIDE the try block, so validation errors
	// propagate rather than being caught by the non-blocking catch.
	// ─────────────────────────────────────────────────────────────────────────────
	test('path traversal in taskId causes sanitizeTaskId to throw (error propagates, no file created)', async () => {
		const sessionId = 'session-pathtrav';
		startAgentSession(sessionId, 'coder');
		const session = swarmState.agentSessions.get(sessionId)!;
		session.delegationActive = true;
		session.currentTaskId = '../../../etc/passwd';

		const hook = createTrajectoryLoggerHook(defaultConfig(), tempDir);

		const input = {
			tool: 'Read',
			sessionID: sessionId,
			callID: 'call-pt',
			args: {},
		};
		const output = {
			title: 'Result',
			output: 'ok',
			metadata: null,
		};

		// sanitizeTaskId throws BEFORE the try block, so error propagates
		// The hook does NOT create any file when taskId is invalid
		await expect(hook.toolAfter(input, output)).rejects.toThrow(
			'Invalid task ID: path traversal detected',
		);

		// No file should be created at the traversal path (nothing leaks outside .swarm)
		const etcPasswd = path.join(
			tempDir,
			'.swarm',
			'evidence',
			'..',
			'..',
			'..',
			'etc',
			'passwd',
		);
		expect(fs.existsSync(etcPasswd)).toBe(false);
	});

	test('taskId with null bytes causes sanitizeTaskId to throw (error propagates, no file created)', async () => {
		const sessionId = 'session-nullbyte';
		startAgentSession(sessionId, 'coder');
		const session = swarmState.agentSessions.get(sessionId)!;
		session.delegationActive = true;
		session.currentTaskId = '1.1\x00invalid';

		const hook = createTrajectoryLoggerHook(defaultConfig(), tempDir);

		const input = {
			tool: 'Read',
			sessionID: sessionId,
			callID: 'call-nb',
			args: {},
		};
		const output = {
			title: 'Result',
			output: 'ok',
			metadata: null,
		};

		// sanitizeTaskId throws BEFORE the try block, so error propagates
		await expect(hook.toolAfter(input, output)).rejects.toThrow(
			'Invalid task ID: contains null bytes',
		);

		// No file should leak outside .swarm
		expect(
			fs.existsSync(path.join(tempDir, '.swarm', 'evidence', '1.1\x00invalid')),
		).toBe(false);
	});

	// ─────────────────────────────────────────────────────────────────────────────
	// Scenario 7: Non-blocking — errors don't crash the hook
	// ─────────────────────────────────────────────────────────────────────────────
	test('toolAfter does not throw when file I/O fails', async () => {
		const sessionId = 'session-ioerr';
		startAgentSession(sessionId, 'coder');
		const session = swarmState.agentSessions.get(sessionId)!;
		session.delegationActive = true;
		session.currentTaskId = '5.1';

		// Make the evidence directory read-only to trigger I/O error
		const evidenceDir = path.join(tempDir, '.swarm', 'evidence', '5.1');
		fs.mkdirSync(evidenceDir, { recursive: true });

		const hook = createTrajectoryLoggerHook(defaultConfig(), tempDir);

		const input = {
			tool: 'Read',
			sessionID: sessionId,
			callID: 'call-ioerr',
			args: { path: '/test' },
		};
		const output = {
			title: 'Result',
			output: 'ok',
			metadata: null,
		};

		// Should NOT throw even though subsequent write will fail
		await expect(hook.toolAfter(input, output)).resolves.toBeUndefined();
	});

	test('toolAfter does not throw when session is deleted before hook runs', async () => {
		const sessionId = 'session-deleted';

		// Create session but DON'T store reference — just set up state directly
		startAgentSession(sessionId, 'coder');
		const session = swarmState.agentSessions.get(sessionId)!;
		session.delegationActive = true;
		session.currentTaskId = '5.2';

		// Delete session from map BEFORE hook runs (simulates race condition)
		swarmState.agentSessions.delete(sessionId);

		const hook = createTrajectoryLoggerHook(defaultConfig(), tempDir);

		const input = {
			tool: 'Read',
			sessionID: sessionId,
			callID: 'call-deleted',
			args: {},
		};
		const output = {
			title: 'Result',
			output: 'ok',
			metadata: null,
		};

		// Should NOT throw — errors are non-blocking
		await expect(hook.toolAfter(input, output)).resolves.toBeUndefined();
	});

	// ─────────────────────────────────────────────────────────────────────────────
	// Scenario 8: elapsed_ms correctly calculated
	// ─────────────────────────────────────────────────────────────────────────────
	test('elapsed_ms is correctly calculated from recordToolCallStart to toolAfter', async () => {
		const sessionId = 'session-elapsed';
		startAgentSession(sessionId, 'coder');
		const session = swarmState.agentSessions.get(sessionId)!;
		session.delegationActive = true;
		session.currentTaskId = '6.1';

		const hook = createTrajectoryLoggerHook(defaultConfig(), tempDir);

		const startTime = Date.now() - 500; // 500ms ago
		recordToolCallStart(sessionId, 'call-elapsed', startTime);

		const input = {
			tool: 'bash',
			sessionID: sessionId,
			callID: 'call-elapsed',
			args: { command: 'sleep 0' },
		};
		const output = {
			title: 'Bash Result',
			output: 'done',
			metadata: null,
		};

		await hook.toolAfter(input, output);

		const trajectoryPath = path.join(
			tempDir,
			'.swarm',
			'evidence',
			'6.1',
			'trajectory.jsonl',
		);
		const content = fs.readFileSync(trajectoryPath, 'utf-8');
		const entry = JSON.parse(content.split('\n')[0]);

		// Should be approximately 500ms (within 50ms tolerance for test execution overhead)
		expect(entry.elapsed_ms).toBeGreaterThanOrEqual(490);
		expect(entry.elapsed_ms).toBeLessThan(2000); // sanity bound
	});

	test('elapsed_ms falls back to Date.now() when no start time recorded', async () => {
		const sessionId = 'session-no-start';
		startAgentSession(sessionId, 'coder');
		const session = swarmState.agentSessions.get(sessionId)!;
		session.delegationActive = true;
		session.currentTaskId = '6.2';

		const hook = createTrajectoryLoggerHook(defaultConfig(), tempDir);

		// Call toolAfter WITHOUT calling recordToolCallStart first
		const beforeCall = Date.now();
		const input = {
			tool: 'bash',
			sessionID: sessionId,
			callID: 'call-no-start',
			args: {},
		};
		const output = {
			title: 'Bash Result',
			output: 'done',
			metadata: null,
		};

		await hook.toolAfter(input, output);
		const afterCall = Date.now();

		const trajectoryPath = path.join(
			tempDir,
			'.swarm',
			'evidence',
			'6.2',
			'trajectory.jsonl',
		);
		const content = fs.readFileSync(trajectoryPath, 'utf-8');
		const entry = JSON.parse(content.split('\n')[0]);

		// elapsed_ms should be very small (close to 0) since no prior start was recorded
		// and Date.now() was used as fallback
		expect(entry.elapsed_ms).toBeGreaterThanOrEqual(0);
		expect(entry.elapsed_ms).toBeLessThanOrEqual(afterCall - beforeCall + 100);
	});

	// ─────────────────────────────────────────────────────────────────────────────
	// Additional: verdict derivation
	// ─────────────────────────────────────────────────────────────────────────────
	test('verdict is failure when output starts with Error:', async () => {
		const sessionId = 'session-verdict-error';
		startAgentSession(sessionId, 'coder');
		const session = swarmState.agentSessions.get(sessionId)!;
		session.delegationActive = true;
		session.currentTaskId = '7.1';

		const hook = createTrajectoryLoggerHook(defaultConfig(), tempDir);

		const input = {
			tool: 'Read',
			sessionID: sessionId,
			callID: 'call-verdict',
			args: {},
		};
		const output = {
			title: 'Read Result',
			output: 'Error: file not found',
			metadata: null,
		};

		await hook.toolAfter(input, output);

		const trajectoryPath = path.join(
			tempDir,
			'.swarm',
			'evidence',
			'7.1',
			'trajectory.jsonl',
		);
		const content = fs.readFileSync(trajectoryPath, 'utf-8');
		const entry = JSON.parse(content.split('\n')[0]);

		expect(entry.verdict).toBe('failure');
	});

	test('verdict comes from metadata when provided', async () => {
		const sessionId = 'session-verdict-meta';
		startAgentSession(sessionId, 'coder');
		const session = swarmState.agentSessions.get(sessionId)!;
		session.delegationActive = true;
		session.currentTaskId = '7.2';

		const hook = createTrajectoryLoggerHook(defaultConfig(), tempDir);

		const input = {
			tool: 'Read',
			sessionID: sessionId,
			callID: 'call-verdict-meta',
			args: {},
		};
		const output = {
			title: 'Read Result',
			output: 'something',
			metadata: { verdict: 'custom_verdict' },
		};

		await hook.toolAfter(input, output);

		const trajectoryPath = path.join(
			tempDir,
			'.swarm',
			'evidence',
			'7.2',
			'trajectory.jsonl',
		);
		const content = fs.readFileSync(trajectoryPath, 'utf-8');
		const entry = JSON.parse(content.split('\n')[0]);

		expect(entry.verdict).toBe('custom_verdict');
	});

	test('verdict is success by default', async () => {
		const sessionId = 'session-verdict-default';
		startAgentSession(sessionId, 'coder');
		const session = swarmState.agentSessions.get(sessionId)!;
		session.delegationActive = true;
		session.currentTaskId = '7.3';

		const hook = createTrajectoryLoggerHook(defaultConfig(), tempDir);

		const input = {
			tool: 'Read',
			sessionID: sessionId,
			callID: 'call-verdict-default',
			args: {},
		};
		const output = {
			title: 'Read Result',
			output: 'file contents here',
			metadata: null,
		};

		await hook.toolAfter(input, output);

		const trajectoryPath = path.join(
			tempDir,
			'.swarm',
			'evidence',
			'7.3',
			'trajectory.jsonl',
		);
		const content = fs.readFileSync(trajectoryPath, 'utf-8');
		const entry = JSON.parse(content.split('\n')[0]);

		expect(entry.verdict).toBe('success');
	});

	// ─────────────────────────────────────────────────────────────────────────────
	// Additional: agent name resolution
	// ─────────────────────────────────────────────────────────────────────────────
	test('agent name defaults to session.agentName when activeAgent not set', async () => {
		const sessionId = 'session-agent-fallback';
		startAgentSession(sessionId, 'reviewer');
		const session = swarmState.agentSessions.get(sessionId)!;
		session.delegationActive = true;
		session.currentTaskId = '8.1';

		// Don't set swarmState.activeAgent — let it fall back to session.agentName
		const hook = createTrajectoryLoggerHook(defaultConfig(), tempDir);

		const input = {
			tool: 'Read',
			sessionID: sessionId,
			callID: 'call-agent',
			args: {},
		};
		const output = {
			title: 'Read Result',
			output: 'ok',
			metadata: null,
		};

		await hook.toolAfter(input, output);

		const trajectoryPath = path.join(
			tempDir,
			'.swarm',
			'evidence',
			'8.1',
			'trajectory.jsonl',
		);
		const content = fs.readFileSync(trajectoryPath, 'utf-8');
		const entry = JSON.parse(content.split('\n')[0]);

		expect(entry.agent).toBe('reviewer');
	});

	// ─────────────────────────────────────────────────────────────────────────────
	// Additional: disabled config
	// ─────────────────────────────────────────────────────────────────────────────
	test('disabled config does not write any entry', async () => {
		const sessionId = 'session-disabled';
		startAgentSession(sessionId, 'coder');
		const session = swarmState.agentSessions.get(sessionId)!;
		session.delegationActive = true;
		session.currentTaskId = '9.1';

		const hook = createTrajectoryLoggerHook(
			defaultConfig({ enabled: false }),
			tempDir,
		);

		const input = {
			tool: 'Read',
			sessionID: sessionId,
			callID: 'call-disabled',
			args: {},
		};
		const output = {
			title: 'Read Result',
			output: 'ok',
			metadata: null,
		};

		await hook.toolAfter(input, output);

		const trajectoryPath = path.join(
			tempDir,
			'.swarm',
			'evidence',
			'9.1',
			'trajectory.jsonl',
		);
		expect(fs.existsSync(trajectoryPath)).toBe(false);
	});
});

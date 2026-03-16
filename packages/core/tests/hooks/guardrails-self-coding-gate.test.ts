import { describe, it, expect, beforeEach } from 'bun:test';
import { createGuardrailsHooks } from '../../src/hooks/guardrails';
import { resetSwarmState, startAgentSession, getAgentSession, swarmState, getTaskState } from '../../src/state';
import type { GuardrailsConfig } from '../../src/config/schema';
import { ORCHESTRATOR_NAME } from '../../src/config/constants';

function defaultConfig(overrides?: Partial<GuardrailsConfig>): GuardrailsConfig {
	return {
		enabled: true,
		max_tool_calls: 200,
		max_duration_minutes: 30,
		idle_timeout_minutes: 60,
		max_repetitions: 10,
		max_consecutive_errors: 5,
		warning_threshold: 0.75,
		profiles: undefined,
		...overrides,
	};
}

function makeInput(sessionID = 'test-session', tool = 'write', callID = 'call-1') {
	return { tool, sessionID, callID };
}

function makeOutput(args: unknown = { filePath: '/test.ts' }) {
	return { args };
}

describe('guardrails self-coding detection gate (Task 7A.2)', () => {
	beforeEach(() => {
		resetSwarmState();
	});

	describe('verification tests - isSourceCodePath gating', () => {
		it('architect writes to src/auth/login.ts → should increment architectWriteCount', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: 'src/auth/login.ts' });

			await hooks.toolBefore(input, output);

			const session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(1);
		});

		it('architect writes to README.md → should NOT increment architectWriteCount', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: 'README.md' });

			await hooks.toolBefore(input, output);

			const session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(0);
		});

		it('architect writes to package.json → should NOT increment architectWriteCount', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: 'package.json' });

			await hooks.toolBefore(input, output);

			const session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(0);
		});

		it('architect writes to src/hooks/guardrails.ts → should increment architectWriteCount', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: 'src/hooks/guardrails.ts' });

			await hooks.toolBefore(input, output);

			const session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(1);
		});
	});

	describe('adversarial tests - edge cases and bypass attempts', () => {
		it('architect attempts write to src/../README.md (path traversal) → should NOT increment architectWriteCount', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: 'src/../README.md' });

			await hooks.toolBefore(input, output);

			const session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(0);
		});

		it('architect writes to CHANGELOG.md → should NOT increment architectWriteCount', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: 'CHANGELOG.md' });

			await hooks.toolBefore(input, output);

			const session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(0);
		});

		it('architect writes to docs/guide.md → should NOT increment architectWriteCount', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: 'docs/guide.md' });

			await hooks.toolBefore(input, output);

			const session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(0);
		});

		it('architect writes to .swarm/context.md → should NOT increment architectWriteCount', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: '.swarm/context.md' });

			await hooks.toolBefore(input, output);

			const session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(0);
		});
	});

	describe('mixed write scenarios', () => {
		it('architect writes to src/ (counted) and README.md (not counted) → correct counts', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-1'),
				makeOutput({ filePath: 'src/test.ts' }),
			);

			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-2'),
				makeOutput({ filePath: 'README.md' }),
			);

			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-3'),
				makeOutput({ filePath: 'src/auth/login.ts' }),
			);

			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-4'),
				makeOutput({ filePath: 'package.json' }),
			);

			const session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(2);
		});
	});

	describe('non-architect sessions are unaffected', () => {
		it('coder writes to src/test.ts → should NOT increment architectWriteCount', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: 'src/test.ts' });

			await hooks.toolBefore(input, output);

			const session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(0);
		});
	});

	describe('write tool variants', () => {
		it('architect uses edit tool on src/test.ts → should increment architectWriteCount', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			const input = makeInput('test-session', 'edit', 'call-1');
			const output = makeOutput({ filePath: 'src/test.ts' });

			await hooks.toolBefore(input, output);

			const session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(1);
		});

		it('architect uses patch tool on src/test.ts → should increment architectWriteCount', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			const input = makeInput('test-session', 'patch', 'call-1');
			const output = makeOutput({ filePath: 'src/test.ts' });

			await hooks.toolBefore(input, output);

			const session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(1);
		});
	});

	describe('hard block at architectWriteCount >= 3 (Task 1.3)', () => {
		it('architectWriteCount = 1: write tool on source file → increments to 1, NO throw', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: 'src/test.ts' });

			await expect(hooks.toolBefore(input, output)).resolves.toBeUndefined();

			const session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(1);
		});

		it('architectWriteCount = 2: write tool on source file → increments to 2, NO throw', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-1'),
				makeOutput({ filePath: 'src/file1.ts' }),
			);

			const input = makeInput('test-session', 'write', 'call-2');
			const output = makeOutput({ filePath: 'src/file2.ts' });

			await expect(hooks.toolBefore(input, output)).resolves.toBeUndefined();

			const session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(2);
		});

		it('architectWriteCount = 3 (3rd write): → throws Error with SELF_CODING_BLOCK', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-1'),
				makeOutput({ filePath: 'src/file1.ts' }),
			);
			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-2'),
				makeOutput({ filePath: 'src/file2.ts' }),
			);

			const input = makeInput('test-session', 'write', 'call-3');
			const output = makeOutput({ filePath: 'src/file3.ts' });

			await expect(hooks.toolBefore(input, output)).rejects.toThrow('SELF_CODING_BLOCK:');
		});

		it('no session (session lookup returns undefined): → no throw, no warn', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			const input = makeInput('non-existent-session', 'write', 'call-1');
			const output = makeOutput({ filePath: 'src/test.ts' });

			await expect(hooks.toolBefore(input, output)).resolves.toBeUndefined();
		});

		it('non-architect agent at count 3: → no throw (block only runs for architect)', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			const session = getAgentSession('test-session');
			if (session) {
				session.architectWriteCount = 2;
			}

			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: 'src/test.ts' });

			await expect(hooks.toolBefore(input, output)).resolves.toBeUndefined();

			const updatedSession = getAgentSession('test-session');
			expect(updatedSession?.architectWriteCount).toBe(2);
		});

		it('edit tool at count 3: → throws Error with SELF_CODING_BLOCK', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			await hooks.toolBefore(
				makeInput('test-session', 'edit', 'call-1'),
				makeOutput({ filePath: 'src/file1.ts' }),
			);
			await hooks.toolBefore(
				makeInput('test-session', 'edit', 'call-2'),
				makeOutput({ filePath: 'src/file2.ts' }),
			);

			const input = makeInput('test-session', 'edit', 'call-3');
			const output = makeOutput({ filePath: 'src/file3.ts' });

			await expect(hooks.toolBefore(input, output)).rejects.toThrow('SELF_CODING_BLOCK:');
		});

		it('patch tool at count 3: → throws Error with SELF_CODING_BLOCK', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-1'),
				makeOutput({ filePath: 'src/file1.ts' }),
			);
			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-2'),
				makeOutput({ filePath: 'src/file2.ts' }),
			);

			const input = makeInput('test-session', 'patch', 'call-3');
			const output = makeOutput({ filePath: 'src/file3.ts' });

			await expect(hooks.toolBefore(input, output)).rejects.toThrow('SELF_CODING_BLOCK:');
		});
	});

	describe('Task 2.3 — lastGateOutcome and state machine wiring', () => {
		beforeEach(() => {
			resetSwarmState();
		});

		function makeToolAfterInput(sessionID = 'test-session', tool = 'pre_check_batch', callID = 'call-1') {
			return { tool, sessionID, callID };
		}

		function makeToolAfterOutput(outputValue: string) {
			return { title: 'tool result', output: outputValue, metadata: null };
		}

		it('pre_check_batch passing output → lastGateOutcome.gate === pre_check_batch and passed === true', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'mega_coder');

			const input = makeToolAfterInput('test-session', 'pre_check_batch', 'call-1');
			const output = makeToolAfterOutput('gates_passed: true\nAll checks passed!');

			await hooks.toolAfter(input, output);

			const session = getAgentSession('test-session');
			expect(session?.lastGateOutcome).not.toBeNull();
			expect(session?.lastGateOutcome?.gate).toBe('pre_check_batch');
			expect(session?.lastGateOutcome?.passed).toBe(true);
		});

		it('pre_check_batch failing output (contains FAIL) → lastGateOutcome.passed === false', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'mega_coder');

			const input = makeToolAfterInput('test-session', 'pre_check_batch', 'call-1');
			const output = makeToolAfterOutput('gates_passed: false\nFAIL: lint check failed');

			await hooks.toolAfter(input, output);

			const session = getAgentSession('test-session');
			expect(session?.lastGateOutcome).not.toBeNull();
			expect(session?.lastGateOutcome?.gate).toBe('pre_check_batch');
			expect(session?.lastGateOutcome?.passed).toBe(false);
		});

		it('reviewer delegation with VERDICT: APPROVED → lastGateOutcome.gate === reviewer and passed === true', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'mega_coder');

			const session = getAgentSession('test-session');
			session!.currentTaskId = 'task-1';

			await hooks.toolBefore(
				{ tool: 'Task', sessionID: 'test-session', callID: 'call-1' },
				{ args: { subagent_type: 'reviewer', task: 'Review code changes' } },
			);

			const input = makeToolAfterInput('test-session', 'Task', 'call-1');
			const output = makeToolAfterOutput('VERDICT: APPROVED\nAll checks passed. Code looks good.');

			await hooks.toolAfter(input, output);

			const updatedSession = getAgentSession('test-session');
			expect(updatedSession?.lastGateOutcome).not.toBeNull();
			expect(updatedSession?.lastGateOutcome?.gate).toBe('reviewer');
			expect(updatedSession?.lastGateOutcome?.passed).toBe(true);
		});

		it('reviewer delegation with VERDICT: REJECTED → lastGateOutcome.passed === false', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'mega_coder');

			const session = getAgentSession('test-session');
			session!.currentTaskId = 'task-1';

			await hooks.toolBefore(
				{ tool: 'Task', sessionID: 'test-session', callID: 'call-1' },
				{ args: { subagent_type: 'reviewer', task: 'Review code changes' } },
			);

			const input = makeToolAfterInput('test-session', 'Task', 'call-1');
			const output = makeToolAfterOutput('VERDICT: REJECTED\nCode has issues that need fixing.');

			await hooks.toolAfter(input, output);

			const updatedSession = getAgentSession('test-session');
			expect(updatedSession?.lastGateOutcome).not.toBeNull();
			expect(updatedSession?.lastGateOutcome?.gate).toBe('reviewer');
			expect(updatedSession?.lastGateOutcome?.passed).toBe(false);
		});

		it('after reviewer APPROVED, getTaskState(session, taskId) === reviewer_run', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'mega_coder');

			const session = getAgentSession('test-session');
			session!.currentTaskId = 'task-1';

			await hooks.toolBefore(
				{ tool: 'Task', sessionID: 'test-session', callID: 'call-1' },
				{ args: { subagent_type: 'reviewer', task: 'Review code changes' } },
			);

			let taskState = getTaskState(session!, 'task-1');
			expect(taskState).toBe('idle');

			const input = makeToolAfterInput('test-session', 'Task', 'call-1');
			const output = makeToolAfterOutput('VERDICT: APPROVED\nAll checks passed.');

			await hooks.toolAfter(input, output);

			const updatedSession = getAgentSession('test-session');
			taskState = getTaskState(updatedSession!, 'task-1');
			expect(taskState).toBe('reviewer_run');
		});
	});
});

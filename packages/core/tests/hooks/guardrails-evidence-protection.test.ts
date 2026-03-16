import { describe, it, expect, beforeEach } from 'bun:test';
import { createGuardrailsHooks } from '../../src/hooks/guardrails';
import { resetSwarmState, swarmState, startAgentSession } from '../../src/state';
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

describe('guardrails evidence write protection (Hotfix B)', () => {
	beforeEach(() => {
		resetSwarmState();
	});

	describe('Write/Edit tool blocking to .swarm/evidence/', () => {
		it('Write tool to .swarm/evidence/5.5.json is blocked', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);
			swarmState.activeAgent.set('test-session', 'architect');

			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: '.swarm/evidence/5.5.json' });

			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				'Direct writes to .swarm/evidence/ are blocked',
			);
		});

		it('Edit tool to .swarm/evidence/5.5.json is blocked', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);
			swarmState.activeAgent.set('test-session', 'architect');

			const input = makeInput('test-session', 'edit', 'call-1');
			const output = makeOutput({ filePath: '.swarm/evidence/5.5.json' });

			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				'Direct writes to .swarm/evidence/ are blocked',
			);
		});

		it('Namespaced opencode:Write to evidence path is blocked', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);
			swarmState.activeAgent.set('test-session', 'architect');

			const input = makeInput('test-session', 'opencode:Write', 'call-1');
			const output = makeOutput({ filePath: '.swarm/evidence/5.5.json' });

			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				'Direct writes to .swarm/evidence/ are blocked',
			);
		});

		it('Namespaced opencode:Edit to evidence path is blocked', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);
			swarmState.activeAgent.set('test-session', 'architect');

			const input = makeInput('test-session', 'opencode:Edit', 'call-1');
			const output = makeOutput({ filePath: '.swarm/evidence/test-task.json' });

			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				'Direct writes to .swarm/evidence/ are blocked',
			);
		});

		it('Write to .swarm/plan.json (non-evidence) is NOT blocked', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);
			swarmState.activeAgent.set('test-session', 'architect');

			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: '.swarm/plan.json' });

			// Should not throw evidence block error - but will throw plan state violation error
			// The point is it's NOT blocked with the evidence message
			await expect(hooks.toolBefore(input, output)).rejects.toThrow();
			try {
				await hooks.toolBefore(input, output);
			} catch (e: unknown) {
				const error = e as Error;
				expect(error.message).not.toContain('Direct writes to .swarm/evidence/ are blocked');
				// It should throw a different error (plan state violation)
				expect(error.message).toContain('PLAN STATE VIOLATION');
			}
		});

		it('Write tool to regular source file is NOT blocked', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);
			swarmState.activeAgent.set('test-session', 'architect');

			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: 'src/main.ts' });

			// Should not throw - just increments architectWriteCount
			await hooks.toolBefore(input, output);
		});

		it('Write tool uses correct block reason message', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);
			swarmState.activeAgent.set('test-session', 'architect');

			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: '.swarm/evidence/5.5.json' });

			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				'Gate evidence is recorded automatically by the delegation-gate hook',
			);
		});

		it('Edit tool uses correct block reason message', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);
			swarmState.activeAgent.set('test-session', 'architect');

			const input = makeInput('test-session', 'edit', 'call-1');
			const output = makeOutput({ filePath: '.swarm/evidence/5.5.json' });

			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				'If evidence is missing, re-run the required gate agents',
			);
		});

		it('Evidence path with backslashes is blocked (Windows normalization)', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);
			swarmState.activeAgent.set('test-session', 'architect');

			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: '.swarm\\evidence\\5.5.json' });

			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				'Direct writes to .swarm/evidence/ are blocked',
			);
		});

		it('Evidence path in subdirectory is blocked', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);
			swarmState.activeAgent.set('test-session', 'architect');

			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: '.swarm/evidence/tasks/5.5.json' });

			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				'Direct writes to .swarm/evidence/ are blocked',
			);
		});
	});

	describe('Bash redirect blocking to .swarm/evidence/', () => {
		it('Bash command with > .swarm/evidence/ is blocked', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);
			swarmState.activeAgent.set('test-session', 'architect');

			const input = makeInput('test-session', 'bash', 'call-1');
			const output = makeOutput({ command: 'echo test > .swarm/evidence/fake.json' });

			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				'Direct writes to .swarm/evidence/ are blocked',
			);
		});

		it('Bash command with >> .swarm/evidence/ is blocked', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);
			swarmState.activeAgent.set('test-session', 'architect');

			const input = makeInput('test-session', 'bash', 'call-1');
			const output = makeOutput({ command: 'echo test >> .swarm/evidence/fake.json' });

			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				'Direct writes to .swarm/evidence/ are blocked',
			);
		});

		it('Bash command with | tee .swarm/evidence/ is blocked', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);
			swarmState.activeAgent.set('test-session', 'architect');

			const input = makeInput('test-session', 'bash', 'call-1');
			const output = makeOutput({ command: 'echo test | tee .swarm/evidence/fake.json' });

			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				'Direct writes to .swarm/evidence/ are blocked',
			);
		});

		it('Bash command with uppercase Bash tool is blocked', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);
			swarmState.activeAgent.set('test-session', 'architect');

			const input = makeInput('test-session', 'Bash', 'call-1');
			const output = makeOutput({ command: 'echo test > .swarm/evidence/fake.json' });

			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				'Direct writes to .swarm/evidence/ are blocked',
			);
		});

		it('Namespaced opencode:Bash redirect to evidence path is blocked', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);
			swarmState.activeAgent.set('test-session', 'architect');

			const input = makeInput('test-session', 'opencode:Bash', 'call-1');
			const output = makeOutput({ command: 'echo test > .swarm/evidence/fake.json' });

			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				'Direct writes to .swarm/evidence/ are blocked',
			);
		});

		it('Bash command reading (no redirect) from evidence path is NOT blocked', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);
			swarmState.activeAgent.set('test-session', 'architect');

			const input = makeInput('test-session', 'bash', 'call-1');
			const output = makeOutput({ command: 'cat .swarm/evidence/5.5.json' });

			// Should NOT throw - reading is allowed
			await hooks.toolBefore(input, output);
		});

		it('Bash command with grep (no redirect) from evidence path is NOT blocked', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);
			swarmState.activeAgent.set('test-session', 'architect');

			const input = makeInput('test-session', 'bash', 'call-1');
			const output = makeOutput({ command: 'grep "test" .swarm/evidence/tasks/*.json' });

			// Should NOT throw - reading is allowed
			await hooks.toolBefore(input, output);
		});

		it('Bash command with | (any pipe) to evidence path IS blocked (regex catches all pipes)', async () => {
			// NOTE: The regex /(\||>|>>|\btee\b)/ matches ANY pipe character, not just '| tee'
			// This is a conservative security measure - any pipe with evidence path is blocked
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);
			swarmState.activeAgent.set('test-session', 'architect');

			const input = makeInput('test-session', 'bash', 'call-1');
			const output = makeOutput({ command: 'cat .swarm/evidence/5.5.json | head -n 10' });

			// The regex catches any pipe character in the command
			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				'Direct writes to .swarm/evidence/ are blocked',
			);
		});

		it('Bash command with > to non-evidence path is NOT blocked', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);
			swarmState.activeAgent.set('test-session', 'architect');

			const input = makeInput('test-session', 'bash', 'call-1');
			const output = makeOutput({ command: 'echo test > output.txt' });

			// Should NOT throw - not writing to evidence
			await hooks.toolBefore(input, output);
		});

		it('Bash command with evidence path but no redirect operator is NOT blocked', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);
			swarmState.activeAgent.set('test-session', 'architect');

			const input = makeInput('test-session', 'bash', 'call-1');
			const output = makeOutput({ command: 'ls -la .swarm/evidence/' });

			// Should NOT throw - just listing directory
			await hooks.toolBefore(input, output);
		});

		it('Evidence path with backslashes in bash command is blocked (Windows normalization)', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);
			swarmState.activeAgent.set('test-session', 'architect');

			const input = makeInput('test-session', 'bash', 'call-1');
			const output = makeOutput({ command: 'echo test > .swarm\\evidence\\fake.json' });

			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				'Direct writes to .swarm/evidence/ are blocked',
			);
		});
	});

	describe('Non-architect sessions are not affected', () => {
		it('Coder can write to evidence path (not blocked by evidence protection)', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			// Coder session - should be handled differently
			startAgentSession('test-session', 'coder');

			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: '.swarm/evidence/5.5.json' });

			// Should not throw evidence block - but may throw if over limits
			// The point is it's not blocked by evidence protection
			await hooks.toolBefore(input, output);
		});

		it('Bash from non-architect session to evidence is not blocked', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'reviewer');

			const input = makeInput('test-session', 'bash', 'call-1');
			const output = makeOutput({ command: 'echo test > .swarm/evidence/fake.json' });

			// Should not throw - non-architect sessions bypass this check
			await hooks.toolBefore(input, output);
		});
	});
});

import { describe, it, expect, beforeEach } from 'bun:test';
import { createGuardrailsHooks } from '../../../src/hooks/guardrails';
import { resetSwarmState, startAgentSession, getAgentSession, swarmState } from '../../../src/state';
import type { GuardrailsConfig } from '../../../src/config/schema';
import { ORCHESTRATOR_NAME } from '../../../src/config/constants';

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

describe('guardrails plan.md write-block (issues #57, #71)', () => {
	beforeEach(() => {
		resetSwarmState();
	});

	it('write tool targeting .swarm/plan.md → throws PLAN STATE VIOLATION', async () => {
		const config = defaultConfig();
		const hooks = createGuardrailsHooks(config);
		startAgentSession('s1', ORCHESTRATOR_NAME);

		const input = makeInput('s1', 'write', 'call-1');
		const output = makeOutput({ filePath: '.swarm/plan.md' });

		await expect(hooks.toolBefore(input, output)).rejects.toThrow('PLAN STATE VIOLATION');
	});

	it('edit tool targeting .swarm/plan.md → throws PLAN STATE VIOLATION', async () => {
		const config = defaultConfig();
		const hooks = createGuardrailsHooks(config);
		startAgentSession('s1', ORCHESTRATOR_NAME);

		const input = makeInput('s1', 'edit', 'call-1');
		const output = makeOutput({ filePath: '.swarm/plan.md' });

		await expect(hooks.toolBefore(input, output)).rejects.toThrow('PLAN STATE VIOLATION');
	});

	it('write tool targeting .swarm/context.md → does NOT throw', async () => {
		const config = defaultConfig();
		const hooks = createGuardrailsHooks(config);
		startAgentSession('s1', ORCHESTRATOR_NAME);

		const input = makeInput('s1', 'write', 'call-1');
		const output = makeOutput({ filePath: '.swarm/context.md' });

		// context.md is allowed - should resolve without error
		await hooks.toolBefore(input, output);
	});

	it('write tool targeting .swarm/plan.json → does NOT throw', async () => {
		const config = defaultConfig();
		const hooks = createGuardrailsHooks(config);
		startAgentSession('s1', ORCHESTRATOR_NAME);

		const input = makeInput('s1', 'write', 'call-1');
		const output = makeOutput({ filePath: '.swarm/plan.json' });

		// plan.json is allowed - only plan.md is blocked
		await hooks.toolBefore(input, output);
	});

	it('apply_patch targeting .swarm/plan.md in diff content → throws PLAN STATE VIOLATION', async () => {
		const config = defaultConfig();
		const hooks = createGuardrailsHooks(config);
		startAgentSession('s1', ORCHESTRATOR_NAME);

		const input = makeInput('s1', 'apply_patch', 'call-1');
		// Pass the diff in the 'input' field (the guard looks for args.input)
		const diffContent = `--- a/.swarm/plan.md
+++ b/.swarm/plan.md
@@ -1,3 +1,4 @@
 # Plan
+New task
`;
		const output = makeOutput({ input: diffContent });

		await expect(hooks.toolBefore(input, output)).rejects.toThrow('PLAN STATE VIOLATION');
	});
});

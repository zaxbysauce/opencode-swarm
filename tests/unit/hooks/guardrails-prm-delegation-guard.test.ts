/**
 * Regression test for #942: PRM hard stop must only fire for swarm-delegated sessions.
 *
 * When prmHardStopPending is true but delegationActive is false (non-swarm agent
 * or architect session), toolBefore must NOT throw the PRM HARD STOP error.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as os from 'node:os';
import * as path from 'node:path';
import type { GuardrailsConfig } from '../../../src/config/schema';
import { createGuardrailsHooks } from '../../../src/hooks/guardrails';
import {
	ensureAgentSession,
	resetSwarmState,
	swarmState,
} from '../../../src/state';

const TEST_DIR = path.join(os.tmpdir(), 'guardrails-prm-delegation-test');

const defaultConfig: GuardrailsConfig = {
	enabled: true,
	max_tool_calls: 200,
	max_duration_minutes: 30,
	max_repetitions: 10,
	max_consecutive_errors: 5,
	warning_threshold: 0.75,
	idle_timeout_minutes: 60,
	no_op_warning_threshold: 15,
	max_coder_revisions: 5,
	runaway_output_max_turns: 5,
	qa_gates: {
		required_tools: [
			'diff',
			'syntax_check',
			'placeholder_scan',
			'lint',
			'pre_check_batch',
		],
		require_reviewer_test_engineer: true,
	},
};

beforeEach(() => {
	resetSwarmState();
});

afterEach(() => {
	resetSwarmState();
});

describe('PRM hard stop delegation guard (#942)', () => {
	test('does NOT throw PRM hard stop when delegationActive is false', async () => {
		const sessionId = 'non-swarm-session';
		const hooks = createGuardrailsHooks(TEST_DIR, defaultConfig);

		// Simulate a non-swarm agent session with PRM hard stop leaked from another session
		const session = ensureAgentSession(sessionId, 'build');
		swarmState.activeAgent.set(sessionId, 'build');
		session.prmHardStopPending = true;
		session.delegationActive = false;

		const input = {
			sessionID: sessionId,
			tool: 'read',
			callID: 'call-1',
			agent: 'build',
		};
		const output = { args: { filePath: '/tmp/test.txt' } };

		// Should NOT throw — delegationActive is false
		await expect(hooks.toolBefore(input, output)).resolves.toBeUndefined();
	});

	test('throws PRM hard stop when delegationActive is true', async () => {
		const sessionId = 'swarm-coder-session';
		const hooks = createGuardrailsHooks(TEST_DIR, defaultConfig);

		// Simulate a swarm-delegated coder session that hit escalation level 3
		const session = ensureAgentSession(sessionId, 'coder');
		swarmState.activeAgent.set(sessionId, 'coder');
		session.prmHardStopPending = true;
		session.delegationActive = true;

		const input = {
			sessionID: sessionId,
			tool: 'read',
			callID: 'call-2',
			agent: 'coder',
		};
		const output = { args: { filePath: '/tmp/test.txt' } };

		await expect(hooks.toolBefore(input, output)).rejects.toThrow(
			'PRM HARD STOP',
		);
	});

	test('does NOT throw PRM hard stop for architect session even with flag set', async () => {
		const sessionId = 'architect-session';
		const hooks = createGuardrailsHooks(TEST_DIR, defaultConfig);

		const session = ensureAgentSession(sessionId, 'architect');
		swarmState.activeAgent.set(sessionId, 'architect');
		session.prmHardStopPending = true;
		session.delegationActive = false; // architect sessions are not delegated

		const input = {
			sessionID: sessionId,
			tool: 'read',
			callID: 'call-3',
			agent: 'architect',
		};
		const output = { args: { filePath: '/tmp/test.txt' } };

		// Should NOT throw — architect is not a delegated session
		await expect(hooks.toolBefore(input, output)).resolves.toBeUndefined();
	});
});

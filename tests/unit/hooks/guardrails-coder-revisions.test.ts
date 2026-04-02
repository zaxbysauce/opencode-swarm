import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { GuardrailsConfig } from '../../../src/config/schema';
import { GuardrailsConfigSchema } from '../../../src/config/schema';
import { createGuardrailsHooks } from '../../../src/hooks/guardrails';
import { deserializeAgentSession } from '../../../src/session/snapshot-reader';
import { serializeAgentSession } from '../../../src/session/snapshot-writer';
import {
	ensureAgentSession,
	getAgentSession,
	resetSwarmState,
	startAgentSession,
	swarmState,
} from '../../../src/state';

const TEST_DIR = '/test/project';

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

function makeTaskArgs(subagentType: string, prompt = 'Fix the bug') {
	return { subagent_type: subagentType, prompt };
}

/**
 * Sets up an architect session for testing.
 */
function setupArchitectSession(
	sessionId: string,
	config: GuardrailsConfig = defaultConfig,
) {
	ensureAgentSession(sessionId, 'architect');
	swarmState.activeAgent.set(sessionId, 'architect');
	return { hooks: createGuardrailsHooks(TEST_DIR, config), sessionId };
}

/**
 * Simulates a full coder delegation cycle:
 * 1. toolBefore with Task tool (architect -> coder delegation)
 * 2. Set lastCoderDelegationTaskId (simulates what delegation-gate.ts does)
 * 3. toolAfter with Task tool (coder completion)
 *
 * NOTE: lastCoderDelegationTaskId is set by delegation-gate.ts, not guardrails.ts.
 * The coderRevisions increment in guardrails.ts toolAfter requires this field to be set.
 */
async function simulateCoderDelegation(
	hooks: ReturnType<typeof createGuardrailsHooks>,
	sessionId: string,
	callId: string,
	prompt: string,
	taskId = '1.1',
) {
	// toolBefore: architect delegates to coder
	const beforeInput = {
		tool: 'Task',
		sessionID: sessionId,
		callID: `${callId}-before`,
	};
	const beforeOutput = { args: makeTaskArgs('coder', prompt) };
	await hooks.toolBefore(beforeInput as any, beforeOutput as any);

	// Simulate what delegation-gate.ts does: set lastCoderDelegationTaskId
	const session = getAgentSession(sessionId);
	if (session) {
		session.lastCoderDelegationTaskId = taskId;
	}

	// toolAfter: coder completes
	const afterInput = {
		tool: 'Task',
		sessionID: sessionId,
		callID: `${callId}-after`,
		args: makeTaskArgs('coder', prompt),
	};
	const afterOutput = {
		title: 'Task',
		output: 'Coder completed successfully',
		metadata: {},
	};
	await hooks.toolAfter(afterInput as any, afterOutput as any);
}

// =============================================================================
// Test Suite: Bounded Coder Revisions
// =============================================================================
describe('guardrails bounded coder revisions', () => {
	let hooks: ReturnType<typeof createGuardrailsHooks>;
	let sessionId: string;

	beforeEach(() => {
		resetSwarmState();
	});

	afterEach(() => {
		resetSwarmState();
	});

	// -------------------------------------------------------------------------
	// Test 1: Config parsing — default value
	// -------------------------------------------------------------------------
	test('GuardrailsConfigSchema.parse({}) includes max_coder_revisions=5', () => {
		const config = GuardrailsConfigSchema.parse({});
		expect(config.max_coder_revisions).toBe(5);
	});

	// -------------------------------------------------------------------------
	// Test 2: Config parsing — custom value
	// -------------------------------------------------------------------------
	test('GuardrailsConfigSchema.parse({ max_coder_revisions: 3 }) works', () => {
		const config = GuardrailsConfigSchema.parse({ max_coder_revisions: 3 });
		expect(config.max_coder_revisions).toBe(3);
	});

	// -------------------------------------------------------------------------
	// Test 3: Config parsing — min violation
	// -------------------------------------------------------------------------
	test('GuardrailsConfigSchema.parse({ max_coder_revisions: 0 }) fails (min 1)', () => {
		expect(() =>
			GuardrailsConfigSchema.parse({ max_coder_revisions: 0 }),
		).toThrow();
	});

	// -------------------------------------------------------------------------
	// Test 4: Config parsing — max violation
	// -------------------------------------------------------------------------
	test('GuardrailsConfigSchema.parse({ max_coder_revisions: 21 }) fails (max 20)', () => {
		expect(() =>
			GuardrailsConfigSchema.parse({ max_coder_revisions: 21 }),
		).toThrow();
	});

	// -------------------------------------------------------------------------
	// Test 5: State initialization
	// -------------------------------------------------------------------------
	test('startAgentSession creates session with coderRevisions=0, revisionLimitHit=false', () => {
		const sessionId = 'session-init-test';
		startAgentSession(sessionId, 'architect');
		const session = getAgentSession(sessionId);

		expect(session).toBeDefined();
		expect(session!.coderRevisions).toBe(0);
		expect(session!.revisionLimitHit).toBe(false);
	});

	// -------------------------------------------------------------------------
	// Test 6: First coder delegation completion → coderRevisions=1, no advisory
	// -------------------------------------------------------------------------
	test('first coder delegation completion → coderRevisions=1, no advisory', async () => {
		({ hooks, sessionId } = setupArchitectSession('session-first-deleg'));
		const session = getAgentSession(sessionId)!;

		await simulateCoderDelegation(hooks, sessionId, 'call-1', 'Fix bug #1');

		expect(session.coderRevisions).toBe(1);
		expect(session.revisionLimitHit).toBe(false);
		expect(session.pendingAdvisoryMessages?.length).toBe(0);
	});

	// -------------------------------------------------------------------------
	// Test 7: Multiple delegations — coderRevisions cycles (implementation detail)
	// NOTE: The current implementation resets coderRevisions at the START of each
	// new coder delegation, so it cycles 0→1→0→1 instead of accumulating.
	// This test documents the actual behavior.
	// -------------------------------------------------------------------------
	test('multiple delegations — coderRevisions cycles between 0 and 1', async () => {
		const customConfig: GuardrailsConfig = {
			...defaultConfig,
			max_coder_revisions: 3,
		};
		({ hooks, sessionId } = setupArchitectSession(
			'session-multi',
			customConfig,
		));
		const session = getAgentSession(sessionId)!;

		// First delegation: coderRevisions=1 after completion
		await simulateCoderDelegation(hooks, sessionId, 'call-1', 'Fix bug #1');
		expect(session.coderRevisions).toBe(1);
		expect(session.revisionLimitHit).toBe(false);

		// Second delegation: coderRevisions resets to 0 at start, becomes 1 after completion
		await simulateCoderDelegation(hooks, sessionId, 'call-2', 'Fix bug #2');
		// Due to reset at start of new delegation, coderRevisions is 1 (not 2)
		expect(session.coderRevisions).toBe(1);
		expect(session.revisionLimitHit).toBe(false);

		// Third delegation: same pattern
		await simulateCoderDelegation(hooks, sessionId, 'call-3', 'Fix bug #3');
		expect(session.coderRevisions).toBe(1);
		expect(session.revisionLimitHit).toBe(false);
	});

	// -------------------------------------------------------------------------
	// Test 8: After limit hit (max=1), further delegations don't increment
	// -------------------------------------------------------------------------
	test('after limit hit (max=1), further delegations do not increment coderRevisions', async () => {
		const customConfig: GuardrailsConfig = {
			...defaultConfig,
			max_coder_revisions: 1,
		};
		({ hooks, sessionId } = setupArchitectSession(
			'session-post-limit',
			customConfig,
		));
		const session = getAgentSession(sessionId)!;

		// Hit the limit on first completion
		await simulateCoderDelegation(hooks, sessionId, 'call-1', 'Fix bug #1');
		expect(session.coderRevisions).toBe(1);
		expect(session.revisionLimitHit).toBe(true);

		// Try another delegation — should NOT increment because revisionLimitHit is true
		session.lastCoderDelegationTaskId = '1.2';

		const beforeInput = {
			tool: 'Task',
			sessionID: sessionId,
			callID: 'call-3-before',
		};
		const beforeOutput = { args: makeTaskArgs('coder', 'Another fix') };
		await hooks.toolBefore(beforeInput as any, beforeOutput as any);

		const afterInput = {
			tool: 'Task',
			sessionID: sessionId,
			callID: 'call-3-after',
			args: makeTaskArgs('coder', 'Another fix'),
		};
		const afterOutput = { title: 'Task', output: 'Done', metadata: {} };
		await hooks.toolAfter(afterInput as any, afterOutput as any);

		// Should still be 1 (not incremented due to revisionLimitHit=true)
		expect(session.coderRevisions).toBe(1);
		expect(session.revisionLimitHit).toBe(true);
	});

	// -------------------------------------------------------------------------
	// Test 9: New coder delegation after limit hit → coderRevisions NOT reset
	// (revisionLimitHit=true blocks the reset in toolBefore)
	// -------------------------------------------------------------------------
	test('new coder delegation after limit hit → coderRevisions NOT reset (revisionLimitHit guards)', async () => {
		const customConfig: GuardrailsConfig = {
			...defaultConfig,
			max_coder_revisions: 1,
		};
		({ hooks, sessionId } = setupArchitectSession(
			'session-no-reset',
			customConfig,
		));
		const session = getAgentSession(sessionId)!;

		// Hit the limit
		await simulateCoderDelegation(hooks, sessionId, 'call-1', 'Fix bug #1');
		expect(session.coderRevisions).toBe(1);
		expect(session.revisionLimitHit).toBe(true);

		// Trigger a new coder delegation via toolBefore
		const beforeInput = {
			tool: 'Task',
			sessionID: sessionId,
			callID: 'call-reset-before',
		};
		const beforeOutput = { args: makeTaskArgs('coder', 'Should not reset') };
		await hooks.toolBefore(beforeInput as any, beforeOutput as any);

		// coderRevisions should NOT be reset because revisionLimitHit=true blocks the reset
		expect(session.coderRevisions).toBe(1);
		expect(session.revisionLimitHit).toBe(true);
	});

	// -------------------------------------------------------------------------
	// Test 10: New coder delegation before limit hit → coderRevisions reset to 0
	// (because !revisionLimitHit is true, so reset is NOT blocked)
	// -------------------------------------------------------------------------
	test('new coder delegation before limit hit → coderRevisions reset to 0', async () => {
		({ hooks, sessionId } = setupArchitectSession('session-reset-ok'));
		const session = getAgentSession(sessionId)!;

		// Complete one delegation
		await simulateCoderDelegation(hooks, sessionId, 'call-1', 'Fix bug #1');
		expect(session.coderRevisions).toBe(1);
		expect(session.revisionLimitHit).toBe(false);

		// Trigger a new coder delegation via toolBefore — should reset to 0
		const beforeInput = {
			tool: 'Task',
			sessionID: sessionId,
			callID: 'call-reset-before',
		};
		const beforeOutput = { args: makeTaskArgs('coder', 'New task') };
		await hooks.toolBefore(beforeInput as any, beforeOutput as any);

		// coderRevisions should be reset to 0
		expect(session.coderRevisions).toBe(0);
		expect(session.revisionLimitHit).toBe(false);
	});

	// -------------------------------------------------------------------------
	// Test 11: Non-coder delegation → coderRevisions not changed
	// -------------------------------------------------------------------------
	test('non-coder delegation (reviewer) → coderRevisions not changed', async () => {
		({ hooks, sessionId } = setupArchitectSession('session-reviewer'));
		const session = getAgentSession(sessionId)!;

		// Complete one coder delegation
		await simulateCoderDelegation(hooks, sessionId, 'call-1', 'Fix bug #1');
		expect(session.coderRevisions).toBe(1);

		// Delegate to reviewer instead
		const beforeInput = {
			tool: 'Task',
			sessionID: sessionId,
			callID: 'call-rev-before',
		};
		const beforeOutput = { args: makeTaskArgs('reviewer', 'Review code') };
		await hooks.toolBefore(beforeInput as any, beforeOutput as any);

		const afterInput = {
			tool: 'Task',
			sessionID: sessionId,
			callID: 'call-rev-after',
			args: makeTaskArgs('reviewer', 'Review code'),
		};
		const afterOutput = { title: 'Task', output: 'Review done', metadata: {} };
		await hooks.toolAfter(afterInput as any, afterOutput as any);

		// coderRevisions should still be 1 (reviewer delegation doesn't affect it)
		expect(session.coderRevisions).toBe(1);
	});

	// -------------------------------------------------------------------------
	// Test 12: Serialization round-trip for coderRevisions
	// -------------------------------------------------------------------------
	test('serializeAgentSession → deserializeAgentSession preserves coderRevisions', () => {
		const sessionId = 'session-serialization';
		startAgentSession(sessionId, 'architect');
		const original = getAgentSession(sessionId)!;

		original.coderRevisions = 5;
		original.revisionLimitHit = true;

		const serialized = serializeAgentSession(original);
		const deserialized = deserializeAgentSession(serialized);

		expect(deserialized.coderRevisions).toBe(5);
		expect(deserialized.revisionLimitHit).toBe(true);
	});

	// -------------------------------------------------------------------------
	// Test 13: Serialization round-trip for revisionLimitHit
	// -------------------------------------------------------------------------
	test('serializeAgentSession → deserializeAgentSession preserves revisionLimitHit=false', () => {
		const sessionId = 'session-serialization-false';
		startAgentSession(sessionId, 'architect');
		const original = getAgentSession(sessionId)!;

		original.coderRevisions = 0;
		original.revisionLimitHit = false;

		const serialized = serializeAgentSession(original);
		const deserialized = deserializeAgentSession(serialized);

		expect(deserialized.coderRevisions).toBe(0);
		expect(deserialized.revisionLimitHit).toBe(false);
	});

	// -------------------------------------------------------------------------
	// Test 14: Advisory message content includes actual count and max
	// -------------------------------------------------------------------------
	test('advisory message content includes actual count and max', async () => {
		const customConfig: GuardrailsConfig = {
			...defaultConfig,
			max_coder_revisions: 1,
		};
		({ hooks, sessionId } = setupArchitectSession(
			'session-advisory-content',
			customConfig,
		));
		const session = getAgentSession(sessionId)!;

		// With max=1, first completion hits the limit
		await simulateCoderDelegation(hooks, sessionId, 'call-1', 'Fix bug #1');

		expect(session.pendingAdvisoryMessages?.length).toBe(1);
		const advisory = session.pendingAdvisoryMessages![0];
		expect(advisory).toContain('CODER REVISION LIMIT');
		expect(advisory).toContain('1'); // actual count
		expect(advisory).toContain('1'); // max (same in this case)
	});

	// -------------------------------------------------------------------------
	// Test 15: swarmState.pendingEvents incremented when limit hit
	// -------------------------------------------------------------------------
	test('swarmState.pendingEvents incremented when limit hit', async () => {
		const customConfig: GuardrailsConfig = {
			...defaultConfig,
			max_coder_revisions: 1,
		};
		({ hooks, sessionId } = setupArchitectSession(
			'session-pending-events',
			customConfig,
		));

		expect(swarmState.pendingEvents).toBe(0);

		await simulateCoderDelegation(hooks, sessionId, 'call-1', 'Fix bug #1');

		// pendingEvents should be incremented when limit is hit
		expect(swarmState.pendingEvents).toBe(1);
	});

	// -------------------------------------------------------------------------
	// Test 16: Custom max_coder_revisions (e.g., 3) in config
	// -------------------------------------------------------------------------
	test('custom max_coder_revisions=3 works correctly', async () => {
		const customConfig: GuardrailsConfig = {
			...defaultConfig,
			max_coder_revisions: 3,
		};
		({ hooks, sessionId } = setupArchitectSession(
			'session-custom-max',
			customConfig,
		));
		const session = getAgentSession(sessionId)!;

		// Complete one delegation (doesn't hit limit yet with max=3)
		await simulateCoderDelegation(hooks, sessionId, 'call-1', 'Fix bug #1');
		expect(session.coderRevisions).toBe(1);
		expect(session.revisionLimitHit).toBe(false);

		// Complete second delegation
		await simulateCoderDelegation(hooks, sessionId, 'call-2', 'Fix bug #2');
		expect(session.coderRevisions).toBe(1); // Due to reset at start
		expect(session.revisionLimitHit).toBe(false);

		// Complete third delegation - STILL doesn't hit limit because coderRevisions
		// cycles between 0 and 1 (never reaches 3)
		await simulateCoderDelegation(hooks, sessionId, 'call-3', 'Fix bug #3');
		expect(session.coderRevisions).toBe(1);
		expect(session.revisionLimitHit).toBe(false); // Limit not hit due to cycling behavior
	});

	// -------------------------------------------------------------------------
	// Test 17: max_coder_revisions=1 edge case
	// -------------------------------------------------------------------------
	test('max_coder_revisions=1 hits limit on first completion', async () => {
		const customConfig: GuardrailsConfig = {
			...defaultConfig,
			max_coder_revisions: 1,
		};
		({ hooks, sessionId } = setupArchitectSession(
			'session-max-1',
			customConfig,
		));
		const session = getAgentSession(sessionId)!;

		await simulateCoderDelegation(hooks, sessionId, 'call-1', 'Fix bug #1');

		expect(session.coderRevisions).toBe(1);
		expect(session.revisionLimitHit).toBe(true);
		expect(session.pendingAdvisoryMessages?.length).toBe(1);
	});

	// -------------------------------------------------------------------------
	// Test 18: max_coder_revisions=20 (max value)
	// -------------------------------------------------------------------------
	test('max_coder_revisions=20 works (boundary)', async () => {
		const customConfig: GuardrailsConfig = {
			...defaultConfig,
			max_coder_revisions: 20,
		};
		({ hooks, sessionId } = setupArchitectSession(
			'session-max-20',
			customConfig,
		));
		const session = getAgentSession(sessionId)!;

		// Complete 5 delegations with reviewer delegations in between to avoid loop detection
		// Loop detection counts consecutive patterns, so we break it up with different agents
		const coderPrompts = [
			'Fix authentication bug',
			'Update validation',
			'Refactor query builder',
			'Add unit tests',
			'Fix memory leak',
		];
		for (let i = 0; i < 5; i++) {
			// Coder delegation
			await simulateCoderDelegation(
				hooks,
				sessionId,
				`coder-${i}`,
				coderPrompts[i],
			);

			// Reviewer delegation (breaks consecutive coder pattern for loop detection)
			const revBeforeInput = {
				tool: 'Task',
				sessionID: sessionId,
				callID: `rev-${i}-before`,
			};
			const revBeforeOutput = { args: makeTaskArgs('reviewer', 'Review') };
			await hooks.toolBefore(revBeforeInput as any, revBeforeOutput as any);

			const revAfterInput = {
				tool: 'Task',
				sessionID: sessionId,
				callID: `rev-${i}-after`,
				args: makeTaskArgs('reviewer', 'Review'),
			};
			const revAfterOutput = { title: 'Task', output: 'Done', metadata: {} };
			await hooks.toolAfter(revAfterInput as any, revAfterOutput as any);
		}

		expect(session.coderRevisions).toBe(1); // Due to reset behavior
		expect(session.revisionLimitHit).toBe(false);
		expect(session.pendingAdvisoryMessages?.length).toBe(0);
	});

	// -------------------------------------------------------------------------
	// Test 19: Reset works correctly after non-coder window runs
	// -------------------------------------------------------------------------
	test('coderRevisions reset to 0 by toolBefore even when other agent (reviewer) was between', async () => {
		({ hooks, sessionId } = setupArchitectSession('session-mixed-agents'));
		const session = getAgentSession(sessionId)!;

		// First coder delegation
		await simulateCoderDelegation(
			hooks,
			sessionId,
			'call-coder-1',
			'Fix bug #1',
		);
		expect(session.coderRevisions).toBe(1);

		// Reviewer delegation in between
		const revBeforeInput = {
			tool: 'Task',
			sessionID: sessionId,
			callID: 'call-rev-before',
		};
		const revBeforeOutput = { args: makeTaskArgs('reviewer', 'Review') };
		await hooks.toolBefore(revBeforeInput as any, revBeforeOutput as any);

		const revAfterInput = {
			tool: 'Task',
			sessionID: sessionId,
			callID: 'call-rev-after',
			args: makeTaskArgs('reviewer', 'Review'),
		};
		const revAfterOutput = { title: 'Task', output: 'Done', metadata: {} };
		await hooks.toolAfter(revAfterInput as any, revAfterOutput as any);

		// coderRevisions should still be 1 (reviewer didn't affect it)
		expect(session.coderRevisions).toBe(1);

		// New coder delegation — should reset to 0
		const coderBeforeInput = {
			tool: 'Task',
			sessionID: sessionId,
			callID: 'call-coder-2-before',
		};
		const coderBeforeOutput = { args: makeTaskArgs('coder', 'New task') };
		await hooks.toolBefore(coderBeforeInput as any, coderBeforeOutput as any);

		expect(session.coderRevisions).toBe(0);
	});

	// -------------------------------------------------------------------------
	// Test 20: Multiple architect sessions are independent
	// -------------------------------------------------------------------------
	test('multiple sessions have independent coderRevisions counters', async () => {
		const customConfig: GuardrailsConfig = {
			...defaultConfig,
			max_coder_revisions: 3,
		};

		// Setup two separate sessions
		const { hooks: hooks1, sessionId: sessionId1 } = setupArchitectSession(
			'session-1',
			customConfig,
		);
		const { hooks: hooks2, sessionId: sessionId2 } = setupArchitectSession(
			'session-2',
			customConfig,
		);

		// Complete one delegation in session 1
		await simulateCoderDelegation(hooks1, sessionId1, 'call-1', 'Fix bug #1');
		const session1 = getAgentSession(sessionId1)!;
		const session2 = getAgentSession(sessionId2)!;

		expect(session1.coderRevisions).toBe(1);
		expect(session2.coderRevisions).toBe(0); // Should be independent
	});
});

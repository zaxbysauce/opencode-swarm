/**
 * Tests for handleFullAutoCommand function.
 * Tests the /swarm full-auto command toggle functionality,
 * including the unique counter-reset behavior on disable.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { handleFullAutoCommand } from '../commands/full-auto';
import { getAgentSession, swarmState } from '../state';

describe('handleFullAutoCommand', () => {
	let testSessionId: string;

	beforeEach(() => {
		testSessionId = `full-auto-test-${Date.now()}`;
		// Enable config-level full-auto so command activation succeeds
		swarmState.fullAutoEnabledInConfig = true;
		swarmState.agentSessions.set(testSessionId, {
			agentName: 'architect',
			lastToolCallTime: Date.now(),
			lastAgentEventTime: Date.now(),
			delegationActive: false,
			activeInvocationId: 0,
			lastInvocationIdByAgent: {},
			windows: {},
			lastCompactionHint: 0,
			architectWriteCount: 0,
			lastCoderDelegationTaskId: null,
			currentTaskId: null,
			gateLog: new Map(),
			reviewerCallCount: new Map(),
			lastGateFailure: null,
			partialGateWarningsIssuedForTask: new Set(),
			selfFixAttempted: false,
			selfCodingWarnedAtCount: 0,
			catastrophicPhaseWarnings: new Set(),
			qaSkipCount: 0,
			qaSkipTaskIds: [],
			taskWorkflowStates: new Map(),
			lastGateOutcome: null,
			declaredCoderScope: null,
			lastScopeViolation: null,
			modifiedFilesThisCoderTask: [],
			lastPhaseCompleteTimestamp: 0,
			lastPhaseCompletePhase: 0,
			phaseAgentsDispatched: new Set(),
			lastCompletedPhaseAgentsDispatched: new Set(),
			turboMode: false,
			fullAutoMode: false,
			fullAutoInteractionCount: 0,
			fullAutoDeadlockCount: 0,
			fullAutoLastQuestionHash: null,
			coderRevisions: 0,
			revisionLimitHit: false,
			model_fallback_index: 0,
			modelFallbackExhausted: false,
			sessionRehydratedAt: 0,
		});
	});

	afterEach(() => {
		swarmState.agentSessions.delete(testSessionId);
	});

	function getSession() {
		const session = getAgentSession(testSessionId);
		if (!session) throw new Error('Session not found');
		return session;
	}

	describe('Error Path - No Active Session', () => {
		it('returns error message when no session exists', async () => {
			const result = await handleFullAutoCommand(
				'/project',
				[],
				'non-existent-session',
			);
			expect(result).toBe(
				'Error: No active session. Full-Auto Mode requires an active session to operate.',
			);
		});
	});

	describe('Happy Path - Enable Full-Auto Mode', () => {
		it('enables full-auto mode when arg is "on"', async () => {
			const result = await handleFullAutoCommand(
				'/project',
				['on'],
				testSessionId,
			);
			expect(result).toBe('Full-Auto Mode enabled');
			expect(getSession().fullAutoMode).toBe(true);
		});

		it('enables full-auto mode when arg is "ON" (case insensitive)', async () => {
			const result = await handleFullAutoCommand(
				'/project',
				['ON'],
				testSessionId,
			);
			expect(result).toBe('Full-Auto Mode enabled');
			expect(getSession().fullAutoMode).toBe(true);
		});
	});

	describe('Happy Path - Disable Full-Auto Mode', () => {
		it('disables full-auto mode when arg is "off"', async () => {
			getSession().fullAutoMode = true;
			const result = await handleFullAutoCommand(
				'/project',
				['off'],
				testSessionId,
			);
			expect(result).toBe('Full-Auto Mode disabled');
			expect(getSession().fullAutoMode).toBe(false);
		});

		it('disables full-auto mode when arg is "OFF" (case insensitive)', async () => {
			getSession().fullAutoMode = true;
			const result = await handleFullAutoCommand(
				'/project',
				['OFF'],
				testSessionId,
			);
			expect(result).toBe('Full-Auto Mode disabled');
			expect(getSession().fullAutoMode).toBe(false);
		});
	});

	describe('Happy Path - Toggle Behavior', () => {
		it('toggles full-auto mode from off to on when no argument provided', async () => {
			getSession().fullAutoMode = false;
			const result = await handleFullAutoCommand('/project', [], testSessionId);
			expect(result).toBe('Full-Auto Mode enabled');
			expect(getSession().fullAutoMode).toBe(true);
		});

		it('toggles full-auto mode from on to off when no argument provided', async () => {
			getSession().fullAutoMode = true;
			const result = await handleFullAutoCommand('/project', [], testSessionId);
			expect(result).toBe('Full-Auto Mode disabled');
			expect(getSession().fullAutoMode).toBe(false);
		});

		it('toggles full-auto mode when arg is empty string', async () => {
			getSession().fullAutoMode = false;
			const result = await handleFullAutoCommand(
				'/project',
				[''],
				testSessionId,
			);
			expect(result).toBe('Full-Auto Mode enabled');
			expect(getSession().fullAutoMode).toBe(true);
		});
	});

	describe('Edge Cases', () => {
		it('ignores extra arguments and uses only the first one', async () => {
			getSession().fullAutoMode = false;
			const result = await handleFullAutoCommand(
				'/project',
				['on', 'extra', 'ignored'],
				testSessionId,
			);
			expect(result).toBe('Full-Auto Mode enabled');
			expect(getSession().fullAutoMode).toBe(true);
		});

		it('treats unknown arguments as toggle', async () => {
			getSession().fullAutoMode = false;
			const result = await handleFullAutoCommand(
				'/project',
				['invalid'],
				testSessionId,
			);
			expect(result).toBe('Full-Auto Mode enabled');
			expect(getSession().fullAutoMode).toBe(true);
		});

		it('does not modify unrelated session properties', async () => {
			const session = getSession();
			const originalAgentName = session.agentName;
			const originalDelegationActive = session.delegationActive;
			const originalLastToolCallTime = session.lastToolCallTime;
			const originalTurboMode = session.turboMode;

			await handleFullAutoCommand('/project', ['on'], testSessionId);

			expect(session.agentName).toBe(originalAgentName);
			expect(session.delegationActive).toBe(originalDelegationActive);
			expect(session.lastToolCallTime).toBe(originalLastToolCallTime);
			expect(session.turboMode).toBe(originalTurboMode);
		});
	});

	describe('State Mutation Verification', () => {
		it('persists fullAutoMode change across multiple calls', async () => {
			expect(getSession().fullAutoMode).toBe(false);

			await handleFullAutoCommand('/project', [], testSessionId);
			expect(getSession().fullAutoMode).toBe(true);

			await handleFullAutoCommand('/project', [], testSessionId);
			expect(getSession().fullAutoMode).toBe(false);
		});

		it('maintains state after multiple enable/disable calls', async () => {
			await handleFullAutoCommand('/project', ['on'], testSessionId);
			expect(getSession().fullAutoMode).toBe(true);

			await handleFullAutoCommand('/project', ['off'], testSessionId);
			expect(getSession().fullAutoMode).toBe(false);

			await handleFullAutoCommand('/project', ['on'], testSessionId);
			expect(getSession().fullAutoMode).toBe(true);
		});
	});

	describe('Counter Reset on Disable (full-auto-specific)', () => {
		it('resets all three counters when disabled via "off" arg', async () => {
			const session = getSession();
			session.fullAutoMode = true;
			session.fullAutoInteractionCount = 7;
			session.fullAutoDeadlockCount = 2;
			session.fullAutoLastQuestionHash = 'abc123hash';

			await handleFullAutoCommand('/project', ['off'], testSessionId);

			expect(session.fullAutoInteractionCount).toBe(0);
			expect(session.fullAutoDeadlockCount).toBe(0);
			expect(session.fullAutoLastQuestionHash).toBeNull();
		});

		it('resets all three counters when toggled off (no arg, from true)', async () => {
			const session = getSession();
			session.fullAutoMode = true;
			session.fullAutoInteractionCount = 5;
			session.fullAutoDeadlockCount = 1;
			session.fullAutoLastQuestionHash = 'hashxyz';

			await handleFullAutoCommand('/project', [], testSessionId);

			expect(session.fullAutoMode).toBe(false);
			expect(session.fullAutoInteractionCount).toBe(0);
			expect(session.fullAutoDeadlockCount).toBe(0);
			expect(session.fullAutoLastQuestionHash).toBeNull();
		});

		it('does NOT reset counters when enabled via "on" arg', async () => {
			const session = getSession();
			session.fullAutoMode = false;
			// Manually seed non-zero counters (simulates stale state)
			session.fullAutoInteractionCount = 3;
			session.fullAutoDeadlockCount = 1;
			session.fullAutoLastQuestionHash = 'stale-hash';

			await handleFullAutoCommand('/project', ['on'], testSessionId);

			expect(session.fullAutoMode).toBe(true);
			// Counters are preserved — only reset on disable
			expect(session.fullAutoInteractionCount).toBe(3);
			expect(session.fullAutoDeadlockCount).toBe(1);
			expect(session.fullAutoLastQuestionHash).toBe('stale-hash');
		});

		it('does NOT reset counters when toggled on (no arg, from false)', async () => {
			const session = getSession();
			session.fullAutoMode = false;
			session.fullAutoInteractionCount = 4;
			session.fullAutoDeadlockCount = 0;
			session.fullAutoLastQuestionHash = 'some-hash';

			await handleFullAutoCommand('/project', [], testSessionId);

			expect(session.fullAutoMode).toBe(true);
			expect(session.fullAutoInteractionCount).toBe(4);
			expect(session.fullAutoDeadlockCount).toBe(0);
			expect(session.fullAutoLastQuestionHash).toBe('some-hash');
		});

		it('resets counters even when "off" is called on already-disabled session (idempotent)', async () => {
			const session = getSession();
			// fullAutoMode is already false (default)
			session.fullAutoInteractionCount = 9;
			session.fullAutoDeadlockCount = 3;
			session.fullAutoLastQuestionHash = 'orphan-hash';

			// Calling off on already-disabled session still resets counters
			await handleFullAutoCommand('/project', ['off'], testSessionId);

			expect(session.fullAutoMode).toBe(false);
			expect(session.fullAutoInteractionCount).toBe(0);
			expect(session.fullAutoDeadlockCount).toBe(0);
			expect(session.fullAutoLastQuestionHash).toBeNull();
		});
	});
});

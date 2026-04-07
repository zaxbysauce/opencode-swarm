/**
 * Tests for the config-guard behavior in handleFullAutoCommand.
 *
 * When swarmState.fullAutoEnabledInConfig is false, activation must be blocked.
 * When it is true, activation must succeed. Disabling always works regardless.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { handleFullAutoCommand } from '../commands/full-auto';
import { getAgentSession, swarmState } from '../state';

describe('handleFullAutoCommand — config guard', () => {
	let testSessionId: string;

	beforeEach(() => {
		testSessionId = `config-guard-test-${Date.now()}`;
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
		// Default: config-level full-auto is OFF
		swarmState.fullAutoEnabledInConfig = false;
	});

	afterEach(() => {
		swarmState.agentSessions.delete(testSessionId);
		swarmState.fullAutoEnabledInConfig = false;
	});

	function getSession() {
		const session = getAgentSession(testSessionId);
		if (!session) throw new Error('Session not found');
		return session;
	}

	const CONFIG_ERROR_FRAGMENT =
		'full_auto.enabled is not set to true in the swarm plugin config';

	describe('config guard blocks activation when fullAutoEnabledInConfig is false', () => {
		it('returns config error when enabling with "on"', async () => {
			const result = await handleFullAutoCommand(
				'/project',
				['on'],
				testSessionId,
			);
			expect(result).toContain(CONFIG_ERROR_FRAGMENT);
			expect(getSession().fullAutoMode).toBe(false);
		});

		it('returns config error when toggling from off (no arg)', async () => {
			getSession().fullAutoMode = false;
			const result = await handleFullAutoCommand('/project', [], testSessionId);
			expect(result).toContain(CONFIG_ERROR_FRAGMENT);
			expect(getSession().fullAutoMode).toBe(false);
		});
	});

	describe('activation succeeds when fullAutoEnabledInConfig is true', () => {
		beforeEach(() => {
			swarmState.fullAutoEnabledInConfig = true;
		});

		it('enables with "on" arg', async () => {
			const result = await handleFullAutoCommand(
				'/project',
				['on'],
				testSessionId,
			);
			expect(result).toBe('Full-Auto Mode enabled');
			expect(getSession().fullAutoMode).toBe(true);
		});

		it('enables via toggle from off (no arg)', async () => {
			getSession().fullAutoMode = false;
			const result = await handleFullAutoCommand('/project', [], testSessionId);
			expect(result).toBe('Full-Auto Mode enabled');
			expect(getSession().fullAutoMode).toBe(true);
		});
	});

	describe('disabling always works regardless of config state', () => {
		it('disables with "off" when config is false', async () => {
			// Force the session into enabled state directly (bypass guard)
			getSession().fullAutoMode = true;
			swarmState.fullAutoEnabledInConfig = false;

			const result = await handleFullAutoCommand(
				'/project',
				['off'],
				testSessionId,
			);
			expect(result).toBe('Full-Auto Mode disabled');
			expect(getSession().fullAutoMode).toBe(false);
		});

		it('disables with "off" when config is true', async () => {
			swarmState.fullAutoEnabledInConfig = true;
			getSession().fullAutoMode = true;

			const result = await handleFullAutoCommand(
				'/project',
				['off'],
				testSessionId,
			);
			expect(result).toBe('Full-Auto Mode disabled');
			expect(getSession().fullAutoMode).toBe(false);
		});

		it('disabling on already-disabled session works when config is false', async () => {
			getSession().fullAutoMode = false;
			swarmState.fullAutoEnabledInConfig = false;

			const result = await handleFullAutoCommand(
				'/project',
				['off'],
				testSessionId,
			);
			expect(result).toBe('Full-Auto Mode disabled');
			expect(getSession().fullAutoMode).toBe(false);
		});
	});

	describe('error message references dashed shortcut form', () => {
		it('no-session error uses /swarm-full-auto (dashed), not /swarm full-auto (spaced)', async () => {
			const result = await handleFullAutoCommand('/project', [], '');
			expect(result).toContain('/swarm-full-auto');
			expect(result).not.toContain('/swarm full-auto');
		});
	});
});

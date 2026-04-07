/**
 * Tests for empty sessionID handling in handleFullAutoCommand.
 * Tests the CLI wiring fix where empty sessionID returns proper error message.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { handleFullAutoCommand } from '../commands/full-auto';
import { swarmState } from '../state';

describe('handleFullAutoCommand - Empty SessionID Handling', () => {
	let testSessionId: string;

	beforeEach(() => {
		testSessionId = `full-auto-test-${Date.now()}`;
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

	describe('Empty SessionID - CLI Context Error', () => {
		it('returns CLI context error when sessionID is empty string', async () => {
			const result = await handleFullAutoCommand('/project', [], '');
			expect(result).toBe(
				'Error: No active session context. Full-Auto Mode requires an active session. Use /swarm-full-auto from within an OpenCode session, or start a session first.',
			);
		});

		it('returns CLI context error when sessionID is whitespace only', async () => {
			const result = await handleFullAutoCommand('/project', [], '   ');
			expect(result).toBe(
				'Error: No active session context. Full-Auto Mode requires an active session. Use /swarm-full-auto from within an OpenCode session, or start a session first.',
			);
		});

		it('returns CLI context error when sessionID is tab and space mixed', async () => {
			const result = await handleFullAutoCommand('/project', [], '\t \n');
			expect(result).toBe(
				'Error: No active session context. Full-Auto Mode requires an active session. Use /swarm-full-auto from within an OpenCode session, or start a session first.',
			);
		});

		it('does not create a session when sessionID is empty', async () => {
			const initialSessionCount = swarmState.agentSessions.size;
			await handleFullAutoCommand('/project', ['on'], '');
			expect(swarmState.agentSessions.size).toBe(initialSessionCount);
		});
	});

	describe('Empty SessionID vs Non-Existent SessionID Distinction', () => {
		it('returns different error message for empty sessionID vs non-existent session', async () => {
			const emptyResult = await handleFullAutoCommand('/project', [], '');
			const nonExistentResult = await handleFullAutoCommand(
				'/project',
				[],
				'this-session-definitely-does-not-exist-12345',
			);

			expect(emptyResult).not.toBe(nonExistentResult);
			expect(emptyResult).toContain('active session context');
			expect(nonExistentResult).not.toContain('active session context');
		});
	});

	describe('CLI Wiring Verification', () => {
		it('handles full-auto command with empty sessionID and "on" argument', async () => {
			const result = await handleFullAutoCommand('/project', ['on'], '');
			expect(result).toBe(
				'Error: No active session context. Full-Auto Mode requires an active session. Use /swarm-full-auto from within an OpenCode session, or start a session first.',
			);
		});

		it('handles full-auto command with empty sessionID and "off" argument', async () => {
			const result = await handleFullAutoCommand('/project', ['off'], '');
			expect(result).toBe(
				'Error: No active session context. Full-Auto Mode requires an active session. Use /swarm-full-auto from within an OpenCode session, or start a session first.',
			);
		});
	});
});

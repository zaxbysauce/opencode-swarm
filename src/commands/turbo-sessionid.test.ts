/**
 * Tests for Task 3.13: Empty sessionID handling in handleTurboCommand
 * Tests the CLI wiring fix where empty sessionID returns proper error message
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { handleTurboCommand } from '../commands/turbo';
import { swarmState } from '../state';

describe('handleTurboCommand - Empty SessionID Handling (Task 3.13)', () => {
	let testSessionId: string;

	beforeEach(() => {
		// Create a test session
		testSessionId = `turbo-test-${Date.now()}`;
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
		// Clean up test session
		swarmState.agentSessions.delete(testSessionId);
	});

	describe('Empty SessionID - CLI Context Error (Task 3.13)', () => {
		it('returns CLI context error when sessionID is empty string', async () => {
			// This is how CLI calls handleTurboCommand (line 375 in cli/index.ts)
			const result = await handleTurboCommand('/project', [], '');

			expect(result).toBe(
				'Error: No active session context. Turbo Mode requires an active session. Use /swarm turbo from within an OpenCode session, or start a session first.',
			);
		});

		it('returns CLI context error when sessionID is whitespace only', async () => {
			const result = await handleTurboCommand('/project', [], '   ');

			expect(result).toBe(
				'Error: No active session context. Turbo Mode requires an active session. Use /swarm turbo from within an OpenCode session, or start a session first.',
			);
		});

		it('returns CLI context error when sessionID is tab and space mixed', async () => {
			const result = await handleTurboCommand('/project', [], '\t \n');

			expect(result).toBe(
				'Error: No active session context. Turbo Mode requires an active session. Use /swarm turbo from within an OpenCode session, or start a session first.',
			);
		});

		it('does not create a session when sessionID is empty', async () => {
			// Verify that empty sessionID doesn't somehow create a session
			const initialSessionCount = swarmState.agentSessions.size;

			await handleTurboCommand('/project', ['on'], '');

			// Should not have created any new sessions
			expect(swarmState.agentSessions.size).toBe(initialSessionCount);
		});
	});

	describe('Empty SessionID vs Non-Existent SessionID Distinction', () => {
		it('returns different error message for empty sessionID vs non-existent session', async () => {
			// Empty sessionID error
			const emptyResult = await handleTurboCommand('/project', [], '');

			// Non-existent session error
			const nonExistentResult = await handleTurboCommand(
				'/project',
				[],
				'this-session-definitely-does-not-exist-12345',
			);

			// These should be different messages
			expect(emptyResult).not.toBe(nonExistentResult);

			// Empty sessionID should mention "active session context"
			expect(emptyResult).toContain('active session context');

			// Non-existent session should NOT mention "context"
			expect(nonExistentResult).not.toContain('active session context');
		});
	});

	describe('CLI Wiring Verification', () => {
		it('handles turbo command with empty sessionID and "on" argument', async () => {
			// CLI passes args.slice(1) which could be ['on']
			const result = await handleTurboCommand('/project', ['on'], '');

			expect(result).toBe(
				'Error: No active session context. Turbo Mode requires an active session. Use /swarm turbo from within an OpenCode session, or start a session first.',
			);
		});

		it('handles turbo command with empty sessionID and "off" argument', async () => {
			const result = await handleTurboCommand('/project', ['off'], '');

			expect(result).toBe(
				'Error: No active session context. Turbo Mode requires an active session. Use /swarm turbo from within an OpenCode session, or start a session first.',
			);
		});
	});
});

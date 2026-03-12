import { afterEach, describe, expect, it } from 'bun:test';
import {
	advanceTaskState,
	resetSwarmState,
	startAgentSession,
	swarmState,
} from '../state';
import { checkReviewerGate } from './update-task-status';

afterEach(() => {
	resetSwarmState();
});

describe('checkReviewerGate', () => {
	it('allows completion when task state is tests_run', () => {
		startAgentSession('session-1', 'architect');
		const session = swarmState.agentSessions.get('session-1');
		expect(session).toBeDefined();
		if (!session) return;

		advanceTaskState(session, '2.1', 'coder_delegated');
		advanceTaskState(session, '2.1', 'pre_check_passed');
		advanceTaskState(session, '2.1', 'reviewer_run');
		advanceTaskState(session, '2.1', 'tests_run');

		const result = checkReviewerGate('2.1');
		expect(result.blocked).toBe(false);
	});

	it('blocks completion when all valid sessions show idle state (no delegations)', () => {
		startAgentSession('session-1', 'architect');
		startAgentSession('session-2', 'architect');

		// Idle means task was never worked on — gate should block.
		// The recovery mechanism in executeUpdateTaskStatus handles
		// cases where delegations occurred but state wasn't advanced.
		const result = checkReviewerGate('2.2');
		expect(result.blocked).toBe(true);
	});

	it('blocks completion when non-idle states exist but no tests_run/complete state', () => {
		startAgentSession('session-1', 'architect');
		const session = swarmState.agentSessions.get('session-1');
		expect(session).toBeDefined();
		if (!session) return;

		advanceTaskState(session, '2.3', 'coder_delegated');

		const result = checkReviewerGate('2.3');
		expect(result.blocked).toBe(true);
		expect(result.reason).toContain('session-1: coder_delegated');
		expect(result.reason).toContain('Missing required state');
	});
});

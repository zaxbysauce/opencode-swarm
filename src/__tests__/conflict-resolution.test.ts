import { beforeEach, describe, expect, it } from 'bun:test';
import { resolveAgentConflict } from '../hooks/conflict-resolution';
import { ensureAgentSession, resetSwarmState } from '../state';

const SESSION_ID = 'test-conflict-session';

beforeEach(() => {
	resetSwarmState();
});

describe('resolveAgentConflict', () => {
	it('pushes CONFLICT DETECTED advisory when rejectionCount < 3', () => {
		ensureAgentSession(SESSION_ID, 'architect');

		resolveAgentConflict({
			sessionID: SESSION_ID,
			phase: 1,
			taskId: 'task-1',
			sourceAgent: 'reviewer',
			targetAgent: 'coder',
			conflictType: 'feedback_rejection',
			rejectionCount: 2,
			summary: 'Reviewer rejected coder output twice',
		});

		const session = ensureAgentSession(SESSION_ID);
		expect(session.pendingAdvisoryMessages).toBeDefined();
		const msgs = session.pendingAdvisoryMessages ?? [];
		expect(msgs.length).toBe(1);
		expect(msgs[0]).toContain('CONFLICT DETECTED');
		expect(msgs[0]).toContain('reviewer');
		expect(msgs[0]).toContain('coder');
		expect(msgs[0]).toContain('task-1');
	});

	it('pushes CONFLICT ESCALATION advisory when rejectionCount >= 3', () => {
		ensureAgentSession(SESSION_ID, 'architect');

		resolveAgentConflict({
			sessionID: SESSION_ID,
			phase: 2,
			taskId: 'task-2',
			sourceAgent: 'coder',
			targetAgent: 'reviewer',
			conflictType: 'retry_spiral',
			rejectionCount: 3,
			summary: 'Three failed cycles',
		});

		const session = ensureAgentSession(SESSION_ID);
		const msgs = session.pendingAdvisoryMessages ?? [];
		expect(msgs.length).toBe(1);
		expect(msgs[0]).toContain('CONFLICT ESCALATION');
		expect(msgs[0]).toContain('coder');
		expect(msgs[0]).toContain('reviewer');
		expect(msgs[0]).toContain('task-2');
		expect(msgs[0]).toContain('SOUNDING_BOARD');
	});

	it('uses soundingboard resolutionPath when rejectionCount >= 3', () => {
		ensureAgentSession(SESSION_ID, 'architect');

		resolveAgentConflict({
			sessionID: SESSION_ID,
			phase: 1,
			taskId: 'task-3',
			sourceAgent: 'architect',
			targetAgent: 'critic',
			conflictType: 'quality_gate_dispute',
			rejectionCount: 5,
			summary: 'Five cycles',
		});

		const session = ensureAgentSession(SESSION_ID);
		const msgs = session.pendingAdvisoryMessages ?? [];
		expect(msgs[0]).toContain('CONFLICT ESCALATION');
	});

	it('no-ops cleanly when session does not exist', () => {
		// No session created — should not throw
		expect(() => {
			resolveAgentConflict({
				sessionID: 'nonexistent-session',
				phase: 1,
				sourceAgent: 'coder',
				targetAgent: 'reviewer',
				conflictType: 'feedback_rejection',
				rejectionCount: 0,
				summary: 'No session test',
			});
		}).not.toThrow();
	});

	it('defaults rejectionCount to 0 when not provided (self_resolve path)', () => {
		ensureAgentSession(SESSION_ID, 'architect');

		resolveAgentConflict({
			sessionID: SESSION_ID,
			phase: 1,
			sourceAgent: 'test_engineer',
			targetAgent: 'coder',
			conflictType: 'scope_disagreement',
			summary: 'No rejectionCount provided',
		});

		const session = ensureAgentSession(SESSION_ID);
		const msgs = session.pendingAdvisoryMessages ?? [];
		expect(msgs.length).toBe(1);
		expect(msgs[0]).toContain('CONFLICT DETECTED');
	});
});

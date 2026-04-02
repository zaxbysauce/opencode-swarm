import { beforeEach, describe, expect, it } from 'bun:test';
import {
	type AgentSessionState,
	advanceTaskState,
	getTaskState,
	type TaskWorkflowState,
} from '../../src/state';

/**
 * Creates a minimal AgentSessionState for testing defensive guards.
 * Uses type assertion since we're testing edge cases with incomplete state.
 */
function createMinimalSession(
	overrides?: Partial<AgentSessionState>,
): AgentSessionState {
	return {
		agentName: 'test-agent',
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
		catastrophicPhaseWarnings: new Set(),
		qaSkipCount: 0,
		qaSkipTaskIds: [],
		lastPhaseCompleteTimestamp: 0,
		lastPhaseCompletePhase: 0,
		phaseAgentsDispatched: new Set(),
		lastGateOutcome: null,
		declaredCoderScope: null,
		lastScopeViolation: null,
		scopeViolationDetected: false,
		modifiedFilesThisCoderTask: [],
		sessionRehydratedAt: 0,
		...overrides,
	} as AgentSessionState;
}

describe('TaskWorkflowState defensive guard tests', () => {
	describe('advanceTaskState guard - taskWorkflowStates undefined', () => {
		it('should throw INVALID_SESSION when taskWorkflowStates is undefined', () => {
			// Create session with taskWorkflowStates explicitly undefined
			const session = createMinimalSession({ taskWorkflowStates: undefined });

			// Should throw - guard requires taskWorkflowStates to be a Map instance
			expect(() =>
				advanceTaskState(session, 'test-task', 'coder_delegated'),
			).toThrow('INVALID_SESSION');
		});

		it('should throw and NOT initialize Map when taskWorkflowStates is undefined', () => {
			const session = createMinimalSession({ taskWorkflowStates: undefined });

			// Advance state - should throw
			expect(() =>
				advanceTaskState(session, 'test-task', 'coder_delegated'),
			).toThrow();

			// Map was NOT initialized by advanceTaskState (it throws before any initialization)
			expect(session.taskWorkflowStates).toBeUndefined();
		});

		it('should throw on all transitions when taskWorkflowStates is undefined', () => {
			const session = createMinimalSession({ taskWorkflowStates: undefined });

			// All transitions should throw due to INVALID_SESSION
			expect(() =>
				advanceTaskState(session, 'task-1', 'coder_delegated'),
			).toThrow('INVALID_SESSION');
			expect(() =>
				advanceTaskState(session, 'task-1', 'pre_check_passed'),
			).toThrow('INVALID_SESSION');
			expect(() => advanceTaskState(session, 'task-1', 'reviewer_run')).toThrow(
				'INVALID_SESSION',
			);
		});
	});

	describe('advanceTaskState guard - taskWorkflowStates null', () => {
		it('should throw INVALID_SESSION when taskWorkflowStates is null', () => {
			const session = createMinimalSession({ taskWorkflowStates: null as any });

			// Should throw - guard requires taskWorkflowStates to be a Map instance
			expect(() =>
				advanceTaskState(session, 'test-task', 'coder_delegated'),
			).toThrow('INVALID_SESSION');
		});

		it('should throw and NOT initialize Map when taskWorkflowStates is null', () => {
			const session = createMinimalSession({ taskWorkflowStates: null as any });

			// Advance state - should throw
			expect(() =>
				advanceTaskState(session, 'test-task', 'coder_delegated'),
			).toThrow();

			// Map was NOT initialized by advanceTaskState (it throws before any initialization)
			expect(session.taskWorkflowStates).toBeNull();
		});
	});

	describe('getTaskState guard - taskWorkflowStates undefined', () => {
		it('should NOT throw TypeError when taskWorkflowStates is undefined', () => {
			const session = createMinimalSession({ taskWorkflowStates: undefined });

			// Should NOT throw - guard should initialize the Map
			expect(() => getTaskState(session, 'nonexistent-task')).not.toThrow();
		});

		it('should return idle when taskWorkflowStates is undefined and task not found', () => {
			const session = createMinimalSession({ taskWorkflowStates: undefined });

			const state = getTaskState(session, 'nonexistent-task');

			expect(state).toBe('idle');
		});

		it('should return existing state when taskWorkflowStates is undefined but task exists in initialized Map', () => {
			const session = createMinimalSession({ taskWorkflowStates: undefined });

			// First call initializes the Map
			const firstState = getTaskState(session, 'my-task');
			expect(firstState).toBe('idle');

			// Manually set a state (simulating another process)
			session.taskWorkflowStates.set('my-task', 'coder_delegated');

			// Now getTaskState should return that state
			const secondState = getTaskState(session, 'my-task');
			expect(secondState).toBe('coder_delegated');
		});
	});

	describe('getTaskState guard - taskWorkflowStates null', () => {
		it('should NOT throw TypeError when taskWorkflowStates is null', () => {
			const session = createMinimalSession({ taskWorkflowStates: null as any });

			// Should NOT throw - guard should initialize the Map
			expect(() => getTaskState(session, 'nonexistent-task')).not.toThrow();
		});

		it('should return idle when taskWorkflowStates is null and task not found', () => {
			const session = createMinimalSession({ taskWorkflowStates: null as any });

			const state = getTaskState(session, 'nonexistent-task');

			expect(state).toBe('idle');
		});
	});

	describe('Normal operation - properly initialized Map', () => {
		it('advanceTaskState works correctly with properly initialized Map', () => {
			const session = createMinimalSession({
				taskWorkflowStates: new Map<string, TaskWorkflowState>(),
			});

			// Normal workflow should work
			advanceTaskState(session, 'task-1', 'coder_delegated');
			expect(getTaskState(session, 'task-1')).toBe('coder_delegated');

			advanceTaskState(session, 'task-1', 'pre_check_passed');
			expect(getTaskState(session, 'task-1')).toBe('pre_check_passed');

			advanceTaskState(session, 'task-1', 'reviewer_run');
			expect(getTaskState(session, 'task-1')).toBe('reviewer_run');

			advanceTaskState(session, 'task-1', 'tests_run');
			expect(getTaskState(session, 'task-1')).toBe('tests_run');

			advanceTaskState(session, 'task-1', 'complete');
			expect(getTaskState(session, 'task-1')).toBe('complete');
		});

		it('getTaskState returns correct state with properly initialized Map', () => {
			const taskStates = new Map<string, TaskWorkflowState>();
			taskStates.set('task-A', 'coder_delegated');
			taskStates.set('task-B', 'tests_run');

			const session = createMinimalSession({ taskWorkflowStates: taskStates });

			expect(getTaskState(session, 'task-A')).toBe('coder_delegated');
			expect(getTaskState(session, 'task-B')).toBe('tests_run');
			expect(getTaskState(session, 'unknown-task')).toBe('idle');
		});

		it('multiple tasks tracked correctly with properly initialized Map', () => {
			const session = createMinimalSession({
				taskWorkflowStates: new Map<string, TaskWorkflowState>(),
			});

			// Multiple independent tasks
			advanceTaskState(session, 'task-X', 'coder_delegated');
			advanceTaskState(session, 'task-Y', 'tests_run');

			expect(getTaskState(session, 'task-X')).toBe('coder_delegated');
			expect(getTaskState(session, 'task-Y')).toBe('tests_run');
			expect(getTaskState(session, 'task-Z')).toBe('idle');
		});
	});

	describe('Edge case - taskWorkflowStates is falsey values', () => {
		it('handles 0 as taskWorkflowStates - throws INVALID_SESSION', () => {
			const session = createMinimalSession({ taskWorkflowStates: 0 as any });

			// 0 is not a Map instance - throws INVALID_SESSION
			expect(() =>
				advanceTaskState(session, 'task-1', 'coder_delegated'),
			).toThrow('INVALID_SESSION');
		});

		it('handles empty string as taskWorkflowStates - throws INVALID_SESSION', () => {
			const session = createMinimalSession({ taskWorkflowStates: '' as any });

			// Empty string is not a Map instance - throws INVALID_SESSION
			expect(() =>
				advanceTaskState(session, 'task-1', 'coder_delegated'),
			).toThrow('INVALID_SESSION');
		});
	});
});

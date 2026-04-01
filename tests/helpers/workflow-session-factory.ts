/**
 * Shared workflow session factory for test suites.
 * Provides common session creation utilities for workflow state tests.
 */

import type { AgentSessionState, TaskWorkflowState } from '../../src/state';
import { advanceTaskState } from '../../src/state';

/**
 * Creates a base agent session with default test values.
 * Use this as a starting point for workflow state tests.
 */
export function createWorkflowTestSession(
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
		selfCodingWarnedAtCount: 0,
		catastrophicPhaseWarnings: new Set(),
		qaSkipCount: 0,
		qaSkipTaskIds: [],
		lastPhaseCompleteTimestamp: 0,
		lastPhaseCompletePhase: 0,
		phaseAgentsDispatched: new Set(),
		lastCompletedPhaseAgentsDispatched: new Set(),
		taskWorkflowStates: new Map(),
		lastGateOutcome: null,
		declaredCoderScope: null,
		lastScopeViolation: null,
		scopeViolationDetected: false,
		modifiedFilesThisCoderTask: [],
		...overrides,
	};
}

/**
 * Creates a session with pre-configured task workflow states.
 * Convenience overload for setting initial task states.
 */
export function createWorkflowTestSessionWithTasks(
	taskStates: Record<string, TaskWorkflowState>,
): AgentSessionState {
	const taskWorkflowStates = new Map<string, TaskWorkflowState>(
		Object.entries(taskStates),
	);
	return createWorkflowTestSession({ taskWorkflowStates });
}

/**
 * Creates a session and advances a task to a specific workflow state.
 * Convenience helper for common test scenarios.
 */
export function createWorkflowTestSessionWithTaskAtState(
	taskId: string,
	state: TaskWorkflowState,
): AgentSessionState {
	const session = createWorkflowTestSession();
	advanceTaskState(session, taskId, state);
	return session;
}

/**
 * Creates a session with a task that has passed all QA gates (tests_run state).
 * This is useful for tests that need a "passing" task state.
 */
export function createWorkflowTestSessionWithPassedTask(
	taskId: string,
): AgentSessionState {
	const session = createWorkflowTestSession();
	advanceTaskState(session, taskId, 'coder_delegated');
	advanceTaskState(session, taskId, 'pre_check_passed');
	advanceTaskState(session, taskId, 'reviewer_run');
	advanceTaskState(session, taskId, 'tests_run');
	return session;
}

/**
 * Creates a session with a task that has completed all gates.
 * This is useful for tests that need a "completed" task state.
 */
export function createWorkflowTestSessionWithCompletedTask(
	taskId: string,
): AgentSessionState {
	const session = createWorkflowTestSession();
	advanceTaskState(session, taskId, 'coder_delegated');
	advanceTaskState(session, taskId, 'pre_check_passed');
	advanceTaskState(session, taskId, 'reviewer_run');
	advanceTaskState(session, taskId, 'tests_run');
	advanceTaskState(session, taskId, 'complete');
	return session;
}

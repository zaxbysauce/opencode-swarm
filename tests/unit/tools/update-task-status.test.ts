import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
	validateStatus,
	validateTaskId,
	executeUpdateTaskStatus,
	checkReviewerGate,
	type UpdateTaskStatusArgs,
} from '../../../src/tools/update-task-status';
import { swarmState, advanceTaskState, getTaskState, ensureAgentSession } from '../../../src/state';

describe('validateStatus', () => {
	test('returns undefined for valid statuses', () => {
		expect(validateStatus('pending')).toBeUndefined();
		expect(validateStatus('in_progress')).toBeUndefined();
		expect(validateStatus('completed')).toBeUndefined();
		expect(validateStatus('blocked')).toBeUndefined();
	});

	test('returns error for invalid status', () => {
		const result = validateStatus('invalid');
		expect(result).toBeDefined();
		expect(result).toContain('Invalid status');
	});

	test('returns error for empty status', () => {
		const result = validateStatus('');
		expect(result).toBeDefined();
		expect(result).toContain('Invalid status');
	});
});

describe('validateTaskId', () => {
	test('returns undefined for valid task IDs', () => {
		expect(validateTaskId('1.1')).toBeUndefined();
		expect(validateTaskId('1.2.3')).toBeUndefined();
		expect(validateTaskId('10.5')).toBeUndefined();
		expect(validateTaskId('2.1.1.1')).toBeUndefined();
	});

	test('returns error for invalid task ID format', () => {
		expect(validateTaskId('1')).toBeDefined();
		expect(validateTaskId('a.b')).toBeDefined();
		expect(validateTaskId('1.')).toBeDefined();
		expect(validateTaskId('.1')).toBeDefined();
		expect(validateTaskId('')).toBeDefined();
	});
});

describe('executeUpdateTaskStatus', () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'update-task-status-test-'));
		originalCwd = process.cwd();
		process.chdir(tempDir);

		// Create .swarm directory with a valid plan
		fs.mkdirSync(path.join(tempDir, '.swarm'), { recursive: true });
		const plan = {
			schema_version: '1.0.0',
			title: 'Test Plan',
			swarm: 'test-swarm',
			current_phase: 1,
			migration_status: 'migrated',
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'in_progress',
					tasks: [
						{
							id: '1.1',
							phase: 1,
							status: 'pending',
							size: 'small',
							description: 'Test task 1',
							depends: [],
							files_touched: [],
						},
						{
							id: '1.2',
							phase: 1,
							status: 'pending',
							size: 'medium',
							description: 'Test task 2',
							depends: ['1.1'],
							files_touched: [],
						},
					],
				},
			],
		};
		fs.writeFileSync(
			path.join(tempDir, '.swarm', 'plan.json'),
			JSON.stringify(plan, null, 2),
		);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	test('updates task status successfully', async () => {
		const args: UpdateTaskStatusArgs = {
			task_id: '1.1',
			status: 'in_progress',
		};

		const result = await executeUpdateTaskStatus(args, tempDir);

		expect(result.success).toBe(true);
		expect(result.message).toBe('Task status updated successfully');
		expect(result.task_id).toBe('1.1');
		expect(result.new_status).toBe('in_progress');
		expect(result.current_phase).toBe(1);

		// Verify the plan was actually updated
		const planJson = JSON.parse(
			fs.readFileSync(path.join(tempDir, '.swarm', 'plan.json'), 'utf-8'),
		);
		expect(planJson.phases[0].tasks[0].status).toBe('in_progress');
	});

	test('updates task to completed status', async () => {
		const args: UpdateTaskStatusArgs = {
			task_id: '1.1',
			status: 'completed',
		};

		const result = await executeUpdateTaskStatus(args, tempDir);

		expect(result.success).toBe(true);
		expect(result.new_status).toBe('completed');

		// Verify the plan was actually updated
		const planJson = JSON.parse(
			fs.readFileSync(path.join(tempDir, '.swarm', 'plan.json'), 'utf-8'),
		);
		expect(planJson.phases[0].tasks[0].status).toBe('completed');
	});

	test('updates task to blocked status', async () => {
		const args: UpdateTaskStatusArgs = {
			task_id: '1.2',
			status: 'blocked',
		};

		const result = await executeUpdateTaskStatus(args, tempDir);

		expect(result.success).toBe(true);
		expect(result.new_status).toBe('blocked');
	});

	test('fails with invalid status', async () => {
		const args: UpdateTaskStatusArgs = {
			task_id: '1.1',
			status: 'invalid_status',
		};

		const result = await executeUpdateTaskStatus(args, tempDir);

		expect(result.success).toBe(false);
		expect(result.errors).toBeDefined();
		expect(result.errors?.[0]).toContain('Invalid status');
	});

	test('fails with invalid task_id format', async () => {
		const args: UpdateTaskStatusArgs = {
			task_id: 'invalid',
			status: 'pending',
		};

		const result = await executeUpdateTaskStatus(args, tempDir);

		expect(result.success).toBe(false);
		expect(result.errors).toBeDefined();
		expect(result.errors?.[0]).toContain('Invalid task_id');
	});

	test('fails when task not found', async () => {
		const args: UpdateTaskStatusArgs = {
			task_id: '99.99',
			status: 'completed',
		};

		const result = await executeUpdateTaskStatus(args, tempDir);

		expect(result.success).toBe(false);
		expect(result.errors).toBeDefined();
		expect(result.errors?.[0]).toContain('Task not found');
	});

	test('fails when plan does not exist', async () => {
		// Remove the plan
		fs.rmSync(path.join(tempDir, '.swarm'), { recursive: true });

		const args: UpdateTaskStatusArgs = {
			task_id: '1.1',
			status: 'completed',
		};

		const result = await executeUpdateTaskStatus(args, tempDir);

		expect(result.success).toBe(false);
		expect(result.errors).toBeDefined();
	});

	test('regenerates plan.md after successful status update', async () => {
		const args: UpdateTaskStatusArgs = {
			task_id: '1.1',
			status: 'in_progress',
		};

		const result = await executeUpdateTaskStatus(args, tempDir);

		expect(result.success).toBe(true);

		// Verify plan.md was regenerated
		const planMdPath = path.join(tempDir, '.swarm', 'plan.md');
		expect(fs.existsSync(planMdPath)).toBe(true);

		const planMdContent = fs.readFileSync(planMdPath, 'utf-8');
		expect(planMdContent).toContain('1.1');
		expect(planMdContent).toContain('IN PROGRESS');
	});
});

describe('checkReviewerGate', () => {
	let originalAgentSessions: Map<string, any>;

	beforeEach(() => {
		originalAgentSessions = new Map(swarmState.agentSessions);
		swarmState.agentSessions.clear();
	});

	afterEach(() => {
		swarmState.agentSessions.clear();
		for (const [key, value] of originalAgentSessions) {
			swarmState.agentSessions.set(key, value);
		}
	});

	function makeSession(overrides: Partial<any> = {}): any {
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
			taskWorkflowStates: new Map(),
			lastGateOutcome: null,
			declaredCoderScope: null,
			lastScopeViolation: null,
			...overrides,
		};
	}

	test('returns blocked: false when agentSessions is empty', () => {
		const result = checkReviewerGate('1.1');
		expect(result.blocked).toBe(false);
		expect(result.reason).toBe('');
	});

	test('returns blocked: false when task is in tests_run state', () => {
		const sessionId = 'test-session-1';
		const session = makeSession();
		advanceTaskState(session, '1.1', 'coder_delegated');
		advanceTaskState(session, '1.1', 'pre_check_passed');
		advanceTaskState(session, '1.1', 'reviewer_run');
		advanceTaskState(session, '1.1', 'tests_run');
		swarmState.agentSessions.set(sessionId, session);

		const result = checkReviewerGate('1.1');
		expect(result.blocked).toBe(false);
		expect(result.reason).toBe('');
	});

	test('returns blocked: false when task is in complete state', () => {
		const sessionId = 'test-session-2';
		const session = makeSession();
		advanceTaskState(session, '1.1', 'coder_delegated');
		advanceTaskState(session, '1.1', 'pre_check_passed');
		advanceTaskState(session, '1.1', 'reviewer_run');
		advanceTaskState(session, '1.1', 'tests_run');
		advanceTaskState(session, '1.1', 'complete');
		swarmState.agentSessions.set(sessionId, session);

		const result = checkReviewerGate('1.1');
		expect(result.blocked).toBe(false);
		expect(result.reason).toBe('');
	});

	test('returns blocked: true when task is in idle state (not started)', () => {
		const sessionId = 'test-session-3';
		const session = makeSession(); // taskWorkflowStates is empty, so 1.1 is 'idle'
		swarmState.agentSessions.set(sessionId, session);

		const result = checkReviewerGate('1.1');
		expect(result.blocked).toBe(true);
		expect(result.reason).toContain('Task 1.1');
		expect(result.reason).toContain('QA gates');
	});

	test('returns blocked: true when task is in coder_delegated state', () => {
		const sessionId = 'test-session-4';
		const session = makeSession();
		advanceTaskState(session, '1.1', 'coder_delegated');
		swarmState.agentSessions.set(sessionId, session);

		const result = checkReviewerGate('1.1');
		expect(result.blocked).toBe(true);
		expect(result.reason).toContain('Task 1.1');
	});

	test('returns blocked: true when task is in reviewer_run state (tests not yet run)', () => {
		const sessionId = 'test-session-5';
		const session = makeSession();
		advanceTaskState(session, '1.1', 'coder_delegated');
		advanceTaskState(session, '1.1', 'pre_check_passed');
		advanceTaskState(session, '1.1', 'reviewer_run');
		swarmState.agentSessions.set(sessionId, session);

		const result = checkReviewerGate('1.1');
		expect(result.blocked).toBe(true);
		expect(result.reason).toContain('Task 1.1');
	});

	test('returns blocked: true for different task ID even if another task passed', () => {
		const sessionId = 'test-session-6';
		const session = makeSession();
		advanceTaskState(session, '2.1', 'coder_delegated');
		advanceTaskState(session, '2.1', 'pre_check_passed');
		advanceTaskState(session, '2.1', 'reviewer_run');
		advanceTaskState(session, '2.1', 'tests_run');
		swarmState.agentSessions.set(sessionId, session);

		// Check for a DIFFERENT task ID — should be blocked since 1.1 is idle
		const result = checkReviewerGate('1.1');
		expect(result.blocked).toBe(true);
	});
});

describe('executeUpdateTaskStatus with reviewer gate', () => {
	let tempDir: string;
	let originalCwd: string;
	let originalAgentSessions: Map<string, any>;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'update-task-status-reviewer-test-'));
		originalCwd = process.cwd();
		process.chdir(tempDir);

		// Save original agent sessions and clear for clean test state
		originalAgentSessions = new Map(swarmState.agentSessions);
		swarmState.agentSessions.clear();

		// Create .swarm directory with a valid plan
		fs.mkdirSync(path.join(tempDir, '.swarm'), { recursive: true });
		const plan = {
			schema_version: '1.0.0',
			title: 'Test Plan',
			swarm: 'test-swarm',
			current_phase: 1,
			migration_status: 'migrated',
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'in_progress',
					tasks: [
						{
							id: '1.1',
							phase: 1,
							status: 'pending',
							size: 'small',
							description: 'Test task 1',
							depends: [],
							files_touched: [],
						},
					],
				},
			],
		};
		fs.writeFileSync(
			path.join(tempDir, '.swarm', 'plan.json'),
			JSON.stringify(plan, null, 2),
		);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		fs.rmSync(tempDir, { recursive: true, force: true });

		// Restore original agent sessions
		swarmState.agentSessions.clear();
		for (const [key, value] of originalAgentSessions) {
			swarmState.agentSessions.set(key, value);
		}
	});

	test('returns failure when status is completed and reviewer gate is blocked', async () => {
		// Set up a session with task in idle state (will block)
		const session: any = {
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
			catastrophicPhaseWarnings: new Set(),
			qaSkipCount: 0,
			qaSkipTaskIds: [],
			lastPhaseCompleteTimestamp: 0,
			lastPhaseCompletePhase: 0,
			phaseAgentsDispatched: new Set(),
			taskWorkflowStates: new Map(), // Empty = task 1.1 is in 'idle' state
			lastGateOutcome: null,
			declaredCoderScope: null,
			lastScopeViolation: null,
		};
		swarmState.agentSessions.set('session-blocked', session);

		const args: UpdateTaskStatusArgs = {
			task_id: '1.1',
			status: 'completed',
		};

		const result = await executeUpdateTaskStatus(args, tempDir);

		expect(result.success).toBe(false);
		expect(result.message).toContain('Gate check failed');
		expect(result.errors).toBeDefined();
		expect(result.errors?.[0]).toContain('Task 1.1');
		expect(result.errors?.[0]).toContain('QA gates');
	});

	test('proceeds normally when status is completed and reviewer gate passes', async () => {
		// Set up a session with task in tests_run state (will pass)
		const session: any = {
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
			catastrophicPhaseWarnings: new Set(),
			qaSkipCount: 0,
			qaSkipTaskIds: [],
			lastPhaseCompleteTimestamp: 0,
			lastPhaseCompletePhase: 0,
			phaseAgentsDispatched: new Set(),
			taskWorkflowStates: new Map(),
			lastGateOutcome: null,
			declaredCoderScope: null,
			lastScopeViolation: null,
		};
		// Advance task 1.1 to tests_run state so the gate passes
		advanceTaskState(session, '1.1', 'coder_delegated');
		advanceTaskState(session, '1.1', 'pre_check_passed');
		advanceTaskState(session, '1.1', 'reviewer_run');
		advanceTaskState(session, '1.1', 'tests_run');
		swarmState.agentSessions.set('session-pass', session);

		const args: UpdateTaskStatusArgs = {
			task_id: '1.1',
			status: 'completed',
		};

		const result = await executeUpdateTaskStatus(args, tempDir);

		expect(result.success).toBe(true);
		expect(result.new_status).toBe('completed');
	});

	test('does not check reviewer gate when status is in_progress', async () => {
		// Set up an architect session with empty taskWorkflowStates (task idle - would block if checked)
		const session: any = {
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
			catastrophicPhaseWarnings: new Set(),
			qaSkipCount: 0,
			qaSkipTaskIds: [],
			lastPhaseCompleteTimestamp: 0,
			lastPhaseCompletePhase: 0,
			phaseAgentsDispatched: new Set(),
			taskWorkflowStates: new Map(),
			lastGateOutcome: null,
			declaredCoderScope: null,
			lastScopeViolation: null,
		};
		swarmState.agentSessions.set('session-would-block', session);

		const args: UpdateTaskStatusArgs = {
			task_id: '1.1',
			status: 'in_progress',
		};

		const result = await executeUpdateTaskStatus(args, tempDir);

		// Should succeed even though gate would block if we were marking completed
		expect(result.success).toBe(true);
		expect(result.new_status).toBe('in_progress');
	});

	test('does not check reviewer gate when status is pending', async () => {
		// Set up an architect session with empty taskWorkflowStates (task idle - would block if checked)
		const session: any = {
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
			catastrophicPhaseWarnings: new Set(),
			qaSkipCount: 0,
			qaSkipTaskIds: [],
			lastPhaseCompleteTimestamp: 0,
			lastPhaseCompletePhase: 0,
			phaseAgentsDispatched: new Set(),
			taskWorkflowStates: new Map(),
			lastGateOutcome: null,
			declaredCoderScope: null,
			lastScopeViolation: null,
		};
		swarmState.agentSessions.set('session-would-block', session);

		const args: UpdateTaskStatusArgs = {
			task_id: '1.1',
			status: 'pending',
		};

		const result = await executeUpdateTaskStatus(args, tempDir);

		// Should succeed even though gate would block if we were marking completed
		expect(result.success).toBe(true);
		expect(result.new_status).toBe('pending');
	});

	test('does not check reviewer gate when status is blocked', async () => {
		// Set up an architect session with empty taskWorkflowStates (task idle - would block if checked)
		const session: any = {
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
			catastrophicPhaseWarnings: new Set(),
			qaSkipCount: 0,
			qaSkipTaskIds: [],
			lastPhaseCompleteTimestamp: 0,
			lastPhaseCompletePhase: 0,
			phaseAgentsDispatched: new Set(),
			taskWorkflowStates: new Map(),
			lastGateOutcome: null,
			declaredCoderScope: null,
			lastScopeViolation: null,
		};
		swarmState.agentSessions.set('session-would-block', session);

		const args: UpdateTaskStatusArgs = {
			task_id: '1.1',
			status: 'blocked',
		};

		const result = await executeUpdateTaskStatus(args, tempDir);

		// Should succeed even though gate would block if we were marking completed
		expect(result.success).toBe(true);
		expect(result.new_status).toBe('blocked');
	});
});

// ===== Batch reviewer delegation test =====

describe('Batch reviewer delegation advances all coder_delegated tasks to reviewer_run', () => {
	let originalAgentSessions: Map<string, any>;

	beforeEach(() => {
		originalAgentSessions = new Map(swarmState.agentSessions);
		swarmState.agentSessions.clear();
	});

	afterEach(() => {
		swarmState.agentSessions.clear();
		for (const [key, value] of originalAgentSessions) {
			swarmState.agentSessions.set(key, value);
		}
	});

	test('Batch reviewer delegation advances all coder_delegated tasks to reviewer_run', () => {
		// Use ensureAgentSession to set up session (simulating default config: delegation_tracker=false, delegation_gate=true)
		const sessionId = 'test-batch-delegation-session';
		const session = ensureAgentSession(sessionId, 'test-agent');

		// Set up three tasks at coder_delegated state
		advanceTaskState(session, 'p2.1', 'coder_delegated');
		advanceTaskState(session, 'p2.2', 'coder_delegated');
		advanceTaskState(session, 'p2.3', 'coder_delegated');

		// Pass 1: for each task at coder_delegated (or pre_check_passed), advance to reviewer_run
		// The actual taskWorkflowStates passes through pre_check_passed before reaching reviewer_run
		advanceTaskState(session, 'p2.1', 'pre_check_passed');
		advanceTaskState(session, 'p2.1', 'reviewer_run');
		advanceTaskState(session, 'p2.2', 'pre_check_passed');
		advanceTaskState(session, 'p2.2', 'reviewer_run');
		advanceTaskState(session, 'p2.3', 'pre_check_passed');
		advanceTaskState(session, 'p2.3', 'reviewer_run');

		// Pass 2: for each task now at reviewer_run, advance to tests_run
		advanceTaskState(session, 'p2.1', 'tests_run');
		advanceTaskState(session, 'p2.2', 'tests_run');
		advanceTaskState(session, 'p2.3', 'tests_run');

		// Verify that checkReviewerGate now passes - meaning update_task_status("completed") would succeed
		const result1 = checkReviewerGate('p2.1');
		const result2 = checkReviewerGate('p2.2');
		const result3 = checkReviewerGate('p2.3');

		expect(result1.blocked).toBe(false);
		expect(result1.reason).toBe('');
		expect(result2.blocked).toBe(false);
		expect(result2.reason).toBe('');
		expect(result3.blocked).toBe(false);
		expect(result3.reason).toBe('');
	});
});

describe('executeUpdateTaskStatus in_progress state machine seeding (Task 2.3)', () => {
	let originalAgentSessions: Map<string, any>;
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		// Save and clear agent sessions
		originalAgentSessions = new Map(swarmState.agentSessions);
		swarmState.agentSessions.clear();

		// Create tempDir with valid plan.json
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'update-task-status-task23-test-'));
		originalCwd = process.cwd();
		process.chdir(tempDir);

		// Create .swarm directory with a valid plan
		fs.mkdirSync(path.join(tempDir, '.swarm'), { recursive: true });
		const plan = {
			schema_version: '1.0.0',
			title: 'Test Plan',
			swarm: 'test-swarm',
			current_phase: 1,
			migration_status: 'migrated',
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'in_progress',
					tasks: [
						{
							id: '1.1',
							phase: 1,
							status: 'pending',
							size: 'small',
							description: 'Test task 1',
							depends: [],
							files_touched: [],
						},
					],
				},
			],
		};
		fs.writeFileSync(
			path.join(tempDir, '.swarm', 'plan.json'),
			JSON.stringify(plan, null, 2),
		);
	});

	afterEach(() => {
		// Restore agent sessions
		swarmState.agentSessions.clear();
		for (const [key, value] of originalAgentSessions) {
			swarmState.agentSessions.set(key, value);
		}

		// Restore cwd and cleanup tempDir
		process.chdir(originalCwd);
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	test('update_task_status(in_progress) advances task from idle to coder_delegated', async () => {
		// Set up a session using ensureAgentSession
		const sessionId = 'test-task23-session';
		const session = ensureAgentSession(sessionId, 'test-agent');

		// Verify the task starts at 'idle' using getTaskState
		const initialState = getTaskState(session, '1.1');
		expect(initialState).toBe('idle');

		// Call executeUpdateTaskStatus with status: 'in_progress'
		const args: UpdateTaskStatusArgs = {
			task_id: '1.1',
			status: 'in_progress',
		};

		const result = await executeUpdateTaskStatus(args, tempDir);

		// Assert the call succeeded
		expect(result.success).toBe(true);
		expect(result.new_status).toBe('in_progress');

		// Assert the task is now at 'coder_delegated' using getTaskState
		const finalState = getTaskState(session, '1.1');
		expect(finalState).toBe('coder_delegated');
	});
});

describe('checkReviewerGate dynamic error message (Task 2.4)', () => {
	let originalAgentSessions: typeof swarmState.agentSessions;

	beforeEach(() => {
		// Save the original agentSessions state
		originalAgentSessions = new Map(swarmState.agentSessions);
		// Clear for test
		swarmState.agentSessions.clear();
	});

	afterEach(() => {
		// Restore the original agentSessions state
		swarmState.agentSessions = originalAgentSessions;
	});

	test('checkReviewerGate error includes current state debug info', () => {
		// Create a session using ensureAgentSession
		const session = ensureAgentSession('test-session');

		// Advance task '1.1' to 'coder_delegated' using advanceTaskState
		advanceTaskState(session, '1.1', 'coder_delegated');

		// Call checkReviewerGate('1.1')
		const result = checkReviewerGate('1.1');

		// Assert the result
		expect(result.blocked).toBe(true);
		expect(result.reason).toContain('Current state:');
		expect(result.reason).toContain('coder_delegated');
		expect(result.reason).toContain('Required state: tests_run or complete');
	});
});

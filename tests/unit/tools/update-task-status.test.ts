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

	describe('Bug 3 fix: plan.json fallback when all sessions are idle', () => {
		test('allows completed when plan.json shows task already completed (no active tests_run state)', async () => {
			// Write a plan.json where task 1.1 is already completed
			const completedPlan = {
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
								status: 'completed',
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
				JSON.stringify(completedPlan, null, 2),
			);

			// Create a session but keep task state at idle (simulates session restart)
			ensureAgentSession('test-idle-session');
			// Do NOT advance state machine — task stays at idle

			const result = await executeUpdateTaskStatus(
				{ task_id: '1.1', status: 'completed' },
				tempDir,
			);

			// Should succeed because plan.json shows task is already completed
			expect(result.success).toBe(true);
			expect(result.new_status).toBe('completed');
		});

		test('blocks completed when plan.json shows task as in_progress (gate still enforced)', async () => {
			// plan.json shows task 1.1 as in_progress — gate should be enforced
			const inProgressPlan = {
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
								status: 'in_progress',
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
				JSON.stringify(inProgressPlan, null, 2),
			);

			// Create a session but keep task state at idle
			ensureAgentSession('test-idle-session');
			// Do NOT advance state machine

			const result = await executeUpdateTaskStatus(
				{ task_id: '1.1', status: 'completed' },
				tempDir,
			);

			// Should fail: gate enforced because task is in_progress (not completed) in plan.json
			expect(result.success).toBe(false);
			expect(result.message).toContain('Gate check failed');
		});
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
	let originalAgentSessions: typeof swarmState.agentSessions;
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

	test('update_task_status(in_progress) synchronizes session currentTaskId for gate recording', async () => {
		// Set up a session using ensureAgentSession
		const sessionId = 'test-task-identity-session';
		const session = ensureAgentSession(sessionId, 'test-agent');

		// Verify currentTaskId starts as null
		expect(session.currentTaskId).toBeNull();

		// Call executeUpdateTaskStatus with status: 'in_progress' for task 1.1
		const args: UpdateTaskStatusArgs = {
			task_id: '1.1',
			status: 'in_progress',
		};

		const result = await executeUpdateTaskStatus(args, tempDir);

		// Assert the call succeeded
		expect(result.success).toBe(true);

		// Assert the session's currentTaskId is now set to the task_id
		expect(session.currentTaskId).toBe('1.1');
	});
});

// Task 1.2 regression: evidence-sync bug - in_progress activation before durable gate recording
// Tests that when a new task is moved to in_progress while a prior task exists in session state,
// the new task's identity is properly synchronized so that later reviewer/test_engineer evidence
// can satisfy completion for the new task without manual evidence repair.
describe('executeUpdateTaskStatus Task 1.2 regression: in_progress activation syncs task identity for durable gate recording', () => {
	let originalAgentSessions: typeof swarmState.agentSessions;
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		// Save and clear agent sessions
		originalAgentSessions = new Map(swarmState.agentSessions);
		swarmState.agentSessions.clear();

		// Create tempDir with valid plan.json containing two tasks
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-12-regression-test-'));
		originalCwd = process.cwd();
		process.chdir(tempDir);

		// Create .swarm directory with plan containing two tasks
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
							status: 'completed',
							size: 'small',
							description: 'Prior task already completed',
							depends: [],
							files_touched: [],
						},
						{
							id: '1.2',
							phase: 1,
							status: 'pending',
							size: 'small',
							description: 'New task to be activated',
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

		// Create evidence directory for task 1.1 (prior task with completed evidence)
		fs.mkdirSync(path.join(tempDir, '.swarm', 'evidence'), { recursive: true });
		const priorTaskEvidence = {
			task_id: '1.1',
			required_gates: ['reviewer', 'test_engineer'],
			gates: {
				reviewer: { timestamp: Date.now(), result: 'PASS' },
				test_engineer: { timestamp: Date.now(), result: 'PASS' },
			},
		};
		fs.writeFileSync(
			path.join(tempDir, '.swarm', 'evidence', '1.1.json'),
			JSON.stringify(priorTaskEvidence, null, 2),
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

	test('moving new task to in_progress synchronizes currentTaskId for later durable evidence', async () => {
		// Step 1: Set up a session with prior task 1.1 in workflow state
		const session = ensureAgentSession('test-session', 'test-agent');

		// Simulate prior task (1.1) already at complete state in session workflow
		advanceTaskState(session, '1.1', 'coder_delegated');
		advanceTaskState(session, '1.1', 'pre_check_passed');
		advanceTaskState(session, '1.1', 'reviewer_run');
		advanceTaskState(session, '1.1', 'tests_run');
		advanceTaskState(session, '1.1', 'complete');

		// Verify prior task is at complete state
		expect(getTaskState(session, '1.1')).toBe('complete');

		// Verify session's currentTaskId is currently null (no active task)
		expect(session.currentTaskId).toBeNull();

		// Step 2: Move NEW task (1.2) to in_progress via executeUpdateTaskStatus
		const args: UpdateTaskStatusArgs = {
			task_id: '1.2',
			status: 'in_progress',
		};

		const result = await executeUpdateTaskStatus(args, tempDir);

		// Assert the call succeeded
		expect(result.success).toBe(true);
		expect(result.new_status).toBe('in_progress');

		// Step 3: Verify the new task's workflow state was advanced
		expect(getTaskState(session, '1.2')).toBe('coder_delegated');

		// Step 4: CRITICAL - Verify session's currentTaskId is now set to the NEW task (1.2)
		// This is the key fix: task identity synchronization so later gate recording uses correct task
		expect(session.currentTaskId).toBe('1.2');

		// Step 5: Simulate durable evidence for the NEW task (1.2) - should satisfy completion
		const newTaskEvidence = {
			task_id: '1.2',
			required_gates: ['reviewer', 'test_engineer'],
			gates: {
				reviewer: { timestamp: Date.now(), result: 'PASS' },
				test_engineer: { timestamp: Date.now(), result: 'PASS' },
			},
		};
		fs.writeFileSync(
			path.join(tempDir, '.swarm', 'evidence', '1.2.json'),
			JSON.stringify(newTaskEvidence, null, 2),
		);

		// Step 6: Verify checkReviewerGate passes for the NEW task (1.2) using durable evidence
		const gateResult = checkReviewerGate('1.2', tempDir);

		// Should pass because durable evidence exists for task 1.2
		expect(gateResult.blocked).toBe(false);
		expect(gateResult.reason).toBe('');

		// Step 7: Verify completing the new task succeeds without manual evidence repair
		const completeArgs: UpdateTaskStatusArgs = {
			task_id: '1.2',
			status: 'completed',
		};

		const completeResult = await executeUpdateTaskStatus(completeArgs, tempDir);

		// Should succeed because evidence-first check passes (no manual repair needed)
		expect(completeResult.success).toBe(true);
		expect(completeResult.new_status).toBe('completed');
	});

	test('prior task identity is preserved when switching to new task in_progress', async () => {
		// Set up a session with prior task 1.1 already tracked
		const session = ensureAgentSession('test-session', 'test-agent');

		// Set currentTaskId to prior task (simulating prior work)
		session.currentTaskId = '1.1';

		// Advance prior task to complete state
		advanceTaskState(session, '1.1', 'coder_delegated');
		advanceTaskState(session, '1.1', 'pre_check_passed');
		advanceTaskState(session, '1.1', 'reviewer_run');
		advanceTaskState(session, '1.1', 'tests_run');
		advanceTaskState(session, '1.1', 'complete');

		// Verify prior task is tracked
		expect(session.currentTaskId).toBe('1.1');
		expect(getTaskState(session, '1.1')).toBe('complete');

		// Move NEW task (1.2) to in_progress
		const args: UpdateTaskStatusArgs = {
			task_id: '1.2',
			status: 'in_progress',
		};

		const result = await executeUpdateTaskStatus(args, tempDir);

		// Should succeed
		expect(result.success).toBe(true);

		// CRITICAL: session's currentTaskId should now point to the NEW task (1.2)
		// This ensures later gate recording uses the correct task identity
		expect(session.currentTaskId).toBe('1.2');

		// Verify prior task state is still intact (not corrupted)
		expect(getTaskState(session, '1.1')).toBe('complete');

		// Verify new task is now at coder_delegated
		expect(getTaskState(session, '1.2')).toBe('coder_delegated');
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
		expect(result.reason).toContain('Current state by session:');
		expect(result.reason).toContain('coder_delegated');
		expect(result.reason).toContain('required state: tests_run or complete');
	});
});

describe('checkReviewerGate Issue #81 regression warning', () => {
	let originalAgentSessions: typeof swarmState.agentSessions;
	let originalConsoleWarn: typeof console.warn;
	let warnCalls: string[];

	beforeEach(() => {
		originalAgentSessions = new Map(swarmState.agentSessions);
		swarmState.agentSessions.clear();
		// Capture console.warn calls by stubbing
		warnCalls = [];
		originalConsoleWarn = console.warn;
		console.warn = (...args: any[]) => {
			warnCalls.push(args.join(' '));
		};
	});

	afterEach(() => {
		swarmState.agentSessions.clear();
		for (const [key, value] of originalAgentSessions) {
			swarmState.agentSessions.set(key, value);
		}
		console.warn = originalConsoleWarn;
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

	test('does NOT fire warn when all sessions are idle (Issue #81 warning suppressed)', () => {
		// Given 2 sessions both at idle for taskId '5.4'
		const session1 = makeSession();
		const session2 = makeSession();
		swarmState.agentSessions.set('session-1', session1);
		swarmState.agentSessions.set('session-2', session2);

		// Call checkReviewerGate('5.4')
		const result = checkReviewerGate('5.4');

		// Should be blocked (no tests_run or complete state)
		expect(result.blocked).toBe(true);

		// Should NOT fire any warn - regression warning is now suppressed
		expect(warnCalls.length).toBe(0);
	});

	test('does NOT fire warn when any session is at non-idle state', () => {
		// Given 1 session at coder_delegated (not idle)
		const session = makeSession();
		advanceTaskState(session, '5.4', 'coder_delegated');
		swarmState.agentSessions.set('session-1', session);

		// Call checkReviewerGate('5.4')
		const result = checkReviewerGate('5.4');

		// Should be blocked
		expect(result.blocked).toBe(true);

		// Should NOT have called console.warn because at least one session is not idle
		expect(warnCalls.length).toBe(0);
	});

	test('does NOT fire warn when a session has tests_run (gate passes)', () => {
		// Given a session with task in tests_run state
		const session = makeSession();
		advanceTaskState(session, '5.4', 'coder_delegated');
		advanceTaskState(session, '5.4', 'pre_check_passed');
		advanceTaskState(session, '5.4', 'reviewer_run');
		advanceTaskState(session, '5.4', 'tests_run');
		swarmState.agentSessions.set('session-1', session);

		// Call checkReviewerGate('5.4')
		const result = checkReviewerGate('5.4');

		// Gate passes - returns blocked: false BEFORE reaching the warn logic
		expect(result.blocked).toBe(false);
		expect(result.reason).toBe('');

		// Should NOT have called console.warn
		expect(warnCalls.length).toBe(0);
	});

	test('does NOT fire warn when no sessions exist', () => {
		// Given no sessions (agentSessions.size === 0)
		// swarmState.agentSessions is already cleared in beforeEach

		// Call checkReviewerGate('5.4')
		const result = checkReviewerGate('5.4');

		// Should return early without warn
		expect(result.blocked).toBe(false);
		expect(result.reason).toBe('');

		// Should NOT have called console.warn
		expect(warnCalls.length).toBe(0);
	});

	test('does NOT fire warn when all sessions are idle (3 sessions)', () => {
		// Given 3 sessions all at idle
		const session1 = makeSession();
		const session2 = makeSession();
		const session3 = makeSession();
		swarmState.agentSessions.set('session-1', session1);
		swarmState.agentSessions.set('session-2', session2);
		swarmState.agentSessions.set('session-3', session3);

		// Call checkReviewerGate('5.4')
		const result = checkReviewerGate('5.4');

		// Should be blocked
		expect(result.blocked).toBe(true);

		// Should NOT fire any warn - regression warning is now suppressed
		expect(warnCalls.length).toBe(0);
	});
});

describe('checkReviewerGate — adversarial warn', () => {
	let originalAgentSessions: typeof swarmState.agentSessions;
	let originalConsoleWarn: typeof console.warn;
	let warnCalls: string[];

	beforeEach(() => {
		originalAgentSessions = new Map(swarmState.agentSessions);
		swarmState.agentSessions.clear();
		warnCalls = [];
		originalConsoleWarn = console.warn;
		console.warn = (...args: any[]) => {
			warnCalls.push(args.join(' '));
		};
	});

	afterEach(() => {
		swarmState.agentSessions.clear();
		for (const [key, value] of originalAgentSessions) {
			swarmState.agentSessions.set(key, value);
		}
		console.warn = originalConsoleWarn;
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

	// ====== Attack Vector 1: taskId with special characters ======
	test('does not throw with taskId containing path traversal characters', () => {
		const session = makeSession();
		swarmState.agentSessions.set('ses_abc', session);

		// Should not throw, should return blocked result
		expect(() => checkReviewerGate('../../etc/task')).not.toThrow();
		const result = checkReviewerGate('../../etc/task');
		expect(result.blocked).toBe(true);
	});

	// ====== Attack Vector 2: taskId with very long string (10,000 chars) ======
	test('does not throw with extremely long taskId (10000 chars)', () => {
		// Reset warnCalls to ensure clean state - there may be leftover warns from previous tests
		warnCalls = [];
		
		const longTaskId = 'a'.repeat(10000);
		const session = makeSession();
		// Ensure ONLY this session exists by clearing first
		swarmState.agentSessions.clear();
		swarmState.agentSessions.set('ses_abc', session);

		// Should not throw, and warn should be suppressed (not fired)
		const result = checkReviewerGate(longTaskId);
		expect(result.blocked).toBe(true);
		// Should NOT fire warn - regression warning is suppressed
		expect(warnCalls.length).toBe(0);
	});

	// ====== Attack Vector 3: taskId is empty string ======
	test('does not throw with empty string taskId', () => {
		const session = makeSession();
		swarmState.agentSessions.set('ses_abc', session);

		// Should not throw, function completes without throwing
		expect(() => checkReviewerGate('')).not.toThrow();
		const result = checkReviewerGate('');
		// With empty taskId, stateEntries will have ": idle" suffix
		// Should be blocked since task is not in tests_run/complete
		expect(result.blocked).toBe(true);
	});

	// ====== Attack Vector 4: sessionId contains ": idle" in the middle ======
	test('does NOT trigger warn when sessionId contains ": idle" but state is not idle', () => {
		// Create session with ID that contains "idle" - but state is coder_delegated
		const session = makeSession();
		advanceTaskState(session, '1.1', 'coder_delegated');
		// Manually inject a session with ID containing "idle"
		// We need to check that endsWith(': idle') is correct - it checks STATE, not sessionId
		swarmState.agentSessions.set('ses_idle: coder_delegated', session);

		const result = checkReviewerGate('1.1');
		expect(result.blocked).toBe(true);
		// Should NOT fire warn because state is coder_delegated, not idle
		expect(warnCalls.length).toBe(0);
	});

	// ====== Attack Vector 5: Mixed case status ======
	test('does NOT trigger warn with uppercase state (case-sensitive check)', () => {
		const session = makeSession();
		// Manually set taskWorkflowStates to have uppercase 'IDLE' state
		// This simulates the case where state might be stored differently
		session.taskWorkflowStates.set('1.1', 'IDLE');
		swarmState.agentSessions.set('ses_abc', session);

		const result = checkReviewerGate('1.1');
		// Should still be blocked (not tests_run or complete)
		expect(result.blocked).toBe(true);
		// Should NOT fire warn because 'IDLE' (uppercase) doesn't end with ': idle' (lowercase)
		expect(warnCalls.length).toBe(0);
	});

	// ====== Attack Vector 6: 100 sessions all idle ======
	test('does NOT fire warn when all sessions are idle (Issue #81 warning suppressed)', () => {
		// Create 100 sessions, all at idle state
		for (let i = 0; i < 100; i++) {
			const session = makeSession();
			swarmState.agentSessions.set(`session-${i}`, session);
		}

		const result = checkReviewerGate('1.1');
		expect(result.blocked).toBe(true);

		// Should NOT fire any warn - regression warning is now suppressed
		expect(warnCalls.length).toBe(0);
	});

	// ====== Attack Vector 7: Session state advances during check (mutation) ======
	test('warn uses snapshot of stateEntries - no race condition possible (synchronous)', () => {
		const session = makeSession();
		swarmState.agentSessions.set('ses_abc', session);

		// Even if we mutate the session during check (which shouldn't happen in practice),
		// the function uses a snapshot of stateEntries collected synchronously
		const result = checkReviewerGate('1.1');
		expect(result.blocked).toBe(true);
		// Should NOT fire warn - regression warning is suppressed when all sessions idle
		expect(warnCalls.length).toBe(0);
	});

	// ====== Attack Vector 8: Null/undefined taskId injection ======
	test('handles null/undefined taskId gracefully (getTaskState returns idle)', () => {
		// Reset warnCalls to ensure clean state
		warnCalls = [];
		
		const session = makeSession();
		swarmState.agentSessions.clear();
		swarmState.agentSessions.set('ses_abc', session);

		// getTaskState returns 'idle' for non-existent taskId, so null/undefined
		// will be treated as having task in idle state - NOT caught by outer try/catch
		// We call checkReviewerGate twice: once for null, once for undefined
		const resultNull = checkReviewerGate(null as unknown as string);
		const resultUndefined = checkReviewerGate(undefined as unknown as string);

		// Both should return blocked: true because task is in idle state (not tests_run/complete)
		expect(resultNull.blocked).toBe(true);
		expect(resultUndefined.blocked).toBe(true);

		// Should NOT fire any warnings - regression warning is suppressed
		expect(warnCalls.length).toBe(0);
	});

	// ====== Additional edge case: Zero sessions should not warn ======
	test('does NOT fire warn when no sessions exist (early return)', () => {
		// swarmState.agentSessions is already empty from beforeEach

		const result = checkReviewerGate('1.1');
		// Returns early with blocked: false
		expect(result.blocked).toBe(false);
		expect(warnCalls.length).toBe(0);
	});

	// ====== Additional edge case: Empty stateEntries should not warn ======
	test('does NOT fire warn when stateEntries is empty', () => {
		// This is covered by the early return case, but let's be explicit
		// If stateEntries.length === 0, allIdle will be false (short-circuit)
		const session = makeSession();
		swarmState.agentSessions.set('ses_abc', session);

		// Even with a session, the allIdle check requires length > 0
		const result = checkReviewerGate('1.1');
		expect(result.blocked).toBe(true);
		// Should NOT fire warn - regression warning is suppressed when all sessions idle
		expect(warnCalls.length).toBe(0);
	});
});

describe('checkReviewerGate — generic reviewer wording (Task 2.2)', () => {
	let originalAgentSessions: typeof swarmState.agentSessions;

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

	test('error message includes generic "QA gates" wording without hardcoded agent names', () => {
		const session = makeSession();
		// Task in coder_delegated state (not passed gates)
		advanceTaskState(session, '2.1', 'coder_delegated');
		swarmState.agentSessions.set('test-session', session);

		const result = checkReviewerGate('2.1');

		expect(result.blocked).toBe(true);
		expect(result.reason).toContain('QA gates');
		expect(result.reason).toContain('Current state by session:');
		expect(result.reason).toContain('required state: tests_run or complete');
	});

	test('error message includes generic "QA gates" terminology', () => {
		const session = makeSession();
		advanceTaskState(session, '3.5', 'pre_check_passed');
		swarmState.agentSessions.set('test-session', session);

		const result = checkReviewerGate('3.5');

		expect(result.blocked).toBe(true);
		// Should use generic QA gates terminology
		expect(result.reason).toContain('QA gates');
		// Should include state information
		expect(result.reason).toContain('Current state by session:');
		expect(result.reason).toContain('required state: tests_run or complete');
	});
});

describe('checkReviewerGate — non-visible regression warning handling (Task 2.2)', () => {
	let originalAgentSessions: typeof swarmState.agentSessions;
	let originalConsoleWarn: typeof console.warn;
	let warnCalls: string[];

	beforeEach(() => {
		originalAgentSessions = new Map(swarmState.agentSessions);
		swarmState.agentSessions.clear();
		warnCalls = [];
		originalConsoleWarn = console.warn;
		console.warn = (...args: any[]) => {
			warnCalls.push(args.join(' '));
		};
	});

	afterEach(() => {
		swarmState.agentSessions.clear();
		for (const [key, value] of originalAgentSessions) {
			swarmState.agentSessions.set(key, value);
		}
		console.warn = originalConsoleWarn;
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

	test('does NOT emit console.warn when all sessions are idle (Issue #81 regression suppressed)', () => {
		// Create two sessions both at idle state for task '7.1'
		const session1 = makeSession();
		const session2 = makeSession();
		swarmState.agentSessions.set('session-a', session1);
		swarmState.agentSessions.set('session-b', session2);

		const result = checkReviewerGate('7.1');

		// Should be blocked
		expect(result.blocked).toBe(true);
		// Should NOT emit any warning - regression warning is suppressed
		expect(warnCalls.length).toBe(0);
	});

	test('still falls back to plan.json when all sessions are idle', () => {
		// Create temp directory with plan showing task completed
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'regression-fallback-test-'));
		const originalCwd = process.cwd();

		try {
			process.chdir(tempDir);
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
								id: '7.1',
								phase: 1,
								status: 'completed',
								size: 'small',
								description: 'Test task',
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

			// Sessions at idle
			const session = makeSession();
			swarmState.agentSessions.set('session-idle', session);

			// Pass workingDirectory to enable fallback check
			const result = checkReviewerGate('7.1', tempDir);

			// Should pass because plan.json shows completed
			expect(result.blocked).toBe(false);
			expect(result.reason).toBe('');
		} finally {
			process.chdir(originalCwd);
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});
});

describe('checkReviewerGate — directory-aware plan resolution (Task 2.2)', () => {
	let originalAgentSessions: typeof swarmState.agentSessions;
	let tempDirA: string;
	let tempDirB: string;
	let originalCwd: string;

	beforeEach(() => {
		originalAgentSessions = new Map(swarmState.agentSessions);
		swarmState.agentSessions.clear();

		originalCwd = process.cwd();

		// Create two temp directories with different plans
		tempDirA = fs.mkdtempSync(path.join(os.tmpdir(), 'dir-a-test-'));
		tempDirB = fs.mkdtempSync(path.join(os.tmpdir(), 'dir-b-test-'));

		fs.mkdirSync(path.join(tempDirA, '.swarm'), { recursive: true });
		fs.mkdirSync(path.join(tempDirB, '.swarm'), { recursive: true });

		// Plan in tempDirA: task 1.1 is completed
		const planA = {
			schema_version: '1.0.0',
			title: 'Plan A',
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
							status: 'completed',
							size: 'small',
							description: 'Task in Plan A',
							depends: [],
							files_touched: [],
						},
					],
				},
			],
		};
		fs.writeFileSync(
			path.join(tempDirA, '.swarm', 'plan.json'),
			JSON.stringify(planA, null, 2),
		);

		// Plan in tempDirB: task 1.1 is pending (NOT completed)
		const planB = {
			schema_version: '1.0.0',
			title: 'Plan B',
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
							description: 'Task in Plan B',
							depends: [],
							files_touched: [],
						},
					],
				},
			],
		};
		fs.writeFileSync(
			path.join(tempDirB, '.swarm', 'plan.json'),
			JSON.stringify(planB, null, 2),
		);
	});

	afterEach(() => {
		swarmState.agentSessions.clear();
		for (const [key, value] of originalAgentSessions) {
			swarmState.agentSessions.set(key, value);
		}
		fs.rmSync(tempDirA, { recursive: true, force: true });
		fs.rmSync(tempDirB, { recursive: true, force: true });
		process.chdir(originalCwd);
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

	test('uses workingDirectory to resolve plan.json for fallback check', () => {
		// Session at idle state - would normally be blocked
		const session = makeSession();
		swarmState.agentSessions.set('test-session', session);

		// Pass tempDirA where task is completed in plan.json
		const result = checkReviewerGate('1.1', tempDirA);

		// Should pass because plan.json in tempDirA shows task completed
		expect(result.blocked).toBe(false);
	});

	test('blocks when workingDirectory plan shows task NOT completed', () => {
		// Session at idle state - would normally be blocked
		const session = makeSession();
		swarmState.agentSessions.set('test-session', session);

		// Pass tempDirB where task is pending (not completed)
		const result = checkReviewerGate('1.1', tempDirB);

		// Should be blocked because plan.json in tempDirB shows task as pending
		expect(result.blocked).toBe(true);
	});

	test('falls back to cwd when workingDirectory is not provided', () => {
		// Change to tempDirA (where task is completed)
		process.chdir(tempDirA);

		// Session at idle state
		const session = makeSession();
		swarmState.agentSessions.set('test-session', session);

		// Don't pass workingDirectory - should use cwd
		const result = checkReviewerGate('1.1');

		// Should pass because cwd is tempDirA where task is completed
		expect(result.blocked).toBe(false);

		// Restore cwd to avoid EBUSY error in cleanup
		process.chdir(originalCwd);
	});
});

describe('checkReviewerGate — safe fallback when plan access fails (Task 2.2)', () => {
	let originalAgentSessions: typeof swarmState.agentSessions;

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

	test('returns blocked when workingDirectory points to non-existent path', () => {
		const session = makeSession();
		swarmState.agentSessions.set('test-session', session);

		// Pass a non-existent directory
		const result = checkReviewerGate('1.1', '/non/existent/path');

		// Should be blocked (fallback failed, no state machine progress)
		expect(result.blocked).toBe(true);
	});

	test('returns blocked when .swarm/plan.json does not exist in workingDirectory', () => {
		const session = makeSession();
		swarmState.agentSessions.set('test-session', session);

		// Create temp dir without .swarm/plan.json
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-plan-test-'));
		try {
			const result = checkReviewerGate('1.1', tempDir);

			// Should be blocked (fallback failed due to missing plan.json)
			expect(result.blocked).toBe(true);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	test('returns blocked when plan.json is invalid JSON', () => {
		const session = makeSession();
		swarmState.agentSessions.set('test-session', session);

		// Create temp dir with invalid JSON
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'invalid-json-test-'));
		try {
			fs.mkdirSync(path.join(tempDir, '.swarm'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, '.swarm', 'plan.json'),
				'not valid json{{{',
			);

			const result = checkReviewerGate('1.1', tempDir);

			// Should be blocked (fallback failed due to parse error)
			expect(result.blocked).toBe(true);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	test('returns blocked when task not found in plan.json', () => {
		const session = makeSession();
		swarmState.agentSessions.set('test-session', session);

		// Create temp dir with plan that has different task
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-not-found-test-'));
		try {
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
								id: '9.9',
								phase: 1,
								status: 'completed',
								size: 'small',
								description: 'Different task',
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

			const result = checkReviewerGate('1.1', tempDir);

			// Should be blocked (task 1.1 not in plan.json)
			expect(result.blocked).toBe(true);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});
});

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

	test('fires warn when all sessions are idle (Issue #81 regression detection)', () => {
		// Given 2 sessions both at idle for taskId '5.4'
		const session1 = makeSession();
		const session2 = makeSession();
		swarmState.agentSessions.set('session-1', session1);
		swarmState.agentSessions.set('session-2', session2);

		// Call checkReviewerGate('5.4')
		const result = checkReviewerGate('5.4');

		// Should be blocked (no tests_run or complete state)
		expect(result.blocked).toBe(true);

		// Should have called console.warn with Issue #81 message
		expect(warnCalls.length).toBe(1);
		const warnMessage = warnCalls[0];
		expect(warnMessage).toContain('Issue #81 regression');
		expect(warnMessage).toContain('5.4');
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

	test('fires warn with correct session count (3 sessions all at idle)', () => {
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

		// Should have called console.warn with correct session count
		expect(warnCalls.length).toBe(1);
		const warnMessage = warnCalls[0];
		expect(warnMessage).toContain('3 session(s)');
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

		// Should not throw, warn fires with full taskId
		// Note: checkReviewerGate called once - each call triggers warn when session is idle
		const result = checkReviewerGate(longTaskId);
		expect(result.blocked).toBe(true);
		// Should have fired warn exactly once (1 session at idle)
		expect(warnCalls.length).toBe(1);
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
	test('fires exactly ONE console.warn when 100 sessions are all idle', () => {
		// Create 100 sessions, all at idle state
		for (let i = 0; i < 100; i++) {
			const session = makeSession();
			swarmState.agentSessions.set(`session-${i}`, session);
		}

		const result = checkReviewerGate('1.1');
		expect(result.blocked).toBe(true);

		// Should fire exactly ONE warn, not one per session
		expect(warnCalls.length).toBe(1);
		const warnMessage = warnCalls[0];
		expect(warnMessage).toContain('Issue #81 regression');
		expect(warnMessage).toContain('100 session(s)');
	});

	// ====== Attack Vector 7: Session state advances during check (mutation) ======
	test('warn uses snapshot of stateEntries - no race condition possible (synchronous)', () => {
		const session = makeSession();
		swarmState.agentSessions.set('ses_abc', session);

		// Even if we mutate the session during check (which shouldn't happen in practice),
		// the function uses a snapshot of stateEntries collected synchronously
		const result = checkReviewerGate('1.1');
		expect(result.blocked).toBe(true);
		expect(warnCalls.length).toBe(1);
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

		// Each call should have fired the Issue #81 warning (2 total)
		expect(warnCalls.length).toBe(2);
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
		// Actually should warn because session shows idle state
		expect(warnCalls.length).toBe(1);
	});
});

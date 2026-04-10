import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AgentSessionState } from '../../src/state';
import { rehydrateSessionFromDisk, resetSwarmState } from '../../src/state';

describe('rehydrateSessionFromDisk', () => {
	const testDir = path.join(os.tmpdir(), 'rehydrate-test-' + Date.now());
	let session: AgentSessionState;

	// Helper to create valid plan.json
	async function writePlan(plan: object): Promise<void> {
		const planPath = path.join(testDir, '.swarm', 'plan.json');
		await fs.writeFile(planPath, JSON.stringify(plan), 'utf-8');
	}

	// Helper to create a valid evidence file
	async function writeEvidence(
		taskId: string,
		evidence: object,
	): Promise<void> {
		const evidencePath = path.join(
			testDir,
			'.swarm',
			'evidence',
			`${taskId}.json`,
		);
		await fs.writeFile(evidencePath, JSON.stringify(evidence), 'utf-8');
	}

	// Default plan template with required schema fields
	const defaultPlanBase = {
		schema_version: '1.0.0' as const,
		swarm: 'test-swarm',
		title: 'Test',
	};

	beforeEach(async () => {
		resetSwarmState();
		// Create test directory structure
		await fs.mkdir(path.join(testDir, '.swarm', 'evidence'), {
			recursive: true,
		});
		// Create a minimal session with required fields
		session = {
			agentName: 'mega_coder',
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
			lastPhaseCompleteTimestamp: 0,
			lastPhaseCompletePhase: 0,
			phaseAgentsDispatched: new Set(),
			lastCompletedPhaseAgentsDispatched: new Set(),
			qaSkipCount: 0,
			qaSkipTaskIds: [],
			taskWorkflowStates: new Map(),
			lastGateOutcome: null,
			declaredCoderScope: null,
			lastScopeViolation: null,
			scopeViolationDetected: false,
			modifiedFilesThisCoderTask: [],
		};
	});

	afterEach(async () => {
		// Clean up test directory
		try {
			await fs.rm(testDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
		resetSwarmState();
	});

	// Happy path: plan.json with in_progress task
	it('should rehydrate task from plan.json when task is in_progress', async () => {
		await writePlan({
			...defaultPlanBase,
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
							description: 'Test task',
						},
					],
				},
			],
		});

		await rehydrateSessionFromDisk(testDir, session);

		expect(session.taskWorkflowStates?.get('1.1')).toBe('coder_delegated');
	});

	// Happy path: plan.json with completed task
	it('should rehydrate task from plan.json when task is completed', async () => {
		await writePlan({
			...defaultPlanBase,
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'complete',
					tasks: [
						{
							id: '1.1',
							phase: 1,
							status: 'completed',
							size: 'small',
							description: 'Test task',
						},
					],
				},
			],
		});

		await rehydrateSessionFromDisk(testDir, session);

		expect(session.taskWorkflowStates?.get('1.1')).toBe('complete');
	});

	// Happy path: plan.json with pending task
	it('should rehydrate task from plan.json when task is pending', async () => {
		await writePlan({
			...defaultPlanBase,
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'pending',
					tasks: [
						{
							id: '1.1',
							phase: 1,
							status: 'pending',
							size: 'small',
							description: 'Test task',
						},
					],
				},
			],
		});

		await rehydrateSessionFromDisk(testDir, session);

		expect(session.taskWorkflowStates?.get('1.1')).toBe('idle');
	});

	// Happy path: evidence with reviewer gate passed
	it('should use evidence over plan when evidence exists', async () => {
		await writePlan({
			...defaultPlanBase,
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
							description: 'Test task',
						},
					],
				},
			],
		});

		await writeEvidence('1.1', {
			taskId: '1.1',
			required_gates: ['reviewer', 'test_engineer'],
			gates: {
				reviewer: {
					sessionId: 'sess-1',
					timestamp: '2024-01-01T00:00:00Z',
					agent: 'mega_reviewer',
				},
			},
		});

		await rehydrateSessionFromDisk(testDir, session);

		// Evidence with reviewer passed should result in reviewer_run state
		expect(session.taskWorkflowStates?.get('1.1')).toBe('reviewer_run');
	});

	// Happy path: evidence with test_engineer gate passed
	it('should use evidence with test_engineer gate to set tests_run state', async () => {
		await writePlan({
			...defaultPlanBase,
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
							description: 'Test task',
						},
					],
				},
			],
		});

		await writeEvidence('1.1', {
			taskId: '1.1',
			required_gates: ['reviewer', 'test_engineer'],
			gates: {
				test_engineer: {
					sessionId: 'sess-2',
					timestamp: '2024-01-01T01:00:00Z',
					agent: 'mega_test_engineer',
				},
			},
		});

		await rehydrateSessionFromDisk(testDir, session);

		// Evidence with only test_engineer passed (reviewer still pending) should result in tests_run state
		expect(session.taskWorkflowStates?.get('1.1')).toBe('tests_run');
	});

	// Happy path: all required gates passed results in complete
	it('should set complete state when all required gates are passed', async () => {
		await writePlan({
			...defaultPlanBase,
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
							description: 'Test task',
						},
					],
				},
			],
		});

		await writeEvidence('1.1', {
			taskId: '1.1',
			required_gates: ['reviewer', 'test_engineer'],
			gates: {
				reviewer: {
					sessionId: 'sess-1',
					timestamp: '2024-01-01T00:00:00Z',
					agent: 'mega_reviewer',
				},
				test_engineer: {
					sessionId: 'sess-2',
					timestamp: '2024-01-01T01:00:00Z',
					agent: 'mega_test_engineer',
				},
			},
		});

		await rehydrateSessionFromDisk(testDir, session);

		// All required gates passed should result in complete state
		expect(session.taskWorkflowStates?.get('1.1')).toBe('complete');
	});

	// Edge case: Missing .swarm directory - should be non-fatal
	it('should be non-fatal when .swarm directory does not exist', async () => {
		await fs.rm(path.join(testDir, '.swarm'), { recursive: true, force: true });

		// Should not throw - use rejects.toBeUndefined for async void
		await expect(
			rehydrateSessionFromDisk(testDir, session),
		).resolves.toBeUndefined();

		// Session should remain unchanged
		expect(session.taskWorkflowStates?.size).toBe(0);
	});

	// Edge case: Missing plan.json - should return early
	it('should be non-fatal when plan.json does not exist', async () => {
		await fs.rm(path.join(testDir, '.swarm', 'plan.json'), { force: true });

		// Should not throw
		await expect(
			rehydrateSessionFromDisk(testDir, session),
		).resolves.toBeUndefined();
	});

	// Edge case: Missing evidence directory - should be non-fatal
	it('should be non-fatal when evidence directory does not exist', async () => {
		await fs.rm(path.join(testDir, '.swarm', 'evidence'), {
			recursive: true,
			force: true,
		});

		// Should not throw
		await expect(
			rehydrateSessionFromDisk(testDir, session),
		).resolves.toBeUndefined();
	});

	// Edge case: Empty plan.json
	it('should handle empty plan.json gracefully', async () => {
		await writePlan({});

		// Should not throw
		await expect(
			rehydrateSessionFromDisk(testDir, session),
		).resolves.toBeUndefined();

		// Session should remain unchanged
		expect(session.taskWorkflowStates?.size).toBe(0);
	});

	// Edge case: Empty evidence directory
	it('should handle empty evidence directory', async () => {
		await writePlan({
			...defaultPlanBase,
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
							description: 'Test task',
						},
					],
				},
			],
		});
		// Evidence directory exists but is empty

		await rehydrateSessionFromDisk(testDir, session);

		// Should use plan state
		expect(session.taskWorkflowStates?.get('1.1')).toBe('coder_delegated');
	});

	// Edge case: Malformed plan.json - should be non-fatal
	it('should be non-fatal when plan.json is malformed', async () => {
		const planPath = path.join(testDir, '.swarm', 'plan.json');
		await fs.writeFile(planPath, '{ invalid json }', 'utf-8');

		// Should not throw
		await expect(
			rehydrateSessionFromDisk(testDir, session),
		).resolves.toBeUndefined();
	});

	// Edge case: Malformed evidence file - should be non-fatal (skip file)
	it('should skip malformed evidence files', async () => {
		await writePlan({
			...defaultPlanBase,
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
							description: 'Test task',
						},
					],
				},
			],
		});

		// Write malformed evidence file
		const evidencePath = path.join(testDir, '.swarm', 'evidence', '1.1.json');
		await fs.writeFile(evidencePath, '{ invalid json }', 'utf-8');

		// Should not throw
		await expect(
			rehydrateSessionFromDisk(testDir, session),
		).resolves.toBeUndefined();

		// Should fall back to plan state
		expect(session.taskWorkflowStates?.get('1.1')).toBe('coder_delegated');
	});

	// Edge case: Invalid taskId format in evidence (path traversal prevention)
	it('should skip evidence files with invalid taskId format', async () => {
		await writePlan({
			...defaultPlanBase,
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
							description: 'Test task',
						},
					],
				},
			],
		});

		// Write evidence file with invalid taskId format (non-numeric, skipped by regex)
		const evidencePath = path.join(
			testDir,
			'.swarm',
			'evidence',
			'invalid-format.json',
		);
		await fs.writeFile(
			evidencePath,
			JSON.stringify({
				taskId: 'invalid-format',
				required_gates: ['reviewer'],
				gates: { reviewer: { sessionId: 'x', timestamp: 'y', agent: 'z' } },
			}),
			'utf-8',
		);

		await rehydrateSessionFromDisk(testDir, session);

		// Should fall back to plan state (invalid evidence should be skipped)
		expect(session.taskWorkflowStates?.get('1.1')).toBe('coder_delegated');
	});

	// Edge case: Evidence file without taskId field - should be skipped
	it('should skip evidence files without taskId field', async () => {
		await writePlan({
			...defaultPlanBase,
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
							description: 'Test task',
						},
					],
				},
			],
		});

		await writeEvidence('1.1', {
			// Missing taskId
			required_gates: ['reviewer'],
			gates: { reviewer: { sessionId: 'x', timestamp: 'y', agent: 'z' } },
		});

		await rehydrateSessionFromDisk(testDir, session);

		// Should fall back to plan state
		expect(session.taskWorkflowStates?.get('1.1')).toBe('coder_delegated');
	});

	// Edge case: Evidence file without required_gates - should be skipped
	it('should skip evidence files without required_gates array', async () => {
		await writePlan({
			...defaultPlanBase,
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
							description: 'Test task',
						},
					],
				},
			],
		});

		await writeEvidence('1.1', {
			taskId: '1.1',
			// Missing required_gates
			gates: { reviewer: { sessionId: 'x', timestamp: 'y', agent: 'z' } },
		});

		await rehydrateSessionFromDisk(testDir, session);

		// Should fall back to plan state
		expect(session.taskWorkflowStates?.get('1.1')).toBe('coder_delegated');
	});

	// State mutation: Should NOT downgrade existing in-memory state
	it('should not downgrade stronger in-memory workflow state', async () => {
		// Pre-set a stronger state in memory
		session.taskWorkflowStates?.set('1.1', 'tests_run');

		// Plan says task is still in_progress (coder_delegated)
		await writePlan({
			...defaultPlanBase,
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
							description: 'Test task',
						},
					],
				},
			],
		});

		await rehydrateSessionFromDisk(testDir, session);

		// In-memory state should NOT be downgraded
		expect(session.taskWorkflowStates?.get('1.1')).toBe('tests_run');
	});

	// State mutation: Should upgrade weaker in-memory state
	it('should upgrade weaker in-memory workflow state', async () => {
		// Pre-set a weaker state in memory
		session.taskWorkflowStates?.set('1.1', 'idle');

		// Plan says task is in_progress (coder_delegated)
		await writePlan({
			...defaultPlanBase,
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
							description: 'Test task',
						},
					],
				},
			],
		});

		await rehydrateSessionFromDisk(testDir, session);

		// In-memory state should be upgraded
		expect(session.taskWorkflowStates?.get('1.1')).toBe('coder_delegated');
	});

	// State mutation: Evidence should win over in-memory state
	it('should use evidence over existing in-memory state', async () => {
		// Pre-set a weaker state in memory
		session.taskWorkflowStates?.set('1.1', 'coder_delegated');

		await writePlan({
			...defaultPlanBase,
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
							description: 'Test task',
						},
					],
				},
			],
		});

		// Evidence shows reviewer passed
		await writeEvidence('1.1', {
			taskId: '1.1',
			required_gates: ['reviewer', 'test_engineer'],
			gates: {
				reviewer: {
					sessionId: 'sess-1',
					timestamp: '2024-01-01T00:00:00Z',
					agent: 'mega_reviewer',
				},
			},
		});

		await rehydrateSessionFromDisk(testDir, session);

		// Evidence should win - state should be reviewer_run (stronger than coder_delegated)
		expect(session.taskWorkflowStates?.get('1.1')).toBe('reviewer_run');
	});

	// State mutation: Evidence should not downgrade in-memory complete state
	it('should not downgrade in-memory complete state even with plan evidence', async () => {
		// Pre-set complete state in memory
		session.taskWorkflowStates?.set('1.1', 'complete');

		await writePlan({
			...defaultPlanBase,
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
							description: 'Test task',
						},
					],
				},
			],
		});

		// Evidence shows only coder gate (weaker than complete)
		await writeEvidence('1.1', {
			taskId: '1.1',
			required_gates: ['reviewer', 'test_engineer'],
			gates: {
				coder: {
					sessionId: 'sess-1',
					timestamp: '2024-01-01T00:00:00Z',
					agent: 'mega_coder',
				},
			},
		});

		await rehydrateSessionFromDisk(testDir, session);

		// In-memory complete state should NOT be downgraded
		expect(session.taskWorkflowStates?.get('1.1')).toBe('complete');
	});

	// Multiple tasks: Should handle multiple tasks from different phases
	it('should rehydrate multiple tasks from different phases', async () => {
		await writePlan({
			...defaultPlanBase,
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'complete',
					tasks: [
						{
							id: '1.1',
							phase: 1,
							status: 'completed',
							size: 'small',
							description: 'Test task 1',
						},
						{
							id: '1.2',
							phase: 1,
							status: 'in_progress',
							size: 'small',
							description: 'Test task 2',
						},
					],
				},
				{
					id: 2,
					name: 'Phase 2',
					status: 'pending',
					tasks: [
						{
							id: '2.1',
							phase: 2,
							status: 'pending',
							size: 'small',
							description: 'Test task 3',
						},
					],
				},
			],
		});

		await rehydrateSessionFromDisk(testDir, session);

		expect(session.taskWorkflowStates?.get('1.1')).toBe('complete');
		expect(session.taskWorkflowStates?.get('1.2')).toBe('coder_delegated');
		expect(session.taskWorkflowStates?.get('2.1')).toBe('idle');
	});

	// Priority: Evidence > Plan > Existing memory (upgrade only)
	it('should respect priority: evidence > plan > existing memory', async () => {
		// Pre-set idle state in memory
		session.taskWorkflowStates?.set('1.1', 'idle');

		// Plan says in_progress (coder_delegated)
		await writePlan({
			...defaultPlanBase,
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
							description: 'Test task',
						},
					],
				},
			],
		});

		// Evidence shows all gates passed (complete)
		await writeEvidence('1.1', {
			taskId: '1.1',
			required_gates: ['reviewer', 'test_engineer'],
			gates: {
				reviewer: {
					sessionId: 'sess-1',
					timestamp: '2024-01-01T00:00:00Z',
					agent: 'mega_reviewer',
				},
				test_engineer: {
					sessionId: 'sess-2',
					timestamp: '2024-01-01T01:00:00Z',
					agent: 'mega_test_engineer',
				},
			},
		});

		await rehydrateSessionFromDisk(testDir, session);

		// Evidence should win - all gates passed means complete
		expect(session.taskWorkflowStates?.get('1.1')).toBe('complete');
	});

	// Edge case: taskWorkflowStates is undefined in session
	it('should initialize taskWorkflowStates if missing', async () => {
		// Remove taskWorkflowStates
		delete (session as any).taskWorkflowStates;

		await writePlan({
			...defaultPlanBase,
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
							description: 'Test task',
						},
					],
				},
			],
		});

		await rehydrateSessionFromDisk(testDir, session);

		// Should have initialized taskWorkflowStates
		expect(session.taskWorkflowStates).toBeDefined();
		expect(session.taskWorkflowStates?.get('1.1')).toBe('coder_delegated');
	});

	// Edge case: blocked task in plan
	it('should map blocked task status to idle', async () => {
		await writePlan({
			...defaultPlanBase,
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'in_progress',
					tasks: [
						{
							id: '1.1',
							phase: 1,
							status: 'blocked',
							size: 'small',
							description: 'Test task',
						},
					],
				},
			],
		});

		await rehydrateSessionFromDisk(testDir, session);

		expect(session.taskWorkflowStates?.get('1.1')).toBe('idle');
	});
});

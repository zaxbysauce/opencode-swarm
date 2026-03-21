import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AgentSessionState, TaskWorkflowState } from './state';
import {
	rehydrateSessionFromDisk,
	resetSwarmState,
	startAgentSession,
	swarmState,
} from './state';

let tmpDir: string;
let testSessionId: string;

beforeEach(() => {
	resetSwarmState();
	tmpDir = mkdtempSync(path.join(os.tmpdir(), 'rehydrate-test-'));
	mkdirSync(path.join(tmpDir, '.swarm', 'evidence'), { recursive: true });
	testSessionId = `test-session-${Date.now()}`;
});

afterEach(() => {
	try {
		rmSync(tmpDir, { recursive: true, force: true });
	} catch {
		/* best effort */
	}
	swarmState.agentSessions.delete(testSessionId);
});

// Helper to create a session and get the actual session from the map
function createTestSession(): AgentSessionState {
	startAgentSession(testSessionId, 'architect');
	const session = swarmState.agentSessions.get(testSessionId);
	if (!session) {
		throw new Error('Failed to create test session');
	}
	return session;
}

// Helper to create plan.json content
function writePlan(
	tasks: Array<{ id: string; status: string }>,
	phases = 1,
): void {
	// Parse phase number from task id (e.g., "1.1" -> phase 1)
	const getPhase = (taskId: string): number => {
		const dotIndex = taskId.indexOf('.');
		return parseInt(taskId.substring(0, dotIndex), 10);
	};

	const plan = {
		schema_version: '1.0.0' as const,
		title: 'Test Plan',
		swarm: 'test',
		phases: Array.from({ length: phases }, (_, pi) => ({
			id: pi + 1,
			name: `Phase ${pi + 1}`,
			status: 'pending' as const,
			tasks: tasks
				.filter((t) => getPhase(t.id) === pi + 1)
				.map((t) => ({
					id: t.id,
					phase: getPhase(t.id),
					description: `Task ${t.id}`,
					status: t.status,
					size: 'small' as const,
					depends: [],
					files_touched: [],
				})),
		})),
	};
	writeFileSync(path.join(tmpDir, '.swarm', 'plan.json'), JSON.stringify(plan));
}

// Helper to create evidence file
function writeEvidence(
	taskId: string,
	gates: Record<string, unknown>,
	required_gates: string[],
): void {
	const evidence = {
		taskId,
		required_gates,
		gates,
	};
	writeFileSync(
		path.join(tmpDir, '.swarm', 'evidence', `${taskId}.json`),
		JSON.stringify(evidence),
	);
}

// State order for comparison
const STATE_ORDER: TaskWorkflowState[] = [
	'idle',
	'coder_delegated',
	'pre_check_passed',
	'reviewer_run',
	'tests_run',
	'complete',
];

function _getStateIndex(state: TaskWorkflowState): number {
	return STATE_ORDER.indexOf(state);
}

describe('rehydrateSessionFromDisk', () => {
	// ── HAPPY PATH ────────────────────────────────────────────────────────────

	it('1. reads plan.json and sets workflow states from plan status', async () => {
		// Arrange: plan with tasks in various states
		writePlan([
			{ id: '1.1', status: 'in_progress' },
			{ id: '1.2', status: 'completed' },
			{ id: '1.3', status: 'pending' },
		]);

		const session = createTestSession();

		// Act
		await rehydrateSessionFromDisk(tmpDir, session);

		// Assert: in_progress -> coder_delegated, completed -> complete, pending -> idle
		expect(session.taskWorkflowStates!.get('1.1')).toBe('coder_delegated');
		expect(session.taskWorkflowStates!.get('1.2')).toBe('complete');
		expect(session.taskWorkflowStates!.get('1.3')).toBe('idle');
	});

	it('2. reads evidence files and sets workflow states from evidence', async () => {
		// Arrange: plan with in_progress, but evidence shows reviewer passed
		writePlan([{ id: '1.1', status: 'in_progress' }]);
		writeEvidence(
			'1.1',
			{ reviewer: { sessionId: 's1', timestamp: 't1', agent: 'reviewer' } },
			['reviewer', 'test_engineer'],
		);

		const session = createTestSession();

		// Act
		await rehydrateSessionFromDisk(tmpDir, session);

		// Assert: evidence should win -> reviewer_run
		expect(session.taskWorkflowStates!.get('1.1')).toBe('reviewer_run');
	});

	// ── EVIDENCE > PLAN PRIORITY ─────────────────────────────────────────────

	it('3. evidence-derived state wins over plan-only state', async () => {
		// Arrange: plan says pending (idle), but evidence shows test_engineer passed
		writePlan([{ id: '1.1', status: 'pending' }]);
		writeEvidence(
			'1.1',
			{
				reviewer: { sessionId: 's1', timestamp: 't1', agent: 'reviewer' },
				test_engineer: {
					sessionId: 's2',
					timestamp: 't2',
					agent: 'test_engineer',
				},
			},
			['reviewer', 'test_engineer'],
		);

		const session = createTestSession();

		// Act
		await rehydrateSessionFromDisk(tmpDir, session);

		// Assert: evidence wins -> complete (all required gates present)
		expect(session.taskWorkflowStates!.get('1.1')).toBe('complete');
	});

	it('4. evidence with all required gates results in complete state', async () => {
		// Arrange: plan says pending, evidence shows all gates passed
		writePlan([{ id: '1.1', status: 'pending' }]);
		writeEvidence(
			'1.1',
			{
				reviewer: { sessionId: 's1', timestamp: 't1', agent: 'reviewer' },
				test_engineer: {
					sessionId: 's2',
					timestamp: 't2',
					agent: 'test_engineer',
				},
			},
			['reviewer', 'test_engineer'],
		);

		const session = createTestSession();

		// Act
		await rehydrateSessionFromDisk(tmpDir, session);

		// Assert: all required gates passed -> complete
		expect(session.taskWorkflowStates!.get('1.1')).toBe('complete');
	});

	// ── NO DOWNGRADE OF IN-MEMORY STATE ───────────────────────────────────────

	it('5. existing in-memory state is NOT downgraded by disk state', async () => {
		// Arrange: plan says pending (idle), but session already has tests_run
		writePlan([{ id: '1.1', status: 'pending' }]);
		// No evidence file

		const session = createTestSession();
		session.taskWorkflowStates!.set('1.1', 'tests_run'); // Already at tests_run

		// Act
		await rehydrateSessionFromDisk(tmpDir, session);

		// Assert: in-memory tests_run should be preserved (not downgraded to idle)
		expect(session.taskWorkflowStates!.get('1.1')).toBe('tests_run');
	});

	it('6. in-memory state is upgraded when disk has higher state', async () => {
		// Arrange: session has coder_delegated, disk has reviewer_run (via evidence)
		writePlan([{ id: '1.1', status: 'in_progress' }]);
		writeEvidence(
			'1.1',
			{ reviewer: { sessionId: 's1', timestamp: 't1', agent: 'reviewer' } },
			['reviewer', 'test_engineer'],
		);

		const session = createTestSession();
		session.taskWorkflowStates!.set('1.1', 'coder_delegated');

		// Act
		await rehydrateSessionFromDisk(tmpDir, session);

		// Assert: should be upgraded to reviewer_run
		expect(session.taskWorkflowStates!.get('1.1')).toBe('reviewer_run');
	});

	it('7. in-memory complete is preserved even if disk shows earlier state', async () => {
		// Arrange: session has complete, disk has coder_delegated
		writePlan([{ id: '1.1', status: 'in_progress' }]); // -> coder_delegated

		const session = createTestSession();
		session.taskWorkflowStates!.set('1.1', 'complete');

		// Act
		await rehydrateSessionFromDisk(tmpDir, session);

		// Assert: complete should be preserved
		expect(session.taskWorkflowStates!.get('1.1')).toBe('complete');
	});

	// ── NON-FATAL ON MISSING/MALFORMED DATA ───────────────────────────────────

	it('8. missing plan.json is non-fatal (no change)', async () => {
		// Arrange: no plan.json
		const session = createTestSession();

		// Act
		await rehydrateSessionFromDisk(tmpDir, session);

		// Assert: no tasks should be added
		expect(session.taskWorkflowStates!.size).toBe(0);
	});

	it('9. missing evidence directory is non-fatal', async () => {
		// Arrange: plan exists, but no evidence dir
		rmSync(path.join(tmpDir, '.swarm', 'evidence'), { recursive: true });
		writePlan([{ id: '1.1', status: 'in_progress' }]);

		const session = createTestSession();

		// Act
		await rehydrateSessionFromDisk(tmpDir, session);

		// Assert: should use plan state
		expect(session.taskWorkflowStates!.get('1.1')).toBe('coder_delegated');
	});

	it('10. malformed plan.json is non-fatal', async () => {
		// Arrange: invalid JSON
		writeFileSync(path.join(tmpDir, '.swarm', 'plan.json'), 'invalid json{{{');

		const session = createTestSession();

		// Act
		await rehydrateSessionFromDisk(tmpDir, session);

		// Assert: no tasks should be added
		expect(session.taskWorkflowStates!.size).toBe(0);
	});

	it('11. malformed evidence file is skipped (non-fatal)', async () => {
		// Arrange: valid plan, malformed evidence file
		writePlan([{ id: '1.1', status: 'in_progress' }]);
		writeFileSync(
			path.join(tmpDir, '.swarm', 'evidence', '1.1.json'),
			'not valid json{{{',
		);

		const session = createTestSession();

		// Act
		await rehydrateSessionFromDisk(tmpDir, session);

		// Assert: should fall back to plan state
		expect(session.taskWorkflowStates!.get('1.1')).toBe('coder_delegated');
	});

	it('12. evidence file without required_gates is skipped', async () => {
		// Arrange: evidence missing required_gates field
		writePlan([{ id: '1.1', status: 'in_progress' }]);
		writeFileSync(
			path.join(tmpDir, '.swarm', 'evidence', '1.1.json'),
			JSON.stringify({ taskId: '1.1', gates: {} }),
		);

		const session = createTestSession();

		// Act
		await rehydrateSessionFromDisk(tmpDir, session);

		// Assert: should fall back to plan state
		expect(session.taskWorkflowStates!.get('1.1')).toBe('coder_delegated');
	});

	it('13. evidence file with invalid taskId format is skipped', async () => {
		// Arrange: evidence file with invalid taskId (should not match /^\d+\.\d+(\.\d+)*$/)
		writePlan([{ id: '1.1', status: 'in_progress' }]);
		writeFileSync(
			path.join(tmpDir, '.swarm', 'evidence', 'invalid-task.json'),
			JSON.stringify({ taskId: 'invalid', required_gates: [], gates: {} }),
		);

		const session = createTestSession();

		// Act
		await rehydrateSessionFromDisk(tmpDir, session);

		// Assert: should use plan state for 1.1
		expect(session.taskWorkflowStates!.get('1.1')).toBe('coder_delegated');
	});

	// ── EDGE CASES ─────────────────────────────────────────────────────────────

	it('14. multiple phases with multiple tasks are all processed', async () => {
		// Arrange: 2 phases, multiple tasks
		writePlan(
			[
				{ id: '1.1', status: 'in_progress' },
				{ id: '1.2', status: 'completed' },
				{ id: '2.1', status: 'pending' },
				{ id: '2.2', status: 'in_progress' },
			],
			2,
		);

		const session = createTestSession();

		// Act
		await rehydrateSessionFromDisk(tmpDir, session);

		// Assert: all tasks should be present
		expect(session.taskWorkflowStates!.get('1.1')).toBe('coder_delegated');
		expect(session.taskWorkflowStates!.get('1.2')).toBe('complete');
		expect(session.taskWorkflowStates!.get('2.1')).toBe('idle');
		expect(session.taskWorkflowStates!.get('2.2')).toBe('coder_delegated');
	});

	it('15. taskWorkflowStates is initialized if missing', async () => {
		// Arrange: session without taskWorkflowStates
		const session = createTestSession();
		// @ts-expect-error - intentionally missing taskWorkflowStates for test
		delete session.taskWorkflowStates;

		// Act
		await rehydrateSessionFromDisk(tmpDir, session);

		// Assert: should have been initialized
		expect(session.taskWorkflowStates).toBeDefined();
		expect(session.taskWorkflowStates).toBeInstanceOf(Map);
	});

	it('16. empty plan with no phases is handled', async () => {
		// Arrange: plan with empty phases array
		writeFileSync(
			path.join(tmpDir, '.swarm', 'plan.json'),
			JSON.stringify({ title: 'Empty', swarm_id: 'test', phases: [] }),
		);

		const session = createTestSession();

		// Act
		await rehydrateSessionFromDisk(tmpDir, session);

		// Assert: no tasks should be added
		expect(session.taskWorkflowStates!.size).toBe(0);
	});

	it('17. evidence gates without test_engineer results in tests_run state', async () => {
		// Arrange: evidence shows only coder gate (gates object has entries but no test_engineer)
		writePlan([{ id: '1.1', status: 'pending' }]);
		writeEvidence(
			'1.1',
			{ coder: { sessionId: 's1', timestamp: 't1', agent: 'coder' } },
			['reviewer', 'test_engineer'],
		);

		const session = createTestSession();

		// Act
		await rehydrateSessionFromDisk(tmpDir, session);

		// Assert: coder gate present -> coder_delegated
		expect(session.taskWorkflowStates!.get('1.1')).toBe('coder_delegated');
	});

	it('18. path traversal in evidence filename is blocked', async () => {
		// Arrange: try to create evidence file with path traversal
		writePlan([{ id: '1.1', status: 'in_progress' }]);
		// This should be filtered out by the validation regex
		mkdirSync(path.join(tmpDir, '.swarm', 'evidence', '..'), {
			recursive: true,
		});

		const session = createTestSession();

		// Act
		await rehydrateSessionFromDisk(tmpDir, session);

		// Assert: only plan state should be used
		expect(session.taskWorkflowStates!.get('1.1')).toBe('coder_delegated');
	});

	it('19. empty gates object in evidence results in idle state', async () => {
		// Arrange: evidence exists but has empty gates
		writePlan([{ id: '1.1', status: 'in_progress' }]);
		writeEvidence('1.1', {}, ['reviewer', 'test_engineer']);

		const session = createTestSession();

		// Act
		await rehydrateSessionFromDisk(tmpDir, session);

		// Assert: empty gates -> idle
		expect(session.taskWorkflowStates!.get('1.1')).toBe('idle');
	});

	it('20. non-.json files in evidence dir are ignored', async () => {
		// Arrange: non-JSON files in evidence directory
		writePlan([{ id: '1.1', status: 'in_progress' }]);
		writeFileSync(
			path.join(tmpDir, '.swarm', 'evidence', '1.1.txt'),
			'some text',
		);
		// Also create a .json file for a task NOT in the plan
		writeFileSync(
			path.join(tmpDir, '.swarm', 'evidence', '1.2.json'),
			JSON.stringify({ taskId: '1.2', required_gates: [], gates: {} }),
		);

		const session = createTestSession();

		// Act
		await rehydrateSessionFromDisk(tmpDir, session);

		// Assert: only tasks in plan should be processed; .txt files ignored
		expect(session.taskWorkflowStates!.get('1.1')).toBe('coder_delegated');
		// Task 1.2 is not in plan, so should not exist in workflow states
		expect(session.taskWorkflowStates!.has('1.2')).toBe(false);
	});
});

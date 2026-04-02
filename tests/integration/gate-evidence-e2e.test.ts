/**
 * End-to-end integration tests for the gate evidence store.
 * Covers the full path: recordGateEvidence → executeUpdateTaskStatus.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	hasPassedAllGates,
	readTaskEvidence,
	recordAgentDispatch,
	recordGateEvidence,
} from '../../src/gate-evidence';
import { loadPlan, savePlan } from '../../src/plan/manager';
import {
	ensureAgentSession,
	resetSwarmState,
	startAgentSession,
} from '../../src/state';
import { executeUpdateTaskStatus } from '../../src/tools/update-task-status';

let tmpDir: string;

function writePlan(
	dir: string,
	tasks: Array<{ id: string; status: string }>,
): void {
	const planJson = JSON.stringify({
		schema_version: '1.0.0',
		title: 'E2E Test Plan',
		swarm: 'test-swarm',
		current_phase: 1,
		phases: [
			{
				id: 1,
				name: 'Phase 1',
				status: 'in_progress',
				tasks: tasks.map((t) => ({
					id: t.id,
					phase: 1,
					status: t.status,
					size: 'small',
					description: `Task ${t.id}`,
					depends: [],
					files_touched: [],
				})),
			},
		],
	});
	writeFileSync(path.join(dir, '.swarm', 'plan.json'), planJson);
}

beforeEach(() => {
	resetSwarmState();
	tmpDir = mkdtempSync(path.join(os.tmpdir(), 'gate-e2e-test-'));
	mkdirSync(path.join(tmpDir, '.swarm'), { recursive: true });
});

afterEach(() => {
	resetSwarmState();
	try {
		rmSync(tmpDir, { recursive: true, force: true });
	} catch {
		/* best effort */
	}
});

describe('Scenario A — Happy path (code task)', () => {
	it('reviewer + test_engineer evidence allows task completion', async () => {
		resetSwarmState();
		startAgentSession('sess-a', 'architect');
		const session = ensureAgentSession('sess-a');
		session.currentTaskId = '1.1';

		writePlan(tmpDir, [{ id: '1.1', status: 'in_progress' }]);

		await recordAgentDispatch(tmpDir, '1.1', 'coder');
		await recordGateEvidence(tmpDir, '1.1', 'reviewer', 'sess-a');
		await recordGateEvidence(tmpDir, '1.1', 'test_engineer', 'sess-a');

		const result = await executeUpdateTaskStatus({
			task_id: '1.1',
			status: 'completed',
			working_directory: tmpDir,
		});
		expect(result.success).toBe(true);

		// Verify plan.json has task 1.1 as completed
		const plan = await loadPlan(tmpDir);
		const task = plan!.phases[0].tasks.find((t) => t.id === '1.1');
		expect(task!.status).toBe('completed');
	});
});

describe('Scenario B — Happy path (docs task)', () => {
	it('docs evidence alone allows docs task completion', async () => {
		resetSwarmState();
		startAgentSession('sess-b', 'architect');
		const session = ensureAgentSession('sess-b');
		session.currentTaskId = '1.2';

		writePlan(tmpDir, [{ id: '1.2', status: 'in_progress' }]);

		await recordGateEvidence(tmpDir, '1.2', 'docs', 'sess-b');

		const result = await executeUpdateTaskStatus({
			task_id: '1.2',
			status: 'completed',
			working_directory: tmpDir,
		});
		expect(result.success).toBe(true);
	});
});

describe('Scenario C — Gate expansion (docs → code)', () => {
	it('docs task that later gets coder delegation requires full QA before completion', async () => {
		resetSwarmState();
		startAgentSession('sess-c', 'architect');
		const session = ensureAgentSession('sess-c');
		session.currentTaskId = '1.3';

		writePlan(tmpDir, [{ id: '1.3', status: 'in_progress' }]);

		// Docs only → required_gates: [docs]
		await recordGateEvidence(tmpDir, '1.3', 'docs', 'sess-c');
		let evidence = await readTaskEvidence(tmpDir, '1.3');
		expect(evidence!.required_gates).toEqual(['docs']);

		// Coder dispatch expands gates
		await recordAgentDispatch(tmpDir, '1.3', 'coder');
		evidence = await readTaskEvidence(tmpDir, '1.3');
		expect(evidence!.required_gates).toEqual([
			'docs',
			'reviewer',
			'test_engineer',
		]);

		// Should be BLOCKED (missing reviewer, test_engineer)
		const blocked = await executeUpdateTaskStatus({
			task_id: '1.3',
			status: 'completed',
			working_directory: tmpDir,
		});
		expect(blocked.success).toBe(false);
		expect(blocked.errors?.join('')).toContain('missing required gates');

		// Record remaining gates
		await recordGateEvidence(tmpDir, '1.3', 'reviewer', 'sess-c');
		await recordGateEvidence(tmpDir, '1.3', 'test_engineer', 'sess-c');

		const ok = await executeUpdateTaskStatus({
			task_id: '1.3',
			status: 'completed',
			working_directory: tmpDir,
		});
		expect(ok.success).toBe(true);
	});
});

describe('Scenario D — Cross-session recovery', () => {
	it('evidence file persists across session restart, task can complete with fresh state', async () => {
		// Write evidence file directly (simulating prior session)
		mkdirSync(path.join(tmpDir, '.swarm', 'evidence'), { recursive: true });
		const evidenceData = {
			taskId: '1.1',
			required_gates: ['reviewer', 'test_engineer'],
			gates: {
				reviewer: {
					sessionId: 'old-sess-1',
					timestamp: '2026-01-01T00:00:00Z',
					agent: 'reviewer',
				},
				test_engineer: {
					sessionId: 'old-sess-2',
					timestamp: '2026-01-01T00:01:00Z',
					agent: 'test_engineer',
				},
			},
		};
		writeFileSync(
			path.join(tmpDir, '.swarm', 'evidence', '1.1.json'),
			JSON.stringify(evidenceData),
		);

		writePlan(tmpDir, [{ id: '1.1', status: 'in_progress' }]);

		// Fresh state — no in-memory sessions
		resetSwarmState();

		const result = await executeUpdateTaskStatus({
			task_id: '1.1',
			status: 'completed',
			working_directory: tmpDir,
		});
		expect(result.success).toBe(true);
	});
});

describe('Scenario E — Task isolation', () => {
	it('evidence for task 1.1 does not help task 1.2 complete', async () => {
		resetSwarmState();
		startAgentSession('sess-e', 'architect');

		writePlan(tmpDir, [
			{ id: '1.1', status: 'in_progress' },
			{ id: '1.2', status: 'in_progress' },
		]);

		// Only reviewer for task 1.1 (code task missing test_engineer)
		await recordGateEvidence(tmpDir, '1.1', 'reviewer', 'sess-e');

		// Both gates for task 1.2
		await recordGateEvidence(tmpDir, '1.2', 'reviewer', 'sess-e');
		await recordGateEvidence(tmpDir, '1.2', 'test_engineer', 'sess-e');

		// 1.1 should be BLOCKED (missing test_engineer for required_gates=["reviewer"])
		// Note: reviewer-direct dispatch sets required_gates: ["reviewer"] which is already met,
		// so we need to ensure coder dispatch was recorded to expand required_gates
		await recordAgentDispatch(tmpDir, '1.1', 'coder');

		const blocked = await executeUpdateTaskStatus({
			task_id: '1.1',
			status: 'completed',
			working_directory: tmpDir,
		});
		expect(blocked.success).toBe(false);

		// 1.2 should succeed
		const ok = await executeUpdateTaskStatus({
			task_id: '1.2',
			status: 'completed',
			working_directory: tmpDir,
		});
		expect(ok.success).toBe(true);
	});
});

describe('Scenario F — Plan regression protection', () => {
	it('savePlan preserves completed tasks and derives correct phase status', async () => {
		// Write initial plan with task 1.1 completed
		const initialPlan = {
			schema_version: '1.0.0' as const,
			title: 'Regression Test',
			swarm: 'test-swarm',
			current_phase: 1,
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'complete' as const,
					tasks: [
						{
							id: '1.1',
							phase: 1,
							status: 'completed' as const,
							size: 'small' as const,
							description: 'Done task',
							depends: [] as string[],
							files_touched: [] as string[],
						},
					],
				},
			],
		};

		const { savePlan: _savePlan } = await import('../../src/plan/manager');
		await _savePlan(tmpDir, initialPlan);

		// Now call savePlan with task 1.1 regressed to 'pending'
		const regressedPlan = {
			...initialPlan,
			phases: [
				{
					...initialPlan.phases[0],
					status: 'pending' as const,
					tasks: [
						{
							...initialPlan.phases[0].tasks[0],
							status: 'pending' as const,
						},
					],
				},
			],
		};

		await _savePlan(tmpDir, regressedPlan);

		// Read back plan.json — task 1.1 should still be completed
		const raw = readFileSync(path.join(tmpDir, '.swarm', 'plan.json'), 'utf-8');
		const saved = JSON.parse(raw);
		const task11 = saved.phases[0].tasks.find(
			(t: { id: string }) => t.id === '1.1',
		);
		expect(task11.status).toBe('completed');

		// Phase status should be 'complete' (all tasks completed)
		expect(saved.phases[0].status).toBe('complete');
	});

	it('phase status is derived correctly from task statuses', async () => {
		const { savePlan: _savePlan } = await import('../../src/plan/manager');

		const plan = {
			schema_version: '1.0.0' as const,
			title: 'Phase Status Test',
			swarm: 'test-swarm',
			current_phase: 1,
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'pending' as const, // will be overridden
					tasks: [
						{
							id: '1.1',
							phase: 1,
							status: 'completed' as const,
							size: 'small' as const,
							description: 'Task 1',
							depends: [] as string[],
							files_touched: [] as string[],
						},
						{
							id: '1.2',
							phase: 1,
							status: 'in_progress' as const,
							size: 'small' as const,
							description: 'Task 2',
							depends: [] as string[],
							files_touched: [] as string[],
						},
					],
				},
			],
		};

		await _savePlan(tmpDir, plan);

		const raw = readFileSync(path.join(tmpDir, '.swarm', 'plan.json'), 'utf-8');
		const saved = JSON.parse(raw);
		// in_progress task → phase is in_progress
		expect(saved.phases[0].status).toBe('in_progress');
	});
});

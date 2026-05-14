/**
 * Regression test for the "plan partially removed" bug.
 *
 * When an agent calls save_plan with only a subset of phases (e.g., to add new
 * tasks to Phase 3), all existing phases NOT included in the call must be
 * preserved — they must NOT be silently deleted.
 *
 * Root cause: executeSavePlan previously built the plan from args.phases only,
 * so any phase absent from the call was wiped.  The fix merges args.phases into
 * the existing phase list (upsert semantics).
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { executeSavePlan } from './save-plan';

let tmpDir: string;

beforeEach(() => {
	tmpDir = fs.realpathSync(
		fs.mkdtempSync(path.join(os.tmpdir(), 'save-plan-merge-test-')),
	);
	fs.mkdirSync(path.join(tmpDir, '.swarm'), { recursive: true });
	// Satisfy spec gate
	fs.writeFileSync(path.join(tmpDir, '.swarm', 'spec.md'), '# Spec\n');
	// Satisfy QA gate selection check
	fs.writeFileSync(
		path.join(tmpDir, '.swarm', 'context.md'),
		'## Pending QA Gate Selection\n',
	);
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Helper — full 3-phase plan used to seed the initial state. */
const fullPlan = {
	title: 'Merge Regression Plan',
	swarm_id: 'test',
	phases: [
		{
			id: 1,
			name: 'Foundation',
			tasks: [
				{ id: '1.1', description: 'Task 1.1' },
				{ id: '1.2', description: 'Task 1.2' },
			],
		},
		{
			id: 2,
			name: 'Core',
			tasks: [
				{ id: '2.1', description: 'Task 2.1' },
				{ id: '2.2', description: 'Task 2.2' },
			],
		},
		{
			id: 3,
			name: 'CLI',
			tasks: [
				{ id: '3.1', description: 'Task 3.1' },
				{ id: '3.5', description: 'Task 3.5' },
			],
		},
	],
};

describe('save_plan non-destructive phase merge (issue: plan partially removed)', () => {
	it('preserves phases not included in args when adding tasks to an existing plan', async () => {
		// 1. Create the initial 3-phase plan.
		const initial = await executeSavePlan(
			{ ...fullPlan, working_directory: tmpDir },
			tmpDir,
		);
		expect(initial.success).toBe(true);
		expect(initial.phases_count).toBe(3);
		expect(initial.tasks_count).toBe(6);

		// 2. Simulate what the agent did: call save_plan with ONLY Phase 3,
		//    adding two new tasks (3.6 and 3.7).  Phases 1 and 2 are omitted.
		const update = await executeSavePlan(
			{
				title: fullPlan.title,
				swarm_id: fullPlan.swarm_id,
				working_directory: tmpDir,
				phases: [
					{
						id: 3,
						name: 'CLI',
						tasks: [
							{ id: '3.1', description: 'Task 3.1' },
							{ id: '3.5', description: 'Task 3.5' },
							{ id: '3.6', description: 'New task 3.6', depends: ['3.2'] },
							{ id: '3.7', description: 'New task 3.7', depends: ['3.3'] },
						],
					},
				],
			},
			tmpDir,
		);

		expect(update.success).toBe(true);
		// All 3 phases must still be present.
		expect(update.phases_count).toBe(3);
		// Original 6 tasks plus 2 new ones = 8.
		expect(update.tasks_count).toBe(8);

		// Verify by reading the saved plan.json directly.
		const planJson = JSON.parse(
			fs.readFileSync(path.join(tmpDir, '.swarm', 'plan.json'), 'utf8'),
		);

		const phaseIds: number[] = planJson.phases.map((p: { id: number }) => p.id);
		expect(phaseIds).toContain(1);
		expect(phaseIds).toContain(2);
		expect(phaseIds).toContain(3);

		// Phase 3 should now have 4 tasks.
		const phase3 = planJson.phases.find((p: { id: number }) => p.id === 3);
		expect(phase3).toBeDefined();
		const taskIds: string[] = phase3.tasks.map((t: { id: string }) => t.id);
		expect(taskIds).toContain('3.1');
		expect(taskIds).toContain('3.5');
		expect(taskIds).toContain('3.6');
		expect(taskIds).toContain('3.7');
	});

	it('preserves existing task statuses when updating a phase', async () => {
		// Create the initial plan.
		const initial = await executeSavePlan(
			{ ...fullPlan, working_directory: tmpDir },
			tmpDir,
		);
		expect(initial.success).toBe(true);

		// Manually mark task 1.1 as completed in plan.json.
		const planPath = path.join(tmpDir, '.swarm', 'plan.json');
		const planJson = JSON.parse(fs.readFileSync(planPath, 'utf8'));
		const phase1 = planJson.phases.find((p: { id: number }) => p.id === 1);
		const task11 = phase1.tasks.find((t: { id: string }) => t.id === '1.1');
		task11.status = 'completed';
		fs.writeFileSync(planPath, JSON.stringify(planJson, null, 2));

		// Update only Phase 3 — task 1.1's 'completed' status must survive.
		const update = await executeSavePlan(
			{
				title: fullPlan.title,
				swarm_id: fullPlan.swarm_id,
				working_directory: tmpDir,
				phases: [
					{
						id: 3,
						name: 'CLI',
						tasks: [
							{ id: '3.1', description: 'Task 3.1' },
							{ id: '3.5', description: 'Task 3.5' },
						],
					},
				],
			},
			tmpDir,
		);

		expect(update.success).toBe(true);

		const savedPlan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
		const savedPhase1 = savedPlan.phases.find(
			(p: { id: number }) => p.id === 1,
		);
		const savedTask11 = savedPhase1.tasks.find(
			(t: { id: string }) => t.id === '1.1',
		);
		expect(savedTask11.status).toBe('completed');
	});

	it('preserves files_touched for existing tasks when a phase is updated', async () => {
		// Create the initial plan.
		const initial = await executeSavePlan(
			{ ...fullPlan, working_directory: tmpDir },
			tmpDir,
		);
		expect(initial.success).toBe(true);

		// Simulate declare_scope writing files_touched for task 3.1.
		const planPath = path.join(tmpDir, '.swarm', 'plan.json');
		const planJson = JSON.parse(fs.readFileSync(planPath, 'utf8'));
		const phase3 = planJson.phases.find((p: { id: number }) => p.id === 3);
		const task31 = phase3.tasks.find((t: { id: string }) => t.id === '3.1');
		task31.files_touched = ['src/cli.ts', 'src/types.ts'];
		fs.writeFileSync(planPath, JSON.stringify(planJson, null, 2));

		// Re-save Phase 3 (same task 3.1 description) — files_touched must be kept.
		const update = await executeSavePlan(
			{
				title: fullPlan.title,
				swarm_id: fullPlan.swarm_id,
				working_directory: tmpDir,
				phases: [
					{
						id: 3,
						name: 'CLI',
						tasks: [
							{ id: '3.1', description: 'Task 3.1 updated description' },
							{ id: '3.5', description: 'Task 3.5' },
						],
					},
				],
			},
			tmpDir,
		);

		expect(update.success).toBe(true);

		const savedPlan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
		const savedPhase3 = savedPlan.phases.find(
			(p: { id: number }) => p.id === 3,
		);
		const savedTask31 = savedPhase3.tasks.find(
			(t: { id: string }) => t.id === '3.1',
		);
		expect(savedTask31.files_touched).toEqual(['src/cli.ts', 'src/types.ts']);
	});

	it('reset_statuses: true still allows a fresh-start full replace', async () => {
		// Create the initial plan.
		const initial = await executeSavePlan(
			{ ...fullPlan, working_directory: tmpDir },
			tmpDir,
		);
		expect(initial.success).toBe(true);

		// reset_statuses + only Phase 3 supplied — only Phase 3 should remain.
		const reset = await executeSavePlan(
			{
				title: fullPlan.title,
				swarm_id: fullPlan.swarm_id,
				working_directory: tmpDir,
				reset_statuses: true,
				phases: [
					{
						id: 3,
						name: 'CLI',
						tasks: [
							{ id: '3.1', description: 'Task 3.1' },
							{ id: '3.5', description: 'Task 3.5' },
						],
					},
				],
			},
			tmpDir,
		);

		expect(reset.success).toBe(true);
		expect(reset.phases_count).toBe(1);
		expect(reset.tasks_count).toBe(2);
	});

	it('preserves current_phase from existing plan when only a subset of phases is updated', async () => {
		// Create the initial plan — current_phase should be 1.
		const initial = await executeSavePlan(
			{ ...fullPlan, working_directory: tmpDir },
			tmpDir,
		);
		expect(initial.success).toBe(true);

		// Manually advance current_phase to 2 in plan.json.
		const planPath = path.join(tmpDir, '.swarm', 'plan.json');
		const planJson = JSON.parse(fs.readFileSync(planPath, 'utf8'));
		planJson.current_phase = 2;
		fs.writeFileSync(planPath, JSON.stringify(planJson, null, 2));

		// Update only Phase 3 — current_phase = 2 must be preserved.
		const update = await executeSavePlan(
			{
				title: fullPlan.title,
				swarm_id: fullPlan.swarm_id,
				working_directory: tmpDir,
				phases: [
					{
						id: 3,
						name: 'CLI',
						tasks: [
							{ id: '3.1', description: 'Task 3.1' },
							{ id: '3.5', description: 'Task 3.5' },
						],
					},
				],
			},
			tmpDir,
		);

		expect(update.success).toBe(true);

		const savedPlan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
		expect(savedPlan.current_phase).toBe(2);
	});
});

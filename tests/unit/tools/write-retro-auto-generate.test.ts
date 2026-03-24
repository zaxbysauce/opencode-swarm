import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
	autoGenerateMissingRetros,
	executeWriteRetro,
	WriteRetroArgs,
} from '../../../src/tools/write-retro';
import { loadEvidence } from '../../../src/evidence/manager';
import type { RetrospectiveEvidence, EvidenceBundle } from '../../../src/config/evidence-schema';

/**
 * Create a valid plan.json structure for testing
 */
function createPlanJson(phases: Array<{
	id: number;
	name: string;
	status: string;
	completedTaskIds?: string[];
	pendingTaskIds?: string[];
}>): object {
	return {
		schema_version: '1.0.0',
		title: 'Test Plan',
		swarm_id: 'test-swarm',
		current_phase: phases.length,
		phases: phases.map((p) => ({
			id: p.id,
			name: p.name,
			status: p.status,
			tasks: [
				...(p.completedTaskIds ?? []).map((tid) => ({
					id: tid,
					phase: p.id,
					status: 'completed',
					size: 'small',
					description: `Task ${tid}`,
					depends: [],
					files_touched: [],
				})),
				...(p.pendingTaskIds ?? []).map((tid) => ({
					id: tid,
					phase: p.id,
					status: 'pending',
					size: 'small',
					description: `Task ${tid}`,
					depends: [],
					files_touched: [],
				})),
			],
		})),
	};
}

/**
 * Helper to load evidence with proper type guard
 */
async function loadRetroEvidence(directory: string, taskId: string): Promise<RetrospectiveEvidence | null> {
	const result = await loadEvidence(directory, taskId);
	if (result.status !== 'found') return null;
	const entry = result.bundle.entries.find((e) => e.type === 'retrospective');
	return entry as RetrospectiveEvidence | null;
}

describe('autoGenerateMissingRetros', () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-retro-test-'));
		originalCwd = process.cwd();
		process.chdir(tempDir);

		// Create .swarm directory structure
		fs.mkdirSync(path.join(tempDir, '.swarm', 'evidence'), { recursive: true });
	});

	afterEach(() => {
		process.chdir(originalCwd);
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
		mock.restore();
	});

	test('Scenario 1: No phases with completed tasks -> skipped=0, retros_generated=0, success=true', async () => {
		const plan = createPlanJson([
			{ id: 1, name: 'Phase 1', status: 'in_progress', pendingTaskIds: ['1.1', '1.2'] },
			{ id: 2, name: 'Phase 2', status: 'pending', pendingTaskIds: ['2.1'] },
		]);
		fs.writeFileSync(path.join(tempDir, '.swarm', 'plan.json'), JSON.stringify(plan));

		const result = await autoGenerateMissingRetros(tempDir);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(true);
		expect(parsed.phases_processed).toBe(2);
		expect(parsed.retros_generated).toBe(0);
		expect(parsed.skipped).toBe(2);
		expect(parsed.details).toContain('Phase 1 (Phase 1): skipped - no completed tasks');
		expect(parsed.details).toContain('Phase 2 (Phase 2): skipped - no completed tasks');
	});

	test('Scenario 2: Phase with completed tasks but retro already exists -> skipped=1, retros_generated=0', async () => {
		// Create plan with completed tasks for phase 1
		const plan = createPlanJson([
			{ id: 1, name: 'Phase 1', status: 'completed', completedTaskIds: ['1.1'] },
		]);
		fs.writeFileSync(path.join(tempDir, '.swarm', 'plan.json'), JSON.stringify(plan));

		// Create existing retro directory for phase 1
		const retroDir = path.join(tempDir, '.swarm', 'evidence', 'retro-1');
		fs.mkdirSync(retroDir, { recursive: true });
		fs.writeFileSync(
			path.join(retroDir, 'evidence.json'),
			JSON.stringify({
				schema_version: '1.0.0',
				task_id: 'retro-1',
				entries: [],
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			}),
		);

		const result = await autoGenerateMissingRetros(tempDir);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(true);
		expect(parsed.phases_processed).toBe(1);
		expect(parsed.retros_generated).toBe(0);
		expect(parsed.skipped).toBe(1);
		expect(parsed.details).toContain('Phase 1 (Phase 1): skipped - retro already exists');
	});

	test('Scenario 3: Phase with completed tasks and no retro -> retros_generated=1', async () => {
		const plan = createPlanJson([
			{ id: 1, name: 'Phase 1', status: 'completed', completedTaskIds: ['1.1', '1.2'] },
		]);
		fs.writeFileSync(path.join(tempDir, '.swarm', 'plan.json'), JSON.stringify(plan));

		const result = await autoGenerateMissingRetros(tempDir);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(true);
		expect(parsed.phases_processed).toBe(1);
		expect(parsed.retros_generated).toBe(1);
		expect(parsed.skipped).toBe(0);
		expect(parsed.details).toContain('Phase 1 (Phase 1): retro generated with 2 tasks');

		// Verify the retro was actually created
		const retroPath = path.join(tempDir, '.swarm', 'evidence', 'retro-1', 'evidence.json');
		expect(fs.existsSync(retroPath)).toBe(true);

		const entry = await loadRetroEvidence(tempDir, 'retro-1');
		expect(entry).not.toBeNull();
		expect(entry!.phase_number).toBe(1);
		expect(entry!.task_count).toBe(2);
		expect(entry!.task_complexity).toBe('simple'); // 2 tasks -> simple
		expect(entry!.summary).toContain('Phase 1');
	});

	test('Scenario 4: Multiple phases needing retros -> all generated correctly', async () => {
		const plan = createPlanJson([
			{ id: 1, name: 'Phase 1', status: 'completed', completedTaskIds: ['1.1'] },
			{ id: 2, name: 'Phase 2', status: 'completed', completedTaskIds: ['2.1', '2.2'] },
			{ id: 3, name: 'Phase 3', status: 'completed', completedTaskIds: ['3.1', '3.2', '3.3'] },
		]);
		fs.writeFileSync(path.join(tempDir, '.swarm', 'plan.json'), JSON.stringify(plan));

		const result = await autoGenerateMissingRetros(tempDir);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(true);
		expect(parsed.phases_processed).toBe(3);
		expect(parsed.retros_generated).toBe(3);
		expect(parsed.skipped).toBe(0);

		// Verify all retros were created with correct task counts
		for (const phase of [1, 2, 3]) {
			const retroPath = path.join(tempDir, '.swarm', 'evidence', `retro-${phase}`, 'evidence.json');
			expect(fs.existsSync(retroPath)).toBe(true);
		}

		// Check complexity inference: 1 task -> trivial, 2 tasks -> simple, 3 tasks -> moderate
		const entry1 = await loadRetroEvidence(tempDir, 'retro-1');
		expect(entry1!.task_complexity).toBe('trivial'); // 1 task

		const entry2 = await loadRetroEvidence(tempDir, 'retro-2');
		expect(entry2!.task_complexity).toBe('simple'); // 2 tasks

		const entry3 = await loadRetroEvidence(tempDir, 'retro-3');
		expect(entry3!.task_complexity).toBe('moderate'); // 3 tasks
	});

	test('Scenario 5: executeWriteRetro fails -> success=false, failures tracked', async () => {
		// Create plan with phase ID > 99 which will fail validation in executeWriteRetro
		const plan = {
			schema_version: '1.0.0',
			title: 'Test Plan',
			swarm_id: 'test-swarm',
			current_phase: 1,
			phases: [
				{
					id: 100, // Will fail: executeWriteRetro rejects phase > 99
					name: 'Phase 100',
					status: 'completed',
					tasks: [
						{
							id: '100.1',
							phase: 100,
							status: 'completed',
							size: 'small',
							description: 'Task 100.1',
							depends: [],
							files_touched: [],
						},
					],
				},
			],
		};
		fs.writeFileSync(path.join(tempDir, '.swarm', 'plan.json'), JSON.stringify(plan));

		const result = await autoGenerateMissingRetros(tempDir);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(false);
		expect(parsed.phases_processed).toBe(1);
		expect(parsed.retros_generated).toBe(0);
		expect(parsed.skipped).toBe(0);
		expect(parsed.details[0]).toContain('failed');
		expect(parsed.details[0]).toContain('Invalid phase');
	});

	test('Scenario 6: plan.json missing phases array -> graceful error', async () => {
		const invalidPlan = {
			schema_version: '1.0.0',
			title: 'Test Plan',
			swarm_id: 'test-swarm',
			current_phase: 1,
			// Missing phases array
		};
		fs.writeFileSync(path.join(tempDir, '.swarm', 'plan.json'), JSON.stringify(invalidPlan));

		const result = await autoGenerateMissingRetros(tempDir);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(false);
		expect(parsed.phases_processed).toBe(0);
		expect(parsed.retros_generated).toBe(0);
		expect(parsed.skipped).toBe(0);
		expect(parsed.details).toContain('plan.json is missing or has invalid phases array');
	});

	test('Scenario 7: task_complexity correctly inferred: 1=trivial, 2=simple, 3-5=moderate, 6+=complex', async () => {
		const plan = createPlanJson([
			{ id: 1, name: 'Phase 1', status: 'completed', completedTaskIds: ['1.1'] }, // 1 task -> trivial
			{ id: 2, name: 'Phase 2', status: 'completed', completedTaskIds: ['2.1', '2.2'] }, // 2 tasks -> simple
			{ id: 3, name: 'Phase 3', status: 'completed', completedTaskIds: ['3.1', '3.2', '3.3'] }, // 3 tasks -> moderate
			{ id: 4, name: 'Phase 4', status: 'completed', completedTaskIds: ['4.1', '4.2', '4.3', '4.4', '4.5'] }, // 5 tasks -> moderate
			{ id: 5, name: 'Phase 5', status: 'completed', completedTaskIds: ['5.1', '5.2', '5.3', '5.4', '5.5', '5.6'] }, // 6 tasks -> complex
		]);
		fs.writeFileSync(path.join(tempDir, '.swarm', 'plan.json'), JSON.stringify(plan));

		const result = await autoGenerateMissingRetros(tempDir);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(true);
		expect(parsed.retros_generated).toBe(5);

		// Verify complexity for each phase
		const complexities = ['trivial', 'simple', 'moderate', 'moderate', 'complex'];
		for (let i = 0; i < 5; i++) {
			const phase = i + 1;
			const entry = await loadRetroEvidence(tempDir, `retro-${phase}`);
			expect(entry!.task_complexity).toBe(complexities[i]);
		}
	});

	test('Missing plan.json file -> graceful error', async () => {
		// Don't create plan.json

		const result = await autoGenerateMissingRetros(tempDir);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(false);
		expect(parsed.phases_processed).toBe(0);
		expect(parsed.retros_generated).toBe(0);
		expect(parsed.skipped).toBe(0);
		expect(parsed.details).toContain('Failed to read .swarm/plan.json');
	});

	test('Invalid plan.json (not JSON) -> graceful error', async () => {
		fs.writeFileSync(path.join(tempDir, '.swarm', 'plan.json'), 'not valid json {{{');

		const result = await autoGenerateMissingRetros(tempDir);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(false);
		expect(parsed.details).toContain('Failed to read .swarm/plan.json');
	});

	test('Mixed scenario: some phases completed, some pending, some already have retros', async () => {
		const plan = createPlanJson([
			{ id: 1, name: 'Phase 1', status: 'completed', completedTaskIds: ['1.1'] },
			{ id: 2, name: 'Phase 2', status: 'in_progress', pendingTaskIds: ['2.1'] },
			{ id: 3, name: 'Phase 3', status: 'completed', completedTaskIds: ['3.1'] },
		]);
		fs.writeFileSync(path.join(tempDir, '.swarm', 'plan.json'), JSON.stringify(plan));

		// Create existing retro for phase 3
		const retroDir = path.join(tempDir, '.swarm', 'evidence', 'retro-3');
		fs.mkdirSync(retroDir, { recursive: true });
		fs.writeFileSync(
			path.join(retroDir, 'evidence.json'),
			JSON.stringify({
				schema_version: '1.0.0',
				task_id: 'retro-3',
				entries: [],
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			}),
		);

		const result = await autoGenerateMissingRetros(tempDir);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(true);
		expect(parsed.phases_processed).toBe(3);
		expect(parsed.retros_generated).toBe(1); // Only phase 1 generated
		expect(parsed.skipped).toBe(2); // Phase 2 (no completed tasks), Phase 3 (retro exists)

		// Verify only phase 1 retro was created
		expect(fs.existsSync(path.join(tempDir, '.swarm', 'evidence', 'retro-1', 'evidence.json'))).toBe(true);
		expect(fs.existsSync(path.join(tempDir, '.swarm', 'evidence', 'retro-2', 'evidence.json'))).toBe(false);
		expect(fs.existsSync(path.join(tempDir, '.swarm', 'evidence', 'retro-3', 'evidence.json'))).toBe(true); // Pre-existing
	});

	test('Empty phases array -> success with no work done', async () => {
		const plan = {
			schema_version: '1.0.0',
			title: 'Test Plan',
			swarm_id: 'test-swarm',
			current_phase: 0,
			phases: [],
		};
		fs.writeFileSync(path.join(tempDir, '.swarm', 'plan.json'), JSON.stringify(plan));

		const result = await autoGenerateMissingRetros(tempDir);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(true);
		expect(parsed.phases_processed).toBe(0);
		expect(parsed.retros_generated).toBe(0);
		expect(parsed.skipped).toBe(0);
	});

	test('Result details contain informative messages', async () => {
		const plan = createPlanJson([
			{ id: 1, name: 'Init', status: 'completed', completedTaskIds: ['1.1'] },
		]);
		fs.writeFileSync(path.join(tempDir, '.swarm', 'plan.json'), JSON.stringify(plan));

		const result = await autoGenerateMissingRetros(tempDir);
		const parsed = JSON.parse(result);

		expect(parsed.details[0]).toContain('Phase 1');
		expect(parsed.details[0]).toContain('Init');
		expect(parsed.details[0]).toContain('retro generated');
	});
});

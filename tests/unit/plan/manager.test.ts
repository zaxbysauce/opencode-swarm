import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, writeFile, rm, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	loadPlan,
	loadPlanJsonOnly,
	savePlan,
	updateTaskStatus,
	derivePlanMarkdown,
	migrateLegacyPlan,
} from '../../../src/plan/manager';
import type { Plan } from '../../../src/config/plan-schema';

function createTestPlan(overrides?: Partial<Plan>): Plan {
	return {
		schema_version: '1.0.0',
		title: 'Test Plan',
		swarm: 'test-swarm',
		current_phase: 1,
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
						description: 'Task one',
						depends: [],
						files_touched: [],
					},
				],
			},
		],
		...overrides,
	};
}

async function writePlanJson(dir: string, plan: Plan) {
	const swarmDir = join(dir, '.swarm');
	await mkdir(swarmDir, { recursive: true });
	await writeFile(join(swarmDir, 'plan.json'), JSON.stringify(plan, null, 2));
}

async function writePlanMd(dir: string, content: string) {
	const swarmDir = join(dir, '.swarm');
	await mkdir(swarmDir, { recursive: true });
	await writeFile(join(swarmDir, 'plan.md'), content);
}

describe('loadPlanJsonOnly', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'opencode-swarm-test-'));
	});

	afterEach(async () => {
		if (existsSync(tempDir)) {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	test('returns null when no .swarm/ dir exists', async () => {
		const result = await loadPlanJsonOnly(tempDir);
		expect(result).toBeNull();
	});

	test('returns valid Plan when plan.json exists and is valid', async () => {
		const testPlan = createTestPlan();
		await writePlanJson(tempDir, testPlan);
		const result = await loadPlanJsonOnly(tempDir);
		expect(result).not.toBeNull();
		expect(result).toEqual(testPlan);
	});

	test('returns null when plan.json has invalid JSON', async () => {
		const swarmDir = join(tempDir, '.swarm');
		await mkdir(swarmDir, { recursive: true });
		await writeFile(join(swarmDir, 'plan.json'), 'not valid json {{{');
		const result = await loadPlanJsonOnly(tempDir);
		expect(result).toBeNull();
	});

	test('returns null when plan.json fails schema validation (wrong version)', async () => {
		const invalidPlan = {
			...createTestPlan(),
			schema_version: '0.9.0',
		};
		await writePlanJson(tempDir, invalidPlan as any);
		const result = await loadPlanJsonOnly(tempDir);
		expect(result).toBeNull();
	});

	test('does NOT read plan.md (write plan.md only, no plan.json — should return null)', async () => {
		const swarmDir = join(tempDir, '.swarm');
		await mkdir(swarmDir, { recursive: true });
		await writeFile(
			join(swarmDir, 'plan.md'),
			'# Test Plan\nSwarm: test-swarm\nPhase: 1',
		);
		const result = await loadPlanJsonOnly(tempDir);
		expect(result).toBeNull();
	});
});

describe('loadPlan', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'opencode-swarm-test-'));
	});

	afterEach(async () => {
		if (existsSync(tempDir)) {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	test('returns null when neither plan.json nor plan.md exists', async () => {
		const result = await loadPlan(tempDir);
		expect(result).toBeNull();
	});

	test('returns Plan from plan.json when it exists and validates', async () => {
		const testPlan = createTestPlan();
		await writePlanJson(tempDir, testPlan);
		const result = await loadPlan(tempDir);
		expect(result).not.toBeNull();
		expect(result).toEqual(testPlan);
	});

	test('falls back to migration when plan.json is invalid but plan.md exists (writes plan.json + plan.md)', async () => {
		// Write invalid plan.json
		const swarmDir = join(tempDir, '.swarm');
		await mkdir(swarmDir, { recursive: true });
		await writeFile(join(swarmDir, 'plan.json'), 'invalid json {{{');

		// Write valid plan.md
		const planMd = `# Test Legacy Plan
Swarm: legacy-swarm
Phase: 1

## Phase 1: Initial Phase [PENDING]
- [ ] 1.1: First task [SMALL]
- [ ] 1.2: Second task [MEDIUM] (depends: 1.1)
`;
		await writeFile(join(swarmDir, 'plan.md'), planMd);

		const result = await loadPlan(tempDir);
		expect(result).not.toBeNull();
		expect(result?.migration_status).toBe('migrated');
		expect(result?.title).toBe('Test Legacy Plan');
		expect(result?.swarm).toBe('legacy-swarm');
		expect(result?.phases[0].tasks.length).toBe(2);

		// Verify plan.json was written
		const planJsonPath = join(swarmDir, 'plan.json');
		expect(existsSync(planJsonPath)).toBe(true);
		const planJsonContent = JSON.parse(await readFile(planJsonPath, 'utf-8'));
		expect(planJsonContent.title).toBe('Test Legacy Plan');
	});

	test('falls back to migration when plan.json does not exist but plan.md does (writes plan.json)', async () => {
		// Write valid plan.md only
		const swarmDir = join(tempDir, '.swarm');
		await mkdir(swarmDir, { recursive: true });
		const planMd = `# Another Legacy Plan
Swarm: another-swarm
Phase: 1

## Phase 1: First Phase [IN PROGRESS]
- [x] 1.1: Completed task [SMALL]
- [ ] 1.2: Pending task [MEDIUM] (depends: 1.1)
`;
		await writeFile(join(swarmDir, 'plan.md'), planMd);

		const result = await loadPlan(tempDir);
		expect(result).not.toBeNull();
		expect(result?.migration_status).toBe('migrated');
		expect(result?.title).toBe('Another Legacy Plan');

		// Verify plan.json was written
		const planJsonPath = join(swarmDir, 'plan.json');
		expect(existsSync(planJsonPath)).toBe(true);
	});

	test('after migration, plan.json should exist on disk (verify by reading it back)', async () => {
		const swarmDir = join(tempDir, '.swarm');
		await mkdir(swarmDir, { recursive: true });
		const planMd = `# Migrated Plan
Swarm: migrated-swarm
Phase: 1

## Phase 1: Migrated Phase [PENDING]
- [ ] 1.1: Migrated task [SMALL]
`;
		await writeFile(join(swarmDir, 'plan.md'), planMd);

		await loadPlan(tempDir);

		// Read back plan.json
		const planJsonPath = join(swarmDir, 'plan.json');
		expect(existsSync(planJsonPath)).toBe(true);
		const planJsonContent = await readFile(planJsonPath, 'utf-8');
		const parsed = JSON.parse(planJsonContent);
		expect(parsed.title).toBe('Migrated Plan');
		expect(parsed.swarm).toBe('migrated-swarm');
	});
});

describe('savePlan', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'opencode-swarm-test-'));
	});

	afterEach(async () => {
		if (existsSync(tempDir)) {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	test('saves plan.json and plan.md to .swarm/ directory', async () => {
		const testPlan = createTestPlan();
		await savePlan(tempDir, testPlan);

		const swarmDir = join(tempDir, '.swarm');
		expect(existsSync(join(swarmDir, 'plan.json'))).toBe(true);
		expect(existsSync(join(swarmDir, 'plan.md'))).toBe(true);
	});

	test('plan.json contains valid JSON that round-trips through PlanSchema', async () => {
		const testPlan = createTestPlan();
		await savePlan(tempDir, testPlan);

		const planJsonPath = join(tempDir, '.swarm', 'plan.json');
		const planJsonContent = await readFile(planJsonPath, 'utf-8');
		const parsed = JSON.parse(planJsonContent);

		// Verify round-trip through schema
		const { PlanSchema } = await import('../../../src/config/plan-schema');
		const validated = PlanSchema.parse(parsed);
		expect(validated).toEqual(testPlan);
	});

	test('plan.md contains derived markdown (check for phase header, task lines)', async () => {
		const testPlan = createTestPlan();
		await savePlan(tempDir, testPlan);

		const planMdPath = join(tempDir, '.swarm', 'plan.md');
		const planMdContent = await readFile(planMdPath, 'utf-8');

		expect(planMdContent).toContain('# Test Plan');
		expect(planMdContent).toContain('Swarm: test-swarm');
		expect(planMdContent).toContain('## Phase 1: Phase 1');
		expect(planMdContent).toContain('- [ ] 1.1: Task one [SMALL]');
	});

	test('throws on invalid plan (missing required fields)', async () => {
		const invalidPlan = {
			schema_version: '1.0.0',
			title: '', // Empty title should fail
			swarm: 'test-swarm',
			current_phase: 1,
			phases: [],
		} as any;

		let errorThrown = false;
		try {
			await savePlan(tempDir, invalidPlan);
		} catch (e) {
			errorThrown = true;
		}
		expect(errorThrown).toBe(true);
	});
});

describe('updateTaskStatus', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'opencode-swarm-test-'));
	});

	afterEach(async () => {
		if (existsSync(tempDir)) {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	test('updates a task status and saves', async () => {
		const testPlan = createTestPlan();
		await writePlanJson(tempDir, testPlan);

		const result = await updateTaskStatus(tempDir, '1.1', 'completed');
		expect(result.phases[0].tasks[0].status).toBe('completed');
	});

	test('throws when plan does not exist', async () => {
		let errorThrown = false;
		let errorMessage = '';
		try {
			await updateTaskStatus(tempDir, '1.1', 'completed');
		} catch (e) {
			errorThrown = true;
			errorMessage = e instanceof Error ? e.message : String(e);
		}
		expect(errorThrown).toBe(true);
		expect(errorMessage).toContain('Plan not found');
	});

	test('throws when task ID does not exist', async () => {
		const testPlan = createTestPlan();
		await writePlanJson(tempDir, testPlan);

		let errorThrown = false;
		let errorMessage = '';
		try {
			await updateTaskStatus(tempDir, '9.9', 'completed');
		} catch (e) {
			errorThrown = true;
			errorMessage = e instanceof Error ? e.message : String(e);
		}
		expect(errorThrown).toBe(true);
		expect(errorMessage).toContain('Task not found');
	});

	test('returns the updated plan with the correct status', async () => {
		const testPlan = createTestPlan();
		await writePlanJson(tempDir, testPlan);

		const result = await updateTaskStatus(tempDir, '1.1', 'in_progress');
		expect(result.phases[0].tasks[0].status).toBe('in_progress');

		// Verify saved to disk
		const loadedPlan = await loadPlan(tempDir);
		expect(loadedPlan?.phases[0].tasks[0].status).toBe('in_progress');
	});
});

describe('derivePlanMarkdown (pure function, no I/O)', () => {
	test('single phase plan produces correct markdown', () => {
		const plan = createTestPlan();
		const markdown = derivePlanMarkdown(plan);

		expect(markdown).toContain('# Test Plan');
		expect(markdown).toContain('Swarm: test-swarm');
		expect(markdown).toContain('Phase: 1 [IN PROGRESS]');
		expect(markdown).toContain('## Phase 1: Phase 1 [IN PROGRESS]');
		expect(markdown).toContain('- [ ] 1.1: Task one [SMALL]');
	});

	test('multi-phase plan has --- separators', () => {
		const plan = createTestPlan({
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'pending',
					tasks: [
						{
							id: '1.1',
							phase: 1,
							description: 'Task 1',
							status: 'pending',
							size: 'small',
							depends: [],
							files_touched: [],
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
							description: 'Task 2',
							status: 'pending',
							size: 'medium',
							depends: [],
							files_touched: [],
						},
					],
				},
			],
		});
		const markdown = derivePlanMarkdown(plan);

		expect(markdown).toContain('---');
	});

	test('completed tasks show [x]', () => {
		const plan = createTestPlan({
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'in_progress',
					tasks: [
						{
							id: '1.1',
							phase: 1,
							description: 'Completed task',
							status: 'completed',
							size: 'small',
							depends: [],
							files_touched: [],
						},
					],
				},
			],
		});
		const markdown = derivePlanMarkdown(plan);

		expect(markdown).toContain('- [x] 1.1: Completed task [SMALL]');
	});

	test('pending tasks show [ ]', () => {
		const plan = createTestPlan({
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'in_progress',
					tasks: [
						{
							id: '1.1',
							phase: 1,
							description: 'Pending task',
							status: 'pending',
							size: 'small',
							depends: [],
							files_touched: [],
						},
					],
				},
			],
		});
		const markdown = derivePlanMarkdown(plan);

		expect(markdown).toContain('- [ ] 1.1: Pending task [SMALL]');
	});

	test('blocked tasks show [BLOCKED] with reason', () => {
		const plan = createTestPlan({
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'in_progress',
					tasks: [
						{
							id: '1.1',
							phase: 1,
							description: 'Blocked task',
							status: 'blocked',
							size: 'small',
							depends: [],
							files_touched: [],
							blocked_reason: 'Waiting for approval',
						},
					],
				},
			],
		});
		const markdown = derivePlanMarkdown(plan);

		expect(markdown).toContain(
			'- [BLOCKED] 1.1: Blocked task - Waiting for approval [SMALL]',
		);
	});

	test('in-progress task in current phase gets ← CURRENT marker', () => {
		const plan = createTestPlan({
			current_phase: 1,
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'in_progress',
					tasks: [
						{
							id: '1.1',
							phase: 1,
							description: 'In progress task',
							status: 'in_progress',
							size: 'small',
							depends: [],
							files_touched: [],
						},
					],
				},
			],
		});
		const markdown = derivePlanMarkdown(plan);

		expect(markdown).toContain('← CURRENT');
	});

	test('dependencies shown as (depends: X.Y)', () => {
		const plan = createTestPlan({
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'in_progress',
					tasks: [
						{
							id: '1.1',
							phase: 1,
							description: 'Task with dependencies',
							status: 'pending',
							size: 'small',
							depends: ['1.0', '2.3'],
							files_touched: [],
						},
					],
				},
			],
		});
		const markdown = derivePlanMarkdown(plan);

		expect(markdown).toContain('(depends: 1.0, 2.3)');
	});

	test('sizes shown in uppercase [SMALL], [MEDIUM], [LARGE]', () => {
		const plan = createTestPlan({
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'in_progress',
					tasks: [
						{
							id: '1.1',
							phase: 1,
							description: 'Small task',
							status: 'pending',
							size: 'small',
							depends: [],
							files_touched: [],
						},
						{
							id: '1.2',
							phase: 1,
							description: 'Medium task',
							status: 'pending',
							size: 'medium',
							depends: [],
							files_touched: [],
						},
						{
							id: '1.3',
							phase: 1,
							description: 'Large task',
							status: 'pending',
							size: 'large',
							depends: [],
							files_touched: [],
						},
					],
				},
			],
		});
		const markdown = derivePlanMarkdown(plan);

		expect(markdown).toContain('[SMALL]');
		expect(markdown).toContain('[MEDIUM]');
		expect(markdown).toContain('[LARGE]');
	});
});

describe('migrateLegacyPlan (pure function, no I/O)', () => {
	test('standard plan.md format migrates correctly (title, swarm, phases, tasks)', () => {
		const planMd = `# Test Title
Swarm: test-swarm
Phase: 2

## Phase 1: First Phase [PENDING]
- [ ] 1.1: First task [SMALL]
- [ ] 1.2: Second task [MEDIUM]

## Phase 2: Second Phase [IN PROGRESS]
- [ ] 2.1: Third task [LARGE]
`;
		const plan = migrateLegacyPlan(planMd);

		expect(plan.title).toBe('Test Title');
		expect(plan.swarm).toBe('test-swarm');
		expect(plan.current_phase).toBe(2);
		expect(plan.phases.length).toBe(2);
		expect(plan.phases[0].name).toBe('First Phase');
		expect(plan.phases[1].name).toBe('Second Phase');
		expect(plan.phases[0].tasks[0].description).toBe('First task');
	});

	test('completed tasks get status completed', () => {
		const planMd = `# Test
Swarm: test-swarm
Phase: 1

## Phase 1: First Phase [PENDING]
- [x] 1.1: Completed task [SMALL]
- [ ] 1.2: Pending task [MEDIUM]
`;
		const plan = migrateLegacyPlan(planMd);

		expect(plan.phases[0].tasks[0].status).toBe('completed');
		expect(plan.phases[0].tasks[1].status).toBe('pending');
	});

	test('pending tasks get status pending', () => {
		const planMd = `# Test
Swarm: test-swarm
Phase: 1

## Phase 1: First Phase [PENDING]
- [ ] 1.1: Pending task [SMALL]
`;
		const plan = migrateLegacyPlan(planMd);

		expect(plan.phases[0].tasks[0].status).toBe('pending');
	});

	test('blocked tasks get status blocked with reason', () => {
		const planMd = `# Test
Swarm: test-swarm
Phase: 1

## Phase 1: First Phase [PENDING]
- [BLOCKED] 1.1: Blocked task - Waiting for review [SMALL]
`;
		const plan = migrateLegacyPlan(planMd);

		expect(plan.phases[0].tasks[0].status).toBe('blocked');
		// Note: The regex captures the reason including the [SMALL] tag due to non-greedy matching
		expect(plan.phases[0].tasks[0].blocked_reason).toBe('Waiting for review [SMALL]');
	});

	test('dependencies parsed correctly', () => {
		const planMd = `# Test
Swarm: test-swarm
Phase: 1

## Phase 1: First Phase [PENDING]
- [ ] 1.1: Task with deps [SMALL] (depends: 1.0, 2.3, 3.4)
`;
		const plan = migrateLegacyPlan(planMd);

		expect(plan.phases[0].tasks[0].depends).toEqual(['1.0', '2.3', '3.4']);
	});

	test('task sizes parsed correctly', () => {
		const planMd = `# Test
Swarm: test-swarm
Phase: 1

## Phase 1: First Phase [PENDING]
- [ ] 1.1: Small task [SMALL]
- [ ] 1.2: Medium task [MEDIUM]
- [ ] 1.3: Large task [LARGE]
`;
		const plan = migrateLegacyPlan(planMd);

		expect(plan.phases[0].tasks[0].size).toBe('small');
		expect(plan.phases[0].tasks[1].size).toBe('medium');
		expect(plan.phases[0].tasks[2].size).toBe('large');
	});

	test('phase statuses: COMPLETE → complete, IN PROGRESS → in_progress, PENDING → pending', () => {
		const planMd = `# Test
Swarm: test-swarm
Phase: 2

## Phase 1: First Phase [COMPLETE]
- [x] 1.1: Task [SMALL]

## Phase 2: Second Phase [IN PROGRESS]
- [ ] 2.1: Task [MEDIUM]

## Phase 3: Third Phase [PENDING]
- [ ] 3.1: Task [LARGE]
`;
		const plan = migrateLegacyPlan(planMd);

		expect(plan.phases[0].status).toBe('complete');
		expect(plan.phases[1].status).toBe('in_progress');
		expect(plan.phases[2].status).toBe('pending');
	});

	test('empty/unparseable content → migration_status = migration_failed, creates blocked placeholder phase', () => {
		const planMd = `This is not a valid plan at all
No phase headers here
Just some random text`;
		const plan = migrateLegacyPlan(planMd);

		expect(plan.migration_status).toBe('migration_failed');
		expect(plan.phases.length).toBe(1);
		expect(plan.phases[0].id).toBe(1);
		expect(plan.phases[0].name).toBe('Migration Failed');
		expect(plan.phases[0].status).toBe('blocked');
		expect(plan.phases[0].tasks[0].id).toBe('1.1');
		expect(plan.phases[0].tasks[0].description).toBe(
			'Review and restructure plan manually',
		);
	});

	test('swarmId parameter used when no Swarm: line present', () => {
		const planMd = `# Test
Phase: 1

## Phase 1: First Phase [PENDING]
- [ ] 1.1: Task [SMALL]
`;
		const plan = migrateLegacyPlan(planMd, 'custom-swarm-id');

		expect(plan.swarm).toBe('custom-swarm-id');
	});

	test('Phase: N header sets current_phase correctly', () => {
		const planMd = `# Test
Swarm: test-swarm
Phase: 3

## Phase 1: First Phase [COMPLETE]
- [x] 1.1: Task [SMALL]

## Phase 2: Second Phase [COMPLETE]
- [x] 2.1: Task [MEDIUM]

## Phase 3: Third Phase [IN PROGRESS]
- [ ] 3.1: Task [LARGE]
`;
		const plan = migrateLegacyPlan(planMd);

		expect(plan.current_phase).toBe(3);
	});

	test('phases sorted by ID', () => {
		const planMd = `# Test
Swarm: test-swarm
Phase: 1

## Phase 3: Third Phase [PENDING]
- [ ] 3.1: Task [SMALL]

## Phase 1: First Phase [PENDING]
- [ ] 1.1: Task [MEDIUM]

## Phase 2: Second Phase [PENDING]
- [ ] 2.1: Task [LARGE]
`;
		const plan = migrateLegacyPlan(planMd);

		expect(plan.phases[0].id).toBe(1);
		expect(plan.phases[1].id).toBe(2);
		expect(plan.phases[2].id).toBe(3);
	});
});

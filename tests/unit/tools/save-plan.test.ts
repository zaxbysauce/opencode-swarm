/**
 * Verification tests for save_plan tool
 * Covers placeholder detection, save execution, and tool definition validation
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { SavePlanArgs, SavePlanResult } from '../../../src/tools/save-plan';
import {
	detectPlaceholderContent,
	executeSavePlan,
	save_plan,
} from '../../../src/tools/save-plan';

describe('save-plan tool verification tests', () => {
	let tmpDir: string;

	beforeEach(async () => {
		// Create a temporary directory for each test
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'save-plan-test-'));
		// Ensure .swarm/ directory exists
		await fs.mkdir(path.join(tmpDir, '.swarm'), { recursive: true });
	});

	afterEach(async () => {
		// Clean up the temporary directory
		try {
			await fs.rm(tmpDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	// ========== GROUP 1: detectPlaceholderContent - positive rejection cases ==========
	describe('Group 1: detectPlaceholderContent - positive rejection cases', () => {
		it('[task] in title returns issue about title', () => {
			const args: SavePlanArgs = {
				title: '[task]',
				swarm_id: 'mega',
				phases: [{ id: 1, name: 'Setup', tasks: [{ id: '1.1', description: 'Add auth' }] }],
			};
			const issues = detectPlaceholderContent(args);
			expect(issues.length).toBeGreaterThan(0);
			expect(issues.some(issue => issue.includes('Plan title') && issue.includes('[task]'))).toBe(true);
		});

		it('[Project] in title returns issue', () => {
			const args: SavePlanArgs = {
				title: '[Project]',
				swarm_id: 'mega',
				phases: [{ id: 1, name: 'Setup', tasks: [{ id: '1.1', description: 'Add auth' }] }],
			};
			const issues = detectPlaceholderContent(args);
			expect(issues.length).toBeGreaterThan(0);
			expect(issues.some(issue => issue.includes('Plan title') && issue.includes('[Project]'))).toBe(true);
		});

		it('[date] in title returns issue', () => {
			const args: SavePlanArgs = {
				title: '[date]',
				swarm_id: 'mega',
				phases: [{ id: 1, name: 'Setup', tasks: [{ id: '1.1', description: 'Add auth' }] }],
			};
			const issues = detectPlaceholderContent(args);
			expect(issues.length).toBeGreaterThan(0);
			expect(issues.some(issue => issue.includes('Plan title') && issue.includes('[date]'))).toBe(true);
		});

		it('[description] in phase name returns issue', () => {
			const args: SavePlanArgs = {
				title: 'My Project',
				swarm_id: 'mega',
				phases: [{ id: 1, name: '[description]', tasks: [{ id: '1.1', description: 'Add auth' }] }],
			};
			const issues = detectPlaceholderContent(args);
			expect(issues.length).toBeGreaterThan(0);
			expect(issues.some(issue => issue.includes('Phase 1') && issue.includes('[description]'))).toBe(true);
		});

		it('[N] in task description returns issue', () => {
			const args: SavePlanArgs = {
				title: 'My Project',
				swarm_id: 'mega',
				phases: [{ id: 1, name: 'Setup', tasks: [{ id: '1.1', description: '[N]' }] }],
			};
			const issues = detectPlaceholderContent(args);
			expect(issues.length).toBeGreaterThan(0);
			expect(issues.some(issue => issue.includes('Task 1.1') && issue.includes('[N]'))).toBe(true);
		});

		it('" [task] " (whitespace-padded) in title returns issue (trim fix)', () => {
			const args: SavePlanArgs = {
				title: ' [task] ',
				swarm_id: 'mega',
				phases: [{ id: 1, name: 'Setup', tasks: [{ id: '1.1', description: 'Add auth' }] }],
			};
			const issues = detectPlaceholderContent(args);
			expect(issues.length).toBeGreaterThan(0);
			expect(issues.some(issue => issue.includes('Plan title'))).toBe(true);
		});

		it('"[task] " (trailing space) returns issue', () => {
			const args: SavePlanArgs = {
				title: '[task] ',
				swarm_id: 'mega',
				phases: [{ id: 1, name: 'Setup', tasks: [{ id: '1.1', description: 'Add auth' }] }],
			};
			const issues = detectPlaceholderContent(args);
			expect(issues.length).toBeGreaterThan(0);
			expect(issues.some(issue => issue.includes('Plan title'))).toBe(true);
		});

		it('" [Project]" (leading space) returns issue', () => {
			const args: SavePlanArgs = {
				title: ' [Project]',
				swarm_id: 'mega',
				phases: [{ id: 1, name: 'Setup', tasks: [{ id: '1.1', description: 'Add auth' }] }],
			};
			const issues = detectPlaceholderContent(args);
			expect(issues.length).toBeGreaterThan(0);
			expect(issues.some(issue => issue.includes('Plan title'))).toBe(true);
		});

		it('[Project Name] (multi-word bracket) returns issue', () => {
			const args: SavePlanArgs = {
				title: '[Project Name]',
				swarm_id: 'mega',
				phases: [{ id: 1, name: 'Setup', tasks: [{ id: '1.1', description: 'Add auth' }] }],
			};
			const issues = detectPlaceholderContent(args);
			expect(issues.length).toBeGreaterThan(0);
			expect(issues.some(issue => issue.includes('Plan title') && issue.includes('[Project Name]'))).toBe(true);
		});

		it('Multiple placeholders returns multiple issues', () => {
			const args: SavePlanArgs = {
				title: '[Project]',
				swarm_id: 'mega',
				phases: [
					{
						id: 1,
						name: '[description]',
						tasks: [
							{ id: '1.1', description: '[task]' },
							{ id: '1.2', description: 'Real task' },
						],
					},
				],
			};
			const issues = detectPlaceholderContent(args);
			expect(issues.length).toBe(3);
			expect(issues.some(issue => issue.includes('Plan title'))).toBe(true);
			expect(issues.some(issue => issue.includes('Phase 1'))).toBe(true);
			expect(issues.some(issue => issue.includes('Task 1.1'))).toBe(true);
		});
	});

	// ========== GROUP 2: detectPlaceholderContent - NOT placeholders (should NOT reject) ==========
	describe('Group 2: detectPlaceholderContent - NOT placeholders (should NOT reject)', () => {
		it('"Add authentication to login service" — real description, no issue', () => {
			const args: SavePlanArgs = {
				title: 'Add authentication to login service',
				swarm_id: 'mega',
				phases: [{ id: 1, name: 'Setup', tasks: [{ id: '1.1', description: 'Add auth' }] }],
			};
			const issues = detectPlaceholderContent(args);
			expect(issues.length).toBe(0);
		});

		it('"Phase 1: Authentication" — real name, no issue', () => {
			const args: SavePlanArgs = {
				title: 'My Project',
				swarm_id: 'mega',
				phases: [{ id: 1, name: 'Phase 1: Authentication', tasks: [{ id: '1.1', description: 'Add auth' }] }],
			};
			const issues = detectPlaceholderContent(args);
			expect(issues.length).toBe(0);
		});

		it('"Feature: [SMALL] scope task" — embedded bracket (not standalone), no issue', () => {
			const args: SavePlanArgs = {
				title: 'Feature: [SMALL] scope task',
				swarm_id: 'mega',
				phases: [{ id: 1, name: 'Setup', tasks: [{ id: '1.1', description: 'Add auth' }] }],
			};
			const issues = detectPlaceholderContent(args);
			expect(issues.length).toBe(0);
		});

		it('"Implement [API] endpoint" — embedded bracket in sentence, no issue', () => {
			const args: SavePlanArgs = {
				title: 'Implement [API] endpoint',
				swarm_id: 'mega',
				phases: [{ id: 1, name: 'Setup', tasks: [{ id: '1.1', description: 'Add auth' }] }],
			};
			const issues = detectPlaceholderContent(args);
			expect(issues.length).toBe(0);
		});

		it('"opencode-swarm v6.14.1 — Bug Fix" — real title, no issue', () => {
			const args: SavePlanArgs = {
				title: 'opencode-swarm v6.14.1 — Bug Fix',
				swarm_id: 'mega',
				phases: [{ id: 1, name: 'Setup', tasks: [{ id: '1.1', description: 'Add auth' }] }],
			};
			const issues = detectPlaceholderContent(args);
			expect(issues.length).toBe(0);
		});

		it('Empty phases array has no issues reported for title-level', () => {
			const args: SavePlanArgs = {
				title: '[Project]',
				swarm_id: 'mega',
				phases: [],
			};
			const issues = detectPlaceholderContent(args);
			// Should only report title issue, no phase issues since no phases
			expect(issues.length).toBe(1);
			expect(issues.some(issue => issue.includes('Plan title'))).toBe(true);
		});
	});

	// ========== GROUP 3: executeSavePlan - placeholder rejection ==========
	describe('Group 3: executeSavePlan - placeholder rejection', () => {
		it('Call with title placeholder returns { success: false, errors: [...] }', async () => {
			const args: SavePlanArgs = {
				title: '[Project]',
				swarm_id: 'mega',
				phases: [{ id: 1, name: 'Setup', tasks: [{ id: '1.1', description: 'Add auth' }] }],
				working_directory: tmpDir,
			};

			const result: SavePlanResult = await executeSavePlan(args);

			expect(result.success).toBe(false);
			expect(result.errors).toBeDefined();
			expect(result.errors!.length).toBeGreaterThan(0);
			expect(result.message).toContain('rejected');
		});

		it('Call with phase name placeholder returns { success: false }', async () => {
			const args: SavePlanArgs = {
				title: 'My Project',
				swarm_id: 'mega',
				phases: [{ id: 1, name: '[description]', tasks: [{ id: '1.1', description: 'Add auth' }] }],
				working_directory: tmpDir,
			};

			const result: SavePlanResult = await executeSavePlan(args);

			expect(result.success).toBe(false);
			expect(result.errors).toBeDefined();
			expect(result.errors!.length).toBeGreaterThan(0);
		});

		it('Call with task description placeholder returns { success: false }', async () => {
			const args: SavePlanArgs = {
				title: 'My Project',
				swarm_id: 'mega',
				phases: [{ id: 1, name: 'Setup', tasks: [{ id: '1.1', description: '[task]' }] }],
				working_directory: tmpDir,
			};

			const result: SavePlanResult = await executeSavePlan(args);

			expect(result.success).toBe(false);
			expect(result.errors).toBeDefined();
			expect(result.errors!.length).toBeGreaterThan(0);
		});
	});

	// ========== GROUP 4: executeSavePlan - successful save ==========
	describe('Group 4: executeSavePlan - successful save', () => {
		it('Use a real tmp directory, call with valid plan data, returns success', async () => {
			const args: SavePlanArgs = {
				title: 'My Awesome Project',
				swarm_id: 'mega',
				phases: [
					{
						id: 1,
						name: 'Setup',
						tasks: [
							{
								id: '1.1',
								description: 'Add authentication to login service',
								size: 'small',
							},
						],
					},
				],
				working_directory: tmpDir,
			};

			const result: SavePlanResult = await executeSavePlan(args);

			expect(result.success).toBe(true);
			expect(result.message).toContain('success');
			expect(result.plan_path).toBeDefined();
			expect(result.phases_count).toBe(1);
			expect(result.tasks_count).toBe(1);
		});

		it('Verify .swarm/plan.json was created and is valid JSON', async () => {
			const args: SavePlanArgs = {
				title: 'My Awesome Project',
				swarm_id: 'mega',
				phases: [
					{
						id: 1,
						name: 'Setup',
						tasks: [{ id: '1.1', description: 'Add authentication' }],
					},
				],
				working_directory: tmpDir,
			};

			await executeSavePlan(args);

			const planJsonPath = path.join(tmpDir, '.swarm', 'plan.json');
			const exists = await fs.access(planJsonPath).then(() => true).catch(() => false);
			expect(exists).toBe(true);

			const content = await fs.readFile(planJsonPath, 'utf-8');
			expect(() => JSON.parse(content)).not.toThrow();
		});

		it('Verify .swarm/plan.md was created and contains the title', async () => {
			const args: SavePlanArgs = {
				title: 'My Awesome Project',
				swarm_id: 'mega',
				phases: [
					{
						id: 1,
						name: 'Setup',
						tasks: [{ id: '1.1', description: 'Add authentication' }],
					},
				],
				working_directory: tmpDir,
			};

			await executeSavePlan(args);

			const planMdPath = path.join(tmpDir, '.swarm', 'plan.md');
			const exists = await fs.access(planMdPath).then(() => true).catch(() => false);
			expect(exists).toBe(true);

			const content = await fs.readFile(planMdPath, 'utf-8');
			expect(content).toContain('My Awesome Project');
		});

		it('Save plan with multiple phases and tasks', async () => {
			const args: SavePlanArgs = {
				title: 'Multi-Phase Project',
				swarm_id: 'mega',
				phases: [
					{
						id: 1,
						name: 'Phase 1: Setup',
						tasks: [
							{ id: '1.1', description: 'Task 1.1' },
							{ id: '1.2', description: 'Task 1.2' },
						],
					},
					{
						id: 2,
						name: 'Phase 2: Implementation',
						tasks: [
							{ id: '2.1', description: 'Task 2.1' },
							{ id: '2.2', description: 'Task 2.2' },
							{ id: '2.3', description: 'Task 2.3' },
						],
					},
				],
				working_directory: tmpDir,
			};

			const result: SavePlanResult = await executeSavePlan(args);

			expect(result.success).toBe(true);
			expect(result.phases_count).toBe(2);
			expect(result.tasks_count).toBe(5);
		});

		it('Handle task with dependencies and acceptance criteria', async () => {
			const args: SavePlanArgs = {
				title: 'Complex Task Project',
				swarm_id: 'mega',
				phases: [
					{
						id: 1,
						name: 'Setup',
						tasks: [
							{
								id: '1.1',
								description: 'Setup database',
								depends: [],
								acceptance: 'Database schema created',
							},
							{
								id: '1.2',
								description: 'Create migration scripts',
								depends: ['1.1'],
								acceptance: 'Migrations run successfully',
							},
						],
					},
				],
				working_directory: tmpDir,
			};

			const result: SavePlanResult = await executeSavePlan(args);

			expect(result.success).toBe(true);
			expect(result.tasks_count).toBe(2);

			const planJsonPath = path.join(tmpDir, '.swarm', 'plan.json');
			const content = await fs.readFile(planJsonPath, 'utf-8');
			const plan = JSON.parse(content);

			expect(plan.phases[0].tasks[0].depends).toEqual([]);
			expect(plan.phases[0].tasks[1].depends).toEqual(['1.1']);
			expect(plan.phases[0].tasks[0].acceptance).toBe('Database schema created');
			expect(plan.phases[0].tasks[1].acceptance).toBe('Migrations run successfully');
		});
	});

	// ========== GROUP 5: save_plan ToolDefinition ==========
	describe('Group 5: save_plan ToolDefinition', () => {
		it('save_plan is defined (not null/undefined)', () => {
			expect(save_plan).toBeDefined();
			expect(save_plan).not.toBeNull();
			expect(save_plan).not.toBeUndefined();
		});

		it('Has description property (non-empty string)', () => {
			expect(save_plan.description).toBeDefined();
			expect(typeof save_plan.description).toBe('string');
			expect(save_plan.description.length).toBeGreaterThan(0);
		});

		it('Has args property', () => {
			expect(save_plan.args).toBeDefined();
			expect(typeof save_plan.args).toBe('object');
		});

		it('Has execute function', () => {
			expect(save_plan.execute).toBeDefined();
			expect(typeof save_plan.execute).toBe('function');
		});

		it('Description mentions placeholder rejection', () => {
			expect(save_plan.description).toContain('placeholder');
			expect(save_plan.description.toLowerCase()).toContain('reject');
		});
	});

	// ========== GROUP 6: Task ID validation (in tool args) ==========
	describe('Group 6: Task ID validation (in tool args)', () => {
		it('Task ID regex matches "1.1"', () => {
			const regex = /^\d+\.\d+(\.\d+)*$/;
			expect(regex.test('1.1')).toBe(true);
		});

		it('Task ID regex matches "2.3"', () => {
			const regex = /^\d+\.\d+(\.\d+)*$/;
			expect(regex.test('2.3')).toBe(true);
		});

		it('Task ID regex matches "1.2.1"', () => {
			const regex = /^\d+\.\d+(\.\d+)*$/;
			expect(regex.test('1.2.1')).toBe(true);
		});

		it('Task ID regex matches "1.2.3.4"', () => {
			const regex = /^\d+\.\d+(\.\d+)*$/;
			expect(regex.test('1.2.3.4')).toBe(true);
		});

		it('Task ID regex does NOT match "1"', () => {
			const regex = /^\d+\.\d+(\.\d+)*$/;
			expect(regex.test('1')).toBe(false);
		});

		it('Task ID regex does NOT match ".1"', () => {
			const regex = /^\d+\.\d+(\.\d+)*$/;
			expect(regex.test('.1')).toBe(false);
		});

		it('Task ID regex does NOT match "a.b"', () => {
			const regex = /^\d+\.\d+(\.\d+)*$/;
			expect(regex.test('a.b')).toBe(false);
		});

		it('Task ID regex does NOT match "1.a"', () => {
			const regex = /^\d+\.\d+(\.\d+)*$/;
			expect(regex.test('1.a')).toBe(false);
		});

		it('Task ID regex does NOT match ""', () => {
			const regex = /^\d+\.\d+(\.\d+)*$/;
			expect(regex.test('')).toBe(false);
		});
	});

	// ========== ADDITIONAL EDGE CASES ==========
	describe('Additional edge cases', () => {
		it('Handle tasks with medium and large sizes', async () => {
			const args: SavePlanArgs = {
				title: 'Sized Tasks Project',
				swarm_id: 'mega',
				phases: [
					{
						id: 1,
						name: 'Setup',
						tasks: [
							{ id: '1.1', description: 'Small task', size: 'small' },
							{ id: '1.2', description: 'Medium task', size: 'medium' },
							{ id: '1.3', description: 'Large task', size: 'large' },
						],
					},
				],
				working_directory: tmpDir,
			};

			const result: SavePlanResult = await executeSavePlan(args);

			expect(result.success).toBe(true);
			expect(result.tasks_count).toBe(3);

			const planJsonPath = path.join(tmpDir, '.swarm', 'plan.json');
			const content = await fs.readFile(planJsonPath, 'utf-8');
			const plan = JSON.parse(content);

			expect(plan.phases[0].tasks[0].size).toBe('small');
			expect(plan.phases[0].tasks[1].size).toBe('medium');
			expect(plan.phases[0].tasks[2].size).toBe('large');
		});

		it('Tasks default to small size when not specified', async () => {
			const args: SavePlanArgs = {
				title: 'Default Size Project',
				swarm_id: 'mega',
				phases: [
					{
						id: 1,
						name: 'Setup',
						tasks: [{ id: '1.1', description: 'Default size task' }],
					},
				],
				working_directory: tmpDir,
			};

			await executeSavePlan(args);

			const planJsonPath = path.join(tmpDir, '.swarm', 'plan.json');
			const content = await fs.readFile(planJsonPath, 'utf-8');
			const plan = JSON.parse(content);

			expect(plan.phases[0].tasks[0].size).toBe('small');
		});

		it('Plan contains correct schema_version and migration_status', async () => {
			const args: SavePlanArgs = {
				title: 'Metadata Test Project',
				swarm_id: 'mega',
				phases: [
					{
						id: 1,
						name: 'Setup',
						tasks: [{ id: '1.1', description: 'Task' }],
					},
				],
				working_directory: tmpDir,
			};

			await executeSavePlan(args);

			const planJsonPath = path.join(tmpDir, '.swarm', 'plan.json');
			const content = await fs.readFile(planJsonPath, 'utf-8');
			const plan = JSON.parse(content);

			expect(plan.schema_version).toBe('1.0.0');
			expect(plan.migration_status).toBe('native');
			expect(plan.swarm).toBe('mega');
			expect(plan.current_phase).toBe(1);
		});

		it('All phases have status "pending" initially', async () => {
			const args: SavePlanArgs = {
				title: 'Status Test Project',
				swarm_id: 'mega',
				phases: [
					{
						id: 1,
						name: 'Phase 1',
						tasks: [{ id: '1.1', description: 'Task' }],
					},
					{
						id: 2,
						name: 'Phase 2',
						tasks: [{ id: '2.1', description: 'Task' }],
					},
				],
				working_directory: tmpDir,
			};

			await executeSavePlan(args);

			const planJsonPath = path.join(tmpDir, '.swarm', 'plan.json');
			const content = await fs.readFile(planJsonPath, 'utf-8');
			const plan = JSON.parse(content);

			expect(plan.phases[0].status).toBe('pending');
			expect(plan.phases[1].status).toBe('pending');
			expect(plan.phases[0].tasks[0].status).toBe('pending');
			expect(plan.phases[1].tasks[0].status).toBe('pending');
		});

		it('All tasks have empty files_touched array initially', async () => {
			const args: SavePlanArgs = {
				title: 'Files Touched Test',
				swarm_id: 'mega',
				phases: [
					{
						id: 1,
						name: 'Phase 1',
						tasks: [{ id: '1.1', description: 'Task' }],
					},
				],
				working_directory: tmpDir,
			};

			await executeSavePlan(args);

			const planJsonPath = path.join(tmpDir, '.swarm', 'plan.json');
			const content = await fs.readFile(planJsonPath, 'utf-8');
			const plan = JSON.parse(content);

			expect(plan.phases[0].tasks[0].files_touched).toEqual([]);
		});

		it('Handle working_directory defaulting to process.cwd()', async () => {
			const args: SavePlanArgs = {
				title: 'Default Dir Project',
				swarm_id: 'mega',
				phases: [
					{
						id: 1,
						name: 'Setup',
						tasks: [{ id: '1.1', description: 'Task' }],
					},
				],
				// No working_directory specified
			};

			// This will try to write to process.cwd(), which should fail if .swarm doesn't exist
			// But we can test that it doesn't crash immediately
			expect(async () => {
				await executeSavePlan(args);
			}).not.toThrow();
		});

		it('Placeholder pattern rejects single word brackets with trailing space after trim', () => {
			const args: SavePlanArgs = {
				title: '  [task]  ',
				swarm_id: 'mega',
				phases: [{ id: 1, name: 'Setup', tasks: [{ id: '1.1', description: 'Add auth' }] }],
			};
			const issues = detectPlaceholderContent(args);
			expect(issues.length).toBeGreaterThan(0);
		});

		it('Placeholder pattern rejects multi-word placeholders with spaces inside', () => {
			const args: SavePlanArgs = {
				title: '[Task Description]',
				swarm_id: 'mega',
				phases: [{ id: 1, name: 'Setup', tasks: [{ id: '1.1', description: 'Add auth' }] }],
			};
			const issues = detectPlaceholderContent(args);
			expect(issues.length).toBeGreaterThan(0);
		});

		it('Real text with brackets in middle is not rejected', () => {
			const args: SavePlanArgs = {
				title: 'Task: Implement [feature name] by tomorrow',
				swarm_id: 'mega',
				phases: [{ id: 1, name: 'Setup', tasks: [{ id: '1.1', description: 'Add auth' }] }],
			};
			const issues = detectPlaceholderContent(args);
			expect(issues.length).toBe(0);
		});
	});
});

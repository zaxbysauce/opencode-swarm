import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
	validateStatus,
	validateTaskId,
	executeUpdateTaskStatus,
	type UpdateTaskStatusArgs,
} from '../../../src/tools/update-task-status';

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

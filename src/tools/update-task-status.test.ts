import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resetSwarmState } from '../state';
import { executeUpdateTaskStatus } from './update-task-status';

let tmpDir: string;

beforeEach(() => {
	tmpDir = mkdtempSync(path.join(os.tmpdir(), 'uts-guard-test-'));
	mkdirSync(path.join(tmpDir, '.swarm'), { recursive: true });
	writeFileSync(
		path.join(tmpDir, '.swarm', 'plan.json'),
		JSON.stringify({
			schema_version: '1.0.0',
			title: 'Guard Test Plan',
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
							status: 'in_progress',
							size: 'small',
							description: 'test task',
							depends: [],
							files_touched: [],
						},
						{
							id: '1.2',
							phase: 1,
							status: 'pending',
							size: 'small',
							description: 'another task',
							depends: [],
							files_touched: [],
						},
					],
				},
			],
		}),
	);
});

afterEach(() => {
	resetSwarmState();
	try {
		rmSync(tmpDir, { recursive: true, force: true });
	} catch {
		/* best effort */
	}
});

describe('executeUpdateTaskStatus fallbackDir guard', () => {
	// ── 1. Guard fires when fallbackDir is undefined and no working_directory ──

	it('console.warn fires when fallbackDir is undefined and working_directory is not provided', async () => {
		const warns: string[] = [];
		const originalWarn = console.warn;
		console.warn = (...args: unknown[]) => {
			warns.push(args[0] as string);
		};

		try {
			// Call WITHOUT fallbackDir AND without working_directory in args
			await executeUpdateTaskStatus({
				task_id: '1.1',
				status: 'pending',
				// no working_directory
			});

			expect(warns.some((w) => w.includes('fallbackDir is undefined'))).toBe(
				true,
			);
		} finally {
			console.warn = originalWarn;
		}
	});

	it('console.warn fires with the exact expected message format', async () => {
		const warns: string[] = [];
		const originalWarn = console.warn;
		console.warn = (...args: unknown[]) => {
			warns.push(args[0] as string);
		};

		try {
			await executeUpdateTaskStatus({
				task_id: '1.1',
				status: 'pending',
			});

			const fallbackWarns = warns.filter((w) => w.includes('fallbackDir'));
			expect(fallbackWarns.length).toBeGreaterThanOrEqual(1);
			expect(fallbackWarns[0]).toBe(
				'[update-task-status] fallbackDir is undefined',
			);
		} finally {
			console.warn = originalWarn;
		}
	});

	// ── 2. Guard does NOT fire when fallbackDir IS provided ──

	it('no console.warn when fallbackDir is provided (working_directory not in args)', async () => {
		const warns: string[] = [];
		const originalWarn = console.warn;
		console.warn = (...args: unknown[]) => {
			warns.push(args[0] as string);
		};

		try {
			// Call WITH fallbackDir, but without working_directory
			await executeUpdateTaskStatus(
				{
					task_id: '1.1',
					status: 'pending',
				},
				tmpDir, // fallbackDir IS provided
			);

			const fallbackWarns = warns.filter((w) => w.includes('fallbackDir'));
			expect(fallbackWarns).toHaveLength(0);
		} finally {
			console.warn = originalWarn;
		}
	});

	it('no console.warn when fallbackDir is provided even with undefined working_directory', async () => {
		const warns: string[] = [];
		const originalWarn = console.warn;
		console.warn = (...args: unknown[]) => {
			warns.push(args[0] as string);
		};

		try {
			await executeUpdateTaskStatus(
				{
					task_id: '1.1',
					status: 'pending',
					working_directory: undefined,
				},
				tmpDir,
			);

			const fallbackWarns = warns.filter((w) => w.includes('fallbackDir'));
			expect(fallbackWarns).toHaveLength(0);
		} finally {
			console.warn = originalWarn;
		}
	});

	// ── 3. working_directory path (if branch) is still correct ──

	it('uses working_directory when provided (guard does not fire)', async () => {
		const warns: string[] = [];
		const originalWarn = console.warn;
		console.warn = (...args: unknown[]) => {
			warns.push(args[0] as string);
		};

		try {
			const result = await executeUpdateTaskStatus({
				task_id: '1.1',
				status: 'pending',
				working_directory: tmpDir,
			});

			// Guard should NOT fire when working_directory is provided
			const fallbackWarns = warns.filter((w) => w.includes('fallbackDir'));
			expect(fallbackWarns).toHaveLength(0);

			// Should succeed
			expect(result.success).toBe(true);
		} finally {
			console.warn = originalWarn;
		}
	});

	it('successfully updates task when working_directory is valid', async () => {
		const result = await executeUpdateTaskStatus({
			task_id: '1.1',
			status: 'pending',
			working_directory: tmpDir,
		});

		expect(result.success).toBe(true);
		expect(result.task_id).toBe('1.1');
		expect(result.new_status).toBe('pending');
	});

	it('falls back to process.cwd() when fallbackDir is undefined (result is still correct)', async () => {
		// This test verifies that even when the guard fires, the function
		// still produces a valid result by falling back to process.cwd()
		const warns: string[] = [];
		const originalWarn = console.warn;
		console.warn = (...args: unknown[]) => {
			warns.push(args[0] as string);
		};

		try {
			const result = await executeUpdateTaskStatus({
				task_id: '1.1',
				status: 'pending',
			});

			// Guard fires
			expect(warns.some((w) => w.includes('fallbackDir is undefined'))).toBe(
				true,
			);
			// But the result should still be a valid response (not thrown)
			expect(result).toBeDefined();
			expect(typeof result.success).toBe('boolean');
		} finally {
			console.warn = originalWarn;
		}
	});

	// ── 4. Guard behavior with explicit undefined vs missing key ──

	it('guard fires when fallbackDir is explicitly passed as undefined', async () => {
		const warns: string[] = [];
		const originalWarn = console.warn;
		console.warn = (...args: unknown[]) => {
			warns.push(args[0] as string);
		};

		try {
			await executeUpdateTaskStatus(
				{
					task_id: '1.1',
					status: 'pending',
				},
				undefined, // explicitly undefined
			);

			expect(warns.some((w) => w.includes('fallbackDir is undefined'))).toBe(
				true,
			);
		} finally {
			console.warn = originalWarn;
		}
	});

	it('guard does NOT fire when fallbackDir is explicitly passed as a valid string', async () => {
		const warns: string[] = [];
		const originalWarn = console.warn;
		console.warn = (...args: unknown[]) => {
			warns.push(args[0] as string);
		};

		try {
			await executeUpdateTaskStatus(
				{
					task_id: '1.1',
					status: 'pending',
				},
				tmpDir, // valid directory string
			);

			const fallbackWarns = warns.filter((w) => w.includes('fallbackDir'));
			expect(fallbackWarns).toHaveLength(0);
		} finally {
			console.warn = originalWarn;
		}
	});
});

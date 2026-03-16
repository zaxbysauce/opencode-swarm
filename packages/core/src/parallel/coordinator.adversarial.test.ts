import { beforeEach, describe, expect, mock, test } from 'bun:test';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { ExecutionCoordinator } from './coordinator.js';

describe('ExecutionCoordinator - Adversarial Tests', () => {
	let coordinator: ExecutionCoordinator;
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(tmpdir(), 'coordinator-adversarial-'));
		coordinator = new ExecutionCoordinator(tempDir);
	});

	// ═══════════════════════════════════════════════════════════════════
	// INVALID INPUTS - File/Path attacks
	// ═══════════════════════════════════════════════════════════════════

	test('non-existent plan file returns empty execution plan', () => {
		const result = coordinator.planParallelExecution(
			'/nonexistent/path/plan.json',
		);
		expect(result.waves).toEqual([]);
		expect(result.estimatedWaves).toBe(0);
		expect(result.serialFallbacks).toEqual([]);
	});

	test('empty string path returns empty execution plan', () => {
		const result = coordinator.planParallelExecution('');
		expect(result.waves).toEqual([]);
	});

	test('null-like string path returns empty execution plan', () => {
		const result = coordinator.planParallelExecution('/dev/null');
		expect(result.waves).toEqual([]);
	});

	// ═══════════════════════════════════════════════════════════════════
	// MALFORMED PLAN DATA - JSON attacks
	// ═══════════════════════════════════════════════════════════════════

	test('invalid JSON file returns empty execution plan', () => {
		const planPath = path.join(tempDir, 'invalid.json');
		fs.writeFileSync(planPath, '{ invalid json content }');
		const result = coordinator.planParallelExecution(planPath);
		expect(result.waves).toEqual([]);
	});

	test('empty JSON object returns empty execution plan', () => {
		const planPath = path.join(tempDir, 'empty.json');
		fs.writeFileSync(planPath, '{}');
		const result = coordinator.planParallelExecution(planPath);
		expect(result.waves).toEqual([]);
	});

	test('plan with missing phases key returns empty execution plan', () => {
		const planPath = path.join(tempDir, 'nophases.json');
		fs.writeFileSync(planPath, JSON.stringify({}));
		const result = coordinator.planParallelExecution(planPath);
		expect(result.waves).toEqual([]);
	});

	test('plan with null phases returns empty execution plan', () => {
		const planPath = path.join(tempDir, 'nullphases.json');
		fs.writeFileSync(planPath, JSON.stringify({ phases: null }));
		const result = coordinator.planParallelExecution(planPath);
		expect(result.waves).toEqual([]);
	});

	test('plan with undefined phases returns empty execution plan', () => {
		const planPath = path.join(tempDir, 'undefinedphases.json');
		fs.writeFileSync(planPath, JSON.stringify({ phases: undefined }));
		const result = coordinator.planParallelExecution(planPath);
		expect(result.waves).toEqual([]);
	});

	test('plan with empty phases array returns empty execution plan', () => {
		const planPath = path.join(tempDir, 'emptystages.json');
		fs.writeFileSync(planPath, JSON.stringify({ phases: [] }));
		const result = coordinator.planParallelExecution(planPath);
		expect(result.waves).toEqual([]);
	});

	test('phase with missing id still creates task with undefined phase', () => {
		const planPath = path.join(tempDir, 'missingphaseid.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({ phases: [{ tasks: [{ id: 'task1' }] }] }),
		);
		const result = coordinator.planParallelExecution(planPath);
		// Task is still included but with undefined phase
		expect(result.waves.length).toBe(1);
		expect(result.waves[0][0].id).toBe('task1');
		expect(result.waves[0][0].phase).toBeUndefined();
	});

	// ═══════════════════════════════════════════════════════════════════
	// MALFORMED TASK DATA
	// ═══════════════════════════════════════════════════════════════════

	test('task with missing id is filtered out', () => {
		const planPath = path.join(tempDir, 'missingid.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{
						id: 1,
						tasks: [{ description: 'valid task' }, { id: 'task2' }],
					},
				],
			}),
		);
		const result = coordinator.planParallelExecution(planPath);
		expect(result.waves.length).toBe(1);
		expect(result.waves[0].length).toBe(1);
		expect(result.waves[0][0].id).toBe('task2');
	});

	test('task with null id is filtered out', () => {
		const planPath = path.join(tempDir, 'nullid.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({
				phases: [{ id: 1, tasks: [{ id: null }, { id: 'valid' }] }],
			}),
		);
		const result = coordinator.planParallelExecution(planPath);
		expect(result.waves[0].length).toBe(1);
		expect(result.waves[0][0].id).toBe('valid');
	});

	test('task with undefined id is filtered out', () => {
		const planPath = path.join(tempDir, 'undefinedid.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({
				phases: [{ id: 1, tasks: [{ id: undefined }, { id: 'valid' }] }],
			}),
		);
		const result = coordinator.planParallelExecution(planPath);
		expect(result.waves[0].length).toBe(1);
		expect(result.waves[0][0].id).toBe('valid');
	});

	test('task with numeric id is filtered out', () => {
		const planPath = path.join(tempDir, 'numericip.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({
				phases: [{ id: 1, tasks: [{ id: 12345 }, { id: 'valid' }] }],
			}),
		);
		const result = coordinator.planParallelExecution(planPath);
		expect(result.waves[0].length).toBe(1);
		expect(result.waves[0][0].id).toBe('valid');
	});

	test('task with empty string id is filtered out', () => {
		const planPath = path.join(tempDir, 'emptyid.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({
				phases: [{ id: 1, tasks: [{ id: '' }, { id: 'valid' }] }],
			}),
		);
		const result = coordinator.planParallelExecution(planPath);
		expect(result.waves[0].length).toBe(1);
		expect(result.waves[0][0].id).toBe('valid');
	});

	test('task with numeric dependency - valid task still executes', () => {
		const planPath = path.join(tempDir, 'invaliddepends.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{
						id: 1,
						tasks: [{ id: 'task1', depends: [123, 'task2'] }, { id: 'task2' }],
					},
				],
			}),
		);
		// Numeric depends cause issue in dependency-graph but valid tasks still execute
		// task2 runs first (no deps), then task1 (has task2 as dep via index iteration issue)
		const result = coordinator.planParallelExecution(planPath);
		expect(result.waves.length).toBe(2);
		expect(result.waves[0].map((t) => t.id)).toContain('task2');
		expect(result.waves[1].map((t) => t.id)).toContain('task1');
	});

	test('task with empty depends array is valid', () => {
		const planPath = path.join(tempDir, 'emptydepends.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({
				phases: [{ id: 1, tasks: [{ id: 'task1', depends: [] }] }],
			}),
		);
		const result = coordinator.planParallelExecution(planPath);
		expect(result.waves.length).toBe(1);
		expect(result.waves[0][0].id).toBe('task1');
	});

	test('task with null depends becomes empty array', () => {
		const planPath = path.join(tempDir, 'nulldepends.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({
				phases: [{ id: 1, tasks: [{ id: 'task1', depends: null }] }],
			}),
		);
		const result = coordinator.planParallelExecution(planPath);
		expect(result.waves[0][0].depends).toEqual([]);
	});

	test('task with undefined depends becomes empty array', () => {
		const planPath = path.join(tempDir, 'undefineddepends.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({
				phases: [{ id: 1, tasks: [{ id: 'task1', depends: undefined }] }],
			}),
		);
		const result = coordinator.planParallelExecution(planPath);
		expect(result.waves[0][0].depends).toEqual([]);
	});

	test('task with object depends throws TypeError during parsing', () => {
		const planPath = path.join(tempDir, 'objectdepends.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{ id: 1, tasks: [{ id: 'task1', depends: { invalid: 'type' } }] },
				],
			}),
		);
		// Object depends cause TypeError in dependency-graph.ts when iterating
		expect(() => coordinator.planParallelExecution(planPath)).toThrow(
			TypeError,
		);
	});

	test('task with invalid status defaults to pending', () => {
		const planPath = path.join(tempDir, 'invalidstatus.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({
				phases: [{ id: 1, tasks: [{ id: 'task1', status: 'invalid_status' }] }],
			}),
		);
		const result = coordinator.planParallelExecution(planPath);
		expect(result.waves[0][0].status).toBe('pending');
	});

	test('task with null status defaults to pending', () => {
		const planPath = path.join(tempDir, 'nullstatus.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({
				phases: [{ id: 1, tasks: [{ id: 'task1', status: null }] }],
			}),
		);
		const result = coordinator.planParallelExecution(planPath);
		expect(result.waves[0][0].status).toBe('pending');
	});

	// ═══════════════════════════════════════════════════════════════════
	// MISSING DEPENDENCIES
	// ═══════════════════════════════════════════════════════════════════

	test('task depends on non-existent task - dependency filtered out', () => {
		const planPath = path.join(tempDir, 'missingdep.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{
						id: 1,
						tasks: [{ id: 'task1', depends: ['nonexistent'] }, { id: 'task2' }],
					},
				],
			}),
		);
		const result = coordinator.planParallelExecution(planPath);
		const task1 = result.waves[0]?.find((t) => t.id === 'task1');
		// nonexistent should be filtered out - task1 has no valid depends
		expect(task1?.depends).toEqual([]);
	});

	test('task depends on non-existent and valid tasks - only valid kept', () => {
		const planPath = path.join(tempDir, 'mixeddeps.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{
						id: 1,
						tasks: [
							{ id: 'task1', depends: ['missing', 'task2'] },
							{ id: 'task2' },
						],
					},
				],
			}),
		);
		const result = coordinator.planParallelExecution(planPath);
		// task1 depends on task2, so two waves: task2 first, then task1
		expect(result.waves.length).toBe(2);
		expect(result.waves[0].map((t) => t.id)).toContain('task2');
		expect(result.waves[1].map((t) => t.id)).toContain('task1');
		// Check the depends were filtered
		const task1 = result.waves[1].find((t) => t.id === 'task1');
		expect(task1?.depends).toEqual(['task2']);
	});

	test('task with empty string dependency filtered out', () => {
		const planPath = path.join(tempDir, 'emptystringdep.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{
						id: 1,
						tasks: [{ id: 'task1', depends: ['', 'task2'] }, { id: 'task2' }],
					},
				],
			}),
		);
		const result = coordinator.planParallelExecution(planPath);
		// task1 depends on task2 (empty string filtered), creating 2 waves
		expect(result.waves.length).toBe(2);
		expect(result.waves[0].map((t) => t.id)).toContain('task2');
		expect(result.waves[1].map((t) => t.id)).toContain('task1');
		const task1 = result.waves[1].find((t) => t.id === 'task1');
		expect(task1?.depends).toEqual(['task2']);
	});

	// ═══════════════════════════════════════════════════════════════════
	// CIRCULAR DEPENDENCIES
	// ═══════════════════════════════════════════════════════════════════

	test('direct circular dependency A → A detected and handled', () => {
		const planPath = path.join(tempDir, 'selfref.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({
				phases: [{ id: 1, tasks: [{ id: 'task1', depends: ['task1'] }] }],
			}),
		);
		const result = coordinator.planParallelExecution(planPath);
		// Circular task should go to serialFallbacks
		expect(result.serialFallbacks).toContain('task1');
		expect(result.waves).toEqual([]);
	});

	test('circular dependency A → B → A detected and handled', () => {
		const planPath = path.join(tempDir, 'cycle_ab.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{
						id: 1,
						tasks: [
							{ id: 'taskA', depends: ['taskB'] },
							{ id: 'taskB', depends: ['taskA'] },
						],
					},
				],
			}),
		);
		const result = coordinator.planParallelExecution(planPath);
		// Both should be in serialFallbacks
		expect(result.serialFallbacks).toContain('taskA');
		expect(result.serialFallbacks).toContain('taskB');
	});

	test('circular dependency A → B → C → A detected and handled', () => {
		const planPath = path.join(tempDir, 'cycle_abc.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{
						id: 1,
						tasks: [
							{ id: 'taskA', depends: ['taskB'] },
							{ id: 'taskB', depends: ['taskC'] },
							{ id: 'taskC', depends: ['taskA'] },
						],
					},
				],
			}),
		);
		const result = coordinator.planParallelExecution(planPath);
		expect(result.serialFallbacks).toContain('taskA');
		expect(result.serialFallbacks).toContain('taskB');
		expect(result.serialFallbacks).toContain('taskC');
	});

	test('longer circular chain A → B → C → D → A detected', () => {
		const planPath = path.join(tempDir, 'cycle_long.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{
						id: 1,
						tasks: [
							{ id: 'A', depends: ['B'] },
							{ id: 'B', depends: ['C'] },
							{ id: 'C', depends: ['D'] },
							{ id: 'D', depends: ['A'] },
						],
					},
				],
			}),
		);
		const result = coordinator.planParallelExecution(planPath);
		expect(result.serialFallbacks).toContain('A');
		expect(result.serialFallbacks).toContain('B');
		expect(result.serialFallbacks).toContain('C');
		expect(result.serialFallbacks).toContain('D');
	});

	test('mixed valid deps and circular deps - only circular in serialFallbacks', () => {
		const planPath = path.join(tempDir, 'mixed_circular.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{
						id: 1,
						tasks: [
							{ id: 'validTask' },
							{ id: 'circularA', depends: ['circularB'] },
							{ id: 'circularB', depends: ['circularA'] },
						],
					},
				],
			}),
		);
		const result = coordinator.planParallelExecution(planPath);
		expect(result.serialFallbacks).toContain('circularA');
		expect(result.serialFallbacks).toContain('circularB');
		// validTask should not be in serialFallbacks
		expect(result.serialFallbacks).not.toContain('validTask');
	});

	test('tasks depending on circular tasks are handled correctly', () => {
		const planPath = path.join(tempDir, 'dep_on_circular.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{
						id: 1,
						tasks: [
							{ id: 'circularA', depends: ['circularB'] },
							{ id: 'circularB', depends: ['circularA'] },
							{ id: 'dependent', depends: ['circularA'] },
						],
					},
				],
			}),
		);
		const result = coordinator.planParallelExecution(planPath);
		// circular tasks should be in serialFallbacks
		expect(result.serialFallbacks).toContain('circularA');
		expect(result.serialFallbacks).toContain('circularB');
		// dependent should NOT be in serialFallbacks, should be in waves after circular complete
		expect(result.serialFallbacks).not.toContain('dependent');
	});

	// ═══════════════════════════════════════════════════════════════════
	// EMPTY GRAPHS
	// ═══════════════════════════════════════════════════════════════════

	test('completely empty plan returns empty result', () => {
		const planPath = path.join(tempDir, 'emptyplan.json');
		fs.writeFileSync(planPath, JSON.stringify({ phases: [] }));
		const result = coordinator.planParallelExecution(planPath);
		expect(result.waves).toEqual([]);
		expect(result.estimatedWaves).toBe(0);
		expect(result.serialFallbacks).toEqual([]);
	});

	test('phase with no tasks returns empty waves', () => {
		const planPath = path.join(tempDir, 'notasks.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({ phases: [{ id: 1, tasks: [] }] }),
		);
		const result = coordinator.planParallelExecution(planPath);
		expect(result.waves).toEqual([]);
	});

	test('phase with only invalid tasks returns empty waves', () => {
		const planPath = path.join(tempDir, 'onlyinvalid.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{
						id: 1,
						tasks: [{ description: 'no id' }, { id: null }, { id: 123 }],
					},
				],
			}),
		);
		const result = coordinator.planParallelExecution(planPath);
		expect(result.waves).toEqual([]);
	});

	// ═══════════════════════════════════════════════════════════════════
	// OVERSIZED DEPENDENCY CHAINS
	// ═══════════════════════════════════════════════════════════════════

	test('deep dependency chain (100 levels) executes correctly', () => {
		const planPath = path.join(tempDir, 'deepchain.json');
		const tasks: Array<{ id: string; depends: string[] }> = [];
		for (let i = 0; i < 100; i++) {
			tasks.push({
				id: `task${i}`,
				depends: i > 0 ? [`task${i - 1}`] : [],
			});
		}
		fs.writeFileSync(planPath, JSON.stringify({ phases: [{ id: 1, tasks }] }));
		const result = coordinator.planParallelExecution(planPath);
		// Each task should be in its own wave due to linear dependency
		expect(result.estimatedWaves).toBe(100);
		expect(result.waves.length).toBe(100);
	});

	test('wide parallel tasks (100 parallel) execute in single wave', () => {
		const planPath = path.join(tempDir, 'wideparallel.json');
		const tasks: Array<{ id: string; depends: string[] }> = [];
		for (let i = 0; i < 100; i++) {
			tasks.push({ id: `task${i}`, depends: [] });
		}
		fs.writeFileSync(planPath, JSON.stringify({ phases: [{ id: 1, tasks }] }));
		const result = coordinator.planParallelExecution(planPath);
		// All tasks should be in a single wave
		expect(result.estimatedWaves).toBe(1);
		expect(result.waves.length).toBe(1);
		expect(result.waves[0].length).toBe(100);
	});

	test('diamond dependency pattern (A→B,C→D with B,C→D)', () => {
		const planPath = path.join(tempDir, 'diamond.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{
						id: 1,
						tasks: [
							{ id: 'A', depends: [] },
							{ id: 'B', depends: ['A'] },
							{ id: 'C', depends: ['A'] },
							{ id: 'D', depends: ['B', 'C'] },
						],
					},
				],
			}),
		);
		const result = coordinator.planParallelExecution(planPath);
		// Should have 3 waves: A alone, B+C parallel, D alone
		expect(result.estimatedWaves).toBe(3);
		expect(result.waves[0].map((t) => t.id)).toEqual(['A']);
		expect(result.waves[1].map((t) => t.id).sort()).toEqual(['B', 'C']);
		expect(result.waves[2].map((t) => t.id)).toEqual(['D']);
	});

	// ═══════════════════════════════════════════════════════════════════
	// UNICODE AND SPECIAL CHARACTERS
	// ═══════════════════════════════════════════════════════════════════

	test('task ID with Unicode characters works', () => {
		const planPath = path.join(tempDir, 'unicode.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({
				phases: [{ id: 1, tasks: [{ id: '任务1', depends: [] }] }],
			}),
		);
		const result = coordinator.planParallelExecution(planPath);
		expect(result.waves[0][0].id).toBe('任务1');
	});

	test('task ID with emoji works', () => {
		const planPath = path.join(tempDir, 'emoji.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({
				phases: [{ id: 1, tasks: [{ id: 'task🚀', depends: [] }] }],
			}),
		);
		const result = coordinator.planParallelExecution(planPath);
		expect(result.waves[0][0].id).toBe('task🚀');
	});

	test('task description with special characters works', () => {
		const planPath = path.join(tempDir, 'specialchars.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{
						id: 1,
						tasks: [
							{
								id: 'task1',
								description: 'Task with <script>alert(1)</script> and "quotes"',
								depends: [],
							},
						],
					},
				],
			}),
		);
		const result = coordinator.planParallelExecution(planPath);
		expect(result.waves[0][0].description).toBe(
			'Task with <script>alert(1)</script> and "quotes"',
		);
	});

	// ═══════════════════════════════════════════════════════════════════
	// EDGE CASES
	// ═══════════════════════════════════════════════════════════════════

	test('duplicate task IDs - second overwrites first', () => {
		const planPath = path.join(tempDir, 'duplicateid.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{
						id: 1,
						tasks: [
							{ id: 'task1', description: 'first' },
							{ id: 'task1', description: 'second' },
						],
					},
				],
			}),
		);
		const result = coordinator.planParallelExecution(planPath);
		// Only one task should exist (the second overwrites)
		const task1Count =
			result.waves[0]?.filter((t) => t.id === 'task1').length || 0;
		expect(task1Count).toBe(1);
	});

	test('task depends on itself in array (self-reference)', () => {
		const planPath = path.join(tempDir, 'selfarray.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{
						id: 1,
						tasks: [{ id: 'task1', depends: ['task1'] }],
					},
				],
			}),
		);
		const result = coordinator.planParallelExecution(planPath);
		// Self-reference creates a cycle
		expect(result.serialFallbacks).toContain('task1');
	});

	test('task with negative phase ID works', () => {
		const planPath = path.join(tempDir, 'negativephase.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({
				phases: [{ id: -1, tasks: [{ id: 'task1', depends: [] }] }],
			}),
		);
		const result = coordinator.planParallelExecution(planPath);
		expect(result.waves[0][0].phase).toBe(-1);
	});

	test('multiple phases with different IDs', () => {
		const planPath = path.join(tempDir, 'multiphase.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{ id: 0, tasks: [{ id: 'task0', depends: [] }] },
					{ id: 5, tasks: [{ id: 'task5', depends: ['task0'] }] },
					{ id: 10, tasks: [{ id: 'task10', depends: ['task5'] }] },
				],
			}),
		);
		const result = coordinator.planParallelExecution(planPath);
		expect(result.estimatedWaves).toBe(3);
	});

	// ═══════════════════════════════════════════════════════════════════
	// BLOCKED TASKS (unsolvable dependencies)
	// ═══════════════════════════════════════════════════════════════════

	test('task with all missing dependencies still runs (depends filtered to empty)', () => {
		const planPath = path.join(tempDir, 'blocked.json');
		fs.writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{
						id: 1,
						tasks: [{ id: 'task1', depends: ['missing1', 'missing2'] }],
					},
				],
			}),
		);
		const result = coordinator.planParallelExecution(planPath);
		// Missing dependencies are filtered out, so task runs with empty depends
		expect(result.waves.length).toBe(1);
		expect(result.waves[0][0].id).toBe('task1');
		expect(result.waves[0][0].depends).toEqual([]);
	});
});

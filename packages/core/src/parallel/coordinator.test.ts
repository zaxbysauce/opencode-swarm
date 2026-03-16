import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ExecutionCoordinator } from './coordinator';

describe('ExecutionCoordinator', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), 'coordinator-test-'));
	});

	afterEach(() => {
		if (existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	describe('planParallelExecution', () => {
		it('returns empty plan for non-existent plan file', () => {
			const coordinator = new ExecutionCoordinator(tempDir);
			const plan = coordinator.planParallelExecution(
				join(tempDir, 'nonexistent.json'),
			);

			expect(plan.waves).toEqual([]);
			expect(plan.estimatedWaves).toBe(0);
			expect(plan.serialFallbacks).toEqual([]);
		});

		it('returns empty plan for empty phases array', () => {
			const planPath = join(tempDir, 'empty-plan.json');
			writeFileSync(planPath, JSON.stringify({ phases: [] }));

			const coordinator = new ExecutionCoordinator(tempDir);
			const plan = coordinator.planParallelExecution(planPath);

			expect(plan.waves).toEqual([]);
			expect(plan.estimatedWaves).toBe(0);
			expect(plan.serialFallbacks).toEqual([]);
		});

		it('creates single wave for tasks with no dependencies', () => {
			const planPath = join(tempDir, 'simple-plan.json');
			writeFileSync(
				planPath,
				JSON.stringify({
					phases: [
						{
							id: 1,
							tasks: [
								{ id: 'task-a', description: 'Task A' },
								{ id: 'task-b', description: 'Task B' },
								{ id: 'task-c', description: 'Task C' },
							],
						},
					],
				}),
			);

			const coordinator = new ExecutionCoordinator(tempDir);
			const plan = coordinator.planParallelExecution(planPath);

			expect(plan.waves.length).toBe(1);
			expect(plan.waves[0].length).toBe(3);
			expect(plan.estimatedWaves).toBe(1);
			expect(plan.serialFallbacks).toEqual([]);
		});

		it('creates multiple waves for dependent tasks', () => {
			const planPath = join(tempDir, 'dependent-plan.json');
			writeFileSync(
				planPath,
				JSON.stringify({
					phases: [
						{
							id: 1,
							tasks: [
								{ id: 'task-a', description: 'Task A' },
								{ id: 'task-b', description: 'Task B', depends: ['task-a'] },
								{ id: 'task-c', description: 'Task C', depends: ['task-a'] },
								{
									id: 'task-d',
									description: 'Task D',
									depends: ['task-b', 'task-c'],
								},
							],
						},
					],
				}),
			);

			const coordinator = new ExecutionCoordinator(tempDir);
			const plan = coordinator.planParallelExecution(planPath);

			expect(plan.estimatedWaves).toBe(3);
			// Wave 1: task-a (no dependencies)
			expect(plan.waves[0].map((t) => t.id)).toEqual(['task-a']);
			// Wave 2: task-b, task-c (both depend on task-a only)
			expect(plan.waves[1].map((t) => t.id).sort()).toEqual([
				'task-b',
				'task-c',
			]);
			// Wave 3: task-d (depends on both task-b and task-c)
			expect(plan.waves[2].map((t) => t.id)).toEqual(['task-d']);
		});

		it('handles tasks across multiple phases', () => {
			const planPath = join(tempDir, 'multi-phase-plan.json');
			writeFileSync(
				planPath,
				JSON.stringify({
					phases: [
						{
							id: 1,
							tasks: [{ id: 'phase1-task', description: 'Phase 1 Task' }],
						},
						{
							id: 2,
							tasks: [
								{
									id: 'phase2-task',
									description: 'Phase 2 Task',
									depends: ['phase1-task'],
								},
							],
						},
					],
				}),
			);

			const coordinator = new ExecutionCoordinator(tempDir);
			const plan = coordinator.planParallelExecution(planPath);

			expect(plan.waves.length).toBe(2);
			expect(plan.waves[0][0].id).toBe('phase1-task');
			expect(plan.waves[1][0].id).toBe('phase2-task');
		});

		it('sorts tasks by phase within each wave', () => {
			const planPath = join(tempDir, 'phase-sort-plan.json');
			writeFileSync(
				planPath,
				JSON.stringify({
					phases: [
						{
							id: 3,
							tasks: [
								{
									id: 'task-phase3',
									description: 'Phase 3',
									depends: ['task-phase1'],
								},
							],
						},
						{
							id: 1,
							tasks: [{ id: 'task-phase1', description: 'Phase 1' }],
						},
						{
							id: 2,
							tasks: [
								{
									id: 'task-phase2',
									description: 'Phase 2',
									depends: ['task-phase1'],
								},
							],
						},
					],
				}),
			);

			const coordinator = new ExecutionCoordinator(tempDir);
			const plan = coordinator.planParallelExecution(planPath);

			// Wave 1 should be sorted by phase (phase 1 first)
			expect(plan.waves[0].length).toBe(1);
			expect(plan.waves[0][0].phase).toBe(1);
		});

		it('detects circular dependencies and adds to serialFallbacks', () => {
			const planPath = join(tempDir, 'circular-plan.json');
			writeFileSync(
				planPath,
				JSON.stringify({
					phases: [
						{
							id: 1,
							tasks: [
								{ id: 'task-a', description: 'Task A', depends: ['task-b'] },
								{ id: 'task-b', description: 'Task B', depends: ['task-a'] },
							],
						},
					],
				}),
			);

			const coordinator = new ExecutionCoordinator(tempDir);
			const plan = coordinator.planParallelExecution(planPath);

			// Circular tasks should be in serialFallbacks
			expect(plan.serialFallbacks).toContain('task-a');
			expect(plan.serialFallbacks).toContain('task-b');
			// Waves should be empty since tasks are in circular fallback
			expect(plan.waves.length).toBe(0);
		});

		it('handles mix of circular and non-circular tasks', () => {
			const planPath = join(tempDir, 'mixed-plan.json');
			writeFileSync(
				planPath,
				JSON.stringify({
					phases: [
						{
							id: 1,
							tasks: [
								{ id: 'task-a', description: 'Task A' },
								{ id: 'task-b', description: 'Task B', depends: ['task-c'] },
								{ id: 'task-c', description: 'Task C', depends: ['task-b'] }, // circular with task-b
								{ id: 'task-d', description: 'Task D', depends: ['task-a'] },
							],
						},
					],
				}),
			);

			const coordinator = new ExecutionCoordinator(tempDir);
			const plan = coordinator.planParallelExecution(planPath);

			// task-b and task-c are circular
			expect(plan.serialFallbacks).toContain('task-b');
			expect(plan.serialFallbacks).toContain('task-c');
			// task-a runs first (no deps), then task-d runs (depends on task-a)
			expect(plan.waves.length).toBe(2);
			expect(plan.waves[0].map((t) => t.id)).toEqual(['task-a']);
			expect(plan.waves[1].map((t) => t.id)).toEqual(['task-d']);
		});

		it('handles self-referencing task as circular', () => {
			const planPath = join(tempDir, 'self-ref-plan.json');
			writeFileSync(
				planPath,
				JSON.stringify({
					phases: [
						{
							id: 1,
							tasks: [
								{
									id: 'self-task',
									description: 'Self Task',
									depends: ['self-task'],
								},
							],
						},
					],
				}),
			);

			const coordinator = new ExecutionCoordinator(tempDir);
			const plan = coordinator.planParallelExecution(planPath);

			expect(plan.serialFallbacks).toContain('self-task');
			expect(plan.waves.length).toBe(0);
		});

		it('returns task nodes with correct properties in waves', () => {
			const planPath = join(tempDir, 'task-properties-plan.json');
			writeFileSync(
				planPath,
				JSON.stringify({
					phases: [
						{
							id: 5,
							tasks: [
								{
									id: 'prop-task',
									description: 'Properties Task',
									depends: [],
									status: 'pending',
								},
							],
						},
					],
				}),
			);

			const coordinator = new ExecutionCoordinator(tempDir);
			const plan = coordinator.planParallelExecution(planPath);

			expect(plan.waves[0].length).toBe(1);
			const task = plan.waves[0][0];
			expect(task.id).toBe('prop-task');
			expect(task.description).toBe('Properties Task');
			expect(task.phase).toBe(5);
			expect(task.depends).toEqual([]);
			expect(task.dependents).toEqual([]);
		});

		it('handles deep dependency chains', () => {
			const planPath = join(tempDir, 'deep-chain-plan.json');
			writeFileSync(
				planPath,
				JSON.stringify({
					phases: [
						{
							id: 1,
							tasks: [
								{ id: 'deep-1', description: 'Deep 1' },
								{ id: 'deep-2', description: 'Deep 2', depends: ['deep-1'] },
								{ id: 'deep-3', description: 'Deep 3', depends: ['deep-2'] },
								{ id: 'deep-4', description: 'Deep 4', depends: ['deep-3'] },
								{ id: 'deep-5', description: 'Deep 5', depends: ['deep-4'] },
							],
						},
					],
				}),
			);

			const coordinator = new ExecutionCoordinator(tempDir);
			const plan = coordinator.planParallelExecution(planPath);

			// Each task should be in its own wave due to linear dependency
			expect(plan.estimatedWaves).toBe(5);
			for (let i = 0; i < 5; i++) {
				expect(plan.waves[i].length).toBe(1);
				expect(plan.waves[i][0].id).toBe(`deep-${i + 1}`);
			}
		});

		it('handles diamond dependency pattern', () => {
			const planPath = join(tempDir, 'diamond-plan.json');
			writeFileSync(
				planPath,
				JSON.stringify({
					phases: [
						{
							id: 1,
							tasks: [
								{ id: 'diamond-start', description: 'Start' },
								{
									id: 'diamond-left',
									description: 'Left',
									depends: ['diamond-start'],
								},
								{
									id: 'diamond-right',
									description: 'Right',
									depends: ['diamond-start'],
								},
								{
									id: 'diamond-end',
									description: 'End',
									depends: ['diamond-left', 'diamond-right'],
								},
							],
						},
					],
				}),
			);

			const coordinator = new ExecutionCoordinator(tempDir);
			const plan = coordinator.planParallelExecution(planPath);

			// Wave 1: diamond-start
			expect(plan.waves[0].map((t) => t.id)).toEqual(['diamond-start']);
			// Wave 2: diamond-left and diamond-right (parallel after diamond-start)
			expect(plan.waves[1].map((t) => t.id).sort()).toEqual([
				'diamond-left',
				'diamond-right',
			]);
			// Wave 3: diamond-end (depends on both)
			expect(plan.waves[2].map((t) => t.id)).toEqual(['diamond-end']);
		});
	});

	describe('dispatchAgent', () => {
		it('throws not implemented error', () => {
			const coordinator = new ExecutionCoordinator(tempDir);

			expect(() => coordinator.dispatchAgent('task-id', 'agent-name')).toThrow(
				'Parallel execution not yet implemented',
			);
		});

		it('throws not implemented error with worktreeId', () => {
			const coordinator = new ExecutionCoordinator(tempDir);

			expect(() =>
				coordinator.dispatchAgent('task-id', 'agent-name', 'worktree-1'),
			).toThrow('Parallel execution not yet implemented');
		});
	});

	describe('awaitCompletion', () => {
		it('throws not implemented error', async () => {
			const coordinator = new ExecutionCoordinator(tempDir);

			await expect(coordinator.awaitCompletion([])).rejects.toThrow(
				'Parallel execution not yet implemented',
			);
		});
	});

	describe('mergeResults', () => {
		it('throws not implemented error', async () => {
			const coordinator = new ExecutionCoordinator(tempDir);

			await expect(coordinator.mergeResults([])).rejects.toThrow(
				'Parallel execution not yet implemented',
			);
		});
	});
});

describe('Dependency graph integration', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), 'coordinator-integration-test-'));
	});

	afterEach(() => {
		if (existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('coordinates with parseDependencyGraph to build waves', () => {
		const planPath = join(tempDir, 'integration-plan.json');
		writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{
						id: 1,
						tasks: [
							{ id: 'parse-a', description: 'Parse A' },
							{ id: 'parse-b', description: 'Parse B', depends: ['parse-a'] },
						],
					},
				],
			}),
		);

		const coordinator = new ExecutionCoordinator(tempDir);
		const plan = coordinator.planParallelExecution(planPath);

		// Verify the integration works correctly
		expect(plan.waves.length).toBe(2);
		expect(plan.waves[0][0].id).toBe('parse-a');
		expect(plan.waves[1][0].id).toBe('parse-b');
	});

	it('handles invalid JSON gracefully', () => {
		const planPath = join(tempDir, 'invalid-plan.json');
		writeFileSync(planPath, 'not valid json {{{');

		const coordinator = new ExecutionCoordinator(tempDir);
		const plan = coordinator.planParallelExecution(planPath);

		// Should return empty plan on parse error
		expect(plan.waves).toEqual([]);
		expect(plan.estimatedWaves).toBe(0);
	});
});

describe('Adversarial: Malformed plan data', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), 'adversarial-malformed-'));
	});

	afterEach(() => {
		if (existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('handles missing phases property', () => {
		const planPath = join(tempDir, 'no-phases.json');
		writeFileSync(planPath, JSON.stringify({}));

		const coordinator = new ExecutionCoordinator(tempDir);
		const plan = coordinator.planParallelExecution(planPath);

		expect(plan.waves).toEqual([]);
		expect(plan.estimatedWaves).toBe(0);
		expect(plan.serialFallbacks).toEqual([]);
	});

	it('handles null phases', () => {
		const planPath = join(tempDir, 'null-phases.json');
		writeFileSync(planPath, JSON.stringify({ phases: null }));

		const coordinator = new ExecutionCoordinator(tempDir);
		const plan = coordinator.planParallelExecution(planPath);

		expect(plan.waves).toEqual([]);
		expect(plan.estimatedWaves).toBe(0);
	});

	it('handles undefined phases', () => {
		const planPath = join(tempDir, 'undefined-phases.json');
		writeFileSync(planPath, JSON.stringify({ phases: undefined }));

		const coordinator = new ExecutionCoordinator(tempDir);
		const plan = coordinator.planParallelExecution(planPath);

		expect(plan.waves).toEqual([]);
		expect(plan.estimatedWaves).toBe(0);
	});

	it('handles task missing id field', () => {
		const planPath = join(tempDir, 'missing-id.json');
		writeFileSync(
			planPath,
			JSON.stringify({
				phases: [{ id: 1, tasks: [{ description: 'Task without ID' }] }],
			}),
		);

		const coordinator = new ExecutionCoordinator(tempDir);
		const plan = coordinator.planParallelExecution(planPath);

		// Task without id is skipped - no valid tasks means no waves
		expect(plan.waves.length).toBe(0);
		expect(plan.estimatedWaves).toBe(0);
	});

	it('handles null task id', () => {
		const planPath = join(tempDir, 'null-id.json');
		writeFileSync(
			planPath,
			JSON.stringify({
				phases: [{ id: 1, tasks: [{ id: null, description: 'Null ID' }] }],
			}),
		);

		const coordinator = new ExecutionCoordinator(tempDir);
		const plan = coordinator.planParallelExecution(planPath);

		// Task with null id is skipped - no valid tasks means no waves
		expect(plan.waves.length).toBe(0);
		expect(plan.estimatedWaves).toBe(0);
	});

	it('handles task with invalid depends type (string instead of array)', () => {
		const planPath = join(tempDir, 'invalid-deps-type.json');
		writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{
						id: 1,
						tasks: [
							{ id: 'task-a', description: 'Task A' },
							{ id: 'task-b', description: 'Task B', depends: 'task-a' },
						],
					},
				],
			}),
		);

		const coordinator = new ExecutionCoordinator(tempDir);
		const plan = coordinator.planParallelExecution(planPath);

		// Should handle gracefully - string deps should be ignored or treated as empty
		expect(plan.waves.length).toBeGreaterThanOrEqual(1);
	});

	it('handles task with invalid depends element (number instead of string)', () => {
		const planPath = join(tempDir, 'invalid-dep-element.json');
		writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{
						id: 1,
						tasks: [{ id: 'task-a', description: 'Task A', depends: [123] }],
					},
				],
			}),
		);

		const coordinator = new ExecutionCoordinator(tempDir);
		const plan = coordinator.planParallelExecution(planPath);

		// Should handle gracefully
		expect(plan.waves.length).toBe(1);
	});

	it('handles invalid status value', () => {
		const planPath = join(tempDir, 'invalid-status.json');
		writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{
						id: 1,
						tasks: [
							{ id: 'task-a', description: 'Task A', status: 'invalid-status' },
						],
					},
				],
			}),
		);

		const coordinator = new ExecutionCoordinator(tempDir);
		const plan = coordinator.planParallelExecution(planPath);

		// Invalid status should default to 'pending'
		expect(plan.waves.length).toBe(1);
		expect(plan.waves[0][0].status).toBe('pending');
	});

	it('handles non-numeric phase id (string)', () => {
		const planPath = join(tempDir, 'string-phase-id.json');
		writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{ id: 'phase-one', tasks: [{ id: 'task-a', description: 'Task A' }] },
				],
			}),
		);

		const coordinator = new ExecutionCoordinator(tempDir);
		const plan = coordinator.planParallelExecution(planPath);

		// String phase ID should be processed (coerced to number or handled as-is)
		expect(plan.waves.length).toBe(1);
	});

	it('handles null phase id', () => {
		const planPath = join(tempDir, 'null-phase-id.json');
		writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{ id: null, tasks: [{ id: 'task-a', description: 'Task A' }] },
				],
			}),
		);

		const coordinator = new ExecutionCoordinator(tempDir);
		const plan = coordinator.planParallelExecution(planPath);

		expect(plan.waves.length).toBe(1);
	});

	it('handles malformed JSON with partial content', () => {
		const planPath = join(tempDir, 'partial-json.json');
		writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{
						id: 1,
						tasks: [{ id: 'task-a', description: 'Task A' }],
					},
				],
			}) + 'trailing garbage',
		);

		const coordinator = new ExecutionCoordinator(tempDir);
		const plan = coordinator.planParallelExecution(planPath);

		// JSON parse should fail gracefully
		expect(plan.waves).toEqual([]);
		expect(plan.estimatedWaves).toBe(0);
	});

	it('handles empty JSON object', () => {
		const planPath = join(tempDir, 'empty-object.json');
		writeFileSync(planPath, JSON.stringify({}));

		const coordinator = new ExecutionCoordinator(tempDir);
		const plan = coordinator.planParallelExecution(planPath);

		expect(plan.waves).toEqual([]);
		expect(plan.estimatedWaves).toBe(0);
	});

	it('handles array instead of object', () => {
		const planPath = join(tempDir, 'array-root.json');
		writeFileSync(planPath, JSON.stringify([{ id: 1 }]));

		const coordinator = new ExecutionCoordinator(tempDir);
		const plan = coordinator.planParallelExecution(planPath);

		// Should handle gracefully
		expect(plan.waves).toEqual([]);
	});
});

describe('Adversarial: Missing dependencies', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), 'adversarial-missing-deps-'));
	});

	afterEach(() => {
		if (existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('handles task depending on non-existent task', () => {
		const planPath = join(tempDir, 'missing-dep.json');
		writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{
						id: 1,
						tasks: [
							{
								id: 'task-a',
								description: 'Task A',
								depends: ['non-existent-task'],
							},
						],
					},
				],
			}),
		);

		const coordinator = new ExecutionCoordinator(tempDir);
		const plan = coordinator.planParallelExecution(planPath);

		// Task should still run (dependency on non-existent treated as satisfied)
		expect(plan.waves.length).toBe(1);
		expect(plan.waves[0][0].id).toBe('task-a');
	});

	it('handles multiple tasks depending on same non-existent task', () => {
		const planPath = join(tempDir, 'multiple-missing-dep.json');
		writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{
						id: 1,
						tasks: [
							{ id: 'task-a', description: 'Task A', depends: ['ghost'] },
							{ id: 'task-b', description: 'Task B', depends: ['ghost'] },
							{ id: 'task-c', description: 'Task C', depends: ['ghost'] },
						],
					},
				],
			}),
		);

		const coordinator = new ExecutionCoordinator(tempDir);
		const plan = coordinator.planParallelExecution(planPath);

		// All tasks should run in parallel
		expect(plan.waves.length).toBe(1);
		expect(plan.waves[0].length).toBe(3);
	});

	it('handles task depending on multiple non-existent tasks', () => {
		const planPath = join(tempDir, 'multi-missing-dep.json');
		writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{
						id: 1,
						tasks: [
							{
								id: 'task-a',
								description: 'Task A',
								depends: ['ghost-1', 'ghost-2', 'ghost-3'],
							},
						],
					},
				],
			}),
		);

		const coordinator = new ExecutionCoordinator(tempDir);
		const plan = coordinator.planParallelExecution(planPath);

		expect(plan.waves.length).toBe(1);
		expect(plan.waves[0][0].id).toBe('task-a');
	});

	it('handles chain of tasks with missing intermediate dependency', () => {
		const planPath = join(tempDir, 'broken-chain.json');
		writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{
						id: 1,
						tasks: [
							{ id: 'task-a', description: 'Task A' },
							{ id: 'task-b', description: 'Task B', depends: ['missing'] },
							{ id: 'task-c', description: 'Task C', depends: ['task-b'] },
						],
					},
				],
			}),
		);

		const coordinator = new ExecutionCoordinator(tempDir);
		const plan = coordinator.planParallelExecution(planPath);

		// task-a runs first, then task-b and task-c since 'missing' doesn't exist
		expect(plan.waves.length).toBe(2);
	});
});

describe('Adversarial: Invalid inputs', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), 'adversarial-inputs-'));
	});

	afterEach(() => {
		if (existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('handles empty string plan path', () => {
		const coordinator = new ExecutionCoordinator(tempDir);
		const plan = coordinator.planParallelExecution('');

		// Empty path should return empty plan
		expect(plan.waves).toEqual([]);
		expect(plan.estimatedWaves).toBe(0);
	});

	it('handles whitespace-only plan path', () => {
		const coordinator = new ExecutionCoordinator(tempDir);
		const plan = coordinator.planParallelExecution('   ');

		expect(plan.waves).toEqual([]);
		expect(plan.estimatedWaves).toBe(0);
	});

	it('handles path with null bytes', () => {
		const coordinator = new ExecutionCoordinator(tempDir);
		// Path with null byte - may cause issues on some systems
		const plan = coordinator.planParallelExecution('path\x00with\x00nulls');

		expect(plan.waves).toEqual([]);
		expect(plan.estimatedWaves).toBe(0);
	});
});

describe('Adversarial: Oversized dependency chains', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), 'adversarial-oversized-'));
	});

	afterEach(() => {
		if (existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('handles 100 tasks in linear chain', () => {
		const planPath = join(tempDir, 'large-chain.json');
		const tasks = [];
		for (let i = 1; i <= 100; i++) {
			tasks.push({
				id: `task-${i}`,
				description: `Task ${i}`,
				depends: i > 1 ? [`task-${i - 1}`] : [],
			});
		}

		writeFileSync(
			planPath,
			JSON.stringify({
				phases: [{ id: 1, tasks }],
			}),
		);

		const coordinator = new ExecutionCoordinator(tempDir);
		const plan = coordinator.planParallelExecution(planPath);

		// Each task should be in its own wave
		expect(plan.estimatedWaves).toBe(100);
		expect(plan.waves.length).toBe(100);
	});

	it('handles task with 100+ dependencies', () => {
		const planPath = join(tempDir, 'many-deps.json');
		const tasks = [];
		const deps = [];
		for (let i = 1; i <= 150; i++) {
			tasks.push({ id: `dep-task-${i}`, description: `Dep Task ${i}` });
			deps.push(`dep-task-${i}`);
		}
		tasks.push({
			id: 'mega-dependent',
			description: 'Mega Dependent',
			depends: deps,
		});

		writeFileSync(
			planPath,
			JSON.stringify({
				phases: [{ id: 1, tasks }],
			}),
		);

		const coordinator = new ExecutionCoordinator(tempDir);
		const plan = coordinator.planParallelExecution(planPath);

		// First wave: 150 dep tasks, second wave: mega-dependent
		expect(plan.waves.length).toBe(2);
		expect(plan.waves[0].length).toBe(150);
		expect(plan.waves[1].length).toBe(1);
		expect(plan.waves[1][0].id).toBe('mega-dependent');
	});

	it('handles 50 independent tasks (maximum parallel)', () => {
		const planPath = join(tempDir, 'max-parallel.json');
		const tasks = [];
		for (let i = 1; i <= 50; i++) {
			tasks.push({ id: `task-${i}`, description: `Task ${i}` });
		}

		writeFileSync(
			planPath,
			JSON.stringify({
				phases: [{ id: 1, tasks }],
			}),
		);

		const coordinator = new ExecutionCoordinator(tempDir);
		const plan = coordinator.planParallelExecution(planPath);

		// All 50 tasks should be in single wave
		expect(plan.waves.length).toBe(1);
		expect(plan.waves[0].length).toBe(50);
	});
});

describe('Adversarial: Complex circular dependencies', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), 'adversarial-circular-'));
	});

	afterEach(() => {
		if (existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('handles three-way circular dependency', () => {
		const planPath = join(tempDir, 'triple-cycle.json');
		writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{
						id: 1,
						tasks: [
							{ id: 'task-a', description: 'Task A', depends: ['task-c'] },
							{ id: 'task-b', description: 'Task B', depends: ['task-a'] },
							{ id: 'task-c', description: 'Task C', depends: ['task-b'] },
						],
					},
				],
			}),
		);

		const coordinator = new ExecutionCoordinator(tempDir);
		const plan = coordinator.planParallelExecution(planPath);

		// All three should be in serialFallbacks
		expect(plan.serialFallbacks.sort()).toEqual(['task-a', 'task-b', 'task-c']);
		expect(plan.waves.length).toBe(0);
	});

	it('handles self-referencing task with dependents', () => {
		const planPath = join(tempDir, 'self-with-deps.json');
		writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{
						id: 1,
						tasks: [
							{
								id: 'self-task',
								description: 'Self Task',
								depends: ['self-task'],
							},
							{ id: 'normal-task', description: 'Normal Task' },
							{
								id: 'dependent-on-self',
								description: 'Dependent',
								depends: ['self-task'],
							},
						],
					},
				],
			}),
		);

		const coordinator = new ExecutionCoordinator(tempDir);
		const plan = coordinator.planParallelExecution(planPath);

		expect(plan.serialFallbacks).toContain('self-task');
		// normal-task runs in wave 1, dependent-on-self runs in wave 2 (after circular task resolves)
		expect(plan.waves.length).toBe(2);
		expect(plan.waves[0].map((t) => t.id)).toEqual(['normal-task']);
		expect(plan.waves[1].map((t) => t.id)).toEqual(['dependent-on-self']);
	});

	it('handles indirect cycle: a->b->c->b', () => {
		const planPath = join(tempDir, 'indirect-cycle.json');
		writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{
						id: 1,
						tasks: [
							{ id: 'task-a', description: 'Task A' },
							{ id: 'task-b', description: 'Task B', depends: ['task-c'] },
							{ id: 'task-c', description: 'Task C', depends: ['task-b'] },
						],
					},
				],
			}),
		);

		const coordinator = new ExecutionCoordinator(tempDir);
		const plan = coordinator.planParallelExecution(planPath);

		// task-a runs, task-b and task-c are circular
		expect(plan.waves.length).toBe(1);
		expect(plan.waves[0][0].id).toBe('task-a');
		expect(plan.serialFallbacks.sort()).toEqual(['task-b', 'task-c']);
	});
});

describe('Adversarial: Unicode and special characters', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), 'adversarial-unicode-'));
	});

	afterEach(() => {
		if (existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('handles unicode task IDs', () => {
		const planPath = join(tempDir, 'unicode-tasks.json');
		writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{
						id: 1,
						tasks: [
							{ id: '任务一', description: 'Chinese Task' },
							{ id: 'задача', description: 'Russian Task' },
							{ id: '🔧task', description: 'Emoji Task' },
						],
					},
				],
			}),
		);

		const coordinator = new ExecutionCoordinator(tempDir);
		const plan = coordinator.planParallelExecution(planPath);

		expect(plan.waves.length).toBe(1);
		expect(plan.waves[0].length).toBe(3);
	});

	it('handles unicode in dependencies', () => {
		const planPath = join(tempDir, 'unicode-deps.json');
		writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{
						id: 1,
						tasks: [
							{ id: '任务一', description: 'Task 1' },
							{ id: '任务二', description: 'Task 2', depends: ['任务一'] },
						],
					},
				],
			}),
		);

		const coordinator = new ExecutionCoordinator(tempDir);
		const plan = coordinator.planParallelExecution(planPath);

		expect(plan.waves.length).toBe(2);
		expect(plan.waves[0][0].id).toBe('任务一');
		expect(plan.waves[1][0].id).toBe('任务二');
	});

	it('handles special characters in task IDs', () => {
		const planPath = join(tempDir, 'special-chars.json');
		writeFileSync(
			planPath,
			JSON.stringify({
				phases: [
					{
						id: 1,
						tasks: [
							{ id: 'task-with-dash', description: 'Dash Task' },
							{ id: 'task_with_underscore', description: 'Underscore Task' },
							{ id: 'task.with.dots', description: 'Dot Task' },
						],
					},
				],
			}),
		);

		const coordinator = new ExecutionCoordinator(tempDir);
		const plan = coordinator.planParallelExecution(planPath);

		expect(plan.waves.length).toBe(1);
		expect(plan.waves[0].length).toBe(3);
	});
});

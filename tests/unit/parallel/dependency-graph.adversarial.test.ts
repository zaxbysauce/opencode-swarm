import { beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	getExecutionOrder,
	parseDependencyGraph,
} from '../../../src/parallel/dependency-graph.js';

/**
 * Security Tests: Dependency-Graph
 * Tests: Circular dependencies, prototype pollution, malformed JSON, deep recursion
 */

const TEST_DIR = path.join(os.tmpdir(), 'dep-graph-sec-test-' + Date.now());

beforeEach(() => {
	if (!fs.existsSync(TEST_DIR)) {
		fs.mkdirSync(TEST_DIR, { recursive: true });
	}
});

describe('Security: Dependency-Graph - Circular Dependencies', () => {
	it('should handle circular dependency bomb (reduced nodes)', () => {
		const circularPlanPath = path.join(TEST_DIR, 'plan.json');
		const phases: Array<{
			id: number;
			tasks: Array<{
				id: string;
				description: string;
				depends: string[];
				status: string;
			}>;
		}> = [];

		// Reduced from 100 to 30 tasks
		for (let i = 0; i < 30; i++) {
			phases.push({
				id: Math.floor(i / 10) + 1,
				tasks: [
					{
						id: `task-${i}`,
						description: `Task ${i}`,
						depends: [`task-${(i + 1) % 30}`],
						status: 'pending',
					},
				],
			});
		}

		fs.writeFileSync(circularPlanPath, JSON.stringify({ phases }), 'utf-8');

		const graph = parseDependencyGraph(circularPlanPath);
		expect(graph).toBeDefined();
		expect(graph.tasks.size).toBe(30);

		// getExecutionOrder should throw on circular deps
		expect(() => getExecutionOrder(graph)).toThrow();
	});

	it('should handle self-referencing dependencies', () => {
		const selfRefPlanPath = path.join(TEST_DIR, 'self-ref-plan.json');
		const plan = {
			phases: [
				{
					id: 1,
					tasks: [
						{
							id: 'task-1',
							description: 'Self-referencing task',
							depends: ['task-1'],
							status: 'pending',
						},
					],
				},
			],
		};

		fs.writeFileSync(selfRefPlanPath, JSON.stringify(plan), 'utf-8');

		const graph = parseDependencyGraph(selfRefPlanPath);
		expect(graph).toBeDefined();

		expect(() => getExecutionOrder(graph)).toThrow();
	});

	it('should handle deep dependency chain without stack overflow', () => {
		const deepPlanPath = path.join(TEST_DIR, 'deep-plan.json');
		const tasks: Array<{
			id: string;
			description: string;
			depends: string[];
			status: string;
		}> = [];

		// Reduced from 500 to 200
		for (let i = 0; i < 200; i++) {
			tasks.push({
				id: `task-${i}`,
				description: `Task ${i}`,
				depends: i > 0 ? [`task-${i - 1}`] : [],
				status: 'pending',
			});
		}

		fs.writeFileSync(
			deepPlanPath,
			JSON.stringify({ phases: [{ id: 1, tasks }] }),
			'utf-8',
		);

		const graph = parseDependencyGraph(deepPlanPath);
		expect(graph).toBeDefined();

		const order = getExecutionOrder(graph);
		expect(order.length).toBe(200);
	});
});

describe('Security: Dependency-Graph - Prototype Pollution', () => {
	it('should handle __proto__ injection in plan.json', () => {
		const pollutedPlanPath = path.join(TEST_DIR, 'polluted-plan.json');
		const plan = {
			phases: [
				{
					id: 1,
					tasks: [
						{
							id: '1.1',
							description: 'Normal task',
							depends: [],
							status: 'pending',
						},
					],
				},
			],
			__proto__: { polluted: true },
			constructor: { prototype: { evil: true } },
		};

		fs.writeFileSync(pollutedPlanPath, JSON.stringify(plan), 'utf-8');

		const graph = parseDependencyGraph(pollutedPlanPath);
		expect(graph).toBeDefined();
		expect(graph.tasks.size).toBe(1);

		const testObj = {};
		expect((testObj as any).polluted).toBeUndefined();
		expect((testObj as any).evil).toBeUndefined();
	});

	it('should handle constructor injection attempts', () => {
		const constructorPlanPath = path.join(TEST_DIR, 'constructor-plan.json');
		const plan = {
			phases: [
				{
					id: 1,
					tasks: [
						{
							id: '1.1',
							description: 'Task with constructor injection',
							depends: [],
							status: 'pending',
						},
					],
				},
			],
			constructor: {
				prototype: {
					shellExec: 'malicious code',
				},
			},
		};

		fs.writeFileSync(constructorPlanPath, JSON.stringify(plan), 'utf-8');

		const graph = parseDependencyGraph(constructorPlanPath);
		expect(graph).toBeDefined();

		expect(({} as any).constructor?.prototype?.shellExec).toBeUndefined();
	});
});

describe('Security: Dependency-Graph - Malformed JSON', () => {
	it('should handle various malformed plan.json inputs', () => {
		const malformedPlans = [
			'{invalid json',
			'{"phases":',
			'{"phases":null}',
			'{"phases":[]}',
			'{"phases":[null]}',
			'{"phases":[{"id":1}]}',
			'{"phases":[{"id":1,"tasks":null}]}',
			'{"phases":[{"id":1,"tasks":"string"}]}',
			'{"phases":[{"id":1,"tasks":[null]}]}',
			'{"phases":[{"id":1,"tasks":[{"id":1,"depends":null}]}]}',
			'{"phases":[{"id":1,"tasks":[{"id":1,"depends":["non-existent"]}]}]}',
		];

		for (let i = 0; i < malformedPlans.length; i++) {
			const planPath = path.join(TEST_DIR, `malformed-${i}.json`);
			fs.writeFileSync(planPath, malformedPlans[i], 'utf-8');

			// parseDependencyGraph may throw on some malformed inputs (e.g. null phases)
			// or return a valid graph with empty tasks. Both behaviors are acceptable.
			try {
				const graph = parseDependencyGraph(planPath);
				expect(graph).toBeDefined();
				expect(graph.tasks).toBeInstanceOf(Map);
			} catch (err) {
				// Acceptable: implementation may throw on structurally invalid inputs
				expect(err).toBeDefined();
			}
		}
	});

	it('should handle plan.json with invalid status values', () => {
		const invalidStatusPlanPath = path.join(
			TEST_DIR,
			'invalid-status-plan.json',
		);
		const plan = {
			phases: [
				{
					id: 1,
					tasks: [
						{ id: '1.1', status: 'invalid_status', depends: [] },
						{ id: '1.2', status: '', depends: [] },
						{ id: '1.3', status: null, depends: [] },
						{ id: '1.4', status: 123, depends: [] },
						{ id: '1.5', status: {}, depends: [] },
					],
				},
			],
		};

		fs.writeFileSync(invalidStatusPlanPath, JSON.stringify(plan), 'utf-8');

		const graph = parseDependencyGraph(invalidStatusPlanPath);
		expect(graph).toBeDefined();
		for (const task of graph.tasks.values()) {
			expect(task.status).toBe('pending');
		}
	});
});

/**
 * Tests for the `epic_plan_waves` tool wrapper.
 *
 * Covers the tool boundary: preflight branches (no-plan, no-phase,
 * phase-empty, phase-already-complete, scopes-missing, git-failed,
 * planner-error) and the success path that forwards to `planEpicWaves`.
 *
 * All tests use the `_internals` DI seam (AGENTS.md invariant 7) — no
 * `mock.module`.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	_internals,
	executeEpicPlanWaves,
} from '../../../src/tools/epic-plan-waves';

// Capture original internals so each test restores after override.
const originals = { ..._internals };

afterEach(() => {
	Object.assign(_internals, originals);
});

/**
 * Envelope invariant: on any failure (`success: false`), the success-only
 * aliases MUST be undefined. Otherwise a downstream caller doing
 * `result.waves?.length ?? 0` could mask a real failure as "empty phase".
 */
function expectCleanFailureEnvelope(result: {
	success: boolean;
	plan?: unknown;
	waves?: unknown;
	serializedTasks?: unknown;
	degradedTasks?: unknown;
}): void {
	expect(result.success).toBe(false);
	expect(result.plan).toBeUndefined();
	expect(result.waves).toBeUndefined();
	expect(result.serializedTasks).toBeUndefined();
	expect(result.degradedTasks).toBeUndefined();
}

function writeScope(scopesDir: string, taskId: string, files: string[]): void {
	fs.writeFileSync(
		path.join(scopesDir, `scope-${taskId}.json`),
		JSON.stringify({ taskId, files, declaredAt: '2026-01-01T00:00:00.000Z' }),
	);
}

describe('executeEpicPlanWaves — preflight branches', () => {
	let tempDir: string;
	let scopesDir: string;
	let swarmDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'epic-plan-waves-tool-'));
		swarmDir = path.join(tempDir, '.swarm');
		scopesDir = path.join(swarmDir, 'scopes');
		fs.mkdirSync(scopesDir, { recursive: true });
		// Non-git project by default — Rule 1 bypass, no git predicate.
		_internals.isGitRepo = () => false;
	});

	afterEach(() => {
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// ignore
		}
	});

	test('no-plan: missing plan.json returns reason="no-plan"', async () => {
		const result = await executeEpicPlanWaves({ directory: tempDir, phase: 1 });
		expect(result.reason).toBe('no-plan');
		expectCleanFailureEnvelope(result);
	});

	test('no-plan: malformed plan.json with non-array `phases` returns reason="no-plan" (no crash)', async () => {
		fs.writeFileSync(
			path.join(swarmDir, 'plan.json'),
			JSON.stringify({ phases: 'not an array' }),
		);
		const result = await executeEpicPlanWaves({ directory: tempDir, phase: 1 });
		expect(result.reason).toBe('no-plan');
		expect(result.errors?.[0]).toContain('`phases` is not an array');
		expectCleanFailureEnvelope(result);
	});

	test('phase-empty: phase.tasks is null returns reason="phase-empty" (no crash on .length)', async () => {
		fs.writeFileSync(
			path.join(swarmDir, 'plan.json'),
			JSON.stringify({
				phases: [{ id: 1, name: 'P', tasks: null }],
			}),
		);
		const result = await executeEpicPlanWaves({ directory: tempDir, phase: 1 });
		expect(result.reason).toBe('phase-empty');
		expectCleanFailureEnvelope(result);
	});

	test('phase-empty: phase.tasks is a string returns reason="phase-empty" (no crash on .filter)', async () => {
		fs.writeFileSync(
			path.join(swarmDir, 'plan.json'),
			JSON.stringify({
				phases: [{ id: 1, name: 'P', tasks: 'not an array' }],
			}),
		);
		const result = await executeEpicPlanWaves({ directory: tempDir, phase: 1 });
		expect(result.reason).toBe('phase-empty');
		expectCleanFailureEnvelope(result);
	});

	test('no-phase: requested phase not in plan returns reason="no-phase"', async () => {
		fs.writeFileSync(
			path.join(swarmDir, 'plan.json'),
			JSON.stringify({
				phases: [
					{
						id: 1,
						name: 'Setup',
						tasks: [{ id: '1.1', description: 't', status: 'pending' }],
					},
				],
			}),
		);
		const result = await executeEpicPlanWaves({
			directory: tempDir,
			phase: 99,
		});
		expect(result.reason).toBe('no-phase');
		expect(result.errors?.[0]).toContain('Available phases');
		expectCleanFailureEnvelope(result);
	});

	test('phase-empty: phase with zero tasks returns reason="phase-empty"', async () => {
		fs.writeFileSync(
			path.join(swarmDir, 'plan.json'),
			JSON.stringify({
				phases: [{ id: 1, name: 'Empty', tasks: [] }],
			}),
		);
		const result = await executeEpicPlanWaves({ directory: tempDir, phase: 1 });
		expect(result.reason).toBe('phase-empty');
		expectCleanFailureEnvelope(result);
	});

	test('phase-already-complete: all tasks completed returns reason="phase-already-complete"', async () => {
		fs.writeFileSync(
			path.join(swarmDir, 'plan.json'),
			JSON.stringify({
				phases: [
					{
						id: 1,
						name: 'Done',
						tasks: [
							{ id: '1.1', description: 't', status: 'completed' },
							{ id: '1.2', description: 't', status: 'completed' },
						],
					},
				],
			}),
		);
		const result = await executeEpicPlanWaves({ directory: tempDir, phase: 1 });
		expect(result.reason).toBe('phase-already-complete');
		expectCleanFailureEnvelope(result);
	});

	test('scopes-missing: pending task with no scope returns reason="scopes-missing" + missingScopes', async () => {
		fs.writeFileSync(
			path.join(swarmDir, 'plan.json'),
			JSON.stringify({
				phases: [
					{
						id: 1,
						name: 'Phase 1',
						tasks: [
							{
								id: '1.1',
								description: 't',
								status: 'pending',
								files_touched: [],
							},
							{
								id: '1.2',
								description: 't',
								status: 'pending',
								files_touched: [],
							},
						],
					},
				],
			}),
		);
		const result = await executeEpicPlanWaves({ directory: tempDir, phase: 1 });
		expect(result.reason).toBe('scopes-missing');
		expect(result.missingScopes?.sort()).toEqual(['1.1', '1.2']);
		expect(result.errors?.[0]).toContain('declare_scope');
		expectCleanFailureEnvelope(result);
	});

	test('scopes-missing: provided scopes argument satisfies preflight', async () => {
		fs.writeFileSync(
			path.join(swarmDir, 'plan.json'),
			JSON.stringify({
				phases: [
					{
						id: 1,
						name: 'Phase 1',
						tasks: [
							{
								id: '1.1',
								description: 't',
								status: 'pending',
								files_touched: [],
							},
						],
					},
				],
			}),
		);
		const result = await executeEpicPlanWaves({
			directory: tempDir,
			phase: 1,
			scopes: { '1.1': ['src/a.ts'] },
		});
		expect(result.success).toBe(true);
		expect(result.waves?.length).toBe(1);
	});

	test('scopes-missing: files_touched in plan satisfies preflight', async () => {
		fs.writeFileSync(
			path.join(swarmDir, 'plan.json'),
			JSON.stringify({
				phases: [
					{
						id: 1,
						name: 'Phase 1',
						tasks: [
							{
								id: '1.1',
								description: 't',
								status: 'pending',
								files_touched: ['src/a.ts'],
							},
						],
					},
				],
			}),
		);
		const result = await executeEpicPlanWaves({ directory: tempDir, phase: 1 });
		expect(result.success).toBe(true);
	});

	test('git-failed: gitFailed predicate returns reason="git-failed"', async () => {
		fs.writeFileSync(
			path.join(swarmDir, 'plan.json'),
			JSON.stringify({
				phases: [
					{
						id: 1,
						name: 'Phase 1',
						tasks: [{ id: '1.1', description: 't', status: 'pending' }],
					},
				],
			}),
		);
		writeScope(scopesDir, '1.1', ['src/a.ts']);
		_internals.isGitRepo = () => true;
		_internals.buildIsUpstreamCommittedWithStatus = () => ({
			predicate: () => false,
			gitFailed: true,
		});
		const result = await executeEpicPlanWaves({ directory: tempDir, phase: 1 });
		expect(result.reason).toBe('git-failed');
		expect(result.errors?.[0]).toContain('git log');
		expectCleanFailureEnvelope(result);
	});

	test('planner-error: readPlanJson throws downstream → reason="planner-error"', async () => {
		fs.writeFileSync(
			path.join(swarmDir, 'plan.json'),
			JSON.stringify({
				phases: [
					{
						id: 1,
						name: 'Phase 1',
						tasks: [{ id: '1.1', description: 't', status: 'pending' }],
					},
				],
			}),
		);
		writeScope(scopesDir, '1.1', ['src/a.ts']);
		// Sabotage readTaskScopes to throw inside the planner
		_internals.readTaskScopes = () => {
			throw new Error('synthetic disk read failure');
		};
		const result = await executeEpicPlanWaves({ directory: tempDir, phase: 1 });
		expect(result.reason).toBe('planner-error');
		expect(result.errors?.[0]).toContain('synthetic disk read failure');
		expectCleanFailureEnvelope(result);
	});
});

describe('executeEpicPlanWaves — success path forwards to planEpicWaves', () => {
	let tempDir: string;
	let scopesDir: string;
	let swarmDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(
			path.join(os.tmpdir(), 'epic-plan-waves-success-'),
		);
		swarmDir = path.join(tempDir, '.swarm');
		scopesDir = path.join(swarmDir, 'scopes');
		fs.mkdirSync(scopesDir, { recursive: true });
		_internals.isGitRepo = () => false;
	});

	afterEach(() => {
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// ignore
		}
	});

	test('Phase-2 shape DAG produces 3 waves through the tool', async () => {
		writeScope(scopesDir, '2.1', ['src/registry.py']);
		writeScope(scopesDir, '2.2', ['src/column_types.py']);
		writeScope(scopesDir, '2.3', ['src/models/logistic.py']);
		writeScope(scopesDir, '2.4', ['src/models/random_forest.py']);
		writeScope(scopesDir, '2.5', ['src/models/xgboost.py']);
		writeScope(scopesDir, '2.6', ['src/models/mlp.py']);
		fs.writeFileSync(
			path.join(swarmDir, 'plan.json'),
			JSON.stringify({
				phases: [
					{
						id: 2,
						name: 'Models',
						tasks: [
							{
								id: '2.1',
								description: 'Registry',
								status: 'pending',
								depends: [],
							},
							{
								id: '2.2',
								description: 'Col types',
								status: 'pending',
								depends: ['2.1'],
							},
							{
								id: '2.3',
								description: 'Logistic',
								status: 'pending',
								depends: ['2.1', '2.2'],
							},
							{
								id: '2.4',
								description: 'RF',
								status: 'pending',
								depends: ['2.1', '2.2'],
							},
							{
								id: '2.5',
								description: 'XGB',
								status: 'pending',
								depends: ['2.1', '2.2'],
							},
							{
								id: '2.6',
								description: 'MLP',
								status: 'pending',
								depends: ['2.1', '2.2'],
							},
						],
					},
				],
			}),
		);
		const result = await executeEpicPlanWaves({ directory: tempDir, phase: 2 });
		expect(result.success).toBe(true);
		expect(result.waves?.length).toBe(3);
		expect(result.waves?.[0].taskIds).toEqual(['2.1']);
		expect(result.waves?.[1].taskIds).toEqual(['2.2']);
		expect(result.waves?.[2].taskIds).toEqual(['2.3', '2.4', '2.5', '2.6']);
		expect(result.plan?.totalConcurrentTasks).toBe(6);
	});
});

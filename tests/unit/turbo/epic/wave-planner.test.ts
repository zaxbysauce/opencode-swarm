/**
 * Tests for the Epic Mode wave planner.
 *
 * The wave planner is the structural fix for the branching-DAG collapse
 * documented in `src/turbo/epic/wave-planner.ts`. These tests pin down the
 * Phase-2-shape DAG (which the lane planner collapses to a single lane) and
 * exercise the edges that matter: cycles, shared files, mixed risk classes,
 * concurrency cap, deep chains, fan-in, Rule-3 cross-batch.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { LeanTurboConfig } from '../../../../src/config/schema';
import { planEpicWaves } from '../../../../src/turbo/epic/wave-planner';
import type { ScopeFile } from '../../../../src/turbo/lean/conflicts';
import type {
	PlanPhase,
	PlanTask,
} from '../../../../src/turbo/lean/partition-common';

function makeConfig(overrides: Partial<LeanTurboConfig> = {}): LeanTurboConfig {
	return {
		max_parallel_coders: 4,
		require_declared_scope: true,
		conflict_policy: 'serialize',
		degrade_on_risk: true,
		phase_reviewer: true,
		phase_critic: true,
		integrated_diff_required: true,
		allow_docs_only_without_reviewer: false,
		worktree_isolation: false,
		...overrides,
	};
}

function makePlan(tasks: PlanTask[]): { phases: PlanPhase[] } {
	return {
		phases: [{ id: 1, name: 'Phase 1', tasks }],
	};
}

function writeScope(scopesDir: string, taskId: string, files: string[]): void {
	const scope: ScopeFile = {
		taskId,
		files,
		declaredAt: '2026-01-01T00:00:00.000Z',
	};
	fs.writeFileSync(
		path.join(scopesDir, `scope-${taskId}.json`),
		JSON.stringify(scope),
	);
}

describe('planEpicWaves', () => {
	let tempDir: string;
	let scopesDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-planner-test-'));
		scopesDir = path.join(tempDir, '.swarm', 'scopes');
		fs.mkdirSync(scopesDir, { recursive: true });
	});

	afterEach(() => {
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// ignore
		}
	});

	// ─── Phase-2 shape ────────────────────────────────────────────────────────
	describe('Phase-2 branching DAG (the structural fix)', () => {
		test('A → B → {C, D, E, F} with disjoint scopes produces 3 waves', () => {
			writeScope(scopesDir, '2.1', ['src/protocol.py', 'src/registry.py']);
			writeScope(scopesDir, '2.2', ['src/column_types.py']);
			writeScope(scopesDir, '2.3', ['src/models/logistic.py']);
			writeScope(scopesDir, '2.4', ['src/models/random_forest.py']);
			writeScope(scopesDir, '2.5', ['src/models/xgboost.py']);
			writeScope(scopesDir, '2.6', ['src/models/calibrated_mlp.py']);

			const plan = makePlan([
				{ id: '2.1', description: 'Registry', status: 'pending', depends: [] },
				{
					id: '2.2',
					description: 'Column types',
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
					description: 'Random Forest',
					status: 'pending',
					depends: ['2.1', '2.2'],
				},
				{
					id: '2.5',
					description: 'XGBoost',
					status: 'pending',
					depends: ['2.1', '2.2'],
				},
				{
					id: '2.6',
					description: 'Calibrated MLP',
					status: 'pending',
					depends: ['2.1', '2.2'],
				},
			]);

			const result = planEpicWaves(tempDir, 1, plan, makeConfig());

			expect(result.waves.length).toBe(3);
			expect(result.waves[0].taskIds).toEqual(['2.1']);
			expect(result.waves[1].taskIds).toEqual(['2.2']);
			expect(result.waves[2].taskIds).toEqual(['2.3', '2.4', '2.5', '2.6']);
			expect(result.serializedTasks.length).toBe(0);
			expect(result.degradedTasks.length).toBe(0);
			expect(result.totalConcurrentTasks).toBe(6);
			expect(result.totalPendingTasks).toBe(6);
		});

		test('sibling fanout with shared __init__.py forces extra waves', () => {
			// Pathological case: all 4 leaves also claim a shared file.
			writeScope(scopesDir, '2.1', ['src/a.py']);
			writeScope(scopesDir, '2.2', [
				'src/models/logistic.py',
				'src/models/__init__.py',
			]);
			writeScope(scopesDir, '2.3', [
				'src/models/random_forest.py',
				'src/models/__init__.py',
			]);
			writeScope(scopesDir, '2.4', [
				'src/models/xgboost.py',
				'src/models/__init__.py',
			]);

			const plan = makePlan([
				{ id: '2.1', description: 'Root', status: 'pending', depends: [] },
				{
					id: '2.2',
					description: 'Logistic',
					status: 'pending',
					depends: ['2.1'],
				},
				{
					id: '2.3',
					description: 'Random Forest',
					status: 'pending',
					depends: ['2.1'],
				},
				{
					id: '2.4',
					description: 'XGBoost',
					status: 'pending',
					depends: ['2.1'],
				},
			]);

			const result = planEpicWaves(tempDir, 1, plan, makeConfig());

			// 2.1 alone in wave 1, then each leaf in its own wave (4 waves total).
			expect(result.waves.length).toBe(4);
			expect(result.waves[0].taskIds).toEqual(['2.1']);
			expect(result.waves[1].taskIds).toEqual(['2.2']);
			expect(result.waves[2].taskIds).toEqual(['2.3']);
			expect(result.waves[3].taskIds).toEqual(['2.4']);
			expect(result.serializedTasks.length).toBe(0);
		});
	});

	// ─── Edge: empty / single ─────────────────────────────────────────────────
	describe('trivial shapes', () => {
		test('non-existent phase produces empty plan', () => {
			const plan = makePlan([
				{ id: '1.1', description: 't', status: 'pending', depends: [] },
			]);
			const result = planEpicWaves(tempDir, 99, plan, makeConfig());
			expect(result.waves).toEqual([]);
			expect(result.totalPendingTasks).toBe(0);
		});

		test('all tasks completed produces empty plan', () => {
			const plan = makePlan([
				{ id: '1.1', description: 't', status: 'completed', depends: [] },
			]);
			const result = planEpicWaves(tempDir, 1, plan, makeConfig());
			expect(result.waves).toEqual([]);
		});

		test('single pending task → one wave with one task', () => {
			writeScope(scopesDir, '1.1', ['src/a.ts']);
			const plan = makePlan([
				{ id: '1.1', description: 't', status: 'pending', depends: [] },
			]);
			const result = planEpicWaves(tempDir, 1, plan, makeConfig());
			expect(result.waves.length).toBe(1);
			expect(result.waves[0].taskIds).toEqual(['1.1']);
			expect(result.totalConcurrentTasks).toBe(1);
		});
	});

	// ─── Conflict resolution ──────────────────────────────────────────────────
	describe('scope conflicts', () => {
		test('two siblings with same single file split into two waves', () => {
			writeScope(scopesDir, '1.1', ['src/a.ts']);
			writeScope(scopesDir, '1.2', ['src/a.ts']);
			const plan = makePlan([
				{ id: '1.1', description: 't', status: 'pending', depends: [] },
				{ id: '1.2', description: 't', status: 'pending', depends: [] },
			]);
			const result = planEpicWaves(tempDir, 1, plan, makeConfig());
			expect(result.waves.length).toBe(2);
			expect(result.waves[0].taskIds).toEqual(['1.1']);
			expect(result.waves[1].taskIds).toEqual(['1.2']);
		});

		test('parent/child path conflict resolves to two waves', () => {
			// Use non-protected paths — `auth` is a protected pattern and would
			// degrade the tasks before they reach scope-conflict checking.
			writeScope(scopesDir, '1.1', ['src/feature']);
			writeScope(scopesDir, '1.2', ['src/feature/module.ts']);
			const plan = makePlan([
				{ id: '1.1', description: 'dir', status: 'pending', depends: [] },
				{ id: '1.2', description: 'file', status: 'pending', depends: [] },
			]);
			const result = planEpicWaves(tempDir, 1, plan, makeConfig());
			expect(result.waves.length).toBe(2);
		});
	});

	// ─── Risk categories ──────────────────────────────────────────────────────
	describe('risk classification (parity with lane planner)', () => {
		test('no-scope task serializes (require_declared_scope=true)', () => {
			// No scope file → category 'no-scope' → serialize.
			const plan = makePlan([
				{
					id: '1.1',
					description: 't',
					status: 'pending',
					depends: [],
					files_touched: [],
				},
			]);
			const result = planEpicWaves(tempDir, 1, plan, makeConfig());
			expect(result.waves.length).toBe(0);
			expect(result.serializedTasks).toEqual(['1.1']);
		});

		test('global file (package.json) → degraded', () => {
			writeScope(scopesDir, '1.1', ['package.json']);
			const plan = makePlan([
				{ id: '1.1', description: 't', status: 'pending', depends: [] },
			]);
			const result = planEpicWaves(tempDir, 1, plan, makeConfig());
			expect(result.degradedTasks.length).toBe(1);
			expect(result.degradedTasks[0].taskId).toBe('1.1');
			expect(result.degradedTasks[0].reason).toBe('global file conflict');
		});
	});

	// ─── Concurrency cap ──────────────────────────────────────────────────────
	describe('max_parallel_coders cap', () => {
		test('5 disjoint siblings with cap=2 produce 3 waves of [2,2,1]', () => {
			for (const id of ['1.1', '1.2', '1.3', '1.4', '1.5']) {
				writeScope(scopesDir, id, [`src/${id}.ts`]);
			}
			const plan = makePlan([
				{ id: '1.1', description: 't', status: 'pending', depends: [] },
				{ id: '1.2', description: 't', status: 'pending', depends: [] },
				{ id: '1.3', description: 't', status: 'pending', depends: [] },
				{ id: '1.4', description: 't', status: 'pending', depends: [] },
				{ id: '1.5', description: 't', status: 'pending', depends: [] },
			]);
			const result = planEpicWaves(
				tempDir,
				1,
				plan,
				makeConfig({ max_parallel_coders: 2 }),
			);
			expect(result.waves.length).toBe(3);
			expect(result.waves[0].taskIds.length).toBe(2);
			expect(result.waves[1].taskIds.length).toBe(2);
			expect(result.waves[2].taskIds.length).toBe(1);
		});
	});

	// ─── Topology ────────────────────────────────────────────────────────────
	describe('topology', () => {
		test('deep chain A → B → C → D → E produces 5 waves', () => {
			for (const id of ['1.1', '1.2', '1.3', '1.4', '1.5']) {
				writeScope(scopesDir, id, [`src/${id}.ts`]);
			}
			const plan = makePlan([
				{ id: '1.1', description: 't', status: 'pending', depends: [] },
				{ id: '1.2', description: 't', status: 'pending', depends: ['1.1'] },
				{ id: '1.3', description: 't', status: 'pending', depends: ['1.2'] },
				{ id: '1.4', description: 't', status: 'pending', depends: ['1.3'] },
				{ id: '1.5', description: 't', status: 'pending', depends: ['1.4'] },
			]);
			const result = planEpicWaves(tempDir, 1, plan, makeConfig());
			expect(result.waves.length).toBe(5);
			for (let i = 0; i < 5; i++) {
				expect(result.waves[i].taskIds.length).toBe(1);
			}
		});

		test('fan-in {A, B, C} → D produces 2 waves: [A,B,C] then [D]', () => {
			writeScope(scopesDir, '1.1', ['src/a.ts']);
			writeScope(scopesDir, '1.2', ['src/b.ts']);
			writeScope(scopesDir, '1.3', ['src/c.ts']);
			writeScope(scopesDir, '1.4', ['src/d.ts']);
			const plan = makePlan([
				{ id: '1.1', description: 't', status: 'pending', depends: [] },
				{ id: '1.2', description: 't', status: 'pending', depends: [] },
				{ id: '1.3', description: 't', status: 'pending', depends: [] },
				{
					id: '1.4',
					description: 't',
					status: 'pending',
					depends: ['1.1', '1.2', '1.3'],
				},
			]);
			const result = planEpicWaves(tempDir, 1, plan, makeConfig());
			expect(result.waves.length).toBe(2);
			expect(result.waves[0].taskIds).toEqual(['1.1', '1.2', '1.3']);
			expect(result.waves[1].taskIds).toEqual(['1.4']);
		});

		test('cycle is fail-closed: serialize the cycle members', () => {
			writeScope(scopesDir, '1.1', ['src/a.ts']);
			writeScope(scopesDir, '1.2', ['src/b.ts']);
			const plan = makePlan([
				{ id: '1.1', description: 't', status: 'pending', depends: ['1.2'] },
				{ id: '1.2', description: 't', status: 'pending', depends: ['1.1'] },
			]);
			const result = planEpicWaves(tempDir, 1, plan, makeConfig());
			expect(result.serializedTasks.sort()).toEqual(['1.1', '1.2']);
			expect(result.waves.length).toBe(0);
		});
	});

	// ─── Rule 3 ──────────────────────────────────────────────────────────────
	describe('Rule 3 (cross-batch upstream)', () => {
		test('predicate rejects cross-batch dep → leftover surfaces as degraded', () => {
			writeScope(scopesDir, '2.1', ['src/a.ts']);
			const plan = makePlan([
				{ id: '2.1', description: 't', status: 'pending', depends: ['1.99'] },
			]);
			// 1.99 is NOT in the task set; predicate says it's not committed.
			const isUpstreamCommitted = () => false;
			const result = planEpicWaves(
				tempDir,
				1,
				plan,
				makeConfig(),
				undefined,
				isUpstreamCommitted,
			);
			expect(result.waves.length).toBe(0);
			expect(result.degradedTasks.length).toBe(1);
			expect(result.degradedTasks[0].reason).toContain(
				'cross-batch upstream not committed',
			);
		});

		test('predicate accepts cross-batch dep → task runs normally', () => {
			writeScope(scopesDir, '2.1', ['src/a.ts']);
			const plan = makePlan([
				{ id: '2.1', description: 't', status: 'pending', depends: ['1.99'] },
			]);
			const isUpstreamCommitted = () => true;
			const result = planEpicWaves(
				tempDir,
				1,
				plan,
				makeConfig(),
				undefined,
				isUpstreamCommitted,
			);
			expect(result.waves.length).toBe(1);
			expect(result.waves[0].taskIds).toEqual(['2.1']);
			expect(result.degradedTasks.length).toBe(0);
		});

		test('without predicate, cross-batch dep is implicitly satisfied (legacy)', () => {
			writeScope(scopesDir, '2.1', ['src/a.ts']);
			const plan = makePlan([
				{ id: '2.1', description: 't', status: 'pending', depends: ['1.99'] },
			]);
			const result = planEpicWaves(tempDir, 1, plan, makeConfig());
			expect(result.waves.length).toBe(1);
		});
	});

	// ─── Determinism ─────────────────────────────────────────────────────────
	describe('determinism', () => {
		test('same input produces same wave membership and order', () => {
			for (const id of ['1.3', '1.1', '1.2']) {
				writeScope(scopesDir, id, [`src/${id}.ts`]);
			}
			const plan = makePlan([
				{ id: '1.3', description: 't', status: 'pending', depends: [] },
				{ id: '1.1', description: 't', status: 'pending', depends: [] },
				{ id: '1.2', description: 't', status: 'pending', depends: [] },
			]);
			const r1 = planEpicWaves(tempDir, 1, plan, makeConfig());
			const r2 = planEpicWaves(tempDir, 1, plan, makeConfig());
			expect(r1.waves[0].taskIds).toEqual(r2.waves[0].taskIds);
			// Lex order within a wave.
			expect(r1.waves[0].taskIds).toEqual(['1.1', '1.2', '1.3']);
		});
	});

	// ─── Pathological config / coverage gaps ──────────────────────────────────
	describe('pathological configurations', () => {
		test('max_parallel_coders=0: every task drains to serializedTasks instead of silently dropping', () => {
			writeScope(scopesDir, '1.1', ['src/a.ts']);
			writeScope(scopesDir, '1.2', ['src/b.ts']);
			const plan = makePlan([
				{ id: '1.1', description: 't', status: 'pending', depends: [] },
				{ id: '1.2', description: 't', status: 'pending', depends: [] },
			]);
			const result = planEpicWaves(
				tempDir,
				1,
				plan,
				makeConfig({ max_parallel_coders: 0 }),
			);
			// No waves should be emitted (cap is 0), but tasks MUST be accounted for.
			expect(result.waves).toEqual([]);
			expect(result.serializedTasks.sort()).toEqual(['1.1', '1.2']);
			expect(result.totalPendingTasks).toBe(2);
			// Envelope invariant: every pending task is accounted for somewhere.
			expect(
				result.serializedTasks.length +
					result.degradedTasks.length +
					result.totalConcurrentTasks,
			).toBe(result.totalPendingTasks);
			// And a degradation summary surfaces the cap-zero misconfiguration
			// so the operator sees a single actionable line.
			expect(result.degradationSummary).toBeDefined();
			expect(result.degradationSummary).toContain('max_parallel_coders=0');
		});

		test('max_parallel_coders=0 with dependency chain: downstream tasks of drained upstream also drain (sweep-8 fix)', () => {
			// The sweep-8 HIGH bug: with `break` after the no-progress
			// drain, downstream tasks of drained upstream were silently
			// dropped because the loop exited before their getReadyTasks
			// pass picked them up. Verifies the fix removes the break so
			// the cascade catches the full chain.
			writeScope(scopesDir, '1.1', ['src/a.ts']);
			writeScope(scopesDir, '1.2', ['src/b.ts']);
			writeScope(scopesDir, '1.3', ['src/c.ts']);
			const plan = makePlan([
				{ id: '1.1', description: 't', status: 'pending', depends: [] },
				{ id: '1.2', description: 't', status: 'pending', depends: ['1.1'] },
				{ id: '1.3', description: 't', status: 'pending', depends: ['1.2'] },
			]);
			const result = planEpicWaves(
				tempDir,
				1,
				plan,
				makeConfig({ max_parallel_coders: 0 }),
			);
			expect(result.waves).toEqual([]);
			// ALL THREE tasks must be in serializedTasks — none silently dropped.
			expect(result.serializedTasks.sort()).toEqual(['1.1', '1.2', '1.3']);
			expect(result.totalPendingTasks).toBe(3);
			expect(
				result.serializedTasks.length +
					result.degradedTasks.length +
					result.totalConcurrentTasks,
			).toBe(result.totalPendingTasks);
		});

		test('empty explicit scopes map entry classified as no-scope (not silently admitted as "normal")', () => {
			const plan = makePlan([
				{
					id: '1.1',
					description: 't',
					status: 'pending',
					depends: [],
					files_touched: [],
				},
			]);
			const result = planEpicWaves(tempDir, 1, plan, makeConfig(), {
				'1.1': [], // pathological caller-side input
			});
			expect(result.waves).toEqual([]);
			expect(result.serializedTasks).toEqual(['1.1']);
		});

		test('require_declared_scope=false + empty files_touched: serialized, NOT admitted as normal-with-empty-scope', () => {
			// The hole sweep 5 found: with require_declared_scope=false the
			// fallback `task.files_touched` short-circuits, but if that
			// array is ALSO empty the task previously classified as
			// `normal` with zero file claims — silently joining a wave
			// with no authority.
			const plan = makePlan([
				{
					id: '1.1',
					description: 't',
					status: 'pending',
					depends: [],
					files_touched: [],
				},
			]);
			const result = planEpicWaves(
				tempDir,
				1,
				plan,
				makeConfig({ require_declared_scope: false }),
			);
			expect(result.waves).toEqual([]);
			expect(result.serializedTasks).toEqual(['1.1']);
		});

		test('malformed plan (phase.tasks missing) returns empty plan instead of throwing', () => {
			const malformed = {
				phases: [{ id: 1, name: 'Empty' } as unknown as PlanPhase],
			};
			expect(() =>
				planEpicWaves(tempDir, 1, malformed, makeConfig()),
			).not.toThrow();
			const result = planEpicWaves(tempDir, 1, malformed, makeConfig());
			expect(result.waves).toEqual([]);
			expect(result.totalPendingTasks).toBe(0);
		});

		test('duplicate task id: keep first occurrence, no silent data loss for distinct tasks', () => {
			writeScope(scopesDir, '1.1', ['src/a.ts']);
			writeScope(scopesDir, '1.2', ['src/b.ts']);
			const plan = makePlan([
				{ id: '1.1', description: 'first', status: 'pending', depends: [] },
				{ id: '1.1', description: 'duplicate', status: 'pending', depends: [] },
				{
					id: '1.2',
					description: 'depends on 1.1',
					status: 'pending',
					depends: ['1.1'],
				},
			]);
			const result = planEpicWaves(tempDir, 1, plan, makeConfig());
			// First "1.1" wins; downstream "1.2" can still depend on it.
			expect(result.waves.length).toBe(2);
			expect(result.waves[0].taskIds).toEqual(['1.1']);
			expect(result.waves[1].taskIds).toEqual(['1.2']);
			// Envelope invariant: only unique task ids appear once.
			expect(result.totalConcurrentTasks).toBe(2);
		});

		test('protected path with degrade_on_risk=false: serialized, not degraded (covers serialize-policy arm)', () => {
			// `auth` is in the protected pattern list; with
			// `degrade_on_risk=false`, the protected branch serializes.
			writeScope(scopesDir, '1.1', ['src/auth/login.ts']);
			const plan = makePlan([
				{ id: '1.1', description: 't', status: 'pending', depends: [] },
			]);
			const result = planEpicWaves(
				tempDir,
				1,
				plan,
				makeConfig({ degrade_on_risk: false }),
			);
			expect(result.serializedTasks).toEqual(['1.1']);
			expect(result.degradedTasks).toEqual([]);
			expect(result.waves).toEqual([]);
		});

		test('phase of only protected/global tasks: waves=[] and every task accounted for', () => {
			writeScope(scopesDir, '1.1', ['package.json']); // global → degrade
			writeScope(scopesDir, '1.2', ['src/auth/login.ts']); // protected → degrade (default)
			const plan = makePlan([
				{ id: '1.1', description: 't', status: 'pending', depends: [] },
				{ id: '1.2', description: 't', status: 'pending', depends: [] },
			]);
			const result = planEpicWaves(tempDir, 1, plan, makeConfig());
			expect(result.waves).toEqual([]);
			expect(result.totalConcurrentTasks).toBe(0);
			expect(result.serializedTasks.length + result.degradedTasks.length).toBe(
				result.totalPendingTasks,
			);
		});

		test('Rule 3 in-batch chain: downstream of a Rule-3-blocked upstream degrades with in-batch reason, not cross-batch', () => {
			// A depends on out-of-batch X (rejected by predicate);
			// B depends on A. After Rule-3 cleanup marks A degraded,
			// B's leftover-reason must blame the in-batch dep A, not cross-batch X.
			writeScope(scopesDir, '2.1', ['src/a.ts']);
			writeScope(scopesDir, '2.2', ['src/b.ts']);
			const plan = makePlan([
				{
					id: '2.1',
					description: 't',
					status: 'pending',
					depends: ['1.99'], // out-of-batch
				},
				{
					id: '2.2',
					description: 't',
					status: 'pending',
					depends: ['2.1'], // depends on the blocked one
				},
			]);
			const isUpstreamCommitted = () => false; // 1.99 never committed
			const result = planEpicWaves(
				tempDir,
				1,
				plan,
				makeConfig(),
				undefined,
				isUpstreamCommitted,
			);
			const reasonFor = (id: string) =>
				result.degradedTasks.find((t) => t.taskId === id)?.reason ?? '';
			expect(reasonFor('2.1')).toContain('cross-batch upstream not committed');
			// 2.2's deps include 2.1 which is in-batch — it must blame
			// "unresolved in-batch dependency", not cross-batch.
			expect(reasonFor('2.2')).toContain('unresolved in-batch dependency');
			expect(reasonFor('2.2')).not.toContain('cross-batch');
		});
	});

	// ─── Provided scopes override disk ────────────────────────────────────────
	describe('scope source precedence', () => {
		test('explicit scopes map overrides on-disk scope files', () => {
			writeScope(scopesDir, '1.1', ['src/from-disk.ts']);
			const plan = makePlan([
				{ id: '1.1', description: 't', status: 'pending', depends: [] },
			]);
			const result = planEpicWaves(tempDir, 1, plan, makeConfig(), {
				'1.1': ['src/from-arg.ts'],
			});
			expect(result.waves[0].files.some((f) => f.includes('from-arg.ts'))).toBe(
				true,
			);
			expect(
				result.waves[0].files.some((f) => f.includes('from-disk.ts')),
			).toBe(false);
		});
	});
});

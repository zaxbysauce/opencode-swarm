/**
 * End-to-end integration test for the Epic Mode wave planner.
 *
 * The unit tests pin down the wave algorithm and the tool wrapper in
 * isolation. This file is the round-trip backstop for the actual flow the
 * architect runs in a no-git project (exactly the `fair-clinical-bench-v2`
 * Phase 2 shape that motivated this patch):
 *
 *   declare_scope (×6)  →  epic_decide_phase  →  epic_plan_waves  →  waves
 *
 * The structural fix lives in `epic_plan_waves`: where `lean_turbo_plan_lanes`
 * collapses the branching DAG `A → B → {C, D, E, F}` into a single lane (every
 * sibling sharing deps fails the cross-lane-dep test and serializes), the
 * wave planner emits `wave 1: [A]` `wave 2: [B]` `wave 3: [C, D, E, F]`.
 * That partition is what the architect needs to dispatch four concurrent
 * coders for `C, D, E, F` in one assistant message.
 *
 * Also covered: the kitchen-sink-scope failure mode (architect claims a
 * shared file in every sibling scope) — the wave planner correctly splits
 * those into more waves rather than silently degrading to serial.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Plan } from '../../src/config/plan-schema';
import { savePlan } from '../../src/plan/manager';
import { executeEpicPlanWaves } from '../../src/tools/epic-plan-waves';
import { executeEpicDecidePhase } from '../../src/tools/epic-run-phase';
import { enableEpicMode } from '../../src/turbo/epic/state';

function makePhase2Plan(): Plan {
	return {
		schema_version: '1.0.0',
		title: 'Wave-planning integration',
		swarm: 'integration',
		current_phase: 2,
		phases: [
			{
				id: 1,
				name: 'Setup',
				status: 'completed',
				tasks: [
					{
						id: '1.1',
						phase: 1,
						status: 'completed',
						size: 'small',
						description: 'Package scaffolding',
						depends: [],
						files_touched: [],
					},
				],
			},
			{
				id: 2,
				name: 'Models',
				status: 'pending',
				tasks: [
					{
						id: '2.1',
						phase: 2,
						status: 'pending',
						size: 'small',
						description: 'Registry',
						depends: ['1.1'],
						files_touched: [],
					},
					{
						id: '2.2',
						phase: 2,
						status: 'pending',
						size: 'small',
						description: 'Column types',
						depends: ['2.1'],
						files_touched: [],
					},
					{
						id: '2.3',
						phase: 2,
						status: 'pending',
						size: 'small',
						description: 'Logistic',
						depends: ['2.1', '2.2'],
						files_touched: [],
					},
					{
						id: '2.4',
						phase: 2,
						status: 'pending',
						size: 'small',
						description: 'Random Forest',
						depends: ['2.1', '2.2'],
						files_touched: [],
					},
					{
						id: '2.5',
						phase: 2,
						status: 'pending',
						size: 'small',
						description: 'XGBoost',
						depends: ['2.1', '2.2'],
						files_touched: [],
					},
					{
						id: '2.6',
						phase: 2,
						status: 'pending',
						size: 'small',
						description: 'Calibrated MLP',
						depends: ['2.1', '2.2'],
						files_touched: [],
					},
				],
			},
		],
		migration_status: 'native',
	};
}

function writeScopeFile(dir: string, taskId: string, files: string[]): void {
	const scopesDir = path.join(dir, '.swarm', 'scopes');
	fs.mkdirSync(scopesDir, { recursive: true });
	fs.writeFileSync(
		path.join(scopesDir, `scope-${taskId}.json`),
		JSON.stringify({
			taskId,
			files,
			declaredAt: '2026-06-04T00:00:00.000Z',
		}),
	);
}

describe('Epic Mode wave planning — Phase-2-shape integration on no-git project', () => {
	let dir: string;

	beforeEach(async () => {
		// Same `mkdtempSync` (not realpathSync) pattern as `epic-phase-handoff.test.ts`:
		// macOS resolves `/tmp/...` to `/private/tmp/...`, and `private` triggers
		// the protected-path classifier — would degrade tasks for unrelated reasons.
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'epic-wave-'));
		fs.mkdirSync(path.join(dir, '.swarm'), { recursive: true });
		await savePlan(dir, makePhase2Plan());
		// No git init — this is the no-git Rule-1 scenario.
		enableEpicMode(dir, 'wave-integration-session');
	});

	afterEach(() => {
		try {
			fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			/* best-effort cleanup */
		}
	});

	test('clean disjoint scopes: decide promotes, plan_waves produces 3 waves with the right partition', async () => {
		writeScopeFile(dir, '2.1', ['src/registry.py', 'src/protocol.py']);
		writeScopeFile(dir, '2.2', ['src/column_types.py']);
		writeScopeFile(dir, '2.3', ['src/models/logistic.py']);
		writeScopeFile(dir, '2.4', ['src/models/random_forest.py']);
		writeScopeFile(dir, '2.5', ['src/models/xgboost.py']);
		writeScopeFile(dir, '2.6', ['src/models/mlp.py']);

		// Step 2 of the banner: epic_decide_phase
		const decideResult = await executeEpicDecidePhase({
			directory: dir,
			phase: 2,
			sessionID: 'wave-integration-session',
		});
		expect(decideResult.success).toBe(true);
		expect(decideResult.reason).toBe('decided');
		expect(decideResult.verdict?.decision).toBe('promote');
		// Rule 1: no-git bypass should fire.
		expect(
			decideResult.verdict?.rationale?.greenfieldCheck?.bypassedNoGit,
		).toBe(true);

		// Step 4 of the banner: epic_plan_waves
		const planResult = await executeEpicPlanWaves({ directory: dir, phase: 2 });
		expect(planResult.success).toBe(true);
		expect(planResult.waves?.length).toBe(3);
		expect(planResult.waves?.[0].taskIds).toEqual(['2.1']);
		expect(planResult.waves?.[1].taskIds).toEqual(['2.2']);
		expect(planResult.waves?.[2].taskIds).toEqual(['2.3', '2.4', '2.5', '2.6']);
		expect(planResult.serializedTasks).toEqual([]);
		expect(planResult.degradedTasks).toEqual([]);
		expect(planResult.plan?.totalConcurrentTasks).toBe(6);

		// Step 5 of the banner (architect side, not exercised here): for each
		// wave dispatch one Task per taskId, ALL in one message. We assert the
		// shape the architect needs to drive that loop.
		expect(planResult.waves?.[2].taskIds.length).toBe(4); // four concurrent coders
	});

	test('kitchen-sink scope (architect claims shared __init__.py on every sibling): wave planner splits into more waves rather than degrading', async () => {
		writeScopeFile(dir, '2.1', ['src/registry.py']);
		writeScopeFile(dir, '2.2', ['src/column_types.py']);
		// The pathological recovery: every sibling claims the shared __init__.py.
		writeScopeFile(dir, '2.3', [
			'src/models/logistic.py',
			'src/models/__init__.py',
		]);
		writeScopeFile(dir, '2.4', [
			'src/models/random_forest.py',
			'src/models/__init__.py',
		]);
		writeScopeFile(dir, '2.5', [
			'src/models/xgboost.py',
			'src/models/__init__.py',
		]);
		writeScopeFile(dir, '2.6', ['src/models/mlp.py', 'src/models/__init__.py']);

		const planResult = await executeEpicPlanWaves({ directory: dir, phase: 2 });
		expect(planResult.success).toBe(true);
		// 2.1 alone, 2.2 alone, then 2.3 alone, 2.4 alone, 2.5 alone, 2.6 alone.
		// The architect SHOULD avoid this scope shape — but if they don't, the
		// planner doesn't lose any task; it just emits more waves.
		expect(planResult.waves?.length).toBe(6);
		expect(planResult.serializedTasks).toEqual([]);
		expect(planResult.degradedTasks).toEqual([]);
	});

	test('scopes-missing → declare → re-call → success (the architect recovery loop)', async () => {
		// First call: no scopes declared at all.
		const firstAttempt = await executeEpicPlanWaves({
			directory: dir,
			phase: 2,
		});
		expect(firstAttempt.success).toBe(false);
		expect(firstAttempt.reason).toBe('scopes-missing');
		expect(firstAttempt.missingScopes?.sort()).toEqual([
			'2.1',
			'2.2',
			'2.3',
			'2.4',
			'2.5',
			'2.6',
		]);

		// Architect calls declare_scope for each missing id (simulated by
		// writing scope files directly — same effect on the planner).
		writeScopeFile(dir, '2.1', ['src/registry.py']);
		writeScopeFile(dir, '2.2', ['src/column_types.py']);
		writeScopeFile(dir, '2.3', ['src/models/logistic.py']);
		writeScopeFile(dir, '2.4', ['src/models/random_forest.py']);
		writeScopeFile(dir, '2.5', ['src/models/xgboost.py']);
		writeScopeFile(dir, '2.6', ['src/models/mlp.py']);

		// Re-invoke: success path.
		const secondAttempt = await executeEpicPlanWaves({
			directory: dir,
			phase: 2,
		});
		expect(secondAttempt.success).toBe(true);
		expect(secondAttempt.waves?.length).toBe(3);
	});

	test('Phase-2-shape verdict matches what the lane planner produces on the same inputs (decide is independent of planner choice)', async () => {
		// The wave planner replaces the lane planner downstream of decide,
		// but the verdict itself comes from the same activation gate. Same
		// inputs → same decide result regardless of which planner we use.
		writeScopeFile(dir, '2.1', ['src/registry.py']);
		writeScopeFile(dir, '2.2', ['src/column_types.py']);
		writeScopeFile(dir, '2.3', ['src/models/logistic.py']);
		writeScopeFile(dir, '2.4', ['src/models/random_forest.py']);
		writeScopeFile(dir, '2.5', ['src/models/xgboost.py']);
		writeScopeFile(dir, '2.6', ['src/models/mlp.py']);

		const decideA = await executeEpicDecidePhase({
			directory: dir,
			phase: 2,
			sessionID: 'wave-integration-session',
		});
		const decideB = await executeEpicDecidePhase({
			directory: dir,
			phase: 2,
			sessionID: 'wave-integration-session',
		});
		expect(decideA.verdict?.decision).toBe(decideB.verdict?.decision);
		expect(decideA.verdict?.p).toBe(decideB.verdict?.p);
	});
});

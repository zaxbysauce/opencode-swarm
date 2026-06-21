/**
 * Tests for the greenfield-smart Rule 3 integration in `planLeanTurboLanes`.
 * File: tests/unit/turbo/lean/planner-rule3.test.ts
 *
 * Rule 3: when the optional `isUpstreamCommitted` predicate is supplied,
 * a cross-batch `depends:` upstream (i.e., a dep not present in this
 * phase's task batch — typically completed in a prior phase) must be
 * committed before its downstream is parallel-eligible.
 *
 * These tests verify:
 *  - Backward compat: predicate omitted → cross-batch deps treated as
 *    satisfied (legacy behavior).
 *  - Predicate=true: cross-batch dep treated as satisfied → downstream lanes.
 *  - Predicate=false: cross-batch dep blocks → downstream is degraded
 *    with the Rule-3 reason marker (never silently dropped).
 *  - In-batch deps continue to be handled by the existing wave ordering,
 *    independent of the predicate.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { LeanTurboConfig } from '../../../../src/config/schema';
import type { ScopeFile } from '../../../../src/turbo/lean/conflicts';
import {
	type PlanPhase,
	type PlanTask,
	planLeanTurboLanes,
} from '../../../../src/turbo/lean/planner';

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

function writeScope(scopesDir: string, taskId: string, files: string[]): void {
	const scope: ScopeFile = {
		taskId,
		files,
		declaredAt: '2024-01-01T00:00:00.000Z',
	};
	fs.writeFileSync(
		path.join(scopesDir, `scope-${taskId}.json`),
		JSON.stringify(scope),
	);
}

describe('planLeanTurboLanes — greenfield-smart Rule 3', () => {
	let tempDir: string;
	let scopesDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(
			path.join(os.tmpdir(), 'lean-planner-rule3-test-'),
		);
		scopesDir = path.join(tempDir, '.swarm', 'scopes');
		fs.mkdirSync(scopesDir, { recursive: true });
	});

	afterEach(() => {
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
	});

	test('predicate omitted → cross-batch deps treated as satisfied (legacy)', () => {
		// Phase-2 task 2.1 depends on phase-1 task 1.1 (not in batch).
		writeScope(scopesDir, '2.1', ['src/a.ts']);
		const tasks: PlanTask[] = [
			{
				id: '2.1',
				description: 'phase-2 task with cross-batch dep',
				status: 'pending',
				depends: ['1.1'],
			},
		];
		const plan: { phases: PlanPhase[] } = {
			phases: [{ id: 2, name: 'P2', tasks }],
		};

		const result = planLeanTurboLanes(tempDir, 2, plan, makeConfig());

		// Legacy behavior: 2.1 should be placed in a lane.
		const placed =
			result.lanes.flatMap((l) => l.taskIds).includes('2.1') ||
			result.serializedTasks.includes('2.1');
		expect(placed).toBe(true);
		// No degradation under legacy semantics.
		expect(
			result.degradedTasks.some((d) =>
				d.reason.includes('greenfield-smart Rule 3'),
			),
		).toBe(false);
	});

	test('predicate returns true for cross-batch dep → downstream lanes', () => {
		writeScope(scopesDir, '2.1', ['src/a.ts']);
		const tasks: PlanTask[] = [
			{
				id: '2.1',
				description: 'phase-2 task with committed cross-batch dep',
				status: 'pending',
				depends: ['1.1'],
			},
		];
		const plan: { phases: PlanPhase[] } = {
			phases: [{ id: 2, name: 'P2', tasks }],
		};

		const isUpstreamCommitted = (id: string) => id === '1.1';
		const result = planLeanTurboLanes(
			tempDir,
			2,
			plan,
			makeConfig(),
			undefined,
			isUpstreamCommitted,
		);

		const inLane = result.lanes.some((l) => l.taskIds.includes('2.1'));
		expect(inLane).toBe(true);
	});

	test('predicate returns false → downstream degraded with Rule-3 marker', () => {
		writeScope(scopesDir, '2.1', ['src/a.ts']);
		const tasks: PlanTask[] = [
			{
				id: '2.1',
				description: 'phase-2 task with uncommitted cross-batch dep',
				status: 'pending',
				depends: ['1.1'],
			},
		];
		const plan: { phases: PlanPhase[] } = {
			phases: [{ id: 2, name: 'P2', tasks }],
		};

		const isUpstreamCommitted = () => false; // nothing committed
		const result = planLeanTurboLanes(
			tempDir,
			2,
			plan,
			makeConfig(),
			undefined,
			isUpstreamCommitted,
		);

		// Critical: must NOT be silently dropped — that's the bug we
		// specifically guard against in the planner cleanup step.
		const placed =
			result.lanes.flatMap((l) => l.taskIds).includes('2.1') ||
			result.serializedTasks.includes('2.1') ||
			result.degradedTasks.some((d) => d.taskId === '2.1');
		expect(placed).toBe(true);

		// Should land in degradedTasks with the Rule-3 marker so the
		// architect knows why.
		const rule3Degraded = result.degradedTasks.find((d) => d.taskId === '2.1');
		expect(rule3Degraded).toBeDefined();
		expect(rule3Degraded?.reason).toContain('Rule 3');
	});

	test('in-batch deps still flow through wave ordering, independent of predicate', () => {
		writeScope(scopesDir, '2.1', ['src/a.ts']);
		writeScope(scopesDir, '2.2', ['src/b.ts']);
		const tasks: PlanTask[] = [
			{
				id: '2.1',
				description: 'wave-1 task',
				status: 'pending',
				depends: [],
			},
			{
				id: '2.2',
				description: 'wave-2 task, in-batch dep on 2.1',
				status: 'pending',
				depends: ['2.1'],
			},
		];
		const plan: { phases: PlanPhase[] } = {
			phases: [{ id: 2, name: 'P2', tasks }],
		};

		// Predicate says nothing is committed — should not affect in-batch
		// deps. 2.2 still depends on 2.1 via the in-batch path.
		const isUpstreamCommitted = () => false;
		const result = planLeanTurboLanes(
			tempDir,
			2,
			plan,
			makeConfig(),
			undefined,
			isUpstreamCommitted,
		);

		// Both placed somewhere (lane or serialized).
		const allTasks = [
			...result.lanes.flatMap((l) => l.taskIds),
			...result.serializedTasks,
			...result.degradedTasks.map((d) => d.taskId),
		];
		expect(allTasks).toContain('2.1');
		expect(allTasks).toContain('2.2');
		// Neither task gets the Rule-3 marker — both deps are in-batch.
		expect(result.degradedTasks.some((d) => d.reason.includes('Rule 3'))).toBe(
			false,
		);
	});

	test('mixed in-batch + cross-batch deps: cross blocks, in still resolves', () => {
		writeScope(scopesDir, '2.1', ['src/a.ts']);
		writeScope(scopesDir, '2.2', ['src/b.ts']);
		const tasks: PlanTask[] = [
			{
				id: '2.1',
				description: 'free task',
				status: 'pending',
				depends: [],
			},
			{
				id: '2.2',
				description: 'depends on in-batch 2.1 and cross-batch 1.1',
				status: 'pending',
				depends: ['2.1', '1.1'],
			},
		];
		const plan: { phases: PlanPhase[] } = {
			phases: [{ id: 2, name: 'P2', tasks }],
		};

		// 1.1 (cross-batch) is uncommitted → 2.2 must be blocked by Rule 3
		// even though 2.1 (in-batch) is satisfied via wave ordering.
		const isUpstreamCommitted = () => false;
		const result = planLeanTurboLanes(
			tempDir,
			2,
			plan,
			makeConfig(),
			undefined,
			isUpstreamCommitted,
		);

		// 2.1 should be in a lane (no blocking deps).
		expect(result.lanes.some((l) => l.taskIds.includes('2.1'))).toBe(true);

		// 2.2 should land in degradedTasks with the Rule-3 marker.
		const rule3 = result.degradedTasks.find(
			(d) => d.taskId === '2.2' && d.reason.includes('Rule 3'),
		);
		expect(rule3).toBeDefined();
	});
});

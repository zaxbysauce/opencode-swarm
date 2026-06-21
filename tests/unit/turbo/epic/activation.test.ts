/**
 * Tests for Epic Mode activation decision.
 * File: tests/unit/turbo/epic/activation.test.ts
 *
 * Covers:
 *  - The three gates (p-threshold, hot-module, greenfield) each
 *    correctly block promotion when they fail.
 *  - All three pass → `promote`.
 *  - Default-serial property: any failing gate → `demote`.
 *  - Rationale shape includes evidence for each gate.
 *  - `blockingReasons` is human-readable and non-empty when demoted.
 */
import { describe, expect, test } from 'bun:test';
import type { CoChangeEntry } from '../../../../src/tools/co-change-analyzer';
import {
	decideEpicActivation,
	type EpicActivationOptions,
} from '../../../../src/turbo/epic/activation';
import type { CouplingTask } from '../../../../src/turbo/epic/coupling-report';

const DEFAULT_OPTS: EpicActivationOptions = {
	activationThreshold: 0.3,
	minCommitsForSignal: 20,
	cochangeNpmiThreshold: 0.6,
	cochangeMinCoChanges: 5,
};

function entry(fileA: string, fileB: string, npmi = 0.9): CoChangeEntry {
	const [a, b] = fileA < fileB ? [fileA, fileB] : [fileB, fileA];
	return {
		fileA: a,
		fileB: b,
		coChangeCount: 20,
		npmi,
		lift: 1,
		hasStaticEdge: false,
		totalCommits: 100,
		commitsA: 20,
		commitsB: 20,
	};
}

describe('decideEpicActivation — all gates pass', () => {
	test('promotes when p is low, no hot modules, history dense', () => {
		const tasks: CouplingTask[] = [
			{ id: '1.1', scope: ['src/foo.ts'] },
			{ id: '1.2', scope: ['src/bar.ts'] },
			{ id: '1.3', scope: ['src/baz.ts'] },
		];
		const v = decideEpicActivation(tasks, [], 50, DEFAULT_OPTS);
		expect(v.decision).toBe('promote');
		expect(v.p).toBe(0);
		expect(v.rationale.pCheck.passed).toBe(true);
		expect(v.rationale.hotModuleCheck.passed).toBe(true);
		expect(v.rationale.greenfieldCheck.passed).toBe(true);
		expect(v.blockingReasons).toEqual([]);
	});
});

describe('decideEpicActivation — p-threshold gate', () => {
	test('demotes when p exceeds activation threshold', () => {
		// 5 tasks all touching the same file → C(5,2)=10 pairs, all conflict, p=1.
		const tasks: CouplingTask[] = Array.from({ length: 5 }, (_, i) => ({
			id: `1.${i + 1}`,
			scope: ['src/shared.ts'],
		}));
		const v = decideEpicActivation(tasks, [], 50, DEFAULT_OPTS);
		expect(v.decision).toBe('demote');
		expect(v.p).toBe(1);
		expect(v.rationale.pCheck.passed).toBe(false);
		expect(v.blockingReasons[0]).toContain('p');
		expect(v.blockingReasons[0]).toContain('activation threshold');
	});

	test('exactly at threshold passes (>= comparison on demote side; <= on the gate)', () => {
		// 2 tasks, 1 conflict, p=1.0 — only passes if threshold >= 1.
		const tasks: CouplingTask[] = [
			{ id: '1.1', scope: ['src/a.ts'] },
			{ id: '1.2', scope: ['src/a.ts'] },
		];
		const v = decideEpicActivation(tasks, [], 50, {
			...DEFAULT_OPTS,
			activationThreshold: 1.0,
		});
		expect(v.rationale.pCheck.passed).toBe(true);
		// hot-module passes too (no global/protected paths)
		expect(v.decision).toBe('promote');
	});
});

describe('decideEpicActivation — hot-module gate', () => {
	test('demotes when any task touches a Lean Turbo global file', () => {
		const tasks: CouplingTask[] = [
			{ id: '1.1', scope: ['src/foo.ts'] },
			{ id: '1.2', scope: ['package.json'] }, // global file
		];
		const v = decideEpicActivation(tasks, [], 50, DEFAULT_OPTS);
		expect(v.decision).toBe('demote');
		expect(v.rationale.hotModuleCheck.passed).toBe(false);
		expect(v.rationale.hotModuleCheck.touchedHotModules).toContain(
			'package.json',
		);
		expect(v.blockingReasons.some((r) => r.includes('hot module'))).toBe(true);
	});

	test('demotes when any task touches a protected path (auth)', () => {
		const tasks: CouplingTask[] = [
			{ id: '1.1', scope: ['src/foo.ts'] },
			{ id: '1.2', scope: ['src/auth/login.ts'] },
		];
		const v = decideEpicActivation(tasks, [], 50, DEFAULT_OPTS);
		expect(v.decision).toBe('demote');
		expect(v.rationale.hotModuleCheck.passed).toBe(false);
	});

	test('does not flag false positives (e.g. authentication.ts is NOT auth)', () => {
		const tasks: CouplingTask[] = [
			{ id: '1.1', scope: ['src/foo.ts'] },
			{ id: '1.2', scope: ['src/authentication.ts'] }, // not protected
		];
		const v = decideEpicActivation(tasks, [], 50, DEFAULT_OPTS);
		expect(v.rationale.hotModuleCheck.passed).toBe(true);
	});
});

describe('decideEpicActivation — greenfield gate (Phase 10: predecessor evidence)', () => {
	// The legacy `commitsObserved >= minCommitsForSignal` floor is gone.
	// The gate now asks "are this phase's cross-phase upstream tasks in
	// git history?" — the structural happens-before check. Commit count
	// is retained in the rationale for telemetry only.

	test('passes vacuously when there are no cross-phase upstreams (Phase 1, single-phase plans, declared-independent phases)', () => {
		const tasks: CouplingTask[] = [
			{ id: '1.1', scope: ['src/foo.ts'] },
			{ id: '1.2', scope: ['src/bar.ts'] },
		];
		// Zero commits observed — historically this would have demoted;
		// under Phase 10 with no upstreams to verify, the gate passes.
		const v = decideEpicActivation(tasks, [], 0, DEFAULT_OPTS);
		expect(v.rationale.greenfieldCheck.passed).toBe(true);
		expect(v.rationale.greenfieldCheck.crossPhaseUpstreams).toEqual([]);
		expect(v.rationale.greenfieldCheck.missingUpstreams).toEqual([]);
	});

	test('passes when every cross-phase upstream has a swarm commit (the user-reported small-project scenario)', () => {
		// 12-task project, Phase 2 deciding. Phase 1 produced 4 commits
		// — well below the legacy 20-commit floor that used to permanently
		// demote small projects. Under Phase 10, the structural check
		// passes because Phase 1's deps ARE committed.
		const tasks: CouplingTask[] = [
			{ id: '2.1', scope: ['src/models/logistic.py'] },
			{ id: '2.2', scope: ['src/models/random_forest.py'] },
		];
		const v = decideEpicActivation(tasks, [], 4, {
			...DEFAULT_OPTS,
			isGitProject: true,
			crossPhaseUpstreams: ['1.1', '1.2', '1.3'],
			isUpstreamCommitted: (id) => ['1.1', '1.2', '1.3'].includes(id),
		});
		expect(v.decision).toBe('promote');
		expect(v.rationale.greenfieldCheck.passed).toBe(true);
		expect(v.rationale.greenfieldCheck.missingUpstreams).toEqual([]);
		expect(v.blockingReasons).toEqual([]);
	});

	test('fails when ANY cross-phase upstream is missing its commit', () => {
		const tasks: CouplingTask[] = [{ id: '2.1', scope: ['src/x.ts'] }];
		const v = decideEpicActivation(tasks, [], 100, {
			...DEFAULT_OPTS,
			crossPhaseUpstreams: ['1.1', '1.2'],
			isUpstreamCommitted: (id) => id === '1.1', // 1.2 missing
		});
		expect(v.decision).toBe('demote');
		expect(v.rationale.greenfieldCheck.passed).toBe(false);
		expect(v.rationale.greenfieldCheck.missingUpstreams).toEqual(['1.2']);
		expect(
			v.blockingReasons.some((r) => r.includes('predecessor evidence')),
		).toBe(true);
		expect(v.blockingReasons.some((r) => r.includes('1.2'))).toBe(true);
	});

	test('blocking reason lists EVERY missing upstream (truncates beyond 5)', () => {
		const tasks: CouplingTask[] = [{ id: '5.1', scope: ['src/x.ts'] }];
		const upstreams = ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7'];
		const v = decideEpicActivation(tasks, [], 0, {
			...DEFAULT_OPTS,
			crossPhaseUpstreams: upstreams,
			isUpstreamCommitted: () => false,
		});
		expect(v.rationale.greenfieldCheck.missingUpstreams).toEqual(upstreams);
		const reason = v.blockingReasons.find((r) =>
			r.includes('predecessor evidence'),
		);
		expect(reason).toContain('1.1');
		expect(reason).toContain('1.5');
		expect(reason).toContain('+2 more');
	});

	test('fail-closed: cross-phase upstreams supplied but isUpstreamCommitted predicate omitted ⇒ all treated as missing', () => {
		const tasks: CouplingTask[] = [{ id: '2.1', scope: ['src/x.ts'] }];
		const v = decideEpicActivation(tasks, [], 100, {
			...DEFAULT_OPTS,
			crossPhaseUpstreams: ['1.1'],
			// isUpstreamCommitted intentionally omitted.
		});
		expect(v.rationale.greenfieldCheck.passed).toBe(false);
		expect(v.rationale.greenfieldCheck.missingUpstreams).toEqual(['1.1']);
	});

	test('commit count is no longer load-bearing: a project with 100 commits but a missing upstream still demotes', () => {
		// Proves the old floor is genuinely gone — high commit count
		// alone no longer admits a phase whose declared predecessors
		// aren't actually in git.
		const tasks: CouplingTask[] = [{ id: '3.1', scope: ['src/x.ts'] }];
		const v = decideEpicActivation(tasks, [], 999, {
			...DEFAULT_OPTS,
			crossPhaseUpstreams: ['2.5'],
			isUpstreamCommitted: () => false,
		});
		expect(v.decision).toBe('demote');
		expect(v.rationale.greenfieldCheck.passed).toBe(false);
	});
});

describe('decideEpicActivation — greenfield-smart Rule 1 (no-git bypass)', () => {
	test('isGitProject=false bypasses greenfield gate even when commits=0', () => {
		const tasks: CouplingTask[] = [
			{ id: '1.1', scope: ['src/a.ts'] },
			{ id: '1.2', scope: ['src/b.ts'] },
		];
		const v = decideEpicActivation(tasks, [], 0, {
			...DEFAULT_OPTS,
			isGitProject: false,
		});
		// All gates pass → promote despite zero commits, because no-git
		// projects have no co-change signal for greenfield to evaluate.
		expect(v.decision).toBe('promote');
		expect(v.rationale.greenfieldCheck.passed).toBe(true);
		expect(v.rationale.greenfieldCheck.bypassedNoGit).toBe(true);
		expect(v.blockingReasons.some((r) => r.includes('greenfield'))).toBe(false);
	});

	test('isGitProject=true with cross-phase upstreams in git → passes (predecessor evidence)', () => {
		// Phase 10 reframe: the old "isGitProject=true must apply the
		// commit-floor" semantics are gone. The Path-B floor itself is
		// gone. Git projects pass when their structural predecessors are
		// committed, not when they've accumulated arbitrary commit count.
		const tasks: CouplingTask[] = [
			{ id: '2.1', scope: ['src/a.ts'] },
			{ id: '2.2', scope: ['src/b.ts'] },
		];
		const v = decideEpicActivation(tasks, [], 0, {
			...DEFAULT_OPTS,
			isGitProject: true,
			crossPhaseUpstreams: ['1.1'],
			isUpstreamCommitted: () => true,
		});
		expect(v.decision).toBe('promote');
		expect(v.rationale.greenfieldCheck.passed).toBe(true);
		expect(v.rationale.greenfieldCheck.bypassedNoGit).toBeUndefined();
	});

	test('isGitProject omitted with no cross-phase upstreams → passes vacuously', () => {
		const tasks: CouplingTask[] = [
			{ id: '1.1', scope: ['src/a.ts'] },
			{ id: '1.2', scope: ['src/b.ts'] },
		];
		// No isGitProject flag, no upstreams to verify, 0 commits — Phase 10
		// passes (vacuous predecessor evidence). The pre-Phase-10 behavior
		// here was demote-due-to-low-commits; that gate is gone.
		const v = decideEpicActivation(tasks, [], 0, DEFAULT_OPTS);
		expect(v.rationale.greenfieldCheck.passed).toBe(true);
		expect(v.rationale.greenfieldCheck.bypassedNoGit).toBeUndefined();
	});

	test('no-git bypass does NOT short-circuit the other gates', () => {
		// Even with the greenfield bypass, hot-module conflicts must still
		// fail-closed. Bypass ≠ "auto-promote everything".
		const tasks: CouplingTask[] = [
			{ id: '1.1', scope: ['src/foo.ts'] },
			{ id: '1.2', scope: ['package.json'] }, // global file → hot
		];
		const v = decideEpicActivation(tasks, [], 0, {
			...DEFAULT_OPTS,
			isGitProject: false,
		});
		expect(v.decision).toBe('demote');
		expect(v.rationale.greenfieldCheck.passed).toBe(true);
		expect(v.rationale.hotModuleCheck.passed).toBe(false);
	});
});

describe('decideEpicActivation — multi-gate failures', () => {
	test('blockingReasons lists every failing gate', () => {
		const tasks: CouplingTask[] = [
			{ id: '2.1', scope: ['src/auth.ts'] },
			{ id: '2.2', scope: ['src/auth.ts'] }, // path conflict + protected
		];
		// Pair the trip-wires with a missing cross-phase upstream so all
		// three gates fail simultaneously.
		const v = decideEpicActivation(tasks, [], 0, {
			...DEFAULT_OPTS,
			crossPhaseUpstreams: ['1.1'],
			isUpstreamCommitted: () => false,
		});
		expect(v.decision).toBe('demote');
		expect(v.blockingReasons.length).toBeGreaterThanOrEqual(2);
		// At least one mention of each failed gate
		const text = v.blockingReasons.join(' ');
		expect(text).toContain('hot module');
		expect(text).toContain('predecessor evidence');
	});

	test('cochange-only conflict still drives p (even if path passes)', () => {
		// No path overlap, but cochange pair connects two tasks → conflict.
		// Two tasks → C(2,2)=1 pair → 1 conflict → p=1.0 → demote.
		const tasks: CouplingTask[] = [
			{ id: '1.1', scope: ['src/a.ts'] },
			{ id: '1.2', scope: ['src/b.ts'] },
		];
		const pairs = [entry('src/a.ts', 'src/b.ts', 0.9)];
		const v = decideEpicActivation(tasks, pairs, 50, DEFAULT_OPTS);
		expect(v.p).toBe(1);
		expect(v.decision).toBe('demote');
	});
});

describe('decideEpicActivation — edge cases', () => {
	test('empty tasks → p=0, all gates pass (degenerate promote)', () => {
		const v = decideEpicActivation([], [], 50, DEFAULT_OPTS);
		expect(v.p).toBe(0);
		expect(v.decision).toBe('promote');
		// Notably: no tasks means no hot modules to touch.
		expect(v.rationale.hotModuleCheck.passed).toBe(true);
	});

	test('rationale shape exposes p, threshold, hotModules, commits — for evidence', () => {
		const tasks: CouplingTask[] = [{ id: '1.1', scope: ['src/x.ts'] }];
		const v = decideEpicActivation(tasks, [], 30, DEFAULT_OPTS);
		expect(v.rationale.pCheck).toHaveProperty('p');
		expect(v.rationale.pCheck).toHaveProperty('threshold');
		expect(v.rationale.hotModuleCheck).toHaveProperty('touchedHotModules');
		expect(v.rationale.greenfieldCheck).toHaveProperty('commitsObserved');
		expect(v.rationale.greenfieldCheck).toHaveProperty('minCommits');
	});
});

describe('decideEpicActivation — Phase 13 phantom-dep separation (B20)', () => {
	test('phantomDeps non-empty ⇒ gate demotes with a dedicated "phantom dep" blocking reason', () => {
		const tasks: CouplingTask[] = [{ id: '2.1', scope: ['src/x.ts'] }];
		const v = decideEpicActivation(tasks, [], 100, {
			...DEFAULT_OPTS,
			phantomDeps: ['1.7'],
			crossPhaseUpstreams: [],
			isUpstreamCommitted: () => true,
		});
		expect(v.decision).toBe('demote');
		expect(v.rationale.greenfieldCheck.passed).toBe(false);
		expect(v.rationale.greenfieldCheck.phantomDeps).toEqual(['1.7']);
		// The blocking reason must point at the typo, NOT at a
		// non-existent cross-phase upstream waiting to commit.
		const reason = v.blockingReasons.find((r) => r.includes('phantom dep'));
		expect(reason).toBeDefined();
		expect(reason).toContain('1.7');
		// And there is NO "predecessor evidence missing" reason — the
		// missingUpstreams list is empty because we have no real
		// cross-phase upstreams.
		expect(
			v.blockingReasons.some((r) => r.includes('predecessor evidence missing')),
		).toBe(false);
	});

	test('phantomDeps AND missingUpstreams both populated ⇒ both reasons surface separately', () => {
		const tasks: CouplingTask[] = [{ id: '2.1', scope: ['src/x.ts'] }];
		const v = decideEpicActivation(tasks, [], 100, {
			...DEFAULT_OPTS,
			phantomDeps: ['1.7'],
			crossPhaseUpstreams: ['1.1'],
			isUpstreamCommitted: () => false, // 1.1 not committed
		});
		expect(v.decision).toBe('demote');
		expect(v.rationale.greenfieldCheck.phantomDeps).toEqual(['1.7']);
		expect(v.rationale.greenfieldCheck.missingUpstreams).toEqual(['1.1']);
		expect(v.blockingReasons.some((r) => r.includes('phantom dep'))).toBe(true);
		expect(
			v.blockingReasons.some((r) => r.includes('predecessor evidence missing')),
		).toBe(true);
	});

	test('no phantomDeps ⇒ rationale field is OMITTED (not [])', () => {
		// Telemetry compactness: only include when relevant. This also
		// keeps the JSONL diff readable across normal vs phantom-typo
		// runs.
		const tasks: CouplingTask[] = [{ id: '1.1', scope: ['src/x.ts'] }];
		const v = decideEpicActivation(tasks, [], 100, DEFAULT_OPTS);
		expect(v.rationale.greenfieldCheck.phantomDeps).toBeUndefined();
	});
});

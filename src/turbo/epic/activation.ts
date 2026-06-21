/**
 * Epic Mode activation decision (Capability C).
 *
 * `decideEpicActivation(...)` is the pure heart of M3: given a plan, a
 * co-change pair list, and the activation thresholds, it returns a
 * structured `promote | demote` verdict with the rationale fields a
 * caller can persist for audit. Pure function — no I/O.
 *
 * Three independent gates must all pass for promotion:
 *
 *   1. **p-threshold gate.** Compute the coupling coefficient `p` over
 *      the plan's task graph using Capability A's `epicPairConflict` (via
 *      Capability B's `computeCouplingReport`). Promote only when
 *      `p <= activation_threshold`.
 *
 *   2. **Hot-module gate.** No task in scope may touch a Lean Turbo
 *      "global" or "protected" path — these are the same lists Lean
 *      Turbo already maintains (reused by import; not duplicated).
 *      Touching a hot module forces serial regardless of `p`.
 *
 *   3. **Greenfield gate.** If the co-change history is sparse (fewer
 *      than `min_commits_for_signal` distinct commits across the
 *      analyzer output), the signal is too weak to trust per brief §4.2's
 *      greenfield rule. Force serial.
 *
 * Default-serial-promote-on-proof (brief §4.2): when any gate fails or
 * the data is missing, the decision is `demote`. Promotion requires
 * positive evidence on every gate.
 */

import type { CoChangeEntry } from '../../tools/co-change-analyzer.js';
import {
	isGlobalFile,
	isProtectedPath,
	normalizePath,
} from '../lean/conflicts.js';
import type { CouplingTask } from './coupling-report.js';
import { computeCouplingReport } from './coupling-report.js';

/** Thresholds the caller supplies (typically derived from EpicConfigSchema). */
export interface EpicActivationOptions {
	/** Plan-wide p ceiling. Plans with p > activationThreshold are demoted. */
	activationThreshold: number;
	/** Greenfield floor on the analyzer's commit window. */
	minCommitsForSignal: number;
	/** NPMI floor for the co-change conflict signal — passed through to coupling. */
	cochangeNpmiThreshold: number;
	/** Minimum raw co-change count for the conflict signal. */
	cochangeMinCoChanges: number;
	/**
	 * Capability D (calibration) additions to the hot-module list. The static
	 * Lean Turbo predicates (`isGlobalFile` / `isProtectedPath`) always apply;
	 * these are normalised paths the calibration loop has promoted after
	 * observing divergent writes against the static set. Optional — falsy or
	 * empty means "no calibration overrides". Path matching is exact (post-
	 * `normalizePath`); callers compute that via `effectiveHotModules` in
	 * `./calibration-engine.ts`.
	 */
	extraHotModules?: readonly string[];
	/**
	 * Greenfield-smart Rule 1: whether the project is under git version control.
	 * The greenfield gate exists because co-change signals require git history
	 * to compute. When the project is not a git repo, there is no signal type
	 * to evaluate — the gate's premise is absent, so it passes trivially
	 * rather than fail-closed. Callers (typically `epic_run_phase`) resolve
	 * this via `isGitRepo(directory)` from `src/git/branch.ts`.
	 *
	 * Backward-compat: omitted or `undefined` reverts to legacy behavior
	 * (apply the `commitsObserved >= minCommitsForSignal` floor
	 * unconditionally). Callers should pass an explicit boolean.
	 */
	isGitProject?: boolean;
	/**
	 * Phase 13 (B20): task IDs the architect declared in `depends:` that
	 * don't resolve to ANY task in the plan. Typically an LLM typo. The
	 * gate fails closed with a dedicated `phantom dep` blocking reason so
	 * the architect sees the actual bad ID instead of being misled into
	 * hunting a non-existent cross-phase upstream. Pass alongside
	 * `crossPhaseUpstreams` (the two lists are disjoint).
	 */
	phantomDeps?: readonly string[];
	/**
	 * Phase 10 — predecessor-evidence gate redesign.
	 *
	 * Cross-phase upstream task IDs for the phase being decided: every
	 * task that lives in a strictly-prior phase AND is depended on by a
	 * task in the current phase. The gate verifies each one has a
	 * `swarm(task <id>):` marker in git log via `isUpstreamCommitted`.
	 *
	 * Empty array (the legacy default) ⇒ no cross-phase deps to check;
	 * predecessor evidence is vacuously satisfied. This is correct for
	 * Phase 1 (no prior phase), single-phase projects, and phases the
	 * architect explicitly declared as independent.
	 *
	 * Why this replaces the `commitsObserved >= minCommitsForSignal`
	 * floor: the floor was a statistical proxy for "do we have enough
	 * history to trust `p`?", but in small projects it permanently
	 * blocked parallelism (a 12-task project never reaches 20 commits).
	 * The structural check asks the actually-relevant question — "are
	 * the things this phase depends on actually in git?" — directly,
	 * regardless of project size. The architect's declared dep graph IS
	 * the parallelism specification (Lamport happens-before); Rule 2's
	 * commits ARE the synchronization point; this check ties them
	 * together.
	 *
	 * Callers (`epic_run_phase`) compute this from the plan's dep graph.
	 */
	crossPhaseUpstreams?: readonly string[];
	/**
	 * Predicate for the predecessor-evidence check above. Returns true
	 * when the given taskId has a `swarm(task <id>):` marker in git
	 * history. Same predicate Rule 3 uses at the lane planner — share
	 * one source of truth.
	 *
	 * Omitted ⇒ the gate treats every cross-phase upstream as
	 * uncommitted (fail-closed). Pair `crossPhaseUpstreams` with this
	 * predicate, or pass neither.
	 */
	isUpstreamCommitted?: (taskId: string) => boolean;
}

/** Each gate's pass/fail outcome plus the evidence behind it. */
export interface EpicActivationRationale {
	pCheck: {
		passed: boolean;
		p: number;
		threshold: number;
	};
	hotModuleCheck: {
		passed: boolean;
		touchedHotModules: string[];
	};
	greenfieldCheck: {
		passed: boolean;
		commitsObserved: number;
		minCommits: number;
		/**
		 * `true` when the caller flagged the project as non-git
		 * (`options.isGitProject === false`). In that case the gate is
		 * bypassed (`passed: true`) because the co-change signal does not
		 * apply — not because the history floor was met. Surfaced for audit
		 * so reviewers can distinguish "bypassed" from "satisfied".
		 */
		bypassedNoGit?: boolean;
		/**
		 * Phase 10: cross-phase upstream task IDs the gate consulted.
		 * Empty when the current phase has no cross-phase deps (Phase 1,
		 * single-phase plans, declared-independent phases).
		 *
		 * Phase 13 (B19): optional because pre-Phase-10 records on disk
		 * (`.swarm/evidence/epic-promotions.jsonl`) lack this field.
		 * Renderers MUST default to `[]` when reading historical records.
		 */
		crossPhaseUpstreams?: string[];
		/**
		 * Phase 10: cross-phase upstreams the predicate reported as NOT
		 * yet committed. Non-empty ⇒ the gate failed; the architect
		 * needs to wait for those tasks to commit before re-deciding.
		 *
		 * Phase 13 (B19): optional, same reason as above.
		 */
		missingUpstreams?: string[];
		/**
		 * Phase 13 (B20): dep IDs the architect declared that don't
		 * resolve to any task in the plan. Usually an LLM typo; the gate
		 * fails CLOSED so the architect can see the bad ID and fix the
		 * declaration. Distinct from `missingUpstreams` because phantom
		 * IDs aren't tasks that need to be "committed" — they don't
		 * exist at all, and the remediation is "fix the dep ID", not
		 * "wait for the upstream to land".
		 */
		phantomDeps?: string[];
	};
}

/** The verdict `decideEpicActivation` returns. */
export interface EpicActivationVerdict {
	decision: 'promote' | 'demote';
	p: number;
	rationale: EpicActivationRationale;
	/** Plain-English reasons the verdict went the way it did — for logs and UI. */
	blockingReasons: string[];
}

/**
 * Decide whether the given tasks should be promoted to parallel execution
 * via Lean Turbo's lane planner.
 *
 * Inputs are pre-resolved by the caller:
 *  - `tasks`: every task in scope (typically the whole plan), with the
 *    same `{ id, scope }` shape Capability B consumes. The caller
 *    handles `readTaskScopes` / `files_touched` resolution and any
 *    completed-task filtering.
 *  - `cochangePairs`: the analyzer's output (unfiltered) plus the
 *    `commitsObserved` count from `parseGitLog`. The greenfield gate
 *    consults the count directly so the function stays pure.
 *  - `options`: thresholds (typically read from
 *    `turbo.epic.mode.*` + `turbo.epic.cochange.*`).
 *
 * Output: structured verdict the caller persists to
 * `.swarm/evidence/epic-promotions.jsonl` and surfaces via
 * `/swarm epic status`.
 */
export function decideEpicActivation(
	tasks: CouplingTask[],
	cochangePairs: CoChangeEntry[],
	commitsObserved: number,
	options: EpicActivationOptions,
): EpicActivationVerdict {
	// Edge case worth flagging: empty `tasks` produces a vacuous-promote
	// verdict (p=0, hot-module check has nothing to fail on, greenfield
	// still gated by commitsObserved). The caller is responsible for not
	// dispatching execution against an empty plan — the verdict itself is
	// honest about what it measured, just unusual.
	// --- Gate 3: greenfield (predecessor-evidence redesign — Phase 10).
	// Evaluate first so we never trust a low p that came from an empty /
	// sparse history. (Order does not affect the final decision because all
	// three gates AND together; the order is just readable.)
	//
	// The gate's real job, in distributed-systems terms: verify Lamport's
	// happens-before relation is honored for this phase's tasks. The
	// architect's declared `depends:` edges ARE the happens-before
	// partial order. Rule 2's commits ARE the synchronization points
	// that establish happens-before at runtime. The gate ties them
	// together: a phase is admitted iff every cross-phase predecessor's
	// commit is observable in git log.
	//
	// Three paths to admission:
	//  (A) `bypassedNoGit` — Rule 1: non-git project, gate's premise
	//      (co-change signal feeding `p`) doesn't apply, skip it.
	//  (B) `predecessorEvidenceSatisfied` — every cross-phase upstream
	//      task has a `swarm(task <id>):` marker in git. Scales with
	//      project size automatically; works correctly for fresh 12-task
	//      projects (Phase 2 admitted once Phase 1's 4 deps are
	//      committed) AND for mature 100-task projects (same check, just
	//      more deps to verify).
	//
	// The legacy `commitsObserved >= minCommitsForSignal` floor was a
	// statistical proxy for "is the co-change history rich enough that we
	// can trust `p`?". In small projects it became a permanent ceiling —
	// the project could never accumulate enough commits to clear it. The
	// structural check replaces it because it asks the right question
	// directly. `commitsObserved` and `minCommitsForSignal` remain in
	// the rationale for telemetry continuity, but they are not
	// load-bearing for the decision.
	const bypassedNoGit = options.isGitProject === false;
	const crossPhaseUpstreams = options.crossPhaseUpstreams ?? [];
	const phantomDeps = options.phantomDeps ?? [];
	const missingUpstreams: string[] = [];
	for (const id of crossPhaseUpstreams) {
		if (!(options.isUpstreamCommitted?.(id) ?? false)) {
			missingUpstreams.push(id);
		}
	}
	// Phase 13 (B20): phantom deps fail the gate independently of the
	// predicate result. They're a plan-validity error, not an
	// "upstream-not-yet-committed" condition; surfacing them as a
	// separate signal stops the architect from chasing commits that
	// don't exist.
	const phantomDepsClean = phantomDeps.length === 0;
	const predecessorEvidenceSatisfied =
		missingUpstreams.length === 0 && phantomDepsClean;
	const greenfieldPassed = bypassedNoGit || predecessorEvidenceSatisfied;

	// --- Gate 2: hot-module check. Reuses Lean Turbo's exported predicates
	// (no list duplication). Calibration-promoted modules from
	// `options.extraHotModules` extend the check with normalised paths.
	const extraSet = new Set(
		(options.extraHotModules ?? []).map((f) => normalizePath(f)),
	);
	const touchedHotModules = new Set<string>();
	for (const task of tasks) {
		for (const file of task.scope) {
			if (
				isGlobalFile(file) ||
				isProtectedPath(file) ||
				extraSet.has(normalizePath(file))
			) {
				touchedHotModules.add(file);
			}
		}
	}
	const hotPassed = touchedHotModules.size === 0;

	// --- Gate 1: p threshold. Compute via Capability B's report function
	// (which itself wraps Capability A's pair predicate).
	const report = computeCouplingReport(tasks, cochangePairs, {
		npmi: options.cochangeNpmiThreshold,
		minCoChanges: options.cochangeMinCoChanges,
	});
	const pPassed = report.p <= options.activationThreshold;

	const rationale: EpicActivationRationale = {
		pCheck: {
			passed: pPassed,
			p: report.p,
			threshold: options.activationThreshold,
		},
		hotModuleCheck: {
			passed: hotPassed,
			touchedHotModules: Array.from(touchedHotModules).sort(),
		},
		greenfieldCheck: {
			passed: greenfieldPassed,
			commitsObserved,
			minCommits: options.minCommitsForSignal,
			// Phase 16 (C5.L1): when the gate is bypassed for non-git
			// projects, the predicate wasn't actually consulted —
			// `missingUpstreams` would otherwise be populated from the
			// fail-closed default and contradict `passed: true` in the
			// raw JSONL audit log. Suppress both arrays in the bypassed
			// case so downstream readers see a clean "bypassed, no
			// upstream info recorded" record.
			...(bypassedNoGit
				? {}
				: {
						crossPhaseUpstreams: [...crossPhaseUpstreams],
						missingUpstreams,
					}),
			...(phantomDeps.length > 0 ? { phantomDeps: [...phantomDeps] } : {}),
			...(bypassedNoGit ? { bypassedNoGit: true } : {}),
		},
	};

	const blockingReasons: string[] = [];
	if (!pPassed) {
		blockingReasons.push(
			`p (${report.p.toFixed(3)}) exceeds activation threshold (${options.activationThreshold.toFixed(3)})`,
		);
	}
	if (!hotPassed) {
		const sample = rationale.hotModuleCheck.touchedHotModules.slice(0, 3);
		const more =
			rationale.hotModuleCheck.touchedHotModules.length > 3
				? `, +${rationale.hotModuleCheck.touchedHotModules.length - 3} more`
				: '';
		blockingReasons.push(
			`plan touches Lean Turbo hot module(s): ${sample.join(', ')}${more}`,
		);
	}
	if (!greenfieldPassed) {
		// Phase 13 (B20): split phantom-dep typos from missing-upstream
		// reasons so the architect sees the actual problem and the right
		// remediation. Phantom = "fix the dep ID"; missing = "wait for
		// the upstream to commit".
		if (phantomDeps.length > 0) {
			const sample = phantomDeps.slice(0, 5);
			const more =
				phantomDeps.length > 5 ? `, +${phantomDeps.length - 5} more` : '';
			blockingReasons.push(
				`phantom dep id(s) declared but not present in plan (probable typo, fix the dep id) — ${sample.join(', ')}${more}`,
			);
		}
		if (missingUpstreams.length > 0) {
			const sample = missingUpstreams.slice(0, 5);
			const more =
				missingUpstreams.length > 5
					? `, +${missingUpstreams.length - 5} more`
					: '';
			blockingReasons.push(
				`predecessor evidence missing: cross-phase upstream task(s) not yet committed — ${sample.join(', ')}${more}`,
			);
		}
	}

	const decision: 'promote' | 'demote' =
		pPassed && hotPassed && greenfieldPassed ? 'promote' : 'demote';

	return {
		decision,
		p: report.p,
		rationale,
		blockingReasons,
	};
}

/**
 * Epic Mode Wave Planner.
 *
 * The wave planner partitions a phase's pending tasks into ordered *waves*.
 * A wave is a set of tasks that:
 *   - have all their dependencies satisfied by tasks in completed waves, AND
 *   - have mutually disjoint declared scopes (no two tasks in the same wave
 *     touch a shared file or parent/child path).
 *
 * Architectural contrast with the lane planner:
 *   - Lane planner: greedy fill into a fixed number of independent serial
 *     chains. Branching DAGs (e.g. `A → B → {C, D, E}`) collapse into a
 *     single chain because the cross-lane-dep rule forbids C/D/E from
 *     living in a different lane than A/B.
 *   - Wave planner: emits a sequence of concurrent groups. The same DAG
 *     becomes `wave 1: [A], wave 2: [B], wave 3: [C, D, E]`. Within a wave
 *     the architect dispatches one Task per taskId — all in one message —
 *     and the next wave starts only when the prior one is done.
 *
 * The two planners share `runPartitionPreflight` from `partition-common.ts`
 * so classification (global/protected/no-scope/normal), scope resolution,
 * and topological sort are identical. Divergence is intentional and lives
 * only in the assignment loop below.
 */

import type { LeanTurboConfig } from '../../config/schema';
import { criticalWarn } from '../../utils/logger.js';
import { pathsConflict } from '../lean/conflicts';
import {
	getReadyTasks,
	makeDependencySatisfactionChecker,
	type PlanPhase,
	runPartitionPreflight,
} from '../lean/partition-common';
import type { LeanTurboDegradedTask } from '../lean/state';

// ─── Output Types ────────────────────────────────────────────────────────────

/**
 * A single wave in the Epic plan. Tasks in a wave run concurrently; the next
 * wave starts only after all tasks in this wave complete.
 */
export interface EpicWave {
	/** 1-indexed wave number (display + ordering). */
	waveId: number;
	/** Tasks in this wave. Architect dispatches one Task per id, all in one message. */
	taskIds: string[];
	/**
	 * Union of declared scope files across the wave. Informational — Epic
	 * Mode does NOT acquire file locks (architect-driven dispatch goes
	 * directly through `Task`, bypassing the lean runner's lock path).
	 * Used for evidence/divergence reporting.
	 */
	files: string[];
}

/**
 * The complete wave plan produced by `planEpicWaves`.
 */
export interface EpicWavePlan {
	/** The phase number this plan covers. */
	phase: number;
	/** Unique identifier for this wave plan. */
	planId: string;
	/** Ordered list of waves. Empty when every task degraded or serialized. */
	waves: EpicWave[];
	/** Tasks that were serialized (cycles, no-scope, invalid-scope, protected with serialize policy). */
	serializedTasks: string[];
	/** Tasks that were degraded (global files, protected paths, Rule-3 leftovers). */
	degradedTasks: LeanTurboDegradedTask[];
	/** Human-readable summary when all tasks ended up degraded. */
	degradationSummary?: string;
	/** Total number of pending tasks the planner saw (before assignment). */
	totalPendingTasks: number;
	/** Sum of `waves[*].taskIds.length` — tasks that will actually run concurrently in a wave. */
	totalConcurrentTasks: number;
}

// ─── Main Planning Function ──────────────────────────────────────────────────

/**
 * Partition phase tasks into ordered concurrent waves.
 *
 * @param directory - Project root directory
 * @param phaseNumber - Phase number to plan
 * @param plan - The full plan object (from `.swarm/plan.json`)
 * @param config - Lean Turbo configuration (reused for risk/conflict policy)
 * @param scopes - Optional pre-loaded scopes map (taskId -> file paths)
 * @param isUpstreamCommitted - Optional Rule-3 predicate (greenfield-smart).
 *        When supplied, a cross-batch dependency (a `depends:` upstream NOT
 *        in this planning call's task set) is treated as satisfied only if
 *        the predicate returns `true`. Without it, legacy semantics apply
 *        (cross-batch deps implicitly satisfied).
 * @returns Complete wave plan with ordered concurrent groups.
 */
export function planEpicWaves(
	directory: string,
	phaseNumber: number,
	plan: { phases: PlanPhase[] },
	config: LeanTurboConfig,
	scopes?: Record<string, string[]>,
	isUpstreamCommitted?: (taskId: string) => boolean,
): EpicWavePlan {
	const phase = plan.phases.find((p) => p.id === phaseNumber);
	if (!phase) {
		return createEmptyPlan(phaseNumber, '');
	}

	// Defend against malformed plan.json (`tasks` missing/null) — matches
	// the lane planner's resilience contract: return an empty plan rather
	// than throwing a TypeError out of `.filter(...)`.
	const pendingTasks = (phase.tasks ?? []).filter(
		(t) => t.status !== 'completed',
	);
	if (pendingTasks.length === 0) {
		return createEmptyPlan(phaseNumber, '');
	}

	// Shared preflight: identical to the lane planner.
	const { sortedTasks, taskMap, tasksInCycle } = runPartitionPreflight(
		directory,
		pendingTasks,
		config,
		scopes,
	);

	const waves: EpicWave[] = [];
	const serializedTasks: string[] = [];
	const degradedTasks: LeanTurboDegradedTask[] = [];
	const assignedTasks = new Set<string>();
	const maxConcurrentPerWave = config.max_parallel_coders;

	// Pre-populate with cycle tasks (fail-closed).
	for (const taskId of tasksInCycle) {
		serializedTasks.push(taskId);
		assignedTasks.add(taskId);
	}

	const isSatisfied = makeDependencySatisfactionChecker(
		taskMap,
		assignedTasks,
		isUpstreamCommitted,
	);

	// Wave loop. Each iteration emits one wave; conflicting/overflow tasks
	// defer to a later iteration (they remain unassigned and re-appear in
	// `getReadyTasks` once a partial wave finalizes).
	let waveCounter = 1;
	while (true) {
		const readyTasks = getReadyTasks(sortedTasks, assignedTasks, isSatisfied);
		if (readyTasks.length === 0) break;

		const waveTaskIds: string[] = [];
		const waveFiles: string[] = [];
		const claimedInWave = new Set<string>();

		for (const classified of readyTasks) {
			if (assignedTasks.has(classified.task.id)) continue;

			// Risk/category handling — same semantics as the lane planner.
			if (classified.category === 'global') {
				degradedTasks.push({
					taskId: classified.task.id,
					reason: 'global file conflict',
					files: classified.files,
					requiredMode: 'balanced',
				});
				assignedTasks.add(classified.task.id);
				continue;
			}

			if (classified.category === 'protected') {
				if (config.degrade_on_risk) {
					degradedTasks.push({
						taskId: classified.task.id,
						reason: 'protected path',
						files: classified.files,
						requiredMode: 'balanced',
					});
				} else {
					serializedTasks.push(classified.task.id);
				}
				assignedTasks.add(classified.task.id);
				continue;
			}

			if (
				classified.category === 'no-scope' ||
				classified.category === 'invalid-scope'
			) {
				serializedTasks.push(classified.task.id);
				assignedTasks.add(classified.task.id);
				continue;
			}

			// Normal task: check for scope conflict with what's already claimed
			// in *this* wave. A conflict here means the task must defer to a
			// later wave (NOT serialize — the conflict is intra-wave, not
			// intra-phase).
			const conflictsInWave = classified.files.some((file) =>
				Array.from(claimedInWave).some((claimed) =>
					pathsConflict(file, claimed),
				),
			);
			if (conflictsInWave) {
				// Leave unassigned; will be re-evaluated next iteration.
				continue;
			}

			// Concurrency cap: a single wave never dispatches more than
			// `max_parallel_coders` tasks. Overflow defers to a later wave.
			if (waveTaskIds.length >= maxConcurrentPerWave) {
				continue;
			}

			// Claim and add.
			waveTaskIds.push(classified.task.id);
			for (const file of classified.files) {
				claimedInWave.add(file);
				waveFiles.push(file);
			}
		}

		// Mark this wave's tasks as assigned so the dependency predicate
		// counts them satisfied for downstream tasks.
		for (const taskId of waveTaskIds) {
			assignedTasks.add(taskId);
		}

		if (waveTaskIds.length > 0) {
			waves.push({
				waveId: waveCounter,
				taskIds: waveTaskIds,
				files: waveFiles,
			});
			waveCounter += 1;
		} else {
			// No task got admitted to a wave this iteration AND none was
			// assigned to degraded/serialized. That can only happen if every
			// ready task was rejected by the concurrency cap (e.g. caller
			// configured `max_parallel_coders = 0`, or some pathological
			// classification path we haven't reasoned about reaches here).
			// Without progress the loop would spin forever, so we drain the
			// remaining ready tasks into `serializedTasks` with an explicit
			// reason. Silently dropping a planned task is the worst possible
			// outcome (mirrors `planner.ts` Rule 3 cleanup contract).
			//
			// We do NOT `break` after draining: a downstream of a drained
			// task is now satisfiable (its dep is in `assignedTasks`) but
			// would be silently dropped if the loop exited here. The next
			// `getReadyTasks` iteration picks up those downstreams; cap
			// still rejects them; drain cascades; loop exits naturally
			// when the ready set is empty (next iteration's check at top
			// of the while loop).
			const drained: string[] = [];
			for (const classified of readyTasks) {
				if (assignedTasks.has(classified.task.id)) continue;
				serializedTasks.push(classified.task.id);
				assignedTasks.add(classified.task.id);
				drained.push(classified.task.id);
			}
			// Surface the misconfiguration to the operator immediately —
			// `degradationSummary` only covers the case where EVERY task
			// drained; partial drains otherwise leave no visible signal.
			// Fires per cascading drain iteration; for a chain that's one
			// line per task, acceptable for a misconfig signal.
			if (drained.length > 0) {
				criticalWarn(
					`[wave-planner] no-progress drain on phase ${phaseNumber}: ${drained.length} ready task(s) serialized because max_parallel_coders=${maxConcurrentPerWave}. Task ids: ${drained.join(', ')}.`,
				);
			}
			// Continue the wave loop: downstream tasks of drained tasks
			// now have satisfied deps and will appear in the next
			// `getReadyTasks` call. Without this they would be silently
			// dropped from the result envelope.
		}
	}

	// Rule-3 leftover cleanup. A cross-batch dep that `isUpstreamCommitted`
	// rejects keeps the task unassigned indefinitely. Surface those rather
	// than silently dropping.
	//
	// Attribution refinement over the lane planner: the lane planner checks
	// "is dep in assignedTasks?" but that set conflates wave-assigned with
	// degraded/serialized/cycle. A downstream of a degraded in-batch
	// upstream would then attribute to "no identifiable blocker" — which is
	// false; the real blocker is the degraded upstream. Here we check
	// "is the in-batch dep actually in a wave?" — if not, it's degraded
	// or serialized, which IS the blocker we want to surface.
	if (isUpstreamCommitted) {
		const taskIsInWave = new Set<string>();
		for (const w of waves) {
			for (const id of w.taskIds) taskIsInWave.add(id);
		}
		for (const classified of sortedTasks) {
			if (assignedTasks.has(classified.task.id)) continue;
			const deps = classified.task.depends ?? [];
			const uncommittedCrossBatch: string[] = [];
			const unassignedInBatch: string[] = [];
			for (const dep of deps) {
				if (taskMap.has(dep)) {
					if (!taskIsInWave.has(dep)) unassignedInBatch.push(dep);
				} else if (!isUpstreamCommitted(dep)) {
					uncommittedCrossBatch.push(dep);
				}
			}
			let reason: string;
			if (uncommittedCrossBatch.length > 0) {
				const sample = uncommittedCrossBatch.slice(0, 3).join(', ');
				const more =
					uncommittedCrossBatch.length > 3
						? `, +${uncommittedCrossBatch.length - 3} more`
						: '';
				reason = `cross-batch upstream not committed (greenfield-smart Rule 3): ${sample}${more}`;
			} else if (unassignedInBatch.length > 0) {
				const sample = unassignedInBatch.slice(0, 3).join(', ');
				const more =
					unassignedInBatch.length > 3
						? `, +${unassignedInBatch.length - 3} more`
						: '';
				reason = `unresolved in-batch dependency: ${sample}${more}`;
			} else {
				reason = 'planning leftover (no identifiable blocker)';
			}
			degradedTasks.push({
				taskId: classified.task.id,
				reason,
				files: classified.files,
				requiredMode: 'balanced',
			});
			assignedTasks.add(classified.task.id);
		}
	}

	// Summarize when zero waves were produced — every pending task ended
	// up degraded or serialized. The operator needs a single line they
	// can act on, otherwise they see `waves: []` with no signal whether
	// the issue is configuration, dependencies, or scope.
	let degradationSummary: string | undefined;
	if (
		waves.length === 0 &&
		degradedTasks.length + serializedTasks.length === pendingTasks.length
	) {
		if (degradedTasks.length > 0) {
			const reasons = Array.from(new Set(degradedTasks.map((t) => t.reason)));
			const rule3Count = degradedTasks.filter((t) =>
				t.reason.includes('greenfield-smart Rule 3'),
			).length;
			if (rule3Count > 0 && rule3Count >= degradedTasks.length / 2) {
				degradationSummary = `All ${pendingTasks.length} tasks degraded. ${rule3Count} blocked by greenfield-smart Rule 3 — cross-batch upstream(s) not in git history. Remediation: verify Epic Mode commit-on-completion is succeeding for upstream phases, or commit those tasks manually before re-running.`;
			} else {
				degradationSummary = `All ${pendingTasks.length} tasks degraded. Reasons: ${reasons.join(', ')}. Consider running in standard (serial) mode.`;
			}
		} else if (
			serializedTasks.length === pendingTasks.length &&
			maxConcurrentPerWave <= 0
		) {
			// Cap-zero fallback drained every task to serializedTasks but
			// produced no degraded entries. Without this branch the
			// operator would see an empty plan with no explanation.
			degradationSummary = `All ${pendingTasks.length} tasks serialized because max_parallel_coders=${maxConcurrentPerWave}. Raise it to ≥1 (or use the standard serial flow) to dispatch.`;
		} else if (serializedTasks.length === pendingTasks.length) {
			degradationSummary = `All ${pendingTasks.length} tasks serialized (no parallel waves emitted). Likely cause: missing/empty scopes or a dependency cycle. Check declared scopes and the dependency graph.`;
		}
	}

	const totalConcurrentTasks = waves.reduce(
		(sum, w) => sum + w.taskIds.length,
		0,
	);

	const planId = `epic-waves-${phaseNumber}-${Date.now()}`;

	return {
		phase: phaseNumber,
		planId,
		waves,
		serializedTasks,
		degradedTasks,
		degradationSummary,
		totalPendingTasks: pendingTasks.length,
		totalConcurrentTasks,
	};
}

function createEmptyPlan(phaseNumber: number, planId: string): EpicWavePlan {
	return {
		phase: phaseNumber,
		planId,
		waves: [],
		serializedTasks: [],
		degradedTasks: [],
		totalPendingTasks: 0,
		totalConcurrentTasks: 0,
	};
}

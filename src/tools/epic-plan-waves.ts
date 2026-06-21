/**
 * Epic Mode `epic_plan_waves` tool.
 *
 * Wraps `planEpicWaves` from `src/turbo/epic/wave-planner`. Partitions a
 * phase's pending tasks into ordered concurrent waves and returns them in a
 * shape the architect can iterate over for wave-by-wave Task dispatch.
 *
 * This is Epic Mode's replacement for `lean_turbo_plan_lanes`. The lane
 * planner stays in place for non-Epic Lean Turbo callers; Epic flows route
 * through this tool because the wave abstraction expresses branching DAGs
 * (sibling fanout from a shared prefix) correctly, where lanes collapse them.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ToolDefinition } from '@opencode-ai/plugin/tool';
import { z } from 'zod';
import { loadPluginConfigWithMeta as loadPluginConfigWithMeta_import } from '../config';
import { DEFAULT_LEAN_TURBO_CONFIG } from '../config/constants';
import type { LeanTurboConfig } from '../config/schema';
import { isGitRepo as isGitRepo_import } from '../git/branch';
import { buildIsUpstreamCommittedWithStatus as buildIsUpstreamCommittedWithStatus_import } from '../turbo/epic/upstream-commits';
import { type EpicWavePlan, planEpicWaves } from '../turbo/epic/wave-planner';
import { readTaskScopes as readTaskScopes_import } from '../turbo/lean/conflicts';
import type { PlanPhase } from '../turbo/lean/partition-common';
import { criticalWarn } from '../utils/logger.js';
import { createSwarmTool } from './create-tool';

/** Arguments for the `epic_plan_waves` tool. */
export interface EpicPlanWavesArgs {
	directory: string;
	phase: number;
	scopes?: Record<string, string[]>;
}

/** Result envelope. */
export interface EpicPlanWavesResult {
	success: boolean;
	/** Set on success — the full wave plan from `planEpicWaves`. */
	plan?: EpicWavePlan;
	/** Set on success — shortcut alias for `plan.waves`. */
	waves?: EpicWavePlan['waves'];
	/** Set on success — shortcut alias for `plan.serializedTasks`. */
	serializedTasks?: EpicWavePlan['serializedTasks'];
	/** Set on success — shortcut alias for `plan.degradedTasks`. */
	degradedTasks?: EpicWavePlan['degradedTasks'];
	/**
	 * Set when `reason === 'scopes-missing'` — the task ids that have no
	 * declared scope and no `files_touched` fallback. The architect must
	 * call `declare_scope` for each of these and re-invoke this tool.
	 */
	missingScopes?: string[];
	/** Set on failure — categorical short code (machine-readable). */
	reason?:
		| 'no-plan'
		| 'no-phase'
		| 'phase-empty'
		| 'phase-already-complete'
		| 'scopes-missing'
		| 'git-failed'
		| 'planner-error';
	/** Set on failure — long-form actionable error text. */
	errors?: string[];
}

function readPlanJson(directory: string): { phases: PlanPhase[] } | null {
	const planPath = path.join(directory, '.swarm', 'plan.json');
	if (!fs.existsSync(planPath)) return null;
	try {
		return JSON.parse(fs.readFileSync(planPath, 'utf-8'));
	} catch {
		return null;
	}
}

/**
 * Execute the `epic_plan_waves` tool.
 *
 * Six possible outcomes:
 *   1. `no-plan` — `.swarm/plan.json` missing / unparseable
 *   2. `no-phase` — phase number not in `plan.json`
 *   3. `phase-empty` — phase exists but has zero tasks
 *   4. `phase-already-complete` — every task already completed
 *   5. `scopes-missing` — one or more pending tasks have no declared scope
 *      (preflight; identical to `epic_decide_phase` so the architect can't
 *      bypass scope discipline by calling planner direct)
 *   6. `git-failed` — git log scan failed (Rule 3 evidence unavailable;
 *      we fail closed rather than implicitly satisfying cross-batch deps)
 *   7. success — `plan` and aliased fields populated
 */
export async function executeEpicPlanWaves(
	args: EpicPlanWavesArgs,
): Promise<EpicPlanWavesResult> {
	const { directory, phase, scopes } = args;

	const plan = _internals.readPlanJson(directory);
	if (!plan) {
		return {
			success: false,
			reason: 'no-plan',
			errors: [
				'plan.json not found or unparseable in .swarm directory. ' +
					'Run `/swarm specify` to bootstrap a plan, then retry.',
			],
		};
	}

	// Shape-validate the plan envelope BEFORE accessing array methods on it.
	// A hand-edited or partially-restored plan.json can have `phases` set to
	// a non-array (string, object, null) or a phase's `tasks` set similarly.
	// Without this guard the next `.find` / `.length` / `.filter` throws a
	// raw TypeError that bubbles past the wider `try` below as an opaque
	// promise rejection.
	if (!Array.isArray(plan.phases)) {
		return {
			success: false,
			reason: 'no-plan',
			errors: [
				'plan.json `phases` is not an array. ' +
					'The plan file may be corrupt or hand-edited; restore from a known-good version or re-run `/swarm specify`.',
			],
		};
	}

	const phaseObj = plan.phases.find((p) => p.id === phase);
	if (!phaseObj) {
		const availablePhases = plan.phases.map((p) => p.id).join(', ');
		return {
			success: false,
			reason: 'no-phase',
			errors: [
				`Phase ${phase} not found in plan.json. ` +
					`Available phases: ${availablePhases || '(none)'}. ` +
					'Re-invoke `epic_plan_waves` with a valid phase number.',
			],
		};
	}

	// Defensive: phase exists but its `tasks` field is missing / null / not
	// an array. Treat as `phase-empty` (semantically equivalent) rather than
	// crashing on `.length` / `.filter`.
	const tasksArray: typeof phaseObj.tasks = Array.isArray(phaseObj.tasks)
		? phaseObj.tasks
		: [];

	if (tasksArray.length === 0) {
		return {
			success: false,
			reason: 'phase-empty',
			errors: [
				`Phase ${phase} exists in plan.json but has zero tasks defined. ` +
					'Either populate this phase with tasks (declared scopes, depends, acceptance) ' +
					'and re-invoke, or remove the empty phase from plan.json and advance.',
			],
		};
	}

	const pendingTasks = tasksArray.filter((t) => t.status !== 'completed');
	if (pendingTasks.length === 0) {
		return {
			success: false,
			reason: 'phase-already-complete',
			errors: [
				`Phase ${phase} has no pending tasks — every task is already completed. ` +
					'Advance to the next phase, or set tasks back to "pending" if you intend to re-run.',
			],
		};
	}

	// Everything below this point hits disk or git and can throw on bad
	// filesystem state, scope-corruption, or git-process crashes. We wrap
	// it all so any unexpected throw surfaces as `planner-error` instead
	// of bubbling out of the tool as an opaque promise rejection.
	try {
		// Preflight: every pending task must have either a declared scope on
		// disk OR `files_touched` populated OR an explicit scopes-map entry.
		// Without scope data the wave planner has nothing to partition on
		// and would silently emit zero waves. Same gate as
		// `epic_decide_phase` for consistency.
		const tasksMissingScope: string[] = [];
		for (const task of pendingTasks) {
			const declaredScope = _internals.readTaskScopes(directory, task.id);
			const filesTouched = task.files_touched ?? [];
			const providedScope =
				scopes && task.id in scopes ? scopes[task.id] : null;
			if (
				(declaredScope === null || declaredScope.length === 0) &&
				filesTouched.length === 0 &&
				(providedScope === null || providedScope.length === 0)
			) {
				tasksMissingScope.push(task.id);
			}
		}
		if (tasksMissingScope.length > 0) {
			const list = tasksMissingScope.join(', ');
			return {
				success: false,
				reason: 'scopes-missing',
				missingScopes: tasksMissingScope,
				errors: [
					`Cannot plan waves for phase ${phase}: ${tasksMissingScope.length} pending task(s) ` +
						`have no declared scope and no files_touched in plan.json. ` +
						`The wave planner needs scope data to compute disjoint concurrent groups; ` +
						`without it the dispatch is silently serial and Epic Mode's parallelization is lost.\n\n` +
						`Missing scopes: ${list}\n\n` +
						`Resolution: call \`declare_scope\` once for EACH of those task ids with the exact ` +
						`file paths the task will touch. Then re-invoke \`epic_plan_waves(phase=${phase})\`.`,
				],
			};
		}

		// Rule 3 of greenfield-smart: cross-batch deps must be in git history.
		// Mirror the lane planner's status-bearing predicate so we fail
		// closed when git is unhealthy (a permissive fallback here would
		// let the wave planner fan out cross-batch deps without evidence,
		// bypassing Phase 10's safety on the very next call).
		let isUpstreamCommitted: ((taskId: string) => boolean) | undefined;
		if (_internals.isGitRepo(directory)) {
			const evidence = _internals.buildIsUpstreamCommittedWithStatus(directory);
			if (evidence.gitFailed) {
				criticalWarn(
					`[epic_plan_waves] wave-planning blocked for directory=${directory} phase=${phase}: git log scan failed. Any prior promote verdict in .swarm/evidence/epic-promotions.jsonl for this phase is not backed by actual parallel execution.`,
				);
				return {
					success: false,
					reason: 'git-failed',
					errors: [
						'epic_plan_waves: cannot verify cross-batch upstream-commit evidence — `git log` read failed. ' +
							'Likely transient: retry once git is healthy (e.g. another process released its lock). ' +
							'If git is persistently broken (corrupt repo, permission issue, missing `.git`), repair the repository. ' +
							'Until repaired, complete the phase serially — one task at a time, waiting for each commit to land before dispatching the next — so file-scope conflict detection is not required.',
					],
				};
			}
			isUpstreamCommitted = evidence.predicate;
		}

		// Honor user-set `turbo.lean.*` config knobs (max_parallel_coders,
		// require_declared_scope, conflict_policy, degrade_on_risk) by
		// loading the project's plugin config and merging over the
		// defaults. Falls back to defaults on any load failure so a
		// malformed user config doesn't break planning.
		let leanConfig: LeanTurboConfig = { ...DEFAULT_LEAN_TURBO_CONFIG };
		try {
			const loaded = await _internals.loadPluginConfigWithMeta(directory);
			const userLean = loaded?.config?.turbo?.lean;
			if (userLean) {
				leanConfig = { ...leanConfig, ...userLean };
			}
		} catch {
			// Use defaults; warning would be noise for projects without a
			// custom turbo config (the common case).
		}

		const wavePlan = planEpicWaves(
			directory,
			phase,
			plan,
			leanConfig,
			scopes,
			isUpstreamCommitted,
		);

		return {
			success: true,
			plan: wavePlan,
			waves: wavePlan.waves,
			serializedTasks: wavePlan.serializedTasks,
			degradedTasks: wavePlan.degradedTasks,
		};
	} catch (error) {
		const errMsg = error instanceof Error ? error.message : String(error);
		criticalWarn(
			`[epic_plan_waves] wave-planning failed for directory=${directory} phase=${phase}: ${errMsg}. Any prior promote verdict in .swarm/evidence/epic-promotions.jsonl for this phase is not backed by actual parallel execution.`,
		);
		return {
			success: false,
			reason: 'planner-error',
			errors: [errMsg],
		};
	}
}

/**
 * DI seam — same pattern as `lean-turbo-plan-lanes.ts` (AGENTS.md invariant 7).
 * Tests substitute deterministic doubles via `_internals.*` rather than `mock.module`.
 */
export const _internals = {
	readPlanJson,
	readTaskScopes: readTaskScopes_import,
	isGitRepo: (cwd: string): boolean => isGitRepo_import(cwd),
	// Only the status-bearing variant is wired in here. The legacy
	// permissive `buildIsUpstreamCommitted` is intentionally NOT exposed
	// via `_internals` so a future refactor can't accidentally substitute
	// it and re-introduce the fail-open behavior on git-log read failure.
	buildIsUpstreamCommittedWithStatus: buildIsUpstreamCommittedWithStatus_import,
	loadPluginConfigWithMeta: loadPluginConfigWithMeta_import,
};

/** Tool definition for `epic_plan_waves`. */
export const epic_plan_waves: ToolDefinition = createSwarmTool({
	description:
		"Partition a phase's pending tasks into ordered concurrent waves for Epic Mode dispatch. " +
		'A wave is a set of tasks with mutually disjoint declared scopes and all dependencies satisfied by prior waves. ' +
		'Returns `{ waves: [{ waveId, taskIds, files }, ...], serializedTasks, degradedTasks }`. ' +
		'For each wave in order, the architect dispatches one `Task(subagent_type="coder", ...)` per `taskId` — all in one assistant message — so the wave runs concurrently and each coder appears as a visible subagent. ' +
		'Wait for the wave to finish before dispatching the next. ' +
		'Pair with `epic_decide_phase` (called first; this tool is only relevant on a `promote` verdict). ' +
		'Preflight reject reasons: `no-plan`, `no-phase`, `phase-empty`, `phase-already-complete`, `scopes-missing` (call `declare_scope` for `missingScopes`), `git-failed` (transient — retry), `planner-error`.',
	args: {
		directory: z
			.string()
			.describe('Project root directory where `.swarm/plan.json` is located'),
		phase: z.number().int().positive().describe('Phase number to plan'),
		scopes: z
			.record(z.string(), z.array(z.string()))
			.optional()
			.describe(
				'Optional pre-loaded scopes map (taskId -> file paths). When omitted, scopes are read from `.swarm/scopes/scope-<taskId>.json` and `files_touched` in plan.json.',
			),
	},
	execute: async (args: unknown, _directory: string) => {
		const parsed = args as EpicPlanWavesArgs;
		const result = await executeEpicPlanWaves({
			...parsed,
			directory: _directory,
		});
		return JSON.stringify(result, null, 2);
	},
});

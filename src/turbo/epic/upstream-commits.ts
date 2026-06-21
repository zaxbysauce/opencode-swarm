/**
 * Upstream-commit predicate — Rule 3 of the greenfield-smart redesign.
 *
 * Given a project directory, returns a fast `(taskId) => boolean` predicate
 * that answers "has this task been committed?" The lane planner consults
 * this when evaluating cross-batch dependencies: a downstream task is
 * parallel-eligible only when every `depends:` upstream that lives in a
 * prior phase batch is already in git HEAD's history.
 *
 * Why this matters: without it, the planner treats any dep not in the
 * current task batch as implicitly satisfied (the existing behavior in
 * `src/turbo/lean/planner.ts:381-390`). That's fine when the prior batch
 * actually finished cleanly, but it doesn't distinguish "marked complete"
 * from "marked complete *and* the work is in version control". Rule 3
 * insists on the stronger condition so parallel coders can't inherit an
 * uncommitted upstream worktree.
 *
 * Source format: `commitTaskCompletion` writes commit subjects shaped like
 * `swarm(task <id>): <description>` (see `./task-commit.ts:formatTaskCommitMessage`).
 * This module parses the `<id>` from those subjects.
 *
 * Boundedness (AGENTS.md #3): subprocess timeout matches the rest of git
 * helpers (30s); `--max-count` caps the log scan; failures degrade to a
 * permissive predicate so the planner does not regress when git is broken.
 */

import { _internals as gitBranchInternals } from '../../git/branch.js';
import { criticalWarn } from '../../utils/logger.js';

/** Cap on the git-log scan window. */
const MAX_LOG_COMMITS = 10_000;

/** Pattern matching commit subjects produced by `formatTaskCommitMessage`. */
const SWARM_TASK_SUBJECT_RE = /^swarm\(task ([^)]+)\):/;

export interface BuildUpstreamCommitsOptions {
	/** Override the log scan window. Default: 10,000. */
	maxCommits?: number;
}

/**
 * Eagerly read git log once and return a fast `(taskId) => boolean`
 * predicate the lane planner uses for cross-batch upstream-commit checks.
 *
 * Single evidence source: a `swarm(task <id>):` commit subject in git
 * log, produced by Rule 2's `commitTaskCompletion`.
 *
 * History note: an earlier revision OR'd in a plan-ledger fallback (any
 * task with `status: completed` in `.swarm/plan.json` was treated as
 * committed) to guard against a hypothetical deadlock where `commit-
 * TaskCompletion` failed silently. Phase 5 of the 2026-06-03 corrective
 * plan made Rule 2 reliable on every completion path by centralizing
 * the invocation in `plan/manager.updateTaskStatus` — so the guard's
 * premise no longer holds, and keeping the fallback would defeat Rule 3's
 * own purpose (distinguishing "marked complete" from "in git history").
 * Removed in Phase 6.
 *
 * Failure mode:
 *  - Git log read fails (no git, spawn error, timeout) → predicate
 *    returns `true` for everything (permissive). The lane planner falls
 *    back to its legacy "cross-batch dep implicitly satisfied" behavior,
 *    which is the pre-Rule-3 semantics. Better legacy than wedged in a
 *    broken environment.
 */
export function buildIsUpstreamCommitted(
	directory: string,
	options?: BuildUpstreamCommitsOptions,
): (taskId: string) => boolean {
	return buildIsUpstreamCommittedWithStatus(directory, options).predicate;
}

/**
 * Phase 12 (B10) — same predicate construction as `buildIsUpstreamCommitted`
 * but exposes whether the git-log read failed. Callers that need to FAIL
 * CLOSED on a broken git environment (e.g. the Phase 10 activation gate,
 * where the predicate is the only safety signal) use `gitFailed` to pick
 * a stricter policy; callers that can tolerate "I don't know" fall-open
 * (e.g. Rule 3 at the lane planner, where wave ordering is the backstop)
 * continue using `buildIsUpstreamCommitted` directly.
 *
 * The two-tier API exists because the original permissive degradation
 * was correct for Rule 3 (no regression vs pre-Rule-3 semantics) but
 * inverted the safety polarity for Phase 10 (which has no Path-B
 * fallback after the commit-count floor was retired).
 */
export interface UpstreamCommittedEvidence {
	predicate: (taskId: string) => boolean;
	/** True when the git-log read threw — predicate is the permissive fallback. */
	gitFailed: boolean;
}

export function buildIsUpstreamCommittedWithStatus(
	directory: string,
	options?: BuildUpstreamCommitsOptions,
): UpstreamCommittedEvidence {
	const max = options?.maxCommits ?? MAX_LOG_COMMITS;

	let subjects: string;
	try {
		subjects = _internals.readGitLogSubjects(directory, max);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		// Phase 15 (B34): elevated to criticalWarn. This is the signal
		// Phase 12 B10 / Phase 13 B22 promised the operator: when git
		// log fails, the activation gate's predecessor-evidence path
		// degrades. Silently swallowing this defeats the visibility
		// the redesign required.
		criticalWarn(
			`[epic:upstream-commits] git log scan failed (degrading to permissive predicate, the activation gate may flip fail-closed): ${msg}`,
		);
		return { predicate: () => true, gitFailed: true };
	}

	const committed = new Set<string>();
	for (const line of subjects.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const match = SWARM_TASK_SUBJECT_RE.exec(trimmed);
		if (match) {
			committed.add(match[1]);
		}
	}

	return {
		predicate: (taskId: string) => committed.has(taskId),
		gitFailed: false,
	};
}

/**
 * DI seam — production code routes the git-log read through `_internals`
 * so tests can substitute deterministic doubles without `mock.module`
 * (AGENTS.md invariant 7).
 */
export const _internals = {
	readGitLogSubjects: (cwd: string, max: number): string => {
		// `--pretty=%s` returns just the subject line per commit; with
		// `--max-count=<n>` the scan is bounded. `--no-merges` is intentional:
		// task-completion commits are direct (no merge subjects to skip), and
		// excluding merge subjects keeps the parser simpler.
		return gitBranchInternals.gitExec(
			['log', '--no-merges', `--max-count=${max}`, '--pretty=%s'],
			cwd,
		);
	},
};

/**
 * Worktree merge-back status registry (leaf module — no app imports).
 *
 * Bridges two subsystems that otherwise cannot see each other:
 *
 *   - WORKTREE ISOLATION (`worktree-isolation.ts`) knows, at merge-back
 *     time, whether a Task-dispatched coder's isolated worktree merged
 *     cleanly back into the main tree.
 *   - EPIC MODE Rule 2 (`plan/manager.updateTaskStatus`) auto-commits a
 *     `swarm(task <id>):` marker on completion. That marker is the
 *     evidence Rule 3 scans to decide a downstream task's upstream is
 *     satisfied.
 *
 * Without this bridge, a coder whose worktree merge-back FAILED (conflict)
 * leaves its changes stranded in the preserved worktree, yet Rule 2 would
 * still fire an `--allow-empty` marker and Rule 3 would treat the task as
 * done — silently advancing the plan past work that never landed.
 *
 * This module is deliberately a LEAF: it imports nothing from the app so
 * that both `worktree-isolation.ts` (writer) and `plan/manager.ts` (reader)
 * can depend on it without creating an import cycle. State is process-local
 * (an in-memory Map), matching the existing module-level worktree dispatch
 * tracking in `worktree-isolation.ts` — the architect session and the
 * coder's `tool.execute.after` hook share one plugin process, and the
 * merge-back is `await`ed in that hook before the architect's next turn, so
 * a failure is always recorded before the Rule 2 read.
 */

/** Why a task's worktree work did not fully reach the main tree. */
export type WorktreeMergeOutcome = 'partial' | 'failed';

export interface WorktreeMergeFailure {
	outcome: WorktreeMergeOutcome;
	/** Pipeline stage that failed (e.g. 'merge', 'auto-commit'). */
	stage: string;
	/** Human-readable detail surfaced in the Rule 2 skip warning. */
	message: string;
}

const failuresByTask = new Map<string, WorktreeMergeFailure>();

/**
 * Record that task `taskId`'s worktree merge-back did not fully land.
 * No-op when `taskId` is undefined (non-plan dispatches carry no plan id
 * and are never subject to Epic Rule 2).
 */
export function recordWorktreeMergeFailure(
	taskId: string | undefined,
	failure: WorktreeMergeFailure,
): void {
	if (!taskId) return;
	failuresByTask.set(taskId, failure);
}

/**
 * Clear any recorded failure for `taskId`. Called when a (re-)dispatch of
 * the same task merges cleanly, so a later success supersedes an earlier
 * failure and Rule 2 is allowed to commit the marker again.
 */
export function clearWorktreeMergeStatus(taskId: string | undefined): void {
	if (!taskId) return;
	failuresByTask.delete(taskId);
}

/**
 * Query whether task `taskId`'s most recent worktree merge-back failed.
 * Returns the failure detail, or undefined when the task merged cleanly,
 * was never worktree-isolated, or has no recorded status.
 */
export function getWorktreeMergeFailure(
	taskId: string,
): WorktreeMergeFailure | undefined {
	return failuresByTask.get(taskId);
}

/** @internal test seam */
export const _internals = { failuresByTask };

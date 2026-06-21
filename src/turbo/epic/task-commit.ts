/**
 * Auto-commit on task completion — Rule 2 of the greenfield-smart redesign.
 *
 * When Epic Mode is active for the session and the project is a git repo,
 * `update_task_status` calls `commitTaskCompletion` after a task transitions
 * to `completed` and the durable plan write has succeeded. The resulting
 * commit serves two purposes:
 *
 *   1. **Greenfield gate progress.** Each completed-and-committed task
 *      advances `commitsObserved` so the activation gate
 *      (`src/turbo/epic/activation.ts`) eventually opens. Without this,
 *      an Epic-only workflow never produces commits and the gate
 *      permanently blocks parallel promotion — the exact failure mode
 *      Rule 4 of the redesign identified.
 *
 *   2. **Parallel-eligibility evidence (Rule 3).** Downstream tasks can
 *      require their `depends:` upstream to be *committed* (not just
 *      marked complete) before they fan out. The commit message format
 *      `swarm(task <id>): ...` is the searchable marker the lane
 *      planner consumes in `upstream-commits.ts`.
 *
 * Failure handling: every step degrades non-fatally. A failed commit must
 * never block the durable task-status update — the plan ledger is the
 * authoritative source (AGENTS.md #5), git is a downstream artifact.
 *
 * Subprocess discipline: delegates to `src/git/branch.ts`, which already
 * enforces AGENTS.md #3 (explicit cwd, bounded timeout, array-form spawn,
 * non-interactive). This module adds no new subprocess primitives.
 */

import {
	_internals as gitBranchInternals,
	isGitRepo as isGitRepo_import,
} from '../../git/branch.js';
import { criticalWarn } from '../../utils/logger.js';

/** Result of a single task-commit attempt. */
export interface CommitTaskCompletionResult {
	/**
	 * `true` when a `swarm(task <id>):` marker for this taskId is present
	 * in git history at function exit — whether this call produced it
	 * (`reason: 'success'`) or whether an earlier call did
	 * (`reason: 'idempotent-skip'`).
	 *
	 * Phase 17 (B.M9): pre-Phase-17 the `'already-committed'` reason
	 * returned `committed: false`, self-contradicting ("not committed
	 * because already committed"). Architect LLMs interpreted the
	 * `false` as a failure and retried, producing log noise. The fixed
	 * semantic: `committed` answers "is the marker in git for this
	 * taskId now?" — yes for both the fresh-write and the idempotent
	 * skip paths.
	 */
	committed: boolean;
	reason: 'no-git' | 'commit-failed' | 'success' | 'idempotent-skip';
	sha?: string;
	error?: string;
}

/**
 * Build the commit message body. The `swarm(task <id>):` prefix is the
 * searchable marker downstream Rule 3 lookups consume; treat it as a
 * stable contract. The description is truncated to keep the subject line
 * within git's conventional 72-char window.
 */
/**
 * Phase 17 (C.H2): defensive taskId scrubber for commit-subject and
 * grep-pattern use. The full validator lives in `src/validation/task-id.ts`
 * and is enforced at tool boundaries — but plan-ledger dep IDs flow into
 * this code path from LLM-authored `plan.json` and are NOT re-validated.
 * A typo'd `)` or `\n` in a taskId would corrupt the Phase 6 parser
 * regex `/^swarm\(task ([^)]+)\):/` and silently mark unrelated tasks
 * as "committed", flipping Rule 3 fail-closed to fail-open.
 *
 * This scrubber keeps only characters safe for both git commit subjects
 * (no newlines, no parentheses) and ERE regex literals (no `*+?^${}|[]\`).
 * Disallowed characters become `_`. Output is then escaped further for
 * regex contexts by the existing escape in `hasExistingTaskCommit`.
 */
function scrubTaskIdForGitSubject(taskId: string): string {
	return taskId.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function formatTaskCommitMessage(
	taskId: string,
	description?: string,
): string {
	const safeId = scrubTaskIdForGitSubject(taskId);
	const summary = (description ?? 'completed').replace(/\s+/g, ' ').trim();
	const truncated =
		summary.length > 60 ? `${summary.slice(0, 57)}...` : summary;
	return `swarm(task ${safeId}): ${truncated || 'completed'}`;
}

/**
 * Stage this task's declared scope and create a marker commit.
 *
 * - **No-op when not a git repo**: returns `{ committed: false, reason: 'no-git' }`.
 *   Rule 1 in the redesign — non-git projects skip the entire commit flow.
 * - **Scope-bounded staging**: when `scopePaths` is non-empty, only those
 *   paths are staged (plus the AGENTS.md #4 `.swarm` exclude). The previous
 *   `git add -A` approach swept in sibling lanes' work-in-progress under
 *   parallel dispatch — the adversarial review on 2026-06-03 found that
 *   each `swarm(task A):` commit was actually containing fragments of lanes
 *   B/C/D, corrupting Rule 3's evidence.
 * - **No-scope marker-only path**: when `scopePaths` is undefined or empty,
 *   skip staging entirely and write an `--allow-empty` marker. This is the
 *   correct behavior for: pure verification tasks, tasks whose only output
 *   is under `.swarm/` (excluded by policy), and any future case where a
 *   task's scope is genuinely empty. The marker advances `commitsObserved`
 *   so Rule 4's greenfield-gate-opening still works, and it preserves
 *   Rule 3 evidence — without contaminating other lanes' working trees.
 * - **Non-fatal on git failures**: logs and returns `commit-failed`. The
 *   plan ledger is authoritative per AGENTS.md #5; git is downstream.
 */
/**
 * Phase 11 (B5): bounded retry-with-backoff schedule for `index.lock`
 * contention. Under concurrent dispatch (4+ sub-agents finishing within
 * seconds), git serialises through `.git/index.lock` and the loser of
 * the race gets `fatal: Unable to create '.git/index.lock': File
 * exists.` Without retry, that loser silently degrades to `commit-failed`
 * and the marker is lost — cascading into a Phase 10 predecessor-
 * evidence failure on the next phase. The schedule below covers up to
 * ~1.5 s of accumulated wait; git typically releases the lock in
 * <100 ms, so the first retry usually wins. Three attempts after the
 * initial try gives 4 chances total — enough to survive a 4-lane burst
 * with high probability.
 *
 * Detection uses the canonical git error substring; we deliberately do
 * NOT match on `fatal:` alone (too broad) or on exit-code (already
 * surfaced as non-zero).
 */
const INDEX_LOCK_BACKOFF_MS: readonly number[] = [100, 200, 400, 800];
const INDEX_LOCK_ERROR_RE = /index\.lock|unable to create.*\.lock/i;

function isLockContentionError(err: unknown): boolean {
	const msg = err instanceof Error ? err.message : String(err);
	return INDEX_LOCK_ERROR_RE.test(msg);
}

export async function commitTaskCompletion(
	directory: string,
	taskId: string,
	description?: string,
	scopePaths?: string[],
): Promise<CommitTaskCompletionResult> {
	// Probe for git repo first. `isGitRepo` throws nothing — it returns
	// `false` on any failure path (`git rev-parse --git-dir` non-zero exit
	// or spawn error).
	if (!_internals.isGitRepo(directory)) {
		return { committed: false, reason: 'no-git' };
	}

	// Idempotency guard (Phase 8): if a `swarm(task <id>):` marker for
	// this taskId already exists in git history, do not produce a second
	// one. `updateTaskStatus(..., 'completed')` can legitimately fire
	// multiple times — council re-runs, status corrections, retry-after-
	// error, recovery flows. Without this guard each repeat call mints
	// another empty marker, polluting history and over-counting
	// `commitsObserved` for Rule 4's greenfield gate. A failed `git log`
	// here means "we can't tell" — fall through and commit (correctness
	// over polish; better a possible duplicate than a silent skip when
	// detection is broken).
	try {
		if (_internals.hasExistingTaskCommit(directory, taskId)) {
			// Phase 17 (B.M9): `committed: true` because the marker IS
			// in git history (we just didn't write it this call). This
			// fixes the architect-LLM-retry loop where `committed: false`
			// looked like a failure.
			return { committed: true, reason: 'idempotent-skip' };
		}
	} catch {
		/* duplicate-detection is best-effort; proceed with commit */
	}

	// Phase 17 (C.H6): reject scope entries that look like git pathspec
	// magic (`:(glob)**`, `:!**`, etc.). An LLM-authored scope of
	// `:(glob)**` would be passed to `git add --` and stage the entire
	// tree, broadening Rule 2's commit beyond declared intent and
	// corrupting Rule 3's evidence (the marker would contain files the
	// next task expected to own). The `--` separator does NOT block
	// pathspec magic — only argv-option parsing. Strip the leading `:`
	// entries entirely; surface them via the criticalWarn for operator
	// visibility.
	const rawPaths = (scopePaths ?? []).filter(
		(p) => typeof p === 'string' && p.trim().length > 0,
	);
	const droppedMagic: string[] = [];
	const paths = rawPaths.filter((p) => {
		if (p.startsWith(':')) {
			droppedMagic.push(p);
			return false;
		}
		return true;
	});
	if (droppedMagic.length > 0) {
		criticalWarn(
			`[epic:task-commit] dropped ${droppedMagic.length} scope path(s) starting with ':' (git pathspec magic, not allowed): ${droppedMagic.slice(0, 5).join(', ')}${droppedMagic.length > 5 ? `, +${droppedMagic.length - 5} more` : ''}. Architect should declare literal file paths only.`,
		);
	}
	const message = formatTaskCommitMessage(taskId, description);

	// Phase 11 (B5): bounded retry loop over the stage+commit pair. If
	// either step fails with a lock-contention error AND we have retries
	// left, sleep and re-attempt. Any other failure (or the final attempt)
	// degrades to the non-fatal commit-failed return path.
	let lastError: unknown = null;
	for (let attempt = 0; attempt <= INDEX_LOCK_BACKOFF_MS.length; attempt++) {
		try {
			if (paths.length > 0) {
				_internals.stageScopedPaths(directory, paths);
			}
			// When `paths` is empty we skip staging entirely. `--allow-empty`
			// still produces the marker the planner's Rule 3 check reads.
			_internals.commitAllowEmpty(directory, message);
			const sha = _internals.gitHeadSha(directory);
			return { committed: true, reason: 'success', sha };
		} catch (err) {
			lastError = err;
			if (
				attempt < INDEX_LOCK_BACKOFF_MS.length &&
				isLockContentionError(err)
			) {
				await _internals.sleep(INDEX_LOCK_BACKOFF_MS[attempt]);
				continue;
			}
			break;
		}
	}

	const msg =
		lastError instanceof Error ? lastError.message : String(lastError);
	// Phase 15 (B34): elevated to criticalWarn so the operator sees Rule 2
	// commit failures during a live benchmark. Pre-Phase-15 this was a
	// debug-gated warn — silent unless OPENCODE_SWARM_DEBUG=1 — and the
	// operator had no way to know greenfield-gate progress was being lost.
	criticalWarn(
		`[epic:task-commit] commit for task ${taskId} failed (non-fatal): ${msg}`,
	);
	return { committed: false, reason: 'commit-failed', error: msg };
}

/**
 * DI seam — production code calls through `_internals.<name>` so tests
 * substitute deterministic doubles without `mock.module`'s cross-file
 * leak (AGENTS.md invariant 7). Restore in `afterEach`.
 */
export const _internals = {
	isGitRepo: (cwd: string) => isGitRepo_import(cwd),
	/**
	 * Stage exactly the declared scope paths for this task. The trailing
	 * `:(exclude).swarm` + `:(exclude).swarm/**` pathspecs are belt-and-
	 * suspenders against AGENTS.md #4 even when the architect's scope
	 * declaration accidentally points into `.swarm/`. We do NOT rely on
	 * the user's `.gitignore`: a single misconfigured project would
	 * otherwise commit prompts, ledgers, telemetry, and evidence into
	 * git history every time Rule 2 fires.
	 *
	 * Missing pathspecs (declared scope points to a non-existent file) are
	 * left to surface as a `commit-failed` reason — better than silent
	 * staging skip, since it tells the user their scope declaration is
	 * stale. Rule 2's non-fatal contract means the plan-write still wins.
	 */
	stageScopedPaths: (cwd: string, paths: string[]) => {
		// Phase 8: exclude `.swarm/` at ANY depth, not just the repo root.
		// The original `:(exclude).swarm` + `:(exclude).swarm/**` only
		// matched the top-level — a scope path like `packages/foo/` in a
		// monorepo would still drag in `packages/foo/.swarm/` content.
		//
		// Verified on git 2.51: this single recursive pattern correctly
		// excludes `.swarm/` contents at root AND at any depth, regardless
		// of whether the inclusion pathspec is `.`, `src`, or
		// `packages/foo`. Combining it with the older non-glob excludes
		// (`:(exclude).swarm` etc.) actually BREAKS inclusion for subtree
		// paths — `git add -- packages/foo :(exclude).swarm` stages
		// nothing, even when no `.swarm` exists. So we deliberately use
		// only the single recursive form.
		//
		// Phase 17 (E.3): chunk paths into batches so a monorepo-scale
		// scope (1000s of files) doesn't exceed `ARG_MAX` (~256 KB on
		// macOS). At ~100 bytes/path, ~2500 paths exhausts the limit;
		// `spawnSync` then throws E2BIG and Rule 2 silently degrades to
		// `commit-failed`. Empirically 200 paths/call leaves ample
		// headroom. The `.swarm` exclude is added to every chunk so it
		// applies uniformly; the index accumulates across chunks before
		// a single commit is issued by the caller.
		const CHUNK = 200;
		for (let i = 0; i < paths.length; i += CHUNK) {
			const chunk = paths.slice(i, i + CHUNK);
			gitBranchInternals.gitExec(
				['add', '--', ...chunk, ':(exclude,glob)**/.swarm/**'],
				cwd,
			);
		}
	},
	/**
	 * `--allow-empty` variant of commit. We don't expose this in
	 * `src/git/branch.ts` because it's specific to the task-completion
	 * marker semantics — a normal commit should fail on empty trees to
	 * surface bugs. Here we explicitly want the marker.
	 *
	 * Phase 8: `--no-verify` skips `pre-commit`, `commit-msg`, and
	 * `pre-commit-msg` hooks. Rule 2's commits are protocol markers, not
	 * user-authored content — running Biome/typecheck/lint on every task
	 * completion would add minutes of wall-clock per task and, worse,
	 * could block the marker entirely on a repo with a strict pre-commit
	 * gate. Plan ledger remains authoritative; the commit is the audit
	 * trail, not the gate.
	 */
	commitAllowEmpty: (cwd: string, message: string) => {
		gitBranchInternals.gitExec(
			['commit', '--allow-empty', '--no-verify', '-m', message],
			cwd,
		);
	},
	gitHeadSha: (cwd: string) => {
		return gitBranchInternals.gitExec(['rev-parse', 'HEAD'], cwd).trim();
	},
	/**
	 * Returns true when a `swarm(task <id>):` marker subject for this
	 * taskId already exists anywhere in git history. Used by the
	 * idempotency guard above so repeat completion calls don't mint
	 * duplicate markers.
	 *
	 * Implementation: `git log --grep=<pattern> -F` is NOT used (it
	 * fixed-string-matches the whole subject); instead we anchor the
	 * regex with `--extended-regexp` and bound the scan with `-n 1` so a
	 * single match suffices. Returns false on any git failure — the
	 * caller treats that as "unknown" and proceeds.
	 */
	/**
	 * Phase 11 (B5): async sleep used by `commitTaskCompletion`'s
	 * retry loop. Routed through `_internals` so tests can substitute
	 * a no-op stub and not actually wait during fast-path unit tests.
	 */
	sleep: (ms: number): Promise<void> =>
		new Promise((resolve) => setTimeout(resolve, ms)),
	hasExistingTaskCommit: (cwd: string, taskId: string): boolean => {
		// Phase 17 (C.H2): scrub before escape so an injected `)` or
		// `\n` in a typo'd dep ID can't corrupt the grep pattern.
		const safeId = scrubTaskIdForGitSubject(taskId);
		// Escape regex metacharacters in taskId so `1.1` matches `1.1`
		// literally (not "1<any>1"). Task IDs are typically dotted
		// numerics so this matters in practice.
		const escaped = safeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const output = gitBranchInternals.gitExec(
			[
				'log',
				'--extended-regexp',
				`--grep=^swarm\\(task ${escaped}\\):`,
				'--pretty=format:%H',
				'-n',
				'1',
			],
			cwd,
		);
		return output.trim().length > 0;
	},
};

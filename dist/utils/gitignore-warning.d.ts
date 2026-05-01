/**
 * Module-level flag so the warning fires at most once per process.
 * Exported for test reset purposes only — do not use in production code.
 */
export declare let _gitignoreWarningEmitted: boolean;
/**
 * Reset the deduplication flag. Exposed for test isolation only.
 */
export declare function resetGitignoreWarningState(): void;
/**
 * Module-level flag for ensureSwarmGitExcluded deduplication.
 * Exported for test reset purposes only.
 */
export declare let _swarmGitExcludedChecked: boolean;
/**
 * Reset the ensureSwarmGitExcluded deduplication flag. Exposed for test isolation only.
 */
export declare function resetSwarmGitExcludedState(): void;
/**
 * Checks whether `.swarm/` is covered by `.gitignore` or `.git/info/exclude`
 * in the git repo rooted at or above `directory`. If not covered, emits a
 * single `console.warn` (unless `quiet` is true). Fires at most once per process.
 *
 * Never throws — any file-system error silently skips the check.
 *
 * @deprecated Use `ensureSwarmGitExcluded` instead. This function only recognises
 * `.git` as a directory and does NOT handle Git worktrees or submodules.
 */
export declare function warnIfSwarmNotGitignored(directory: string, quiet?: boolean): void;
export interface EnsureSwarmGitExcludedOptions {
    quiet?: boolean;
}
/**
 * Automatically protect `.swarm/` from Git pollution before any `.swarm/` write.
 *
 * Uses git CLI (not filesystem walks) so it correctly handles Git worktrees
 * and submodules where `.git` is a file rather than a directory.
 *
 * Steps:
 * 1. Resolve git root via `git rev-parse --show-toplevel`
 * 2. Resolve local exclude path via `git rev-parse --git-path info/exclude`
 * 3. Check if `.swarm/` is already ignored via `git check-ignore -q`
 * 4. If not ignored: append `.swarm/` to the local exclude file (idempotent)
 * 5. Detect tracked `.swarm/` files via `git ls-files -- .swarm`
 * 6. If tracked: emit an unsuppressed remediation warning
 *
 * Never throws. Fires at most once per process.
 *
 * quiet option: only suppresses cosmetic logs. The exclude write and tracked-file
 * warning are never suppressed regardless of quiet mode.
 */
export declare function ensureSwarmGitExcluded(directory: string, options?: EnsureSwarmGitExcludedOptions): Promise<void>;

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
 * Checks whether `.swarm/` is covered by `.gitignore` or `.git/info/exclude`
 * in the git repo rooted at or above `directory`. If not covered, emits a
 * single `console.warn` (unless `quiet` is true). Fires at most once per process.
 *
 * Never throws — any file-system error silently skips the check.
 */
export declare function warnIfSwarmNotGitignored(directory: string, quiet?: boolean): void;

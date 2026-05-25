/**
 * Result of resolving scope paths for sandbox enforcement.
 */
export interface ResolvedScope {
    /** Absolute paths that the sandbox will allow writes to */
    paths: string[];
    /** Any warnings about paths that were modified or skipped */
    warnings: string[];
    /** Paths that were rejected (e.g., non-existent, traversal attempts) */
    rejected: {
        path: string;
        reason: string;
    }[];
}
/**
 * Resolve scope paths for sandbox enforcement.
 *
 * Converts relative scope paths to absolute, validates against traversal attacks,
 * checks existence, deduplicates, and normalizes path separators.
 *
 * @param rawPaths - Paths from the task scope declaration (may be relative or absolute)
 * @param projectRoot - The project root directory (for resolving relative paths)
 * @returns ResolvedScope with absolute paths, warnings, and rejections
 */
export declare function resolveScopePaths(rawPaths: string[], projectRoot: string): ResolvedScope;
/**
 * DI seam for testability. Contains all test-mocked exports.
 * Internal calls should use _internals.fn() instead of fn() directly.
 */
export declare const _internals: {
    resolveScopePaths: typeof resolveScopePaths;
};

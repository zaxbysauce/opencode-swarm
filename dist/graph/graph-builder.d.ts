import { type FileNode, type RepoGraph } from './types';
/**
 * Build a full repository graph by walking the workspace, parsing source files
 * for imports and exported symbols, and assembling them into a `RepoGraph`.
 *
 * Performance:
 *   - File scanning skips well-known build/dep directories (node_modules, dist, .git, etc.)
 *   - Per-file parsing runs with a concurrency limit to avoid overwhelming I/O.
 *   - Files larger than `MAX_FILE_SIZE_BYTES` are skipped (would also fail downstream extractors).
 *
 * Targets ~5s for a 50k LOC repo (~500 files) on commodity hardware.
 */
export interface BuildOptions {
    /** Optional cap on file count to bound runtime on huge repos. */
    maxFiles?: number;
    /** Concurrency for per-file parsing. Defaults to 16. */
    concurrency?: number;
    /** Additional directory names to skip (merged with defaults). */
    skipDirs?: string[];
}
/**
 * Walk the workspace and return absolute paths of all supported source files.
 * Cross-platform: emits absolute paths using the host's path separator.
 */
export declare function findSourceFiles(workspaceRoot: string, skipDirs?: Set<string>): string[];
/**
 * Build the repo graph from scratch.
 */
export declare function buildRepoGraph(workspaceRoot: string, options?: BuildOptions): Promise<RepoGraph>;
/**
 * Process a single file into a FileNode. Returns null if the file cannot be processed.
 */
export declare function processFile(absoluteFilePath: string, workspaceRoot: string): Promise<FileNode | null>;

import { type RepoGraph } from './types';
export declare function getGraphPath(workspaceRoot: string): string;
export declare function loadGraph(workspaceRoot: string): RepoGraph | null;
export declare function saveGraph(workspaceRoot: string, graph: RepoGraph): void;
/**
 * Build the graph from scratch and persist it.
 */
export declare function buildAndSaveGraph(workspaceRoot: string): Promise<RepoGraph>;
/**
 * Apply incremental updates for a list of changed (or potentially-changed) files.
 *
 * For each file:
 *   - If the file no longer exists, its node is removed.
 *   - Otherwise its node is re-parsed and replaced.
 *
 * Returns the updated graph (mutated in place AND returned for convenience).
 * Caller must call `saveGraph` to persist if desired.
 */
export declare function updateGraphIncremental(workspaceRoot: string, changedRelativePaths: string[], graph: RepoGraph): Promise<RepoGraph>;
/**
 * Determine if a stored graph is fresh enough to reuse.
 *
 * Default freshness window: 5 minutes. Files added/removed outside this
 * window are not detected without an explicit incremental update — callers
 * that care about up-to-the-second accuracy should rebuild.
 */
export declare function isGraphFresh(graph: RepoGraph | null, maxAgeMs?: number): boolean;

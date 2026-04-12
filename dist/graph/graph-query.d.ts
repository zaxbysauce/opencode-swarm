import type { BlastRadiusResult, FileNode, FileReference, LocalizationBlock, RepoGraph, SymbolReference } from './types';
/**
 * Query API for the repo graph.
 *
 * All functions accept normalized RELATIVE forward-slash paths and return the
 * same. Callers responsible for normalizing input paths (helper provided).
 */
export declare function normalizeGraphPath(p: string): string;
/**
 * Files that import the given file (direct dependents).
 */
export declare function getImporters(graph: RepoGraph, filePath: string): FileReference[];
/**
 * Files this file imports (direct dependencies, resolved targets only).
 */
export declare function getDependencies(graph: RepoGraph, filePath: string): FileReference[];
/**
 * Find all importers of a specific exported symbol from a file.
 */
export declare function getSymbolConsumers(graph: RepoGraph, filePath: string, symbolName: string): SymbolReference[];
/**
 * Compute the transitive blast radius of changing one or more files.
 *
 * Performs a BFS over the reverse-edge index up to `maxDepth` levels.
 */
export declare function getBlastRadius(graph: RepoGraph, filePaths: string[], maxDepth?: number): BlastRadiusResult;
/**
 * Top-N most-imported files (by in-degree) — useful for surfacing
 * architectural pillars.
 */
export declare function getKeyFiles(graph: RepoGraph, topN?: number): FileNode[];
/**
 * Build a compact localization block for a single file. This is the primary
 * payload injected into the coder agent's pre-edit context.
 */
export declare function getLocalizationContext(graph: RepoGraph, filePath: string, options?: {
    maxImporters?: number;
    maxDeps?: number;
    maxDepth?: number;
}): LocalizationBlock;
/** Reset the cached reverse index. Call this when a graph is mutated in place. */
export declare function resetQueryCache(): void;

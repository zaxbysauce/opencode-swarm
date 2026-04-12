/**
 * repo-map tool — Builds a structured map of the repository's source files,
 * including exports, imports, call edges, and importance scores.
 *
 * Supports three modes:
 * - build: scan the full tree and produce a RepoMap
 * - localize: get localization context for a specific file
 * - blast-radius: BFS from a set of files through the import graph
 */
import { createSwarmTool } from './create-tool';
export interface SymbolDef {
    name: string;
    kind: 'function' | 'class' | 'constant' | 'interface' | 'type' | 'method';
    exported: boolean;
    signature?: string;
    line: number;
}
export interface ImportDef {
    source: string;
    symbols: string[];
    line: number;
}
export interface CallEdge {
    from: string;
    to: string;
    line: number;
}
export interface RepoMapEntry {
    filePath: string;
    language: string;
    exports: SymbolDef[];
    imports: ImportDef[];
    callEdges: CallEdge[];
    importanceScore: number;
}
export interface RepoMap {
    version: 1;
    generatedAt: string;
    rootDir: string;
    files: Record<string, RepoMapEntry>;
    stats: {
        totalFiles: number;
        totalSymbols: number;
        totalEdges: number;
        languages: Record<string, number>;
    };
}
export interface LocalizationContext {
    targetFile: string;
    importedBy: string[];
    exportsUsedExternally: string[];
    blastRadius: string[];
    parallelPatterns: string[];
}
/**
 * Build a repo map for the given directory.
 * Walks the source tree, extracts symbols/imports/call-edges per file,
 * calculates importance scores, and optionally writes to .swarm/repo-map.json.
 */
export declare function buildRepoMap(directory: string): Promise<RepoMap>;
/**
 * Get localization context for a specific target file.
 */
export declare function getLocalizationContext(map: RepoMap, targetFile: string, directory: string): Promise<LocalizationContext>;
/**
 * BFS from given files through the import graph.
 * Returns deduplicated list of affected files.
 */
export declare function getBlastRadius(map: RepoMap, files: string[], maxDepth?: number): string[];
export declare const repo_map: ReturnType<typeof createSwarmTool>;

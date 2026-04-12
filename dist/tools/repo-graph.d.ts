/**
 * Repo graph storage module for persisting code dependency graphs.
 * Stores module-level in-memory cache and safe load/save to .swarm/repo-graph.json.
 *
 * Security: All file operations use validateSwarmPath to reject workspace-escaping paths.
 * Uses atomic temp+rename writes to prevent partial writes.
 */
/**
 * A node in the dependency graph representing a source file.
 */
export interface GraphNode {
    /** Resolved absolute path to the source file */
    filePath: string;
    /** Normalized module name (relative path from workspace root) */
    moduleName: string;
    /** Exported symbols from this file */
    exports: string[];
    /** Imported module specifiers */
    imports: string[];
    /** Language/extension of the file */
    language: string;
    /** Last modified timestamp */
    mtime: string;
}
/**
 * An edge in the dependency graph representing a dependency relationship.
 */
export interface GraphEdge {
    /** Source file path */
    source: string;
    /** Target file path (resolved) */
    target: string;
    /** Import specifier used */
    importSpecifier: string;
    /** Type of import */
    importType: 'default' | 'named' | 'namespace' | 'require' | 'sideeffect';
}
/**
 * The complete dependency graph for a workspace.
 */
export interface RepoGraph {
    /** Schema version for future compatibility */
    schema_version: string;
    /** Workspace root directory */
    workspaceRoot: string;
    /** Graph nodes keyed by resolved file path */
    nodes: Record<string, GraphNode>;
    /** Graph edges representing dependencies */
    edges: GraphEdge[];
    /** Graph metadata */
    metadata: {
        generatedAt: string;
        generator: string;
        nodeCount: number;
        edgeCount: number;
    };
}
/**
 * Validate that a workspace directory is safe to use.
 * Workspace must be a relative path (not absolute) to prevent workspace-escaping attacks.
 *
 * @param workspace - The workspace directory (relative path, e.g. "my-project" or "packages/lib")
 * @throws Error if the workspace is invalid or absolute
 */
export declare function validateWorkspace(workspace: string): void;
/**
 * Validate a graph node before adding to the graph.
 * @param node - The node to validate
 * @throws Error if the node is invalid
 */
export declare function validateGraphNode(node: GraphNode): void;
/**
 * Validate a graph edge before adding to the graph.
 * @param edge - The edge to validate
 * @throws Error if the edge is invalid
 */
export declare function validateGraphEdge(edge: GraphEdge): void;
/**
 * Resolve a module specifier relative to a source file within a workspace.
 *
 * CONTRACT for bare specifiers:
 * - Bare specifiers (e.g., 'lodash', 'zod', '@scope/pkg') return null because
 *   they require node_modules traversal to resolve, which is outside the scope
 *   of this module's responsibilities.
 * - Callers should treat null as "unresolvable at graph-build time" and may
 *   defer resolution to runtime or external tools.
 *
 * CONTRACT for workspace format:
 * - workspaceRoot is normally a relative path (e.g., "my-project") validated by
 *   validateWorkspace, but when called by buildWorkspaceGraph it may be an
 *   absolute scan root path. Both forms are accepted - the function handles
 *   path boundary checks consistently regardless of which form is provided.
 * - sourceFile must be an absolute path
 * - Returns absolute path if resolved, null otherwise
 *
 * @param workspaceRoot - The workspace root directory (relative or absolute path)
 * @param sourceFile - The file containing the import (absolute path)
 * @param specifier - The module specifier from the import statement
 * @returns Resolved absolute path or null if unresolvable
 */
export declare function resolveModuleSpecifier(workspaceRoot: string, sourceFile: string, specifier: string): string | null;
/**
 * Create an empty graph for a workspace.
 * @param workspaceRoot - The workspace root directory
 * @returns Empty RepoGraph structure
 */
export declare function createEmptyGraph(workspaceRoot: string): RepoGraph;
/**
 * Add or update a node in the graph.
 * @param graph - The graph to modify
 * @param node - The node to add/update
 */
export declare function upsertNode(graph: RepoGraph, node: GraphNode): void;
/**
 * Add an edge to the graph.
 * @param graph - The graph to modify
 * @param edge - The edge to add
 */
export declare function addEdge(graph: RepoGraph, edge: GraphEdge): void;
/**
 * Get the cached graph for a workspace.
 * @param workspace - The workspace directory (relative path, not absolute)
 * @returns The cached graph or undefined if not cached
 */
export declare function getCachedGraph(workspace: string): RepoGraph | undefined;
/**
 * Set the cached graph for a workspace.
 * @param workspace - The workspace directory (relative path, not absolute)
 * @param graph - The graph to cache
 * @param mtime - Optional file mtime to track for cache invalidation
 */
export declare function setCachedGraph(workspace: string, graph: RepoGraph, mtime?: number): void;
/**
 * Mark a workspace's cache as dirty (modified since last save).
 * @param workspace - The workspace directory (relative path, not absolute)
 */
export declare function markDirty(workspace: string): void;
/**
 * Check if a workspace's cache is dirty.
 * @param workspace - The workspace directory (relative path, not absolute)
 * @returns True if the cache has been modified since last save
 */
export declare function isDirty(workspace: string): boolean;
/**
 * Clear the cache for a workspace.
 * @param workspace - The workspace directory (relative path, not absolute)
 */
export declare function clearCache(workspace: string): void;
/**
 * Get the validated path for the repo-graph.json file.
 * Resolves symlinks via realpath before validation to prevent
 * workspace-escaping attacks via symlink manipulation.
 *
 * @param workspace - The workspace directory (relative path, not absolute)
 * @returns Absolute path to repo-graph.json
 * @throws Error if path validation fails or resolved path escapes workspace
 */
export declare function getGraphPath(workspace: string): string;
/**
 * Load the graph from .swarm/repo-graph.json.
 * Uses the in-memory cache if available, not dirty, and file mtime unchanged.
 *
 * @param workspace - The workspace directory (must be a relative path, not absolute)
 * @returns The loaded graph or null if not found
 * @throws Error if file exists but is invalid/corrupted
 */
export declare function loadGraph(workspace: string): Promise<RepoGraph | null>;
/**
 * Save the graph to .swarm/repo-graph.json atomically.
 * Uses temp file + rename pattern to prevent partial writes.
 *
 * @param workspace - The workspace directory (must be a relative path, not absolute)
 * @param graph - The graph to save
 * @param options.createAtomic - If true, fails if file already exists (for atomic create)
 * @throws Error if validation fails, write fails, or file exists when createAtomic=true
 */
export declare function saveGraph(workspace: string, graph: RepoGraph, options?: {
    createAtomic?: boolean;
}): Promise<void>;
/**
 * Load or create a graph for a workspace atomically.
 * Returns existing graph or creates a new empty one.
 * Handles concurrent creation by treating a create-fail as "graph exists".
 *
 * @param workspace - The workspace directory (must be a relative path, not absolute)
 * @returns The existing or new graph
 */
export declare function loadOrCreateGraph(workspace: string): Promise<RepoGraph>;
/**
 * Save the cached graph for a workspace if it's dirty.
 *
 * @param workspace - The workspace directory (must be a relative path, not absolute)
 * @throws Error if workspace is dirty but cache is missing (inconsistent state)
 * @throws Error if save fails
 */
export declare function saveIfDirty(workspace: string): Promise<void>;
/**
 * Build a complete dependency graph for a workspace by scanning all source files.
 *
 * The scan is deterministic: files are processed in sorted order, and edges
 * are added in a stable order based on source file and import specifier.
 *
 * @param workspaceRoot - Workspace root directory (relative path, not absolute)
 * @param options - Optional scan configuration
 * @param options.maxFileSizeBytes - Maximum file size to scan (default 1MB)
 * @returns Complete RepoGraph with nodes and edges
 * @throws Error if workspace validation fails
 */
export declare function buildWorkspaceGraph(workspaceRoot: string, options?: {
    maxFileSizeBytes?: number;
    maxFiles?: number;
}): RepoGraph;
/**
 * Incrementally update the graph for a set of changed files.
 * Re-scans only the specified files, updates their nodes and edges,
 * and falls back to a full rebuild if the incremental pass cannot be validated.
 *
 * @param workspaceRoot - Workspace root directory (relative path)
 * @param filePaths - Array of absolute file paths that changed
 * @param options - Optional configuration
 * @param options.forceRebuild - Force a full rebuild instead of incremental
 * @returns Updated RepoGraph
 */
export declare function updateGraphForFiles(workspaceRoot: string, filePaths: string[], options?: {
    forceRebuild?: boolean;
}): Promise<RepoGraph>;

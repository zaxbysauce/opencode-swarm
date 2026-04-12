/**
 * Repo graph storage module for persisting code dependency graphs.
 * Stores module-level in-memory cache and safe load/save to .swarm/repo-graph.json.
 *
 * Security: All file operations use validateSwarmPath to reject workspace-escaping paths.
 * Uses atomic temp+rename writes to prevent partial writes.
 */

import * as fsSync from 'node:fs';
import { constants, existsSync, realpathSync } from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { validateSwarmPath } from '../hooks/utils';
import {
	containsControlChars,
	containsPathTraversal,
	validateSymlinkBoundary,
} from '../utils/path-security';
import { extractPythonSymbols, extractTSSymbols } from './symbols';

/**
 * Maximum number of rename retries on Windows EEXIST errors.
 * Windows may hold the file open briefly during handle release.
 */
const WINDOWS_RENAME_MAX_RETRIES = 3;

/**
 * Delay between rename retries on Windows (ms).
 */
const WINDOWS_RENAME_RETRY_DELAY_MS = 50;

/**
 * Normalize a file path for use as a graph key.
 * Uses path.normalize for segment cleanup, then converts all
 * backslashes to forward slashes for cross-platform consistency.
 * This ensures the same file produces the same key on Windows, macOS, and Linux.
 */
function normalizeGraphPath(filePath: string): string {
	return path.normalize(filePath).replace(/\\/g, '/');
}

// ============ Constants ============
const REPO_GRAPH_FILENAME = 'repo-graph.json';
const GRAPH_SCHEMA_VERSION = '1.0.0';

// ============ Types ============

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

// ============ Module-Level Cache ============

/** In-memory cache of the loaded graph, keyed by workspace directory */
const graphCache = new Map<string, RepoGraph>();

/** Cache for modified/dirty state per workspace */
const dirtyFlags = new Map<string, boolean>();

/** Cache for file mtime (for cache invalidation), keyed by workspace directory */
const mtimeCache = new Map<string, number>();

// ============ Validation ============

/**
 * Validate that a workspace directory is safe to use.
 * Accepts both absolute and relative paths.
 *
 * @param workspace - The workspace directory (path, absolute or relative, e.g. "/home/user/project" or "my-project")
 * @throws Error if the workspace is invalid
 */
export function validateWorkspace(workspace: string): void {
	if (!workspace || typeof workspace !== 'string' || workspace.trim() === '') {
		throw new Error('Invalid workspace: must be a non-empty string');
	}
	if (containsControlChars(workspace)) {
		throw new Error('Invalid workspace: control characters detected');
	}
	if (containsPathTraversal(workspace)) {
		throw new Error('Invalid workspace: path traversal detected');
	}
}

/**
 * Validate a graph node before adding to the graph.
 * @param node - The node to validate
 * @throws Error if the node is invalid
 */
export function validateGraphNode(node: GraphNode): void {
	if (!node || typeof node !== 'object') {
		throw new Error('Invalid node: must be an object');
	}
	if (!node.filePath || typeof node.filePath !== 'string') {
		throw new Error('Invalid node: filePath is required');
	}
	// filePath must be absolute
	if (
		!node.filePath.startsWith('/') &&
		!/^[A-Za-z]:[/\\]/.test(node.filePath)
	) {
		throw new Error('Invalid node: filePath must be absolute');
	}
	if (containsPathTraversal(node.filePath)) {
		throw new Error('Invalid node: filePath contains path traversal');
	}
	if (containsControlChars(node.filePath)) {
		throw new Error('Invalid node: filePath contains control characters');
	}
	if (!node.moduleName || typeof node.moduleName !== 'string') {
		throw new Error('Invalid node: moduleName is required');
	}
	// moduleName must be a relative path (not absolute, no traversal)
	if (
		node.moduleName.startsWith('/') ||
		node.moduleName.startsWith('\\') ||
		/^[A-Za-z]:[/\\]/.test(node.moduleName)
	) {
		throw new Error('Invalid node: moduleName must be relative');
	}
	if (containsPathTraversal(node.moduleName)) {
		throw new Error('Invalid node: moduleName contains path traversal');
	}
	if (containsControlChars(node.moduleName)) {
		throw new Error('Invalid node: moduleName contains control characters');
	}
	if (typeof node.language !== 'string') {
		throw new Error('Invalid node: language is required');
	}
	if (typeof node.mtime !== 'string') {
		throw new Error('Invalid node: mtime is required');
	}
	if (!Array.isArray(node.exports)) {
		throw new Error('Invalid node: exports must be an array');
	}
	for (const exp of node.exports) {
		if (typeof exp !== 'string') {
			throw new Error('Invalid node: exports must be an array of strings');
		}
		if (containsControlChars(exp)) {
			throw new Error('Invalid node: exports contains control characters');
		}
	}
	if (!Array.isArray(node.imports)) {
		throw new Error('Invalid node: imports must be an array');
	}
	for (const imp of node.imports) {
		if (typeof imp !== 'string') {
			throw new Error('Invalid node: imports must be an array of strings');
		}
		if (containsControlChars(imp)) {
			throw new Error('Invalid node: imports contains control characters');
		}
	}
}

/**
 * Validate a graph edge before adding to the graph.
 * @param edge - The edge to validate
 * @throws Error if the edge is invalid
 */
export function validateGraphEdge(edge: GraphEdge): void {
	if (!edge || typeof edge !== 'object') {
		throw new Error('Invalid edge: must be an object');
	}
	if (!edge.source || typeof edge.source !== 'string') {
		throw new Error('Invalid edge: source is required');
	}
	if (!edge.target || typeof edge.target !== 'string') {
		throw new Error('Invalid edge: target is required');
	}
	if (
		containsPathTraversal(edge.source) ||
		containsPathTraversal(edge.target)
	) {
		throw new Error('Invalid edge: path traversal detected');
	}
	if (containsControlChars(edge.source) || containsControlChars(edge.target)) {
		throw new Error('Invalid edge: control characters detected');
	}
}

// ============ Path Resolution ============

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
export function resolveModuleSpecifier(
	workspaceRoot: string,
	sourceFile: string,
	specifier: string,
): string | null {
	// Reject control characters
	if (containsControlChars(specifier)) {
		return null;
	}

	// Reject absolute paths and URLs
	if (specifier.startsWith('/') || specifier.startsWith('\\')) {
		return null;
	}
	if (/^[A-Za-z]:[/\\]/.test(specifier)) {
		return null;
	}
	if (specifier.startsWith('http://') || specifier.startsWith('https://')) {
		return null;
	}

	try {
		// Resolve relative to source file
		if (specifier.startsWith('.')) {
			const sourceDir = path.dirname(sourceFile);
			let resolved = path.resolve(sourceDir, specifier);

			// SECURITY: Resolve symlinks to get the real path, then verify the
			// real path is still within the workspace boundary. This prevents
			// symlink-based workspace escape attacks.
			let realResolved: string;
			try {
				realResolved = realpathSync(resolved);
			} catch {
				// realpath fails for non-existent paths - use resolved as fallback
				// but only if it passes the non-realpath boundary check below
				realResolved = resolved;
			}

			// Get the realpath of the workspace root to compare consistently
			let realRoot: string;
			try {
				realRoot = realpathSync(workspaceRoot);
			} catch {
				// Fall back to normalized path if realpath fails
				realRoot = path.normalize(workspaceRoot);
			}

			// Try to resolve the extensionless path to a real file.
			// TypeScript/JavaScript imports commonly omit extensions: import { foo } from './utils'
			// We need to find the actual file: ./utils.ts, ./utils.js, etc.
			if (!existsSync(resolved)) {
				const EXTENSIONS = [
					'.ts',
					'.tsx',
					'.js',
					'.jsx',
					'.mjs',
					'.cjs',
					'.py',
					'.json',
				];
				let found: string | null = null;
				for (const ext of EXTENSIONS) {
					const candidate = resolved + ext;
					if (existsSync(candidate)) {
						found = candidate;
						break;
					}
				}
				if (found) {
					// Re-resolve symlinks for the found file
					try {
						realResolved = realpathSync(found);
					} catch {
						realResolved = found;
					}
					// Update resolved to the found path so the return value has the extension
					resolved = found;
				} else {
					// No matching file found — this import doesn't resolve to a workspace file
					return null;
				}
			}

			// Normalize for consistent comparison (computed AFTER extension resolution)
			const normalizedResolved = path.normalize(realResolved);
			const normalizedRoot = path.normalize(realRoot);

			// Ensure result is within workspace using real path boundaries
			if (
				!normalizedResolved.startsWith(normalizedRoot + path.sep) &&
				normalizedResolved !== normalizedRoot
			) {
				return null;
			}
			return resolved;
		}

		// Bare specifiers (e.g., 'lodash', '@scope/pkg') cannot be resolved
		// without node_modules traversal - return null per contract above
		return null;
	} catch {
		return null;
	}
}

// ============ Graph Construction ============

/**
 * Create an empty graph for a workspace.
 * @param workspaceRoot - The workspace root directory
 * @returns Empty RepoGraph structure
 */
export function createEmptyGraph(workspaceRoot: string): RepoGraph {
	return {
		schema_version: GRAPH_SCHEMA_VERSION,
		workspaceRoot: path.normalize(workspaceRoot),
		nodes: {},
		edges: [],
		metadata: {
			generatedAt: new Date().toISOString(),
			generator: 'repo-graph',
			nodeCount: 0,
			edgeCount: 0,
		},
	};
}

/**
 * Update graph metadata after modifications.
 * @param graph - The graph to update
 */
function updateGraphMetadata(graph: RepoGraph): void {
	graph.metadata = {
		generatedAt: new Date().toISOString(),
		generator: 'repo-graph',
		nodeCount: Object.keys(graph.nodes).length,
		edgeCount: graph.edges.length,
	};
}

/**
 * Add or update a node in the graph.
 * @param graph - The graph to modify
 * @param node - The node to add/update
 */
export function upsertNode(graph: RepoGraph, node: GraphNode): void {
	validateGraphNode(node);
	const key = normalizeGraphPath(node.filePath);
	graph.nodes[key] = node;
	updateGraphMetadata(graph);
}

/**
 * Add an edge to the graph.
 * @param graph - The graph to modify
 * @param edge - The edge to add
 */
export function addEdge(graph: RepoGraph, edge: GraphEdge): void {
	validateGraphEdge(edge);
	// Avoid duplicates
	const exists = graph.edges.some(
		(e) =>
			e.source === edge.source &&
			e.target === edge.target &&
			e.importSpecifier === edge.importSpecifier,
	);
	if (!exists) {
		graph.edges.push(edge);
		updateGraphMetadata(graph);
	}
}

// ============ Cache Operations ============

/**
 * Get the cached graph for a workspace.
 * @param workspace - The workspace directory (absolute or relative path)
 * @returns The cached graph or undefined if not cached
 */
export function getCachedGraph(workspace: string): RepoGraph | undefined {
	return graphCache.get(path.normalize(workspace));
}

/**
 * Set the cached graph for a workspace.
 * @param workspace - The workspace directory (absolute or relative path)
 * @param graph - The graph to cache
 * @param mtime - Optional file mtime to track for cache invalidation
 */
export function setCachedGraph(
	workspace: string,
	graph: RepoGraph,
	mtime?: number,
): void {
	const normalized = path.normalize(workspace);
	graphCache.set(normalized, graph);
	dirtyFlags.set(normalized, false);
	if (mtime !== undefined) {
		mtimeCache.set(normalized, mtime);
	}
}

/**
 * Mark a workspace's cache as dirty (modified since last save).
 * @param workspace - The workspace directory (absolute or relative path)
 */
export function markDirty(workspace: string): void {
	dirtyFlags.set(path.normalize(workspace), true);
}

/**
 * Check if a workspace's cache is dirty.
 * @param workspace - The workspace directory (absolute or relative path)
 * @returns True if the cache has been modified since last save
 */
export function isDirty(workspace: string): boolean {
	return dirtyFlags.get(path.normalize(workspace)) ?? false;
}

/**
 * Clear the cache for a workspace.
 * @param workspace - The workspace directory (absolute or relative path)
 */
export function clearCache(workspace: string): void {
	const normalized = path.normalize(workspace);
	graphCache.delete(normalized);
	dirtyFlags.delete(normalized);
	mtimeCache.delete(normalized);
}

// ============ Safe Load/Save Operations ============

/**
 * Get the validated path for the repo-graph.json file.
 * Resolves symlinks via realpath before validation to prevent
 * workspace-escaping attacks via symlink manipulation.
 *
 * @param workspace - The workspace directory (absolute or relative path)
 * @returns Absolute path to repo-graph.json
 * @throws Error if path validation fails or resolved path escapes workspace
 */
export function getGraphPath(workspace: string): string {
	validateWorkspace(workspace);
	const basePath = validateSwarmPath(workspace, REPO_GRAPH_FILENAME);

	// SECURITY: Resolve symlinks to verify graph path stays within workspace
	validateSymlinkBoundary(basePath, workspace);

	return basePath;
}

/**
 * Load the graph from .swarm/repo-graph.json.
 * Uses the in-memory cache if available, not dirty, and file mtime unchanged.
 *
 * @param workspace - The workspace directory (absolute or relative path)
 * @returns The loaded graph or null if not found
 * @throws Error if file exists but is invalid/corrupted
 */
export async function loadGraph(workspace: string): Promise<RepoGraph | null> {
	validateWorkspace(workspace);
	const normalized = path.normalize(workspace);

	// Check cache first (only valid if not dirty)
	const cached = getCachedGraph(normalized);
	if (cached && !isDirty(normalized)) {
		// Invalidate cache if file mtime changed since last load
		try {
			const graphPath = getGraphPath(workspace);
			if (existsSync(graphPath)) {
				const stats = await fsPromises.stat(graphPath);
				const cachedMtime = mtimeCache.get(normalized);
				if (cachedMtime !== undefined && stats.mtimeMs !== cachedMtime) {
					// File was modified externally - invalidate cache
					clearCache(normalized);
				} else {
					return cached;
				}
			} else {
				// File deleted since last cache - invalidate
				clearCache(normalized);
			}
		} catch {
			// If we can't stat the file, don't use cache
			clearCache(normalized);
		}
	}

	try {
		const graphPath = getGraphPath(workspace);

		if (!existsSync(graphPath)) {
			// No graph file exists yet
			return null;
		}

		const stats = await fsPromises.stat(graphPath);
		const content = await fsPromises.readFile(graphPath, 'utf-8');

		// SECURITY: Reject content with null bytes or invalid UTF-8
		if (content.includes('\0') || content.includes('\uFFFD')) {
			throw Object.assign(
				new Error('repo-graph.json contains null bytes or invalid encoding'),
				{ code: 'CORRUPTION' },
			);
		}

		let parsed: RepoGraph;
		try {
			parsed = JSON.parse(content) as RepoGraph;
		} catch {
			throw Object.assign(new Error('repo-graph.json contains invalid JSON'), {
				code: 'CORRUPTION',
			});
		}

		// Validate structure
		if (!parsed.schema_version) {
			throw Object.assign(new Error('repo-graph.json missing schema_version'), {
				code: 'CORRUPTION',
			});
		}
		if (!parsed.nodes || typeof parsed.nodes !== 'object') {
			throw Object.assign(
				new Error('repo-graph.json missing or invalid nodes'),
				{ code: 'CORRUPTION' },
			);
		}
		if (!Array.isArray(parsed.edges)) {
			throw Object.assign(
				new Error('repo-graph.json missing or invalid edges'),
				{ code: 'CORRUPTION' },
			);
		}

		// Validate nodes
		for (const [key, node] of Object.entries(parsed.nodes)) {
			if (!key || typeof key !== 'string') {
				throw Object.assign(
					new Error('repo-graph.json contains invalid node key'),
					{ code: 'CORRUPTION' },
				);
			}
			try {
				validateGraphNode(node);
			} catch (err) {
				const msg =
					err instanceof Error ? err.message : 'Invalid node structure';
				throw Object.assign(
					new Error(`repo-graph.json node validation failed: ${msg}`),
					{ code: 'CORRUPTION' },
				);
			}
		}

		// Validate edges
		for (const edge of parsed.edges) {
			try {
				validateGraphEdge(edge);
			} catch (err) {
				const msg =
					err instanceof Error ? err.message : 'Invalid edge structure';
				throw Object.assign(
					new Error(`repo-graph.json edge validation failed: ${msg}`),
					{ code: 'CORRUPTION' },
				);
			}
		}

		// Validate metadata
		if (
			!parsed.metadata ||
			typeof parsed.metadata !== 'object' ||
			typeof parsed.metadata.generatedAt !== 'string' ||
			typeof parsed.metadata.generator !== 'string' ||
			typeof parsed.metadata.nodeCount !== 'number' ||
			typeof parsed.metadata.edgeCount !== 'number'
		) {
			throw Object.assign(
				new Error('repo-graph.json missing or invalid metadata'),
				{ code: 'CORRUPTION' },
			);
		}

		// Update cache with current file mtime
		setCachedGraph(normalized, parsed, stats.mtimeMs);

		return parsed;
	} catch (error: unknown) {
		// Re-throw structured corruption errors
		if (
			error instanceof Error &&
			'code' in error &&
			(error as { code: string }).code === 'CORRUPTION'
		) {
			throw error;
		}
		// Only return null for ENOENT (file not found); rethrow other I/O errors
		if (
			error instanceof Error &&
			'code' in error &&
			(error as { code: string }).code === 'ENOENT'
		) {
			return null;
		}
		throw error;
	}
}

/**
 * Save the graph to .swarm/repo-graph.json atomically.
 * Uses temp file + rename pattern to prevent partial writes.
 *
 * @param workspace - The workspace directory (absolute or relative path)
 * @param graph - The graph to save
 * @param options.createAtomic - If true, fails if file already exists (for atomic create)
 * @throws Error if validation fails, write fails, or file exists when createAtomic=true
 */
export async function saveGraph(
	workspace: string,
	graph: RepoGraph,
	options?: { createAtomic?: boolean },
): Promise<void> {
	validateWorkspace(workspace);

	// Validate graph structure
	if (!graph.schema_version) {
		throw new Error('Graph must have schema_version');
	}
	if (!graph.nodes || typeof graph.nodes !== 'object') {
		throw new Error('Graph must have nodes object');
	}
	if (!Array.isArray(graph.edges)) {
		throw new Error('Graph must have edges array');
	}

	// SECURITY: Validate that the graph's workspaceRoot matches the active workspace.
	// This prevents a TOCTOU attack where a graph saved for one workspace could
	// be swapped with a graph from another workspace.
	const normalizedWorkspace = path.normalize(workspace);
	let realWorkspace: string;
	try {
		realWorkspace = realpathSync(workspace);
	} catch {
		realWorkspace = normalizedWorkspace;
	}

	const normalizedGraphRoot = path.normalize(graph.workspaceRoot);
	let realGraphRoot: string;
	try {
		realGraphRoot = realpathSync(graph.workspaceRoot);
	} catch {
		realGraphRoot = normalizedGraphRoot;
	}

	if (path.normalize(realWorkspace) !== path.normalize(realGraphRoot)) {
		throw new Error(
			`Graph workspaceRoot mismatch: graph was built for "${graph.workspaceRoot}" but save was called for "${workspace}"`,
		);
	}

	const normalized = normalizedWorkspace;

	// Get validated path
	const graphPath = getGraphPath(workspace);

	// Update metadata before saving
	updateGraphMetadata(graph);

	// Atomic write: temp file + rename
	const tempPath = `${graphPath}.tmp.${Date.now()}.${Math.floor(Math.random() * 1e9)}`;

	let lastError: Error | null = null;

	try {
		// For atomic create, use exclusive open
		if (options?.createAtomic) {
			try {
				const handle = await fsPromises.open(tempPath, 'wx', 0o644);
				await handle.writeFile(JSON.stringify(graph, null, 2), 'utf-8');
				await handle.close();
			} catch (error: unknown) {
				if (
					error instanceof Error &&
					'code' in error &&
					(error as { code: string }).code === 'EEXIST'
				) {
					throw new Error('file already exists');
				}
				throw error;
			}
		} else {
			await fsPromises.writeFile(
				tempPath,
				JSON.stringify(graph, null, 2),
				'utf-8',
			);
		}

		// For createAtomic: use copy with COPYFILE_EXCL to fail if target exists.
		// This is different from rename which overwrites on Windows.
		// For non-createAtomic: use rename with Windows retry loop.
		if (options?.createAtomic) {
			// copyFile with COPYFILE_EXCL fails if target already exists
			try {
				await fsPromises.copyFile(tempPath, graphPath, constants.COPYFILE_EXCL);
			} catch (error: unknown) {
				lastError = error instanceof Error ? error : new Error(String(error));
				throw lastError;
			}
		} else {
			// On Windows, rename may fail if target exists and is open.
			// Retry the rename without deleting the target (no delete-then-rename
			// fallback) to eliminate the TOCTOU window where an attacker could
			// create a malicious file at graphPath between delete and rename.
			let retries = 0;
			while (retries < WINDOWS_RENAME_MAX_RETRIES) {
				try {
					await fsPromises.rename(tempPath, graphPath);
					break;
				} catch (error: unknown) {
					lastError = error instanceof Error ? error : new Error(String(error));
					// Only retry on Windows EEXIST error
					if (
						lastError instanceof Error &&
						'code' in lastError &&
						(lastError as { code: string }).code === 'EEXIST' &&
						retries < WINDOWS_RENAME_MAX_RETRIES - 1
					) {
						retries++;
						// Wait before retry to allow handle release
						await new Promise((resolve) =>
							setTimeout(resolve, WINDOWS_RENAME_RETRY_DELAY_MS),
						);
						continue;
					}
					// Not an EEXIST error or max retries reached - throw
					throw lastError;
				}
			}
		}
	} finally {
		// Clean up temp file.
		// For rename path: temp is gone after successful rename, so unlink fails with
		// ENOENT which is ignored. For copy path (createAtomic): temp still exists and
		// must be explicitly removed.
		try {
			await fsPromises.unlink(tempPath);
		} catch (error: unknown) {
			// Log but don't throw - the write/rename failure is the primary error
			if (
				error instanceof Error &&
				'code' in error &&
				(error as { code: string }).code !== 'ENOENT'
			) {
				console.error(`Failed to clean up temp file ${tempPath}:`, error);
			}
		}
	}

	// Update cache with current file mtime
	const stats = await fsPromises.stat(graphPath);
	setCachedGraph(normalized, graph, stats.mtimeMs);
}

/**
 * Load or create a graph for a workspace atomically.
 * Returns existing graph or creates a new empty one.
 * Handles concurrent creation by treating a create-fail as "graph exists".
 *
 * @param workspace - The workspace directory (absolute or relative path)
 * @returns The existing or new graph
 */
export async function loadOrCreateGraph(workspace: string): Promise<RepoGraph> {
	// First try to load existing graph
	const existing = await loadGraph(workspace);
	if (existing) {
		return existing;
	}

	// No existing graph - try to create one atomically
	const newGraph = createEmptyGraph(workspace);

	// Attempt atomic save with exclusive create flag
	// This will fail if another process created the file first
	try {
		await saveGraph(workspace, newGraph, { createAtomic: true });
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes('file already exists')
		) {
			// Another process beat us - reload their graph
			const retry = await loadGraph(workspace);
			if (retry) {
				return retry;
			}
			// Edge case: file disappeared between our create attempt and reload
			// Retry save without exclusive flag (file doesn't exist anymore)
			await saveGraph(workspace, newGraph);
		} else {
			throw error;
		}
	}

	setCachedGraph(workspace, newGraph);
	return newGraph;
}

/**
 * Save the cached graph for a workspace if it's dirty.
 *
 * @param workspace - The workspace directory (absolute or relative path)
 * @throws Error if workspace is dirty but cache is missing (inconsistent state)
 * @throws Error if save fails
 */
export async function saveIfDirty(workspace: string): Promise<void> {
	const normalized = path.normalize(workspace);
	if (isDirty(normalized)) {
		const graph = getCachedGraph(normalized);
		if (!graph) {
			throw new Error(
				`Cannot save dirty graph for workspace "${workspace}": cache is missing`,
			);
		}
		await saveGraph(workspace, graph);
	}
}

// ============ Workspace Scan Builder ============

/**
 * Directories to skip during workspace scanning (build artifacts, package managers, etc.).
 * Mirrors the skip list from imports.ts for consistency.
 */
const SKIP_DIRECTORIES = new Set([
	'node_modules',
	'.git',
	'dist',
	'build',
	'out',
	'coverage',
	'.next',
	'.nuxt',
	'.cache',
	'vendor',
	'.svn',
	'.hg',
]);

/**
 * Supported source file extensions for graph scanning.
 */
const SUPPORTED_EXTENSIONS = [
	'.ts',
	'.tsx',
	'.js',
	'.jsx',
	'.mjs',
	'.cjs',
	'.py',
];

/**
 * Mapping of file extensions to language identifiers.
 */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
	'.ts': 'typescript',
	'.tsx': 'typescript',
	'.js': 'javascript',
	'.jsx': 'javascript',
	'.mjs': 'javascript',
	'.cjs': 'javascript',
	'.py': 'python',
};

/**
 * Statistics collected during workspace scan.
 */
interface ScanStats {
	/** Total files scanned */
	filesScanned: number;
	/** Directories skipped */
	skippedDirs: number;
	/** Files skipped due to size/binary/errors */
	skippedFiles: number;
	/** True if maxFiles limit was hit */
	truncated: boolean;
}

/**
 * A parsed import with its specifier and type.
 */
interface ParsedImport {
	/** The module specifier (e.g., './foo', 'lodash') */
	specifier: string;
	/** The type of import */
	importType: 'default' | 'named' | 'namespace' | 'require' | 'sideeffect';
}

/**
 * Parse imports from file content using the same rules as imports.ts.
 * Handles ES module imports and CommonJS require() statements.
 *
 * @param content - File content to parse
 * @returns Array of parsed imports with specifier and type
 */
function parseFileImports(content: string): ParsedImport[] {
	const imports: ParsedImport[] = [];

	// Combined regex matching:
	// - import { x } from '...' or import { x as y } from '...'
	// - import x from '...' (default import)
	// - import * as x from '...' (namespace import)
	// - import '...' (side-effect only)
	// - import('...') (dynamic import)
	// - require('...')
	// - export { x } from '...' (named re-export)
	// - export * from '...' (namespace re-export)
	const importRegex =
		/import\s+(?:\{[\s\S]*?\}|(?:\*\s+as\s+\w+)|\w+)\s+from\s+['"`]([^'"`]+)['"`]|import\s+['"`]([^'"`]+)['"`]|require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)|export\s*\{[^}]*\}\s*from\s+['"`]([^'"`]+)['"`]|export\s+\*(?:\s+as\s+\w+)?\s+from\s+['"`]([^'"`]+)['"`]|import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;

	for (const match of content.matchAll(importRegex)) {
		// Extract the module path from whichever capture group matched
		const modulePath =
			match[1] || match[2] || match[3] || match[4] || match[5] || match[6];
		if (!modulePath) continue;

		// Get the matched string for type detection
		const matchedString = match[0];

		// Determine import type - mirrors imports.ts classification logic
		let importType: ParsedImport['importType'] = 'named';
		if (matchedString.includes('* as')) {
			importType = 'namespace';
		} else if (/^import\s*\(/.test(matchedString)) {
			// Dynamic import: import('...')
			importType = 'sideeffect';
		} else if (/^export\s*\{/.test(matchedString)) {
			// Named re-export: export { Foo } from '...'
			importType = 'named';
		} else if (/^export\s+\*/.test(matchedString)) {
			// Namespace re-export: export * from '...'
			importType = 'namespace';
		} else if (/^import\s+\{/.test(matchedString)) {
			// Named import: import { Foo } from '...'
			importType = 'named';
		} else if (/^import\s+\w+\s+from\s+['"`]/.test(matchedString)) {
			// Default import: import foo from '...'
			importType = 'default';
		} else if (/^import\s+['"`]/m.test(matchedString)) {
			// Side-effect import: import '...' (no from with specifier)
			importType = 'sideeffect';
		} else if (matchedString.includes('require(')) {
			importType = 'require';
		}

		imports.push({ specifier: modulePath, importType });
	}

	return imports;
}

/**
 * Recursively find all supported source files in a directory.
 * Produces deterministic ordering via sorted entries.
 *
 * @param dir - Directory to scan
 * @param stats - Scan statistics accumulator
 * @returns Array of absolute file paths
 */
function findSourceFiles(dir: string, stats: ScanStats): string[] {
	let entries: string[];
	try {
		entries = fsSync.readdirSync(dir);
	} catch {
		return [];
	}

	// Sort for deterministic scan order (case-insensitive)
	entries.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

	const files: string[] = [];

	for (const entry of entries) {
		if (SKIP_DIRECTORIES.has(entry)) {
			stats.skippedDirs++;
			continue;
		}

		const fullPath = path.join(dir, entry);

		let stat: fsSync.Stats;
		try {
			stat = fsSync.statSync(fullPath);
		} catch {
			continue;
		}

		if (stat.isDirectory()) {
			const subFiles = findSourceFiles(fullPath, stats);
			files.push(...subFiles);
		} else if (stat.isFile()) {
			const ext = path.extname(fullPath).toLowerCase();
			if (SUPPORTED_EXTENSIONS.includes(ext)) {
				files.push(fullPath);
			}
		}
	}

	return files;
}

/**
 * Normalize a file path to a module name relative to workspace root.
 * Uses forward slashes for cross-platform consistency.
 *
 * @param filePath - Absolute file path
 * @param workspaceRoot - Absolute path to workspace root
 * @returns Module name relative to workspace root
 */
function toModuleName(filePath: string, workspaceRoot: string): string {
	const relative = path.relative(workspaceRoot, filePath);
	// Normalize to forward slashes for cross-platform consistency
	return relative.split(path.sep).join('/');
}

/**
 * Get the language identifier for a file based on its extension.
 *
 * @param filePath - File path to get language for
 * @returns Language identifier string
 */
function getLanguage(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase();
	return EXTENSION_TO_LANGUAGE[ext] ?? 'unknown';
}

/**
 * Check if file content appears to be binary.
 *
 * @param content - File content as string
 * @returns True if content appears binary
 */
function isBinaryContent(content: string): boolean {
	// Check for null bytes which indicate binary content
	if (content.includes('\0')) {
		return true;
	}
	return false;
}

/**
 * Build a complete dependency graph for a workspace by scanning all source files.
 *
 * The scan is deterministic: files are processed in sorted order, and edges
 * are added in a stable order based on source file and import specifier.
 *
 * @param workspaceRoot - Workspace root directory (absolute or relative path)
 * @param options - Optional scan configuration
 * @param options.maxFileSizeBytes - Maximum file size to scan (default 1MB)
 * @returns Complete RepoGraph with nodes and edges
 * @throws Error if workspace validation fails
 */
export function buildWorkspaceGraph(
	workspaceRoot: string,
	options?: { maxFileSizeBytes?: number; maxFiles?: number },
): RepoGraph {
	validateWorkspace(workspaceRoot);

	const maxFileSize = options?.maxFileSizeBytes ?? 1024 * 1024; // 1MB default
	const maxFiles = options?.maxFiles ?? 10000; // Default: 10,000 files

	// Resolve workspace root to absolute path for scanning only
	const absoluteRoot = path.resolve(workspaceRoot);

	// Verify workspace directory exists before scanning
	// Fail fast rather than silently returning an empty graph for a missing workspace
	if (!existsSync(absoluteRoot)) {
		throw new Error(`Workspace directory does not exist: ${workspaceRoot}`);
	}

	// Create graph with original workspaceRoot form (not absolute path)
	// The absoluteRoot is used only for file system scanning
	const graph = createEmptyGraph(workspaceRoot);
	const stats: ScanStats = {
		filesScanned: 0,
		skippedDirs: 0,
		skippedFiles: 0,
		truncated: false,
	};

	// Find all source files in the workspace
	const sourceFiles = findSourceFiles(absoluteRoot, stats);

	// Sort files for deterministic processing order
	// Use normalized path (forward slashes) for consistent ordering
	sourceFiles.sort((a, b) => {
		const normA = normalizeGraphPath(a);
		const normB = normalizeGraphPath(b);
		return normA.localeCompare(normB);
	});

	// Truncate if file count exceeds maxFiles
	if (sourceFiles.length > maxFiles) {
		console.warn(
			`[repo-graph] Truncating scan: ${sourceFiles.length} files found, capping at ${maxFiles}. ` +
				`${sourceFiles.length - maxFiles} files skipped.`,
		);
		sourceFiles.length = maxFiles;
		stats.truncated = true;
	}

	// Process each file to extract nodes and edges
	for (const filePath of sourceFiles) {
		let content: string;
		let fileStats: fsSync.Stats;

		try {
			fileStats = fsSync.statSync(filePath);
			if (fileStats.size > maxFileSize) {
				stats.skippedFiles++;
				continue;
			}
			content = fsSync.readFileSync(filePath, 'utf-8');
		} catch {
			stats.skippedFiles++;
			continue;
		}

		// Skip binary files
		if (isBinaryContent(content)) {
			stats.skippedFiles++;
			continue;
		}

		stats.filesScanned++;

		// Extract symbol exports based on file extension
		const ext = path.extname(filePath).toLowerCase();
		let exports: string[] = [];

		if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
			// Convert absolute path to relative before passing to symbol extractor
			// which expects paths relative to workspace root
			const relativePath = path.relative(absoluteRoot, filePath);
			const symbols = extractTSSymbols(relativePath, absoluteRoot);
			exports = symbols.filter((s) => s.exported).map((s) => s.name);
		} else if (ext === '.py') {
			// Convert absolute path to relative before passing to symbol extractor
			// which expects paths relative to workspace root
			const relativePath = path.relative(absoluteRoot, filePath);
			const symbols = extractPythonSymbols(relativePath, absoluteRoot);
			exports = symbols.filter((s) => s.exported).map((s) => s.name);
		}

		// Parse imports to get specifiers with types
		const parsedImports = parseFileImports(content);

		// Create the graph node
		const node: GraphNode = {
			filePath,
			moduleName: toModuleName(filePath, absoluteRoot),
			exports,
			imports: parsedImports.map((p) => p.specifier), // Extract specifiers for node
			language: getLanguage(filePath),
			mtime: fileStats.mtime.toISOString(),
		};

		upsertNode(graph, node);

		// Sort imports deterministically by specifier for stable edge ordering
		const sortedImports = [...parsedImports].sort((a, b) =>
			a.specifier.localeCompare(b.specifier),
		);

		// Process imports to create edges
		for (const parsed of sortedImports) {
			// Try to resolve the module specifier to a target file path
			// Use absoluteRoot to ensure relative imports resolve correctly
			const resolvedTarget = resolveModuleSpecifier(
				absoluteRoot,
				filePath,
				parsed.specifier,
			);

			// Only create edge if the target was successfully resolved
			// (bare specifiers like 'lodash' return null and are skipped)
			if (resolvedTarget !== null) {
				const edge: GraphEdge = {
					source: filePath,
					target: resolvedTarget,
					importSpecifier: parsed.specifier,
					importType: parsed.importType,
				};
				addEdge(graph, edge);
			}
		}
	}

	// Update final metadata with scan stats
	graph.metadata = {
		generatedAt: new Date().toISOString(),
		generator: 'repo-graph',
		nodeCount: Object.keys(graph.nodes).length,
		edgeCount: graph.edges.length,
	};

	// Log scan statistics if any files were skipped or truncated
	if (stats.skippedFiles > 0 || stats.skippedDirs > 0 || stats.truncated) {
		console.log(
			`[repo-graph] Scan stats: ${stats.filesScanned} files scanned, ` +
				`${stats.skippedFiles} files skipped, ${stats.skippedDirs} dirs skipped` +
				(stats.truncated ? ', TRUNCATED' : ''),
		);
	}

	return graph;
}

/**
 * Result of scanning a single file for graph updates.
 */
interface ScanResult {
	/** The created node, or null if file was skipped */
	node: GraphNode | null;
	/** The edges created from this file's imports */
	edges: GraphEdge[];
}

/**
 * Scan a single file and extract its graph node and edges.
 * Reuses the same logic from buildWorkspaceGraph for consistency.
 *
 * @param filePath - Absolute path to the file to scan
 * @param absoluteRoot - Absolute path to workspace root
 * @param maxFileSize - Maximum file size in bytes
 * @returns ScanResult with node and edges
 */
function scanFile(
	filePath: string,
	absoluteRoot: string,
	maxFileSize: number,
): ScanResult {
	let content: string;
	let fileStats: fsSync.Stats;

	try {
		fileStats = fsSync.statSync(filePath);
		if (fileStats.size > maxFileSize) {
			return { node: null, edges: [] };
		}
		content = fsSync.readFileSync(filePath, 'utf-8');
	} catch {
		return { node: null, edges: [] };
	}

	// Skip binary files
	if (isBinaryContent(content)) {
		return { node: null, edges: [] };
	}

	// Extract symbol exports based on file extension
	const ext = path.extname(filePath).toLowerCase();
	let exports: string[] = [];

	if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
		const relativePath = path.relative(absoluteRoot, filePath);
		const symbols = extractTSSymbols(relativePath, absoluteRoot);
		exports = symbols.filter((s) => s.exported).map((s) => s.name);
	} else if (ext === '.py') {
		const relativePath = path.relative(absoluteRoot, filePath);
		const symbols = extractPythonSymbols(relativePath, absoluteRoot);
		exports = symbols.filter((s) => s.exported).map((s) => s.name);
	}

	// Parse imports to get specifiers with types
	const parsedImports = parseFileImports(content);

	// Create the graph node
	const node: GraphNode = {
		filePath,
		moduleName: toModuleName(filePath, absoluteRoot),
		exports,
		imports: parsedImports.map((p) => p.specifier),
		language: getLanguage(filePath),
		mtime: fileStats.mtime.toISOString(),
	};

	// Process imports to create edges
	const edges: GraphEdge[] = [];
	const sortedImports = [...parsedImports].sort((a, b) =>
		a.specifier.localeCompare(b.specifier),
	);

	for (const parsed of sortedImports) {
		const resolvedTarget = resolveModuleSpecifier(
			absoluteRoot,
			filePath,
			parsed.specifier,
		);

		if (resolvedTarget !== null) {
			edges.push({
				source: filePath,
				target: resolvedTarget,
				importSpecifier: parsed.specifier,
				importType: parsed.importType,
			});
		}
	}

	return { node, edges };
}

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
export async function updateGraphForFiles(
	workspaceRoot: string,
	filePaths: string[],
	options?: { forceRebuild?: boolean },
): Promise<RepoGraph> {
	// If forced rebuild, do full rebuild and save
	if (options?.forceRebuild) {
		const graph = buildWorkspaceGraph(workspaceRoot);
		await saveGraph(workspaceRoot, graph);
		return graph;
	}

	// Try incremental update
	const existingGraph = await loadGraph(workspaceRoot);
	if (!existingGraph) {
		// No existing graph - fall back to full rebuild
		const graph = buildWorkspaceGraph(workspaceRoot);
		await saveGraph(workspaceRoot, graph);
		return graph;
	}

	// Work on a copy of the existing graph
	const graph = existingGraph;
	const absoluteRoot = path.resolve(workspaceRoot);
	const maxFileSize = 1024 * 1024; // 1MB default

	// Normalize file paths to track which files were updated
	const updatedPaths = new Set<string>();

	for (const rawFilePath of filePaths) {
		const normalizedPath = normalizeGraphPath(rawFilePath);

		// Check if file exists
		const fileExists = existsSync(rawFilePath);

		if (fileExists) {
			// Remove old edges from this file before adding new ones
			graph.edges = graph.edges.filter(
				(e) => normalizeGraphPath(e.source) !== normalizedPath,
			);

			// Scan the file
			const result = scanFile(rawFilePath, absoluteRoot, maxFileSize);

			if (result.node) {
				// Remove old node if present
				delete graph.nodes[normalizedPath];
				// Add updated node
				upsertNode(graph, result.node);

				// Add new edges (avoiding duplicates)
				for (const edge of result.edges) {
					const edgeExists = graph.edges.some(
						(e) =>
							e.source === edge.source &&
							e.target === edge.target &&
							e.importSpecifier === edge.importSpecifier,
					);
					if (!edgeExists) {
						addEdge(graph, edge);
					}
				}
			}
		} else {
			// File was deleted - remove its node and all edges referencing it
			delete graph.nodes[normalizedPath];
			graph.edges = graph.edges.filter(
				(e) =>
					normalizeGraphPath(e.source) !== normalizedPath &&
					normalizeGraphPath(e.target) !== normalizedPath,
			);
		}

		updatedPaths.add(normalizedPath);
	}

	// Validate that all edge sources and targets have corresponding nodes
	let validationFailed = false;
	for (const edge of graph.edges) {
		const normalizedSource = normalizeGraphPath(edge.source);
		const normalizedTarget = normalizeGraphPath(edge.target);
		if (!graph.nodes[normalizedSource] || !graph.nodes[normalizedTarget]) {
			validationFailed = true;
			break;
		}
	}

	if (validationFailed) {
		console.warn(
			`[repo-graph] Incremental update failed, falling back to full rebuild`,
		);
		const rebuiltGraph = buildWorkspaceGraph(workspaceRoot);
		await saveGraph(workspaceRoot, rebuiltGraph);
		return rebuiltGraph;
	}

	// Update metadata and save
	updateGraphMetadata(graph);
	await saveGraph(workspaceRoot, graph);

	return graph;
}

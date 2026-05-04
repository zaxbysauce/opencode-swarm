/**
 * Repo graph module — barrel re-export.
 *
 * Consumers import from 'repo-graph' (this file); the actual implementation
 * lives in the following submodules:
 *
 *   types.ts       — types/interfaces, constants, and basic graph helpers
 *   validation.ts  — path/node/edge validation functions
 *   cache.ts       — in-memory graph cache operations
 *   storage.ts     — safe load and save to .swarm/repo-graph.json
 *   builder.ts     — workspace scanning and full-graph construction
 *   incremental.ts — incremental updates for changed files
 */

export type {
	BuildWorkspaceGraphOptions,
	GraphEdge,
	GraphNode,
	RepoGraph,
} from './types';
export {
	GRAPH_SCHEMA_VERSION,
	REPO_GRAPH_FILENAME,
	createEmptyGraph,
	normalizeGraphPath,
	updateGraphMetadata,
} from './types';

export {
	validateGraphEdge,
	validateGraphNode,
	validateWorkspace,
} from './validation';

export {
	clearCache,
	getCachedGraph,
	getCachedMtime,
	isDirty,
	markDirty,
	setCachedGraph,
} from './cache';

export {
	getGraphPath,
	loadGraph,
	loadOrCreateGraph,
	saveGraph,
	saveIfDirty,
} from './storage';

export {
	addEdge,
	buildWorkspaceGraph,
	buildWorkspaceGraphAsync,
	resolveModuleSpecifier,
	upsertNode,
} from './builder';
export type { ScanResult } from './builder';

export { updateGraphForFiles } from './incremental';

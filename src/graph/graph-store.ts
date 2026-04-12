import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildRepoGraph, processFile } from './graph-builder';
import {
	REPO_GRAPH_FILENAME,
	REPO_GRAPH_SCHEMA_VERSION,
	type RepoGraph,
} from './types';

/**
 * Persist and load the repo graph as `.swarm/repo-graph.json`.
 *
 * Writes are atomic via tmpfile + rename to avoid corruption from concurrent reads.
 */

const SWARM_DIR = '.swarm';

export function getGraphPath(workspaceRoot: string): string {
	return path.join(workspaceRoot, SWARM_DIR, REPO_GRAPH_FILENAME);
}

export function loadGraph(workspaceRoot: string): RepoGraph | null {
	const file = getGraphPath(workspaceRoot);
	let raw: string;
	try {
		raw = fs.readFileSync(file, 'utf-8');
	} catch {
		return null;
	}
	try {
		const parsed = JSON.parse(raw) as RepoGraph;
		if (
			!parsed ||
			typeof parsed !== 'object' ||
			parsed.version !== REPO_GRAPH_SCHEMA_VERSION ||
			typeof parsed.files !== 'object' ||
			parsed.files === null
		) {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

export function saveGraph(workspaceRoot: string, graph: RepoGraph): void {
	const file = getGraphPath(workspaceRoot);
	const dir = path.dirname(file);
	fs.mkdirSync(dir, { recursive: true });
	const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
	fs.writeFileSync(tmp, JSON.stringify(graph), 'utf-8');
	fs.renameSync(tmp, file);
}

/**
 * Build the graph from scratch and persist it.
 */
export async function buildAndSaveGraph(
	workspaceRoot: string,
): Promise<RepoGraph> {
	const graph = await buildRepoGraph(workspaceRoot);
	saveGraph(workspaceRoot, graph);
	return graph;
}

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
export async function updateGraphIncremental(
	workspaceRoot: string,
	changedRelativePaths: string[],
	graph: RepoGraph,
): Promise<RepoGraph> {
	for (const rel of changedRelativePaths) {
		const normalized = rel.replace(/\\/g, '/');
		const abs = path.join(workspaceRoot, normalized);
		let exists = false;
		try {
			exists = fs.statSync(abs).isFile();
		} catch {
			exists = false;
		}
		if (!exists) {
			delete graph.files[normalized];
			continue;
		}
		const node = await processFile(abs, workspaceRoot);
		if (node) {
			graph.files[node.path] = node;
		} else {
			delete graph.files[normalized];
		}
	}
	graph.buildTimestamp = new Date().toISOString();
	return graph;
}

/**
 * Determine if a stored graph is fresh enough to reuse.
 *
 * Default freshness window: 5 minutes. Files added/removed outside this
 * window are not detected without an explicit incremental update — callers
 * that care about up-to-the-second accuracy should rebuild.
 */
export function isGraphFresh(
	graph: RepoGraph | null,
	maxAgeMs: number = 5 * 60 * 1000,
): boolean {
	if (!graph) return false;
	const built = Date.parse(graph.buildTimestamp);
	if (!Number.isFinite(built)) return false;
	return Date.now() - built <= maxAgeMs;
}

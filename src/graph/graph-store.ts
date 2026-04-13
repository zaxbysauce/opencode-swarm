import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildRepoGraph, processFile } from './graph-builder';
import { resetQueryCache } from './graph-query';
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
	// Defense in depth: refuse to write through a symlinked .swarm directory.
	// `mkdirSync({ recursive: true })` happily traverses symlinks, which would
	// let an attacker who can place a symlink in the workspace redirect the
	// graph file (and its tmpfile) to an arbitrary location.
	try {
		const stat = fs.lstatSync(dir);
		if (stat.isSymbolicLink()) {
			throw new Error(
				`refusing to write graph: ${SWARM_DIR}/ is a symbolic link`,
			);
		}
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
		// Directory does not exist yet — mkdirSync will create it freshly below.
	}
	fs.mkdirSync(dir, { recursive: true });
	// Unpredictable tmpfile name prevents a same-pid attacker from
	// pre-creating/symlinking the tmp path.
	const tmp = `${file}.tmp.${crypto.randomUUID()}`;
	fs.writeFileSync(tmp, JSON.stringify(graph), 'utf-8');
	try {
		fs.renameSync(tmp, file);
	} catch (renameErr) {
		// Cross-device move (EXDEV), permissions, or destination disappeared.
		// Best-effort cleanup so we don't leak an orphan tmpfile into .swarm/.
		try {
			fs.unlinkSync(tmp);
		} catch {
			// tmp may already be gone (e.g. partial rename) — ignore.
		}
		throw renameErr;
	}
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
		// Reject absolute paths and traversal that would escape the workspace.
		// These would otherwise let a malicious caller poison the graph with
		// nodes keyed to arbitrary on-disk files.
		if (path.isAbsolute(normalized) || normalized.includes('\0')) continue;
		const abs = path.resolve(workspaceRoot, normalized);
		const relCheck = path.relative(workspaceRoot, abs).replace(/\\/g, '/');
		if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) continue;
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
	// The query layer caches a reverse-edge index keyed on graph identity;
	// in-place mutation does not change identity, so we must explicitly
	// invalidate to avoid serving stale importers/dependents.
	resetQueryCache();
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

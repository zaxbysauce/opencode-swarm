/**
 * Incremental graph updates for changed files.
 *
 * updateGraphForFiles re-scans only the specified changed files, updates
 * their nodes and edges in the existing graph, and saves the result. It
 * includes an optimistic concurrency check (mtime comparison) so that
 * concurrent sessions do not overwrite each other's updates — when a race
 * is detected the function falls back to a full rebuild.
 */

import { existsSync } from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import * as logger from '../../utils/logger';
import { containsControlChars } from '../../utils/path-security';
import {
	addEdge,
	buildWorkspaceGraphAsync,
	scanFileAsync,
	upsertNode,
} from './builder';
import { getCachedMtime } from './cache';
import { resetQueryCache } from './query';
import { getGraphPath, loadGraph, saveGraph } from './storage';
import type { RepoGraph, SymbolEdge } from './types';
import { normalizeGraphPath, updateGraphMetadata } from './types';

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
		const graph = await buildWorkspaceGraphAsync(workspaceRoot);
		await saveGraph(workspaceRoot, graph);
		return graph;
	}

	// Try incremental update
	const existingGraph = await loadGraph(workspaceRoot);
	if (!existingGraph) {
		// No existing graph - fall back to full rebuild
		const graph = await buildWorkspaceGraphAsync(workspaceRoot);
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

			// Remove stale OUTGOING symbolEdges from this file before re-scanning.
			// Incoming edges (toFile === changedFile) come from consumers' refs and
			// cannot be rebuilt by rescanning only the provider; leave them in place.
			if (graph.symbolEdges) {
				graph.symbolEdges = graph.symbolEdges.filter(
					(se) => normalizeGraphPath(se.fromFile) !== normalizedPath,
				);
			}

			// Scan the file asynchronously to get node, edges, and symbolEdges
			const result = await scanFileAsync(
				rawFilePath,
				absoluteRoot,
				maxFileSize,
			);

			if (result.node) {
				// Sanitize imports: strip control-char specifiers that tree-sitter
				// may return raw (mirrors parseFileImports filtering in the sync path).
				const sanitizedImports = result.node.imports.filter(
					(imp) => !containsControlChars(imp),
				);
				const sanitizedNode: typeof result.node = {
					...result.node,
					imports: sanitizedImports,
				};

				// Remove old node if present
				delete graph.nodes[normalizedPath];
				// Add updated node (carries exportRanges when present)
				upsertNode(graph, sanitizedNode);

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

				// Add new symbolEdges (avoiding duplicates)
				if (result.symbolEdges.length > 0) {
					if (!graph.symbolEdges) {
						graph.symbolEdges = [];
					}
					const existingKeys = new Set(
						graph.symbolEdges.map(
							(se) =>
								`${se.fromFile}\u0000${se.fromSymbol}\u0000${se.toFile}\u0000${se.toSymbol}`,
						),
					);
					for (const symbolEdge of result.symbolEdges) {
						const key = `${symbolEdge.fromFile}\u0000${symbolEdge.fromSymbol}\u0000${symbolEdge.toFile}\u0000${symbolEdge.toSymbol}`;
						if (!existingKeys.has(key)) {
							graph.symbolEdges.push(symbolEdge);
							existingKeys.add(key);
						}
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
			// Remove stale symbolEdges referencing the deleted file
			if (graph.symbolEdges) {
				graph.symbolEdges = graph.symbolEdges.filter(
					(se) =>
						normalizeGraphPath(se.fromFile) !== normalizedPath &&
						normalizeGraphPath(se.toFile) !== normalizedPath,
				);
			}
		}

		updatedPaths.add(normalizedPath);
	}

	// Validate that all edge sources and targets have corresponding nodes.
	// Also prune stale symbolEdges whose fromFile or toFile node no longer exists.
	let validationFailed = false;
	for (const edge of graph.edges) {
		const normalizedSource = normalizeGraphPath(edge.source);
		const normalizedTarget = normalizeGraphPath(edge.target);
		if (!graph.nodes[normalizedSource] || !graph.nodes[normalizedTarget]) {
			validationFailed = true;
			break;
		}
	}

	if (graph.symbolEdges && graph.symbolEdges.length > 0) {
		const validSymbolEdges: SymbolEdge[] = [];
		for (const symbolEdge of graph.symbolEdges) {
			const normalizedFromFile = normalizeGraphPath(symbolEdge.fromFile);
			const normalizedToFile = normalizeGraphPath(symbolEdge.toFile);
			if (graph.nodes[normalizedFromFile] && graph.nodes[normalizedToFile]) {
				validSymbolEdges.push(symbolEdge);
			}
		}
		graph.symbolEdges = validSymbolEdges;
	}

	if (validationFailed) {
		logger.warn(
			`[repo-graph] Incremental update failed, falling back to full rebuild`,
		);
		const rebuiltGraph = await buildWorkspaceGraphAsync(workspaceRoot);
		await saveGraph(workspaceRoot, rebuiltGraph);
		return rebuiltGraph;
	}

	// Optimistic concurrency: check that the on-disk graph has not been
	// modified by another session since we loaded it. If the mtime differs,
	// another process saved a newer graph while we were computing our
	// incremental update. Fall back to a full rebuild in that case so we
	// do not overwrite the concurrent session's changes with a stale view.
	const normalizedWorkspace = path.normalize(workspaceRoot);
	const loadedMtime = getCachedMtime(normalizedWorkspace);
	if (loadedMtime !== undefined) {
		try {
			const graphPath = getGraphPath(workspaceRoot);
			if (existsSync(graphPath)) {
				const currentStats = await fsPromises.stat(graphPath);
				if (currentStats.mtimeMs !== loadedMtime) {
					logger.warn(
						`[repo-graph] Concurrent modification detected — falling back to full rebuild`,
					);
					const rebuiltGraph = await buildWorkspaceGraphAsync(workspaceRoot);
					await saveGraph(workspaceRoot, rebuiltGraph);
					return rebuiltGraph;
				}
			}
		} catch {
			// If we can't stat the file, proceed with the save anyway.
		}
	}

	// Only keep symbolEdges when non-empty (matches buildWorkspaceGraphAsync behavior)
	if (graph.symbolEdges && graph.symbolEdges.length === 0) {
		delete graph.symbolEdges;
	}

	// Update metadata and save
	updateGraphMetadata(graph);
	resetQueryCache();
	await saveGraph(workspaceRoot, graph);

	return graph;
}

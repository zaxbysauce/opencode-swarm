/**
 * Repo Graph Builder Hook
 *
 * Startup hook that builds or refreshes the repo dependency graph when a session starts.
 * Write-trigger hook that incrementally updates the graph when write tools are called.
 * Wrapped in try/catch — failures are logged but never block plugin initialization.
 */

import * as path from 'node:path';
import { WRITE_TOOL_NAMES } from '../config/constants';
import {
	buildWorkspaceGraph,
	saveGraph,
	updateGraphForFiles,
} from '../tools/repo-graph';

export interface RepoGraphBuilderHook {
	init(): Promise<void>;
	toolAfter(
		input: { tool: string; sessionID: string; args?: unknown },
		output: { output?: unknown; args?: unknown },
	): Promise<void>;
}

export interface RepoGraphDeps {
	buildWorkspaceGraph: (workspace: string, options?: any) => any;
	saveGraph: (workspace: string, graph: any) => Promise<void>;
	updateGraphForFiles: (
		workspace: string,
		files: string[],
		options?: any,
	) => Promise<any>;
}

/**
 * Supported source file extensions for graph updates.
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
 * Extract file path from tool args, checking common field names.
 *
 * @param args - Tool arguments object
 * @returns File path string or null if not found
 */
function extractFilePath(args: unknown): string | null {
	if (!args || typeof args !== 'object') return null;
	const a = args as Record<string, unknown>;
	const filePath = (a.file_path ?? a.path ?? a.filePath) as string | undefined;
	if (!filePath || typeof filePath !== 'string') return null;
	return filePath;
}

/**
 * Check if a file path has a supported source extension.
 *
 * @param filePath - File path to check
 * @returns True if the file has a supported extension
 */
function isSupportedSourceFile(filePath: string): boolean {
	const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
	return SUPPORTED_EXTENSIONS.includes(ext);
}

export function createRepoGraphBuilderHook(
	workspaceRoot: string,
	deps?: Partial<RepoGraphDeps>,
): RepoGraphBuilderHook {
	const _buildWorkspaceGraph = deps?.buildWorkspaceGraph ?? buildWorkspaceGraph;
	const _saveGraph = deps?.saveGraph ?? saveGraph;
	const _updateGraphForFiles = deps?.updateGraphForFiles ?? updateGraphForFiles;

	return {
		async init(): Promise<void> {
			try {
				const graph = _buildWorkspaceGraph(workspaceRoot);
				await _saveGraph(workspaceRoot, graph);
				console.log(
					`[repo-graph] Built graph: ${graph.metadata.nodeCount} nodes, ${graph.metadata.edgeCount} edges`,
				);
			} catch (error) {
				// Don't block startup on graph build failure
				const message = error instanceof Error ? error.message : String(error);
				if (message.includes('does not exist')) {
					return; // Workspace not found — skip silently
				}
				console.error(`[repo-graph] Failed to build graph: ${message}`);
			}
		},

		async toolAfter(
			input: { tool: string; sessionID: string; args?: unknown },
			_output: { output?: unknown; args?: unknown },
		): Promise<void> {
			// Only process write tools
			if (!(WRITE_TOOL_NAMES as readonly string[]).includes(input.tool)) {
				return;
			}

			// Extract file path from tool args
			const rawFilePath = extractFilePath(input.args);
			if (!rawFilePath) {
				return;
			}

			// Normalize path to prevent traversal via encoding tricks:
			// 1. Reject null bytes outright (null byte injection — never valid in a file path)
			// 2. Decode URL-encoding repeatedly until stable (handles %2e%2e, %252e, etc.)
			// 3. Normalize Unicode fullwidth dots/slashes to ASCII equivalents
			if (rawFilePath.includes('\0')) {
				return;
			}
			let filePath = rawFilePath;
			// Decode URL percent-encoding in a loop (max 3 passes) to handle double-encoding
			for (let i = 0; i < 3; i++) {
				try {
					const decoded = decodeURIComponent(filePath);
					if (decoded === filePath) break;
					filePath = decoded;
				} catch {
					break;
				}
			}
			// Normalize Unicode fullwidth characters used for dot/slash obfuscation
			filePath = filePath
				.replace(/\uff0e/g, '.') // fullwidth full stop → ASCII dot
				.replace(/\uff0f/g, '/') // fullwidth solidus → ASCII slash
				.replace(/\u2024/g, '.'); // one dot leader → ASCII dot

			// Only process supported source files
			if (!isSupportedSourceFile(filePath)) {
				return;
			}

			// Get absolute path if relative
			const absoluteFilePath = path.isAbsolute(filePath)
				? filePath
				: path.resolve(workspaceRoot, filePath);

			// Reject paths outside workspace boundary
			// Normalize to forward slashes for cross-platform comparison
			const normalizedAbsolute = absoluteFilePath.replace(/\\/g, '/');
			const normalizedWorkspace = workspaceRoot.replace(/\\/g, '/');
			if (
				!normalizedAbsolute.startsWith(`${normalizedWorkspace}/`) &&
				normalizedAbsolute !== normalizedWorkspace
			) {
				return;
			}

			try {
				await _updateGraphForFiles(workspaceRoot, [absoluteFilePath]);
				console.log(
					`[repo-graph] Incremental update for ${path.basename(filePath)}`,
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`[repo-graph] Incremental update failed: ${message}`);
			}
		},
	};
}

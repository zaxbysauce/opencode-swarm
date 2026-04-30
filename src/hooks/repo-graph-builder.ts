/**
 * Repo Graph Builder Hook
 *
 * Startup hook that builds or refreshes the repo dependency graph when a session starts.
 * Write-trigger hook that incrementally updates the graph when write tools are called.
 * Wrapped in try/catch — failures are logged but never block plugin initialization.
 *
 * Issue #704: the previous implementation called the synchronous
 * `buildWorkspaceGraph` from inside an `async init()`. JS executes async
 * function bodies synchronously up to the first `await`, so calling
 * `init()` blocked the entire event loop on the recursive workspace scan,
 * preventing the plugin host's `await server(...)` from ever resolving and
 * hanging the OpenCode Desktop loading screen indefinitely. The fix wires
 * the async builder, yields to the event loop before doing any work, and
 * exposes the init promise so `toolAfter` can serialize incremental
 * updates after the initial scan completes.
 */

import * as path from 'node:path';
import { WRITE_TOOL_NAMES } from '../config/constants';
import {
	buildWorkspaceGraphAsync,
	type RepoGraph,
	saveGraph,
	updateGraphForFiles,
} from '../tools/repo-graph';
import * as logger from '../utils/logger';
import { yieldToEventLoop } from '../utils/timeout';

export interface RepoGraphBuilderHook {
	init(): Promise<void>;
	toolAfter(
		input: { tool: string; sessionID: string; args?: unknown },
		output: { output?: unknown; args?: unknown },
	): Promise<void>;
}

export interface RepoGraphDeps {
	buildWorkspaceGraph: (
		workspace: string,
		options?: {
			maxFileSizeBytes?: number;
			maxFiles?: number;
			walkBudgetMs?: number;
			followSymlinks?: boolean;
		},
	) => Promise<RepoGraph>;
	saveGraph: (
		workspace: string,
		graph: RepoGraph,
		options?: { createAtomic?: boolean },
	) => Promise<void>;
	updateGraphForFiles: (
		workspace: string,
		files: string[],
		options?: { forceRebuild?: boolean },
	) => Promise<RepoGraph>;
}

const SUPPORTED_EXTENSIONS = [
	'.ts',
	'.tsx',
	'.js',
	'.jsx',
	'.mjs',
	'.cjs',
	'.py',
];

function extractFilePath(args: unknown): string | null {
	if (!args || typeof args !== 'object') return null;
	const a = args as Record<string, unknown>;
	const filePath = (a.file_path ?? a.path ?? a.filePath) as string | undefined;
	if (!filePath || typeof filePath !== 'string') return null;
	return filePath;
}

function isSupportedSourceFile(filePath: string): boolean {
	const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
	return SUPPORTED_EXTENSIONS.includes(ext);
}

export function createRepoGraphBuilderHook(
	workspaceRoot: string,
	deps?: Partial<RepoGraphDeps>,
): RepoGraphBuilderHook {
	const _buildWorkspaceGraph =
		deps?.buildWorkspaceGraph ?? buildWorkspaceGraphAsync;
	const _saveGraph = deps?.saveGraph ?? saveGraph;
	const _updateGraphForFiles = deps?.updateGraphForFiles ?? updateGraphForFiles;

	let initStarted = false;
	let initPromise: Promise<void> = Promise.resolve();

	async function doInit(): Promise<void> {
		// Yield once before any scan work so the caller's promise chain has
		// a chance to settle. Combined with the bounded async walker, this
		// guarantees the plugin host's `await server(...)` resolves promptly
		// even if the scan itself takes seconds.
		await yieldToEventLoop();
		try {
			const graph = await _buildWorkspaceGraph(workspaceRoot);
			await _saveGraph(workspaceRoot, graph);
			logger.log(
				`[repo-graph] Built graph: ${graph.metadata.nodeCount} nodes, ${graph.metadata.edgeCount} edges`,
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (
				message.includes('does not exist') ||
				message.includes('Refusing to scan')
			) {
				// Workspace not present, or the homedir-refusal guard fired.
				// Both are expected non-fatal outcomes — log once at info
				// level and keep the plugin functional.
				logger.log(`[repo-graph] Skipping scan: ${message}`);
				return;
			}
			logger.error(`[repo-graph] Failed to build graph: ${message}`);
		}
	}

	return {
		init(): Promise<void> {
			if (!initStarted) {
				initStarted = true;
				initPromise = doInit();
			}
			return initPromise;
		},

		async toolAfter(
			input: { tool: string; sessionID: string; args?: unknown },
			_output: { output?: unknown; args?: unknown },
		): Promise<void> {
			// Wait for the initial scan before applying incremental updates.
			// Without this gate, an early write tool could race the initial
			// scan and stomp the saved graph with a partial update. The
			// `.catch(()=>{})` swallows any init error so a failed initial
			// scan does not poison every subsequent tool call.
			await initPromise.catch(() => {
				/* init failure is already logged */
			});

			if (!(WRITE_TOOL_NAMES as readonly string[]).includes(input.tool)) {
				return;
			}
			const rawFilePath = extractFilePath(input.args);
			if (!rawFilePath) return;
			if (rawFilePath.includes('\0')) return;

			let filePath = rawFilePath;
			for (let i = 0; i < 3; i++) {
				try {
					const decoded = decodeURIComponent(filePath);
					if (decoded === filePath) break;
					filePath = decoded;
				} catch {
					break;
				}
			}
			filePath = filePath
				.replace(/．/g, '.')
				.replace(/／/g, '/')
				.replace(/․/g, '.');

			if (!isSupportedSourceFile(filePath)) return;

			const absoluteFilePath = path.isAbsolute(filePath)
				? filePath
				: path.resolve(workspaceRoot, filePath);

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
				logger.log(
					`[repo-graph] Incremental update for ${path.basename(filePath)}`,
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				logger.error(`[repo-graph] Incremental update failed: ${message}`);
			}
		},
	};
}

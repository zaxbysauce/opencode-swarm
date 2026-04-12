import * as fs from 'node:fs';
import * as path from 'node:path';
import pLimit from 'p-limit';
import {
	extractImports,
	getLanguageFromExtension,
	SOURCE_EXTENSIONS,
} from './import-extractor';
import { extractExportedSymbols } from './symbol-extractor';
import {
	type FileNode,
	REPO_GRAPH_SCHEMA_VERSION,
	type RepoGraph,
} from './types';

/**
 * Build a full repository graph by walking the workspace, parsing source files
 * for imports and exported symbols, and assembling them into a `RepoGraph`.
 *
 * Performance:
 *   - File scanning skips well-known build/dep directories (node_modules, dist, .git, etc.)
 *   - Per-file parsing runs with a concurrency limit to avoid overwhelming I/O.
 *   - Files larger than `MAX_FILE_SIZE_BYTES` are skipped (would also fail downstream extractors).
 *
 * Targets ~5s for a 50k LOC repo (~500 files) on commodity hardware.
 */

export interface BuildOptions {
	/** Optional cap on file count to bound runtime on huge repos. */
	maxFiles?: number;
	/** Concurrency for per-file parsing. Defaults to 16. */
	concurrency?: number;
	/** Additional directory names to skip (merged with defaults). */
	skipDirs?: string[];
}

const DEFAULT_SKIP_DIRS = new Set([
	'node_modules',
	'.git',
	'.svn',
	'.hg',
	'dist',
	'build',
	'out',
	'.next',
	'.nuxt',
	'.cache',
	'coverage',
	'.swarm',
	'.opencode',
	'vendor',
	'.venv',
	'venv',
	'__pycache__',
	'target', // rust
]);

const MAX_FILE_SIZE_BYTES = 1024 * 1024; // 1MB

/**
 * Hard upper bound on file count if the caller does not supply one. Protects
 * against unbounded memory growth on extremely large monorepos. Callers can
 * pass an explicit `maxFiles` (including a larger one) to override.
 */
export const DEFAULT_MAX_FILES = 10_000;

const SOURCE_EXT_SET = new Set<string>(SOURCE_EXTENSIONS);

/**
 * Walk the workspace and return absolute paths of all supported source files.
 * Cross-platform: emits absolute paths using the host's path separator.
 */
export function findSourceFiles(
	workspaceRoot: string,
	skipDirs: Set<string> = DEFAULT_SKIP_DIRS,
): string[] {
	const out: string[] = [];
	const stack: string[] = [workspaceRoot];
	while (stack.length > 0) {
		const dir = stack.pop()!;
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		entries.sort((a, b) => a.name.localeCompare(b.name));
		for (const entry of entries) {
			if (entry.name.startsWith('.') && entry.name !== '.gitignore') {
				if (skipDirs.has(entry.name)) continue;
				// allow other dotfiles for source scanning? skip dot dirs to avoid huge scans
				if (entry.isDirectory()) continue;
			}
			if (entry.isDirectory()) {
				if (skipDirs.has(entry.name)) continue;
				stack.push(path.join(dir, entry.name));
				continue;
			}
			if (!entry.isFile()) continue;
			const ext = path.extname(entry.name).toLowerCase();
			if (!SOURCE_EXT_SET.has(ext)) continue;
			out.push(path.join(dir, entry.name));
		}
	}
	return out;
}

/**
 * Build the repo graph from scratch.
 */
export async function buildRepoGraph(
	workspaceRoot: string,
	options: BuildOptions = {},
): Promise<RepoGraph> {
	const skipDirs = options.skipDirs
		? new Set([...DEFAULT_SKIP_DIRS, ...options.skipDirs])
		: DEFAULT_SKIP_DIRS;

	let files = findSourceFiles(workspaceRoot, skipDirs);
	const cap =
		typeof options.maxFiles === 'number' && options.maxFiles > 0
			? options.maxFiles
			: DEFAULT_MAX_FILES;
	if (files.length > cap) {
		files = files.slice(0, cap);
	}

	const concurrency = options.concurrency ?? 16;
	const limit = pLimit(concurrency);

	const fileNodes = await Promise.all(
		files.map((absPath) => limit(() => processFile(absPath, workspaceRoot))),
	);

	const result: Record<string, FileNode> = {};
	for (const node of fileNodes) {
		if (node) result[node.path] = node;
	}

	return {
		version: REPO_GRAPH_SCHEMA_VERSION,
		buildTimestamp: new Date().toISOString(),
		rootDir: workspaceRoot,
		files: result,
	};
}

/**
 * Process a single file into a FileNode. Returns null if the file cannot be processed.
 */
export async function processFile(
	absoluteFilePath: string,
	workspaceRoot: string,
): Promise<FileNode | null> {
	const ext = path.extname(absoluteFilePath).toLowerCase();
	const language = getLanguageFromExtension(ext);
	if (!language) return null;

	let stats: fs.Stats;
	try {
		stats = fs.statSync(absoluteFilePath);
	} catch {
		return null;
	}
	if (!stats.isFile()) return null;
	if (stats.size > MAX_FILE_SIZE_BYTES) return null;

	let content: string;
	try {
		content = fs.readFileSync(absoluteFilePath, 'utf-8');
	} catch {
		return null;
	}

	const relPath = path
		.relative(workspaceRoot, absoluteFilePath)
		.replace(/\\/g, '/');

	const imports = extractImports({
		absoluteFilePath,
		workspaceRoot,
		content,
	});

	const exportsList = extractExportedSymbols(relPath, workspaceRoot);

	return {
		path: relPath,
		language,
		exports: exportsList,
		imports,
		mtimeMs: stats.mtimeMs,
	};
}

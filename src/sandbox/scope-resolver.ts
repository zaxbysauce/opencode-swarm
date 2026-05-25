import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Result of resolving scope paths for sandbox enforcement.
 */
export interface ResolvedScope {
	/** Absolute paths that the sandbox will allow writes to */
	paths: string[];
	/** Any warnings about paths that were modified or skipped */
	warnings: string[];
	/** Paths that were rejected (e.g., non-existent, traversal attempts) */
	rejected: { path: string; reason: string }[];
}

/**
 * Resolve scope paths for sandbox enforcement.
 *
 * Converts relative scope paths to absolute, validates against traversal attacks,
 * checks existence, deduplicates, and normalizes path separators.
 *
 * @param rawPaths - Paths from the task scope declaration (may be relative or absolute)
 * @param projectRoot - The project root directory (for resolving relative paths)
 * @returns ResolvedScope with absolute paths, warnings, and rejections
 */
export function resolveScopePaths(
	rawPaths: string[],
	projectRoot: string,
): ResolvedScope {
	const warnings: string[] = [];
	const rejected: { path: string; reason: string }[] = [];
	const resolvedSet = new Set<string>();

	// Validate projectRoot
	if (!projectRoot || projectRoot.trim() === '') {
		rejected.push({ path: projectRoot, reason: 'projectRoot is empty' });
		return { paths: [], warnings, rejected };
	}

	// Check if projectRoot is relative
	if (!path.isAbsolute(projectRoot)) {
		rejected.push({
			path: projectRoot,
			reason: 'projectRoot must be an absolute path',
		});
		return { paths: [], warnings, rejected };
	}

	const normalizedRoot = path.normalize(projectRoot);

	for (const rawPath of rawPaths) {
		if (!rawPath || rawPath.trim() === '') {
			warnings.push('Skipping empty path in rawPaths');
			continue;
		}

		let resolvedPath: string;

		// Resolve relative paths against projectRoot
		if (path.isAbsolute(rawPath)) {
			resolvedPath = path.normalize(rawPath);
		} else {
			resolvedPath = path.normalize(path.resolve(normalizedRoot, rawPath));
		}

		// Resolve symlinks before traversal check to catch symlink-based bypasses.
		// If the path doesn't exist yet (e.g., newly created files), fall back to
		// the logical path for the traversal check.
		let checkPath = resolvedPath;
		try {
			checkPath = fs.realpathSync(resolvedPath);
		} catch {
			// Path doesn't exist yet — use the logical resolved path for traversal check
		}

		// Resolve symlinks in projectRoot too for defense-in-depth
		let realRoot = normalizedRoot;
		try {
			realRoot = fs.realpathSync(normalizedRoot);
		} catch {
			// Use normalized root if realpath fails
		}

		// Path traversal detection: verify resolved path still starts with projectRoot
		const relativeToRoot = path.relative(realRoot, checkPath);
		if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
			rejected.push({
				path: rawPath,
				reason: `Path traversal attempt detected: resolves to ${checkPath} which escapes projectRoot`,
			});
			continue;
		}

		// Existence validation: warn but do not reject for non-existent paths
		// (scope may include files that don't exist yet - coder will create them)
		if (!fs.existsSync(checkPath)) {
			warnings.push(`Path does not exist (will be created): ${checkPath}`);
		}

		resolvedSet.add(checkPath);
	}

	// If all paths were rejected, return error state
	if (resolvedSet.size === 0 && rejected.length > 0) {
		warnings.push('All paths were rejected; scope is empty');
	}

	const paths = Array.from(resolvedSet);

	return { paths, warnings, rejected };
}

/**
 * DI seam for testability. Contains all test-mocked exports.
 * Internal calls should use _internals.fn() instead of fn() directly.
 */
export const _internals: {
	resolveScopePaths: typeof resolveScopePaths;
} = {
	resolveScopePaths,
} as const;

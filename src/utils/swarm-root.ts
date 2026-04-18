import * as fs from 'node:fs';
import * as path from 'node:path';
import { warn } from './logger';

/**
 * Resolve the swarm project root directory for any .swarm/ writer.
 *
 * Guarantees that .swarm/ writes land at the actual project root rather than
 * wherever process.cwd() happens to point. This is the fix for issue #528,
 * a regression of the same root cause identified in PR #352 / v6.41.3.
 *
 * Priority chain:
 *  1. explicitOverride — caller-supplied path (e.g. working_directory param); used as-is if non-empty.
 *  2. ctxDirectory — OpenCode plugin context directory; used if non-empty.
 *  3. Marker walk-up — walks up from process.cwd() looking for .git/ or package.json.
 *     Succeeds silently for the normal case where process.cwd() IS the project root.
 *     Logs a warning when it has to walk up (indicates ctx.directory was missing).
 *  4. process.cwd() fallback — used only when no marker is found; emits a loud warning.
 *     Preserves backward-compat for bare CLI invocations outside a project tree.
 *
 * @param ctxDirectory - ctx.directory from the OpenCode plugin context (may be undefined)
 * @param explicitOverride - caller-provided override path (e.g. working_directory arg)
 */
export function resolveSwarmRoot(
	ctxDirectory?: string | null,
	explicitOverride?: string | null,
): string {
	// 1. Explicit caller override
	if (explicitOverride != null && explicitOverride !== '') {
		return path.resolve(explicitOverride);
	}

	// 2. Plugin context directory
	if (ctxDirectory != null && ctxDirectory !== '') {
		return path.resolve(ctxDirectory);
	}

	// 3. Walk up from process.cwd() looking for a project-root marker
	const cwd = process.cwd();
	const found = findProjectRoot(cwd);
	if (found !== null) {
		if (found !== cwd) {
			warn(
				`[swarm-root] ctx.directory missing; recovered project root via marker: ${found}`,
			);
		}
		return found;
	}

	// 4. No marker found — fall back to cwd with a loud warning
	warn(
		'[swarm-root] ctx.directory missing and no .git/package.json marker found; ' +
			`using process.cwd() (${cwd}) which may scatter .swarm/ — see issue #528`,
	);
	return cwd;
}

/**
 * Walk up the directory tree from startDir looking for .git/ or package.json.
 * Returns the first directory that contains either marker, or null if none found.
 */
function findProjectRoot(startDir: string): string | null {
	let dir = path.resolve(startDir);
	const { root } = path.parse(dir);

	while (true) {
		if (
			fs.existsSync(path.join(dir, '.git')) ||
			fs.existsSync(path.join(dir, 'package.json'))
		) {
			return dir;
		}
		const parent = path.dirname(dir);
		if (parent === dir || parent === root) break;
		dir = parent;
	}

	return null;
}

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Module-level flag so the warning fires at most once per process.
 * Exported for test reset purposes only — do not use in production code.
 */
export let _gitignoreWarningEmitted = false;

/**
 * Reset the deduplication flag. Exposed for test isolation only.
 */
export function resetGitignoreWarningState(): void {
	_gitignoreWarningEmitted = false;
}

/**
 * Walk up from `startDir` until a directory containing `.git/` is found.
 * Returns the git root path, or null if none is found before reaching the
 * filesystem root.
 */
function findGitRoot(startDir: string): string | null {
	let current = startDir;
	while (true) {
		try {
			const gitPath = path.join(current, '.git');
			const stat = fs.statSync(gitPath);
			if (stat.isDirectory()) {
				return current;
			}
		} catch {
			// .git doesn't exist here — keep walking up
		}

		const parent = path.dirname(current);
		if (parent === current) {
			// Reached filesystem root
			return null;
		}
		current = parent;
	}
}

/**
 * Return true if any line in the file content is `.swarm` or `.swarm/`
 * (exact match, ignoring leading/trailing whitespace, ignoring comment lines).
 */
function fileCoversSwarm(content: string): boolean {
	for (const rawLine of content.split('\n')) {
		const line = rawLine.trim();
		if (line.startsWith('#') || line.length === 0) continue;
		if (line === '.swarm' || line === '.swarm/') return true;
	}
	return false;
}

/**
 * Reads a file safely, returning its content or null on any error.
 */
function readFileSafe(filePath: string): string | null {
	try {
		return fs.readFileSync(filePath, 'utf8');
	} catch {
		return null;
	}
}

/**
 * Checks whether `.swarm/` is covered by `.gitignore` or `.git/info/exclude`
 * in the git repo rooted at or above `directory`. If not covered, emits a
 * single `console.warn` (unless `quiet` is true). Fires at most once per process.
 *
 * Never throws — any file-system error silently skips the check.
 */
export function warnIfSwarmNotGitignored(
	directory: string,
	quiet = false,
): void {
	if (_gitignoreWarningEmitted) return;

	try {
		const gitRoot = findGitRoot(directory);
		if (!gitRoot) return; // Not a git repo — skip

		const gitignoreContent = readFileSafe(path.join(gitRoot, '.gitignore'));
		if (gitignoreContent !== null && fileCoversSwarm(gitignoreContent)) {
			_gitignoreWarningEmitted = true;
			return;
		}

		const excludeContent = readFileSafe(
			path.join(gitRoot, '.git', 'info', 'exclude'),
		);
		if (excludeContent !== null && fileCoversSwarm(excludeContent)) {
			_gitignoreWarningEmitted = true;
			return;
		}

		// Not covered by either source — emit warning (suppressed when quiet:true)
		_gitignoreWarningEmitted = true;
		if (!quiet) {
			console.warn(
				'[opencode-swarm] WARNING: .swarm/ is not in your .gitignore. Shell audit logs may contain API keys. Add ".swarm/" to your .gitignore to prevent accidental commits.',
			);
		}
	} catch {
		// Silently swallow any unexpected error — never block plugin init
	}
}

import * as fs from 'node:fs';
import * as path from 'node:path';
import { bunSpawn } from './bun-compat';

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
 * Module-level flag for ensureSwarmGitExcluded deduplication.
 * Exported for test reset purposes only.
 */
export let _swarmGitExcludedChecked = false;

/**
 * Reset the ensureSwarmGitExcluded deduplication flag. Exposed for test isolation only.
 */
export function resetSwarmGitExcludedState(): void {
	_swarmGitExcludedChecked = false;
}

/**
 * Walk up from `startDir` until a directory containing `.git/` is found.
 * Returns the git root path, or null if none is found before reaching the
 * filesystem root.
 *
 * NOTE: This function only recognises `.git` as a directory. It does NOT
 * handle Git worktrees or submodules where `.git` is a file. Use
 * `ensureSwarmGitExcluded` (which uses `git rev-parse`) for worktree safety.
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
 *
 * @deprecated Use `ensureSwarmGitExcluded` instead. This function only recognises
 * `.git` as a directory and does NOT handle Git worktrees or submodules.
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

export interface EnsureSwarmGitExcludedOptions {
	quiet?: boolean;
}

/**
 * Automatically protect `.swarm/` from Git pollution before any `.swarm/` write.
 *
 * Uses git CLI (not filesystem walks) so it correctly handles Git worktrees
 * and submodules where `.git` is a file rather than a directory.
 *
 * Steps:
 * 1. Resolve git root via `git rev-parse --show-toplevel`
 * 2. Resolve local exclude path via `git rev-parse --git-path info/exclude`
 * 3. Check if `.swarm/` is already ignored via `git check-ignore -q`
 * 4. If not ignored: append `.swarm/` to the local exclude file (idempotent)
 * 5. Detect tracked `.swarm/` files via `git ls-files -- .swarm`
 * 6. If tracked: emit an unsuppressed remediation warning
 *
 * Never throws. Fires at most once per process.
 *
 * quiet option: only suppresses cosmetic logs. The exclude write and tracked-file
 * warning are never suppressed regardless of quiet mode.
 */
export async function ensureSwarmGitExcluded(
	directory: string,
	options: EnsureSwarmGitExcludedOptions = {},
): Promise<void> {
	if (_swarmGitExcludedChecked) return;
	_swarmGitExcludedChecked = true;

	const { quiet = false } = options;

	try {
		// Step 1: Get git root using CLI (handles worktrees/submodules)
		const gitRootProc = bunSpawn(
			['git', '-C', directory, 'rev-parse', '--show-toplevel'],
			{ stdout: 'pipe', stderr: 'pipe' },
		);
		const [gitRootExitCode, gitRootOutput] = await Promise.all([
			gitRootProc.exited,
			gitRootProc.stdout.text(),
		]);
		if (gitRootExitCode !== 0) return; // Not a git repo

		const gitRoot = gitRootOutput.trim();
		if (!gitRoot) return;

		// Step 2: Get the correct exclude path (resolves through worktree .git files)
		const excludePathProc = bunSpawn(
			['git', '-C', directory, 'rev-parse', '--git-path', 'info/exclude'],
			{ stdout: 'pipe', stderr: 'pipe' },
		);
		const [excludePathExitCode, excludePathRaw] = await Promise.all([
			excludePathProc.exited,
			excludePathProc.stdout.text(),
		]);
		if (excludePathExitCode !== 0) return;

		const excludeRelPath = excludePathRaw.trim();
		if (!excludeRelPath) return;

		// Resolve to absolute — `git -C <directory> rev-parse --git-path` returns a path
		// relative to the -C argument (directory), not relative to the git root.
		// From a subdirectory it may be "../../.git/info/exclude"; from the root ".git/info/exclude".
		// Worktrees return an absolute path. path.join() normalizes ".." components in all cases.
		const excludePath = path.isAbsolute(excludeRelPath)
			? excludeRelPath
			: path.join(directory, excludeRelPath);

		// Step 3: Check if .swarm/ is already ignored by any source
		// (covers .gitignore, global gitignore, and info/exclude)
		const checkIgnoreProc = bunSpawn(
			['git', '-C', directory, 'check-ignore', '-q', '.swarm/.gitkeep'],
			{ stdout: 'pipe', stderr: 'pipe' },
		);
		const checkIgnoreExitCode = await checkIgnoreProc.exited;

		if (checkIgnoreExitCode !== 0) {
			// .swarm/ is NOT ignored — write to local exclude file
			try {
				fs.mkdirSync(path.dirname(excludePath), { recursive: true });

				let existing = '';
				try {
					existing = fs.readFileSync(excludePath, 'utf8');
				} catch {
					// File doesn't exist yet — fine
				}

				// Only append if not already covered (handles concurrent-start duplicates
				// being harmless — git treats duplicate patterns identically)
				if (!fileCoversSwarm(existing)) {
					fs.appendFileSync(
						excludePath,
						'\n# opencode-swarm local runtime state\n.swarm/\n',
						'utf8',
					);
					if (!quiet) {
						console.warn(
							'[opencode-swarm] Added .swarm/ to .git/info/exclude to prevent runtime state from appearing in git status.',
						);
					}
				}
			} catch {
				// Failed to write exclude — non-fatal (read-only repo, permissions, etc.)
			}
		}

		// Step 4: Detect already-tracked .swarm/ files
		// NOTE: ignore rules have no effect on tracked files; git rm --cached is required.
		const trackedProc = bunSpawn(
			['git', '-C', directory, 'ls-files', '--', '.swarm'],
			{ stdout: 'pipe', stderr: 'pipe' },
		);
		const [trackedExitCode, trackedOutput] = await Promise.all([
			trackedProc.exited,
			trackedProc.stdout.text(),
		]);

		if (trackedExitCode === 0 && trackedOutput.trim().length > 0) {
			// INTENTIONALLY NOT gated behind quiet — hygiene warning must always be visible
			console.warn(
				'[opencode-swarm] WARNING: .swarm/ files are tracked by Git.\n' +
					'.swarm/ contains local runtime state and may contain sensitive session data.\n' +
					'Ignoring will not affect already-tracked files. To stop tracking them, run:\n' +
					'  git rm -r --cached .swarm\n' +
					'  echo ".swarm/" >> .gitignore\n' +
					'  git commit -m "Stop tracking opencode-swarm runtime state"',
			);
		}
	} catch {
		// Never block plugin init
	}
}

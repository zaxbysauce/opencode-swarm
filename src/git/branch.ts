import * as child_process from 'node:child_process';
import { warn } from '../utils/logger.js';

const GIT_TIMEOUT_MS = 30_000;

/**
 * Execute git command safely
 */
function gitExec(args: string[], cwd: string): string {
	const result = child_process.spawnSync('git', args, {
		cwd,
		encoding: 'utf-8',
		timeout: GIT_TIMEOUT_MS,
		stdio: ['pipe', 'pipe', 'pipe'],
	});
	if (result.status !== 0) {
		throw new Error(result.stderr || `git exited with ${result.status}`);
	}
	return result.stdout;
}

/**
 * Check if we're in a git repository
 */
export function isGitRepo(cwd: string): boolean {
	try {
		gitExec(['rev-parse', '--git-dir'], cwd);
		return true;
	} catch {
		return false;
	}
}

/**
 * Get current branch name
 */
export function getCurrentBranch(cwd: string): string {
	const output = gitExec(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
	return output.trim();
}

/**
 * Create a new branch
 * @param cwd - Working directory
 * @param branchName - Name of the branch to create
 * @param remote - Remote name (default: 'origin')
 */
export function createBranch(
	cwd: string,
	branchName: string,
	remote: string = 'origin',
): void {
	// Check if branch already exists
	try {
		gitExec(['rev-parse', '--verify', `${remote}/${branchName}`], cwd);
		// Branch exists remotely, check if we have it locally
		try {
			gitExec(['rev-parse', '--verify', branchName], cwd);
			// Already exists locally, just checkout
			gitExec(['checkout', branchName], cwd);
		} catch {
			// Checkout from remote
			gitExec(['checkout', '-b', branchName, `${remote}/${branchName}`], cwd);
		}
	} catch {
		// Branch doesn't exist, create new
		gitExec(['checkout', '-b', branchName], cwd);
	}
}

/**
 * Get list of changed files compared to main/master
 * @param cwd - Working directory
 * @param branch - Base branch to compare against (optional, auto-detected if not provided)
 * @returns Array of changed file paths, or empty array if error occurs
 */
export function getChangedFiles(cwd: string, branch?: string): string[] {
	const baseBranch = branch || getDefaultBaseBranch(cwd);

	try {
		const output = gitExec(['diff', '--name-only', baseBranch, 'HEAD'], cwd);
		return output.trim().split('\n').filter(Boolean);
	} catch (err) {
		warn(
			'Failed to get changed files',
			err instanceof Error ? err.message : String(err),
		);
		return [];
	}
}

/**
 * Get default base branch (main or master)
 */
export function getDefaultBaseBranch(cwd: string): string {
	try {
		// Check if main exists
		gitExec(['rev-parse', '--verify', 'origin/main'], cwd);
		return 'origin/main';
	} catch {
		try {
			gitExec(['rev-parse', '--verify', 'origin/master'], cwd);
			return 'origin/master';
		} catch {
			return 'origin/main'; // fallback
		}
	}
}

/**
 * Stage specific files for commit
 * @param cwd - Working directory
 * @param files - Array of file paths to stage (must not be empty)
 * @throws Error if files array is empty
 */
export function stageFiles(cwd: string, files: string[]): void {
	if (files.length === 0) {
		throw new Error(
			'files array cannot be empty. Use stageAll() to stage all files.',
		);
	}
	gitExec(['add', ...files], cwd);
}

/**
 * Stage all files in the working directory
 * @param cwd - Working directory
 */
export function stageAll(cwd: string): void {
	gitExec(['add', '.'], cwd);
}

/**
 * Commit changes
 */
export function commitChanges(cwd: string, message: string): void {
	gitExec(['commit', '-m', message], cwd);
}

/**
 * Get current commit SHA
 */
export function getCurrentSha(cwd: string): string {
	return gitExec(['rev-parse', 'HEAD'], cwd).trim();
}

/**
 * Check if there are uncommitted changes
 */
export function hasUncommittedChanges(cwd: string): boolean {
	const status = gitExec(['status', '--porcelain'], cwd);
	return status.trim().length > 0;
}

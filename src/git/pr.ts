import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { warn } from '../utils/logger.js';
import {
	commitChanges,
	getChangedFiles,
	getCurrentBranch,
	getCurrentSha,
	isGitRepo,
	stageAll,
	stageFiles,
} from './branch.js';

const GIT_TIMEOUT_MS = 30_000;

/**
 * Sanitize input string to prevent command injection
 * Removes or escapes shell metacharacters
 */
export function sanitizeInput(input: string): string {
	// Remove newlines and control characters that could be exploited
	// Also escape common shell metacharacters
	return input
		.replace(new RegExp('[\\x00-\\x1F\\x7F]', 'g'), '') // Remove control characters
		.replace(/[`$"\\]/g, '\\$&') // Escape shell metacharacters
		.replace(/\n+/g, ' ') // Replace newlines with spaces
		.trim();
}

/**
 * Execute gh CLI command
 */
function ghExec(args: string[], cwd: string): string {
	const result = spawnSync('gh', args, {
		cwd,
		encoding: 'utf-8',
		timeout: GIT_TIMEOUT_MS,
		stdio: ['pipe', 'pipe', 'pipe'],
	});
	if (result.status !== 0) {
		throw new Error(result.stderr || `gh exited with ${result.status}`);
	}
	return result.stdout;
}

/**
 * Check if gh CLI is available
 */
export function isGhAvailable(cwd: string): boolean {
	try {
		ghExec(['--version'], cwd);
		return true;
	} catch {
		return false;
	}
}

/**
 * Check if authenticated with gh
 */
export function isAuthenticated(cwd: string): boolean {
	try {
		ghExec(['auth', 'status'], cwd);
		return true;
	} catch {
		return false;
	}
}

/**
 * Create evidence.md summary
 */
export function generateEvidenceMd(cwd: string): string {
	const branch = getCurrentBranch(cwd);
	const sha = getCurrentSha(cwd);
	const files = getChangedFiles(cwd);

	let evidence = `# Evidence Summary\n\n`;
	evidence += `**Branch:** ${branch}\n`;
	evidence += `**SHA:** ${sha}\n`;
	evidence += `**Changed Files:** ${files.length}\n\n`;

	if (files.length > 0) {
		evidence += `## Changed Files\n\n`;
		for (const file of files) {
			evidence += `- ${file}\n`;
		}
	}

	// Add task completion info if available
	try {
		const planPath = path.join(cwd, '.swarm', 'plan.json');
		if (fs.existsSync(planPath)) {
			const plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
			evidence += `\n## Tasks\n\n`;
			for (const phase of plan.phases || []) {
				for (const task of phase.tasks || []) {
					const status = task.status || 'unknown';
					evidence += `- ${task.id}: ${status}\n`;
				}
			}
		}
	} catch (err) {
		warn('Failed to read plan.json for evidence', err);
	}

	return evidence;
}

/**
 * Create a pull request
 */
export async function createPullRequest(
	cwd: string,
	title: string,
	body?: string,
	baseBranch: string = 'main',
): Promise<{ url: string; number: number }> {
	const branch = sanitizeInput(getCurrentBranch(cwd));
	const baseBranchSanitized = sanitizeInput(baseBranch || 'main');

	// Sanitize user-provided inputs to prevent command injection
	const sanitizedTitle = sanitizeInput(title);
	const sanitizedBody = sanitizeInput(body || '');

	// Generate body from evidence.md if not provided
	const prBody = body ? sanitizedBody : generateEvidenceMd(cwd);

	// Create PR using gh CLI
	const output = ghExec(
		[
			'pr',
			'create',
			'--title',
			sanitizedTitle,
			'--body',
			prBody,
			'--base',
			baseBranchSanitized,
			'--head',
			branch,
		],
		cwd,
	);

	// Parse PR URL from output
	const urlMatch = output.match(
		/https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/,
	);
	const numberMatch = output.match(/#(\d+)/);

	return {
		url: urlMatch ? urlMatch[0] : output.trim(),
		number: numberMatch ? parseInt(numberMatch[1], 10) : 0,
	};
}

/**
 * Commit and push current changes
 */
export function commitAndPush(cwd: string, message: string): void {
	// Stage all changes
	stageAll(cwd);

	// Check if there are changes to commit
	const status = spawnSync('git', ['status', '--porcelain'], {
		cwd,
		encoding: 'utf-8',
	}).stdout;

	if (!status.trim()) {
		throw new Error('No changes to commit');
	}

	// Commit
	commitChanges(cwd, message);

	// Push
	const branch = getCurrentBranch(cwd);
	const pushResult = spawnSync('git', ['push', '-u', 'origin', branch], {
		cwd,
		encoding: 'utf-8',
		timeout: GIT_TIMEOUT_MS,
		stdio: ['pipe', 'pipe', 'pipe'],
	});
	if (pushResult.status !== 0) {
		throw new Error(pushResult.stderr || 'Push failed');
	}
}

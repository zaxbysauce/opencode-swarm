import { createBranch, isGitRepo } from './branch.js';
import {
	commitAndPush,
	createPullRequest,
	generateEvidenceMd,
	isAuthenticated,
	isGhAvailable,
} from './pr.js';

export interface PRWorkflowOptions {
	title: string;
	body?: string;
	branch?: string;
}

export interface PRWorkflowResult {
	success: boolean;
	url?: string;
	number?: number;
	error?: string;
}

/**
 * Full PR workflow: create branch → commit → push → create PR
 */
export async function runPRWorkflow(
	cwd: string,
	options: PRWorkflowOptions,
): Promise<PRWorkflowResult> {
	// Check prerequisites
	if (!isGitRepo(cwd)) {
		return { success: false, error: 'Not a git repository' };
	}

	if (!isGhAvailable(cwd)) {
		return { success: false, error: 'GitHub CLI (gh) not available' };
	}

	if (!isAuthenticated(cwd)) {
		return {
			success: false,
			error: 'Not authenticated with GitHub. Run: gh auth login',
		};
	}

	// Create branch if specified
	if (options.branch) {
		createBranch(cwd, options.branch);
	}

	// Commit changes
	try {
		commitAndPush(cwd, options.title);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (message.includes('No changes to commit')) {
			// No changes is OK - just create PR with current state
		} else {
			return { success: false, error: `Commit failed: ${message}` };
		}
	}

	// Create PR
	try {
		const pr = await createPullRequest(cwd, options.title, options.body);
		return {
			success: true,
			url: pr.url,
			number: pr.number,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { success: false, error: `PR creation failed: ${message}` };
	}
}

/**
 * Generate evidence summary without creating PR
 */
export function prepareEvidence(cwd: string): string {
	return generateEvidenceMd(cwd);
}

export { isGhAvailable, isAuthenticated, isGitRepo, createBranch };

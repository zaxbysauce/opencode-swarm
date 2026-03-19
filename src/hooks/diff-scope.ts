/**
 * Diff scope validator — compares files changed in git against the declared scope
 * for a given task in plan.json. Returns a warning string if undeclared files
 * were modified, or null if in-scope, no scope declared, or git unavailable.
 * Never throws.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Read the declared file scope for a task from .swarm/plan.json.
 * Returns the files array or null if not found / no scope declared.
 */
function getDeclaredScope(taskId: string, directory: string): string[] | null {
	try {
		const planPath = path.join(directory, '.swarm', 'plan.json');
		if (!fs.existsSync(planPath)) return null;

		const raw = fs.readFileSync(planPath, 'utf-8');
		const plan = JSON.parse(raw) as {
			phases?: Array<{
				tasks?: Array<{
					id?: string;
					files_touched?: string | string[];
				}>;
			}>;
		};

		for (const phase of plan.phases ?? []) {
			for (const task of phase.tasks ?? []) {
				if (task.id !== taskId) continue;
				const ft = task.files_touched;
				if (Array.isArray(ft) && ft.length > 0) {
					return ft;
				}
				if (typeof ft === 'string' && ft.length > 0) {
					return [ft];
				}
				return null; // Task found but no scope declared
			}
		}
		return null; // Task not found
	} catch {
		return null;
	}
}

/**
 * Run git diff --name-only to get files changed since HEAD~1.
 * Returns array of changed file paths, or null if git is unavailable.
 */
async function getChangedFiles(directory: string): Promise<string[] | null> {
	try {
		// Try HEAD~1 first (normal case with commits)
		const proc = Bun.spawn(['git', 'diff', '--name-only', 'HEAD~1'], {
			cwd: directory,
			stdout: 'pipe',
			stderr: 'pipe',
		});

		const [exitCode, stdout] = await Promise.all([
			proc.exited,
			new Response(proc.stdout).text(),
		]);

		if (exitCode === 0) {
			return stdout
				.trim()
				.split('\n')
				.map((f) => f.trim())
				.filter((f) => f.length > 0);
		}

		// Fallback: uncommitted changes vs HEAD
		const proc2 = Bun.spawn(['git', 'diff', '--name-only', 'HEAD'], {
			cwd: directory,
			stdout: 'pipe',
			stderr: 'pipe',
		});

		const [exitCode2, stdout2] = await Promise.all([
			proc2.exited,
			new Response(proc2.stdout).text(),
		]);

		if (exitCode2 === 0) {
			return stdout2
				.trim()
				.split('\n')
				.map((f) => f.trim())
				.filter((f) => f.length > 0);
		}

		return null;
	} catch {
		return null; // git not available
	}
}

/**
 * Validate that git-changed files match the declared scope for a task.
 * Returns a warning string if undeclared files were modified, null otherwise.
 * Never throws.
 */
export async function validateDiffScope(
	taskId: string,
	directory: string,
): Promise<string | null> {
	try {
		const declaredScope = getDeclaredScope(taskId, directory);
		if (!declaredScope) return null; // No scope declared — skip

		const changedFiles = await getChangedFiles(directory);
		if (!changedFiles) return null; // git unavailable — skip

		// Normalise paths for comparison (forward slashes, no leading ./)
		const normalise = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '');

		const normScope = new Set(declaredScope.map(normalise));
		const undeclared = changedFiles
			.map(normalise)
			.filter((f) => !normScope.has(f));

		if (undeclared.length === 0) return null;

		const scopeStr = declaredScope.join(', ');
		const undeclaredStr = undeclared.slice(0, 5).join(', ');
		const extra =
			undeclared.length > 5 ? ` (+${undeclared.length - 5} more)` : '';

		return `SCOPE WARNING: Task ${taskId} declared scope [${scopeStr}] but also modified [${undeclaredStr}${extra}]. Reviewer should verify these changes are intentional.`;
	} catch {
		return null;
	}
}

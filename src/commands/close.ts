import { execFileSync, execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { KnowledgeConfigSchema } from '../config/schema';
import { archiveEvidence } from '../evidence/manager';
import { curateAndStoreSwarm } from '../hooks/knowledge-curator';
import { validateSwarmPath } from '../hooks/utils';
import { writeCheckpoint } from '../plan/checkpoint';
import { flushPendingSnapshot } from '../session/snapshot-writer';
import { swarmState } from '../state';
import { executeWriteRetro } from '../tools/write-retro';

interface PlanPhase {
	id: number;
	name: string;
	status: string;
	tasks: Array<{
		id: string;
		status: string;
	}>;
}

interface PlanData {
	title: string;
	phases: PlanPhase[];
}

/**
 * Handles /swarm close command - closes the swarm by archiving evidence,
 * writing retrospectives for in-progress phases, and clearing session state.
 * Must be idempotent - safe to run multiple times.
 */
export async function handleCloseCommand(
	directory: string,
	args: string[],
): Promise<string> {
	const planPath = validateSwarmPath(directory, 'plan.json');

	let planExists = false;
	let planData: PlanData = {
		title: path.basename(directory) || 'Ad-hoc session',
		phases: [],
	};
	try {
		const content = await fs.readFile(planPath, 'utf-8');
		planData = JSON.parse(content);
		planExists = true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
			return `❌ Failed to read plan.json: ${error instanceof Error ? error.message : String(error)}`;
		}
		// ENOENT = no plan.json = plan-free session, continue with cleanup
	}

	const phases = planData.phases ?? [];
	const inProgressPhases = phases.filter((p) => p.status === 'in_progress');

	if (planExists) {
		const allDone = phases.every(
			(p) =>
				p.status === 'complete' ||
				p.status === 'completed' ||
				p.status === 'blocked' ||
				p.status === 'closed',
		);

		if (allDone) {
			const closedCount = phases.filter((p) => p.status === 'closed').length;
			const blockedCount = phases.filter((p) => p.status === 'blocked').length;
			const completeCount = phases.filter(
				(p) => p.status === 'complete' || p.status === 'completed',
			).length;
			return `ℹ️ Swarm already closed. ${completeCount} phases complete, ${closedCount} phases closed, ${blockedCount} phases blocked. No action taken.`;
		}
	}

	const config = KnowledgeConfigSchema.parse({});
	const projectName = planData.title ?? 'Unknown Project';
	const closedPhases: number[] = [];
	const closedTasks: string[] = [];

	const warnings: string[] = [];

	for (const phase of inProgressPhases) {
		closedPhases.push(phase.id);

		const retroResult = await executeWriteRetro(
			{
				phase: phase.id,
				summary: 'Phase closed via /swarm close',
				task_count: Math.max(1, (phase.tasks ?? []).length),
				task_complexity: 'simple',
				total_tool_calls: 0,
				coder_revisions: 0,
				reviewer_rejections: 0,
				test_failures: 0,
				security_findings: 0,
				integration_issues: 0,
			},
			directory,
		);

		try {
			const parsed = JSON.parse(retroResult);
			if (parsed.success !== true) {
				warnings.push(`Retrospective write failed for phase ${phase.id}`);
			}
		} catch {
			// Non-JSON response is not an error
		}

		for (const task of phase.tasks ?? []) {
			if (task.status !== 'completed' && task.status !== 'complete') {
				closedTasks.push(task.id);
			}
		}
	}

	// Fix 5: Read explicit lessons from .swarm/close-lessons.md if present
	const lessonsFilePath = path.join(directory, '.swarm', 'close-lessons.md');
	let explicitLessons: string[] = [];
	try {
		const lessonsText = await fs.readFile(lessonsFilePath, 'utf-8');
		explicitLessons = lessonsText
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0 && !line.startsWith('#'));
	} catch {
		// File absent or unreadable — use empty array (existing behaviour)
	}

	let curationSucceeded = false;
	try {
		await curateAndStoreSwarm(
			explicitLessons,
			projectName,
			{ phase_number: 0 },
			directory,
			config,
		);
		curationSucceeded = true;
	} catch (error) {
		console.warn('[close-command] curateAndStoreSwarm error:', error);
	}

	if (curationSucceeded && explicitLessons.length > 0) {
		await fs.unlink(lessonsFilePath).catch(() => {});
	}

	if (planExists) {
		for (const phase of phases) {
			if (phase.status !== 'complete' && phase.status !== 'completed') {
				phase.status = 'closed';
				if (!closedPhases.includes(phase.id)) {
					closedPhases.push(phase.id);
				}
			}
			for (const task of phase.tasks ?? []) {
				if (task.status !== 'completed' && task.status !== 'complete') {
					task.status = 'closed';
					if (!closedTasks.includes(task.id)) {
						closedTasks.push(task.id);
					}
				}
			}
		}

		try {
			await fs.writeFile(planPath, JSON.stringify(planData, null, 2), 'utf-8');
		} catch (error) {
			console.warn('[close-command] Failed to write plan.json:', error);
		}
	}

	try {
		await archiveEvidence(directory, 30, 10);
	} catch (error) {
		console.warn('[close-command] archiveEvidence error:', error);
	}

	// Fix 3: Remove stale config-backup-*.json files
	const swarmDir = path.join(directory, '.swarm');
	let configBackupsRemoved = 0;
	try {
		const swarmFiles = await fs.readdir(swarmDir);
		const configBackups = swarmFiles.filter(
			(f) => f.startsWith('config-backup-') && f.endsWith('.json'),
		);
		for (const backup of configBackups) {
			try {
				await fs.unlink(path.join(swarmDir, backup));
				configBackupsRemoved++;
			} catch {
				// Per-file failure is non-blocking
			}
		}
	} catch {
		// readdir failure is non-blocking
	}

	// Fix 2: Reset context.md so new sessions start fresh
	const contextPath = path.join(directory, '.swarm', 'context.md');
	const contextContent = [
		'# Context',
		'',
		'## Status',
		`Session closed after: ${projectName}`,
		`Closed: ${new Date().toISOString()}`,
		'No active plan. Next session starts fresh.',
		'',
	].join('\n');
	try {
		await fs.writeFile(contextPath, contextContent, 'utf-8');
	} catch (error) {
		console.warn('[close-command] Failed to write context.md:', error);
	}

	// Fix 4: Optional git branch pruning
	const pruneBranches = args.includes('--prune-branches');
	const prunedBranches: string[] = [];
	const pruneErrors: string[] = [];

	if (pruneBranches) {
		try {
			const branchOutput = execSync('git branch -vv', {
				cwd: directory,
				encoding: 'utf-8',
				stdio: ['pipe', 'pipe', 'pipe'],
			});
			const goneBranches = branchOutput
				.split('\n')
				.filter((line) => line.includes(': gone]'))
				.map(
					(line) =>
						line
							.trim()
							.replace(/^[*+]\s+/, '')
							.split(/\s+/)[0],
				)
				.filter(Boolean);
			for (const branch of goneBranches) {
				try {
					execFileSync('git', ['branch', '-d', branch], {
						cwd: directory,
						encoding: 'utf-8',
						stdio: ['pipe', 'pipe', 'pipe'],
					});
					prunedBranches.push(branch);
				} catch {
					pruneErrors.push(branch);
				}
			}
		} catch {
			// Not a git repo or git not installed — non-blocking
		}
	}

	const closeSummaryPath = validateSwarmPath(directory, 'close-summary.md');

	const actionsPerformed = [
		'- Wrote retrospectives for in-progress phases',
		'- Archived evidence bundles',
		'- Reset context.md for next session',
		...(configBackupsRemoved > 0
			? [`- Removed ${configBackupsRemoved} stale config backup file(s)`]
			: []),
		...(prunedBranches.length > 0
			? [
					`- Pruned ${prunedBranches.length} stale local git branch(es): ${prunedBranches.join(', ')}`,
				]
			: []),
		'- Cleared agent sessions and delegation chains',
		...(planExists
			? ['- Set non-completed phases/tasks to closed status']
			: []),
	];

	const summaryContent = [
		'# Swarm Close Summary',
		'',
		`**Project:** ${projectName}`,
		`**Closed:** ${new Date().toISOString()}`,
		'',
		`## Phases Closed: ${closedPhases.length}`,
		closedPhases.length > 0
			? closedPhases.map((id) => `- Phase ${id}`).join('\n')
			: '_No plan — ad-hoc session_',
		'',
		`## Tasks Closed: ${closedTasks.length}`,
		closedTasks.length > 0
			? closedTasks.map((id) => `- ${id}`).join('\n')
			: '_No incomplete tasks_',
		'',
		'## Actions Performed',
		...actionsPerformed,
	].join('\n');

	try {
		await fs.writeFile(closeSummaryPath, summaryContent, 'utf-8');
	} catch (error) {
		console.warn('[close-command] Failed to write close-summary.md:', error);
	}

	try {
		await flushPendingSnapshot(directory);
	} catch (error) {
		console.warn('[close-command] flushPendingSnapshot error:', error);
	}

	// Write root-level checkpoint artifact before clearing sessions (non-blocking)
	await writeCheckpoint(directory).catch(() => {});

	swarmState.agentSessions.clear();
	swarmState.delegationChains.clear();

	if (pruneErrors.length > 0) {
		warnings.push(
			`Could not prune ${pruneErrors.length} branch(es) (unmerged or checked out): ${pruneErrors.join(', ')}`,
		);
	}

	const warningMsg =
		warnings.length > 0 ? ` Warnings: ${warnings.join('; ')}.` : '';
	return `✅ Swarm closed successfully. ${closedPhases.length} phase(s) closed, ${closedTasks.length} incomplete task(s) marked closed.${warningMsg}`;
}

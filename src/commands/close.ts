import { promises as fs } from 'node:fs';
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
	_args: string[],
): Promise<string> {
	const planPath = validateSwarmPath(directory, 'plan.json');

	let planData: PlanData;
	try {
		const content = await fs.readFile(planPath, 'utf-8');
		planData = JSON.parse(content);
	} catch (error) {
		return `❌ Failed to read plan.json: ${error instanceof Error ? error.message : String(error)}`;
	}

	const phases = planData.phases ?? [];
	const inProgressPhases = phases.filter((p) => p.status === 'in_progress');
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

	try {
		await curateAndStoreSwarm(
			[],
			projectName,
			{ phase_number: 0 },
			directory,
			config,
		);
	} catch (error) {
		console.warn('[close-command] curateAndStoreSwarm error:', error);
	}

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

	try {
		await archiveEvidence(directory, 30, 10);
	} catch (error) {
		console.warn('[close-command] archiveEvidence error:', error);
	}

	const closeSummaryPath = validateSwarmPath(directory, 'close-summary.md');
	const summaryContent = [
		'# Swarm Close Summary',
		'',
		`**Project:** ${projectName}`,
		`**Closed:** ${new Date().toISOString()}`,
		'',
		`## Phases Closed: ${closedPhases.length}`,
		closedPhases.map((id) => `- Phase ${id}`).join('\n'),
		'',
		`## Tasks Closed: ${closedTasks.length}`,
		closedTasks.length > 0
			? closedTasks.map((id) => `- ${id}`).join('\n')
			: '_No incomplete tasks_',
		'',
		'## Actions Performed',
		'- Wrote retrospectives for in-progress phases',
		'- Archived evidence bundles',
		'- Cleared agent sessions and delegation chains',
		'- Set non-completed phases/tasks to closed status',
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

	const warningMsg =
		warnings.length > 0 ? ` Warnings: ${warnings.join('; ')}.` : '';
	return `✅ Swarm closed successfully. ${closedPhases.length} phase(s) closed, ${closedTasks.length} incomplete task(s) marked closed.${warningMsg}`;
}

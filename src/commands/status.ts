import type { AgentDefinition } from '../agents';
import {
	extractCurrentPhase,
	extractCurrentPhaseFromPlan,
} from '../hooks/extractors';
import { readSwarmFileAsync } from '../hooks/utils';
import { loadPlan } from '../plan/manager';

export async function handleStatusCommand(
	directory: string,
	agents: Record<string, AgentDefinition>,
): Promise<string> {
	// Try structured plan first
	const plan = await loadPlan(directory);

	if (plan && plan.migration_status !== 'migration_failed') {
		const currentPhase = extractCurrentPhaseFromPlan(plan) || 'Unknown';

		// Count tasks across all phases
		let completedTasks = 0;
		let totalTasks = 0;
		for (const phase of plan.phases) {
			for (const task of phase.tasks) {
				totalTasks++;
				if (task.status === 'completed') completedTasks++;
			}
		}

		const agentCount = Object.keys(agents).length;
		const lines = [
			'## Swarm Status',
			'',
			`**Current Phase**: ${currentPhase}`,
			`**Tasks**: ${completedTasks}/${totalTasks} complete`,
			`**Agents**: ${agentCount} registered`,
		];
		return lines.join('\n');
	}

	// Legacy fallback (existing code)
	const planContent = await readSwarmFileAsync(directory, 'plan.md');
	if (!planContent) return 'No active swarm plan found.';

	const currentPhase = extractCurrentPhase(planContent) || 'Unknown';
	const completedTasks = (planContent.match(/^- \[x\]/gm) || []).length;
	const incompleteTasks = (planContent.match(/^- \[ \]/gm) || []).length;
	const totalTasks = completedTasks + incompleteTasks;
	const agentCount = Object.keys(agents).length;

	const lines = [
		'## Swarm Status',
		'',
		`**Current Phase**: ${currentPhase}`,
		`**Tasks**: ${completedTasks}/${totalTasks} complete`,
		`**Agents**: ${agentCount} registered`,
	];
	return lines.join('\n');
}

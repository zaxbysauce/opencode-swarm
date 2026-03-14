import type { AgentDefinition } from '../agents';
import {
	extractCurrentPhase,
	extractCurrentPhaseFromPlan,
} from '../hooks/extractors';
import { readSwarmFileAsync } from '../hooks/utils';
import { loadPlan } from '../plan/manager';
import { hasActiveTurboMode } from '../state';

/**
 * Structured status data returned by the status service.
 * This can be used by GUI, background flows, or command adapters.
 */
export interface StatusData {
	hasPlan: boolean;
	currentPhase: string;
	completedTasks: number;
	totalTasks: number;
	agentCount: number;
	isLegacy: boolean;
	turboMode: boolean;
}

/**
 * Get status data from the swarm directory.
 * Returns structured data that can be used by GUI, background flows, or commands.
 */
export async function getStatusData(
	directory: string,
	agents: Record<string, AgentDefinition>,
): Promise<StatusData> {
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

		return {
			hasPlan: true,
			currentPhase,
			completedTasks,
			totalTasks,
			agentCount,
			isLegacy: false,
			turboMode: hasActiveTurboMode(),
		};
	}

	// Legacy fallback (existing code)
	const planContent = await readSwarmFileAsync(directory, 'plan.md');
	if (!planContent) {
		return {
			hasPlan: false,
			currentPhase: 'Unknown',
			completedTasks: 0,
			totalTasks: 0,
			agentCount: Object.keys(agents).length,
			isLegacy: true,
			turboMode: hasActiveTurboMode(),
		};
	}

	const currentPhase = extractCurrentPhase(planContent) || 'Unknown';
	const completedTasks = (planContent.match(/^- \[x\]/gm) || []).length;
	const incompleteTasks = (planContent.match(/^- \[ \]/gm) || []).length;
	const totalTasks = completedTasks + incompleteTasks;
	const agentCount = Object.keys(agents).length;

	return {
		hasPlan: true,
		currentPhase,
		completedTasks,
		totalTasks,
		agentCount,
		isLegacy: true,
		turboMode: hasActiveTurboMode(),
	};
}

/**
 * Format status data as markdown for command output.
 * This is the thin adapter that delegates to the service.
 */
export function formatStatusMarkdown(status: StatusData): string {
	const lines = [
		'## Swarm Status',
		'',
		`**Current Phase**: ${status.currentPhase}`,
		`**Tasks**: ${status.completedTasks}/${status.totalTasks} complete`,
		`**Agents**: ${status.agentCount} registered`,
	];

	if (status.turboMode) {
		lines.push('', `**TURBO MODE**: active`);
	}

	return lines.join('\n');
}

/**
 * Handle status command - delegates to service and formats output.
 * Kept for backward compatibility - thin adapter.
 */
export async function handleStatusCommand(
	directory: string,
	agents: Record<string, AgentDefinition>,
): Promise<string> {
	const statusData = await getStatusData(directory, agents);

	if (!statusData.hasPlan) {
		return 'No active swarm plan found.';
	}

	return formatStatusMarkdown(statusData);
}

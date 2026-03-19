import type { AgentDefinition } from '../agents';
import {
	extractCurrentPhase,
	extractCurrentPhaseFromPlan,
} from '../hooks/extractors';
import { readSwarmFileAsync } from '../hooks/utils';
import { loadPlan } from '../plan/manager';
import { hasActiveTurboMode, swarmState } from '../state';
import { getCompactionMetrics } from './compaction-service';
import { DEFAULT_CONTEXT_BUDGET_CONFIG } from './context-budget-service';

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
	/** Last known context budget percentage (0-100), or null if not yet measured */
	contextBudgetPct: number | null;
	/** Number of context compaction events triggered this session */
	compactionCount: number;
	/** ISO timestamp of last compaction snapshot, or null if none */
	lastSnapshotAt: string | null;
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
		const metrics = getCompactionMetrics();

		return {
			hasPlan: true,
			currentPhase,
			completedTasks,
			totalTasks,
			agentCount,
			isLegacy: false,
			turboMode: hasActiveTurboMode(),
			contextBudgetPct:
				swarmState.lastBudgetPct > 0 ? swarmState.lastBudgetPct : null,
			compactionCount: metrics.compactionCount,
			lastSnapshotAt: metrics.lastSnapshotAt,
		};
	}

	// Legacy fallback (existing code)
	const planContent = await readSwarmFileAsync(directory, 'plan.md');
	if (!planContent) {
		const metrics = getCompactionMetrics();
		return {
			hasPlan: false,
			currentPhase: 'Unknown',
			completedTasks: 0,
			totalTasks: 0,
			agentCount: Object.keys(agents).length,
			isLegacy: true,
			turboMode: hasActiveTurboMode(),
			contextBudgetPct:
				swarmState.lastBudgetPct > 0 ? swarmState.lastBudgetPct : null,
			compactionCount: metrics.compactionCount,
			lastSnapshotAt: metrics.lastSnapshotAt,
		};
	}

	const currentPhase = extractCurrentPhase(planContent) || 'Unknown';
	const completedTasks = (planContent.match(/^- \[x\]/gm) || []).length;
	const incompleteTasks = (planContent.match(/^- \[ \]/gm) || []).length;
	const totalTasks = completedTasks + incompleteTasks;
	const agentCount = Object.keys(agents).length;
	const metrics = getCompactionMetrics();

	return {
		hasPlan: true,
		currentPhase,
		completedTasks,
		totalTasks,
		agentCount,
		isLegacy: true,
		turboMode: hasActiveTurboMode(),
		contextBudgetPct:
			swarmState.lastBudgetPct > 0 ? swarmState.lastBudgetPct : null,
		compactionCount: metrics.compactionCount,
		lastSnapshotAt: metrics.lastSnapshotAt,
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

	if (status.contextBudgetPct !== null && status.contextBudgetPct > 0) {
		const pct = status.contextBudgetPct.toFixed(1);
		const budgetTokens = DEFAULT_CONTEXT_BUDGET_CONFIG.budgetTokens;
		const est = Math.round((status.contextBudgetPct / 100) * budgetTokens);
		lines.push(
			'',
			`**Context**: ${pct}% used (est. ${est.toLocaleString()} / ${budgetTokens.toLocaleString()} tokens)`,
		);
		if (status.compactionCount > 0) {
			lines.push(`**Compaction events**: ${status.compactionCount} triggered`);
		}
		if (status.lastSnapshotAt) {
			lines.push(`**Last snapshot**: ${status.lastSnapshotAt}`);
		}
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

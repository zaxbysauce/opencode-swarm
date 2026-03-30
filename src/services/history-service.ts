import type { Plan } from '../config/plan-schema';
import { readSwarmFileAsync } from '../hooks/utils';
import { loadPlanJsonOnly } from '../plan/manager';

/**
 * Structured history data for a single phase.
 */
export interface PhaseHistoryData {
	id: number;
	name: string;
	status: 'complete' | 'in_progress' | 'pending' | 'blocked' | 'closed';
	statusText: string;
	statusIcon: string;
	completedTasks: number;
	totalTasks: number;
	tasksDisplay: string;
}

/**
 * Structured history data returned by the history service.
 */
export interface HistoryData {
	hasPlan: boolean;
	phases: PhaseHistoryData[];
	isLegacy: boolean;
}

/**
 * Convert phase status to display text.
 */
function getStatusText(status: string): string {
	const statusMap: Record<string, string> = {
		complete: 'COMPLETE',
		in_progress: 'IN PROGRESS',
		pending: 'PENDING',
		blocked: 'BLOCKED',
		closed: 'CLOSED',
	};
	return statusMap[status] || 'PENDING';
}

/**
 * Get status icon for phase status.
 */
function getStatusIcon(status: string): string {
	switch (status) {
		case 'complete':
			return '✅';
		case 'in_progress':
			return '🔄';
		case 'blocked':
			return '🚫';
		case 'closed':
			return '🔒';
		default:
			return '⏳';
	}
}

/**
 * Extract history data from structured plan.
 */
function extractFromPlan(plan: Plan): HistoryData {
	if (plan.phases.length === 0) {
		return { hasPlan: true, phases: [], isLegacy: false };
	}

	const phases: PhaseHistoryData[] = [];

	for (const phase of plan.phases) {
		const completed = phase.tasks.filter(
			(t) => t.status === 'completed',
		).length;
		const total = phase.tasks.length;
		const tasks = total > 0 ? `${completed}/${total}` : '-';

		phases.push({
			id: phase.id,
			name: phase.name,
			status: phase.status === 'completed' ? 'complete' : phase.status,
			statusText: getStatusText(phase.status),
			statusIcon: getStatusIcon(phase.status),
			completedTasks: completed,
			totalTasks: total,
			tasksDisplay: tasks,
		});
	}

	return { hasPlan: true, phases, isLegacy: false };
}

/**
 * Extract history data from legacy plan.md format.
 */
async function extractFromLegacy(directory: string): Promise<HistoryData> {
	const planContent = await readSwarmFileAsync(directory, 'plan.md');
	if (!planContent) {
		return { hasPlan: false, phases: [], isLegacy: true };
	}

	// Extract phases and their status
	const phaseRegex =
		/^## Phase (\d+):?\s*(.+?)(?:\s*\[(COMPLETE|IN PROGRESS|PENDING)\])?\s*$/gm;
	const phases: PhaseHistoryData[] = [];

	const lines = planContent.split('\n');

	for (
		let match = phaseRegex.exec(planContent);
		match !== null;
		match = phaseRegex.exec(planContent)
	) {
		const num = parseInt(match[1], 10);
		const name = match[2].trim();
		const status = match[3] || 'PENDING';

		// Map legacy status text to status
		let mappedStatus: PhaseHistoryData['status'] = 'pending';
		if (status === 'COMPLETE') mappedStatus = 'complete';
		else if (status === 'IN PROGRESS') mappedStatus = 'in_progress';

		// Count tasks for this phase: scan lines from this header until next ## Phase or ---
		// Compute line index from character offset to avoid indexOf collision with duplicate text
		const headerLineIndex =
			planContent.substring(0, match.index).split('\n').length - 1;
		let completed = 0;
		let total = 0;

		if (headerLineIndex !== -1) {
			for (let i = headerLineIndex + 1; i < lines.length; i++) {
				const line = lines[i];
				// Stop at next phase header or horizontal rule
				if (
					/^## Phase \d+/.test(line) ||
					(line.trim() === '---' && total > 0)
				) {
					break;
				}
				if (/^- \[x\]/.test(line)) {
					completed++;
					total++;
				} else if (/^- \[ \]/.test(line)) {
					total++;
				}
			}
		}

		const tasks = total > 0 ? `${completed}/${total}` : '-';

		phases.push({
			id: num,
			name,
			status: mappedStatus,
			statusText: getStatusText(mappedStatus),
			statusIcon: getStatusIcon(mappedStatus),
			completedTasks: completed,
			totalTasks: total,
			tasksDisplay: tasks,
		});
	}

	if (phases.length === 0) {
		return { hasPlan: false, phases: [], isLegacy: true };
	}

	return { hasPlan: true, phases, isLegacy: true };
}

/**
 * Get history data from the swarm directory.
 * Returns structured data for GUI, background flows, or commands.
 */
export async function getHistoryData(directory: string): Promise<HistoryData> {
	const plan = await loadPlanJsonOnly(directory);

	if (plan) {
		return extractFromPlan(plan);
	}

	// Legacy fallback
	return extractFromLegacy(directory);
}

/**
 * Format history data as markdown for command output.
 */
export function formatHistoryMarkdown(history: HistoryData): string {
	if (!history.hasPlan || history.phases.length === 0) {
		return 'No history available.';
	}

	const tableLines = [
		'## Swarm History',
		'',
		'| Phase | Name | Status | Tasks |',
		'|-------|------|--------|-------|',
	];

	for (const phase of history.phases) {
		tableLines.push(
			`| ${phase.id} | ${phase.name} | ${phase.statusIcon} ${phase.statusText} | ${phase.tasksDisplay} |`,
		);
	}

	return tableLines.join('\n');
}

/**
 * Handle history command - delegates to service and formats output.
 * Kept for backward compatibility - thin adapter.
 */
export async function handleHistoryCommand(
	directory: string,
	_args: string[],
): Promise<string> {
	const historyData = await getHistoryData(directory);
	return formatHistoryMarkdown(historyData);
}

import { readSwarmFileAsync } from '../hooks/utils';
import { loadPlanJsonOnly } from '../plan/manager';

/**
 * Handles the /swarm history command.
 * Reads plan.md and displays a summary of all phases and their status.
 */
export async function handleHistoryCommand(
	directory: string,
	_args: string[],
): Promise<string> {
	const plan = await loadPlanJsonOnly(directory);

	if (plan) {
		if (plan.phases.length === 0) {
			return 'No history available.';
		}

		const tableLines = [
			'## Swarm History',
			'',
			'| Phase | Name | Status | Tasks |',
			'|-------|------|--------|-------|',
		];

		for (const phase of plan.phases) {
			const statusMap: Record<string, string> = {
				complete: 'COMPLETE',
				in_progress: 'IN PROGRESS',
				pending: 'PENDING',
				blocked: 'BLOCKED',
			};
			const statusText = statusMap[phase.status] || 'PENDING';
			const statusIcon =
				phase.status === 'complete'
					? '✅'
					: phase.status === 'in_progress'
						? '🔄'
						: phase.status === 'blocked'
							? '🚫'
							: '⏳';

			const completed = phase.tasks.filter(
				(t) => t.status === 'completed',
			).length;
			const total = phase.tasks.length;
			const tasks = total > 0 ? `${completed}/${total}` : '-';

			tableLines.push(
				`| ${phase.id} | ${phase.name} | ${statusIcon} ${statusText} | ${tasks} |`,
			);
		}

		return tableLines.join('\n');
	}

	// Legacy fallback — keep existing regex-based code
	const planContent = await readSwarmFileAsync(directory, 'plan.md');
	if (!planContent) {
		return 'No history available.';
	}

	// Extract phases and their status
	const phaseRegex =
		/^## Phase (\d+):?\s*(.+?)(?:\s*\[(COMPLETE|IN PROGRESS|PENDING)\])?\s*$/gm;
	const phases: Array<{
		num: number;
		name: string;
		status: string;
		completed: number;
		total: number;
	}> = [];

	const lines = planContent.split('\n');

	for (
		let match = phaseRegex.exec(planContent);
		match !== null;
		match = phaseRegex.exec(planContent)
	) {
		const num = parseInt(match[1], 10);
		const name = match[2].trim();
		const status = match[3] || 'PENDING';

		// Count tasks for this phase: scan lines from this header until next ## Phase or ---
		const headerLineIndex = lines.indexOf(match[0]);
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

		phases.push({ num, name, status, completed, total });
	}

	if (phases.length === 0) {
		return 'No history available.';
	}

	// Format as markdown table
	const tableLines = [
		'## Swarm History',
		'',
		'| Phase | Name | Status | Tasks |',
		'|-------|------|--------|-------|',
	];

	for (const phase of phases) {
		const statusIcon =
			phase.status === 'COMPLETE'
				? '✅'
				: phase.status === 'IN PROGRESS'
					? '🔄'
					: '⏳';
		const tasks = phase.total > 0 ? `${phase.completed}/${phase.total}` : '-';
		tableLines.push(
			`| ${phase.num} | ${phase.name} | ${statusIcon} ${phase.status} | ${tasks} |`,
		);
	}

	return tableLines.join('\n');
}

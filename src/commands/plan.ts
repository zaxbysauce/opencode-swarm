import { readSwarmFileAsync } from '../hooks/utils';
import { derivePlanMarkdown, loadPlanJsonOnly } from '../plan/manager';

export async function handlePlanCommand(
	directory: string,
	args: string[],
): Promise<string> {
	// Try structured plan first (only if plan.json exists, no auto-migration)
	const plan = await loadPlanJsonOnly(directory);

	if (plan) {
		// No args = show full derived markdown
		if (args.length === 0) {
			return derivePlanMarkdown(plan);
		}

		// Numeric arg = show specific phase
		const phaseNum = parseInt(args[0], 10);
		if (Number.isNaN(phaseNum)) {
			return derivePlanMarkdown(plan);
		}

		const phase = plan.phases.find((p) => p.id === phaseNum);
		if (!phase) {
			return `Phase ${phaseNum} not found in plan.`;
		}

		// Derive full markdown and extract just this phase's section
		const fullMarkdown = derivePlanMarkdown(plan);
		// Use same parsing logic as before to extract the phase section
		const lines = fullMarkdown.split('\n');
		const phaseLines: string[] = [];
		let inTargetPhase = false;

		for (const line of lines) {
			const phaseMatch = line.match(/^## Phase (\d+)/);
			if (phaseMatch) {
				const num = parseInt(phaseMatch[1], 10);
				if (num === phaseNum) {
					inTargetPhase = true;
					phaseLines.push(line);
					continue;
				} else if (inTargetPhase) {
					break;
				}
			}
			if (inTargetPhase && line.trim() === '---' && phaseLines.length > 1) {
				break;
			}
			if (inTargetPhase) {
				phaseLines.push(line);
			}
		}

		return phaseLines.length > 0
			? phaseLines.join('\n').trim()
			: `Phase ${phaseNum} not found in plan.`;
	}

	// Legacy fallback
	const planContent = await readSwarmFileAsync(directory, 'plan.md');
	if (!planContent) {
		return 'No active swarm plan found.';
	}

	// ... keep all existing legacy code for args handling
	if (args.length === 0) {
		return planContent;
	}

	const phaseNum = parseInt(args[0], 10);
	if (Number.isNaN(phaseNum)) {
		return planContent;
	}

	const lines = planContent.split('\n');
	const phaseLines: string[] = [];
	let inTargetPhase = false;

	for (const line of lines) {
		const phaseMatch = line.match(/^## Phase (\d+)/);
		if (phaseMatch) {
			const num = parseInt(phaseMatch[1], 10);
			if (num === phaseNum) {
				inTargetPhase = true;
				phaseLines.push(line);
				continue;
			} else if (inTargetPhase) {
				break;
			}
		}
		if (inTargetPhase && line.trim() === '---' && phaseLines.length > 1) {
			break;
		}
		if (inTargetPhase) {
			phaseLines.push(line);
		}
	}

	if (phaseLines.length === 0) {
		return `Phase ${phaseNum} not found in plan.`;
	}
	return phaseLines.join('\n').trim();
}

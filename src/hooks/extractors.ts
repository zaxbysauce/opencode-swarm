import type { Plan } from '../config/plan-schema';

/**
 * Swarm File Extractors
 *
 * Pure parsing functions for extracting structured data from .swarm/ files.
 * Used by system-enhancer and compaction-customizer hooks.
 */

/**
 * Extracts the current phase information from plan content.
 */
export function extractCurrentPhase(planContent: string): string | null {
	if (!planContent) {
		return null;
	}

	const lines = planContent.split('\n');

	// Look for IN PROGRESS phase in the first 20 lines
	for (let i = 0; i < Math.min(20, lines.length); i++) {
		const line = lines[i].trim();
		const progressMatch = line.match(
			/^## Phase (\d+):?\s*(.*?)\s*\[IN PROGRESS\]/i,
		);
		if (progressMatch) {
			const phaseNum = progressMatch[1];
			const description = progressMatch[2]?.trim() || '';
			return `Phase ${phaseNum}: ${description} [IN PROGRESS]`;
		}
	}

	// Look for Phase: N in the first 3 lines (header)
	for (let i = 0; i < Math.min(3, lines.length); i++) {
		const line = lines[i].trim();
		const phaseMatch = line.match(/Phase:\s*(\d+)/i);
		if (phaseMatch) {
			const phaseNum = phaseMatch[1];
			return `Phase ${phaseNum} [PENDING]`;
		}
	}

	return null;
}

/**
 * Extracts the first incomplete task from the current IN PROGRESS phase.
 */
export function extractCurrentTask(planContent: string): string | null {
	if (!planContent) {
		return null;
	}

	const lines = planContent.split('\n');
	let inCurrentPhase = false;

	for (const line of lines) {
		// Find the IN PROGRESS phase
		if (line.startsWith('## ') && /\[IN PROGRESS\]/i.test(line)) {
			inCurrentPhase = true;
			continue;
		}

		if (inCurrentPhase) {
			// Stop at the next phase heading or horizontal rule
			if (line.startsWith('## ') || line.trim() === '---') {
				break;
			}
			// Find the first incomplete task
			if (line.trim().startsWith('- [ ]')) {
				return line.trim();
			}
		}
	}

	return null;
}

/**
 * Extracts decisions section from context content.
 */
export function extractDecisions(
	contextContent: string,
	maxChars: number = 500,
): string | null {
	if (!contextContent) {
		return null;
	}

	const lines = contextContent.split('\n');
	let decisionsText = '';
	let inDecisionsSection = false;

	for (const line of lines) {
		if (line.trim() === '## Decisions') {
			inDecisionsSection = true;
			continue;
		}

		if (inDecisionsSection) {
			if (line.startsWith('## ')) {
				// Reached next section
				break;
			}
			if (line.startsWith('- ')) {
				decisionsText += `${line}\n`;
			}
		}
	}

	if (!decisionsText.trim()) {
		return null;
	}

	// Truncate to maxChars and clean up
	const trimmed = decisionsText.trim();
	if (trimmed.length <= maxChars) {
		return trimmed;
	}

	return `${trimmed.slice(0, maxChars)}...`;
}

/**
 * Extracts incomplete tasks from plan content under the current IN PROGRESS phase.
 */
export function extractIncompleteTasks(
	planContent: string,
	maxChars: number = 500,
): string | null {
	if (!planContent) {
		return null;
	}

	const lines = planContent.split('\n');
	let tasksText = '';
	let inCurrentPhase = false;

	for (const line of lines) {
		// Find the IN PROGRESS phase
		if (line.startsWith('## ') && /\[IN PROGRESS\]/i.test(line)) {
			inCurrentPhase = true;
			continue;
		}

		if (inCurrentPhase) {
			// Stop at the next phase heading or horizontal rule
			if (line.startsWith('## ') || line.trim() === '---') {
				break;
			}
			// Collect incomplete tasks (- [ ] lines)
			if (line.trim().startsWith('- [ ]')) {
				tasksText += `${line.trim()}\n`;
			}
		}
	}

	if (!tasksText.trim()) {
		return null;
	}

	const trimmed = tasksText.trim();
	if (trimmed.length <= maxChars) {
		return trimmed;
	}

	return `${trimmed.slice(0, maxChars)}...`;
}

/**
 * Extracts patterns section from context content.
 */
export function extractPatterns(
	contextContent: string,
	maxChars: number = 500,
): string | null {
	if (!contextContent) {
		return null;
	}

	const lines = contextContent.split('\n');
	let patternsText = '';
	let inPatternsSection = false;

	for (const line of lines) {
		if (line.trim() === '## Patterns') {
			inPatternsSection = true;
			continue;
		}

		if (inPatternsSection) {
			if (line.startsWith('## ')) {
				break;
			}
			if (line.startsWith('- ')) {
				patternsText += `${line}\n`;
			}
		}
	}

	if (!patternsText.trim()) {
		return null;
	}

	const trimmed = patternsText.trim();
	if (trimmed.length <= maxChars) {
		return trimmed;
	}

	return `${trimmed.slice(0, maxChars)}...`;
}

/**
 * Extracts current phase info from a Plan object.
 */
export function extractCurrentPhaseFromPlan(plan: Plan): string | null {
	const phase = plan.phases.find((p) => p.id === plan.current_phase);
	if (!phase) return null;

	const statusMap: Record<string, string> = {
		pending: 'PENDING',
		in_progress: 'IN PROGRESS',
		complete: 'COMPLETE',
		blocked: 'BLOCKED',
	};
	const statusText = statusMap[phase.status] || 'PENDING';
	return `Phase ${phase.id}: ${phase.name} [${statusText}]`;
}

/**
 * Extracts the first incomplete task from the current phase of a Plan object.
 */
export function extractCurrentTaskFromPlan(plan: Plan): string | null {
	const phase = plan.phases.find((p) => p.id === plan.current_phase);
	if (!phase) return null;

	// Find first in_progress task, or first pending task
	const inProgress = phase.tasks.find((t) => t.status === 'in_progress');
	if (inProgress) {
		const deps =
			inProgress.depends.length > 0
				? ` (depends: ${inProgress.depends.join(', ')})`
				: '';
		return `- [ ] ${inProgress.id}: ${inProgress.description} [${inProgress.size.toUpperCase()}]${deps} ← CURRENT`;
	}

	const pending = phase.tasks.find((t) => t.status === 'pending');
	if (pending) {
		const deps =
			pending.depends.length > 0
				? ` (depends: ${pending.depends.join(', ')})`
				: '';
		return `- [ ] ${pending.id}: ${pending.description} [${pending.size.toUpperCase()}]${deps}`;
	}

	return null;
}

/**
 * Extracts incomplete tasks from the current phase of a Plan object.
 */
export function extractIncompleteTasksFromPlan(
	plan: Plan,
	maxChars: number = 500,
): string | null {
	const phase = plan.phases.find((p) => p.id === plan.current_phase);
	if (!phase) return null;

	const incomplete = phase.tasks.filter(
		(t) => t.status === 'pending' || t.status === 'in_progress',
	);
	if (incomplete.length === 0) return null;

	const lines = incomplete.map((t) => {
		const deps =
			t.depends.length > 0 ? ` (depends: ${t.depends.join(', ')})` : '';
		return `- [ ] ${t.id}: ${t.description} [${t.size.toUpperCase()}]${deps}`;
	});

	const text = lines.join('\n');
	if (text.length <= maxChars) return text;
	return `${text.slice(0, maxChars)}...`;
}

/**
 * Course Correction Module
 * Generates structured guidance messages from pattern detection results
 */

import type {
	CourseCorrection,
	PatternMatch,
	PatternType,
	TrajectoryEntry,
} from './types';

/**
 * Guidance templates for each pattern type
 */
const GUIDANCE_TEMPLATES: Record<PatternType, string> = {
	repetition_loop:
		'Agent is repeating the same action on the same target. Consider consolidating changes, stepping back to review the approach, or delegating to a different agent.',
	ping_pong:
		'Agents are delegating back and forth without making progress. Consider having the architect take direct control or redefining the task boundaries.',
	expansion_drift:
		'Scope is expanding beyond the original task. Consider creating a follow-up task, reducing the current scope, or updating the spec.',
	stuck_on_test:
		'Repeated edit-test cycles detected. Consider reviewing the test expectations, checking for environmental issues, or seeking SME consultation.',
	context_thrash:
		'Agent is requesting increasingly large file sets. Consider focusing on the specific files needed for the current task or compacting context.',
};

/**
 * Action templates for each pattern type
 */
const ACTION_TEMPLATES: Record<
	PatternType,
	(match: PatternMatch, trajectory: TrajectoryEntry[]) => string
> = {
	repetition_loop: (match: PatternMatch) => {
		const agents =
			match.affectedAgents.length > 0
				? match.affectedAgents.join(', ')
				: 'current agent';
		const targets =
			match.affectedTargets.length > 0
				? match.affectedTargets.join(', ')
				: 'current target';
		return `Stop repetitive edits to ${targets} by ${agents}. Take a step back and consolidate the changes made so far before proceeding.`;
	},
	ping_pong: () => {
		return `Interrupt the delegation cycle. Architect should take direct control of the task or explicitly redefine which agent owns which subtask.`;
	},
	expansion_drift: () => {
		return `Freeze current scope. Document what's been attempted and create a follow-up issue for additional work. Complete current task before expanding further.`;
	},
	stuck_on_test: (match: PatternMatch) => {
		const agents =
			match.affectedAgents.length > 0
				? match.affectedAgents.join(', ')
				: 'the agent';
		return `Pause edit-test cycle. ${agents} should review test expectations, verify environment is clean, and consult SME if root cause is unclear.`;
	},
	context_thrash: (match: PatternMatch) => {
		const targets =
			match.affectedTargets.length > 0
				? match.affectedTargets.slice(0, 3).join(', ')
				: 'requested files';
		return `Restrict file access to only ${targets}. Use targeted file selection instead of broad context requests.`;
	},
};

/**
 * Generates a structured CourseCorrection guidance message from a PatternMatch and trajectory context
 *
 * @param match - The pattern match result from pattern detection
 * @param trajectory - The trajectory entries providing context for the correction
 * @returns A structured CourseCorrection object with alert, category, guidance, action, pattern, and stepRange
 */
export function generateCourseCorrection(
	match: PatternMatch,
	trajectory: TrajectoryEntry[],
): CourseCorrection {
	const alert = `TRAJECTORY ALERT: ${match.pattern} detected (severity: ${match.severity}) at steps ${match.stepRange[0]}-${match.stepRange[1]}`;

	const guidance = GUIDANCE_TEMPLATES[match.pattern];

	const action = ACTION_TEMPLATES[match.pattern](match, trajectory);

	return {
		alert,
		category: match.category,
		guidance,
		action,
		pattern: match.pattern,
		stepRange: match.stepRange,
	};
}

/**
 * Formats a CourseCorrection for injection into agent messages
 *
 * @param correction - The course correction to format
 * @returns A formatted string suitable for injection into messages
 */
export function formatCourseCorrectionForInjection(
	correction: CourseCorrection,
): string {
	return `${correction.alert}
CATEGORY: ${correction.category}
GUIDANCE: ${correction.guidance}
ACTION: ${correction.action}`;
}

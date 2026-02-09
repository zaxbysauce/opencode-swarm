/**
 * Compaction Customizer Hook
 *
 * Enhances session compaction by injecting swarm context from plan.md and context.md.
 * Adds current phase information and key decisions to the compaction context.
 */

import type { PluginConfig } from '../config';
import { loadPlan } from '../plan/manager';
import {
	extractCurrentPhase,
	extractCurrentPhaseFromPlan,
	extractDecisions,
	extractIncompleteTasks,
	extractIncompleteTasksFromPlan,
	extractPatterns,
} from './extractors';
import { readSwarmFileAsync, safeHook } from './utils';

/**
 * Creates the experimental.session.compacting hook for compaction customization.
 */
export function createCompactionCustomizerHook(
	config: PluginConfig,
	directory: string,
): Record<string, unknown> {
	const enabled = config.hooks?.compaction !== false;

	if (!enabled) {
		return {};
	}

	return {
		'experimental.session.compacting': safeHook(
			async (
				_input: { sessionID: string },
				output: { context: string[]; prompt?: string },
			): Promise<void> => {
				const contextContent = await readSwarmFileAsync(
					directory,
					'context.md',
				);

				// Try structured plan first
				const plan = await loadPlan(directory);
				if (plan && plan.migration_status !== 'migration_failed') {
					const currentPhase = extractCurrentPhaseFromPlan(plan);
					if (currentPhase) {
						output.context.push(`[SWARM PLAN] ${currentPhase}`);
					}
					const incompleteTasks = extractIncompleteTasksFromPlan(plan);
					if (incompleteTasks) {
						output.context.push(`[SWARM TASKS] ${incompleteTasks}`);
					}
				} else {
					// Legacy fallback
					const planContent = await readSwarmFileAsync(directory, 'plan.md');
					if (planContent) {
						const currentPhase = extractCurrentPhase(planContent);
						if (currentPhase) {
							output.context.push(`[SWARM PLAN] ${currentPhase}`);
						}
						const incompleteTasks = extractIncompleteTasks(planContent);
						if (incompleteTasks) {
							output.context.push(`[SWARM TASKS] ${incompleteTasks}`);
						}
					}
				}

				// Add decisions summary from context.md
				if (contextContent) {
					const decisionsSummary = extractDecisions(contextContent);
					if (decisionsSummary) {
						output.context.push(`[SWARM DECISIONS] ${decisionsSummary}`);
					}
				}

				// Add patterns from context.md
				if (contextContent) {
					const patterns = extractPatterns(contextContent);
					if (patterns) {
						output.context.push(`[SWARM PATTERNS] ${patterns}`);
					}
				}

				// Note: Do not modify output.prompt - let OpenCode use its default compaction prompt
			},
		),
	};
}

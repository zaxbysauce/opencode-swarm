/**
 * System Enhancer Hook
 *
 * Enhances the system prompt with current phase information from the plan
 * and cross-agent context from the activity log.
 * Reads plan.md and injects phase context into the system prompt.
 */

import type { PluginConfig } from '../config';
import { loadPlan } from '../plan/manager';
import { swarmState } from '../state';
import { warn } from '../utils';
import {
	extractCurrentPhase,
	extractCurrentPhaseFromPlan,
	extractCurrentTask,
	extractCurrentTaskFromPlan,
	extractDecisions,
} from './extractors';
import { readSwarmFileAsync, safeHook } from './utils';

/**
 * Creates the experimental.chat.system.transform hook for system enhancement.
 */
export function createSystemEnhancerHook(
	config: PluginConfig,
	directory: string,
): Record<string, unknown> {
	const enabled = config.hooks?.system_enhancer !== false;

	if (!enabled) {
		return {};
	}

	return {
		'experimental.chat.system.transform': safeHook(
			async (
				_input: { sessionID?: string; model?: unknown },
				output: { system: string[] },
			): Promise<void> => {
				try {
					const contextContent = await readSwarmFileAsync(
						directory,
						'context.md',
					);

					// Try structured plan first
					const plan = await loadPlan(directory);
					if (plan && plan.migration_status !== 'migration_failed') {
						const currentPhase = extractCurrentPhaseFromPlan(plan);
						if (currentPhase) {
							output.system.push(
								`[SWARM CONTEXT] Current phase: ${currentPhase}`,
							);
						}
						const currentTask = extractCurrentTaskFromPlan(plan);
						if (currentTask) {
							output.system.push(
								`[SWARM CONTEXT] Current task: ${currentTask}`,
							);
						}
					} else {
						// Legacy fallback: read plan.md as string
						const planContent = await readSwarmFileAsync(directory, 'plan.md');
						if (planContent) {
							const currentPhase = extractCurrentPhase(planContent);
							if (currentPhase) {
								output.system.push(
									`[SWARM CONTEXT] Current phase: ${currentPhase}`,
								);
							}
							const currentTask = extractCurrentTask(planContent);
							if (currentTask) {
								output.system.push(
									`[SWARM CONTEXT] Current task: ${currentTask}`,
								);
							}
						}
					}

					// Inject recent decisions (top 3, truncated to 200 chars)
					if (contextContent) {
						const decisions = extractDecisions(contextContent, 200);
						if (decisions) {
							output.system.push(`[SWARM CONTEXT] Key decisions: ${decisions}`);
						}

						// Inject cross-agent context if agent activity tracking is enabled
						if (config.hooks?.agent_activity !== false && _input.sessionID) {
							const activeAgent = swarmState.activeAgent.get(_input.sessionID);
							if (activeAgent) {
								const agentContext = extractAgentContext(
									contextContent,
									activeAgent,
									config.hooks?.agent_awareness_max_chars ?? 300,
								);
								if (agentContext) {
									output.system.push(`[SWARM AGENT CONTEXT] ${agentContext}`);
								}
							}
						}
					}
				} catch (error) {
					warn('System enhancer failed:', error);
				}
			},
		),
	};
}

/**
 * Extracts relevant cross-agent context based on the active agent.
 * Returns a truncated string of context relevant to the current agent.
 */
function extractAgentContext(
	contextContent: string,
	activeAgent: string,
	maxChars: number,
): string | null {
	// Find the ## Agent Activity section
	const activityMatch = contextContent.match(
		/## Agent Activity\n([\s\S]*?)(?=\n## |$)/,
	);
	if (!activityMatch) return null;

	const activitySection = activityMatch[1].trim();
	if (!activitySection || activitySection === 'No tool activity recorded yet.')
		return null;

	// Build context summary based on which agent is currently active
	// The mapping tells agents what context from other agents is relevant to them
	// Strip known swarm prefixes (e.g., "paid_coder" -> "coder", "local_test_engineer" -> "test_engineer")
	// Only strips the first segment if it matches a known swarm ID pattern
	const agentName = activeAgent.replace(/^(?:paid|local|mega|default)_/, '');

	let contextSummary: string;
	switch (agentName) {
		case 'coder':
			contextSummary = `Recent tool activity for review context:\n${activitySection}`;
			break;
		case 'reviewer':
			contextSummary = `Tool usage to review:\n${activitySection}`;
			break;
		case 'test_engineer':
			contextSummary = `Tool activity for test context:\n${activitySection}`;
			break;
		default:
			contextSummary = `Agent activity summary:\n${activitySection}`;
			break;
	}

	// Truncate to max chars
	if (contextSummary.length > maxChars) {
		return `${contextSummary.substring(0, maxChars - 3)}...`;
	}

	return contextSummary;
}

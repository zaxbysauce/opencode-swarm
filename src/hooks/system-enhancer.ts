/**
 * System Enhancer Hook
 *
 * Enhances the system prompt with current phase information from the plan
 * and cross-agent context from the activity log.
 * Reads plan.md and injects phase context into the system prompt.
 */

import type { PluginConfig } from '../config';
import { DEFAULT_SCORING_CONFIG } from '../config/constants';
import { stripKnownSwarmPrefix } from '../config/schema';
import { loadPlan } from '../plan/manager';
import { swarmState } from '../state';
import { warn } from '../utils';
import {
	type ContentType,
	type ContextCandidate,
	rankCandidates,
	type ScoringConfig,
} from './context-scoring';
import {
	extractCurrentPhase,
	extractCurrentPhaseFromPlan,
	extractCurrentTask,
	extractCurrentTaskFromPlan,
	extractDecisions,
} from './extractors';
import { estimateTokens, readSwarmFileAsync, safeHook } from './utils';

/**
 * Estimate content type based on text characteristics.
 */
function estimateContentType(text: string): ContentType {
	// Simple heuristics
	if (
		text.includes('```') ||
		text.includes('function ') ||
		text.includes('const ')
	) {
		return 'code';
	}
	if (text.startsWith('{') || text.startsWith('[')) {
		return 'json';
	}
	if (text.includes('#') || text.includes('*') || text.includes('- ')) {
		return 'markdown';
	}
	return 'prose';
}

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
					const maxInjectionTokens =
						config.context_budget?.max_injection_tokens ??
						Number.POSITIVE_INFINITY;
					let injectedTokens = 0;

					function tryInject(text: string): void {
						const tokens = estimateTokens(text);
						if (injectedTokens + tokens > maxInjectionTokens) {
							return;
						}
						output.system.push(text);
						injectedTokens += tokens;
					}

					const contextContent = await readSwarmFileAsync(
						directory,
						'context.md',
					);

					// Check if scoring is enabled
					const scoringEnabled =
						config.context_budget?.scoring?.enabled === true;

					if (!scoringEnabled) {
						// Path A: EXACT LEGACY CODE - do not change
						// Priority 1: Current phase
						const plan = await loadPlan(directory);
						if (plan && plan.migration_status !== 'migration_failed') {
							const currentPhase = extractCurrentPhaseFromPlan(plan);
							if (currentPhase) {
								tryInject(`[SWARM CONTEXT] Current phase: ${currentPhase}`);
							}
							// Priority 2: Current task
							const currentTask = extractCurrentTaskFromPlan(plan);
							if (currentTask) {
								tryInject(`[SWARM CONTEXT] Current task: ${currentTask}`);
							}
						} else {
							const planContent = await readSwarmFileAsync(
								directory,
								'plan.md',
							);
							if (planContent) {
								const currentPhase = extractCurrentPhase(planContent);
								if (currentPhase) {
									tryInject(`[SWARM CONTEXT] Current phase: ${currentPhase}`);
								}
								const currentTask = extractCurrentTask(planContent);
								if (currentTask) {
									tryInject(`[SWARM CONTEXT] Current task: ${currentTask}`);
								}
							}
						}

						// Priority 3: Decisions
						if (contextContent) {
							const decisions = extractDecisions(contextContent, 200);
							if (decisions) {
								tryInject(`[SWARM CONTEXT] Key decisions: ${decisions}`);
							}

							// Priority 4 (lowest): Agent context
							if (config.hooks?.agent_activity !== false && _input.sessionID) {
								const activeAgent = swarmState.activeAgent.get(
									_input.sessionID,
								);
								if (activeAgent) {
									const agentContext = extractAgentContext(
										contextContent,
										activeAgent,
										config.hooks?.agent_awareness_max_chars ?? 300,
									);
									if (agentContext) {
										tryInject(`[SWARM AGENT CONTEXT] ${agentContext}`);
									}
								}
							}
						}
						return;
					}

					// Path B: Scoring is enabled - build candidates and rank
					const userScoringConfig = config.context_budget?.scoring;
					const candidates: ContextCandidate[] = [];
					let idCounter = 0;

					// Build effective config with guaranteed weights (use defaults if user config missing/invalid)
					const effectiveConfig: ScoringConfig = (
						userScoringConfig?.weights
							? {
									...DEFAULT_SCORING_CONFIG,
									...userScoringConfig,
									weights: userScoringConfig.weights,
								}
							: DEFAULT_SCORING_CONFIG
					) as ScoringConfig;

					// Build candidates from same sources as legacy
					// Current phase
					const plan = await loadPlan(directory);
					let currentPhase: string | null = null;
					let currentTask: string | null = null;

					if (plan && plan.migration_status !== 'migration_failed') {
						currentPhase = extractCurrentPhaseFromPlan(plan);
						currentTask = extractCurrentTaskFromPlan(plan);
					} else {
						const planContent = await readSwarmFileAsync(directory, 'plan.md');
						if (planContent) {
							currentPhase = extractCurrentPhase(planContent);
							currentTask = extractCurrentTask(planContent);
						}
					}

					if (currentPhase) {
						const text = `[SWARM CONTEXT] Current phase: ${currentPhase}`;
						candidates.push({
							id: `candidate-${idCounter++}`,
							kind: 'phase',
							text,
							tokens: estimateTokens(text),
							priority: 1, // legacy priority 1
							metadata: { contentType: estimateContentType(text) },
						});
					}

					// Current task
					if (currentTask) {
						const text = `[SWARM CONTEXT] Current task: ${currentTask}`;
						candidates.push({
							id: `candidate-${idCounter++}`,
							kind: 'task',
							text,
							tokens: estimateTokens(text),
							priority: 2,
							metadata: {
								contentType: estimateContentType(text),
								isCurrentTask: true,
							},
						});
					}

					// Decisions
					if (contextContent) {
						const decisions = extractDecisions(contextContent, 200);
						if (decisions) {
							const text = `[SWARM CONTEXT] Key decisions: ${decisions}`;
							candidates.push({
								id: `candidate-${idCounter++}`,
								kind: 'decision',
								text,
								tokens: estimateTokens(text),
								priority: 3,
								metadata: { contentType: estimateContentType(text) },
							});
						}

						// Agent context
						if (config.hooks?.agent_activity !== false && _input.sessionID) {
							const activeAgent = swarmState.activeAgent.get(_input.sessionID);
							if (activeAgent) {
								const agentContext = extractAgentContext(
									contextContent,
									activeAgent,
									config.hooks?.agent_awareness_max_chars ?? 300,
								);
								if (agentContext) {
									const text = `[SWARM AGENT CONTEXT] ${agentContext}`;
									candidates.push({
										id: `candidate-${idCounter++}`,
										kind: 'agent_context',
										text,
										tokens: estimateTokens(text),
										priority: 4,
										metadata: { contentType: estimateContentType(text) },
									});
								}
							}
						}
					}

					// Rank candidates
					const ranked = rankCandidates(candidates, effectiveConfig);

					// Inject in ranked order under budget
					for (const candidate of ranked) {
						if (injectedTokens + candidate.tokens > maxInjectionTokens) {
							continue; // Skip if over budget
						}
						output.system.push(candidate.text);
						injectedTokens += candidate.tokens;
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
	// Strip swarm prefix to get the base agent name (e.g., "enterprise_coder" -> "coder")
	const agentName = stripKnownSwarmPrefix(activeAgent);

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

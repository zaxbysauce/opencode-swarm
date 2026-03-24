/**
 * Curator analyze tool — explicit mechanism to trigger curator phase analysis
 * and apply knowledge recommendations. Closes the curator data pipeline by
 * giving the architect an explicit tool to call after reviewing phase data.
 */

import { tool } from '@opencode-ai/plugin';
import { loadPluginConfigWithMeta } from '../config';
import { CuratorConfigSchema, KnowledgeConfigSchema } from '../config/schema';
import {
	applyCuratorKnowledgeUpdates,
	runCuratorPhase,
} from '../hooks/curator';
import type { KnowledgeRecommendation } from '../hooks/curator-types.js';
import { createSwarmTool } from './create-tool';

/**
 * Result structure for runCuratorPipelineOnRetros
 */
export interface CuratorPipelineResult {
	success: boolean;
	phases_processed: number;
	recommendations_collected: number;
	applied: number;
	skipped: number;
	details: string[];
}

/**
 * Run curator pipeline on multiple phases: runs runCuratorPhase for each phase ID,
 * collects all knowledge recommendations, and applies them in a single batch.
 *
 * @param directory - Working directory
 * @param phaseIds - Array of phase numbers to process
 * @returns JSON string with pipeline results
 */
export async function runCuratorPipelineOnRetros(
	directory: string,
	phaseIds: number[],
): Promise<string> {
	const result: CuratorPipelineResult = {
		success: true,
		phases_processed: 0,
		recommendations_collected: 0,
		applied: 0,
		skipped: 0,
		details: [],
	};

	// Handle empty phaseIds
	if (!Array.isArray(phaseIds) || phaseIds.length === 0) {
		return JSON.stringify(
			{
				success: true,
				phases_processed: 0,
				recommendations_collected: 0,
				applied: 0,
				skipped: 0,
				details: ['No phases to process'],
			},
			null,
			2,
		);
	}

	try {
		const { config } = loadPluginConfigWithMeta(directory);
		const curatorConfig = CuratorConfigSchema.parse(config.curator ?? {});
		const knowledgeConfig = KnowledgeConfigSchema.parse(config.knowledge ?? {});

		// Skip if curator is disabled
		if (!curatorConfig.enabled) {
			result.details.push('Curator disabled via config — skipping pipeline');
			return JSON.stringify(result, null, 2);
		}

		const allRecommendations: KnowledgeRecommendation[] = [];

		// Process each phase
		for (const phaseId of phaseIds) {
			try {
				// Validate phase is a positive integer
				if (!Number.isInteger(phaseId) || phaseId < 1) {
					result.details.push(
						`Phase ${phaseId}: skipped — must be positive integer >= 1`,
					);
					continue;
				}

				// Run curator phase analysis
				const curatorResult = await runCuratorPhase(
					directory,
					phaseId,
					[], // agentsDispatched — empty for batch analysis
					curatorConfig,
					{},
				);

				result.phases_processed++;

				// Collect recommendations from this phase
				if (
					curatorResult.knowledge_recommendations &&
					curatorResult.knowledge_recommendations.length > 0
				) {
					allRecommendations.push(...curatorResult.knowledge_recommendations);
					result.details.push(
						`Phase ${phaseId}: collected ${curatorResult.knowledge_recommendations.length} recommendations`,
					);
				} else {
					result.details.push(`Phase ${phaseId}: no recommendations`);
				}
			} catch (phaseError) {
				// Non-blocking: continue to next phase on error
				result.details.push(`Phase ${phaseId}: error — ${String(phaseError)}`);
				// Continue processing other phases
			}
		}

		result.recommendations_collected = allRecommendations.length;

		// Apply all collected recommendations in a single batch
		if (allRecommendations.length > 0) {
			try {
				const applyResult = await applyCuratorKnowledgeUpdates(
					directory,
					allRecommendations,
					knowledgeConfig,
				);
				result.applied = applyResult.applied;
				result.skipped = applyResult.skipped;
				result.details.push(
					`Applied ${applyResult.applied} recommendations, skipped ${applyResult.skipped}`,
				);
			} catch (applyError) {
				// Non-blocking: return what we collected even if apply fails
				result.success = false;
				result.details.push(
					`applyCuratorKnowledgeUpdates error: ${String(applyError)}`,
				);
			}
		} else {
			result.details.push('No recommendations to apply');
		}

		return JSON.stringify(result, null, 2);
	} catch (pipelineError) {
		// Non-blocking: return graceful error response
		return JSON.stringify(
			{
				success: false,
				phases_processed: result.phases_processed,
				recommendations_collected: result.recommendations_collected,
				applied: result.applied,
				skipped: result.skipped,
				details: [
					...result.details,
					`Pipeline error: ${String(pipelineError)}`,
				],
			},
			null,
			2,
		);
	}
}

export const curator_analyze: ReturnType<typeof createSwarmTool> =
	createSwarmTool({
		description:
			'Run curator phase analysis and optionally apply knowledge recommendations. ' +
			'Call this after reviewing a phase to apply knowledge updates. ' +
			'If recommendations is provided, applies them via applyCuratorKnowledgeUpdates.',
		args: {
			phase: tool.schema
				.number()
				.int()
				.min(1)
				.describe('Phase number to analyze'),
			recommendations: tool.schema
				.array(
					tool.schema.object({
						action: tool.schema.enum([
							'promote',
							'archive',
							'flag_contradiction',
						]),
						entry_id: tool.schema.string().optional(),
						lesson: tool.schema.string(),
						reason: tool.schema.string(),
					}),
				)
				.optional()
				.describe(
					'Knowledge recommendations to apply. If omitted, only collects digest data.',
				),
		},
		execute: async (args: unknown, directory: string): Promise<string> => {
			const typedArgs = args as {
				phase: number;
				recommendations?: KnowledgeRecommendation[];
			};

			try {
				// Validate phase
				if (!Number.isInteger(typedArgs.phase) || typedArgs.phase < 1) {
					return JSON.stringify(
						{ error: 'phase must be a positive integer >= 1' },
						null,
						2,
					);
				}

				// Validate recommendations actions if provided
				if (typedArgs.recommendations) {
					const validActions = ['promote', 'archive', 'flag_contradiction'];
					for (const rec of typedArgs.recommendations) {
						if (!validActions.includes(rec.action)) {
							return JSON.stringify(
								{
									error: `Invalid recommendation action: ${rec.action}`,
								},
								null,
								2,
							);
						}
					}
				}

				const { config } = loadPluginConfigWithMeta(directory);
				const curatorConfig = CuratorConfigSchema.parse(config.curator ?? {});
				const knowledgeConfig = KnowledgeConfigSchema.parse(
					config.knowledge ?? {},
				);

				// Run the curator phase analysis (collects digest + compliance)
				const curatorResult = await runCuratorPhase(
					directory,
					typedArgs.phase,
					[], // agentsDispatched — empty for on-demand analysis
					curatorConfig,
					{},
				);

				let applied = 0;
				let skipped = 0;

				// Apply recommendations if provided
				if (typedArgs.recommendations && typedArgs.recommendations.length > 0) {
					const result = await applyCuratorKnowledgeUpdates(
						directory,
						typedArgs.recommendations,
						knowledgeConfig,
					);
					applied = result.applied;
					skipped = result.skipped;
				}

				return JSON.stringify(
					{
						phase_digest: curatorResult.digest,
						compliance_count: curatorResult.compliance.length,
						applied,
						skipped,
					},
					null,
					2,
				);
			} catch (error) {
				return JSON.stringify(
					{
						error: String(error),
						phase: typedArgs.phase,
					},
					null,
					2,
				);
			}
		},
	});

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
						error: error instanceof Error ? error.message : String(error),
						phase: typedArgs.phase,
					},
					null,
					2,
				);
			}
		},
	});

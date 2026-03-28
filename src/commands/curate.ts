/**
 * Handles the /swarm curate command.
 * Runs knowledge curation and hive promotion review on-demand.
 *
 * Usage:
 * - /swarm curate — Run curation on existing swarm entries
 *
 * Returns a summary with counts, or zero counts for empty-state.
 */

import { KnowledgeConfigSchema } from '../config/schema.js';
import { checkHivePromotions } from '../hooks/hive-promoter.js';
import {
	readKnowledge,
	resolveSwarmKnowledgePath,
} from '../hooks/knowledge-store.js';
import type {
	KnowledgeConfig,
	SwarmKnowledgeEntry,
} from '../hooks/knowledge-types.js';

export interface CurationSummary {
	timestamp: string;
	new_promotions: number;
	encounters_incremented: number;
	advancements: number;
	total_hive_entries: number;
}

/**
 * Handles the /swarm curate command.
 * Runs hive promotion review on existing swarm entries.
 */
export async function handleCurateCommand(
	directory: string,
	_args: string[],
): Promise<string> {
	try {
		// Use default config for manual curation
		const config: KnowledgeConfig = KnowledgeConfigSchema.parse({});

		// Read existing swarm entries
		const swarmPath = resolveSwarmKnowledgePath(directory);
		const swarmEntries =
			(await readKnowledge<SwarmKnowledgeEntry>(swarmPath)) ?? [];

		// Run hive promotion check
		const summary = await checkHivePromotions(swarmEntries, config);

		// Return human-readable summary
		// Zero counts indicate empty-state (nothing to promote)
		return formatCurationSummary(summary);
	} catch (error) {
		// Return clear user-facing error message
		if (error instanceof Error) {
			return `❌ Curation failed: ${error.message}`;
		}
		return `❌ Curation failed: ${error instanceof Error ? error.message : String(error)}`;
	}
}

/**
 * Format curation summary for human-readable output.
 * Always returns the same shape, with zero counts for empty-state.
 */
function formatCurationSummary(summary: CurationSummary): string {
	const lines = [
		`📚 Curation complete`,
		``,
		`New promotions: ${summary.new_promotions}`,
		`Encounters incremented: ${summary.encounters_incremented}`,
		`Advancements: ${summary.advancements}`,
		`Total hive entries: ${summary.total_hive_entries}`,
	];

	return lines.join('\n');
}

/**
 * Handles the /swarm curate command.
 * Runs knowledge curation and hive promotion review on-demand.
 *
 * Usage:
 * - /swarm curate — Run curation on existing swarm entries
 *
 * Returns a summary with counts, or zero counts for empty-state.
 */
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
export declare function handleCurateCommand(directory: string, _args: string[]): Promise<string>;

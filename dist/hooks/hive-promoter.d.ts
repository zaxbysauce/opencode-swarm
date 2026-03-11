/** Hive promoter hook for opencode-swarm v6.17 two-tier knowledge system. */
import type { KnowledgeConfig, SwarmKnowledgeEntry } from './knowledge-types.js';
/** Hive promotion summary for curator state */
export interface HivePromotionSummary {
    timestamp: string;
    new_promotions: number;
    encounters_incremented: number;
    advancements: number;
    total_hive_entries: number;
}
/**
 * Main promotion logic: checks swarm entries and promotes eligible ones to hive.
 * Also updates existing hive entries with new project confirmations.
 * Returns a summary of the promotion activity for curator state.
 *
 * @note The 'hive-fast-track' tag is treated as privileged — it bypasses the
 *   3-phase confirmation requirement. It should only be set by authorized tooling
 *   (inferTags() never produces it automatically).
 */
export declare function checkHivePromotions(swarmEntries: SwarmKnowledgeEntry[], config: KnowledgeConfig): Promise<HivePromotionSummary>;
/**
 * Create a hook that promotes swarm entries to the hive.
 * The hook fires unconditionally - the caller decides when to invoke it.
 */
export declare function createHivePromoterHook(directory: string, config: KnowledgeConfig): (input: unknown, output: unknown) => Promise<void>;
/**
 * Promote a lesson directly to the hive (manual promotion).
 * @param directory - Project directory
 * @param lesson - The lesson text to promote
 * @param category - Optional category (defaults to 'process')
 * @returns Confirmation message
 */
export declare function promoteToHive(directory: string, lesson: string, category?: string): Promise<string>;
/**
 * Promote a lesson from swarm knowledge to hive.
 * @param directory - Project directory
 * @param lessonId - The ID of the lesson to promote from swarm
 * @returns Confirmation message
 */
export declare function promoteFromSwarm(directory: string, lessonId: string): Promise<string>;

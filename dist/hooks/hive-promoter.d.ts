/** Hive promoter hook for opencode-swarm v6.17 two-tier knowledge system. */
import type { KnowledgeConfig, SwarmKnowledgeEntry } from './knowledge-types.js';
/**
 * Main promotion logic: checks swarm entries and promotes eligible ones to hive.
 * Also updates existing hive entries with new project confirmations.
 *
 * @note The 'hive-fast-track' tag is treated as privileged — it bypasses the
 *   3-phase confirmation requirement. It should only be set by authorized tooling
 *   (inferTags() never produces it automatically).
 */
export declare function checkHivePromotions(swarmEntries: SwarmKnowledgeEntry[], config: KnowledgeConfig): Promise<void>;
/**
 * Create a hook that promotes swarm entries to the hive.
 * The hook fires unconditionally - the caller decides when to invoke it.
 */
export declare function createHivePromoterHook(directory: string, config: KnowledgeConfig): (input: unknown, output: unknown) => Promise<void>;

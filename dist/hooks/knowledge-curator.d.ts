/** Knowledge curator hook for opencode-swarm v6.17 two-tier knowledge system. */
import type { KnowledgeConfig } from './knowledge-types.js';
/**
 * Curate and store swarm knowledge entries from lessons.
 */
export declare function curateAndStoreSwarm(lessons: string[], projectName: string, phaseInfo: {
    phase_number: number;
}, directory: string, config: KnowledgeConfig): Promise<void>;
/**
 * Auto-promote swarm entries based on phase confirmations and age.
 */
export declare function runAutoPromotion(directory: string, config: KnowledgeConfig): Promise<void>;
/**
 * Create the knowledge curator hook.
 * Watches for writes to .swarm/plan.md and extracts lessons from the retrospective section.
 */
export declare function createKnowledgeCuratorHook(directory: string, config: KnowledgeConfig): (input: unknown, output: unknown) => Promise<void>;

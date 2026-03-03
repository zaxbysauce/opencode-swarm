/** One-time migration from .swarm/context.md → .swarm/knowledge.jsonl for existing projects. */
import type { KnowledgeConfig } from './knowledge-types.js';
export interface MigrationResult {
    migrated: boolean;
    entriesMigrated: number;
    entriesDropped: number;
    entriesTotal: number;
    skippedReason?: 'sentinel-exists' | 'no-context-file' | 'empty-context';
}
export declare function migrateContextToKnowledge(directory: string, config: KnowledgeConfig): Promise<MigrationResult>;

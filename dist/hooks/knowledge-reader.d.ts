/** Read path for the opencode-swarm v6.17 two-tier knowledge system.
 * Merges swarm + hive knowledge, deduplicates (hive wins), ranks by composite score,
 * and provides utility tracking.
 */
import type { KnowledgeConfig, KnowledgeEntryBase } from './knowledge-types.js';
export interface ProjectContext {
    projectName: string;
    currentPhase: string;
    techStack?: string[];
    recentErrors?: string[];
}
export interface RankedEntry extends KnowledgeEntryBase {
    tier: 'swarm' | 'hive';
    relevanceScore: number;
    finalScore: number;
}
export declare function readMergedKnowledge(directory: string, config: KnowledgeConfig, context?: ProjectContext): Promise<RankedEntry[]>;
export declare function updateRetrievalOutcome(directory: string, phaseInfo: string, phaseSucceeded: boolean): Promise<void>;

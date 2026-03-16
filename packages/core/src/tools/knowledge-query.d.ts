/** Knowledge query tool for architect-level access to swarm and hive knowledge.
 * Provides filtered, formatted text output for knowledge retrieval.
 */
export declare const DEFAULT_LIMIT = 10;
declare const VALID_CATEGORIES: readonly ["process", "architecture", "tooling", "security", "testing", "debugging", "performance", "integration", "other"];
declare const VALID_STATUSES: readonly ["candidate", "established", "promoted"];
declare const VALID_TIERS: readonly ["swarm", "hive", "all"];
type TierInput = (typeof VALID_TIERS)[number];
type StatusInput = (typeof VALID_STATUSES)[number];
type KnowledgeCategory = (typeof VALID_CATEGORIES)[number];
export declare function validateTierInput(tier: unknown): TierInput | null;
export declare function validateStatusInput(status: unknown): StatusInput | null;
export declare function validateCategoryInput(category: unknown): KnowledgeCategory | null;
export declare function validateMinScore(score: unknown): number | null;
export declare function validateLimit(limit: unknown): number;
interface FilterOptions {
    status?: StatusInput;
    category?: KnowledgeCategory;
    minScore?: number;
}
interface SwarmKnowledgeEntry {
    id: string;
    tier: string;
    lesson: string;
    category: string;
    status: string;
    confidence: number;
    confirmed_by: string[];
    project_name: string;
}
interface HiveKnowledgeEntry {
    id: string;
    tier: string;
    lesson: string;
    category: string;
    status: string;
    confidence: number;
    encounter_score: number;
    source_project: string;
    confirmed_by: string[];
}
export declare function filterSwarmEntries(entries: SwarmKnowledgeEntry[], filters: FilterOptions): SwarmKnowledgeEntry[];
export declare function filterHiveEntries(entries: HiveKnowledgeEntry[], filters: FilterOptions): HiveKnowledgeEntry[];
export declare function formatSwarmEntry(entry: SwarmKnowledgeEntry): string;
export declare function formatHiveEntry(entry: HiveKnowledgeEntry): string;
export {};

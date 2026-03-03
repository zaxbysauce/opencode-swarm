/** Type definitions for the opencode-swarm v6.17 two-tier knowledge system. */
export type KnowledgeCategory = 'process' | 'architecture' | 'tooling' | 'security' | 'testing' | 'debugging' | 'performance' | 'integration' | 'other';
export interface PhaseConfirmationRecord {
    phase_number: number;
    confirmed_at: string;
    project_name: string;
}
export interface ProjectConfirmationRecord {
    project_name: string;
    confirmed_at: string;
    phase_number?: number;
}
export interface RetrievalOutcome {
    applied_count: number;
    succeeded_after_count: number;
    failed_after_count: number;
    last_applied_at?: string;
}
export interface KnowledgeEntryBase {
    id: string;
    tier: 'swarm' | 'hive';
    lesson: string;
    category: KnowledgeCategory;
    tags: string[];
    scope: string;
    confidence: number;
    status: 'candidate' | 'established' | 'promoted';
    confirmed_by: PhaseConfirmationRecord[] | ProjectConfirmationRecord[];
    retrieval_outcomes: RetrievalOutcome;
    schema_version: number;
    created_at: string;
    updated_at: string;
    hive_eligible?: boolean;
    auto_generated?: boolean;
}
export interface SwarmKnowledgeEntry extends KnowledgeEntryBase {
    tier: 'swarm';
    confirmed_by: PhaseConfirmationRecord[];
    project_name: string;
}
export interface HiveKnowledgeEntry extends KnowledgeEntryBase {
    tier: 'hive';
    confirmed_by: ProjectConfirmationRecord[];
    source_project: string;
}
export interface RejectedLesson {
    id: string;
    lesson: string;
    rejection_reason: string;
    rejected_at: string;
    rejection_layer: 1 | 2 | 3;
}
export interface KnowledgeConfig {
    /** Enable or disable the entire knowledge system. Default: true */
    enabled: boolean;
    /** Maximum entries to keep in swarm knowledge.jsonl. Default: 100 */
    swarm_max_entries: number;
    /** Maximum entries to keep in hive shared-learnings.jsonl. Default: 200 */
    hive_max_entries: number;
    /** Days before auto-promotion to hive tier. Default: 90 */
    auto_promote_days: number;
    /** Maximum knowledge entries to inject per architect message. Default: 5 */
    max_inject_count: number;
    /** Jaccard bigram similarity threshold for deduplication. Default: 0.6 */
    dedup_threshold: number;
    /** Scope filters to apply when reading knowledge. Default: ['global'] */
    scope_filter: string[];
    /** Enable hive (cross-project) tier reads and writes. Default: true */
    hive_enabled: boolean;
    /** Maximum rejected lesson fingerprints to retain. Default: 20 */
    rejected_max_entries: number;
    /** Enable validation gate before storing lessons. Default: true */
    validation_enabled: boolean;
    /** Confidence threshold for marking an entry evergreen. Default: 0.9 */
    evergreen_confidence: number;
    /** Utility score threshold for marking an entry evergreen. Default: 0.8 */
    evergreen_utility: number;
    /** Utility score at or below which an entry is considered low-utility. Default: 0.3 */
    low_utility_threshold: number;
    /** Minimum retrieval count before utility scoring begins. Default: 3 */
    min_retrievals_for_utility: number;
    /** JSONL schema version. Default: 1 */
    schema_version: number;
}
export interface MessageInfo {
    role: string;
    agent?: string;
    sessionID?: string;
    modelID?: string;
    providerID?: string;
    [key: string]: unknown;
}
export interface MessagePart {
    type: string;
    text?: string;
    [key: string]: unknown;
}
export interface MessageWithParts {
    info: MessageInfo;
    parts: MessagePart[];
}

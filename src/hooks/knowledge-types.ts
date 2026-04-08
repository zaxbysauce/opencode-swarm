/** Type definitions for the opencode-swarm v6.17 two-tier knowledge system. */

export type KnowledgeCategory =
	| 'process'
	| 'architecture'
	| 'tooling'
	| 'security'
	| 'testing'
	| 'debugging'
	| 'performance'
	| 'integration'
	| 'other';

export interface PhaseConfirmationRecord {
	phase_number: number;
	confirmed_at: string; // ISO 8601
	project_name: string;
}

export interface ProjectConfirmationRecord {
	project_name: string;
	confirmed_at: string; // ISO 8601
	phase_number?: number;
}

export interface RetrievalOutcome {
	applied_count: number;
	succeeded_after_count: number;
	failed_after_count: number;
	last_applied_at?: string; // ISO 8601
}

export interface KnowledgeEntryBase {
	id: string; // UUID v4
	tier: 'swarm' | 'hive';
	lesson: string; // 15–280 chars
	category: KnowledgeCategory;
	tags: string[];
	scope: string; // 'global' or 'stack:<name>'
	confidence: number; // 0.0–1.0
	status: 'candidate' | 'established' | 'promoted' | 'archived';
	confirmed_by: PhaseConfirmationRecord[] | ProjectConfirmationRecord[];
	retrieval_outcomes: RetrievalOutcome;
	schema_version: number; // current: 1
	created_at: string; // ISO 8601
	updated_at: string; // ISO 8601
	hive_eligible?: boolean; // set true when ready for hive promotion
	auto_generated?: boolean; // true if created without human review
}

export interface SwarmKnowledgeEntry extends KnowledgeEntryBase {
	tier: 'swarm';
	confirmed_by: PhaseConfirmationRecord[];
	project_name: string;
}

export interface HiveKnowledgeEntry extends KnowledgeEntryBase {
	tier: 'hive';
	confirmed_by: ProjectConfirmationRecord[];
	source_project: string; // project where it originated
	/** Weighted encounter score for hive advancement. Starts at 1.0 for originating project. */
	encounter_score: number;
	/** @deprecated Legacy field for backward compatibility. Use encounter_score for weighting. */
	encounter_count?: number;
}

export interface RejectedLesson {
	id: string;
	lesson: string;
	rejection_reason: string;
	rejected_at: string; // ISO 8601
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
	/** Maximum total chars for the entire injection block. Default: 2000 */
	inject_char_budget?: number;
	/** Minimum headroom chars required before knowledge injection activates. Default: 300 */
	context_budget_threshold?: number;
	/** Maximum display chars per lesson at injection time. Default: 120 */
	max_lesson_display_chars?: number;
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
	/** Weighted scoring: multiplier for encounters from the source project. Default: 1.0 */
	same_project_weight: number;
	/** Weighted scoring: multiplier for encounters from other projects. Default: 0.5 */
	cross_project_weight: number;
	/** Weighted scoring: minimum encounter score floor. Default: 0.1 */
	min_encounter_score: number;
	/** Weighted scoring: initial score for newly promoted hive entries. Default: 1.0 */
	initial_encounter_score: number;
	/** Weighted scoring: score increment per encounter. Default: 0.1 */
	encounter_increment: number;
	/** Weighted scoring: maximum encounter score cap. Default: 10.0 */
	max_encounter_score: number;
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

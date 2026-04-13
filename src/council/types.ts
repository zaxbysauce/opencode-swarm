/**
 * Work Complete Council — data contracts.
 *
 * Flat, stable schema — no nested generics. Designed for reliable LLM output.
 * No business logic, no I/O. Only types, interfaces, and defaults.
 */

export type CouncilVerdict = 'APPROVE' | 'CONCERNS' | 'REJECT';

export type CouncilFindingSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export type CouncilFindingCategory =
	| 'logic'
	| 'edge_case'
	| 'error_handling'
	| 'spec_compliance'
	| 'security'
	| 'maintainability'
	| 'naming'
	| 'domain'
	| 'test_gap'
	| 'test_quality'
	| 'mutation_gap'
	| 'adversarial_gap'
	| 'other';

export type CouncilAgent = 'critic' | 'reviewer' | 'sme' | 'test_engineer';

export interface CouncilFinding {
	severity: CouncilFindingSeverity;
	category: CouncilFindingCategory;
	/** e.g. "src/tools/convene-council.ts:42" */
	location: string;
	/** Human-readable explanation */
	detail: string;
	/** Concrete quote or line reference */
	evidence: string;
}

export interface CouncilMemberVerdict {
	agent: CouncilAgent;
	verdict: CouncilVerdict;
	/** Confidence 0.0–1.0 */
	confidence: number;
	findings: CouncilFinding[];
	/** Criteria IDs from pre-declaration (e.g. ["C1","C3"]) */
	criteriaAssessed: string[];
	/** Criteria IDs that failed */
	criteriaUnmet: string[];
	durationMs: number;
}

export interface CouncilSynthesis {
	taskId: string;
	swarmId: string;
	/** ISO 8601 */
	timestamp: string;
	overallVerdict: CouncilVerdict;
	vetoedBy: CouncilAgent[] | null;
	memberVerdicts: CouncilMemberVerdict[];
	unresolvedConflicts: string[];
	/** Severity HIGH + MEDIUM from veto members */
	requiredFixes: CouncilFinding[];
	/** Severity LOW or from non-veto members */
	advisoryFindings: CouncilFinding[];
	/** Single markdown document sent to coder */
	unifiedFeedbackMd: string;
	/** 1-indexed */
	roundNumber: number;
	allCriteriaMet: boolean;
}

export interface CouncilCriteriaItem {
	id: string;
	description: string;
	mandatory: boolean;
}

export interface CouncilCriteria {
	taskId: string;
	criteria: CouncilCriteriaItem[];
	/** ISO 8601 */
	declaredAt: string;
}

/** Config shape — matched in schema.ts via CouncilConfigSchema. */
export interface CouncilConfig {
	enabled: boolean;
	/** Default 3 */
	maxRounds: number;
	/** Default 30_000 */
	parallelTimeoutMs: number;
	/** Default true — any REJECT blocks */
	vetoPriority: boolean;
}

export const COUNCIL_DEFAULTS: CouncilConfig = {
	// OFF by default — feature flag
	enabled: false,
	maxRounds: 3,
	parallelTimeoutMs: 30_000,
	vetoPriority: true,
};

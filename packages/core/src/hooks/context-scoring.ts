/**
 * Context Scoring Utility
 *
 * Pure scoring/ranking helpers for context injection budget.
 * Implements deterministic, reproducible candidate ranking based on configurable weights.
 */

// Content type for token estimation
export type ContentType = 'prose' | 'code' | 'markdown' | 'json';

// Candidate kinds
export type CandidateKind =
	| 'phase'
	| 'task'
	| 'decision'
	| 'evidence'
	| 'agent_context';

// Context candidate input
export interface ContextCandidate {
	id: string;
	kind: CandidateKind;
	text: string;
	tokens: number; // pre-computed, not recalculated
	priority: number;
	metadata: {
		contentType: ContentType;
		dependencyDepth?: number; // for task-related items
		decisionAgeHours?: number; // hours since decision
		isCurrentTask?: boolean;
		isBlockedTask?: boolean;
		hasFailure?: boolean;
		hasSuccess?: boolean;
		hasEvidence?: boolean;
	};
}

// Ranked result
export interface RankedCandidate extends ContextCandidate {
	score: number;
}

// Scoring config (subset of full config)
export interface ScoringWeights {
	phase: number;
	current_task: number;
	blocked_task: number;
	recent_failure: number;
	recent_success: number;
	evidence_presence: number;
	decision_recency: number;
	dependency_proximity: number;
}

export interface DecisionDecayConfig {
	mode: 'linear' | 'exponential';
	half_life_hours: number;
}

export interface TokenRatios {
	prose: number;
	code: number;
	markdown: number;
	json: number;
}

export interface ScoringConfig {
	enabled: boolean;
	max_candidates: number;
	weights: ScoringWeights;
	decision_decay: DecisionDecayConfig;
	token_ratios: TokenRatios;
}

/**
 * Calculate the decision age factor based on decay mode and half-life.
 *
 * @param ageHours - Hours since decision was made
 * @param config - Decision decay configuration
 * @returns Age factor between 0 and 1 (1 = recent, 0 = very old)
 */
function calculateAgeFactor(
	ageHours: number,
	config: DecisionDecayConfig,
): number {
	if (ageHours <= 0) {
		return 1;
	}

	if (config.mode === 'exponential') {
		// Exponential: 2^(-age_hours / half_life_hours)
		return 2 ** (-ageHours / config.half_life_hours);
	} else {
		// Linear: max(0, 1 - (age_hours / (half_life_hours * 2)))
		// Linear goes to 0 at 2x half-life
		const linearFactor = 1 - ageHours / (config.half_life_hours * 2);
		return Math.max(0, linearFactor);
	}
}

/**
 * Calculate the base score for a candidate using feature flags and weights.
 *
 * Features:
 * - phase: kind === 'phase' ? 1 : 0
 * - current_task: metadata.isCurrentTask ? 1 : 0
 * - blocked_task: metadata.isBlockedTask ? 1 : 0
 * - recent_failure: metadata.hasFailure ? 1 : 0
 * - recent_success: metadata.hasSuccess ? 1 : 0
 * - evidence_presence: metadata.hasEvidence ? 1 : 0
 * - decision_recency: kind === 'decision' ? age_factor : 0
 * - dependency_proximity: 1 / (1 + (metadata.dependencyDepth ?? 0))
 *
 * @param candidate - The context candidate to score
 * @param weights - Scoring weights configuration
 * @param decayConfig - Decision decay configuration
 * @returns The calculated base score
 */
function calculateBaseScore(
	candidate: ContextCandidate,
	weights: ScoringWeights,
	decayConfig: DecisionDecayConfig,
): number {
	const { kind, metadata } = candidate;

	// Calculate feature flags
	const phase = kind === 'phase' ? 1 : 0;
	const currentTask = metadata.isCurrentTask ? 1 : 0;
	const blockedTask = metadata.isBlockedTask ? 1 : 0;
	const recentFailure = metadata.hasFailure ? 1 : 0;
	const recentSuccess = metadata.hasSuccess ? 1 : 0;
	const evidencePresence = metadata.hasEvidence ? 1 : 0;

	// Calculate decision recency (age factor for decisions, 0 otherwise)
	let decisionRecency = 0;
	if (kind === 'decision' && metadata.decisionAgeHours !== undefined) {
		decisionRecency = calculateAgeFactor(
			metadata.decisionAgeHours,
			decayConfig,
		);
	}

	// Calculate dependency proximity (inverse of depth)
	const dependencyProximity = 1 / (1 + (metadata.dependencyDepth ?? 0));

	// Base score = sum of (weight_i * feature_i)
	return (
		weights.phase * phase +
		weights.current_task * currentTask +
		weights.blocked_task * blockedTask +
		weights.recent_failure * recentFailure +
		weights.recent_success * recentSuccess +
		weights.evidence_presence * evidencePresence +
		weights.decision_recency * decisionRecency +
		weights.dependency_proximity * dependencyProximity
	);
}

/**
 * Rank context candidates by importance score.
 *
 * Scoring formula:
 * - base_score = sum of (weight * feature_flag)
 * - For items with dependency depth: adjusted_score = base_score / (1 + depth)
 * - For decisions with age: age_factor = 2^(-age_hours / half_life_hours), score = decision_recency * age_factor
 *
 * Tie-breaker: score desc → priority desc → id asc (stable sort)
 *
 * @param candidates - Array of context candidates
 * @param config - Scoring configuration
 * @returns Ranked candidates (truncated to max_candidates, original order if disabled)
 */
export function rankCandidates(
	candidates: ContextCandidate[],
	config: ScoringConfig,
): RankedCandidate[] {
	// Edge case: disabled mode - return candidates unchanged (no score computation)
	if (!config.enabled) {
		return candidates.map((c) => ({ ...c, score: 0 }));
	}

	// Edge case: empty candidates - return empty array
	if (candidates.length === 0) {
		return [];
	}

	// Calculate scores for all candidates
	const scored: RankedCandidate[] = candidates.map((candidate) => {
		const score = calculateBaseScore(
			candidate,
			config.weights,
			config.decision_decay,
		);
		return { ...candidate, score };
	});

	// Sort by: score DESC, priority DESC, id ASC (stable sort)
	scored.sort((a, b) => {
		// Primary: score descending
		if (b.score !== a.score) {
			return b.score - a.score;
		}

		// Secondary: priority descending
		if (b.priority !== a.priority) {
			return b.priority - a.priority;
		}

		// Tertiary: id ascending (alphabetical, for determinism)
		return a.id.localeCompare(b.id);
	});

	// Truncate to max_candidates after sorting
	return scored.slice(0, config.max_candidates);
}

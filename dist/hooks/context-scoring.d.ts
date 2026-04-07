/**
 * Context Scoring Utility
 *
 * Pure scoring/ranking helpers for context injection budget.
 * Implements deterministic, reproducible candidate ranking based on configurable weights.
 */
export type ContentType = 'prose' | 'code' | 'markdown' | 'json';
export type CandidateKind = 'phase' | 'task' | 'decision' | 'evidence' | 'agent_context';
export interface ContextCandidate {
    id: string;
    kind: CandidateKind;
    text: string;
    tokens: number;
    priority: number;
    metadata: {
        contentType: ContentType;
        dependencyDepth?: number;
        decisionAgeHours?: number;
        isCurrentTask?: boolean;
        isBlockedTask?: boolean;
        hasFailure?: boolean;
        hasSuccess?: boolean;
        hasEvidence?: boolean;
    };
}
export interface RankedCandidate extends ContextCandidate {
    score: number;
}
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
export declare function rankCandidates(candidates: ContextCandidate[], config: ScoringConfig): RankedCandidate[];

/**
 * Curator core — file I/O for curator summary persistence.
 * Extended incrementally: filterPhaseEvents, checkPhaseCompliance,
 * runCuratorInit, runCuratorPhase, applyCuratorKnowledgeUpdates added in subsequent tasks.
 */
import type { ComplianceObservation, CuratorConfig, CuratorInitResult, CuratorPhaseResult, CuratorSummary, KnowledgeRecommendation } from './curator-types.js';
import type { KnowledgeConfig } from './knowledge-types.js';
/**
 * Read curator summary from .swarm/curator-summary.json
 * @param directory - The workspace directory
 * @returns CuratorSummary if valid, null if missing or invalid
 */
export declare function readCuratorSummary(directory: string): Promise<CuratorSummary | null>;
/**
 * Write curator summary to .swarm/curator-summary.json
 * @param directory - The workspace directory
 * @param summary - The curator summary to write
 */
export declare function writeCuratorSummary(directory: string, summary: CuratorSummary): Promise<void>;
/**
 * Filter events from JSONL by phase or timestamp.
 * @param eventsJsonl - Raw JSONL string of events
 * @param phase - Phase number to filter by
 * @param sinceTimestamp - Optional ISO 8601 timestamp to filter events after
 * @returns Array of parsed event objects
 */
export declare function filterPhaseEvents(eventsJsonl: string, phase: number, sinceTimestamp?: string): object[];
/**
 * Check compliance for a phase based on events and dispatched agents.
 * @param phaseEvents - Array of events for the phase
 * @param agentsDispatched - List of agent names that were dispatched
 * @param requiredAgents - List of required agent names for this phase
 * @param phase - Phase number
 * @returns Array of compliance observations
 */
export declare function checkPhaseCompliance(phaseEvents: object[], agentsDispatched: string[], requiredAgents: string[], phase: number): ComplianceObservation[];
/**
 * Prepare curator init data: reads prior summary, knowledge entries, and context.md.
 * Returns a structured briefing result. Does NOT make LLM calls.
 * The caller (phase-monitor integration) is responsible for the actual agent delegation.
 * @param directory - The workspace directory
 * @param config - Curator configuration
 * @returns CuratorInitResult with briefing text, contradictions, and stats
 */
export declare function runCuratorInit(directory: string, config: CuratorConfig): Promise<CuratorInitResult>;
/**
 * Run curator phase analysis: reads events, runs compliance, updates and writes summary.
 * Does NOT make LLM calls. The caller is responsible for agent delegation.
 * @param directory - The workspace directory
 * @param phase - The phase number that just completed
 * @param agentsDispatched - List of agent names dispatched in this phase
 * @param config - Curator configuration
 * @param knowledgeConfig - Knowledge configuration (used for knowledge path resolution)
 * @returns CuratorPhaseResult with digest, compliance, and recommendations
 */
export declare function runCuratorPhase(directory: string, phase: number, agentsDispatched: string[], _config: CuratorConfig, _knowledgeConfig: {
    directory?: string;
}): Promise<CuratorPhaseResult>;
/**
 * Apply curator knowledge recommendations: promote, archive, or flag contradictions.
 * Uses readKnowledge + rewriteKnowledge pattern for atomic updates.
 * @param directory - The workspace directory
 * @param recommendations - Array of knowledge recommendations to apply
 * @param knowledgeConfig - Knowledge configuration (for path resolution)
 * @returns Counts of applied and skipped recommendations
 */
export declare function applyCuratorKnowledgeUpdates(directory: string, recommendations: KnowledgeRecommendation[], _knowledgeConfig: KnowledgeConfig): Promise<{
    applied: number;
    skipped: number;
}>;

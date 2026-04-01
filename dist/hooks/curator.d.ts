/**
 * Curator core — file I/O for curator summary persistence.
 * Extended incrementally: filterPhaseEvents, checkPhaseCompliance,
 * runCuratorInit, runCuratorPhase, applyCuratorKnowledgeUpdates added in subsequent tasks.
 *
 * LLM delegation: runCuratorPhase and runCuratorInit accept an optional llmDelegate
 * callback for LLM-based analysis. When provided, the prepared data context is sent
 * to the explorer agent in CURATOR_PHASE/CURATOR_INIT mode for richer analysis.
 * When the delegate is absent or fails, falls back to data-only behavior.
 */
import type { ComplianceObservation, CuratorConfig, CuratorInitResult, CuratorPhaseResult, CuratorSummary, KnowledgeRecommendation } from './curator-types.js';
import type { KnowledgeConfig } from './knowledge-types.js';
/**
 * Optional LLM delegate callback type.
 * Takes a system prompt and user input, returns the LLM output text.
 * Used to delegate analysis to the explorer agent in CURATOR mode.
 */
export type CuratorLLMDelegate = (systemPrompt: string, userInput: string, signal?: AbortSignal) => Promise<string>;
/**
 * Parse KNOWLEDGE_UPDATES section from curator LLM output.
 * Expected format per line: "- [action] [entry_id or "new"]: [reason]"
 */
export declare function parseKnowledgeRecommendations(llmOutput: string): KnowledgeRecommendation[];
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
 * When an llmDelegate is provided, delegates to the explorer agent in CURATOR_INIT mode
 * for LLM-based analysis that enhances the data-only briefing.
 * @param directory - The workspace directory
 * @param config - Curator configuration
 * @param llmDelegate - Optional LLM delegate for enhanced analysis
 * @returns CuratorInitResult with briefing text, contradictions, and stats
 */
export declare function runCuratorInit(directory: string, config: CuratorConfig, llmDelegate?: CuratorLLMDelegate): Promise<CuratorInitResult>;
/**
 * Run curator phase analysis: reads events, runs compliance, updates and writes summary.
 * When an llmDelegate is provided, delegates to the explorer agent in CURATOR_PHASE mode
 * for LLM-based architectural drift analysis and knowledge recommendations.
 * @param directory - The workspace directory
 * @param phase - The phase number that just completed
 * @param agentsDispatched - List of agent names dispatched in this phase
 * @param config - Curator configuration
 * @param knowledgeConfig - Knowledge configuration (used for knowledge path resolution)
 * @param llmDelegate - Optional LLM delegate for enhanced analysis
 * @returns CuratorPhaseResult with digest, compliance, and recommendations
 */
export declare function runCuratorPhase(directory: string, phase: number, agentsDispatched: string[], config: CuratorConfig, _knowledgeConfig: {
    directory?: string;
}, llmDelegate?: CuratorLLMDelegate): Promise<CuratorPhaseResult>;
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

/**
 * Context Budget Service
 *
 * Provides context budget monitoring for swarm sessions.
 * Tracks token usage across all context components and provides
 * warnings when approaching budget limits.
 */
/**
 * Context budget report with detailed token breakdown
 */
export interface ContextBudgetReport {
    /** ISO timestamp when the report was generated */
    timestamp: string;
    /** Tokens used for the assembled system prompt */
    systemPromptTokens: number;
    /** Tokens used for the plan cursor */
    planCursorTokens: number;
    /** Tokens used for knowledge entries */
    knowledgeTokens: number;
    /** Tokens used for run memory */
    runMemoryTokens: number;
    /** Tokens used for handoff content */
    handoffTokens: number;
    /** Tokens used for context.md */
    contextMdTokens: number;
    /** Total swarm context tokens (sum of all components) */
    swarmTotalTokens: number;
    /** Estimated number of turns in this session */
    estimatedTurnCount: number;
    /** Estimated total tokens for the session */
    estimatedSessionTokens: number;
    /** Budget usage percentage */
    budgetPct: number;
    /** Current budget status */
    status: 'ok' | 'warning' | 'critical';
    /** Recommendation message if any */
    recommendation: string | null;
}
/**
 * Configuration for context budget monitoring
 */
export interface ContextBudgetConfig {
    /** Enable or disable budget monitoring */
    enabled: boolean;
    /** Maximum token budget (default: 40000) */
    budgetTokens: number;
    /** Warning threshold percentage (default: 70) */
    warningPct: number;
    /** Critical threshold percentage (default: 90) */
    criticalPct: number;
    /** Warning mode: 'once', 'every', or 'interval' */
    warningMode: 'once' | 'every' | 'interval';
    /** Interval for warning mode (default: 20 turns) */
    warningIntervalTurns: number;
}
/**
 * Budget state for tracking warning suppression
 */
export interface BudgetState {
    /** Turn number when warning was last fired */
    warningFiredAtTurn: number | null;
    /** Turn number when critical was last fired */
    criticalFiredAtTurn: number | null;
    /** Turn number when context was last injected */
    lastInjectedAtTurn: number | null;
}
/**
 * Default context budget configuration
 */
export declare const DEFAULT_CONTEXT_BUDGET_CONFIG: ContextBudgetConfig;
/**
 * Estimate token count for text using character-based approximation
 *
 * @param text - The text to estimate tokens for
 * @returns Estimated token count (ceiling of chars / 3.5)
 */
export declare function estimateTokens(text: string): number;
/**
 * Get context budget report with detailed token breakdown
 *
 * @param directory - The swarm workspace directory
 * @param assembledSystemPrompt - The fully assembled system prompt
 * @param config - Budget configuration
 * @returns Context budget report
 */
export declare function getContextBudgetReport(directory: string, assembledSystemPrompt: string, config: ContextBudgetConfig): Promise<ContextBudgetReport>;
/**
 * Format budget warning message based on report
 *
 * @param report - The context budget report
 * @param directory - Directory for state persistence (required for suppression logic)
 * @param config - Budget configuration for warning mode settings
 * @returns Warning message string or null if suppressed/ok
 */
export declare function formatBudgetWarning(report: ContextBudgetReport, directory: string, config: ContextBudgetConfig): Promise<string | null>;
/**
 * Get default context budget config
 *
 * @returns Default configuration
 */
export declare function getDefaultConfig(): ContextBudgetConfig;

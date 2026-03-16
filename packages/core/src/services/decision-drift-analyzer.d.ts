/**
 * Decision Drift Analyzer Service
 *
 * Analyzes decisions from context.md and current plan state to detect:
 * 1. Stale decisions (age/phase mismatch or no recent confirmation)
 * 2. Contradictions (new decisions conflicting with existing ones)
 *
 * Results are integrated into architect context injection.
 */
/**
 * Drift signal severity levels
 */
export type DriftSeverity = 'warning' | 'error';
/**
 * A single decision extracted from context.md
 */
export interface Decision {
    /** Raw decision text */
    text: string;
    /** Phase when decision was made (extracted or inferred) */
    phase: number | null;
    /** Whether decision has a confirmation marker */
    confirmed: boolean;
    /** Timestamp if available */
    timestamp: string | null;
    /** Line number in source file */
    line: number;
}
/**
 * A detected drift signal
 */
export interface DriftSignal {
    /** Unique identifier for this drift */
    id: string;
    /** Severity level */
    severity: DriftSeverity;
    /** Type of drift */
    type: 'stale' | 'contradiction';
    /** Human-readable description */
    message: string;
    /** Source reference (file and line) */
    source: {
        file: string;
        line: number;
    };
    /** Related decisions if applicable */
    relatedDecisions?: string[];
    /** Suggested resolution hint */
    hint?: string;
}
/**
 * Result of drift analysis
 */
export interface DriftAnalysisResult {
    /** Whether drift was detected */
    hasDrift: boolean;
    /** List of drift signals */
    signals: DriftSignal[];
    /** Summary text for context injection */
    summary: string;
    /** Timestamp of analysis */
    analyzedAt: string;
}
/**
 * Configuration for drift analyzer
 */
export interface DriftAnalyzerConfig {
    /** Maximum age in phases before a decision is considered stale */
    staleThresholdPhases: number;
    /** Whether to detect contradictions */
    detectContradictions: boolean;
    /** Maximum signals to return */
    maxSignals: number;
}
/**
 * Default configuration
 */
export declare const DEFAULT_DRIFT_CONFIG: DriftAnalyzerConfig;
/**
 * Extract decisions from context.md content
 */
export declare function extractDecisionsFromContext(contextContent: string): Decision[];
/**
 * Simple keyword-based contradiction detection
 * Looks for decisions that express opposite intentions
 */
export declare function findContradictions(decisions: Decision[]): DriftSignal[];
/**
 * Analyze decision drift
 */
export declare function analyzeDecisionDrift(directory: string, config?: Partial<DriftAnalyzerConfig>): Promise<DriftAnalysisResult>;
/**
 * Format drift signals as a structured section for context injection
 * Returns bounded output suitable for LLM context
 */
export declare function formatDriftForContext(result: DriftAnalysisResult): string;

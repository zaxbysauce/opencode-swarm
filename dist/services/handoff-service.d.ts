/**
 * Handoff Service
 *
 * Provides structured handoff data for agent transitions between swarm sessions.
 * Reads from .swarm files to gather current state for context-efficient handoffs.
 */
/**
 * Pending QA state from agent sessions
 */
export interface PendingQA {
    taskId: string;
    lastFailure: string | null;
}
/**
 * Delegation chain entry
 */
export interface DelegationEntry {
    from: string;
    to: string;
    taskId: string;
    timestamp: number;
}
/**
 * Delegation state from session snapshot
 */
export interface DelegationState {
    activeChains: string[];
    delegationDepth: number;
    pendingHandoffs: string[];
}
/**
 * Structured handoff data for agent transitions
 */
export interface HandoffData {
    /** ISO timestamp when data was generated */
    generated: string;
    /** Current phase number or name */
    currentPhase: string | null;
    /** Current task ID being worked on */
    currentTask: string | null;
    /** List of incomplete task IDs */
    incompleteTasks: string[];
    /** Pending QA state */
    pendingQA: PendingQA | null;
    /** Active agent name */
    activeAgent: string | null;
    /** Recent decisions from context.md */
    recentDecisions: string[];
    /** Delegation state */
    delegationState: DelegationState | null;
}
/**
 * Get handoff data from the swarm directory.
 * Reads session state, plan, and context to build comprehensive handoff info.
 */
export declare function getHandoffData(directory: string): Promise<HandoffData>;
/**
 * Format handoff data as terse markdown for LLM consumption.
 * Targets under 2K tokens for efficient context injection.
 */
export declare function formatHandoffMarkdown(data: HandoffData): string;
/**
 * Format handoff data as a continuation prompt for new agent sessions.
 * Returns a terse markdown code block with essential context.
 */
export declare function formatContinuationPrompt(data: HandoffData): string;

/**
 * Shared state module for OpenCode Swarm plugin.
 * Provides a module-scoped singleton for cross-hook state sharing.
 *
 * This module is used by multiple hooks (tool.execute.before, tool.execute.after,
 * chat.message, system-enhancer) to share state like active agents, tool call tracking,
 * and delegation chains.
 */
/**
 * Represents a single tool call entry for tracking purposes
 */
export interface ToolCallEntry {
    tool: string;
    sessionID: string;
    callID: string;
    startTime: number;
}
/**
 * Aggregated statistics for a specific tool
 */
export interface ToolAggregate {
    tool: string;
    count: number;
    successCount: number;
    failureCount: number;
    totalDuration: number;
}
/**
 * Represents a delegation from one agent to another
 */
export interface DelegationEntry {
    from: string;
    to: string;
    timestamp: number;
}
/**
 * Represents per-session state for guardrail tracking
 */
export interface AgentSessionState {
    /** Which agent this session belongs to */
    agentName: string;
    /** Date.now() when session started */
    startTime: number;
    /** Timestamp of most recent tool call (for stale session eviction) */
    lastToolCallTime: number;
    /** Total tool calls in this session */
    toolCallCount: number;
    /** Consecutive errors (reset on success) */
    consecutiveErrors: number;
    /** Circular buffer of recent tool calls, max 20 entries */
    recentToolCalls: Array<{
        tool: string;
        argsHash: number;
        timestamp: number;
    }>;
    /** Whether a soft warning has been issued */
    warningIssued: boolean;
    /** Human-readable warning reason (set when warningIssued = true) */
    warningReason: string;
    /** Whether a hard limit has been triggered */
    hardLimitHit: boolean;
}
/**
 * Singleton state object for sharing data across hooks
 */
export declare const swarmState: {
    /** Active tool calls — keyed by callID for before→after correlation */
    activeToolCalls: Map<string, ToolCallEntry>;
    /** Aggregated tool usage stats — keyed by tool name */
    toolAggregates: Map<string, ToolAggregate>;
    /** Active agent per session — keyed by sessionID, updated by chat.message hook */
    activeAgent: Map<string, string>;
    /** Delegation chains per session — keyed by sessionID */
    delegationChains: Map<string, DelegationEntry[]>;
    /** Number of events since last flush */
    pendingEvents: number;
    /** Per-session guardrail state — keyed by sessionID */
    agentSessions: Map<string, AgentSessionState>;
};
/**
 * Reset all state to initial values - useful for testing
 */
export declare function resetSwarmState(): void;
/**
 * Start a new agent session with initialized guardrail state.
 * Also removes any stale sessions older than staleDurationMs.
 * @param sessionId - The session identifier
 * @param agentName - The agent associated with this session
 * @param staleDurationMs - Age threshold for stale session eviction (default: 120 min)
 */
export declare function startAgentSession(sessionId: string, agentName: string, staleDurationMs?: number): void;
/**
 * End an agent session by removing it from the state.
 * @param sessionId - The session identifier to remove
 */
export declare function endAgentSession(sessionId: string): void;
/**
 * Get an agent session state by session ID.
 * @param sessionId - The session identifier
 * @returns The AgentSessionState or undefined if not found
 */
export declare function getAgentSession(sessionId: string): AgentSessionState | undefined;
/**
 * Ensure a guardrail session exists for the given sessionID.
 * If one exists and agentName is provided and different, update it.
 * If none exists, create one.
 * Always updates lastToolCallTime.
 * @param sessionId - The session identifier
 * @param agentName - Optional agent name (if known)
 * @returns The AgentSessionState
 */
export declare function ensureAgentSession(sessionId: string, agentName?: string): AgentSessionState;

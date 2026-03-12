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
 * Per-task workflow state for gate progression tracking.
 * Transitions must be forward-only: idle → coder_delegated → pre_check_passed → reviewer_run → tests_run → complete
 */
export type TaskWorkflowState = 'idle' | 'coder_delegated' | 'pre_check_passed' | 'reviewer_run' | 'tests_run' | 'complete';
/**
 * Represents per-session state for guardrail tracking.
 * Budget fields (toolCallCount, consecutiveErrors, etc.) have moved to InvocationWindow.
 * This interface now tracks session-level metadata and window management.
 */
export interface AgentSessionState {
    /** Current agent identity for this session */
    agentName: string;
    /** Timestamp of most recent tool call (for session-level stale detection) */
    lastToolCallTime: number;
    /** Timestamp of most recent agent identity event (chat.message) */
    lastAgentEventTime: number;
    /** Whether active delegation is in progress for this session */
    delegationActive: boolean;
    /** Current active invocation ID for this agent */
    activeInvocationId: number;
    /** Last invocation ID by agent name (e.g., { "coder": 3, "reviewer": 1 }) */
    lastInvocationIdByAgent: Record<string, number>;
    /** Active invocation windows keyed by "${agentName}:${invId}" */
    windows: Record<string, InvocationWindow>;
    /** Last tool-call threshold at which a compaction hint was issued */
    lastCompactionHint: number;
    /** Count of architect direct writes to non-.swarm/ files */
    architectWriteCount: number;
    /** Last task ID that was delegated to coder (for zero-delegation detection) */
    lastCoderDelegationTaskId: string | null;
    /** Current task ID being worked on (set when coder delegation fires, used for per-task gate tracking) */
    currentTaskId: string | null;
    /** Gate names observed for current task (taskId → Set of gates) */
    gateLog: Map<string, Set<string>>;
    /** Reviewer delegations per phase (phaseNumber → count) */
    reviewerCallCount: Map<number, number>;
    /** Last gate failure for self-fix detection */
    lastGateFailure: {
        tool: string;
        taskId: string;
        timestamp: number;
    } | null;
    /** Task IDs for which partial gate warning has already been issued (prevents per-task spam) */
    partialGateWarningsIssuedForTask: Set<string>;
    /** Whether architect attempted self-fix write after gate failure */
    selfFixAttempted: boolean;
    /** Phases that have already received a catastrophic zero-reviewer warning */
    catastrophicPhaseWarnings: Set<number>;
    /** Number of consecutive coder delegations without reviewer/test_engineer between them */
    qaSkipCount: number;
    /** Task IDs skipped without QA (for audit trail), reset when reviewer/test_engineer fires */
    qaSkipTaskIds: string[];
    /** Per-task workflow state — taskId → current state */
    taskWorkflowStates: Map<string, TaskWorkflowState>;
    /** Last gate outcome for deliberation preamble injection */
    lastGateOutcome: {
        gate: string;
        taskId: string;
        passed: boolean;
        timestamp: number;
    } | null;
    /** Declared file scope for current coder task (null = no scope declared) */
    declaredCoderScope: string[] | null;
    /** Last scope violation message (null = no violation) */
    lastScopeViolation: string | null;
    /** Flag for one-shot scope violation warning injection in messagesTransform */
    scopeViolationDetected?: boolean;
    /** Files modified by the current coder task (populated by guardrails toolBefore/toolAfter, reset on new coder delegation) */
    modifiedFilesThisCoderTask: string[];
    /** Timestamp of most recent phase completion */
    lastPhaseCompleteTimestamp: number;
    /** Phase number of most recent phase completion */
    lastPhaseCompletePhase: number;
    /** Set of agents dispatched in current phase (normalized names) */
    phaseAgentsDispatched: Set<string>;
    /** Set of agents dispatched in the most recently completed phase (persisted across phase reset) */
    lastCompletedPhaseAgentsDispatched: Set<string>;
}
/**
 * Represents a single agent invocation window with isolated guardrail budgets.
 * Each time the architect delegates to an agent, a new window is created.
 * Architect never creates windows (unlimited).
 */
export interface InvocationWindow {
    /** Unique ID for this invocation (increments per agent type) */
    id: number;
    /** Agent name (stripped of swarm prefix) */
    agentName: string;
    /** Timestamp when this invocation started */
    startedAtMs: number;
    /** Tool calls made in this invocation */
    toolCalls: number;
    /** Consecutive errors in this invocation */
    consecutiveErrors: number;
    /** Whether hard limit was hit for this invocation */
    hardLimitHit: boolean;
    /** Timestamp of most recent successful tool call */
    lastSuccessTimeMs: number;
    /** Circular buffer of recent tool calls (max 20) for repetition detection */
    recentToolCalls: Array<{
        tool: string;
        argsHash: number;
        timestamp: number;
    }>;
    /** Whether soft warning has been issued for this invocation */
    warningIssued: boolean;
    /** Human-readable warning reason */
    warningReason: string;
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
/**
 * Update only the agent event timestamp (for stale detection).
 * Does NOT change agent name or reset guardrail state.
 * @param sessionId - The session identifier
 */
export declare function updateAgentEventTime(sessionId: string): void;
/**
 * Begin a new invocation window for the given agent.
 * Increments invocation ID, creates fresh budget counters.
 * Returns null for architect (unlimited, no window).
 *
 * @param sessionId - Session identifier
 * @param agentName - Agent name (with or without swarm prefix)
 * @returns New window or null if architect
 */
export declare function beginInvocation(sessionId: string, agentName: string): InvocationWindow | null;
/**
 * Get the currently active invocation window for the session.
 * Returns undefined if no window exists (e.g., architect session).
 *
 * @param sessionId - Session identifier
 * @returns Active window or undefined
 */
export declare function getActiveWindow(sessionId: string): InvocationWindow | undefined;
/**
 * Prune old invocation windows to prevent unbounded memory growth.
 * Removes windows older than maxAgeMs and keeps only the most recent maxWindows.
 *
 * @param sessionId - Session identifier
 * @param maxAgeMs - Maximum age in milliseconds (default 24 hours)
 * @param maxWindows - Maximum number of windows to keep (default 50)
 */
export declare function pruneOldWindows(sessionId: string, maxAgeMs?: number, maxWindows?: number): void;
/**
 * Record an agent dispatch for phase completion tracking.
 * Normalizes the agent name via stripKnownSwarmPrefix before adding to phaseAgentsDispatched.
 * @param sessionId - Session identifier
 * @param agentName - Agent name to record (will be normalized)
 */
export declare function recordPhaseAgentDispatch(sessionId: string, agentName: string): void;
/**
 * Advance a task's workflow state. Validates forward-only transitions.
 * Throws 'INVALID_TASK_STATE_TRANSITION: [taskId] [current] → [requested]' on illegal transition.
 *
 * Valid forward order: idle → coder_delegated → pre_check_passed → reviewer_run → tests_run → complete
 *
 * @param session - The agent session state
 * @param taskId - The task identifier
 * @param newState - The requested new state
 */
export declare function advanceTaskState(session: AgentSessionState, taskId: string, newState: TaskWorkflowState): void;
/**
 * Get the current workflow state for a task.
 * Returns 'idle' if no entry exists.
 *
 * @param session - The agent session state
 * @param taskId - The task identifier
 * @returns Current task workflow state
 */
export declare function getTaskState(session: AgentSessionState, taskId: string): TaskWorkflowState;

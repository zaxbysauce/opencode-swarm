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
	recentToolCalls: Array<{ tool: string; argsHash: number; timestamp: number }>;

	/** Whether a soft warning has been issued */
	warningIssued: boolean;

	/** Human-readable warning reason (set when warningIssued = true) */
	warningReason: string;

	/** Whether a hard limit has been triggered */
	hardLimitHit: boolean;

	/** Timestamp of most recent SUCCESSFUL tool call (for idle timeout) */
	lastSuccessTime: number;
}

/**
 * Singleton state object for sharing data across hooks
 */
export const swarmState = {
	/** Active tool calls — keyed by callID for before→after correlation */
	activeToolCalls: new Map<string, ToolCallEntry>(),

	/** Aggregated tool usage stats — keyed by tool name */
	toolAggregates: new Map<string, ToolAggregate>(),

	/** Active agent per session — keyed by sessionID, updated by chat.message hook */
	activeAgent: new Map<string, string>(),

	/** Delegation chains per session — keyed by sessionID */
	delegationChains: new Map<string, DelegationEntry[]>(),

	/** Number of events since last flush */
	pendingEvents: 0,

	/** Per-session guardrail state — keyed by sessionID */
	agentSessions: new Map<string, AgentSessionState>(),
};

/**
 * Reset all state to initial values - useful for testing
 */
export function resetSwarmState(): void {
	swarmState.activeToolCalls.clear();
	swarmState.toolAggregates.clear();
	swarmState.activeAgent.clear();
	swarmState.delegationChains.clear();
	swarmState.pendingEvents = 0;
	swarmState.agentSessions.clear();
}

/**
 * Start a new agent session with initialized guardrail state.
 * Also removes any stale sessions older than staleDurationMs.
 * @param sessionId - The session identifier
 * @param agentName - The agent associated with this session
 * @param staleDurationMs - Age threshold for stale session eviction (default: 120 min)
 */
export function startAgentSession(
	sessionId: string,
	agentName: string,
	staleDurationMs = 7200000,
): void {
	const now = Date.now();

	// Evict stale sessions based on last activity, not start time
	// Default: 2 hours — should exceed typical agent durations (evicts inactive sessions)
	const staleIds: string[] = [];
	for (const [id, session] of swarmState.agentSessions) {
		if (now - session.lastToolCallTime > staleDurationMs) {
			staleIds.push(id);
		}
	}
	for (const id of staleIds) {
		swarmState.agentSessions.delete(id);
	}

	// Create new session state
	const sessionState: AgentSessionState = {
		agentName,
		startTime: now,
		lastToolCallTime: now,
		toolCallCount: 0,
		consecutiveErrors: 0,
		recentToolCalls: [],
		warningIssued: false,
		warningReason: '',
		hardLimitHit: false,
		lastSuccessTime: now,
	};

	swarmState.agentSessions.set(sessionId, sessionState);
}

/**
 * End an agent session by removing it from the state.
 * @param sessionId - The session identifier to remove
 */
export function endAgentSession(sessionId: string): void {
	swarmState.agentSessions.delete(sessionId);
}

/**
 * Get an agent session state by session ID.
 * @param sessionId - The session identifier
 * @returns The AgentSessionState or undefined if not found
 */
export function getAgentSession(
	sessionId: string,
): AgentSessionState | undefined {
	return swarmState.agentSessions.get(sessionId);
}

/**
 * Ensure a guardrail session exists for the given sessionID.
 * If one exists and agentName is provided and different, update it.
 * If none exists, create one.
 * Always updates lastToolCallTime.
 * @param sessionId - The session identifier
 * @param agentName - Optional agent name (if known)
 * @returns The AgentSessionState
 */
export function ensureAgentSession(
	sessionId: string,
	agentName?: string,
): AgentSessionState {
	const now = Date.now();
	let session = swarmState.agentSessions.get(sessionId);

	if (session) {
		// Update agent name if provided and different from current
		if (agentName && agentName !== session.agentName) {
			session.agentName = agentName;
			// Reset start time for accurate duration tracking with correct agent limits
			session.startTime = now;
			// Reset per-agent guardrail state to prevent limits leaking across agents
			session.toolCallCount = 0;
			session.consecutiveErrors = 0;
			session.recentToolCalls = [];
			session.warningIssued = false;
			session.warningReason = '';
			session.hardLimitHit = false;
			session.lastSuccessTime = now;
		}
		session.lastToolCallTime = now;
		return session;
	}

	// Create new session
	startAgentSession(sessionId, agentName ?? 'unknown');
	session = swarmState.agentSessions.get(sessionId);
	if (!session) {
		// This should never happen, but TypeScript needs it
		throw new Error(`Failed to create guardrail session for ${sessionId}`);
	}
	return session;
}

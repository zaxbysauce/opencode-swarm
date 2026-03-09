/**
 * Shared state module for OpenCode Swarm plugin.
 * Provides a module-scoped singleton for cross-hook state sharing.
 *
 * This module is used by multiple hooks (tool.execute.before, tool.execute.after,
 * chat.message, system-enhancer) to share state like active agents, tool call tracking,
 * and delegation chains.
 */

import { ORCHESTRATOR_NAME } from './config/constants';
import { stripKnownSwarmPrefix } from './config/schema';

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
export type TaskWorkflowState =
	| 'idle'
	| 'coder_delegated'
	| 'pre_check_passed'
	| 'reviewer_run'
	| 'tests_run'
	| 'complete';

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

	// Window tracking (per-invocation budgets)
	/** Current active invocation ID for this agent */
	activeInvocationId: number;
	/** Last invocation ID by agent name (e.g., { "coder": 3, "reviewer": 1 }) */
	lastInvocationIdByAgent: Record<string, number>;
	/** Active invocation windows keyed by "${agentName}:${invId}" */
	windows: Record<string, InvocationWindow>;

	/** Last tool-call threshold at which a compaction hint was issued */
	lastCompactionHint: number;

	// v6.12 Anti-Process-Violation Detection
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
	lastGateFailure: { tool: string; taskId: string; timestamp: number } | null;
	/** Task IDs for which partial gate warning has already been issued (prevents per-task spam) */
	partialGateWarningsIssuedForTask: Set<string>;
	/** Whether architect attempted self-fix write after gate failure */
	selfFixAttempted: boolean;
	/** Phases that have already received a catastrophic zero-reviewer warning */
	catastrophicPhaseWarnings: Set<number>;

	// QA Skip Hard-Block Enforcement (v6.17)
	/** Number of consecutive coder delegations without reviewer/test_engineer between them */
	qaSkipCount: number;
	/** Task IDs skipped without QA (for audit trail), reset when reviewer/test_engineer fires */
	qaSkipTaskIds: string[];

	// v6.21 Per-task state machine
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

	// Phase completion tracking
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
	recentToolCalls: Array<{ tool: string; argsHash: number; timestamp: number }>;
	/** Whether soft warning has been issued for this invocation */
	warningIssued: boolean;
	/** Human-readable warning reason */
	warningReason: string;
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
	// Note: Session-scoped fields (architectWriteCount, gateLog, reviewerCallCount, lastGateFailure)
	// are cleared when agentSessions entries are deleted
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
		lastToolCallTime: now,
		lastAgentEventTime: now,
		delegationActive: false,
		activeInvocationId: 0,
		lastInvocationIdByAgent: {},
		windows: {},
		lastCompactionHint: 0,
		// v6.12 Anti-Process-Violation Detection
		architectWriteCount: 0,
		lastCoderDelegationTaskId: null,
		currentTaskId: null,
		gateLog: new Map(),
		reviewerCallCount: new Map(),
		lastGateFailure: null,
		partialGateWarningsIssuedForTask: new Set(),
		selfFixAttempted: false,
		catastrophicPhaseWarnings: new Set(),
		// Phase completion tracking
		lastPhaseCompleteTimestamp: 0,
		lastPhaseCompletePhase: 0,
		phaseAgentsDispatched: new Set(),
		lastCompletedPhaseAgentsDispatched: new Set(),
		// QA Skip Hard-Block Enforcement (v6.17)
		qaSkipCount: 0,
		qaSkipTaskIds: [],
		// v6.21 Per-task state machine
		taskWorkflowStates: new Map(),
		lastGateOutcome: null,
		declaredCoderScope: null,
		lastScopeViolation: null,
		scopeViolationDetected: false,
		modifiedFilesThisCoderTask: [],
	};

	swarmState.agentSessions.set(sessionId, sessionState);
	// Keep activeAgent map in sync so guardrails can always resolve the agent name
	// without falling back to ORCHESTRATOR_NAME for legitimately-named sessions.
	swarmState.activeAgent.set(sessionId, agentName);
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
			session.delegationActive = false;
			session.lastAgentEventTime = now;

			// Initialize window tracking if missing (migration from old state)
			if (!session.windows) {
				session.activeInvocationId = 0;
				session.lastInvocationIdByAgent = {};
				session.windows = {};
			}
		}

		// Ensure window tracking exists (migration safety)
		if (!session.windows) {
			session.activeInvocationId = 0;
			session.lastInvocationIdByAgent = {};
			session.windows = {};
		}

		// Initialize lastCompactionHint if missing (migration safety)
		if (session.lastCompactionHint === undefined) {
			session.lastCompactionHint = 0;
		}

		// Initialize v6.12 fields if missing (migration safety)
		if (session.architectWriteCount === undefined) {
			session.architectWriteCount = 0;
		}
		if (session.lastCoderDelegationTaskId === undefined) {
			session.lastCoderDelegationTaskId = null;
		}
		if (session.currentTaskId === undefined) {
			session.currentTaskId = null;
		}
		if (!session.gateLog) {
			session.gateLog = new Map();
		}
		if (!session.reviewerCallCount) {
			session.reviewerCallCount = new Map();
		}
		if (session.lastGateFailure === undefined) {
			session.lastGateFailure = null;
		}
		if (!session.partialGateWarningsIssuedForTask) {
			session.partialGateWarningsIssuedForTask = new Set();
		}
		if (session.selfFixAttempted === undefined) {
			session.selfFixAttempted = false;
		}
		if (!session.catastrophicPhaseWarnings) {
			session.catastrophicPhaseWarnings = new Set();
		}
		// Phase completion tracking migration safety
		if (session.lastPhaseCompleteTimestamp === undefined) {
			session.lastPhaseCompleteTimestamp = 0;
		}
		if (session.lastPhaseCompletePhase === undefined) {
			session.lastPhaseCompletePhase = 0;
		}
		if (!session.phaseAgentsDispatched) {
			session.phaseAgentsDispatched = new Set();
		}
		if (!session.lastCompletedPhaseAgentsDispatched) {
			session.lastCompletedPhaseAgentsDispatched = new Set();
		}
		// QA Skip Hard-Block Enforcement migration safety (v6.17)
		if (session.qaSkipCount === undefined) {
			session.qaSkipCount = 0;
		}
		if (!session.qaSkipTaskIds) {
			session.qaSkipTaskIds = [];
		}
		// v6.21 Per-task state machine migration safety
		if (!session.taskWorkflowStates) {
			session.taskWorkflowStates = new Map();
		}
		if (session.lastGateOutcome === undefined) {
			session.lastGateOutcome = null;
		}
		if (session.declaredCoderScope === undefined) {
			session.declaredCoderScope = null;
		}
		if (session.lastScopeViolation === undefined) {
			session.lastScopeViolation = null;
		}
		if (session.modifiedFilesThisCoderTask === undefined) {
			session.modifiedFilesThisCoderTask = [];
		}
		if (session.scopeViolationDetected === undefined) {
			session.scopeViolationDetected = false;
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

/**
 * Update only the agent event timestamp (for stale detection).
 * Does NOT change agent name or reset guardrail state.
 * @param sessionId - The session identifier
 */
export function updateAgentEventTime(sessionId: string): void {
	const session = swarmState.agentSessions.get(sessionId);
	if (session) {
		session.lastAgentEventTime = Date.now();
	}
}

/**
 * Begin a new invocation window for the given agent.
 * Increments invocation ID, creates fresh budget counters.
 * Returns null for architect (unlimited, no window).
 *
 * @param sessionId - Session identifier
 * @param agentName - Agent name (with or without swarm prefix)
 * @returns New window or null if architect
 */
export function beginInvocation(
	sessionId: string,
	agentName: string,
): InvocationWindow | null {
	const session = swarmState.agentSessions.get(sessionId);
	if (!session) {
		throw new Error(
			`Cannot begin invocation: session ${sessionId} does not exist`,
		);
	}

	// Architect never creates windows (unlimited)
	const stripped = stripKnownSwarmPrefix(agentName);
	if (stripped === ORCHESTRATOR_NAME) {
		return null;
	}

	// Increment invocation ID for this agent
	const lastId = session.lastInvocationIdByAgent[stripped] || 0;
	const newId = lastId + 1;
	session.lastInvocationIdByAgent[stripped] = newId;
	session.activeInvocationId = newId;

	// Create new window
	const now = Date.now();
	const window: InvocationWindow = {
		id: newId,
		agentName: stripped,
		startedAtMs: now,
		toolCalls: 0,
		consecutiveErrors: 0,
		hardLimitHit: false,
		lastSuccessTimeMs: now,
		recentToolCalls: [],
		warningIssued: false,
		warningReason: '',
	};

	const key = `${stripped}:${newId}`;
	session.windows[key] = window;

	// Prune old windows to prevent memory leak
	pruneOldWindows(sessionId, 24 * 60 * 60 * 1000, 50); // 24h max age, 50 max windows

	return window;
}

/**
 * Get the currently active invocation window for the session.
 * Returns undefined if no window exists (e.g., architect session).
 *
 * @param sessionId - Session identifier
 * @returns Active window or undefined
 */
export function getActiveWindow(
	sessionId: string,
): InvocationWindow | undefined {
	const session = swarmState.agentSessions.get(sessionId);
	if (!session || !session.windows) {
		return undefined;
	}

	const stripped = stripKnownSwarmPrefix(session.agentName);
	const key = `${stripped}:${session.activeInvocationId}`;
	return session.windows[key];
}

/**
 * Prune old invocation windows to prevent unbounded memory growth.
 * Removes windows older than maxAgeMs and keeps only the most recent maxWindows.
 *
 * @param sessionId - Session identifier
 * @param maxAgeMs - Maximum age in milliseconds (default 24 hours)
 * @param maxWindows - Maximum number of windows to keep (default 50)
 */
export function pruneOldWindows(
	sessionId: string,
	maxAgeMs = 24 * 60 * 60 * 1000,
	maxWindows = 50,
): void {
	const session = swarmState.agentSessions.get(sessionId);
	if (!session || !session.windows) {
		return;
	}

	const now = Date.now();
	const entries = Object.entries(session.windows);

	// Remove windows older than maxAgeMs
	const validByAge = entries.filter(
		([_, window]) => now - window.startedAtMs < maxAgeMs,
	);

	// Sort by timestamp descending, keep most recent maxWindows
	const sorted = validByAge.sort((a, b) => b[1].startedAtMs - a[1].startedAtMs);
	const toKeep = sorted.slice(0, maxWindows);

	// Rebuild windows object
	session.windows = Object.fromEntries(toKeep);
}

/**
 * Record an agent dispatch for phase completion tracking.
 * Normalizes the agent name via stripKnownSwarmPrefix before adding to phaseAgentsDispatched.
 * @param sessionId - Session identifier
 * @param agentName - Agent name to record (will be normalized)
 */
export function recordPhaseAgentDispatch(
	sessionId: string,
	agentName: string,
): void {
	const session = swarmState.agentSessions.get(sessionId);
	if (!session) {
		return;
	}

	// Ensure phaseAgentsDispatched exists (migration safety)
	if (!session.phaseAgentsDispatched) {
		session.phaseAgentsDispatched = new Set();
	}

	const normalizedName = stripKnownSwarmPrefix(agentName);
	session.phaseAgentsDispatched.add(normalizedName);
}

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
export function advanceTaskState(
	session: AgentSessionState,
	taskId: string,
	newState: TaskWorkflowState,
): void {
	if (!session.taskWorkflowStates) {
		session.taskWorkflowStates = new Map();
	}

	const STATE_ORDER: TaskWorkflowState[] = [
		'idle',
		'coder_delegated',
		'pre_check_passed',
		'reviewer_run',
		'tests_run',
		'complete',
	];

	const current = session.taskWorkflowStates.get(taskId) ?? 'idle';
	const currentIndex = STATE_ORDER.indexOf(current);
	const newIndex = STATE_ORDER.indexOf(newState);

	if (newIndex <= currentIndex) {
		throw new Error(
			`INVALID_TASK_STATE_TRANSITION: ${taskId} ${current} → ${newState}`,
		);
	}

	// 'complete' can only be reached from 'tests_run' — enforce sequential progression
	if (newState === 'complete' && current !== 'tests_run') {
		throw new Error(
			`INVALID_TASK_STATE_TRANSITION: ${taskId} cannot reach complete from ${current} — must pass through tests_run first`,
		);
	}

	session.taskWorkflowStates.set(taskId, newState);
}

/**
 * Get the current workflow state for a task.
 * Returns 'idle' if no entry exists.
 *
 * @param session - The agent session state
 * @param taskId - The task identifier
 * @returns Current task workflow state
 */
export function getTaskState(
	session: AgentSessionState,
	taskId: string,
): TaskWorkflowState {
	if (!session.taskWorkflowStates) {
		session.taskWorkflowStates = new Map();
	}

	return session.taskWorkflowStates.get(taskId) ?? 'idle';
}

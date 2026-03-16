/**
 * Shared state module for OpenCode Swarm plugin.
 * Provides a module-scoped singleton for cross-hook state sharing.
 *
 * This module is used by multiple hooks (tool.execute.before, tool.execute.after,
 * chat.message, system-enhancer) to share state like active agents, tool call tracking,
 * and delegation chains.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { ORCHESTRATOR_NAME } from './config/constants';
import {
	type Plan,
	PlanSchema,
	type Task,
	type TaskStatus,
} from './config/plan-schema';
import { stripKnownSwarmPrefix } from './config/schema';
import type { TaskEvidence } from './gate-evidence';

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
	/** Value of architectWriteCount at the time the self-coding warning was last injected.
	 *  Warning is suppressed unless architectWriteCount has increased since last injection. */
	selfCodingWarnedAtCount: number;
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

	// Turbo Mode (v6.26)
	/** Session-scoped Turbo Mode flag for controlling LLM inference speed */
	turboMode: boolean;
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
 * @param directory - Optional project directory for rehydrating workflow state from disk
 */
export function startAgentSession(
	sessionId: string,
	agentName: string,
	staleDurationMs = 7200000,
	directory?: string,
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
		selfCodingWarnedAtCount: 0,
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
		// Turbo Mode (v6.26)
		turboMode: false,
	};

	swarmState.agentSessions.set(sessionId, sessionState);
	// Keep activeAgent map in sync so guardrails can always resolve the agent name
	// without falling back to ORCHESTRATOR_NAME for legitimately-named sessions.
	swarmState.activeAgent.set(sessionId, agentName);

	// Rehydrate workflow state from disk if directory provided (non-fatal, fire-and-forget)
	if (directory) {
		rehydrateSessionFromDisk(directory, sessionState).catch(() => {
			// Swallow rehydration errors - fallback to current pre-rehydration path
		});
	}
}

/**
 * End an agent session by removing it from the state.
 * NOTE: Currently unused in production — no session lifecycle teardown is wired up.
 * Sessions accumulate for the process lifetime. Callers should integrate this into
 * a session TTL or idle-timeout mechanism to prevent unbounded Map growth.
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
 * @param directory - Optional project directory for rehydrating workflow state from disk
 * @returns The AgentSessionState
 */
export function ensureAgentSession(
	sessionId: string,
	agentName?: string,
	directory?: string,
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

		// Repair delegationActive if missing OR not a boolean (malformed)
		if (typeof session.delegationActive !== 'boolean') {
			session.delegationActive = false;
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
		// Repair gateLog if missing OR not a Map (malformed)
		if (!session.gateLog || !(session.gateLog instanceof Map)) {
			session.gateLog = new Map();
		}
		// Repair reviewerCallCount if missing OR not a Map (malformed)
		if (!session.reviewerCallCount || !(session.reviewerCallCount instanceof Map)) {
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
		if (session.selfCodingWarnedAtCount === undefined) {
			session.selfCodingWarnedAtCount = 0;
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
		// Repair taskWorkflowStates if missing OR not a Map (malformed)
		if (!session.taskWorkflowStates || !(session.taskWorkflowStates instanceof Map)) {
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
		// Turbo Mode migration safety (v6.26)
		if (session.turboMode === undefined) {
			session.turboMode = false;
		}

		session.lastToolCallTime = now;
		return session;
	}

	// Create new session
	startAgentSession(sessionId, agentName ?? 'unknown', 7200000, directory);
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
 * Check if a task ID is valid (not null, undefined, empty, or whitespace-only).
 * Also returns false if taskId is not a string (e.g., number, object).
 * @param taskId - The task identifier to validate
 * @returns true if valid, false otherwise
 */
function isValidTaskId(taskId: unknown): boolean {
	if (taskId === null || taskId === undefined) {
		return false;
	}
	if (typeof taskId !== 'string') {
		return false;
	}
	const trimmed = taskId.trim();
	return trimmed.length > 0;
}

/**
 * Advance a task's workflow state. Validates forward-only transitions.
 * Throws 'INVALID_TASK_STATE_TRANSITION: [taskId] [current] → [requested]' on illegal transition.
 * Safely returns without mutating state when taskId is null, undefined, empty, or whitespace-only.
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
	// Guard against invalid taskId - safely return without mutating state
	if (!isValidTaskId(taskId)) {
		return;
	}

	if (!session || !(session.taskWorkflowStates instanceof Map)) {
		throw new Error(
			'INVALID_SESSION: session.taskWorkflowStates must be a Map instance',
		);
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
 * Returns 'idle' for invalid taskId (null, undefined, empty, or whitespace-only).
 * If taskWorkflowStates is missing/invalid, initializes it as a new Map.
 *
 * @param session - The agent session state
 * @param taskId - The task identifier
 * @returns Current task workflow state
 */
export function getTaskState(
	session: AgentSessionState,
	taskId: string,
): TaskWorkflowState {
	// Guard against invalid taskId - safely return 'idle'
	if (!isValidTaskId(taskId)) {
		return 'idle';
	}

	if (!session.taskWorkflowStates) {
		session.taskWorkflowStates = new Map();
	}

	return session.taskWorkflowStates.get(taskId) ?? 'idle';
}

/**
 * Maps plan task status to task workflow state.
 * - 'pending' -> 'idle' (no work started yet)
 * - 'in_progress' -> 'coder_delegated' (work has started)
 * - 'completed' -> 'complete' (done)
 * - 'blocked' -> 'idle' (blocked tasks haven't progressed)
 */
function planStatusToWorkflowState(status: TaskStatus): TaskWorkflowState {
	switch (status) {
		case 'in_progress':
			return 'coder_delegated';
		case 'completed':
			return 'complete';
		case 'pending':
		case 'blocked':
		default:
			return 'idle';
	}
}

/**
 * Maps evidence gates to task workflow state.
 * Evidence provides stronger signal than plan-only status.
 * - 'coder' dispatched -> 'coder_delegated'
 * - 'reviewer' passed -> 'reviewer_run'
 * - 'test_engineer' passed -> 'tests_run'
 * - All required gates passed -> 'complete'
 */
function evidenceToWorkflowState(evidence: TaskEvidence): TaskWorkflowState {
	const gates = evidence.gates ?? {};
	const requiredGates = evidence.required_gates ?? [];

	// Check if all required gates have evidence - return complete if so
	if (requiredGates.length > 0) {
		const allPassed = requiredGates.every((gate) => gates[gate] != null);
		if (allPassed) {
			return 'complete';
		}
	}

	// Check the highest gate passed
	if (gates['test_engineer'] != null) {
		return 'tests_run';
	}
	if (gates['reviewer'] != null) {
		return 'reviewer_run';
	}
	if (Object.keys(gates).length > 0) {
		return 'coder_delegated';
	}

	return 'idle';
}

	/**
	 * Reads and parses plan.json from the given directory.
	 * Returns null if file doesn't exist or is malformed (non-fatal).
	 * Tolerant of schema version mismatches - tries schema validation first,
	 * then falls back to extracting raw data if validation fails.
	 */
	async function readPlanFromDisk(directory: string): Promise<Plan | null> {
		try {
			const planPath = path.join(directory, '.swarm', 'plan.json');
			const content = await fs.readFile(planPath, 'utf-8');
			const parsed = JSON.parse(content);

			// Try schema validation first
			try {
				return PlanSchema.parse(parsed) as Plan;
			} catch {
				// Schema validation failed (e.g., schema_version mismatch or invalid content)
				// Fall back to extracting data without strict validation

				// Check if this looks like evidence content (has taskId but no phases)
				// In this case, it's not a valid plan - return null
				if (parsed && parsed.taskId && (!parsed.phases || !Array.isArray(parsed.phases))) {
					// This looks like evidence content that overwrote plan.json
					// Return null - we'll rely on evidence reading instead
					return null;
				}

				// If we have phases, try to extract them
				if (parsed && parsed.phases && Array.isArray(parsed.phases)) {
					// Extract minimal required data from raw JSON
					const phases = parsed.phases.map((phase: Record<string, unknown>) => ({
						id: typeof phase.id === 'number' ? phase.id : 1,
						name: typeof phase.name === 'string' ? phase.name : 'Phase',
						status: phase.status ?? 'pending',
						tasks: Array.isArray(phase.tasks)
							? phase.tasks.map((task: Record<string, unknown>) => ({
									id: typeof task.id === 'string' ? task.id : '1.1',
									phase: typeof task.phase === 'number' ? task.phase : 1,
									status: task.status ?? 'pending',
									size: task.size ?? 'small',
									description:
										typeof task.description === 'string'
											? task.description
											: 'Task',
									depends: Array.isArray(task.depends) ? task.depends : [],
									files_touched: Array.isArray(task.files_touched)
										? task.files_touched
										: [],
							  }))
							: [],
					}));

					return {
						schema_version: '1.0.0',
						title: typeof parsed.title === 'string' ? parsed.title : 'Plan',
						swarm: typeof parsed.swarm === 'string' ? parsed.swarm : 'swarm',
						phases,
					} as Plan;
				}
				return null;
			}
		} catch {
			// Non-fatal: missing or malformed plan.json
			return null;
		}
	}

/**
 * Reads all evidence files from .swarm/evidence/*.json
 * Returns a Map of taskId -> TaskEvidence (only valid evidence parsed).
 * Non-fatal: skips malformed files.
 */
async function readEvidenceFromDisk(
	directory: string,
): Promise<Map<string, TaskEvidence>> {
	const evidenceMap = new Map<string, TaskEvidence>();

	try {
		const evidenceDir = path.join(directory, '.swarm', 'evidence');
		const evidenceDirResolved = path.resolve(evidenceDir);
		const entries = await fs.readdir(evidenceDir, { withFileTypes: true });

		for (const entry of entries) {
			if (!entry.isFile() || !entry.name.endsWith('.json')) {
				continue;
			}

			const taskId = entry.name.replace(/\.json$/, '');
			// Validate taskId format to prevent path traversal
			if (!/^\d+\.\d+(\.\d+)*$/.test(taskId)) {
				continue;
			}

			try {
				const filePath = path.join(evidenceDir, entry.name);
				const filePathResolved = path.resolve(filePath);

				// Security check: ensure file is actually inside evidence directory
				// This prevents path traversal attacks (e.g., evidence/../plan.json)
				if (!filePathResolved.startsWith(evidenceDirResolved + path.sep)) {
					continue;
				}

				const content = await fs.readFile(filePath, 'utf-8');
				const parsed = JSON.parse(content);

				// Basic validation: must have taskId and required_gates
				if (
					parsed &&
					typeof parsed.taskId === 'string' &&
					Array.isArray(parsed.required_gates)
				) {
					evidenceMap.set(taskId, parsed as TaskEvidence);
				}
			} catch {
				// Skip malformed evidence files (non-fatal)
			}
		}
	} catch {
		// Evidence directory doesn't exist (non-fatal)
	}

	return evidenceMap;
}

/**
 * Rehydrates session workflow state from durable swarm files.
 *
 * Reads `.swarm/plan.json` and `.swarm/evidence/*.json` from the provided
 * project directory, derives task workflow states from this data, and merges
 * them into the target AgentSessionState.
 *
 * Merge rules:
 * - Evidence-derived progression wins over plan-only state
 * - Existing in-memory workflow states for the same task IDs are NOT downgraded
 * - Missing/malformed `.swarm` data is non-fatal (silently skipped)
 *
 * This helper is useful for session restart scenarios where in-memory state
 * is lost but durable files persist.
 *
 * @param directory - Project root containing .swarm/ subdirectory
 * @param session - Target AgentSessionState to merge rehydrated state into
	 */
export async function rehydrateSessionFromDisk(
	directory: string,
	session: AgentSessionState,
): Promise<void> {
	// Ensure taskWorkflowStates exists
	if (!session.taskWorkflowStates) {
		session.taskWorkflowStates = new Map();
	}

	// Read plan.json (non-fatal)
	const plan = await readPlanFromDisk(directory);

	// Build task status map from plan (if available)
	const planTaskStates = new Map<string, TaskWorkflowState>();
	if (plan) {
		for (const phase of plan.phases ?? []) {
			for (const task of phase.tasks ?? []) {
				const taskState = planStatusToWorkflowState(task.status);
				planTaskStates.set(task.id, taskState);
			}
		}
	}

	// Read evidence files (non-fatal)
	const evidenceMap = await readEvidenceFromDisk(directory);

	// If we have no plan and no evidence, nothing to rehydrate
	if (planTaskStates.size === 0 && evidenceMap.size === 0) {
		return;
	}

	// Collect all task IDs from both plan and evidence
	const allTaskIds = new Set<string>([...planTaskStates.keys(), ...evidenceMap.keys()]);

	// Merge: evidence > plan > existing memory (no downgrade)
	for (const taskId of allTaskIds) {
		const existingState = session.taskWorkflowStates.get(taskId);
		const planState = planTaskStates.get(taskId);
		const evidence = evidenceMap.get(taskId);

		let derivedState: TaskWorkflowState;

		if (evidence) {
			// Evidence provides strongest signal
			derivedState = evidenceToWorkflowState(evidence);
		} else if (planState !== undefined) {
			// Fall back to plan state
			derivedState = planState;
		} else {
			// No plan or evidence for this task - skip
			continue;
		}

		// Determine final state: use derived state ONLY if it's further ahead
		// than existing in-memory state, or if no in-memory state exists
		const STATE_ORDER: TaskWorkflowState[] = [
			'idle',
			'coder_delegated',
			'pre_check_passed',
			'reviewer_run',
			'tests_run',
			'complete',
		];

		const existingIndex = existingState
			? STATE_ORDER.indexOf(existingState)
			: -1;
		const derivedIndex = STATE_ORDER.indexOf(derivedState);

		// Only upgrade if derived state is further ahead than existing
		if (derivedIndex > existingIndex) {
			session.taskWorkflowStates.set(taskId, derivedState);
		}
		// If existing state is further ahead, keep it (no downgrade)
	}
}

/**
 * Check if ANY active session has Turbo Mode enabled.
 * @returns true if any session has turboMode: true
 */
export function hasActiveTurboMode(): boolean {
	for (const [_sessionId, session] of swarmState.agentSessions) {
		if (session.turboMode === true) {
			return true;
		}
	}
	return false;
}

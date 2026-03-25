/**
 * Session snapshot reader for OpenCode Swarm plugin.
 * Reads .swarm/session/state.json and rehydrates swarmState on plugin init.
 */

import { validateSwarmPath } from '../hooks/utils';
import type { AgentSessionState, TaskWorkflowState } from '../state';
import {
	applyRehydrationCache,
	buildRehydrationCache,
	swarmState,
} from '../state';
import type { SerializedAgentSession, SnapshotData } from './snapshot-writer';

const VALID_TASK_WORKFLOW_STATES: TaskWorkflowState[] = [
	'idle',
	'coder_delegated',
	'pre_check_passed',
	'reviewer_run',
	'tests_run',
	'complete',
];

/**
 * Deserialize taskWorkflowStates from a serialized Record<string, string> to Map.
 * Validates each value against VALID_TASK_WORKFLOW_STATES and skips invalid entries.
 */
function deserializeTaskWorkflowStates(
	raw: Record<string, string> | undefined,
): Map<string, TaskWorkflowState> {
	const m = new Map<string, TaskWorkflowState>();
	if (!raw || typeof raw !== 'object') {
		return m;
	}
	for (const [taskId, stateVal] of Object.entries(raw)) {
		if (VALID_TASK_WORKFLOW_STATES.includes(stateVal as TaskWorkflowState)) {
			m.set(taskId, stateVal as TaskWorkflowState);
		}
	}
	return m;
}

/**
 * Deserialize a SerializedAgentSession back to AgentSessionState.
 * Handles Map/Set conversion and migration safety defaults.
 */
export function deserializeAgentSession(
	s: SerializedAgentSession,
): AgentSessionState {
	// Convert gateLog: Record<string, string[]> -> Map<string, Set<string>>
	const gateLog = new Map<string, Set<string>>();
	if (s.gateLog) {
		for (const [taskId, gates] of Object.entries(s.gateLog)) {
			gateLog.set(taskId, new Set(gates ?? []));
		}
	}

	// Convert reviewerCallCount: Record<string, number> -> Map<number, number>
	const reviewerCallCount = new Map<number, number>();
	if (s.reviewerCallCount) {
		for (const [phase, count] of Object.entries(s.reviewerCallCount)) {
			const numPhase = Number(phase);
			if (Number.isFinite(numPhase)) {
				reviewerCallCount.set(numPhase, count);
			}
		}
	}

	// Convert partialGateWarningsIssuedForTask: string[] -> Set<string>
	const partialGateWarningsIssuedForTask = new Set(
		s.partialGateWarningsIssuedForTask ?? [],
	);

	// Convert catastrophicPhaseWarnings: number[] -> Set<number>
	const catastrophicPhaseWarnings = new Set(s.catastrophicPhaseWarnings ?? []);

	// Convert phaseAgentsDispatched: string[] -> Set<string>
	const phaseAgentsDispatched = new Set(s.phaseAgentsDispatched ?? []);

	// Convert lastCompletedPhaseAgentsDispatched: string[] -> Set<string>
	const lastCompletedPhaseAgentsDispatched = new Set(
		s.lastCompletedPhaseAgentsDispatched ?? [],
	);

	return {
		agentName: s.agentName,
		lastToolCallTime: s.lastToolCallTime,
		lastAgentEventTime: s.lastAgentEventTime,
		delegationActive: s.delegationActive,
		activeInvocationId: s.activeInvocationId,
		lastInvocationIdByAgent: s.lastInvocationIdByAgent ?? {},
		windows: s.windows ?? {},
		lastCompactionHint: s.lastCompactionHint ?? 0,
		architectWriteCount: s.architectWriteCount ?? 0,
		lastCoderDelegationTaskId: s.lastCoderDelegationTaskId ?? null,
		currentTaskId: s.currentTaskId ?? null,
		turboMode: s.turboMode ?? false,
		gateLog,
		reviewerCallCount,
		lastGateFailure: s.lastGateFailure ?? null,
		partialGateWarningsIssuedForTask,
		selfFixAttempted: s.selfFixAttempted ?? false,
		selfCodingWarnedAtCount: s.selfCodingWarnedAtCount ?? 0,
		catastrophicPhaseWarnings,
		lastPhaseCompleteTimestamp: s.lastPhaseCompleteTimestamp ?? 0,
		lastPhaseCompletePhase: s.lastPhaseCompletePhase ?? 0,
		phaseAgentsDispatched,
		lastCompletedPhaseAgentsDispatched,
		qaSkipCount: s.qaSkipCount ?? 0,
		qaSkipTaskIds: s.qaSkipTaskIds ?? [],
		taskWorkflowStates: deserializeTaskWorkflowStates(s.taskWorkflowStates),
		lastGateOutcome: null,
		declaredCoderScope: null,
		lastScopeViolation: null,
		scopeViolationDetected: s.scopeViolationDetected,
		modifiedFilesThisCoderTask: [],
		pendingAdvisoryMessages: s.pendingAdvisoryMessages ?? [],
		model_fallback_index: s.model_fallback_index ?? 0,
		modelFallbackExhausted: s.modelFallbackExhausted ?? false,
		coderRevisions: s.coderRevisions ?? 0,
		revisionLimitHit: s.revisionLimitHit ?? false,
	};
}

/**
 * Read the snapshot file from .swarm/session/state.json.
 * Returns null if file doesn't exist, parse fails, or version is wrong.
 * NEVER throws - always returns null on any error.
 */
export async function readSnapshot(
	directory: string,
): Promise<SnapshotData | null> {
	try {
		const resolvedPath = validateSwarmPath(directory, 'session/state.json');
		const file = Bun.file(resolvedPath);
		const content = await file.text();

		// Check if file is empty or just whitespace
		if (!content.trim()) {
			return null;
		}

		const parsed = JSON.parse(content, (key, value) => {
			if (key === '__proto__' || key === 'constructor') return undefined;
			return value;
		}) as SnapshotData;

		// Validate version
		if (parsed.version !== 1 && parsed.version !== 2) {
			return null;
		}

		return parsed;
	} catch {
		// File doesn't exist, parse fails, or any other error - return null
		return null;
	}
}

/**
 * Rehydrate swarmState from a SnapshotData object.
 * Clears existing maps first, then populates from snapshot.
 * Does NOT touch activeToolCalls or pendingEvents (remain at defaults).
 */
export async function rehydrateState(snapshot: SnapshotData): Promise<void> {
	// Await any in-flight rehydrations before clearing agentSessions.
	// This prevents a race where startAgentSession fires rehydrateSessionFromDisk
	// and rehydrateState clears the map before it completes.
	// Errors are already swallowed inside each pending promise.
	if (swarmState.pendingRehydrations.size > 0) {
		await Promise.allSettled([...swarmState.pendingRehydrations]);
	}

	// Clear existing maps first to prevent data leakage
	swarmState.toolAggregates.clear();
	swarmState.activeAgent.clear();
	swarmState.delegationChains.clear();
	swarmState.agentSessions.clear();

	// Populate toolAggregates
	if (snapshot.toolAggregates) {
		for (const [key, value] of Object.entries(snapshot.toolAggregates)) {
			swarmState.toolAggregates.set(key, value);
		}
	}

	// Populate activeAgent
	if (snapshot.activeAgent) {
		for (const [key, value] of Object.entries(snapshot.activeAgent)) {
			swarmState.activeAgent.set(key, value);
		}
	}

	// Populate delegationChains
	if (snapshot.delegationChains) {
		for (const [key, value] of Object.entries(snapshot.delegationChains)) {
			swarmState.delegationChains.set(key, value);
		}
	}

	// Populate agentSessions with deserialized data
	// v6.33.1: Skip malformed sessions missing required fields instead of injecting bad state
	// v6.33.3: Refresh timestamps to prevent immediate stale eviction after rehydration
	const now = Date.now();
	if (snapshot.agentSessions) {
		for (const [sessionId, serializedSession] of Object.entries(
			snapshot.agentSessions,
		)) {
			// Validate required fields exist before deserializing
			if (
				!serializedSession ||
				typeof serializedSession !== 'object' ||
				typeof serializedSession.agentName !== 'string' ||
				typeof serializedSession.lastToolCallTime !== 'number' ||
				typeof serializedSession.delegationActive !== 'boolean'
			) {
				console.warn(
					'[snapshot-reader] Skipping malformed session %s: missing required fields (agentName, lastToolCallTime, delegationActive)',
					sessionId,
				);
				continue;
			}
			const session = deserializeAgentSession(serializedSession);
			// Refresh timestamps to current time so startAgentSession's stale
			// eviction sweep (now - lastToolCallTime > 2h) does not immediately
			// delete sessions that were idle before the process restarted.
			session.lastToolCallTime = now;
			session.lastAgentEventTime = now;
			// Refresh InvocationWindow timestamps to prevent guardrails
			// duration-limit and idle-timeout circuit breakers from firing
			// immediately on stale windows restored from disk.
			if (session.windows) {
				for (const window of Object.values(session.windows)) {
					window.startedAtMs = now;
					window.lastSuccessTimeMs = now;
				}
			}
			swarmState.agentSessions.set(sessionId, session);
		}
	}
}

/**
 * Load snapshot from disk and rehydrate swarmState.
 * Called on plugin init to restore state from previous session.
 * NEVER throws - swallows any errors silently.
 */
export async function loadSnapshot(directory: string): Promise<void> {
	try {
		// Always build the rehydration cache from plan+evidence on disk.
		// This is needed even when no snapshot exists: sessions created later by
		// startAgentSession() will apply this cache synchronously, ensuring
		// guardrails see correct workflow state without a race.
		await buildRehydrationCache(directory);

		const snapshot = await readSnapshot(directory);
		if (snapshot !== null) {
			await rehydrateState(snapshot);
			// Apply cached plan+evidence to every restored session before the
			// plugin begins accepting tool calls.
			for (const session of swarmState.agentSessions.values()) {
				applyRehydrationCache(session);
			}
			// reconcileTaskStatesFromPlan() removed — superseded by applyRehydrationCache()
		}
	} catch {
		// Silently swallow any errors - leave state at defaults
	}
}

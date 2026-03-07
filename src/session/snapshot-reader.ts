/**
 * Session snapshot reader for OpenCode Swarm plugin.
 * Reads .swarm/session/state.json and rehydrates swarmState on plugin init.
 */

import { validateSwarmPath } from '../hooks/utils';
import type {
	AgentSessionState,
	DelegationEntry,
	InvocationWindow,
	ToolAggregate,
} from '../state';
import { swarmState } from '../state';
import type { SerializedAgentSession, SnapshotData } from './snapshot-writer';

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
		gateLog,
		reviewerCallCount,
		lastGateFailure: s.lastGateFailure ?? null,
		partialGateWarningsIssuedForTask,
		selfFixAttempted: s.selfFixAttempted ?? false,
		catastrophicPhaseWarnings,
		lastPhaseCompleteTimestamp: s.lastPhaseCompleteTimestamp ?? 0,
		lastPhaseCompletePhase: s.lastPhaseCompletePhase ?? 0,
		phaseAgentsDispatched,
		qaSkipCount: s.qaSkipCount ?? 0,
		qaSkipTaskIds: s.qaSkipTaskIds ?? [],
		taskWorkflowStates: new Map(),
		lastGateOutcome: null,
		declaredCoderScope: null,
		lastScopeViolation: null,
		modifiedFilesThisCoderTask: [],
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
		if (parsed.version !== 1) {
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
export function rehydrateState(snapshot: SnapshotData): void {
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
	if (snapshot.agentSessions) {
		for (const [sessionId, serializedSession] of Object.entries(
			snapshot.agentSessions,
		)) {
			swarmState.agentSessions.set(
				sessionId,
				deserializeAgentSession(serializedSession),
			);
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
		const snapshot = await readSnapshot(directory);
		if (snapshot !== null) {
			rehydrateState(snapshot);
		}
	} catch {
		// Silently swallow any errors - leave state at defaults
	}
}

/**
 * Session snapshot writer for OpenCode Swarm plugin.
 * Serializes swarmState to .swarm/session/state.json using atomic write (temp-file + rename).
 */
import type { AgentSessionState, DelegationEntry, ToolAggregate } from '../state';
import { swarmState } from '../state';
/**
 * Serialized form of AgentSessionState with Map/Set fields converted to plain arrays/objects
 */
export interface SerializedAgentSession {
    agentName: string;
    lastToolCallTime: number;
    lastAgentEventTime: number;
    delegationActive: boolean;
    activeInvocationId: number;
    lastInvocationIdByAgent: Record<string, number>;
    windows: Record<string, SerializedInvocationWindow>;
    lastCompactionHint: number;
    architectWriteCount: number;
    lastCoderDelegationTaskId: string | null;
    currentTaskId: string | null;
    gateLog: Record<string, string[]>;
    reviewerCallCount: Record<string, number>;
    lastGateFailure: {
        tool: string;
        taskId: string;
        timestamp: number;
    } | null;
    partialGateWarningsIssuedForTask: string[];
    selfFixAttempted: boolean;
    selfCodingWarnedAtCount: number;
    catastrophicPhaseWarnings: number[];
    lastPhaseCompleteTimestamp: number;
    lastPhaseCompletePhase: number;
    phaseAgentsDispatched: string[];
    lastCompletedPhaseAgentsDispatched: string[];
    qaSkipCount: number;
    qaSkipTaskIds: string[];
    taskWorkflowStates?: Record<string, string>;
    /** Flag for one-shot scope violation warning injection (omitted when undefined for additive-only schema) */
    scopeViolationDetected?: boolean;
}
/**
 * Minimal interface for serialized InvocationWindow
 */
interface SerializedInvocationWindow {
    id: number;
    agentName: string;
    startedAtMs: number;
    toolCalls: number;
    consecutiveErrors: number;
    hardLimitHit: boolean;
    lastSuccessTimeMs: number;
    recentToolCalls: Array<{
        tool: string;
        argsHash: number;
        timestamp: number;
    }>;
    warningIssued: boolean;
    warningReason: string;
}
/**
 * Snapshot data structure written to disk
 */
export interface SnapshotData {
    version: 1;
    writtenAt: number;
    toolAggregates: Record<string, ToolAggregate>;
    activeAgent: Record<string, string>;
    delegationChains: Record<string, DelegationEntry[]>;
    agentSessions: Record<string, SerializedAgentSession>;
}
/**
 * Convert a live AgentSessionState to its serialized form.
 * Handles missing/undefined Map/Set fields gracefully (migration safety).
 */
export declare function serializeAgentSession(s: AgentSessionState): SerializedAgentSession;
/**
 * Write a snapshot of swarmState to .swarm/session/state.json atomically.
 * Silently swallows errors (non-fatal — never crash the plugin).
 */
export declare function writeSnapshot(directory: string, state: typeof swarmState): Promise<void>;
/**
 * Create a snapshot writer hook suitable for use in tool.execute.after.
 * Returns a hook function that writes the current swarmState to disk.
 */
export declare function createSnapshotWriterHook(directory: string): (input: unknown, output: unknown) => Promise<void>;
export {};

import type { AgentDefinition } from '../agents';
import { type SandboxStatus } from '../sandbox/capability-probe';
import { hasActiveFullAuto, hasActiveLeanTurbo } from '../state';
import { loadLeanTurboRunState } from '../turbo/lean/state';
/**
 * Structured sandbox status for plugin capability reporting.
 */
export interface SandboxStatusInfo {
    /** Whether the sandbox mechanism is available. */
    status: SandboxStatus;
    /** Human-readable mechanism name, e.g. "Bubblewrap". */
    mechanism: string;
    /** Current process.platform value. */
    platform: 'linux' | 'darwin' | 'win32';
    /** Error message from the probe, if any. */
    error?: string;
    /** Whether a sandbox executor is currently available (may differ from capability probe if instantiation failed). */
    executorAvailable: boolean;
}
/**
 * Dependency-injection seam for status-service.
 * Allows tests to intercept Lean Turbo state queries without mock.module leakage.
 */
export declare const _internals: {
    loadLeanTurboRunState: typeof loadLeanTurboRunState;
    hasActiveLeanTurbo: typeof hasActiveLeanTurbo;
    hasActiveFullAuto: typeof hasActiveFullAuto;
};
/**
 * Get sandbox status by probing capability and checking executor availability.
 *
 * This function is cached at the module level (via SandboxCapabilityProbe's
 * internal cache) so repeated calls during a session are fast.
 */
export declare function getSandboxStatus(): Promise<SandboxStatusInfo>;
/**
 * Structured status data returned by the status service.
 * This can be used by GUI, background flows, or command adapters.
 */
export interface StatusData {
    hasPlan: boolean;
    currentPhase: string;
    completedTasks: number;
    totalTasks: number;
    agentCount: number;
    isLegacy: boolean;
    turboMode: boolean;
    /** Lean Turbo strategy: 'lean', 'standard', or 'off' */
    turboStrategy?: 'standard' | 'lean' | 'off';
    /** Lean Turbo phase number, if Lean Turbo is active */
    leanTurboPhase?: number;
    /** Number of lanes currently in 'running' status */
    leanActiveLaneCount?: number;
    /** Max parallel coders configured for Lean Turbo */
    leanMaxParallelCoders?: number;
    /** Number of lanes completed */
    leanCompletedLanes?: number;
    /** Number of tasks marked as degraded */
    leanDegradedTasks?: number;
    /** Human-readable degradation summary */
    leanDegradationSummary?: string;
    /** Whether Full-Auto mode is currently active */
    fullAutoActive?: boolean;
    /** Reason for pause if Lean Turbo is paused */
    leanPauseReason?: string;
    /** Last known context budget percentage (0-100), or null if not yet measured */
    contextBudgetPct: number | null;
    /** Number of context compaction events triggered this session */
    compactionCount: number;
    /** ISO timestamp of last compaction snapshot, or null if none */
    lastSnapshotAt: string | null;
    /** Issue #853 Layer C: true if spec drift was detected for this plan */
    specStale?: boolean;
    /** Reason text from .swarm/spec-staleness.json (or RuntimePlan._specStaleReason) */
    specStaleReason?: string;
    /** Stored spec hash from when the plan was last saved */
    specStaleStoredHash?: string;
    /** Current spec.md hash on disk (null when spec.md is missing) */
    specStaleCurrentHash?: string | null;
    /** Sandbox capability and availability status. */
    sandbox?: SandboxStatusInfo;
}
/**
 * Get status data from the swarm directory.
 * Returns structured data that can be used by GUI, background flows, or commands.
 */
export declare function getStatusData(directory: string, agents: Record<string, AgentDefinition>): Promise<StatusData>;
/**
 * Format status data as markdown for command output.
 * This is the thin adapter that delegates to the service.
 */
export declare function formatStatusMarkdown(status: StatusData): string;
/**
 * Handle status command - delegates to service and formats output.
 * Kept for backward compatibility - thin adapter.
 */
export declare function handleStatusCommand(directory: string, agents: Record<string, AgentDefinition>): Promise<string>;

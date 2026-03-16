/**
 * Passive Status Artifact Writer
 *
 * Writes automation status snapshots to .swarm/ for GUI visibility.
 * Provides passive, read-only status information without affecting workflow.
 */
/** Automation status snapshot structure */
export interface AutomationStatusSnapshot {
    /** When this snapshot was generated */
    timestamp: number;
    /** Current automation mode */
    mode: 'manual' | 'hybrid' | 'auto';
    /** Whether automation is enabled */
    enabled: boolean;
    /** Current phase */
    currentPhase: number;
    /** Last trigger information */
    lastTrigger: {
        triggeredAt: number | null;
        triggeredPhase: number | null;
        source: string | null;
        reason: string | null;
    } | null;
    /** Pending actions count */
    pendingActions: number;
    /** Last outcome state */
    lastOutcome: {
        state: 'success' | 'failure' | 'skipped' | 'none';
        phase: number | null;
        outcomeAt: number | null;
        message: string | null;
    } | null;
    /** Feature flags status */
    capabilities: {
        plan_sync: boolean;
        phase_preflight: boolean;
        config_doctor_on_startup: boolean;
        config_doctor_autofix: boolean;
        evidence_auto_summaries: boolean;
        decision_drift_detection: boolean;
    };
}
/**
 * Automation Status Artifact Manager
 *
 * Writes passive status snapshots to .swarm/automation-status.json
 */
export declare class AutomationStatusArtifact {
    private readonly swarmDir;
    private readonly filename;
    private currentSnapshot;
    constructor(swarmDir: string, filename?: string);
    /**
     * Get the full path to the status file
     */
    private getFilePath;
    /**
     * Load existing snapshot from disk
     */
    load(): AutomationStatusSnapshot | null;
    /**
     * Write snapshot to disk
     */
    private write;
    /**
     * Get current snapshot (in-memory)
     */
    getSnapshot(): AutomationStatusSnapshot;
    /**
     * Read snapshot from disk (forces reload)
     */
    read(): AutomationStatusSnapshot;
    /**
     * Update mode and capabilities
     */
    updateConfig(mode: 'manual' | 'hybrid' | 'auto', capabilities: AutomationStatusSnapshot['capabilities']): void;
    /**
     * Update current phase
     */
    updatePhase(phase: number): void;
    /**
     * Record a trigger event
     */
    recordTrigger(triggeredAt: number, triggeredPhase: number, source: string, reason: string): void;
    /**
     * Update pending actions count
     */
    updatePendingActions(count: number): void;
    /**
     * Record an outcome
     */
    recordOutcome(state: 'success' | 'failure' | 'skipped', phase: number, message?: string): void;
    /**
     * Clear the last outcome (reset to none)
     */
    clearOutcome(): void;
    /**
     * Check if automation is enabled (mode != manual)
     */
    isEnabled(): boolean;
    /**
     * Check if a specific capability is enabled
     */
    hasCapability(capability: keyof AutomationStatusSnapshot['capabilities']): boolean;
    /**
     * Get summary for GUI display
     */
    getGuiSummary(): {
        status: string;
        phase: number;
        lastTrigger: string | null;
        pending: number;
        outcome: string | null;
    };
}

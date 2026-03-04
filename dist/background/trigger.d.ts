/**
 * Phase-Boundary Preflight Trigger
 *
 * Detects phase-boundary conditions and triggers preflight requests.
 * Manages phase transitions and queues preflight checks via the automation event bus.
 */
import type { AutomationConfig } from '../config/schema';
import { type AutomationEventBus } from './event-bus';
/** Event types for preflight triggers */
export type PreflightTriggerEventType = 'preflight.requested' | 'preflight.triggered' | 'preflight.skipped' | 'phase.boundary.detected';
/** Preflight trigger payload */
export interface PreflightRequestPayload {
    triggerSource: 'phase_boundary' | 'manual' | 'scheduled';
    currentPhase: number;
    reason: string;
    metadata?: Record<string, unknown>;
}
/** Phase boundary detection result */
export interface PhaseBoundaryResult {
    detected: boolean;
    previousPhase: number;
    currentPhase: number;
    reason: string;
    completedTaskCount: number;
    totalTaskCount: number;
}
/** Preflight trigger configuration */
export interface PreflightTriggerConfig {
    /** Minimum tasks that must be completed in a phase to trigger */
    minCompletedTasksThreshold?: number;
    /** Enable trigger even if no tasks (phase auto-complete mode) */
    allowZeroTaskTrigger?: boolean;
    /** Directory to run preflight checks in */
    directory?: string;
}
/** Preflight handler type */
export type PreflightHandler = (request: PreflightRequest) => Promise<void>;
/** Preflight request queue item */
export interface PreflightRequest {
    id: string;
    triggeredAt: number;
    currentPhase: number;
    source: 'phase_boundary' | 'manual' | 'scheduled';
    reason: string;
    metadata?: Record<string, unknown>;
}
/** Phase boundary detection result */
export interface PhaseBoundaryResult {
    detected: boolean;
    previousPhase: number;
    currentPhase: number;
    reason: string;
    completedTaskCount: number;
    totalTaskCount: number;
}
/** Preflight trigger configuration */
export interface PreflightTriggerConfig {
    /** Minimum tasks that must be completed in a phase to trigger */
    minCompletedTasksThreshold?: number;
    /** Enable trigger even if no tasks (phase auto-complete mode) */
    allowZeroTaskTrigger?: boolean;
}
/**
 * Phase-Boundary Trigger Detector
 *
 * Monitors plan state to detect when a phase transition occurs.
 */
export declare class PhaseBoundaryTrigger {
    private readonly eventBus;
    private readonly config;
    private lastKnownPhase;
    private lastTriggeredPhase;
    constructor(eventBus?: AutomationEventBus, config?: PreflightTriggerConfig);
    /**
     * Set the current phase from external source (plan)
     */
    setCurrentPhase(phase: number): void;
    /**
     * Get the last known phase
     */
    getCurrentPhase(): number;
    /**
     * Get the last triggered phase (for external access)
     */
    get lastTriggeredPhaseValue(): number;
    /**
     * Check if a phase boundary has been crossed
     * Returns the result of the detection
     */
    detectBoundary(newPhase: number, completedTasks: number, totalTasks: number): PhaseBoundaryResult;
    /**
     * Check if preflight should be triggered based on phase boundary
     * Must be called AFTER phase boundary is detected
     */
    shouldTriggerPreflight(boundaryResult: PhaseBoundaryResult): boolean;
    /**
     * Mark that preflight was triggered for a phase
     */
    markTriggered(phase: number): void;
    /**
     * Reset trigger state (for testing)
     */
    reset(): void;
}
/**
 * Preflight Trigger Manager
 *
 * Orchestrates trigger detection, feature flag gating, and request publishing.
 */
export declare class PreflightTriggerManager {
    private readonly automationConfig;
    private readonly eventBus;
    private readonly trigger;
    private readonly requestQueue;
    private requestCounter;
    private preflightHandler;
    private unsubscribe;
    constructor(automationConfig: AutomationConfig, eventBus?: AutomationEventBus, triggerConfig?: PreflightTriggerConfig);
    /**
     * Check if preflight triggers are enabled via feature flags
     * Returns false if config is missing/invalid (fail-safe)
     */
    isEnabled(): boolean;
    /**
     * Get the automation mode
     * Returns 'unknown' for malformed config (fail-safe)
     */
    getMode(): string;
    /**
     * Update current phase from plan state
     */
    updatePhase(phase: number): void;
    /**
     * Check for phase boundary and potentially trigger preflight
     * Returns true if preflight was triggered
     */
    checkAndTrigger(currentPhase: number, completedTasks: number, totalTasks: number): Promise<boolean>;
    /**
     * Trigger a preflight request
     */
    private triggerPreflight;
    /**
     * Get pending preflight requests
     */
    getPendingRequests(): PreflightRequest[];
    /**
     * Get queue size
     */
    getQueueSize(): number;
    /**
     * Get trigger stats
     * All values are fail-safe for malformed config
     */
    getStats(): {
        enabled: boolean;
        mode: string;
        currentPhase: number;
        lastTriggeredPhase: number;
        pendingRequests: number;
    };
    /**
     * Reset state (for testing)
     */
    reset(): void;
    /**
     * Register a handler to be called when preflight is requested.
     * The handler will be invoked with the preflight request details.
     * Only one handler can be registered at a time.
     */
    registerHandler(handler: PreflightHandler): void;
    /**
     * Unregister the preflight handler
     */
    unregisterHandler(): void;
    /**
     * Check if a handler is registered
     */
    hasHandler(): boolean;
}

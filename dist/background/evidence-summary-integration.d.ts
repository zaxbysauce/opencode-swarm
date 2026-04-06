/**
 * Evidence Summary Background Integration
 *
 * Wires the evidence summary service to background automation:
 * - Subscribes to preflight and phase boundary events
 * - Generates evidence summaries automatically
 * - Persists artifacts under .swarm/ for GUI consumption
 * - Respects feature flags (evidence_auto_summaries) with default-off safety
 */
import type { AutomationConfig } from '../config/schema';
import { type EvidenceSummaryArtifact } from '../services/evidence-summary-service';
/** Evidence summary integration configuration */
export interface EvidenceSummaryIntegrationConfig {
    /** Automation configuration for feature flag gating */
    automationConfig: AutomationConfig;
    /** Directory to run evidence analysis in */
    directory: string;
    /** Swarm directory for persisting summary artifacts */
    swarmDir: string;
    /** Filename for the summary artifact (default: evidence-summary.json) */
    summaryFilename?: string;
}
/** Event types that can trigger evidence summary generation */
export type EvidenceSummaryTriggerEvent = 'preflight.completed' | 'phase.boundary.detected' | 'phase.status.checked' | 'task.completed';
/** Payload for evidence summary trigger events */
export interface EvidenceSummaryTriggerPayload {
    trigger: EvidenceSummaryTriggerEvent;
    phase: number;
    reason: string;
    metadata?: Record<string, unknown>;
}
/**
 * Evidence Summary Integration
 *
 * Automatically generates and persists evidence summaries on relevant events.
 */
export declare class EvidenceSummaryIntegration {
    private readonly config;
    private readonly eventBus;
    private unsubscribes;
    constructor(config: EvidenceSummaryIntegrationConfig);
    /**
     * Check if auto-summaries are enabled
     */
    isEnabled(): boolean;
    /**
     * Initialize the integration by subscribing to trigger events
     * Only subscribes if enabled via feature flags
     */
    initialize(): void;
    /**
     * Subscribe to an event type
     */
    private subscribeToEvent;
    /**
     * Generate and persist evidence summary
     */
    generateSummary(phase: number, trigger: EvidenceSummaryTriggerEvent): Promise<EvidenceSummaryArtifact | null>;
    /**
     * Manually trigger summary generation (for CLI or testing)
     */
    triggerManual(phase?: number): Promise<EvidenceSummaryArtifact | null>;
    /**
     * Cleanup subscriptions
     */
    cleanup(): void;
}
/**
 * Create evidence summary integration
 *
 * Factory function that creates and optionally initializes the integration.
 */
export declare function createEvidenceSummaryIntegration(config: EvidenceSummaryIntegrationConfig, autoInitialize?: boolean): EvidenceSummaryIntegration;

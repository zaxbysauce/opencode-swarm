/**
 * Evidence Summary Service
 *
 * Provides deterministic evidence aggregation per task and phase.
 * Produces machine-readable and human-readable summary artifacts.
 */
import type { PhaseStatus, TaskStatus } from '../config/plan-schema';
/** Evidence types required for task completion */
export declare const REQUIRED_EVIDENCE_TYPES: readonly ["review", "test"];
export type RequiredEvidenceType = (typeof REQUIRED_EVIDENCE_TYPES)[number];
/** Summary artifact schema version */
export declare const EVIDENCE_SUMMARY_VERSION = "1.0.0";
/** Evidence summary for a single task */
export interface TaskEvidenceSummary {
    taskId: string;
    phase: number;
    taskStatus: TaskStatus;
    evidenceCount: number;
    hasReview: boolean;
    hasTest: boolean;
    hasApproval: boolean;
    missingEvidence: string[];
    isComplete: boolean;
    blockers: string[];
    lastEvidenceTimestamp: string | null;
}
/** Phase evidence summary */
export interface PhaseEvidenceSummary {
    phaseId: number;
    phaseName: string;
    phaseStatus: PhaseStatus;
    totalTasks: number;
    completedTasks: number;
    tasksWithEvidence: number;
    tasksWithCompleteEvidence: number;
    completionRatio: number;
    missingEvidenceByType: Record<string, string[]>;
    blockers: PhaseBlocker[];
    tasks: TaskEvidenceSummary[];
}
/** Blockers preventing phase closure */
export interface PhaseBlocker {
    type: 'missing_evidence' | 'incomplete_task' | 'blocked_task';
    taskId: string;
    reason: string;
    severity: 'high' | 'medium' | 'low';
}
/** Full evidence summary artifact */
export interface EvidenceSummaryArtifact {
    schema_version: typeof EVIDENCE_SUMMARY_VERSION;
    generated_at: string;
    planTitle: string;
    currentPhase: number;
    phaseSummaries: PhaseEvidenceSummary[];
    overallCompletionRatio: number;
    overallBlockers: PhaseBlocker[];
    summaryText: string;
}
/**
 * Build complete evidence summary artifact
 *
 * Aggregates evidence per task and phase, producing deterministic
 * summary artifacts including completion ratio, missing evidence,
 * blockers, and per-task status.
 */
export declare function buildEvidenceSummary(directory: string, currentPhase?: number): Promise<EvidenceSummaryArtifact | null>;
/**
 * Check if auto-summaries are enabled via feature flags
 */
export declare function isAutoSummaryEnabled(automationConfig?: {
    capabilities?: {
        evidence_auto_summaries?: boolean;
    };
    mode?: string;
}): boolean;

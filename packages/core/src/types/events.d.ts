/**
 * v6.19.0 JSONL Event Types
 * Event interfaces for the prompt-quality and adversarial robustness update
 */
export interface SoundingBoardConsultedEvent {
    type: 'sounding_board_consulted';
    timestamp: string;
    architectQuery: string;
    criticVerdict: 'UNNECESSARY' | 'REPHRASE' | 'APPROVED' | 'RESOLVE';
    phase: number;
    taskId?: string;
}
export interface ArchitectLoopDetectedEvent {
    type: 'architect_loop_detected';
    timestamp: string;
    impasseDescription: string;
    occurrenceCount: number;
    phase: number;
    taskId?: string;
}
export interface PrecedentManipulationDetectedEvent {
    type: 'precedent_manipulation_detected';
    timestamp: string;
    pattern: 'PRECEDENT_MANIPULATION';
    severity: 'HIGHEST';
    detectedIn: string;
    phase: number;
    taskId?: string;
}
export interface CoderSelfAuditEvent {
    type: 'coder_self_audit';
    timestamp: string;
    taskId: string;
    filesModified: string[];
    checklistResults: {
        filesMatchSpec: boolean;
        noExtraFunctionality: boolean;
        noSkippedAcceptanceCriteria: boolean;
        didNotRunTests: boolean;
        syntaxCheckPassed: boolean;
    };
    meta: {
        summary: string;
    };
}
export interface CoderRetryCircuitBreakerEvent {
    type: 'coder_retry_circuit_breaker';
    timestamp: string;
    taskId: string;
    rejectionCount: number;
    rejectionHistory: string[];
    phase: number;
    action: 'sounding_board_consultation' | 'simplification' | 'user_escalation';
}
export type V619Event = SoundingBoardConsultedEvent | ArchitectLoopDetectedEvent | PrecedentManipulationDetectedEvent | CoderSelfAuditEvent | CoderRetryCircuitBreakerEvent;

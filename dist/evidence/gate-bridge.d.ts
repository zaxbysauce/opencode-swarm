import type { Evidence } from '../config/evidence-schema';
import { type TaskEvidence } from '../gate-evidence.js';
export interface DurableGateEvidenceStatus {
    isComplete: boolean;
    missingGates: string[];
    evidenceExists: boolean;
    invalid: boolean;
}
export declare function readDurableGateEvidence(directory: string, taskId: string): Promise<TaskEvidence | null>;
export declare function hasCompleteDurableGateEvidence(evidence: TaskEvidence | null | undefined): boolean;
export declare function getDurableGateEvidenceStatus(evidence: TaskEvidence | null | undefined): DurableGateEvidenceStatus;
export declare function getDurableGateEvidenceStatusForTask(directory: string, taskId: string): Promise<DurableGateEvidenceStatus>;
export declare function hasCompleteDurableGateEvidenceForTask(directory: string, taskId: string): Promise<boolean>;
export declare function mergeDurableGateEntriesFromEvidence(taskId: string, entries: Evidence[], evidence: TaskEvidence | null | undefined): Evidence[];
export declare function mergeDurableGateEntries(directory: string, taskId: string, entries: Evidence[]): Promise<Evidence[]>;

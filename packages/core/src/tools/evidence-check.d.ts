/**
 * Normalize legacy evidence type names to current gate names.
 * @param type - The evidence type to normalize
 * @returns The normalized type name
 */
export declare function normalizeEvidenceType(type: string): string;
export interface CompletedTask {
    taskId: string;
    taskName: string;
}
export interface EvidenceFile {
    taskId: string;
    type: string;
}
export interface Gap {
    taskId: string;
    taskName: string;
    missing: string[];
    present: string[];
}
export interface EvidenceCheckResult {
    completedTasks: CompletedTask[];
    tasksWithFullEvidence: string[];
    completeness: number;
    requiredTypes: string[];
    gaps: Gap[];
}
export interface NoTasksResult {
    message: string;
    gaps: [];
    completeness: number;
}
export declare function validateRequiredTypes(input: string): string | null;
export declare function parseCompletedTasks(planContent: string): CompletedTask[];
export declare function analyzeGaps(completedTasks: CompletedTask[], evidence: EvidenceFile[], requiredTypes: string[]): {
    tasksWithFullEvidence: string[];
    gaps: Gap[];
};

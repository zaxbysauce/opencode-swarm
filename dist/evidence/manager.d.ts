import { type BuildEvidence, type Evidence, type EvidenceBundle, type PlaceholderEvidence, type QualityBudgetEvidence, type SastEvidence, type SbomEvidence, type SecretscanEvidence, type SyntaxEvidence } from '../config/evidence-schema';
/**
 * Discriminated union returned by loadEvidence.
 * - 'found': file exists and passed Zod schema validation
 * - 'not_found': file does not exist on disk
 * - 'invalid_schema': file exists but failed Zod validation; errors contains field names
 */
export type LoadEvidenceResult = {
    status: 'found';
    bundle: EvidenceBundle;
} | {
    status: 'not_found';
} | {
    status: 'invalid_schema';
    errors: string[];
};
/**
 * All valid evidence types (13 total)
 */
export declare const VALID_EVIDENCE_TYPES: readonly ["review", "test", "diff", "approval", "note", "retrospective", "syntax", "placeholder", "sast", "sbom", "build", "quality_budget", "secretscan"];
/**
 * Check if a string is a valid evidence type.
 * Returns true if the type is recognized, false otherwise.
 */
export declare function isValidEvidenceType(type: string): type is (typeof VALID_EVIDENCE_TYPES)[number];
/**
 * Type guards for new evidence types
 */
export declare function isSyntaxEvidence(evidence: Evidence): evidence is SyntaxEvidence;
export declare function isPlaceholderEvidence(evidence: Evidence): evidence is PlaceholderEvidence;
export declare function isSastEvidence(evidence: Evidence): evidence is SastEvidence;
export declare function isSbomEvidence(evidence: Evidence): evidence is SbomEvidence;
export declare function isBuildEvidence(evidence: Evidence): evidence is BuildEvidence;
export declare function isQualityBudgetEvidence(evidence: Evidence): evidence is QualityBudgetEvidence;
/**
 * Type guard for secretscan evidence
 */
export declare function isSecretscanEvidence(evidence: Evidence): evidence is SecretscanEvidence;
/**
 * Validate and sanitize task ID.
 * Accepts four formats:
 * 1. Canonical N.M or N.M.P numeric format (matches TASK_ID_REGEX)
 * 2. Retrospective format: retro-<number> (matches RETRO_TASK_ID_REGEX)
 * 3. Internal automated-tool format: specific tool IDs (sast_scan, quality_budget, etc.)
 * 4. General safe alphanumeric IDs: ASCII letter/digit start, body of letters/digits/dots/hyphens/underscores
 * Rejects: empty string, null bytes, control characters, path traversal (..), spaces, and any
 * character outside the ASCII alphanumeric + [._-] set.
 * @throws Error with descriptive message on failure
 */
export declare function sanitizeTaskId(taskId: string): string;
/**
 * Save evidence to a task's evidence bundle.
 * Creates new bundle if doesn't exist, appends to existing.
 * Performs atomic write via temp file + rename.
 * @throws Error if task ID is invalid or size limit would be exceeded
 */
export declare function saveEvidence(directory: string, taskId: string, evidence: Evidence): Promise<EvidenceBundle>;
/**
 * Load evidence bundle for a task.
 * Returns a LoadEvidenceResult discriminated union.
 */
export declare function loadEvidence(directory: string, taskId: string): Promise<LoadEvidenceResult>;
/**
 * List all task IDs that have evidence bundles.
 * Returns sorted array of valid task IDs.
 * Returns empty array if evidence directory doesn't exist.
 */
export declare function listEvidenceTaskIds(directory: string): Promise<string[]>;
/**
 * Delete evidence bundle for a task.
 * Returns true if deleted, false if didn't exist or deletion failed.
 */
export declare function deleteEvidence(directory: string, taskId: string): Promise<boolean>;
/**
 * Check if a requirement coverage file exists for a given phase.
 * Looks for .swarm/evidence/req-coverage-phase-{N}.json
 */
export declare function checkRequirementCoverage(phase: number, directory: string): Promise<{
    exists: boolean;
    path: string;
}>;
/**
 * Archive old evidence bundles based on retention policy.
 * Removes evidence older than maxAgeDays.
 * If maxBundles is provided, enforces a maximum bundle count by deleting oldest first.
 * Returns array of archived (deleted) task IDs.
 */
export declare function archiveEvidence(directory: string, maxAgeDays: number, maxBundles?: number): Promise<string[]>;

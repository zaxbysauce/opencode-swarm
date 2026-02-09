import { type Evidence, type EvidenceBundle } from '../config/evidence-schema';
/**
 * Validate and sanitize task ID.
 * Must match regex ^[\w-]+(\.[\w-]+)*$
 * Rejects: .., ../, null bytes, control characters, empty string
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
 * Returns null if file doesn't exist or validation fails.
 */
export declare function loadEvidence(directory: string, taskId: string): Promise<EvidenceBundle | null>;
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
 * Archive old evidence bundles based on retention policy.
 * Removes evidence older than maxAgeDays.
 * If maxBundles is provided, enforces a maximum bundle count by deleting oldest first.
 * Returns array of archived (deleted) task IDs.
 */
export declare function archiveEvidence(directory: string, maxAgeDays: number, maxBundles?: number): Promise<string[]>;

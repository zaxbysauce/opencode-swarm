import { mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import * as path from 'node:path';
import {
	EVIDENCE_MAX_JSON_BYTES,
	type Evidence,
	type EvidenceBundle,
	EvidenceBundleSchema,
} from '../config/evidence-schema';
import { readSwarmFileAsync, validateSwarmPath } from '../hooks/utils';
import { warn } from '../utils';

/**
 * Task ID validation regex: alphanumeric, hyphens, and dots (for version-like IDs)
 * Pattern: ^[\w-]+(\.[\w-]+)*$
 * Rejects: .., ../, null bytes, control characters, empty string
 */
const TASK_ID_REGEX = /^[\w-]+(\.[\w-]+)*$/;

/**
 * Validate and sanitize task ID.
 * Must match regex ^[\w-]+(\.[\w-]+)*$
 * Rejects: .., ../, null bytes, control characters, empty string
 * @throws Error with descriptive message on failure
 */
export function sanitizeTaskId(taskId: string): string {
	// Check for empty string
	if (!taskId || taskId.length === 0) {
		throw new Error('Invalid task ID: empty string');
	}

	// Check for null bytes
	if (/\0/.test(taskId)) {
		throw new Error('Invalid task ID: contains null bytes');
	}

	// Check for control characters (char codes < 32)
	for (let i = 0; i < taskId.length; i++) {
		if (taskId.charCodeAt(i) < 32) {
			throw new Error('Invalid task ID: contains control characters');
		}
	}

	// Check for path traversal patterns
	if (
		taskId.includes('..') ||
		taskId.includes('../') ||
		taskId.includes('..\\')
	) {
		throw new Error('Invalid task ID: path traversal detected');
	}

	// Validate against regex
	if (!TASK_ID_REGEX.test(taskId)) {
		throw new Error(
			`Invalid task ID: must match pattern ^[\\w-]+(\\.[\\w-]+)*$, got "${taskId}"`,
		);
	}

	return taskId;
}

/**
 * Save evidence to a task's evidence bundle.
 * Creates new bundle if doesn't exist, appends to existing.
 * Performs atomic write via temp file + rename.
 * @throws Error if task ID is invalid or size limit would be exceeded
 */
export async function saveEvidence(
	directory: string,
	taskId: string,
	evidence: Evidence,
): Promise<EvidenceBundle> {
	// Validate task ID
	const sanitizedTaskId = sanitizeTaskId(taskId);

	// Construct and validate path
	const relativePath = path.join('evidence', sanitizedTaskId, 'evidence.json');
	const evidencePath = validateSwarmPath(directory, relativePath);
	const evidenceDir = path.dirname(evidencePath);

	// Load existing bundle or create new one
	let bundle: EvidenceBundle;
	const existingContent = await readSwarmFileAsync(directory, relativePath);

	if (existingContent !== null) {
		try {
			const parsed = JSON.parse(existingContent);
			bundle = EvidenceBundleSchema.parse(parsed);
		} catch (error) {
			// Invalid existing bundle, create new one
			warn(
				`Existing evidence bundle invalid for task ${sanitizedTaskId}, creating new: ${error instanceof Error ? error.message : String(error)}`,
			);
			const now = new Date().toISOString();
			bundle = {
				schema_version: '1.0.0',
				task_id: sanitizedTaskId,
				entries: [],
				created_at: now,
				updated_at: now,
			};
		}
	} else {
		// Create new bundle
		const now = new Date().toISOString();
		bundle = {
			schema_version: '1.0.0',
			task_id: sanitizedTaskId,
			entries: [],
			created_at: now,
			updated_at: now,
		};
	}

	// Create new bundle with appended evidence
	const updatedBundle: EvidenceBundle = {
		...bundle,
		entries: [...bundle.entries, evidence],
		updated_at: new Date().toISOString(),
	};

	// Check size limit
	const bundleJson = JSON.stringify(updatedBundle);
	if (bundleJson.length > EVIDENCE_MAX_JSON_BYTES) {
		throw new Error(
			`Evidence bundle size (${bundleJson.length} bytes) exceeds maximum (${EVIDENCE_MAX_JSON_BYTES} bytes)`,
		);
	}

	// Create directory (recursive)
	mkdirSync(evidenceDir, { recursive: true });

	// Write atomically: temp file + rename
	const tempPath = path.join(
		evidenceDir,
		`evidence.json.tmp.${Date.now()}.${process.pid}`,
	);
	try {
		await Bun.write(tempPath, bundleJson);
		renameSync(tempPath, evidencePath);
	} catch (error) {
		// Clean up temp file on failure
		try {
			rmSync(tempPath, { force: true });
		} catch {}
		throw error;
	}

	return updatedBundle;
}

/**
 * Load evidence bundle for a task.
 * Returns null if file doesn't exist or validation fails.
 */
export async function loadEvidence(
	directory: string,
	taskId: string,
): Promise<EvidenceBundle | null> {
	// Validate task ID
	const sanitizedTaskId = sanitizeTaskId(taskId);

	// Construct relative path
	const relativePath = path.join('evidence', sanitizedTaskId, 'evidence.json');
	validateSwarmPath(directory, relativePath);

	// Read file
	const content = await readSwarmFileAsync(directory, relativePath);
	if (content === null) {
		return null;
	}

	// Parse and validate
	try {
		const parsed = JSON.parse(content);
		const validated = EvidenceBundleSchema.parse(parsed);
		return validated;
	} catch (error) {
		warn(
			`Evidence bundle validation failed for task ${sanitizedTaskId}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return null;
	}
}

/**
 * List all task IDs that have evidence bundles.
 * Returns sorted array of valid task IDs.
 * Returns empty array if evidence directory doesn't exist.
 */
export async function listEvidenceTaskIds(
	directory: string,
): Promise<string[]> {
	// Validate evidence base directory path
	const evidenceBasePath = validateSwarmPath(directory, 'evidence');

	// Check if directory exists
	try {
		statSync(evidenceBasePath);
	} catch {
		return [];
	}

	// Read directory entries
	let entries: string[];
	try {
		entries = readdirSync(evidenceBasePath);
	} catch {
		return [];
	}

	// Filter to only valid task ID directories
	const taskIds: string[] = [];
	for (const entry of entries) {
		const entryPath = path.join(evidenceBasePath, entry);
		try {
			// Check if it's a directory
			const stats = statSync(entryPath);
			if (!stats.isDirectory()) {
				continue;
			}

			// Validate as task ID
			sanitizeTaskId(entry);
			taskIds.push(entry);
		} catch (error) {
			// Only log unexpected errors (not invalid task ID names)
			if (
				error instanceof Error &&
				!error.message.startsWith('Invalid task ID')
			) {
				warn(`Error reading evidence entry '${entry}': ${error.message}`);
			}
		}
	}

	// Return sorted
	return taskIds.sort();
}

/**
 * Delete evidence bundle for a task.
 * Returns true if deleted, false if didn't exist or deletion failed.
 */
export async function deleteEvidence(
	directory: string,
	taskId: string,
): Promise<boolean> {
	// Validate task ID
	const sanitizedTaskId = sanitizeTaskId(taskId);

	// Construct and validate path
	const relativePath = path.join('evidence', sanitizedTaskId);
	const evidenceDir = validateSwarmPath(directory, relativePath);

	// Check if directory exists first
	try {
		statSync(evidenceDir);
	} catch {
		return false;
	}

	// Delete directory recursively
	try {
		rmSync(evidenceDir, { recursive: true, force: true });
		return true;
	} catch (error) {
		warn(
			`Failed to delete evidence for task ${sanitizedTaskId}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return false;
	}
}

/**
 * Archive old evidence bundles based on retention policy.
 * Removes evidence older than maxAgeDays.
 * If maxBundles is provided, enforces a maximum bundle count by deleting oldest first.
 * Returns array of archived (deleted) task IDs.
 */
export async function archiveEvidence(
	directory: string,
	maxAgeDays: number,
	maxBundles?: number,
): Promise<string[]> {
	const taskIds = await listEvidenceTaskIds(directory);
	const cutoffDate = new Date();
	cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
	const cutoffIso = cutoffDate.toISOString();

	const archived: string[] = [];
	const remainingBundles: Array<{ taskId: string; updatedAt: string }> = [];

	for (const taskId of taskIds) {
		const bundle = await loadEvidence(directory, taskId);
		if (!bundle) {
			continue;
		}

		// Archive if the bundle hasn't been updated since the cutoff
		if (bundle.updated_at < cutoffIso) {
			const deleted = await deleteEvidence(directory, taskId);
			if (deleted) {
				archived.push(taskId);
			}
		} else {
			// Track remaining bundles for maxBundles enforcement
			remainingBundles.push({
				taskId,
				updatedAt: bundle.updated_at,
			});
		}
	}

	// Enforce maxBundles limit if specified
	if (maxBundles !== undefined && remainingBundles.length > maxBundles) {
		// Sort by updated_at ascending (oldest first)
		remainingBundles.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));

		// Delete oldest bundles until we're within the limit
		const toDelete = remainingBundles.length - maxBundles;
		for (let i = 0; i < toDelete; i++) {
			const deleted = await deleteEvidence(
				directory,
				remainingBundles[i].taskId,
			);
			if (deleted) {
				archived.push(remainingBundles[i].taskId);
			}
		}
	}

	return archived;
}

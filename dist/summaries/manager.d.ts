/**
 * Validate and sanitize summary ID.
 * Must match regex ^S\d+$ (e.g., S1, S2, S99)
 * Rejects: empty string, null bytes, control characters, path traversal, non-matching patterns
 * @throws Error with descriptive message on failure
 */
export declare function sanitizeSummaryId(id: string): string;
/**
 * Store a summary entry to .swarm/summaries/{id}.json.
 * Performs atomic write via temp file + rename.
 * @throws Error if summary ID is invalid or size limit would be exceeded
 */
export declare function storeSummary(directory: string, id: string, fullOutput: string, summaryText: string, maxStoredBytes: number): Promise<void>;
/**
 * Load fullOutput from a summary entry.
 * Returns null if file doesn't exist or validation fails.
 */
export declare function loadFullOutput(directory: string, id: string): Promise<string | null>;
/**
 * List all summary IDs that have summary entries.
 * Returns sorted array of valid summary IDs.
 * Returns empty array if summaries directory doesn't exist.
 */
export declare function listSummaries(directory: string): Promise<string[]>;
/**
 * Delete summaries older than retentionDays.
 * Returns array of deleted summary IDs.
 */
export declare function cleanupSummaries(directory: string, retentionDays: number): Promise<string[]>;

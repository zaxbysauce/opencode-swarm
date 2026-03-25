/**
 * TRAJECTORY LOGGER (v6.31 Task 3.2)
 *
 * tool.execute.after hook that appends per-task tool call trajectories to a
 * .swarm/evidence/{taskId}/trajectory.jsonl file. Only logs INSIDE delegation
 * scope (when delegationActive is true on the session).
 *
 * Trajectories are used for post-hoc analysis, audit trails, and replay.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { sanitizeTaskId } from '../evidence/manager';
import { swarmState } from '../state';
import { validateSwarmPath } from './utils';

export interface TrajectoryConfig {
	enabled: boolean;
	max_lines: number;
}

export interface TrajectoryEntry {
	tool: string;
	args_summary: string;
	verdict: string;
	timestamp: string;
	agent: string;
	elapsed_ms: number;
}

/**
 * Module-level map for tracking tool call start times.
 * Populated by toolBefore (via recordToolCallStart), consumed by toolAfter.
 */
const callStartTimes = new Map<string, number>();

/**
 * Sensitive field names to redact in args summaries.
 */
const SENSITIVE_FIELDS = new Set([
	'password',
	'token',
	'secret',
	'api_key',
	'apikey',
	'authorization',
	'access_token',
	'refresh_token',
	'private_key',
	'secret_key',
	'credential',
	'auth',
	'bearer',
	'x-api-key',
	'session_id',
	'cookie',
]);

/**
 * Substrings that indicate a sensitive key name.
 * Used for case-insensitive partial matching to avoid false positives.
 */
const SENSITIVE_SUBSTRINGS = [
	'key',
	'secret',
	'token',
	'password',
	'auth',
	'credential',
	'private',
	'certificate',
	'bearer',
	'session',
	'cookie',
];

/**
 * Check if a key name contains any sensitive substring.
 */
function isSensitiveKey(key: string): boolean {
	const lower = key.toLowerCase();
	return SENSITIVE_SUBSTRINGS.some((substr) => lower.includes(substr));
}

/**
 * Truncates a trajectory file to the newest half when maxLines is exceeded.
 * Reads all lines, keeps the newest half, rewrites the file.
 *
 * @param filePath - Absolute path to the trajectory.jsonl file
 * @param maxLines - Maximum number of lines to retain
 */
export async function truncateTrajectoryFile(
	filePath: string,
	maxLines: number,
): Promise<void> {
	try {
		const content = await fs.readFile(filePath, 'utf-8');
		const lines = content.split('\n').filter((line) => line.trim().length > 0);
		if (lines.length <= maxLines) {
			return;
		}

		// Keep the newest half
		const keepCount = Math.floor(maxLines / 2);
		const keptLines = lines.slice(-keepCount);
		await fs.writeFile(filePath, `${keptLines.join('\n')}\n`, 'utf-8');
	} catch {
		/* non-blocking: truncate errors are swallowed */
	}
}

/**
 * Creates the trajectory logger hook pair.
 *
 * @param config - TrajectoryConfig { enabled: boolean (default true), max_lines: number (default 500) }
 * @param _directory - Reserved for future use (evidence path derived from session taskId)
 * @returns Object with toolAfter handler
 */
export function createTrajectoryLoggerHook(
	config: Partial<TrajectoryConfig>,
	_directory: string,
): {
	toolAfter: (
		input: {
			tool: string;
			sessionID: string;
			callID: string;
			args?: Record<string, unknown>;
		},
		output: { title: string; output: string; metadata: unknown },
	) => Promise<void>;
} {
	const enabled = config.enabled ?? true;
	const maxLines = config.max_lines ?? 500;

	return {
		toolAfter: async (input, output) => {
			if (!enabled) return;

			const sessionId = input.sessionID;
			const session = swarmState.agentSessions.get(sessionId);

			// Only log INSIDE delegation scope
			if (!session?.delegationActive) {
				return;
			}

			const taskId = session.currentTaskId;
			if (!taskId) {
				return;
			}

			// Calculate elapsed time
			const startKey = `${sessionId}:${input.callID}`;
			const startTime = callStartTimes.get(startKey) ?? Date.now();
			callStartTimes.delete(startKey);
			const elapsed_ms = Date.now() - startTime;

			// Derive agent name
			const agentName =
				swarmState.activeAgent.get(sessionId) ??
				session?.agentName ??
				'unknown';

			// Summarize args as string, max 200 chars
			const args_summary = summarizeArgs(input.args, 200);

			// Derive verdict from output metadata or default to success/failure
			const verdict = deriveVerdict(output);

			const entry: TrajectoryEntry = {
				tool: input.tool,
				args_summary,
				verdict,
				timestamp: new Date().toISOString(),
				agent: agentName,
				elapsed_ms,
			};

			// Append to trajectory file
			const sanitized = sanitizeTaskId(taskId);
			const relativePath = path.join('evidence', sanitized, 'trajectory.jsonl');
			const trajectoryPath = validateSwarmPath(_directory, relativePath);

			try {
				// Ensure directory exists
				await fs.mkdir(path.dirname(trajectoryPath), { recursive: true });

				// Append entry
				const line = `${JSON.stringify(entry)}\n`;
				await fs.appendFile(trajectoryPath, line, 'utf-8');

				// Truncate if exceeded max_lines
				await truncateTrajectoryFile(trajectoryPath, maxLines);
			} catch {
				/* non-blocking: file I/O errors are swallowed */
			}
		},
	};
}

/**
 * Records the start time for a tool call (called from toolBefore).
 * Stored in a module-level Map for correlation with toolAfter.
 *
 * @param sessionId - Session identifier
 * @param callID - Tool call identifier
 * @param startTime - Start timestamp in milliseconds
 */
export function recordToolCallStart(
	sessionId: string,
	callID: string,
	startTime: number,
): void {
	const key = `${sessionId}:${callID}`;
	callStartTimes.set(key, startTime);

	// Cleanup stale entries older than 30 minutes to prevent memory leak
	const cutoff = Date.now() - 30 * 60 * 1000;
	for (const [k, timestamp] of callStartTimes.entries()) {
		if (timestamp < cutoff) {
			callStartTimes.delete(k);
		}
	}
}

/**
 * Summarizes tool arguments as a compact string.
 * Handles nested objects, arrays, and sensitive fields.
 *
 * @param args - Tool arguments object
 * @param maxLength - Maximum length of the summary string
 * @returns Compact string summary
 */
function summarizeArgs(
	args: Record<string, unknown> | undefined,
	maxLength: number,
): string {
	if (!args || Object.keys(args).length === 0) {
		return '';
	}

	const summaries: string[] = [];
	for (const [key, value] of Object.entries(args)) {
		// Skip sensitive fields - check exact match and substring match
		if (SENSITIVE_FIELDS.has(key) || isSensitiveKey(key)) {
			summaries.push(`${key}:[REDACTED]`);
			continue;
		}

		if (value === null || value === undefined) {
			summaries.push(`${key}:null`);
		} else if (typeof value === 'string') {
			// Truncate long string values
			const truncated = value.length > 50 ? `${value.slice(0, 50)}...` : value;
			summaries.push(`${key}:"${truncated}"`);
		} else if (typeof value === 'number' || typeof value === 'boolean') {
			summaries.push(`${key}:${String(value)}`);
		} else if (Array.isArray(value)) {
			const itemSummary =
				value.length > 3
					? `${value.slice(0, 3).map(String).join(',')},...(+${value.length - 3})`
					: value.map(String).join(',');
			summaries.push(`${key}:[${itemSummary}]`);
		} else if (typeof value === 'object') {
			const keys = Object.keys(value as Record<string, unknown>);
			summaries.push(`${key}:{${keys.join(',')}}`);
		} else {
			summaries.push(`${key}:${typeof value}`);
		}
	}

	const summary = summaries.join(' ');
	return summary.length > maxLength
		? `${summary.slice(0, maxLength - 3)}...`
		: summary;
}

/**
 * Derives the verdict from tool output metadata or string content.
 *
 * @param output - Tool execution output
 * @returns 'success', 'failure', or a custom verdict string
 */
function deriveVerdict(output: {
	title: string;
	output: string;
	metadata: unknown;
}): string {
	// Check metadata for verdict signal
	if (
		output.metadata &&
		typeof output.metadata === 'object' &&
		!Array.isArray(output.metadata)
	) {
		const meta = output.metadata as Record<string, unknown>;

		// Check for explicit verdict field
		if (typeof meta.verdict === 'string' && meta.verdict.length > 0) {
			return meta.verdict;
		}

		// Check for success/passed fields
		if (meta.success === false || meta.passed === false) {
			return 'failure';
		}
		if (meta.success === true || meta.passed === true) {
			return 'success';
		}
	}

	// Fallback: check output string for error indicators
	const outputStr = String(output.output ?? '');
	if (
		outputStr.startsWith('Error:') ||
		outputStr.startsWith('error:') ||
		outputStr.startsWith('Error: ')
	) {
		return 'failure';
	}

	return 'success';
}

/**
 * TRAJECTORY STORE (Session-Level)
 *
 * Per-session trajectory storage for PRM pattern detection.
 * Writes to .swarm/trajectories/{sessionId}.jsonl
 *
 * Coexists with task-level trajectory-logger.ts which writes to
 * .swarm/evidence/{taskId}/trajectory.jsonl for audit/evidence.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { validateSwarmPath } from '../hooks/utils';
import type { TrajectoryEntry } from './types';

// Module-level in-memory trajectory cache per sessionId.
// Populated on write by appendTrajectoryEntry, used by pattern detection.
// Eliminates full disk reads on every toolAfter call.
const _inMemoryTrajectoryCache = new Map<string, TrajectoryEntry[]>();

/**
 * Returns cached trajectory entries for a session (empty array if not cached).
 */
export function getInMemoryTrajectory(sessionId: string): TrajectoryEntry[] {
	return _inMemoryTrajectoryCache.get(sessionId) ?? [];
}

/**
 * Clears trajectory cache (for test isolation or session cleanup).
 */
export function clearTrajectoryCache(sessionId?: string): void {
	if (sessionId !== undefined) {
		_inMemoryTrajectoryCache.delete(sessionId);
	} else {
		_inMemoryTrajectoryCache.clear();
	}
}

/**
 * Builds the validated absolute path to a session's trajectory file.
 */
function getTrajectoryPath(sessionId: string, directory: string): string {
	const relativePath = path.join('trajectories', `${sessionId}.jsonl`);
	return validateSwarmPath(directory, relativePath);
}

/**
 * Appends a single TrajectoryEntry to the session's trajectory file.
 *
 * @param sessionId - Session identifier
 * @param entry - Trajectory entry to append
 * @param directory - Base directory (workspace root)
 * @param maxLines - Maximum lines before auto-truncation (default 1000)
 */
export async function appendTrajectoryEntry(
	sessionId: string,
	entry: TrajectoryEntry,
	directory: string,
	maxLines: number = 1000,
): Promise<void> {
	try {
		// 1. Update in-memory cache (always, before disk write)
		const cached = _inMemoryTrajectoryCache.get(sessionId) ?? [];
		cached.push(entry);

		// Keep in-memory cache bounded (trim to half when exceeded)
		if (cached.length > maxLines) {
			const keepCount = Math.max(1, Math.floor(maxLines / 2));
			_inMemoryTrajectoryCache.set(sessionId, cached.slice(-keepCount));
		} else {
			_inMemoryTrajectoryCache.set(sessionId, cached);
		}

		// 2. Append to disk (best-effort, no read-modify-write truncation)
		const trajectoryPath = getTrajectoryPath(sessionId, directory);
		await fs.mkdir(path.dirname(trajectoryPath), { recursive: true });
		const line = `${JSON.stringify(entry)}\n`;
		await fs.appendFile(trajectoryPath, line, 'utf-8');
	} catch (err) {
		// Non-blocking: swallow errors to prevent PRM from breaking main flow
		console.warn(
			`[trajectory-store] Failed to append trajectory entry: ${err}`,
		);
	}
}

/**
 * Reads all TrajectoryEntry records from a session's trajectory file.
 *
 * @param sessionId - Session identifier
 * @param directory - Base directory (workspace root)
 * @returns Array of trajectory entries (empty array if file doesn't exist)
 */
export async function readTrajectory(
	sessionId: string,
	directory: string,
): Promise<TrajectoryEntry[]> {
	try {
		const trajectoryPath = getTrajectoryPath(sessionId, directory);

		const content = await fs.readFile(trajectoryPath, 'utf-8');
		const lines = content.split('\n').filter((line) => line.trim().length > 0);

		const entries: TrajectoryEntry[] = [];
		for (const line of lines) {
			try {
				entries.push(JSON.parse(line) as TrajectoryEntry);
			} catch {
				// Skip malformed JSON lines
			}
		}
		return entries;
	} catch (err) {
		// File doesn't exist or read error - return empty array
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
			return [];
		}
		console.warn(`[trajectory-store] Failed to read trajectory: ${err}`);
		return [];
	}
}

/**
 * Alias for readTrajectory - retrieves trajectory entries for a session.
 *
 * @param sessionId - Session identifier
 * @param directory - Base directory (workspace root)
 * @returns Array of trajectory entries
 */
export async function getTrajectoryForSession(
	sessionId: string,
	directory: string,
): Promise<TrajectoryEntry[]> {
	return readTrajectory(sessionId, directory);
}

/**
 * Truncates the trajectory file to the newest half if lines exceed maxLines.
 *
 * @param sessionId - Session identifier
 * @param directory - Base directory (workspace root)
 * @param maxLines - Maximum number of lines to retain
 */
export async function truncateTrajectoryIfNeeded(
	sessionId: string,
	directory: string,
	maxLines: number,
): Promise<void> {
	try {
		const trajectoryPath = getTrajectoryPath(sessionId, directory);

		const content = await fs.readFile(trajectoryPath, 'utf-8');
		const lines = content.split('\n').filter((line) => line.trim().length > 0);

		if (lines.length <= maxLines) {
			return;
		}

		// Keep the newest half (rounded down), minimum 1
		const keepCount = Math.max(1, Math.floor(maxLines / 2));
		const keptLines = lines.slice(-keepCount);
		await fs.writeFile(trajectoryPath, `${keptLines.join('\n')}\n`, 'utf-8');
	} catch (err) {
		// Non-blocking: swallow errors
		console.warn(`[trajectory-store] Failed to truncate trajectory: ${err}`);
	}
}

/**
 * Returns the highest step number in the session's trajectory.
 * Used to determine the next step number when appending.
 *
 * @param sessionId - Session identifier
 * @param directory - Base directory (workspace root)
 * @returns Highest step number, or 0 if no trajectory exists
 */
export async function getCurrentStep(
	sessionId: string,
	directory: string,
): Promise<number> {
	try {
		const trajectoryPath = getTrajectoryPath(sessionId, directory);

		// Note: Node.js is single-threaded; concurrent calls to appendTrajectoryEntry
		// within the same process will be serialized. Cross-process races are possible
		// but unlikely given the PRM's best-effort design.
		const content = await fs.readFile(trajectoryPath, 'utf-8');
		const lines = content.split('\n').filter((line) => line.trim().length > 0);

		let maxStep = 0;
		for (const line of lines) {
			try {
				const entry = JSON.parse(line) as TrajectoryEntry;
				if (entry.step > maxStep) {
					maxStep = entry.step;
				}
			} catch {
				// Skip malformed JSON lines
			}
		}
		return maxStep;
	} catch (err) {
		// File doesn't exist or read error - return 0
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
			return 0;
		}
		console.warn(`[trajectory-store] Failed to get current step: ${err}`);
		return 0;
	}
}

/**
 * Deletes trajectory and replay files older than maxAgeDays.
 * Non-blocking: errors are swallowed, not thrown.
 */
export async function cleanupOldTrajectoryFiles(
	directory: string,
	maxAgeDays: number = 7,
): Promise<void> {
	const cutoffMs = maxAgeDays * 24 * 60 * 60 * 1000;
	const now = Date.now();

	for (const subdir of ['trajectories', 'replays']) {
		try {
			const dirPath = validateSwarmPath(directory, subdir);
			const entries = await fs.readdir(dirPath, { withFileTypes: true });
			for (const entry of entries) {
				if (!entry.isFile()) continue;
				const filePath = path.join(dirPath, entry.name);
				try {
					const stat = await fs.stat(filePath);
					if (now - stat.mtimeMs > cutoffMs) {
						await fs.unlink(filePath);
					}
				} catch {
					// Non-blocking
				}
			}
		} catch {
			// Non-blocking
		}
	}
}

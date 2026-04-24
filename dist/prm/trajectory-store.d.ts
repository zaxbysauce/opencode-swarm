/**
 * TRAJECTORY STORE (Session-Level)
 *
 * Per-session trajectory storage for PRM pattern detection.
 * Writes to .swarm/trajectories/{sessionId}.jsonl
 *
 * Coexists with task-level trajectory-logger.ts which writes to
 * .swarm/evidence/{taskId}/trajectory.jsonl for audit/evidence.
 */
import type { TrajectoryEntry } from './types';
/**
 * Returns cached trajectory entries for a session (empty array if not cached).
 */
export declare function getInMemoryTrajectory(sessionId: string): TrajectoryEntry[];
/**
 * Clears trajectory cache (for test isolation or session cleanup).
 */
export declare function clearTrajectoryCache(sessionId?: string): void;
/**
 * Appends a single TrajectoryEntry to the session's trajectory file.
 *
 * @param sessionId - Session identifier
 * @param entry - Trajectory entry to append
 * @param directory - Base directory (workspace root)
 * @param maxLines - Maximum lines before in-memory cache trimming (default 1000)
 */
export declare function appendTrajectoryEntry(sessionId: string, entry: TrajectoryEntry, directory: string, maxLines?: number): Promise<void>;
/**
 * Reads all TrajectoryEntry records from a session's trajectory file.
 *
 * @param sessionId - Session identifier
 * @param directory - Base directory (workspace root)
 * @returns Array of trajectory entries (empty array if file doesn't exist)
 */
export declare function readTrajectory(sessionId: string, directory: string): Promise<TrajectoryEntry[]>;
/**
 * Alias for readTrajectory - retrieves trajectory entries for a session.
 *
 * @param sessionId - Session identifier
 * @param directory - Base directory (workspace root)
 * @returns Array of trajectory entries
 */
export declare function getTrajectoryForSession(sessionId: string, directory: string): Promise<TrajectoryEntry[]>;
/**
 * Truncates the trajectory file to the newest half if lines exceed maxLines.
 *
 * @param sessionId - Session identifier
 * @param directory - Base directory (workspace root)
 * @param maxLines - Maximum number of lines to retain
 */
export declare function truncateTrajectoryIfNeeded(sessionId: string, directory: string, maxLines: number): Promise<void>;
/**
 * Returns the highest step number in the session's trajectory.
 * Used to determine the next step number when appending.
 *
 * @param sessionId - Session identifier
 * @param directory - Base directory (workspace root)
 * @returns Highest step number, or 0 if no trajectory exists
 */
export declare function getCurrentStep(sessionId: string, directory: string): Promise<number>;
/**
 * Deletes trajectory and replay files older than maxAgeDays.
 * Runs against .swarm/trajectories/ and .swarm/replays/ directories.
 * Non-blocking: errors logged, not thrown.
 */
export declare function cleanupOldTrajectoryFiles(directory: string, maxAgeDays?: number): Promise<void>;

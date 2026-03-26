/**
 * TRAJECTORY LOGGER (v6.31 Task 3.2)
 *
 * tool.execute.after hook that appends per-task tool call trajectories to a
 * .swarm/evidence/{taskId}/trajectory.jsonl file. Only logs INSIDE delegation
 * scope (when delegationActive is true on the session).
 *
 * Trajectories are used for post-hoc analysis, audit trails, and replay.
 */
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
 * Truncates a trajectory file to the newest half when maxLines is exceeded.
 * Reads all lines, keeps the newest half, rewrites the file.
 *
 * @param filePath - Absolute path to the trajectory.jsonl file
 * @param maxLines - Maximum number of lines to retain
 */
export declare function truncateTrajectoryFile(filePath: string, maxLines: number): Promise<void>;
/**
 * Creates the trajectory logger hook pair.
 *
 * @param config - TrajectoryConfig { enabled: boolean (default true), max_lines: number (default 500) }
 * @param _directory - Reserved for future use (evidence path derived from session taskId)
 * @returns Object with toolAfter handler
 */
export declare function createTrajectoryLoggerHook(config: Partial<TrajectoryConfig>, _directory: string): {
    toolAfter: (input: {
        tool: string;
        sessionID: string;
        callID: string;
        args?: Record<string, unknown>;
    }, output: {
        title: string;
        output: string;
        metadata: unknown;
    }) => Promise<void>;
};
/**
 * Records the start time for a tool call (called from toolBefore).
 * Stored in a module-level Map for correlation with toolAfter.
 *
 * @param sessionId - Session identifier
 * @param callID - Tool call identifier
 * @param startTime - Start timestamp in milliseconds
 */
export declare function recordToolCallStart(sessionId: string, callID: string, startTime: number): void;

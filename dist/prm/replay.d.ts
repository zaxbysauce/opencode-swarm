/**
 * PRM Replay System
 *
 * Provides deterministic replay functionality for PRM (Process Remediation Manager).
 * Records all LLM requests/responses and tool I/O during a run for replay.
 *
 * Replay artifacts are stored in `.swarm/replays/{sessionId}-{timestamp}.jsonl`
 */
/**
 * Entry types for replay recording
 */
export type ReplayEntryType = 'llm_request' | 'llm_response' | 'tool_call' | 'tool_result' | 'pattern_detected' | 'course_correction' | 'escalation' | 'hard_stop';
/**
 * A single entry in the replay log
 */
export interface ReplayEntry {
    /** ISO 8601 timestamp when entry was recorded */
    timestamp: string;
    /** Session identifier */
    sessionID: string;
    /** Type of replay entry */
    type: ReplayEntryType;
    /** Entry data payload */
    data: Record<string, unknown>;
}
/**
 * Initializes replay recording for a session.
 * Creates the replay directory if it doesn't exist.
 * Non-blocking: errors are caught and logged, returns null on failure.
 *
 * @param sessionID - Session identifier
 * @param directory - Project directory
 * @returns Path to the replay artifact file, or null on error
 */
export declare function startReplayRecording(sessionID: string, directory: string): Promise<string | null>;
/**
 * Appends a ReplayEntry to the replay artifact file.
 * Non-blocking: errors are caught and logged, never thrown.
 *
 * @param artifactPath - Path to the replay artifact file
 * @param sessionID - Session identifier
 * @param entry - Entry to record (without timestamp/sessionID)
 */
export declare function recordReplayEntry(artifactPath: string, sessionID: string, entry: Omit<ReplayEntry, 'timestamp' | 'sessionID'>): Promise<void>;

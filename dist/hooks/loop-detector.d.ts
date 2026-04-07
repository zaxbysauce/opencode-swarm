/**
 * Loop detector for Task tool delegations.
 * Tracks the last 10 delegation patterns per session using a sliding window.
 * Detects loops when the same (toolName + targetAgent + firstArgKey) hash
 * appears 3 or more consecutive times.
 */
export interface LoopDetectResult {
    looping: boolean;
    count: number;
    pattern: string;
}
/**
 * Detect delegation loops for a session.
 * Only tracks Task tool calls (agent delegations).
 * Returns the current loop state after recording this call.
 */
export declare function detectLoop(sessionId: string, toolName: string, args: unknown): LoopDetectResult;

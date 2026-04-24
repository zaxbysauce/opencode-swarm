/**
 * Escalation Tracker Module
 * Implements a 3-strike protocol for pattern detection escalation
 */
import type { CourseCorrection, EscalationState, PatternMatch } from './types';
/**
 * Creates a default EscalationState with all counters reset and flags cleared.
 * Exported for testing purposes.
 *
 * @returns A fresh EscalationState with default values
 */
export declare function createDefaultEscalationState(): EscalationState;
/**
 * EscalationTracker
 *
 * Tracks pattern detection counts per session and implements a 3-strike escalation protocol:
 * - Level 1 (1st detection): Guidance via pendingAdvisoryMessages
 * - Level 2 (2nd detection): Stronger guidance + architect alert via telemetry
 * - Level 3 (3rd+ detection): Hard stop flag that is read by messagesTransform
 *
 * All methods are safe and never throw errors.
 */
export declare class EscalationTracker {
    private readonly _sessionId;
    private _state;
    /**
     * Creates a new EscalationTracker for the given session.
     *
     * @param sessionId - The session identifier
     * @param initialState - Optional initial state to restore (for session resumption)
     */
    constructor(sessionId: string, initialState?: EscalationState);
    /**
     * Records a pattern detection and determines the escalation level.
     * Updates internal state based on the 3-strike protocol.
     *
     * @param match - The pattern match to record
     * @returns An object containing the escalation level, correction (if any), and hard stop flag
     */
    recordDetection(match: PatternMatch): {
        level: number;
        correction: CourseCorrection | null;
        hardStop: boolean;
    };
    /**
     * Returns the current escalation state.
     *
     * @returns The current EscalationState (reference, not a copy)
     */
    getState(): EscalationState;
    /**
     * Resets all escalation counts and flags to their default values.
     * Clears pattern counts, corrections pending, and all flags.
     */
    reset(): void;
    /**
     * Returns all pending course corrections.
     *
     * @returns Array of pending CourseCorrection objects
     */
    getPendingCorrections(): CourseCorrection[];
    /**
     * Clears all pending course corrections.
     */
    clearPendingCorrections(): void;
    /**
     * Returns whether a hard stop is pending.
     * This flag is read by messagesTransform to halt agent execution.
     *
     * @returns true if hard stop is pending, false otherwise
     */
    isHardStopPending(): boolean;
}

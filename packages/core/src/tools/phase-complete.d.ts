/**
 * Phase completion tool for tracking and validating phase completion.
 * Core implementation - gathers data, enforces policy, writes event, resets state.
 */
/**
 * Arguments for the phase_complete tool
 */
export interface PhaseCompleteArgs {
    /** The phase number being completed */
    phase: number;
    /** Optional summary of the phase */
    summary?: string;
    /** Session ID to track state (optional, defaults to current session context) */
    sessionID?: string;
}
/**
 * Execute the phase_complete tool
 * Gathers data, enforces policy, writes event, resets state
 */
export declare function executePhaseComplete(args: PhaseCompleteArgs, workingDirectory?: string): Promise<string>;
/**
 * Validate phase number
 */
export declare function validatePhaseNumber(phase: unknown): boolean;

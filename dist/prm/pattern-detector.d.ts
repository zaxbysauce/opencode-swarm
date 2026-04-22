/**
 * PRM Pattern Detector
 * Rule-based pattern detection for trajectory analysis
 */
import type { PatternDetectionResult, PatternMatch, PrmConfig, TrajectoryEntry } from './types';
/**
 * Sanitize a string to prevent prompt injection attacks.
 * Removes newlines, carriage returns, backticks, and common injection patterns.
 * Limits length to prevent overflow.
 *
 * @param input - The string to sanitize
 * @returns Sanitized string safe for embedding in prompts
 */
export declare function sanitizeString(input: string): string;
/**
 * Detect repetition_loop pattern
 * Same agent targets same file with same action within N steps
 *
 * @param trajectory - Array of trajectory entries
 * @param config - PRM configuration
 * @returns Array of detected pattern matches
 */
export declare function detectRepetitionLoop(trajectory: TrajectoryEntry[], config: PrmConfig): PatternMatch[];
/**
 * Detect ping_pong pattern
 * Agent A delegates to B, B completes, A delegates to B again
 * Alternating agent patterns with same target
 *
 * @param trajectory - Array of trajectory entries
 * @param config - PRM configuration
 * @returns Array of detected pattern matches
 */
export declare function detectPingPong(trajectory: TrajectoryEntry[], config: PrmConfig): PatternMatch[];
/**
 * Detect expansion_drift pattern
 * Successive plans grow in scope (unique targets increase >50%)
 *
 * @param trajectory - Array of trajectory entries
 * @param config - PRM configuration
 * @returns Array of detected pattern matches
 */
export declare function detectExpansionDrift(trajectory: TrajectoryEntry[], config: PrmConfig): PatternMatch[];
/**
 * Detect stuck_on_test pattern
 * Edit -> test fail -> edit same file cycle
 *
 * @param trajectory - Array of trajectory entries
 * @param config - PRM configuration
 * @returns Array of detected pattern matches
 */
export declare function detectStuckOnTest(trajectory: TrajectoryEntry[], config: PrmConfig): PatternMatch[];
/**
 * Detect context_thrash pattern
 * Agent requests increasingly large file sets (monotonic increase in unique targets)
 * Context thrash is detected when the agent keeps introducing NEW targets without
 * revisiting old ones - i.e., the unique target count increases for consecutive steps
 * with NO plateaus in between.
 *
 * @param trajectory - Array of trajectory entries
 * @param config - PRM configuration
 * @returns Array of detected pattern matches
 */
export declare function detectContextThrash(trajectory: TrajectoryEntry[], config: PrmConfig): PatternMatch[];
/**
 * Run all pattern detectors on a trajectory
 *
 * @param trajectory - Array of trajectory entries to analyze
 * @param config - PRM configuration with thresholds
 * @returns PatternDetectionResult with all matches and timing info
 */
export declare function detectPatterns(trajectory: TrajectoryEntry[], config: PrmConfig, lastProcessedStep?: number): PatternDetectionResult;

/**
 * PRM (Process Remediation Manager) Facade
 *
 * Integration layer that wires together all PRM components:
 * - Trajectory logging via trajectory-store
 * - Pattern detection via pattern-detector
 * - Course correction via course-correction
 * - Escalation tracking via escalation
 *
 * This module provides the createPrmHook factory that returns the toolAfter
 * handler used by the swarm hook system. PRM replaces loop-detector.ts for
 * repetition_loop detection, but loop-detector.ts is kept as a fast circuit
 * breaker for backward compatibility.
 */
export { formatCourseCorrectionForInjection, generateCourseCorrection, } from './course-correction';
export { createDefaultEscalationState, EscalationTracker } from './escalation';
export { detectContextThrash, detectExpansionDrift, detectPatterns, detectPingPong, detectRepetitionLoop, detectStuckOnTest, } from './pattern-detector';
export type { CourseCorrection, EscalationState, PatternDetectionResult, PatternMatch, PatternSeverity, PatternType, PrmConfig, TaxonomyCategory, TrajectoryEntry, } from './types';
import type { PrmConfig } from './types';
/**
 * Context passed to toolAfter handler
 */
interface ToolAfterContext {
    sessionID: string;
    tool?: string;
    args_summary?: string;
    result?: 'success' | 'failure' | 'pending';
}
/**
 * PRM hook interface returned by createPrmHook
 */
interface PrmHook {
    toolAfter: (context: ToolAfterContext) => Promise<void>;
}
/**
 * Creates a PRM hook for the given configuration.
 *
 * The returned toolAfter handler:
 * - Runs after each tool execution when PRM is enabled
 * - Reads the session trajectory
 * - Runs pattern detection
 * - Generates course corrections for detected patterns
 * - Updates session state with corrections and escalation level
 * - Emits telemetry events
 *
 * This function is non-blocking: errors are caught and logged, never thrown.
 *
 * @param config - PRM configuration (enabled, thresholds, etc.)
 * @param directory - Project directory for trajectory storage
 * @returns PrmHook with toolAfter handler
 *
 * @example
 * ```typescript
 * const prmHook = createPrmHook(prmConfig, directory);
 * // Wire prmHook.toolAfter into your tool.execute.after hook
 * ```
 */
export declare function createPrmHook(config: PrmConfig, directory: string): PrmHook;

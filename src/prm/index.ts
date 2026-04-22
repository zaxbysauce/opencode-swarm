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

// Course correction
export {
	formatCourseCorrectionForInjection,
	generateCourseCorrection,
} from './course-correction';
// Escalation
export { createDefaultEscalationState, EscalationTracker } from './escalation';
// Pattern detector
export {
	detectContextThrash,
	detectExpansionDrift,
	detectPatterns,
	detectPingPong,
	detectRepetitionLoop,
	detectStuckOnTest,
} from './pattern-detector';
// Types
export type {
	CourseCorrection,
	EscalationState,
	PatternDetectionResult,
	PatternMatch,
	PatternSeverity,
	PatternType,
	PrmConfig,
	TaxonomyCategory,
	TrajectoryEntry,
} from './types';

import { getAgentSession } from '../state';
import { telemetry } from '../telemetry';
import {
	formatCourseCorrectionForInjection,
	generateCourseCorrection,
} from './course-correction';
import { EscalationTracker } from './escalation';
import { detectPatterns } from './pattern-detector';
import { recordReplayEntry, startReplayRecording } from './replay';
import { readTrajectory } from './trajectory-store';
import type { PatternType, PrmConfig } from './types';

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
 * Per-session PRM state stored on the session object
 */
interface SessionPrmState {
	/** Escalation tracker instance for this session */
	prmEscalationTracker?: EscalationTracker;
	/** Whether PRM has been initialized for this session */
	prmInitialized?: boolean;
	/** Replay artifact path for this session */
	replayArtifactPath?: string | null;
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
export function createPrmHook(config: PrmConfig, directory: string): PrmHook {
	/**
	 * Async handler called after each tool execution.
	 * Non-blocking - errors are caught and logged.
	 */
	async function toolAfter(context: ToolAfterContext): Promise<void> {
		// Skip if PRM is disabled
		if (!config.enabled) {
			return;
		}

		const { sessionID } = context;

		// Get session from state
		const session = getAgentSession(sessionID);
		if (!session || !session.delegationActive) {
			return;
		}

		try {
			// Read trajectory for this session
			const trajectory = await readTrajectory(sessionID, directory);

			// Run pattern detection
			const detectionResult = detectPatterns(trajectory, config);

			if (detectionResult.matches.length === 0) {
				return;
			}

			// Get or create escalation tracker for this session
			const sessionPrmState = session as typeof session & SessionPrmState;
			let escalationTracker = sessionPrmState.prmEscalationTracker;

			// Initialize replay recording on first use (lazy initialization)
			if (!sessionPrmState.replayArtifactPath) {
				sessionPrmState.replayArtifactPath = await startReplayRecording(
					sessionID,
					directory,
				);
			}

			const artifactPath = sessionPrmState.replayArtifactPath;

			if (!escalationTracker) {
				// Create tracker with existing state if available (for session resumption)
				const initialState = session.prmLastPatternDetected
					? {
							patternCounts: new Map(session.prmPatternCounts.entries()) as Map<
								PatternType,
								number
							>,
							escalationLevel: session.prmEscalationLevel,
							lastPatternDetected: session.prmLastPatternDetected,
							hardStopPending: session.prmHardStopPending,
							correctionsPending: [],
						}
					: undefined;

				escalationTracker = new EscalationTracker(sessionID, initialState);
				sessionPrmState.prmEscalationTracker = escalationTracker;
			}

			// Track previous escalation level for change detection
			const previousEscalationLevel = session.prmEscalationLevel;

			// Process each pattern match
			for (const match of detectionResult.matches) {
				// Generate course correction
				const correction = generateCourseCorrection(match, trajectory);
				const formattedCorrection =
					formatCourseCorrectionForInjection(correction);

				// Add to session pending advisory messages for injection
				if (!session.pendingAdvisoryMessages) {
					session.pendingAdvisoryMessages = [];
				}
				session.pendingAdvisoryMessages.push(formattedCorrection);

				// Record detection for escalation tracking
				let escalationLevel = 0;
				let hardStopPending = false;
				if (config.escalation_enabled !== false) {
					const escalationResult = escalationTracker.recordDetection(match);
					escalationLevel = escalationResult.level;
					hardStopPending = escalationResult.hardStop;
				}

				// Clear the corrections queue after injection to prevent unbounded growth
				escalationTracker.clearPendingCorrections();

				// Update session PRM state fields
				session.prmPatternCounts.set(
					match.pattern,
					(session.prmPatternCounts.get(match.pattern) ?? 0) + 1,
				);
				session.prmEscalationLevel = escalationLevel;
				session.prmLastPatternDetected = match;
				session.prmHardStopPending = hardStopPending;

				// Emit telemetry for pattern detection
				telemetry.prmPatternDetected(
					sessionID,
					match.pattern,
					match.severity,
					match.category,
					match.stepRange,
				);

				// Emit telemetry for course correction injection
				telemetry.prmCourseCorrectionInjected(
					sessionID,
					match.pattern,
					escalationLevel,
				);

				// Record pattern detected for replay (non-blocking, serialized)
				if (artifactPath) {
					await recordReplayEntry(artifactPath, sessionID, {
						type: 'pattern_detected',
						data: {
							pattern: match.pattern,
							severity: match.severity,
							category: match.category,
							stepRange: match.stepRange,
							description: match.description,
							affectedAgents: match.affectedAgents,
							affectedTargets: match.affectedTargets,
							occurrenceCount: match.occurrenceCount,
						},
					});
				}

				// Record course correction for replay (non-blocking, serialized)
				if (artifactPath) {
					await recordReplayEntry(artifactPath, sessionID, {
						type: 'course_correction',
						data: {
							pattern: correction.pattern,
							alert: correction.alert,
							category: correction.category,
							guidance: correction.guidance,
							action: correction.action,
							stepRange: correction.stepRange,
							escalationLevel,
						},
					});
				}
			}

			// Record escalation level change for replay (non-blocking, serialized)
			if (
				artifactPath &&
				session.prmEscalationLevel > previousEscalationLevel
			) {
				await recordReplayEntry(artifactPath, sessionID, {
					type: 'escalation',
					data: {
						previousLevel: previousEscalationLevel,
						newLevel: session.prmEscalationLevel,
						hardStopPending: session.prmHardStopPending,
					},
				});
			}

			// Record hard stop trigger for replay (non-blocking, serialized)
			if (
				artifactPath &&
				session.prmHardStopPending &&
				previousEscalationLevel < 3
			) {
				await recordReplayEntry(artifactPath, sessionID, {
					type: 'hard_stop',
					data: {
						escalationLevel: session.prmEscalationLevel,
						triggeredAt: new Date().toISOString(),
					},
				});
			}
		} catch (err) {
			// Non-blocking: log error and continue
			console.warn(`[prm] toolAfter error for session ${sessionID}: ${err}`);
		}
	}

	return { toolAfter };
}

import { afterEach, beforeEach, describe, expect, test, vi } from 'bun:test';
// Import actual modules as namespaces for spying
import * as stateModule from '../../state';
import * as telemetryModule from '../../telemetry';
import * as courseCorrectionModule from '../course-correction';
import { EscalationTracker } from '../escalation';
import { createPrmHook } from '../index';
import * as patternDetectorModule from '../pattern-detector';
import * as trajectoryStoreModule from '../trajectory-store';
import type { PatternMatch, PrmConfig, TrajectoryEntry } from '../types';

function createMockConfig(overrides: Partial<PrmConfig> = {}): PrmConfig {
	return {
		enabled: true,
		pattern_thresholds: {
			repetition_loop: 2,
			ping_pong: 2,
			expansion_drift: 3,
			stuck_on_test: 3,
			context_thrash: 3,
		},
		max_trajectory_lines: 100,
		escalation_enabled: true,
		detection_timeout_ms: 5000,
		...overrides,
	};
}

function createMockTrajectory(): TrajectoryEntry[] {
	return [
		{
			step: 1,
			agent: 'coder',
			action: 'edit',
			target: 'src/foo.ts',
			intent: 'Add feature',
			timestamp: '2024-01-01T00:00:00Z',
			result: 'success',
			tool: 'edit',
			args_summary: 'src/foo.ts',
		},
		{
			step: 2,
			agent: 'reviewer',
			action: 'review',
			target: 'src/foo.ts',
			intent: 'Review changes',
			timestamp: '2024-01-01T00:01:00Z',
			result: 'success',
		},
	];
}

function createMockPatternMatch(
	pattern: PatternMatch['pattern'] = 'repetition_loop',
	overrides: Partial<PatternMatch> = {},
): PatternMatch {
	return {
		pattern,
		severity: 'medium',
		category: 'coordination_error',
		stepRange: [1, 3],
		description: 'Test pattern detected',
		affectedAgents: ['coder'],
		affectedTargets: ['src/foo.ts'],
		occurrenceCount: 1,
		...overrides,
	};
}

function createMockSession(sessionId: string, delegationActive = true) {
	return {
		sessionId,
		agentName: 'test-agent',
		lastToolCallTime: Date.now(),
		lastAgentEventTime: Date.now(),
		delegationActive,
		activeInvocationId: 1,
		lastInvocationIdByAgent: {},
		windows: {},
		lastCompactionHint: 0,
		architectWriteCount: 0,
		lastCoderDelegationTaskId: null,
		currentTaskId: '1.1',
		gateLog: new Map(),
		reviewerCallCount: new Map(),
		lastGateFailure: null,
		partialGateWarningsIssuedForTask: new Set(),
		selfFixAttempted: false,
		selfCodingWarnedAtCount: 0,
		catastrophicPhaseWarnings: new Set(),
		qaSkipCount: 0,
		qaSkipTaskIds: [],
		taskWorkflowStates: new Map(),
		stageBCompletion: new Map(),
		taskCouncilApproved: new Map(),
		lastGateOutcome: null,
		declaredCoderScope: null,
		lastScopeViolation: null,
		scopeViolationDetected: false,
		modifiedFilesThisCoderTask: [],
		turboMode: false,
		qaGateSessionOverrides: {},
		fullAutoMode: false,
		fullAutoInteractionCount: 0,
		fullAutoDeadlockCount: 0,
		fullAutoLastQuestionHash: null,
		model_fallback_index: 0,
		modelFallbackExhausted: false,
		coderRevisions: 0,
		revisionLimitHit: false,
		loopDetectionWindow: [],
		pendingAdvisoryMessages: [],
		sessionRehydratedAt: 0,
		// PRM fields
		prmPatternCounts: new Map(),
		prmEscalationLevel: 0,
		prmLastPatternDetected: null as PatternMatch | null,
		prmTrajectoryStep: 0,
		prmHardStopPending: false,
		prmEscalationTracker: undefined,
	};
}

function setupHappyPathMocks(
	_sessionId: string,
	trajectory: TrajectoryEntry[],
	matches: PatternMatch[],
) {
	vi.spyOn(stateModule, 'getAgentSession').mockReturnValue({
		agentName: 'test-agent',
		lastToolCallTime: Date.now(),
		lastAgentEventTime: Date.now(),
		delegationActive: true,
		activeInvocationId: 1,
		lastInvocationIdByAgent: {},
		windows: {},
		lastCompactionHint: 0,
		architectWriteCount: 0,
		lastCoderDelegationTaskId: null,
		currentTaskId: '1.1',
		gateLog: new Map(),
		reviewerCallCount: new Map(),
		lastGateFailure: null,
		partialGateWarningsIssuedForTask: new Set(),
		selfFixAttempted: false,
		selfCodingWarnedAtCount: 0,
		catastrophicPhaseWarnings: new Set(),
		qaSkipCount: 0,
		qaSkipTaskIds: [],
		taskWorkflowStates: new Map(),
		stageBCompletion: new Map(),
		taskCouncilApproved: new Map(),
		lastGateOutcome: null,
		declaredCoderScope: null,
		lastScopeViolation: null,
		scopeViolationDetected: false,
		modifiedFilesThisCoderTask: [],
		turboMode: false,
		qaGateSessionOverrides: {},
		fullAutoMode: false,
		fullAutoInteractionCount: 0,
		fullAutoDeadlockCount: 0,
		fullAutoLastQuestionHash: null,
		model_fallback_index: 0,
		modelFallbackExhausted: false,
		coderRevisions: 0,
		revisionLimitHit: false,
		loopDetectionWindow: [],
		pendingAdvisoryMessages: [],
		sessionRehydratedAt: 0,
		prmPatternCounts: new Map(),
		prmEscalationLevel: 0,
		prmLastPatternDetected: null as PatternMatch | null,
		prmTrajectoryStep: 0,
		prmHardStopPending: false,
		prmEscalationTracker: undefined,
	});

	vi.spyOn(trajectoryStoreModule, 'readTrajectory').mockResolvedValue(
		trajectory,
	);
	vi.spyOn(patternDetectorModule, 'detectPatterns').mockReturnValue({
		matches,
		detectionTimeMs: 5,
		patternsChecked: 5,
	});
	vi.spyOn(courseCorrectionModule, 'generateCourseCorrection').mockReturnValue({
		alert: 'TRAJECTORY ALERT: repetition_loop detected',
		category: 'coordation_error',
		guidance: 'Stop the repetitive loop',
		action: 'Consolidate changes',
		pattern: 'repetition_loop',
		stepRange: [1, 3],
	});
	vi.spyOn(
		courseCorrectionModule,
		'formatCourseCorrectionForInjection',
	).mockReturnValue('FORMATTED CORRECTION');
}

describe('createPrmHook', () => {
	const sessionId = 'test-session-123';
	const directory = '/test/project';

	beforeEach(() => {
		vi.clearAllMocks();
		// Set up default mocks for telemetry - ensure methods exist even if other tests' mocks don't have them
		if (!telemetryModule.telemetry.prmPatternDetected) {
			telemetryModule.telemetry.prmPatternDetected = vi.fn();
		} else {
			vi.spyOn(
				telemetryModule.telemetry,
				'prmPatternDetected',
			).mockImplementation(() => {});
		}
		if (!telemetryModule.telemetry.prmCourseCorrectionInjected) {
			telemetryModule.telemetry.prmCourseCorrectionInjected = vi.fn();
		} else {
			vi.spyOn(
				telemetryModule.telemetry,
				'prmCourseCorrectionInjected',
			).mockImplementation(() => {});
		}
		if (!telemetryModule.telemetry.prmEscalationTriggered) {
			telemetryModule.telemetry.prmEscalationTriggered = vi.fn();
		} else {
			vi.spyOn(
				telemetryModule.telemetry,
				'prmEscalationTriggered',
			).mockImplementation(() => {});
		}
		if (!telemetryModule.telemetry.prmHardStop) {
			telemetryModule.telemetry.prmHardStop = vi.fn();
		} else {
			vi.spyOn(telemetryModule.telemetry, 'prmHardStop').mockImplementation(
				() => {},
			);
		}
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('enabled/disabled config', () => {
		test('returns early when config.enabled is false', async () => {
			const config = createMockConfig({ enabled: false });
			vi.spyOn(stateModule, 'getAgentSession').mockReturnValue(
				createMockSession(sessionId),
			);
			// Spy to track calls even though we expect early return
			vi.spyOn(trajectoryStoreModule, 'readTrajectory').mockResolvedValue([]);
			vi.spyOn(patternDetectorModule, 'detectPatterns').mockReturnValue({
				matches: [],
				detectionTimeMs: 5,
				patternsChecked: 5,
			});

			const { toolAfter } = createPrmHook(config, directory);

			await toolAfter({ sessionID: sessionId });

			// Should NOT call trajectory or detection
			expect(trajectoryStoreModule.readTrajectory).not.toHaveBeenCalled();
			expect(patternDetectorModule.detectPatterns).not.toHaveBeenCalled();
		});

		test('processes when config.enabled is true', async () => {
			const config = createMockConfig({ enabled: true });
			const session = createMockSession(sessionId);
			vi.spyOn(stateModule, 'getAgentSession').mockReturnValue(session);
			vi.spyOn(trajectoryStoreModule, 'readTrajectory').mockResolvedValue(
				createMockTrajectory(),
			);
			vi.spyOn(patternDetectorModule, 'detectPatterns').mockReturnValue({
				matches: [],
				detectionTimeMs: 5,
				patternsChecked: 5,
			});

			const { toolAfter } = createPrmHook(config, directory);

			await toolAfter({ sessionID: sessionId });

			expect(trajectoryStoreModule.readTrajectory).toHaveBeenCalledWith(
				sessionId,
				directory,
			);
			expect(patternDetectorModule.detectPatterns).toHaveBeenCalled();
		});

		test('returns early when session not found', async () => {
			const config = createMockConfig({ enabled: true });
			vi.spyOn(stateModule, 'getAgentSession').mockReturnValue(undefined);
			// Spy to track calls even though we expect early return
			vi.spyOn(trajectoryStoreModule, 'readTrajectory').mockResolvedValue([]);

			const { toolAfter } = createPrmHook(config, directory);

			await toolAfter({ sessionID: sessionId });

			expect(trajectoryStoreModule.readTrajectory).not.toHaveBeenCalled();
		});

		test('returns early when delegationActive is false', async () => {
			const config = createMockConfig({ enabled: true });
			const session = createMockSession(sessionId, false); // delegationActive = false
			vi.spyOn(stateModule, 'getAgentSession').mockReturnValue(session);
			// Spy to track calls even though we expect early return
			vi.spyOn(trajectoryStoreModule, 'readTrajectory').mockResolvedValue([]);

			const { toolAfter } = createPrmHook(config, directory);

			await toolAfter({ sessionID: sessionId });

			expect(trajectoryStoreModule.readTrajectory).not.toHaveBeenCalled();
		});

		test('returns early when no pattern matches found', async () => {
			const config = createMockConfig({ enabled: true });
			const session = createMockSession(sessionId);
			vi.spyOn(stateModule, 'getAgentSession').mockReturnValue(session);
			vi.spyOn(trajectoryStoreModule, 'readTrajectory').mockResolvedValue(
				createMockTrajectory(),
			);
			vi.spyOn(patternDetectorModule, 'detectPatterns').mockReturnValue({
				matches: [],
				detectionTimeMs: 5,
				patternsChecked: 5,
			});

			const { toolAfter } = createPrmHook(config, directory);

			await toolAfter({ sessionID: sessionId });

			// No escalation tracker should be created when no matches
			expect(session.prmEscalationTracker).toBeUndefined();
		});
	});

	describe('pattern detection integration', () => {
		test('processes single pattern match correctly', async () => {
			const config = createMockConfig({ enabled: true });
			const trajectory = createMockTrajectory();
			const match = createMockPatternMatch('repetition_loop');
			setupHappyPathMocks(sessionId, trajectory, [match]);

			const { toolAfter } = createPrmHook(config, directory);

			await toolAfter({ sessionID: sessionId });

			expect(
				courseCorrectionModule.generateCourseCorrection,
			).toHaveBeenCalledWith(match, trajectory);
			expect(
				courseCorrectionModule.formatCourseCorrectionForInjection,
			).toHaveBeenCalled();
		});

		test('processes multiple pattern matches in sequence', async () => {
			const config = createMockConfig({ enabled: true });
			const trajectory = createMockTrajectory();
			const match1 = createMockPatternMatch('repetition_loop');
			const match2 = createMockPatternMatch('ping_pong');
			setupHappyPathMocks(sessionId, trajectory, [match1, match2]);

			const { toolAfter } = createPrmHook(config, directory);

			await toolAfter({ sessionID: sessionId });

			// Should process both matches
			expect(
				courseCorrectionModule.generateCourseCorrection,
			).toHaveBeenCalledTimes(2);
			expect(
				courseCorrectionModule.formatCourseCorrectionForInjection,
			).toHaveBeenCalledTimes(2);
			const session = stateModule.getAgentSession(sessionId);
			expect(session?.pendingAdvisoryMessages ?? []).toHaveLength(2);
		});

		test('passes correct config to detectPatterns', async () => {
			const config = createMockConfig({
				enabled: true,
				pattern_thresholds: {
					repetition_loop: 5,
					ping_pong: 10,
					expansion_drift: 3,
					stuck_on_test: 3,
					context_thrash: 5,
				},
			});
			const session = createMockSession(sessionId);
			const trajectory = createMockTrajectory();
			vi.spyOn(stateModule, 'getAgentSession').mockReturnValue(session);
			vi.spyOn(trajectoryStoreModule, 'readTrajectory').mockResolvedValue(
				trajectory,
			);
			vi.spyOn(patternDetectorModule, 'detectPatterns').mockReturnValue({
				matches: [],
				detectionTimeMs: 5,
				patternsChecked: 5,
			});

			const { toolAfter } = createPrmHook(config, directory);

			await toolAfter({ sessionID: sessionId });

			expect(patternDetectorModule.detectPatterns).toHaveBeenCalledWith(
				trajectory,
				config,
			);
		});
	});

	describe('session state updates', () => {
		test('creates new escalation tracker on first pattern detection', async () => {
			const config = createMockConfig({ enabled: true });
			const trajectory = createMockTrajectory();
			const match = createMockPatternMatch('repetition_loop');
			const session = createMockSession(sessionId);
			vi.spyOn(stateModule, 'getAgentSession').mockReturnValue(session);
			vi.spyOn(trajectoryStoreModule, 'readTrajectory').mockResolvedValue(
				trajectory,
			);
			vi.spyOn(patternDetectorModule, 'detectPatterns').mockReturnValue({
				matches: [match],
				detectionTimeMs: 5,
				patternsChecked: 5,
			});
			vi.spyOn(
				courseCorrectionModule,
				'generateCourseCorrection',
			).mockReturnValue({
				alert: 'ALERT',
				category: 'coordination_error',
				guidance: 'GUIDANCE',
				action: 'ACTION',
				pattern: 'repetition_loop',
				stepRange: [1, 3],
			});
			vi.spyOn(
				courseCorrectionModule,
				'formatCourseCorrectionForInjection',
			).mockReturnValue('FORMATTED');

			const { toolAfter } = createPrmHook(config, directory);

			await toolAfter({ sessionID: sessionId });

			expect(session.prmEscalationTracker).toBeInstanceOf(EscalationTracker);
		});

		test('reuses existing escalation tracker on subsequent detections', async () => {
			const config = createMockConfig({ enabled: true });
			const trajectory = createMockTrajectory();
			const match = createMockPatternMatch('repetition_loop');
			const session = createMockSession(sessionId);
			vi.spyOn(stateModule, 'getAgentSession').mockReturnValue(session);
			vi.spyOn(trajectoryStoreModule, 'readTrajectory').mockResolvedValue(
				trajectory,
			);
			vi.spyOn(patternDetectorModule, 'detectPatterns').mockReturnValue({
				matches: [match],
				detectionTimeMs: 5,
				patternsChecked: 5,
			});
			vi.spyOn(
				courseCorrectionModule,
				'generateCourseCorrection',
			).mockReturnValue({
				alert: 'ALERT',
				category: 'coordination_error',
				guidance: 'GUIDANCE',
				action: 'ACTION',
				pattern: 'repetition_loop',
				stepRange: [1, 3],
			});
			vi.spyOn(
				courseCorrectionModule,
				'formatCourseCorrectionForInjection',
			).mockReturnValue('FORMATTED');

			const { toolAfter } = createPrmHook(config, directory);

			// First call
			await toolAfter({ sessionID: sessionId });
			const firstTracker = session.prmEscalationTracker;

			// Second call - same tracker should be reused
			await toolAfter({ sessionID: sessionId });

			expect(session.prmEscalationTracker).toBe(firstTracker);
		});

		test('adds formatted correction to pendingAdvisoryMessages', async () => {
			const config = createMockConfig({ enabled: true });
			const trajectory = createMockTrajectory();
			const match = createMockPatternMatch('repetition_loop');
			const session = createMockSession(sessionId);
			vi.spyOn(stateModule, 'getAgentSession').mockReturnValue(session);
			vi.spyOn(trajectoryStoreModule, 'readTrajectory').mockResolvedValue(
				trajectory,
			);
			vi.spyOn(patternDetectorModule, 'detectPatterns').mockReturnValue({
				matches: [match],
				detectionTimeMs: 5,
				patternsChecked: 5,
			});
			vi.spyOn(
				courseCorrectionModule,
				'generateCourseCorrection',
			).mockReturnValue({
				alert: 'ALERT',
				category: 'coordination_error',
				guidance: 'GUIDANCE',
				action: 'ACTION',
				pattern: 'repetition_loop',
				stepRange: [1, 3],
			});
			vi.spyOn(
				courseCorrectionModule,
				'formatCourseCorrectionForInjection',
			).mockReturnValue('FORMATTED CORRECTION STRING');

			const { toolAfter } = createPrmHook(config, directory);

			await toolAfter({ sessionID: sessionId });

			expect(session.pendingAdvisoryMessages as string[]).toContain(
				'FORMATTED CORRECTION STRING',
			);
		});

		test('updates prmPatternCounts for detected pattern', async () => {
			const config = createMockConfig({ enabled: true });
			const trajectory = createMockTrajectory();
			const match = createMockPatternMatch('repetition_loop');
			const session = createMockSession(sessionId);
			vi.spyOn(stateModule, 'getAgentSession').mockReturnValue(session);
			vi.spyOn(trajectoryStoreModule, 'readTrajectory').mockResolvedValue(
				trajectory,
			);
			vi.spyOn(patternDetectorModule, 'detectPatterns').mockReturnValue({
				matches: [match],
				detectionTimeMs: 5,
				patternsChecked: 5,
			});
			vi.spyOn(
				courseCorrectionModule,
				'generateCourseCorrection',
			).mockReturnValue({
				alert: 'ALERT',
				category: 'coordination_error',
				guidance: 'GUIDANCE',
				action: 'ACTION',
				pattern: 'repetition_loop',
				stepRange: [1, 3],
			});
			vi.spyOn(
				courseCorrectionModule,
				'formatCourseCorrectionForInjection',
			).mockReturnValue('FORMATTED');

			const { toolAfter } = createPrmHook(config, directory);

			await toolAfter({ sessionID: sessionId });

			expect(session.prmPatternCounts.get('repetition_loop')).toBe(1);
		});

		test('increments prmPatternCounts on subsequent detections', async () => {
			const config = createMockConfig({ enabled: true });
			const trajectory = createMockTrajectory();
			const match = createMockPatternMatch('repetition_loop');
			const session = createMockSession(sessionId);
			vi.spyOn(stateModule, 'getAgentSession').mockReturnValue(session);
			vi.spyOn(trajectoryStoreModule, 'readTrajectory').mockResolvedValue(
				trajectory,
			);
			vi.spyOn(patternDetectorModule, 'detectPatterns').mockReturnValue({
				matches: [match],
				detectionTimeMs: 5,
				patternsChecked: 5,
			});
			vi.spyOn(
				courseCorrectionModule,
				'generateCourseCorrection',
			).mockReturnValue({
				alert: 'ALERT',
				category: 'coordination_error',
				guidance: 'GUIDANCE',
				action: 'ACTION',
				pattern: 'repetition_loop',
				stepRange: [1, 3],
			});
			vi.spyOn(
				courseCorrectionModule,
				'formatCourseCorrectionForInjection',
			).mockReturnValue('FORMATTED');

			const { toolAfter } = createPrmHook(config, directory);

			await toolAfter({ sessionID: sessionId });
			expect(session.prmPatternCounts.get('repetition_loop')).toBe(1);

			await toolAfter({ sessionID: sessionId });
			expect(session.prmPatternCounts.get('repetition_loop')).toBe(2);
		});

		test('updates prmEscalationLevel from escalation tracker', async () => {
			const config = createMockConfig({ enabled: true });
			const trajectory = createMockTrajectory();
			const match = createMockPatternMatch('repetition_loop');
			const session = createMockSession(sessionId);
			vi.spyOn(stateModule, 'getAgentSession').mockReturnValue(session);
			vi.spyOn(trajectoryStoreModule, 'readTrajectory').mockResolvedValue(
				trajectory,
			);
			vi.spyOn(patternDetectorModule, 'detectPatterns').mockReturnValue({
				matches: [match],
				detectionTimeMs: 5,
				patternsChecked: 5,
			});
			vi.spyOn(
				courseCorrectionModule,
				'generateCourseCorrection',
			).mockReturnValue({
				alert: 'ALERT',
				category: 'coordination_error',
				guidance: 'GUIDANCE',
				action: 'ACTION',
				pattern: 'repetition_loop',
				stepRange: [1, 3],
			});
			vi.spyOn(
				courseCorrectionModule,
				'formatCourseCorrectionForInjection',
			).mockReturnValue('FORMATTED');

			const { toolAfter } = createPrmHook(config, directory);

			// First detection = level 1
			await toolAfter({ sessionID: sessionId });
			expect(session.prmEscalationLevel).toBe(1);

			// Second detection = level 2
			await toolAfter({ sessionID: sessionId });
			expect(session.prmEscalationLevel).toBe(2);

			// Third detection = level 3
			await toolAfter({ sessionID: sessionId });
			expect(session.prmEscalationLevel).toBe(3);
		});

		test('updates prmLastPatternDetected with current match', async () => {
			const config = createMockConfig({ enabled: true });
			const trajectory = createMockTrajectory();
			const match1 = createMockPatternMatch('repetition_loop');
			const match2 = createMockPatternMatch('ping_pong');
			const session = createMockSession(sessionId);
			vi.spyOn(stateModule, 'getAgentSession').mockReturnValue(session);
			vi.spyOn(trajectoryStoreModule, 'readTrajectory').mockResolvedValue(
				trajectory,
			);

			// First call returns repetition_loop
			vi.spyOn(patternDetectorModule, 'detectPatterns').mockReturnValueOnce({
				matches: [match1],
				detectionTimeMs: 5,
				patternsChecked: 5,
			});
			// Second call returns ping_pong
			vi.spyOn(patternDetectorModule, 'detectPatterns').mockReturnValueOnce({
				matches: [match2],
				detectionTimeMs: 5,
				patternsChecked: 5,
			});

			vi.spyOn(
				courseCorrectionModule,
				'generateCourseCorrection',
			).mockReturnValue({
				alert: 'ALERT',
				category: 'coordination_error',
				guidance: 'GUIDANCE',
				action: 'ACTION',
				pattern: 'repetition_loop',
				stepRange: [1, 3],
			});
			vi.spyOn(
				courseCorrectionModule,
				'formatCourseCorrectionForInjection',
			).mockReturnValue('FORMATTED');

			const { toolAfter } = createPrmHook(config, directory);

			await toolAfter({ sessionID: sessionId });
			expect(session.prmLastPatternDetected?.pattern).toBe('repetition_loop');

			await toolAfter({ sessionID: sessionId });
			expect(session.prmLastPatternDetected?.pattern).toBe('ping_pong');
		});

		test('sets prmHardStopPending on third detection', async () => {
			const config = createMockConfig({ enabled: true });
			const trajectory = createMockTrajectory();
			const match = createMockPatternMatch('repetition_loop');
			const session = createMockSession(sessionId);
			vi.spyOn(stateModule, 'getAgentSession').mockReturnValue(session);
			vi.spyOn(trajectoryStoreModule, 'readTrajectory').mockResolvedValue(
				trajectory,
			);
			vi.spyOn(patternDetectorModule, 'detectPatterns').mockReturnValue({
				matches: [match],
				detectionTimeMs: 5,
				patternsChecked: 5,
			});
			vi.spyOn(
				courseCorrectionModule,
				'generateCourseCorrection',
			).mockReturnValue({
				alert: 'ALERT',
				category: 'coordination_error',
				guidance: 'GUIDANCE',
				action: 'ACTION',
				pattern: 'repetition_loop',
				stepRange: [1, 3],
			});
			vi.spyOn(
				courseCorrectionModule,
				'formatCourseCorrectionForInjection',
			).mockReturnValue('FORMATTED');

			const { toolAfter } = createPrmHook(config, directory);

			// First - should not be hard stop
			await toolAfter({ sessionID: sessionId });
			expect(session.prmHardStopPending).toBe(false);

			// Second - should not be hard stop
			await toolAfter({ sessionID: sessionId });
			expect(session.prmHardStopPending).toBe(false);

			// Third - should be hard stop
			await toolAfter({ sessionID: sessionId });
			expect(session.prmHardStopPending).toBe(true);
		});

		test('restores escalation tracker state from session for session resumption', async () => {
			const config = createMockConfig({ enabled: true });
			const trajectory = createMockTrajectory();
			const session = createMockSession(sessionId);

			// Pre-populate PRM state as if session was being resumed
			session.prmPatternCounts = new Map([['repetition_loop', 2]]);
			session.prmEscalationLevel = 2;
			session.prmLastPatternDetected =
				createMockPatternMatch('repetition_loop');
			session.prmHardStopPending = false;

			vi.spyOn(stateModule, 'getAgentSession').mockReturnValue(session);
			vi.spyOn(trajectoryStoreModule, 'readTrajectory').mockResolvedValue(
				trajectory,
			);

			const match = createMockPatternMatch('repetition_loop');
			vi.spyOn(patternDetectorModule, 'detectPatterns').mockReturnValue({
				matches: [match],
				detectionTimeMs: 5,
				patternsChecked: 5,
			});
			vi.spyOn(
				courseCorrectionModule,
				'generateCourseCorrection',
			).mockReturnValue({
				alert: 'ALERT',
				category: 'coordination_error',
				guidance: 'GUIDANCE',
				action: 'ACTION',
				pattern: 'repetition_loop',
				stepRange: [1, 3],
			});
			vi.spyOn(
				courseCorrectionModule,
				'formatCourseCorrectionForInjection',
			).mockReturnValue('FORMATTED');

			const { toolAfter } = createPrmHook(config, directory);

			await toolAfter({ sessionID: sessionId });

			// The tracker should start from the restored state
			// Next detection should be level 3 (3rd occurrence)
			expect(session.prmEscalationLevel).toBe(3);
		});
	});

	describe('telemetry emission', () => {
		test('emits prmPatternDetected for each pattern match', async () => {
			const config = createMockConfig({ enabled: true });
			const trajectory = createMockTrajectory();
			const match = createMockPatternMatch('repetition_loop', {
				severity: 'high',
				category: 'coordination_error',
				stepRange: [1, 5] as [number, number],
			});
			const session = createMockSession(sessionId);
			vi.spyOn(stateModule, 'getAgentSession').mockReturnValue(session);
			vi.spyOn(trajectoryStoreModule, 'readTrajectory').mockResolvedValue(
				trajectory,
			);
			vi.spyOn(patternDetectorModule, 'detectPatterns').mockReturnValue({
				matches: [match],
				detectionTimeMs: 5,
				patternsChecked: 5,
			});
			vi.spyOn(
				courseCorrectionModule,
				'generateCourseCorrection',
			).mockReturnValue({
				alert: 'ALERT',
				category: 'coordination_error',
				guidance: 'GUIDANCE',
				action: 'ACTION',
				pattern: 'repetition_loop',
				stepRange: [1, 3],
			});
			vi.spyOn(
				courseCorrectionModule,
				'formatCourseCorrectionForInjection',
			).mockReturnValue('FORMATTED');

			const { toolAfter } = createPrmHook(config, directory);

			await toolAfter({ sessionID: sessionId });

			expect(telemetryModule.telemetry.prmPatternDetected).toHaveBeenCalledWith(
				sessionId,
				'repetition_loop',
				'high',
				'coordination_error',
				[1, 5],
			);
		});

		test('emits prmCourseCorrectionInjected for each pattern match', async () => {
			const config = createMockConfig({ enabled: true });
			const trajectory = createMockTrajectory();
			const match = createMockPatternMatch('repetition_loop');
			const session = createMockSession(sessionId);
			vi.spyOn(stateModule, 'getAgentSession').mockReturnValue(session);
			vi.spyOn(trajectoryStoreModule, 'readTrajectory').mockResolvedValue(
				trajectory,
			);
			vi.spyOn(patternDetectorModule, 'detectPatterns').mockReturnValue({
				matches: [match],
				detectionTimeMs: 5,
				patternsChecked: 5,
			});
			vi.spyOn(
				courseCorrectionModule,
				'generateCourseCorrection',
			).mockReturnValue({
				alert: 'ALERT',
				category: 'coordination_error',
				guidance: 'GUIDANCE',
				action: 'ACTION',
				pattern: 'repetition_loop',
				stepRange: [1, 3],
			});
			vi.spyOn(
				courseCorrectionModule,
				'formatCourseCorrectionForInjection',
			).mockReturnValue('FORMATTED');

			const { toolAfter } = createPrmHook(config, directory);

			await toolAfter({ sessionID: sessionId });

			// prmCourseCorrectionInjected is called with sessionId, pattern, escalationLevel
			expect(
				telemetryModule.telemetry.prmCourseCorrectionInjected,
			).toHaveBeenCalledWith(
				sessionId,
				'repetition_loop',
				1, // escalation level
			);
		});

		test('emits telemetry for multiple pattern matches', async () => {
			const config = createMockConfig({ enabled: true });
			const trajectory = createMockTrajectory();
			const match1 = createMockPatternMatch('repetition_loop');
			const match2 = createMockPatternMatch('ping_pong');
			const session = createMockSession(sessionId);
			vi.spyOn(stateModule, 'getAgentSession').mockReturnValue(session);
			vi.spyOn(trajectoryStoreModule, 'readTrajectory').mockResolvedValue(
				trajectory,
			);
			vi.spyOn(patternDetectorModule, 'detectPatterns').mockReturnValue({
				matches: [match1, match2],
				detectionTimeMs: 5,
				patternsChecked: 5,
			});
			vi.spyOn(
				courseCorrectionModule,
				'generateCourseCorrection',
			).mockReturnValue({
				alert: 'ALERT',
				category: 'coordination_error',
				guidance: 'GUIDANCE',
				action: 'ACTION',
				pattern: 'repetition_loop',
				stepRange: [1, 3],
			});
			vi.spyOn(
				courseCorrectionModule,
				'formatCourseCorrectionForInjection',
			).mockReturnValue('FORMATTED');

			const { toolAfter } = createPrmHook(config, directory);

			await toolAfter({ sessionID: sessionId });

			expect(
				telemetryModule.telemetry.prmPatternDetected,
			).toHaveBeenCalledTimes(2);
			expect(
				telemetryModule.telemetry.prmCourseCorrectionInjected,
			).toHaveBeenCalledTimes(2);
		});
	});

	describe('error handling', () => {
		test('catches and logs error from readTrajectory without throwing', async () => {
			const config = createMockConfig({ enabled: true });
			const session = createMockSession(sessionId);
			vi.spyOn(stateModule, 'getAgentSession').mockReturnValue(session);
			// Use mockImplementation to throw synchronously
			vi.spyOn(trajectoryStoreModule, 'readTrajectory').mockImplementation(
				() => {
					throw new Error('Trajectory read failed');
				},
			);

			const { toolAfter } = createPrmHook(config, directory);

			// Should NOT throw - error should be caught internally
			await expect(
				toolAfter({ sessionID: sessionId }),
			).resolves.toBeUndefined();
		});

		test('catches and logs error from detectPatterns without throwing', async () => {
			const config = createMockConfig({ enabled: true });
			const session = createMockSession(sessionId);
			vi.spyOn(stateModule, 'getAgentSession').mockReturnValue(session);
			vi.spyOn(trajectoryStoreModule, 'readTrajectory').mockResolvedValue(
				createMockTrajectory(),
			);
			// Use mockImplementation to throw synchronously
			vi.spyOn(patternDetectorModule, 'detectPatterns').mockImplementation(
				() => {
					throw new Error('Detection failed');
				},
			);

			const { toolAfter } = createPrmHook(config, directory);

			// Should NOT throw - error should be caught internally
			await expect(
				toolAfter({ sessionID: sessionId }),
			).resolves.toBeUndefined();
		});

		test('catches and logs error from generateCourseCorrection without throwing', async () => {
			const config = createMockConfig({ enabled: true });
			const session = createMockSession(sessionId);
			vi.spyOn(stateModule, 'getAgentSession').mockReturnValue(session);
			vi.spyOn(trajectoryStoreModule, 'readTrajectory').mockResolvedValue(
				createMockTrajectory(),
			);
			vi.spyOn(patternDetectorModule, 'detectPatterns').mockReturnValue({
				matches: [createMockPatternMatch('repetition_loop')],
				detectionTimeMs: 5,
				patternsChecked: 5,
			});
			// Use mockImplementation to throw synchronously
			vi.spyOn(
				courseCorrectionModule,
				'generateCourseCorrection',
			).mockImplementation(() => {
				throw new Error('Course correction failed');
			});

			const { toolAfter } = createPrmHook(config, directory);

			// Should NOT throw - error should be caught internally
			await expect(
				toolAfter({ sessionID: sessionId }),
			).resolves.toBeUndefined();
		});

		test('error in toolAfter does not affect subsequent calls', async () => {
			const config = createMockConfig({ enabled: true });
			const trajectory = createMockTrajectory();
			const match = createMockPatternMatch('repetition_loop');
			const session = createMockSession(sessionId);
			vi.spyOn(stateModule, 'getAgentSession').mockReturnValue(session);
			vi.spyOn(trajectoryStoreModule, 'readTrajectory').mockResolvedValue(
				trajectory,
			);
			vi.spyOn(patternDetectorModule, 'detectPatterns').mockReturnValue({
				matches: [match],
				detectionTimeMs: 5,
				patternsChecked: 5,
			});
			vi.spyOn(
				courseCorrectionModule,
				'generateCourseCorrection',
			).mockReturnValue({
				alert: 'ALERT',
				category: 'coordination_error',
				guidance: 'GUIDANCE',
				action: 'ACTION',
				pattern: 'repetition_loop',
				stepRange: [1, 3],
			});
			vi.spyOn(
				courseCorrectionModule,
				'formatCourseCorrectionForInjection',
			).mockReturnValue('FORMATTED');

			const { toolAfter } = createPrmHook(config, directory);

			// First call succeeds
			await expect(
				toolAfter({ sessionID: sessionId }),
			).resolves.toBeUndefined();

			// Second call should still work
			await expect(
				toolAfter({ sessionID: sessionId }),
			).resolves.toBeUndefined();
			expect(session.pendingAdvisoryMessages).toHaveLength(2);
		});

		test('continues processing remaining matches when one generates error', async () => {
			const config = createMockConfig({ enabled: true });
			const trajectory = createMockTrajectory();
			const match1 = createMockPatternMatch('repetition_loop');
			const match2 = createMockPatternMatch('ping_pong');
			const session = createMockSession(sessionId);
			vi.spyOn(stateModule, 'getAgentSession').mockReturnValue(session);
			vi.spyOn(trajectoryStoreModule, 'readTrajectory').mockResolvedValue(
				trajectory,
			);

			// detectPatterns returns first pattern on first call, second on second call
			vi.spyOn(patternDetectorModule, 'detectPatterns')
				.mockReturnValueOnce({
					matches: [match1],
					detectionTimeMs: 5,
					patternsChecked: 5,
				})
				.mockReturnValueOnce({
					matches: [match2],
					detectionTimeMs: 5,
					patternsChecked: 5,
				});

			// First call throws, second succeeds
			let callCount = 0;
			vi.spyOn(
				courseCorrectionModule,
				'generateCourseCorrection',
			).mockImplementation((match) => {
				callCount++;
				if (callCount === 1) {
					throw new Error('First correction failed');
				}
				return {
					alert: 'ALERT',
					category: 'coordination_error',
					guidance: 'GUIDANCE',
					action: 'ACTION',
					pattern: match.pattern,
					stepRange: [1, 3],
				};
			});

			vi.spyOn(
				courseCorrectionModule,
				'formatCourseCorrectionForInjection',
			).mockReturnValue('FORMATTED');

			const { toolAfter } = createPrmHook(config, directory);

			// First toolAfter call - throws on first correction but catches and continues
			await expect(
				toolAfter({ sessionID: sessionId }),
			).resolves.toBeUndefined();
			expect(callCount).toBe(1);

			// Second toolAfter call - succeeds
			await expect(
				toolAfter({ sessionID: sessionId }),
			).resolves.toBeUndefined();
			expect(callCount).toBe(2);

			// Second correction was added
			expect(session.pendingAdvisoryMessages).toHaveLength(1);
		});
	});

	describe('return value', () => {
		test('createPrmHook returns object with toolAfter function', () => {
			const config = createMockConfig();
			const hook = createPrmHook(config, directory);

			expect(hook).toHaveProperty('toolAfter');
			expect(typeof hook.toolAfter).toBe('function');
		});

		test('toolAfter returns Promise<void>', async () => {
			const config = createMockConfig({ enabled: false });
			const session = createMockSession(sessionId);
			vi.spyOn(stateModule, 'getAgentSession').mockReturnValue(session);

			const { toolAfter } = createPrmHook(config, directory);

			const result = toolAfter({ sessionID: sessionId });

			expect(result).toBeInstanceOf(Promise);
			await expect(result).resolves.toBeUndefined();
		});
	});

	describe('edge cases', () => {
		test('handles empty trajectory array', async () => {
			const config = createMockConfig({ enabled: true });
			const session = createMockSession(sessionId);
			vi.spyOn(stateModule, 'getAgentSession').mockReturnValue(session);
			vi.spyOn(trajectoryStoreModule, 'readTrajectory').mockResolvedValue([]);
			vi.spyOn(patternDetectorModule, 'detectPatterns').mockReturnValue({
				matches: [],
				detectionTimeMs: 5,
				patternsChecked: 5,
			});

			const { toolAfter } = createPrmHook(config, directory);

			await expect(
				toolAfter({ sessionID: sessionId }),
			).resolves.toBeUndefined();
		});

		test('handles missing optional fields in ToolAfterContext', async () => {
			const config = createMockConfig({ enabled: true });
			const session = createMockSession(sessionId);
			vi.spyOn(stateModule, 'getAgentSession').mockReturnValue(session);
			vi.spyOn(trajectoryStoreModule, 'readTrajectory').mockResolvedValue(
				createMockTrajectory(),
			);
			vi.spyOn(patternDetectorModule, 'detectPatterns').mockReturnValue({
				matches: [],
				detectionTimeMs: 5,
				patternsChecked: 5,
			});

			const { toolAfter } = createPrmHook(config, directory);

			// Minimal context - only sessionId is required
			// Should not throw
			const result = toolAfter({ sessionID: sessionId });
			await expect(result).resolves.toBeUndefined();
		});

		test('handles all pattern types', async () => {
			const patternTypes: PatternMatch['pattern'][] = [
				'repetition_loop',
				'ping_pong',
				'expansion_drift',
				'stuck_on_test',
				'context_thrash',
			];

			for (const pattern of patternTypes) {
				const config = createMockConfig({ enabled: true });
				const session = createMockSession(`${sessionId}-${pattern}`);
				vi.spyOn(stateModule, 'getAgentSession').mockReturnValue(session);
				vi.spyOn(trajectoryStoreModule, 'readTrajectory').mockResolvedValue(
					createMockTrajectory(),
				);

				const match = createMockPatternMatch(pattern);
				vi.spyOn(patternDetectorModule, 'detectPatterns').mockReturnValue({
					matches: [match],
					detectionTimeMs: 5,
					patternsChecked: 5,
				});
				vi.spyOn(
					courseCorrectionModule,
					'generateCourseCorrection',
				).mockReturnValue({
					alert: 'ALERT',
					category: 'coordination_error',
					guidance: 'GUIDANCE',
					action: 'ACTION',
					pattern,
					stepRange: [1, 3],
				});
				vi.spyOn(
					courseCorrectionModule,
					'formatCourseCorrectionForInjection',
				).mockReturnValue('FORMATTED');

				const { toolAfter } = createPrmHook(config, directory);

				await expect(
					toolAfter({ sessionID: `${sessionId}-${pattern}` }),
				).resolves.toBeUndefined();
				expect(session.prmPatternCounts.get(pattern)).toBe(1);
			}
		});

		test('handles all severity levels', async () => {
			const severities: PatternMatch['severity'][] = [
				'low',
				'medium',
				'high',
				'critical',
			];

			for (const severity of severities) {
				const config = createMockConfig({ enabled: true });
				const session = createMockSession(`${sessionId}-${severity}`);
				vi.spyOn(stateModule, 'getAgentSession').mockReturnValue(session);
				vi.spyOn(trajectoryStoreModule, 'readTrajectory').mockResolvedValue(
					createMockTrajectory(),
				);

				const match = createMockPatternMatch('repetition_loop', { severity });
				vi.spyOn(patternDetectorModule, 'detectPatterns').mockReturnValue({
					matches: [match],
					detectionTimeMs: 5,
					patternsChecked: 5,
				});
				vi.spyOn(
					courseCorrectionModule,
					'generateCourseCorrection',
				).mockReturnValue({
					alert: 'ALERT',
					category: 'coordination_error',
					guidance: 'GUIDANCE',
					action: 'ACTION',
					pattern: 'repetition_loop',
					stepRange: [1, 3],
				});
				vi.spyOn(
					courseCorrectionModule,
					'formatCourseCorrectionForInjection',
				).mockReturnValue('FORMATTED');

				const { toolAfter } = createPrmHook(config, directory);

				await expect(
					toolAfter({ sessionID: `${sessionId}-${severity}` }),
				).resolves.toBeUndefined();
			}
		});

		test('handles all taxonomy categories', async () => {
			const categories: PatternMatch['category'][] = [
				'specification_error',
				'reasoning_error',
				'coordination_error',
			];

			for (const category of categories) {
				const config = createMockConfig({ enabled: true });
				const session = createMockSession(`${sessionId}-${category}`);
				vi.spyOn(stateModule, 'getAgentSession').mockReturnValue(session);
				vi.spyOn(trajectoryStoreModule, 'readTrajectory').mockResolvedValue(
					createMockTrajectory(),
				);

				const match = createMockPatternMatch('repetition_loop', { category });
				vi.spyOn(patternDetectorModule, 'detectPatterns').mockReturnValue({
					matches: [match],
					detectionTimeMs: 5,
					patternsChecked: 5,
				});
				vi.spyOn(
					courseCorrectionModule,
					'generateCourseCorrection',
				).mockReturnValue({
					alert: 'ALERT',
					category,
					guidance: 'GUIDANCE',
					action: 'ACTION',
					pattern: 'repetition_loop',
					stepRange: [1, 3],
				});
				vi.spyOn(
					courseCorrectionModule,
					'formatCourseCorrectionForInjection',
				).mockReturnValue('FORMATTED');

				const { toolAfter } = createPrmHook(config, directory);

				await expect(
					toolAfter({ sessionID: `${sessionId}-${category}` }),
				).resolves.toBeUndefined();
			}
		});
	});
});

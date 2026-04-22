import { afterEach, beforeEach, describe, expect, test, vi } from 'bun:test';
import { createPrmHook } from '../index';
import type { PatternMatch, PrmConfig, TrajectoryEntry } from '../types';

// Mock telemetry first
vi.mock('../../telemetry', () => ({
	telemetry: {
		prmPatternDetected: vi.fn(),
		prmCourseCorrectionInjected: vi.fn(),
		prmEscalationTriggered: vi.fn(),
		prmHardStop: vi.fn(),
	},
}));

// Mock state module
vi.mock('../../state', () => ({
	getAgentSession: vi.fn(),
}));

// Mock trajectory-store
vi.mock('../trajectory-store', () => ({
	readTrajectory: vi.fn(),
}));

// Mock pattern-detector
vi.mock('../pattern-detector', () => ({
	detectPatterns: vi.fn(),
}));

// Mock course-correction
vi.mock('../course-correction', () => ({
	generateCourseCorrection: vi.fn(),
	formatCourseCorrectionForInjection: vi.fn(),
}));

import { getAgentSession } from '../../state';
import { telemetry } from '../../telemetry';
import {
	formatCourseCorrectionForInjection,
	generateCourseCorrection,
} from '../course-correction';
import { detectPatterns } from '../pattern-detector';
import { readTrajectory } from '../trajectory-store';

function createMockConfig(overrides: Partial<PrmConfig> = {}): PrmConfig {
	return {
		enabled: true,
		pattern_thresholds: {
			repetition_loop: 2,
			ping_pong: 4,
			expansion_drift: 3,
			stuck_on_test: 3,
			context_thrash: 5,
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
		lastPhaseCompleteTimestamp: 0,
		lastPhaseCompletePhase: 0,
		phaseAgentsDispatched: new Set(),
		lastCompletedPhaseAgentsDispatched: new Set(),
		// PRM fields
		prmPatternCounts: new Map(),
		prmEscalationLevel: 0,
		prmLastPatternDetected: null as PatternMatch | null,
		prmTrajectoryStep: 0,
		prmHardStopPending: false,
		prmEscalationTracker: undefined,
	};
}

function setupMocks(
	_sessionId: string,
	trajectory: TrajectoryEntry[],
	matches: PatternMatch[],
) {
	(getAgentSession as ReturnType<typeof vi.fn>).mockReturnValue({
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
		lastPhaseCompleteTimestamp: 0,
		lastPhaseCompletePhase: 0,
		phaseAgentsDispatched: new Set(),
		lastCompletedPhaseAgentsDispatched: new Set(),
		prmPatternCounts: new Map(),
		prmEscalationLevel: 0,
		prmLastPatternDetected: null as PatternMatch | null,
		prmTrajectoryStep: 0,
		prmHardStopPending: false,
		prmEscalationTracker: undefined,
	});

	(readTrajectory as ReturnType<typeof vi.fn>).mockResolvedValue(trajectory);
	(detectPatterns as ReturnType<typeof vi.fn>).mockReturnValue({
		matches,
		detectionTimeMs: 5,
		patternsChecked: 5,
	});
	(generateCourseCorrection as ReturnType<typeof vi.fn>).mockReturnValue({
		alert: 'TRAJECTORY ALERT: repetition_loop detected',
		category: 'coordination_error',
		guidance: 'Stop the repetitive loop',
		action: 'Consolidate changes',
		pattern: 'repetition_loop',
		stepRange: [1, 3],
	});
	(
		formatCourseCorrectionForInjection as ReturnType<typeof vi.fn>
	).mockReturnValue('FORMATTED CORRECTION');
}

describe('Escalation Correction Queue Drain', () => {
	const sessionId = 'test-session-escalation-123';
	const directory = '/test/project';

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('Task 3.6: clearPendingCorrections after injection', () => {
		test('pending corrections queue is empty after single toolAfter call with pattern match', async () => {
			const config = createMockConfig({ enabled: true });
			const trajectory = createMockTrajectory();
			const match = createMockPatternMatch('repetition_loop');
			setupMocks(sessionId, trajectory, [match]);

			const { toolAfter } = createPrmHook(config, directory);

			await toolAfter({ sessionID: sessionId });

			// Get session and escalation tracker
			const session = getAgentSession(sessionId);
			expect(session).not.toBeNull();
			expect(session?.prmEscalationTracker).not.toBeUndefined();

			// After toolAfter completes, the pending corrections queue should be empty
			// because clearPendingCorrections() is called after pushing to pendingAdvisoryMessages
			const pendingCorrections =
				session!.prmEscalationTracker!.getPendingCorrections();
			expect(pendingCorrections).toEqual([]);
		});

		test('pending corrections queue is empty after toolAfter with multiple pattern matches', async () => {
			const config = createMockConfig({ enabled: true });
			const trajectory = createMockTrajectory();
			const match1 = createMockPatternMatch('repetition_loop');
			const match2 = createMockPatternMatch('ping_pong');
			setupMocks(sessionId, trajectory, [match1, match2]);

			const { toolAfter } = createPrmHook(config, directory);

			await toolAfter({ sessionID: sessionId });

			// Get session and escalation tracker
			const session = getAgentSession(sessionId);
			expect(session).not.toBeNull();

			// After processing multiple matches, the pending corrections queue should be empty
			// Each correction is pushed to pendingAdvisoryMessages then queue is cleared
			const pendingCorrections =
				session!.prmEscalationTracker!.getPendingCorrections();
			expect(pendingCorrections).toEqual([]);

			// But pendingAdvisoryMessages should have all the injected corrections
			expect(session!.pendingAdvisoryMessages).toHaveLength(2);
			expect(session!.pendingAdvisoryMessages).toContain(
				'FORMATTED CORRECTION',
			);
			expect(session!.pendingAdvisoryMessages).toContain(
				'FORMATTED CORRECTION',
			);
		});

		test('pending corrections queue does not accumulate across multiple toolAfter calls', async () => {
			const config = createMockConfig({ enabled: true });
			const trajectory = createMockTrajectory();
			const match = createMockPatternMatch('repetition_loop');
			setupMocks(sessionId, trajectory, [match]);

			const { toolAfter } = createPrmHook(config, directory);

			// First toolAfter call
			await toolAfter({ sessionID: sessionId });

			const session = getAgentSession(sessionId);
			expect(session).not.toBeNull();

			// Queue should be empty after first call
			expect(session!.prmEscalationTracker!.getPendingCorrections()).toEqual(
				[],
			);

			// Second toolAfter call
			await toolAfter({ sessionID: sessionId });

			// Queue should still be empty after second call
			expect(session!.prmEscalationTracker!.getPendingCorrections()).toEqual(
				[],
			);

			// Third toolAfter call
			await toolAfter({ sessionID: sessionId });

			// Queue should still be empty after third call
			expect(session!.prmEscalationTracker!.getPendingCorrections()).toEqual(
				[],
			);

			// Verify the session state is correctly maintained
			// Pattern count should be 3 (3 detections)
			expect(session!.prmPatternCounts.get('repetition_loop')).toBe(3);
			// Escalation level should be 3 (hard stop)
			expect(session!.prmEscalationLevel).toBe(3);
			expect(session!.prmHardStopPending).toBe(true);

			// But pendingAdvisoryMessages should NOT accumulate - should only have 3 entries total
			expect(session!.pendingAdvisoryMessages).toHaveLength(3);
		});

		test('correction is injected to pendingAdvisoryMessages before queue is cleared', async () => {
			const config = createMockConfig({ enabled: true });
			const trajectory = createMockTrajectory();
			const match = createMockPatternMatch('repetition_loop');
			setupMocks(sessionId, trajectory, [match]);

			const { toolAfter } = createPrmHook(config, directory);

			await toolAfter({ sessionID: sessionId });

			const session = getAgentSession(sessionId);
			expect(session).not.toBeNull();

			// The correction was injected to pendingAdvisoryMessages
			expect(session!.pendingAdvisoryMessages).toContain(
				'FORMATTED CORRECTION',
			);

			// And the escalation tracker's queue was cleared
			expect(session!.prmEscalationTracker!.getPendingCorrections()).toEqual(
				[],
			);
		});

		test('session without pattern matches has empty pending corrections', async () => {
			const config = createMockConfig({ enabled: true });
			const trajectory = createMockTrajectory();
			setupMocks(sessionId, trajectory, []);

			const { toolAfter } = createPrmHook(config, directory);

			await toolAfter({ sessionID: sessionId });

			const session = getAgentSession(sessionId);
			expect(session).not.toBeNull();

			// No pattern matches, so no corrections were added
			// Tracker might not even be created for empty matches
			if (session!.prmEscalationTracker) {
				expect(session!.prmEscalationTracker!.getPendingCorrections()).toEqual(
					[],
				);
			}
		});
	});
});

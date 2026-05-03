/**
 * Tests for full-auto-intercept hook detection logic
 *
 * Tests the intercept detection patterns for:
 * - Phase completion patterns ("Ready for Phase N+1?", "Ready for Phase 2?")
 * - End-of-sentence question detection
 * - Mid-sentence question filtering (code patterns like v1?, y?.z)
 * - Deadlock threshold enforcement
 * - Interaction budget counting
 * - hasActiveFullAuto activation check
 *
 * NOTE: telemetry.autoOversightEscalation is ONLY called for interaction_limit and deadlock
 * escalations (when limits are hit), NOT for initial phase_completion/question detection.
 * The initial detection triggers autonomous oversight but does not emit telemetry.
 */
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { PluginConfig } from '../../../src/config/schema';

// Track calls to telemetry.autoOversightEscalation
const telemetryCalls: Array<{
	sessionId: string;
	reason: string;
	interactionCount: number;
	deadlockCount: number;
	phase?: number;
}> = [];

// Track console.log calls to verify detection happened
const consoleLogCalls: string[] = [];

// Track console.warn calls to verify deadlock warnings
const consoleWarnCalls: string[] = [];

// Persistent session state storage (simulates real swarmState.agentSessions)
// Use globalThis to ensure the mock and tests share the same storage instance
interface SessionState {
	fullAutoInteractionCount: number;
	fullAutoDeadlockCount: number;
	fullAutoLastQuestionHash: string | undefined;
}

// Session state storage for the mock ensureAgentSession
const stateRef: { sessionStorage: Map<string, SessionState> } = {
	sessionStorage: new Map<string, SessionState>(),
};

// Mock hasActiveFullAuto — starts returning false by default
const mockHasActiveFullAuto = mock(() => false);

// Mock ensureAgentSession — stores sessions in stateRef so tests can inspect them
const mockEnsureAgentSession = (sessionId: string) => {
	if (!stateRef.sessionStorage.has(sessionId)) {
		stateRef.sessionStorage.set(sessionId, {
			fullAutoInteractionCount: 0,
			fullAutoDeadlockCount: 0,
			fullAutoLastQuestionHash: undefined,
		});
	}
	return stateRef.sessionStorage.get(sessionId)!;
};

mock.module('../../../src/telemetry.js', () => ({
	telemetry: {
		autoOversightEscalation: mock(
			(
				sessionId: string,
				reason: string,
				interactionCount: number,
				deadlockCount: number,
				phase?: number,
			) => {
				telemetryCalls.push({
					sessionId,
					reason,
					interactionCount,
					deadlockCount,
					phase,
				});
			},
		),
		sessionStarted: mock(() => {}),
		sessionEnded: mock(() => {}),
		agentActivated: mock(() => {}),
		delegationBegin: mock(() => {}),
		delegationEnd: mock(() => {}),
		taskStateChanged: mock(() => {}),
		gatePassed: mock(() => {}),
		gateFailed: mock(() => {}),
		phaseChanged: mock(() => {}),
		budgetUpdated: mock(() => {}),
		modelFallback: mock(() => {}),
		hardLimitHit: mock(() => {}),
		revisionLimitHit: mock(() => {}),
		loopDetected: mock(() => {}),
		scopeViolation: mock(() => {}),
		qaSkipViolation: mock(() => {}),
		heartbeat: mock(() => {}),
		turboModeChanged: mock(() => {}),
	},
	// emit() is used by plan/manager.ts and other modules loaded transitively
	// through state.ts — must be present in the mock to avoid SyntaxError at link time
	emit: mock(() => {}),
}));

mock.module('../../../src/hooks/utils.js', () => ({
	validateSwarmPath: (dir: string, file: string) =>
		path.join(dir, '.swarm', file),
	// The following exports are imported by modules loaded transitively through
	// state.ts (plan/manager.ts, delegation-gate.ts, etc.) — must be present in
	// the mock to avoid SyntaxError at link time
	readSwarmFileAsync: mock(async () => null),
	safeHook: mock((_fn: unknown) => _fn),
	composeHandlers: mock((..._fns: unknown[]) => _fns[0]),
	estimateTokens: mock((_text: string) => 0),
}));

mock.module('../../../src/parallel/file-locks.js', () => ({
	tryAcquireLock: mock(async () => ({
		acquired: false,
		lock: { _release: async () => {} },
	})),
}));

// agents/critic.js is NOT mocked here — `createCriticAutonomousOversightAgent`
// is injected via `_internals` in each beforeEach so the real module is never
// loaded in test processes and cannot contaminate test files that run later.
// (Previously a sparse mock.module for agents/critic caused SyntaxError in
// self-coding-detection tests when agents/index.ts tried to re-export the
// missing `createCriticAgent`.)

// Import after mock setup (telemetry/utils/file-locks mocks registered above)
const { createFullAutoInterceptHook, _internals } = await import(
	'../../../src/hooks/full-auto-intercept.js'
);

// Capture defaults so afterEach can restore them
const _defaultHasActiveFullAuto = _internals.hasActiveFullAuto;
const _defaultEnsureAgentSession = _internals.ensureAgentSession;
const _defaultSwarmState = _internals.swarmState;
const _defaultCreateCriticAgent =
	_internals.createCriticAutonomousOversightAgent;

let testDir: string;

function createFullAutoConfig(overrides?: {
	enabled?: boolean;
	max_interactions_per_phase?: number;
	deadlock_threshold?: number;
	escalation_mode?: 'pause' | 'terminate';
	critic_model?: string;
}): PluginConfig {
	return {
		max_iterations: 100,
		qa_retry_limit: 3,
		execution_mode: 'balanced',
		inject_phase_reminders: true,
		full_auto: {
			enabled: true,
			max_interactions_per_phase: 50,
			deadlock_threshold: 3,
			escalation_mode: 'pause',
			...overrides,
		},
	} as PluginConfig;
}

function makeArchitectMessage(
	text: string,
	sessionID = 'test-session',
	agent?: string,
) {
	return {
		info: { role: 'user' as const, agent, sessionID },
		parts: [{ type: 'text' as const, text }],
	};
}

function makeMessages(
	architectMessage: ReturnType<typeof makeArchitectMessage>,
) {
	return [architectMessage];
}

function wasEscalationDetected(logs: string[], pattern?: string): boolean {
	const searchPattern = pattern || 'Escalation detected';
	return logs.some((log) => log.includes(searchPattern));
}

describe('full-auto-intercept detectEscalation via messagesTransform', () => {
	let originalConsoleLog: typeof console.log;
	let originalConsoleWarn: typeof console.warn;

	beforeEach(() => {
		mockHasActiveFullAuto.mockClear();
		// Clear arrays properly
		telemetryCalls.length = 0;
		consoleLogCalls.length = 0;
		consoleWarnCalls.length = 0;
		// Clear the shared stateRef that the mock uses
		stateRef.sessionStorage.clear();

		// Install DI seam overrides so the hook uses mock state without
		// mock.module (which would leak across test files in the same Bun process)
		_internals.hasActiveFullAuto =
			mockHasActiveFullAuto as unknown as typeof _internals.hasActiveFullAuto;
		_internals.ensureAgentSession =
			mockEnsureAgentSession as unknown as typeof _internals.ensureAgentSession;
		_internals.swarmState = {
			opencodeClient: null,
		} as typeof _internals.swarmState;
		_internals.createCriticAutonomousOversightAgent = mock(
			() =>
				({
					name: 'critic_oversight',
					config: {},
				}) as ReturnType<
					NonNullable<typeof _internals.createCriticAutonomousOversightAgent>
				>,
		);

		// Save original console.log and console.warn
		originalConsoleLog = console.log;
		originalConsoleWarn = console.warn;
		// Setup console.log mock - capture all calls
		console.log = (...args: unknown[]) => {
			consoleLogCalls.push(args.join(' '));
			originalConsoleLog.apply(console, args);
		};
		// Setup console.warn mock - capture deadlock warnings
		console.warn = (...args: unknown[]) => {
			consoleWarnCalls.push(args.join(' '));
			originalConsoleWarn.apply(console, args);
		};

		testDir = fs.mkdtempSync(
			path.join(os.tmpdir(), 'full-auto-intercept-test-'),
		);
		fs.mkdirSync(path.join(testDir, '.swarm'), { recursive: true });
	});

	afterEach(() => {
		// Restore console.log and console.warn to original
		console.log = originalConsoleLog;
		console.warn = originalConsoleWarn;
		telemetryCalls.length = 0;
		consoleLogCalls.length = 0;
		consoleWarnCalls.length = 0;
		stateRef.sessionStorage.clear();
		// Restore DI seam to real state so other test files in the same Bun process
		// are not affected (replaces the old mock.module approach that contaminated)
		_internals.hasActiveFullAuto = _defaultHasActiveFullAuto;
		_internals.ensureAgentSession = _defaultEnsureAgentSession;
		_internals.swarmState = _defaultSwarmState;
		_internals.createCriticAutonomousOversightAgent = _defaultCreateCriticAgent;
		try {
			fs.rmSync(testDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	describe('hasActiveFullAuto activation check', () => {
		it('does NOT detect escalation when hasActiveFullAuto returns false', async () => {
			mockHasActiveFullAuto.mockImplementation(() => false);

			const config = createFullAutoConfig({ enabled: true });
			const hooks = createFullAutoInterceptHook(config, testDir);

			const messages = makeMessages(
				makeArchitectMessage('Ready for Phase 2?', 'session-1'),
			);

			await hooks.messagesTransform({}, { messages });

			expect(wasEscalationDetected(consoleLogCalls)).toBe(false);
		});

		it('detects escalation when hasActiveFullAuto returns true', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({ enabled: true });
			const hooks = createFullAutoInterceptHook(config, testDir);

			const messages = makeMessages(
				makeArchitectMessage('Ready for Phase 2?', 'session-1'),
			);

			await hooks.messagesTransform({}, { messages });

			expect(wasEscalationDetected(consoleLogCalls)).toBe(true);
		});
	});

	describe('phase completion pattern detection', () => {
		it('detects "Ready for Phase N+1?" pattern as phase completion question', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({ enabled: true });
			const hooks = createFullAutoInterceptHook(config, testDir);

			const messages = makeMessages(
				makeArchitectMessage('Ready for Phase N+1?', 'session-1'),
			);

			await hooks.messagesTransform({}, { messages });

			expect(
				wasEscalationDetected(
					consoleLogCalls,
					'Escalation detected (phase_completion)',
				),
			).toBe(true);
		});

		it('detects "Ready for Phase [N+1]?" pattern with brackets', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({ enabled: true });
			const hooks = createFullAutoInterceptHook(config, testDir);

			const messages = makeMessages(
				makeArchitectMessage('Ready for Phase [N+1]?', 'session-1'),
			);

			await hooks.messagesTransform({}, { messages });

			expect(
				wasEscalationDetected(
					consoleLogCalls,
					'Escalation detected (phase_completion)',
				),
			).toBe(true);
		});

		it('detects "Ready for Phase 2?" pattern (literal number, not N+1)', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({ enabled: true });
			const hooks = createFullAutoInterceptHook(config, testDir);

			const messages = makeMessages(
				makeArchitectMessage('Ready for Phase 2?', 'session-1'),
			);

			await hooks.messagesTransform({}, { messages });

			expect(
				wasEscalationDetected(
					consoleLogCalls,
					'Escalation detected (phase_completion)',
				),
			).toBe(true);
		});

		it('detects "Ready for Phase 10?" pattern with larger number', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({ enabled: true });
			const hooks = createFullAutoInterceptHook(config, testDir);

			const messages = makeMessages(
				makeArchitectMessage('Ready for Phase 10?', 'session-1'),
			);

			await hooks.messagesTransform({}, { messages });

			expect(
				wasEscalationDetected(
					consoleLogCalls,
					'Escalation detected (phase_completion)',
				),
			).toBe(true);
		});

		it('detects escalation patterns case-insensitively', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({ enabled: true });
			const hooks = createFullAutoInterceptHook(config, testDir);

			const messages = makeMessages(
				makeArchitectMessage('READY FOR PHASE 3?', 'session-1'),
			);

			await hooks.messagesTransform({}, { messages });

			expect(
				wasEscalationDetected(
					consoleLogCalls,
					'Escalation detected (phase_completion)',
				),
			).toBe(true);
		});
	});

	describe('end-of-sentence question detection', () => {
		it('detects "?" at end of architect output (standalone question)', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({ enabled: true });
			const hooks = createFullAutoInterceptHook(config, testDir);

			// Use a question that doesn't match ESCALATION_PATTERNS
			const messages = makeMessages(
				makeArchitectMessage('Is this ready for review?', 'session-1'),
			);

			await hooks.messagesTransform({}, { messages });

			expect(
				wasEscalationDetected(
					consoleLogCalls,
					'Escalation detected (question)',
				),
			).toBe(true);
		});

		it('detects question with whitespace before end', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({ enabled: true });
			const hooks = createFullAutoInterceptHook(config, testDir);

			const messages = makeMessages(
				makeArchitectMessage('Is this correct?   ', 'session-1'),
			);

			await hooks.messagesTransform({}, { messages });

			expect(
				wasEscalationDetected(
					consoleLogCalls,
					'Escalation detected (question)',
				),
			).toBe(true);
		});
	});

	describe('mid-sentence question filtering', () => {
		it('does NOT trigger on mid-sentence "?" in code like "v1?"', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({ enabled: true });
			const hooks = createFullAutoInterceptHook(config, testDir);

			const messages = makeMessages(
				makeArchitectMessage('The version is v1?', 'session-1'),
			);

			await hooks.messagesTransform({}, { messages });

			expect(wasEscalationDetected(consoleLogCalls)).toBe(false);
		});

		it('does NOT trigger on mid-sentence "?" in code like "v1.2?"', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({ enabled: true });
			const hooks = createFullAutoInterceptHook(config, testDir);

			const messages = makeMessages(
				makeArchitectMessage('The version is v1.2?', 'session-1'),
			);

			await hooks.messagesTransform({}, { messages });

			expect(wasEscalationDetected(consoleLogCalls)).toBe(false);
		});

		it('does NOT trigger on mid-sentence "?" in code like "y?.z" (optional chaining)', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({ enabled: true });
			const hooks = createFullAutoInterceptHook(config, testDir);

			const messages = makeMessages(
				makeArchitectMessage('const x = () => y?.z', 'session-1'),
			);

			await hooks.messagesTransform({}, { messages });

			expect(wasEscalationDetected(consoleLogCalls)).toBe(false);
		});

		it('does NOT trigger on mid-sentence "?" with API acronym', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({ enabled: true });
			const hooks = createFullAutoInterceptHook(config, testDir);

			const messages = makeMessages(
				makeArchitectMessage('Did you mean the API? version', 'session-1'),
			);

			await hooks.messagesTransform({}, { messages });

			expect(wasEscalationDetected(consoleLogCalls)).toBe(false);
		});

		it('does NOT trigger on mid-sentence "?" with OK confirmation', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({ enabled: true });
			const hooks = createFullAutoInterceptHook(config, testDir);

			const messages = makeMessages(
				makeArchitectMessage('Is that OK?imately', 'session-1'),
			);

			await hooks.messagesTransform({}, { messages });

			expect(wasEscalationDetected(consoleLogCalls)).toBe(false);
		});

		it('does NOT trigger on numbers with question marks between them like "5?10"', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({ enabled: true });
			const hooks = createFullAutoInterceptHook(config, testDir);

			const messages = makeMessages(
				makeArchitectMessage('The range is 5?10', 'session-1'),
			);

			await hooks.messagesTransform({}, { messages });

			expect(wasEscalationDetected(consoleLogCalls)).toBe(false);
		});
	});

	describe('deadlock_threshold enforcement', () => {
		it('triggers deadlock detection when same question is repeated 3 times with threshold=2', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({
				enabled: true,
				deadlock_threshold: 2,
			});
			const hooks = createFullAutoInterceptHook(config, testDir);

			// First question - sets lastQuestionHash, count=0 (first occurrence, no match)
			const messages1 = makeMessages(
				makeArchitectMessage('What should I do?', 'session-1'),
			);
			await hooks.messagesTransform({}, { messages: messages1 });

			// Second same question - count=1 (first repeat detected, 1 < 2, no escalation yet)
			const messages2 = makeMessages(
				makeArchitectMessage('What should I do?', 'session-1'),
			);
			await hooks.messagesTransform({}, { messages: messages2 });

			// Verify count is 1/2 after 2 identical questions (deadlock warnings go to console.warn)
			const count1Warning = consoleWarnCalls.some((log) =>
				log.includes('Potential deadlock detected (count: 1/2)'),
			);
			expect(count1Warning).toBe(true);

			// Third same question - count=2, EQUALS threshold=2, ESCALATES
			const messages3 = makeMessages(
				makeArchitectMessage('What should I do?', 'session-1'),
			);
			await hooks.messagesTransform({}, { messages: messages3 });

			// Verify escalation occurred with count 2/2
			const deadlockWarning = consoleWarnCalls.some((log) =>
				log.includes('Potential deadlock detected (count: 2/2)'),
			);
			expect(deadlockWarning).toBe(true);
		});

		it('does NOT trigger deadlock warning when below threshold', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({
				enabled: true,
				deadlock_threshold: 3,
			});
			const hooks = createFullAutoInterceptHook(config, testDir);

			// First question - uses mid-sentence pattern like "v1?" which is NOT detected
			// as a question type, so no deadlock detection occurs
			const messages1 = makeMessages(
				makeArchitectMessage('The version is v1?', 'session-1'),
			);
			await hooks.messagesTransform({}, { messages: messages1 });

			// Second same "question" - also not detected (mid-sentence pattern)
			const messages2 = makeMessages(
				makeArchitectMessage('The version is v1?', 'session-1'),
			);
			await hooks.messagesTransform({}, { messages: messages2 });

			// Question not detected (mid-sentence pattern), so NO deadlock warning appears
			const deadlockWarnings = consoleWarnCalls.filter((log) =>
				log.includes('Potential deadlock detected'),
			);
			expect(deadlockWarnings.length).toBe(0);
		});
	});

	describe('interaction budget enforcement', () => {
		it('counts interactions correctly', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({
				enabled: true,
				max_interactions_per_phase: 5,
			});
			const hooks = createFullAutoInterceptHook(config, testDir);

			// Send 3 distinct questions (each should be tracked as an interaction)
			for (let i = 0; i < 3; i++) {
				const messages = makeMessages(
					makeArchitectMessage(`Question ${i}?`, 'session-1'),
				);
				await hooks.messagesTransform({}, { messages });
			}

			// Verify all 3 questions were processed (escalation detected for each)
			const escalationCount = consoleLogCalls.filter((log) =>
				log.includes('Escalation detected'),
			).length;
			expect(escalationCount).toBe(3);
		});

		it('does NOT escalate when interaction count is below limit', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({
				enabled: true,
				max_interactions_per_phase: 5,
			});
			const hooks = createFullAutoInterceptHook(config, testDir);

			// Send 3 questions (below the limit of 5)
			for (let i = 0; i < 3; i++) {
				const messages = makeMessages(
					makeArchitectMessage(`Question ${i}?`, 'session-1'),
				);
				await hooks.messagesTransform({}, { messages });
			}

			// Verify no deadlock warning (interaction limit not reached)
			const deadlockWarnings = consoleLogCalls.filter((log) =>
				log.includes('Potential deadlock detected'),
			);
			expect(deadlockWarnings.length).toBe(0);
		});
	});

	describe('architect turn detection', () => {
		it('only processes messages from architect role', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({ enabled: true });
			const hooks = createFullAutoInterceptHook(config, testDir);

			// Non-architect message (assistant role)
			const messages = [
				{
					info: { role: 'assistant' as const, sessionID: 'session-1' },
					parts: [{ type: 'text' as const, text: 'Ready for Phase 2?' }],
				},
			];

			await hooks.messagesTransform({}, { messages });

			expect(wasEscalationDetected(consoleLogCalls)).toBe(false);
		});

		it('processes architect message with explicit agent: architect', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({ enabled: true });
			const hooks = createFullAutoInterceptHook(config, testDir);

			const messages = [
				makeArchitectMessage('Ready for Phase 2?', 'session-1', 'architect'),
			];

			await hooks.messagesTransform({}, { messages });

			expect(
				wasEscalationDetected(consoleLogCalls, 'Escalation detected'),
			).toBe(true);
		});

		it('processes architect message with mega_architect prefix', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({ enabled: true });
			const hooks = createFullAutoInterceptHook(config, testDir);

			const messages = [
				makeArchitectMessage(
					'Ready for Phase 2?',
					'session-1',
					'mega_architect',
				),
			];

			await hooks.messagesTransform({}, { messages });

			expect(
				wasEscalationDetected(consoleLogCalls, 'Escalation detected'),
			).toBe(true);
		});

		it('skips messages from other agents like coder', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({ enabled: true });
			const hooks = createFullAutoInterceptHook(config, testDir);

			const messages = [
				makeArchitectMessage('Ready for Phase 2?', 'session-1', 'coder'),
			];

			await hooks.messagesTransform({}, { messages });

			expect(wasEscalationDetected(consoleLogCalls)).toBe(false);
		});

		it('processes architect message with cloud_architect prefix (cloud not in old allowlist)', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({ enabled: true });
			const hooks = createFullAutoInterceptHook(config, testDir);

			const messages = [
				makeArchitectMessage(
					'Ready for Phase 2?',
					'session-1',
					'cloud_architect',
				),
			];

			await hooks.messagesTransform({}, { messages });

			expect(
				wasEscalationDetected(consoleLogCalls, 'Escalation detected'),
			).toBe(true);
		});

		it('processes architect message with enterprise_architect prefix (enterprise not in old allowlist)', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({ enabled: true });
			const hooks = createFullAutoInterceptHook(config, testDir);

			const messages = [
				makeArchitectMessage(
					'Ready for Phase 2?',
					'session-1',
					'enterprise_architect',
				),
			];

			await hooks.messagesTransform({}, { messages });

			expect(
				wasEscalationDetected(consoleLogCalls, 'Escalation detected'),
			).toBe(true);
		});

		it('processes architect message with synthetic_architect prefix (synthetic not in old allowlist)', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({ enabled: true });
			const hooks = createFullAutoInterceptHook(config, testDir);

			const messages = [
				makeArchitectMessage(
					'Ready for Phase 2?',
					'session-1',
					'synthetic_architect',
				),
			];

			await hooks.messagesTransform({}, { messages });

			expect(
				wasEscalationDetected(consoleLogCalls, 'Escalation detected'),
			).toBe(true);
		});

		it('processes architect message with team-architect prefix (Strategy 2: suffix matching with hyphen separator)', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({ enabled: true });
			const hooks = createFullAutoInterceptHook(config, testDir);

			const messages = [
				makeArchitectMessage(
					'Ready for Phase 2?',
					'session-1',
					'team-architect',
				),
			];

			await hooks.messagesTransform({}, { messages });

			expect(
				wasEscalationDetected(consoleLogCalls, 'Escalation detected'),
			).toBe(true);
		});

		it('processes architect message with xyz_architect prefix (Strategy 2: arbitrary prefix suffix matching)', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({ enabled: true });
			const hooks = createFullAutoInterceptHook(config, testDir);

			const messages = [
				makeArchitectMessage(
					'Ready for Phase 2?',
					'session-1',
					'xyz_architect',
				),
			];

			await hooks.messagesTransform({}, { messages });

			expect(
				wasEscalationDetected(consoleLogCalls, 'Escalation detected'),
			).toBe(true);
		});
	});

	describe('full-auto disabled behavior', () => {
		it('returns no-op handler when full_auto.enabled is false', async () => {
			const config = createFullAutoConfig({ enabled: false });
			const hooks = createFullAutoInterceptHook(config, testDir);

			const messages = makeMessages(
				makeArchitectMessage('Ready for Phase 2?', 'session-1'),
			);

			await hooks.messagesTransform({}, { messages });

			expect(wasEscalationDetected(consoleLogCalls)).toBe(false);
		});

		it('handles undefined full_auto config gracefully', async () => {
			const config = {
				max_iterations: 100,
				qa_retry_limit: 3,
				execution_mode: 'balanced' as const,
				inject_phase_reminders: true,
			} as PluginConfig;
			const hooks = createFullAutoInterceptHook(config, testDir);

			const messages = makeMessages(
				makeArchitectMessage('Ready for Phase 2?', 'session-1'),
			);

			await hooks.messagesTransform({}, { messages });

			expect(wasEscalationDetected(consoleLogCalls)).toBe(false);
		});
	});

	describe('empty/null edge cases', () => {
		it('does not process empty messages array', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({ enabled: true });
			const hooks = createFullAutoInterceptHook(config, testDir);

			await hooks.messagesTransform({}, { messages: [] });

			expect(wasEscalationDetected(consoleLogCalls)).toBe(false);
		});

		it('does not process message with no text parts', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({ enabled: true });
			const hooks = createFullAutoInterceptHook(config, testDir);

			const messages = [
				{
					info: {
						role: 'user' as const,
						agent: 'architect',
						sessionID: 'session-1',
					},
					parts: [{ type: 'tool_use' as const }],
				},
			];

			await hooks.messagesTransform({}, { messages });

			expect(wasEscalationDetected(consoleLogCalls)).toBe(false);
		});

		it('does not process message with empty text', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({ enabled: true });
			const hooks = createFullAutoInterceptHook(config, testDir);

			const messages = [
				{
					info: {
						role: 'user' as const,
						agent: 'architect',
						sessionID: 'session-1',
					},
					parts: [{ type: 'text' as const, text: '' }],
				},
			];

			await hooks.messagesTransform({}, { messages });

			expect(wasEscalationDetected(consoleLogCalls)).toBe(false);
		});
	});

	describe('other escalation patterns', () => {
		it('detects "escalat" pattern', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({ enabled: true });
			const hooks = createFullAutoInterceptHook(config, testDir);

			const messages = makeMessages(
				makeArchitectMessage('Should I escalate this issue?', 'session-1'),
			);

			await hooks.messagesTransform({}, { messages });

			expect(
				wasEscalationDetected(consoleLogCalls, 'Escalation detected'),
			).toBe(true);
		});

		it('detects "What would you like" pattern', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({ enabled: true });
			const hooks = createFullAutoInterceptHook(config, testDir);

			const messages = makeMessages(
				makeArchitectMessage('What would you like me to explain?', 'session-1'),
			);

			await hooks.messagesTransform({}, { messages });

			expect(
				wasEscalationDetected(consoleLogCalls, 'Escalation detected'),
			).toBe(true);
		});

		it('detects "Should I proceed" pattern', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({ enabled: true });
			const hooks = createFullAutoInterceptHook(config, testDir);

			const messages = makeMessages(
				makeArchitectMessage(
					'Should I proceed with the deployment?',
					'session-1',
				),
			);

			await hooks.messagesTransform({}, { messages });

			expect(
				wasEscalationDetected(consoleLogCalls, 'Escalation detected'),
			).toBe(true);
		});

		it('detects "Do you want" pattern', async () => {
			mockHasActiveFullAuto.mockImplementation(() => true);

			const config = createFullAutoConfig({ enabled: true });
			const hooks = createFullAutoInterceptHook(config, testDir);

			const messages = makeMessages(
				makeArchitectMessage('Do you want me to continue?', 'session-1'),
			);

			await hooks.messagesTransform({}, { messages });

			expect(
				wasEscalationDetected(consoleLogCalls, 'Escalation detected'),
			).toBe(true);
		});
	});
});

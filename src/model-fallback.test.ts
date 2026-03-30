/**
 * Tests for model fallback schema and state (v6.33)
 *
 * Covers:
 * 1. AgentOverrideConfigSchema fallback_models field parsing
 * 2. State initialization of model_fallback_index and modelFallbackExhausted
 * 3. Serialization round-trip for both fields
 * 4. Deserialization defaults when fields are missing
 * 5. Migration safety via ensureAgentSession
 * 6. Edge cases for schema and state
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AgentOverrideConfigSchema } from './config/schema';
import { deserializeAgentSession } from './session/snapshot-reader';
import { serializeAgentSession } from './session/snapshot-writer';
import {
	ensureAgentSession,
	getAgentSession,
	resetSwarmState,
	startAgentSession,
	swarmState,
} from './state';

let tmpDir: string;
let testSessionId: string;

beforeEach(() => {
	resetSwarmState();
	tmpDir = mkdtempSync(path.join(os.tmpdir(), 'model-fallback-test-'));
	testSessionId = `fallback-test-${Date.now()}`;
});

afterEach(() => {
	try {
		rmSync(tmpDir, { recursive: true, force: true });
	} catch {
		/* best effort */
	}
	resetSwarmState();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. SCHEMA PARSING
// ─────────────────────────────────────────────────────────────────────────────

describe('AgentOverrideConfigSchema fallback_models field', () => {
	it('1.1 parse with model only (no fallback_models) succeeds', () => {
		const result = AgentOverrideConfigSchema.parse({ model: 'test-model' });
		expect(result.model).toBe('test-model');
		expect(result.fallback_models).toBeUndefined();
	});

	it('1.2 parse with two fallback models succeeds', () => {
		const result = AgentOverrideConfigSchema.parse({
			model: 'primary',
			fallback_models: ['fallback-a', 'fallback-b'],
		});
		expect(result.model).toBe('primary');
		expect(result.fallback_models).toEqual(['fallback-a', 'fallback-b']);
	});

	it('1.3 parse with three fallback models (max) succeeds', () => {
		const result = AgentOverrideConfigSchema.parse({
			model: 'primary',
			fallback_models: ['a', 'b', 'c'],
		});
		expect(result.fallback_models).toEqual(['a', 'b', 'c']);
	});

	it('1.4 parse with four fallback models FAILS (max 3)', () => {
		expect(() =>
			AgentOverrideConfigSchema.parse({
				model: 'primary',
				fallback_models: ['a', 'b', 'c', 'd'],
			}),
		).toThrow();
	});

	it('1.5 parse with empty array succeeds', () => {
		const result = AgentOverrideConfigSchema.parse({
			model: 'primary',
			fallback_models: [],
		});
		expect(result.fallback_models).toEqual([]);
	});

	it('1.6 parse with single fallback model succeeds', () => {
		const result = AgentOverrideConfigSchema.parse({
			model: 'primary',
			fallback_models: ['only-one'],
		});
		expect(result.fallback_models).toEqual(['only-one']);
	});

	it('1.7 parse with undefined fallback_models (missing) succeeds', () => {
		const result = AgentOverrideConfigSchema.parse({ model: 'test' });
		expect(result.fallback_models).toBeUndefined();
	});

	it('1.8 parse with non-array fallback_models FAILS', () => {
		expect(() =>
			AgentOverrideConfigSchema.parse({
				model: 'test',
				fallback_models: 'not-an-array',
			}),
		).toThrow();
	});

	it('1.9 parse with non-string elements in fallback_models FAILS', () => {
		expect(() =>
			AgentOverrideConfigSchema.parse({
				model: 'test',
				fallback_models: ['valid', 123, 'another'],
			}),
		).toThrow();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. STATE INITIALIZATION
// ─────────────────────────────────────────────────────────────────────────────

describe('startAgentSession initializes model fallback fields', () => {
	it('2.1 session is created with model_fallback_index = 0', () => {
		startAgentSession(testSessionId, 'architect');
		const session = getAgentSession(testSessionId);
		expect(session).toBeDefined();
		expect(session!.model_fallback_index).toBe(0);
	});

	it('2.2 session is created with modelFallbackExhausted = false', () => {
		startAgentSession(testSessionId, 'architect');
		const session = getAgentSession(testSessionId);
		expect(session!.modelFallbackExhausted).toBe(false);
	});

	it('2.3 both fields are initialized together on same session', () => {
		startAgentSession(testSessionId, 'coder');
		const session = getAgentSession(testSessionId);
		expect(session!.model_fallback_index).toBe(0);
		expect(session!.modelFallbackExhausted).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. SERIALIZATION ROUND-TRIP
// ─────────────────────────────────────────────────────────────────────────────

describe('serializeAgentSession → deserializeAgentSession round-trip', () => {
	it('3.1 model_fallback_index round-trips correctly', () => {
		// Create session with non-default values
		startAgentSession(testSessionId, 'architect');
		const original = getAgentSession(testSessionId)!;
		original.model_fallback_index = 2;
		original.modelFallbackExhausted = true;

		// Serialize
		const serialized = serializeAgentSession(original);

		// Verify serialized form
		expect(serialized.model_fallback_index).toBe(2);
		expect(serialized.modelFallbackExhausted).toBe(true);

		// Deserialize into a plain object simulating SerializedAgentSession
		const deserialized = deserializeAgentSession(serialized);

		// Verify deserialized values match original
		expect(deserialized.model_fallback_index).toBe(2);
		expect(deserialized.modelFallbackExhausted).toBe(true);

		// Re-serialize and verify same output
		const reSerialized = serializeAgentSession(deserialized);
		expect(reSerialized.model_fallback_index).toBe(2);
		expect(reSerialized.modelFallbackExhausted).toBe(true);
	});

	it('3.2 model_fallback_index = 0 with modelFallbackExhausted = false round-trips', () => {
		startAgentSession(testSessionId, 'architect');
		const original = getAgentSession(testSessionId)!;

		const serialized = serializeAgentSession(original);
		const deserialized = deserializeAgentSession(serialized);
		const reSerialized = serializeAgentSession(deserialized);

		expect(reSerialized.model_fallback_index).toBe(0);
		expect(reSerialized.modelFallbackExhausted).toBe(false);
	});

	it('3.3 all indices 0-3 and exhausted=true round-trip correctly', () => {
		startAgentSession(testSessionId, 'architect');
		const session = getAgentSession(testSessionId)!;

		for (let idx = 0; idx <= 3; idx++) {
			session.model_fallback_index = idx;
			session.modelFallbackExhausted = false;

			const serialized = serializeAgentSession(session);
			const deserialized = deserializeAgentSession(serialized);
			const reSerialized = serializeAgentSession(deserialized);

			expect(reSerialized.model_fallback_index).toBe(idx);
			expect(reSerialized.modelFallbackExhausted).toBe(false);
		}

		// Also test exhausted = true at index 3
		session.model_fallback_index = 3;
		session.modelFallbackExhausted = true;

		const serialized = serializeAgentSession(session);
		const deserialized = deserializeAgentSession(serialized);
		const reSerialized = serializeAgentSession(deserialized);

		expect(reSerialized.model_fallback_index).toBe(3);
		expect(reSerialized.modelFallbackExhausted).toBe(true);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. DESERIALIZATION DEFAULTS
// ─────────────────────────────────────────────────────────────────────────────

describe('deserializeAgentSession applies defaults for missing fields', () => {
	it('4.1 missing model_fallback_index defaults to 0', () => {
		// Intentionally omit model_fallback_index to test default behavior
		// Use 'as unknown as' because we're testing legacy data without this field
		const serializedSession = {
			agentName: 'architect',
			lastToolCallTime: Date.now(),
			lastAgentEventTime: Date.now(),
			delegationActive: false,
			activeInvocationId: 0,
			lastInvocationIdByAgent: {},
			windows: {},
			lastCompactionHint: 0,
			architectWriteCount: 0,
			lastCoderDelegationTaskId: null,
			currentTaskId: null,
			turboMode: false,
			gateLog: {},
			reviewerCallCount: {},
			lastGateFailure: null,
			partialGateWarningsIssuedForTask: [],
			selfFixAttempted: false,
			selfCodingWarnedAtCount: 0,
			catastrophicPhaseWarnings: [],
			lastPhaseCompleteTimestamp: 0,
			lastPhaseCompletePhase: 0,
			phaseAgentsDispatched: [],
			lastCompletedPhaseAgentsDispatched: [],
			qaSkipCount: 0,
			qaSkipTaskIds: [],
			pendingAdvisoryMessages: [],
			// model_fallback_index intentionally omitted
			modelFallbackExhausted: false,
			sessionRehydratedAt: 0,
		} as unknown as Parameters<typeof deserializeAgentSession>[0];

		const deserialized = deserializeAgentSession(serializedSession);
		expect(deserialized.model_fallback_index).toBe(0);
	});

	it('4.2 missing modelFallbackExhausted defaults to false', () => {
		// Intentionally omit modelFallbackExhausted to test default behavior
		const serializedSession = {
			agentName: 'architect',
			lastToolCallTime: Date.now(),
			lastAgentEventTime: Date.now(),
			delegationActive: false,
			activeInvocationId: 0,
			lastInvocationIdByAgent: {},
			windows: {},
			lastCompactionHint: 0,
			architectWriteCount: 0,
			lastCoderDelegationTaskId: null,
			currentTaskId: null,
			turboMode: false,
			gateLog: {},
			reviewerCallCount: {},
			lastGateFailure: null,
			partialGateWarningsIssuedForTask: [],
			selfFixAttempted: false,
			selfCodingWarnedAtCount: 0,
			catastrophicPhaseWarnings: [],
			lastPhaseCompleteTimestamp: 0,
			lastPhaseCompletePhase: 0,
			phaseAgentsDispatched: [],
			lastCompletedPhaseAgentsDispatched: [],
			qaSkipCount: 0,
			qaSkipTaskIds: [],
			pendingAdvisoryMessages: [],
			model_fallback_index: 2,
			sessionRehydratedAt: 0,
			// modelFallbackExhausted intentionally omitted
		} as unknown as Parameters<typeof deserializeAgentSession>[0];

		const deserialized = deserializeAgentSession(serializedSession);
		expect(deserialized.modelFallbackExhausted).toBe(false);
	});

	it('4.3 both fields missing both default correctly', () => {
		const serializedSession = {
			agentName: 'architect',
			lastToolCallTime: Date.now(),
			lastAgentEventTime: Date.now(),
			delegationActive: false,
			activeInvocationId: 0,
			lastInvocationIdByAgent: {},
			windows: {},
			lastCompactionHint: 0,
			architectWriteCount: 0,
			lastCoderDelegationTaskId: null,
			currentTaskId: null,
			turboMode: false,
			gateLog: {},
			reviewerCallCount: {},
			lastGateFailure: null,
			partialGateWarningsIssuedForTask: [],
			selfFixAttempted: false,
			selfCodingWarnedAtCount: 0,
			catastrophicPhaseWarnings: [],
			lastPhaseCompleteTimestamp: 0,
			lastPhaseCompletePhase: 0,
			phaseAgentsDispatched: [],
			lastCompletedPhaseAgentsDispatched: [],
			qaSkipCount: 0,
			qaSkipTaskIds: [],
			pendingAdvisoryMessages: [],
			// model_fallback_index and modelFallbackExhausted both intentionally omitted
		};

		const deserialized = deserializeAgentSession(
			serializedSession as unknown as Parameters<
				typeof deserializeAgentSession
			>[0],
		);
		expect(deserialized.model_fallback_index).toBe(0);
		expect(deserialized.modelFallbackExhausted).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. MIGRATION SAFETY via ensureAgentSession
// ─────────────────────────────────────────────────────────────────────────────

describe('ensureAgentSession migration safety for model fallback fields', () => {
	it('5.1 existing session without fields gets model_fallback_index initialized to 0', () => {
		// Create session normally
		startAgentSession(testSessionId, 'architect');
		const session = getAgentSession(testSessionId)!;

		// Simulate old session without the new fields by deleting them
		// @ts-expect-error - intentionally removing fields to simulate old session
		delete session.model_fallback_index;
		// @ts-expect-error - intentionally removing fields to simulate old session
		delete session.modelFallbackExhausted;

		// Call ensureAgentSession which should migrate
		const migrated = ensureAgentSession(testSessionId, 'architect');

		expect(migrated.model_fallback_index).toBe(0);
	});

	it('5.2 existing session without fields gets modelFallbackExhausted initialized to false', () => {
		startAgentSession(testSessionId, 'architect');
		const session = getAgentSession(testSessionId)!;

		// @ts-expect-error - intentionally removing fields to simulate old session
		delete session.model_fallback_index;
		// @ts-expect-error - intentionally removing fields to simulate old session
		delete session.modelFallbackExhausted;

		const migrated = ensureAgentSession(testSessionId, 'architect');

		expect(migrated.modelFallbackExhausted).toBe(false);
	});

	it('5.3 ensureAgentSession on NEW session creates both fields with defaults', () => {
		// ensureAgentSession should create a new session if one doesn't exist
		const migrated = ensureAgentSession(testSessionId, 'coder');

		expect(migrated.model_fallback_index).toBe(0);
		expect(migrated.modelFallbackExhausted).toBe(false);
	});

	it('5.4 ensureAgentSession preserves existing values for sessions that have them', () => {
		startAgentSession(testSessionId, 'architect');
		const session = getAgentSession(testSessionId)!;

		// Set non-default values
		session.model_fallback_index = 2;
		session.modelFallbackExhausted = true;

		// Call ensureAgentSession - should preserve values
		const preserved = ensureAgentSession(testSessionId, 'architect');

		expect(preserved.model_fallback_index).toBe(2);
		expect(preserved.modelFallbackExhausted).toBe(true);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. EDGE CASES
// ─────────────────────────────────────────────────────────────────────────────

describe('model fallback edge cases', () => {
	it('6.1 model_fallback_index can be set to max safe integer', () => {
		startAgentSession(testSessionId, 'architect');
		const session = getAgentSession(testSessionId)!;

		session.model_fallback_index = Number.MAX_SAFE_INTEGER;
		expect(session.model_fallback_index).toBe(Number.MAX_SAFE_INTEGER);

		const serialized = serializeAgentSession(session);
		const deserialized = deserializeAgentSession(serialized);
		expect(deserialized.model_fallback_index).toBe(Number.MAX_SAFE_INTEGER);
	});

	it('6.2 negative model_fallback_index is allowed (no schema constraint in state)', () => {
		startAgentSession(testSessionId, 'architect');
		const session = getAgentSession(testSessionId)!;

		session.model_fallback_index = -1;
		expect(session.model_fallback_index).toBe(-1);
	});

	it('6.3 serialized session includes model_fallback_index even when 0', () => {
		startAgentSession(testSessionId, 'architect');
		const session = getAgentSession(testSessionId)!;

		const serialized = serializeAgentSession(session);

		expect(serialized).toHaveProperty('model_fallback_index');
		expect(serialized.model_fallback_index).toBe(0);
	});

	it('6.4 serialized session includes modelFallbackExhausted even when false', () => {
		startAgentSession(testSessionId, 'architect');
		const session = getAgentSession(testSessionId)!;

		const serialized = serializeAgentSession(session);

		expect(serialized).toHaveProperty('modelFallbackExhausted');
		expect(serialized.modelFallbackExhausted).toBe(false);
	});

	it('6.5 full state snapshot includes model fallback fields', () => {
		// Simulate the SnapshotData structure
		startAgentSession(testSessionId, 'architect');
		const session = getAgentSession(testSessionId)!;

		session.model_fallback_index = 1;
		session.modelFallbackExhausted = false;

		const serialized = serializeAgentSession(session);

		// Verify serialized session has all expected fields for snapshot
		expect(serialized.agentName).toBe('architect');
		expect(serialized.model_fallback_index).toBe(1);
		expect(serialized.modelFallbackExhausted).toBe(false);
		expect(serialized.turboMode).toBe(false);
		expect(serialized.qaSkipCount).toBe(0);
	});

	it('6.6 ensureAgentSession called multiple times is idempotent', () => {
		startAgentSession(testSessionId, 'architect');
		const session = getAgentSession(testSessionId)!;

		session.model_fallback_index = 1;
		session.modelFallbackExhausted = false;

		// Call multiple times
		const result1 = ensureAgentSession(testSessionId, 'architect');
		const result2 = ensureAgentSession(testSessionId, 'architect');
		const result3 = ensureAgentSession(testSessionId, 'architect');

		expect(result1.model_fallback_index).toBe(1);
		expect(result2.model_fallback_index).toBe(1);
		expect(result3.model_fallback_index).toBe(1);
		expect(result1.modelFallbackExhausted).toBe(false);
		expect(result2.modelFallbackExhausted).toBe(false);
		expect(result3.modelFallbackExhausted).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// SNAPSHOT WRITER/READER INTEGRATION
// ─────────────────────────────────────────────────────────────────────────────

describe('snapshot writer and reader integration', () => {
	it('7.1 model fallback fields are serialized to snapshot but reset to defaults on restart', async () => {
		// This tests the actual write → read cycle via the filesystem.
		// model_fallback_index and modelFallbackExhausted are treated as
		// transient per-session state: they are written to the snapshot so
		// they are not lost mid-session, but rehydrateState intentionally
		// resets them to 0/false on startup to avoid "stuck fallback state"
		// where an agent remains locked into a fallback model across restarts.
		const snapshotDir = path.join(tmpDir, '.swarm', 'session');
		mkdirSync(snapshotDir, { recursive: true });

		// Create and populate session with non-default fallback state
		startAgentSession(testSessionId, 'architect');
		const original = getAgentSession(testSessionId)!;
		original.model_fallback_index = 2;
		original.modelFallbackExhausted = true;

		// Serialize to file — values are persisted in the snapshot JSON
		const { writeSnapshot } = await import('./session/snapshot-writer');
		await writeSnapshot(tmpDir, swarmState);

		// Verify the raw snapshot contains the non-default values
		const { readSnapshot, rehydrateState } = await import(
			'./session/snapshot-reader'
		);
		const snapshot = await readSnapshot(tmpDir);
		expect(snapshot).not.toBeNull();
		const rawSession = snapshot!.agentSessions[testSessionId];
		expect(rawSession).toBeDefined();
		expect(rawSession.model_fallback_index).toBe(2);
		expect(rawSession.modelFallbackExhausted).toBe(true);

		// Clear state to simulate restart, then rehydrate
		resetSwarmState();
		await rehydrateState(snapshot!);

		// After restart, transient fallback state is reset to defaults to
		// prevent agents from being stuck in fallback mode across sessions.
		const restored = getAgentSession(testSessionId);
		expect(restored).toBeDefined();
		expect(restored!.model_fallback_index).toBe(0);
		expect(restored!.modelFallbackExhausted).toBe(false);
	});

	it('7.2 snapshot with missing model fallback fields uses defaults', async () => {
		const snapshotDir = path.join(tmpDir, '.swarm', 'session');
		mkdirSync(snapshotDir, { recursive: true });

		// Manually write a snapshot without model fallback fields
		const legacySnapshot = {
			version: 1,
			writtenAt: Date.now(),
			toolAggregates: {},
			activeAgent: { [testSessionId]: 'architect' },
			delegationChains: {},
			agentSessions: {
				[testSessionId]: {
					agentName: 'architect',
					lastToolCallTime: Date.now(),
					lastAgentEventTime: Date.now(),
					delegationActive: false,
					activeInvocationId: 0,
					lastInvocationIdByAgent: {},
					windows: {},
					lastCompactionHint: 0,
					architectWriteCount: 0,
					lastCoderDelegationTaskId: null,
					currentTaskId: null,
					turboMode: false,
					gateLog: {},
					reviewerCallCount: {},
					lastGateFailure: null,
					partialGateWarningsIssuedForTask: [],
					selfFixAttempted: false,
					selfCodingWarnedAtCount: 0,
					catastrophicPhaseWarnings: [],
					lastPhaseCompleteTimestamp: 0,
					lastPhaseCompletePhase: 0,
					phaseAgentsDispatched: [],
					lastCompletedPhaseAgentsDispatched: [],
					qaSkipCount: 0,
					qaSkipTaskIds: [],
					pendingAdvisoryMessages: [],
					// model_fallback_index and modelFallbackExhausted intentionally omitted
				},
			},
		};

		writeFileSync(
			path.join(snapshotDir, 'state.json'),
			JSON.stringify(legacySnapshot),
		);

		// Clear state
		resetSwarmState();

		// Read and rehydrate
		const { readSnapshot, rehydrateState } = await import(
			'./session/snapshot-reader'
		);
		const snapshot = await readSnapshot(tmpDir);
		expect(snapshot).not.toBeNull();

		await rehydrateState(snapshot!);

		// Verify defaults were applied
		const restored = getAgentSession(testSessionId);
		expect(restored).toBeDefined();
		expect(restored!.model_fallback_index).toBe(0);
		expect(restored!.modelFallbackExhausted).toBe(false);
	});
});

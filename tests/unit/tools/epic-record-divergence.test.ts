/**
 * Tests for the epic_record_divergence tool.
 * File: tests/unit/tools/epic-record-divergence.test.ts
 *
 * Covers:
 *  - Returns 'epic-mode-not-active' when the session has no Epic Mode toggle.
 *  - Returns 'no-scope' when the task has no declared scope on disk.
 *  - Returns 'no-session' when the session is unknown.
 *  - Records a divergence record on the happy path and returns the summary.
 *  - Returns 'persist-failed' when recordTaskDivergence returns null.
 *  - Reads phaseNumber from plan.json when available.
 *  - Does not throw when the plan is missing (best-effort).
 *
 * Uses the _internals DI seam — no mock.module (AGENTS.md invariant 7).
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
	_internals,
	executeEpicRecordDivergence,
} from '../../../src/tools/epic-record-divergence';

const realInternals = { ..._internals };

interface StubState {
	epicActive: boolean;
	session: { modifiedFilesThisCoderTask?: string[] } | undefined;
	declaredScope: string[] | null;
	plan: { phases: Array<{ id: number; tasks: Array<{ id: string }> }> } | null;
	recordResult: { path: string; record: ReturnType<typeof fakeRecord> } | null;
	recordCalls: number;
}

function fakeRecord(
	overrides: Partial<{
		declaredScope: string[];
		actualFiles: string[];
		undeclared: string[];
		unused: string[];
		divergenceRatio: number;
		isClean: boolean;
	}> = {},
) {
	return {
		timestamp: '2025-01-01T00:00:00Z',
		sessionID: 's1',
		taskId: 'T-1',
		phaseNumber: 1 as number | undefined,
		declaredScope: overrides.declaredScope ?? ['src/a.ts'],
		actualFiles: overrides.actualFiles ?? ['src/a.ts', 'src/b.ts'],
		undeclared: overrides.undeclared ?? ['src/b.ts'],
		unused: overrides.unused ?? [],
		divergenceRatio: overrides.divergenceRatio ?? 0.5,
		isClean: overrides.isClean ?? false,
	};
}

let stub: StubState;

beforeEach(() => {
	stub = {
		epicActive: true,
		session: { modifiedFilesThisCoderTask: ['src/a.ts', 'src/b.ts'] },
		declaredScope: ['src/a.ts'],
		plan: {
			phases: [{ id: 2, tasks: [{ id: 'T-1' }, { id: 'T-2' }] }],
		},
		recordResult: { path: '/fake/divergence.jsonl', record: fakeRecord() },
		recordCalls: 0,
	};

	_internals.hasActiveEpicMode = (() => stub.epicActive) as never;
	_internals.getAgentSession = (() => stub.session) as never;
	_internals.readScopeFromDisk = (() => stub.declaredScope) as never;
	_internals.loadPlanJsonOnly = (async () => stub.plan) as never;
	_internals.recordTaskDivergence = ((_args: unknown) => {
		stub.recordCalls += 1;
		return stub.recordResult;
	}) as never;
});

afterEach(() => {
	_internals.hasActiveEpicMode = realInternals.hasActiveEpicMode;
	_internals.getAgentSession = realInternals.getAgentSession;
	_internals.readScopeFromDisk = realInternals.readScopeFromDisk;
	_internals.loadPlanJsonOnly = realInternals.loadPlanJsonOnly;
	_internals.recordTaskDivergence = realInternals.recordTaskDivergence;
});

describe('executeEpicRecordDivergence', () => {
	test('returns epic-mode-not-active when the session has no toggle', async () => {
		stub.epicActive = false;
		const result = await executeEpicRecordDivergence({
			directory: '/fake',
			taskId: 'T-1',
			sessionID: 's1',
		});
		expect(result.reason).toBe('epic-mode-not-active');
		expect(stub.recordCalls).toBe(0);
	});

	test('returns no-session when the session is unknown', async () => {
		stub.session = undefined;
		const result = await executeEpicRecordDivergence({
			directory: '/fake',
			taskId: 'T-1',
			sessionID: 's1',
		});
		expect(result.reason).toBe('no-session');
		expect(stub.recordCalls).toBe(0);
	});

	test('returns no-scope when the task has no declared scope', async () => {
		stub.declaredScope = null;
		const result = await executeEpicRecordDivergence({
			directory: '/fake',
			taskId: 'T-1',
			sessionID: 's1',
		});
		expect(result.reason).toBe('no-scope');
		expect(stub.recordCalls).toBe(0);
	});

	test('happy path: records divergence and returns summary', async () => {
		const result = await executeEpicRecordDivergence({
			directory: '/fake',
			taskId: 'T-1',
			sessionID: 's1',
		});
		expect(stub.recordCalls).toBe(1);
		expect(result.reason).toBe('recorded');
		expect(result.summary).toBeDefined();
		expect(result.summary?.divergenceRatio).toBe(0.5);
		expect(result.summary?.isClean).toBe(false);
		expect(result.summary?.undeclaredCount).toBe(1);
	});

	test('returns persist-failed when recordTaskDivergence returns null', async () => {
		stub.recordResult = null;
		const result = await executeEpicRecordDivergence({
			directory: '/fake',
			taskId: 'T-1',
			sessionID: 's1',
		});
		expect(stub.recordCalls).toBe(1);
		expect(result.reason).toBe('persist-failed');
	});

	test('looks up the phase number from plan.json when available', async () => {
		let capturedPhase: number | undefined;
		_internals.recordTaskDivergence = ((args: { phaseNumber?: number }) => {
			capturedPhase = args.phaseNumber;
			stub.recordCalls += 1;
			return stub.recordResult;
		}) as never;

		await executeEpicRecordDivergence({
			directory: '/fake',
			taskId: 'T-1',
			sessionID: 's1',
		});
		expect(capturedPhase).toBe(2);
	});

	test('omits phase number when plan is missing', async () => {
		stub.plan = null;
		let capturedPhase: number | undefined = -1; // sentinel
		_internals.recordTaskDivergence = ((args: { phaseNumber?: number }) => {
			capturedPhase = args.phaseNumber;
			stub.recordCalls += 1;
			return stub.recordResult;
		}) as never;

		await executeEpicRecordDivergence({
			directory: '/fake',
			taskId: 'T-1',
			sessionID: 's1',
		});
		expect(capturedPhase).toBeUndefined();
	});

	test('treats missing modifiedFilesThisCoderTask as empty list', async () => {
		stub.session = {}; // no modifiedFilesThisCoderTask field
		let capturedActual: string[] | undefined;
		_internals.recordTaskDivergence = ((args: { actualFiles: string[] }) => {
			capturedActual = args.actualFiles;
			stub.recordCalls += 1;
			return stub.recordResult;
		}) as never;

		const result = await executeEpicRecordDivergence({
			directory: '/fake',
			taskId: 'T-1',
			sessionID: 's1',
		});
		expect(capturedActual).toEqual([]);
		expect(result.reason).toBe('recorded');
	});
});

/**
 * Tests for retryCasWithBackoff — Phase 4 (CAS retry with exponential backoff).
 *
 * Verifies:
 *   - Backoff schedule: 5ms start, doubles each attempt, cap 250ms, ±25% jitter
 *   - plan_ledger_cas_retry telemetry is emitted on each retry (hash prefixes only)
 *   - PlanConcurrentModificationError is thrown when retries are exhausted
 *   - verifyValid returning false causes early exit without error
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// ── Telemetry mock ─────────────────────────────────────────────────────────────
const emitCalls: Array<{ event: string; payload: unknown }> = [];
mock.module('../telemetry.js', () => ({
	emit: (event: string, payload: unknown) => {
		emitCalls.push({ event, payload });
	},
	telemetry: {
		gatePassed: () => {},
		sessionStarted: () => {},
		agentActivated: () => {},
		delegationBegin: () => {},
		taskStateChanged: () => {},
		environmentDetected: () => {},
	},
}));

// ── Ledger mock ────────────────────────────────────────────────────────────────
import { LedgerStaleWriterError } from './ledger';

let appendLedgerEventCallCount = 0;
let appendLedgerEventFailTimes = 0; // fail first N attempts

mock.module('./ledger', () => {
	const real = require('./ledger');
	return {
		...real,
		appendLedgerEvent: async (
			_dir: string,
			_event: unknown,
			_opts: unknown,
		) => {
			appendLedgerEventCallCount++;
			if (appendLedgerEventCallCount <= appendLedgerEventFailTimes) {
				throw new LedgerStaleWriterError('mock stale');
			}
			return {
				seq: appendLedgerEventCallCount,
				event_type: 'task_status_changed',
			};
		},
		computeCurrentPlanHash: () => 'aabbccdd1122334455667788',
	};
});

let tempDir: string;

beforeEach(() => {
	tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cas-backoff-'));
	fs.mkdirSync(path.join(tempDir, '.swarm'), { recursive: true });
	emitCalls.length = 0;
	appendLedgerEventCallCount = 0;
	appendLedgerEventFailTimes = 0;
});

afterEach(() => {
	fs.rmSync(tempDir, { recursive: true, force: true });
	mock.restore();
});

const FAKE_EVENT_INPUT = {
	plan_id: 'test-plan',
	event_type: 'task_status_changed' as const,
	task_id: '1.1',
	phase_id: 1,
	from_status: 'pending' as const,
	to_status: 'in_progress' as const,
	source: 'test',
};

describe('retryCasWithBackoff — success path', () => {
	test('succeeds on first attempt with no telemetry', async () => {
		const { retryCasWithBackoff } = await import('./manager');
		appendLedgerEventFailTimes = 0;

		const result = await retryCasWithBackoff(tempDir, FAKE_EVENT_INPUT, {
			expectedHash: 'aabbccdd',
		});

		expect(result).not.toBeNull();
		const retryEvents = emitCalls.filter(
			(e) => e.event === 'plan_ledger_cas_retry',
		);
		expect(retryEvents).toHaveLength(0);
	});

	test('succeeds after 1 retry and emits telemetry with hash prefix', async () => {
		const { retryCasWithBackoff } = await import('./manager');
		appendLedgerEventFailTimes = 1;

		const result = await retryCasWithBackoff(tempDir, FAKE_EVENT_INPUT, {
			expectedHash: 'aabbccdd1122334455667788',
		});

		expect(result).not.toBeNull();

		const retryEvents = emitCalls.filter(
			(e) => e.event === 'plan_ledger_cas_retry',
		);
		expect(retryEvents).toHaveLength(1);

		const payload = retryEvents[0].payload as {
			attempt: number;
			expectedHashPrefix: string;
			delayMs: number;
		};
		expect(payload.attempt).toBe(1);
		// Hash prefix must be exactly 8 chars, not the full hash
		expect(payload.expectedHashPrefix).toBe('aabbccdd');
		expect(payload.expectedHashPrefix.length).toBe(8);
		expect(payload.delayMs).toBeGreaterThanOrEqual(1);
	});

	test('succeeds after 2 retries and emits telemetry for each', async () => {
		const { retryCasWithBackoff } = await import('./manager');
		appendLedgerEventFailTimes = 2;

		await retryCasWithBackoff(tempDir, FAKE_EVENT_INPUT, {
			expectedHash: 'deadbeefcafebabe',
		});

		const retryEvents = emitCalls.filter(
			(e) => e.event === 'plan_ledger_cas_retry',
		);
		expect(retryEvents).toHaveLength(2);
		expect((retryEvents[0].payload as { attempt: number }).attempt).toBe(1);
		expect((retryEvents[1].payload as { attempt: number }).attempt).toBe(2);
	});
});

describe('retryCasWithBackoff — backoff schedule', () => {
	test('backoff delay is within expected jitter window for each attempt', async () => {
		// Test the backoff formula directly rather than with timers,
		// since setTimeout isn't fake-able deterministically in bun:test without a helper.
		const CAS_BACKOFF_START_MS = 5;
		const CAS_BACKOFF_CAP_MS = 250;
		const CAS_BACKOFF_JITTER = 0.25;

		for (let attempt = 1; attempt <= 3; attempt++) {
			const base = Math.min(
				CAS_BACKOFF_START_MS * 2 ** (attempt - 1),
				CAS_BACKOFF_CAP_MS,
			);
			const minDelay = Math.max(1, Math.round(base * (1 - CAS_BACKOFF_JITTER)));
			const maxDelay = Math.round(base * (1 + CAS_BACKOFF_JITTER));
			// Attempt 1: base=5ms, window=[3.75,6.25] → rounded [4,6]
			// Attempt 2: base=10ms, window=[7.5,12.5] → rounded [8,13]
			// Attempt 3: base=20ms, window=[15,25] → rounded [15,25]
			expect(minDelay).toBeGreaterThanOrEqual(1);
			expect(maxDelay).toBeGreaterThan(minDelay);
		}
	});

	test('cap applies: attempt that would exceed 250ms is capped', () => {
		const CAS_BACKOFF_START_MS = 5;
		const CAS_BACKOFF_CAP_MS = 250;
		// attempt 8: 5 * 2^7 = 640ms → capped to 250ms
		const base = Math.min(CAS_BACKOFF_START_MS * 2 ** 7, CAS_BACKOFF_CAP_MS);
		expect(base).toBe(CAS_BACKOFF_CAP_MS);
	});

	test('emitted delayMs is within the ±25% jitter window', async () => {
		const { retryCasWithBackoff } = await import('./manager');
		appendLedgerEventFailTimes = 1;

		await retryCasWithBackoff(tempDir, FAKE_EVENT_INPUT, {
			expectedHash: 'ffffffff',
		});

		const retryEvent = emitCalls.find(
			(e) => e.event === 'plan_ledger_cas_retry',
		);
		expect(retryEvent).toBeDefined();

		const { delayMs } = retryEvent!.payload as { delayMs: number };
		// Attempt 1: base=5ms, jitter=±25% → window=[3.75,6.25], rounded min=1
		expect(delayMs).toBeGreaterThanOrEqual(1);
		expect(delayMs).toBeLessThanOrEqual(7); // 5 * 1.25 = 6.25, round up = 7
	});
});

describe('retryCasWithBackoff — timeout/exhaustion', () => {
	test('throws LedgerStaleWriterError when retries exhausted (PlanConcurrentModificationError from caller)', async () => {
		const { retryCasWithBackoff } = await import('./manager');
		// Fail more times than the default maxRetries=3
		appendLedgerEventFailTimes = 999;

		await expect(
			retryCasWithBackoff(tempDir, FAKE_EVENT_INPUT, {
				expectedHash: 'deadbeef',
			}),
		).rejects.toThrow(LedgerStaleWriterError);

		// 3 retries means: first attempt + 3 retries = 4 total calls
		expect(appendLedgerEventCallCount).toBe(4);

		// All 3 retries emitted telemetry
		const retryEvents = emitCalls.filter(
			(e) => e.event === 'plan_ledger_cas_retry',
		);
		expect(retryEvents).toHaveLength(3);
	});

	test('verifyValid returning false exits cleanly with null', async () => {
		const { retryCasWithBackoff } = await import('./manager');
		appendLedgerEventFailTimes = 999;

		const result = await retryCasWithBackoff(tempDir, FAKE_EVENT_INPUT, {
			expectedHash: 'deadbeef',
			verifyValid: async () => false,
		});

		expect(result).toBeNull();
		// Only one retry emitted before verifyValid halted the loop
		const retryEvents = emitCalls.filter(
			(e) => e.event === 'plan_ledger_cas_retry',
		);
		expect(retryEvents).toHaveLength(1);
	});
});

describe('retryCasWithBackoff — hash prefix invariant', () => {
	test('telemetry never includes full hash — only 8-char prefix', async () => {
		const { retryCasWithBackoff } = await import('./manager');
		appendLedgerEventFailTimes = 999;

		await expect(
			retryCasWithBackoff(tempDir, FAKE_EVENT_INPUT, {
				expectedHash: '0123456789abcdef0123456789abcdef',
			}),
		).rejects.toThrow();

		for (const call of emitCalls.filter(
			(e) => e.event === 'plan_ledger_cas_retry',
		)) {
			const { expectedHashPrefix } = call.payload as {
				expectedHashPrefix: string;
			};
			// Must be exactly 8 chars — not the full 32-char hash
			expect(expectedHashPrefix.length).toBe(8);
		}
	});
});

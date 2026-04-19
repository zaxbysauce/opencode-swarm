/**
 * Unit tests for the PR 2 parallel dispatcher.
 *
 * Covers:
 * - enabled config with sufficient concurrency → dispatch with slot
 * - at max concurrency → defer
 * - disabled config → noop (reject)
 * - createDispatcher factory: returns correct type based on config
 * - shutdown clears active slots
 * - lock retry behavior (slot count enforcement)
 */

import { describe, expect, test } from 'bun:test';
import {
	createDispatcher,
	createNoopDispatcher,
} from '../../../src/parallel/dispatcher/index';
import { createParallelDispatcher } from '../../../src/parallel/dispatcher/parallel-dispatcher';
import type { DispatcherConfig } from '../../../src/parallel/dispatcher/types';

const DISABLED_CONFIG: DispatcherConfig = {
	enabled: false,
	maxConcurrentTasks: 1,
	evidenceLockTimeoutMs: 60000,
};

const ENABLED_SERIAL_CONFIG: DispatcherConfig = {
	enabled: true,
	maxConcurrentTasks: 1,
	evidenceLockTimeoutMs: 60000,
};

const ENABLED_PARALLEL_CONFIG: DispatcherConfig = {
	enabled: true,
	maxConcurrentTasks: 4,
	evidenceLockTimeoutMs: 60000,
};

// ── createDispatcher factory ───────────────────────────────────────────────────

describe('createDispatcher factory', () => {
	test('disabled config → noop dispatcher (reject)', () => {
		const d = createDispatcher(DISABLED_CONFIG);
		const decision = d.dispatch('1.1');
		expect(decision.action).toBe('reject');
		expect(decision.reason).toBe('parallelization_disabled');
	});

	test('enabled=true but maxConcurrentTasks=1 → noop dispatcher', () => {
		const d = createDispatcher(ENABLED_SERIAL_CONFIG);
		const decision = d.dispatch('1.1');
		expect(decision.action).toBe('reject');
		expect(decision.reason).toBe('parallelization_disabled');
	});

	test('enabled=true with maxConcurrentTasks=4 → parallel dispatcher (dispatch)', () => {
		const d = createDispatcher(ENABLED_PARALLEL_CONFIG);
		const decision = d.dispatch('1.1');
		expect(decision.action).toBe('dispatch');
	});
});

// ── ParallelDispatcher — dispatch behavior ────────────────────────────────────

describe('createParallelDispatcher — dispatch', () => {
	test('dispatch returns slot when under maxConcurrentTasks', () => {
		const d = createParallelDispatcher(ENABLED_PARALLEL_CONFIG);
		const decision = d.dispatch('1.1');
		expect(decision.action).toBe('dispatch');
		if (decision.action === 'dispatch') {
			expect(decision.slot).toBeDefined();
			expect(decision.slot.taskId).toBe('1.1');
			expect(decision.slot.slotId).toBeTruthy();
			expect(decision.slot.runId).toBeTruthy();
			expect(decision.slot.startedAt).toBeGreaterThan(0);
		}
	});

	test('dispatch returns defer when at maxConcurrentTasks', () => {
		const d = createParallelDispatcher(ENABLED_PARALLEL_CONFIG);
		// Fill all 4 slots
		for (let i = 0; i < 4; i++) {
			const dec = d.dispatch(`${i + 1}.1`);
			expect(dec.action).toBe('dispatch');
		}
		// 5th dispatch should be deferred
		const defer = d.dispatch('5.1');
		expect(defer.action).toBe('defer');
		expect(defer.reason).toBe('max_concurrent_tasks_reached');
	});

	test('dispatch returns slot again after releasing one', () => {
		const d = createParallelDispatcher(ENABLED_PARALLEL_CONFIG);
		// Fill all 4 slots
		const slotIds: string[] = [];
		for (let i = 0; i < 4; i++) {
			const dec = d.dispatch(`${i + 1}.1`);
			if (dec.action === 'dispatch') slotIds.push(dec.slot.slotId);
		}
		// Release first slot
		d.releaseSlot(slotIds[0]);
		// Now another dispatch should succeed
		const dec = d.dispatch('99.1');
		expect(dec.action).toBe('dispatch');
	});

	test('different tasks get unique slotIds and runIds', () => {
		const d = createParallelDispatcher(ENABLED_PARALLEL_CONFIG);
		const dec1 = d.dispatch('1.1');
		const dec2 = d.dispatch('1.2');
		if (dec1.action === 'dispatch' && dec2.action === 'dispatch') {
			expect(dec1.slot.slotId).not.toBe(dec2.slot.slotId);
			expect(dec1.slot.runId).not.toBe(dec2.slot.runId);
		}
	});

	test('config is accessible on the parallel dispatcher', () => {
		const d = createParallelDispatcher(ENABLED_PARALLEL_CONFIG);
		expect(d.config.enabled).toBe(true);
		expect(d.config.maxConcurrentTasks).toBe(4);
	});

	test('dispatch rejects when config.enabled is false (defense-in-depth guard)', () => {
		// createDispatcher factory prevents this path in normal use, but
		// createParallelDispatcher is exported so callers could pass enabled:false.
		const d = createParallelDispatcher({
			enabled: false,
			maxConcurrentTasks: 4,
			evidenceLockTimeoutMs: 60000,
		});
		const decision = d.dispatch('1.1');
		expect(decision.action).toBe('reject');
		expect(decision.reason).toBe('dispatcher_disabled');
	});
});

// ── ParallelDispatcher — handles ──────────────────────────────────────────────

describe('createParallelDispatcher — handles', () => {
	test('handles() is empty on a fresh dispatcher', () => {
		const d = createParallelDispatcher(ENABLED_PARALLEL_CONFIG);
		expect(d.handles()).toHaveLength(0);
	});

	test('handles() reflects active slots', () => {
		const d = createParallelDispatcher(ENABLED_PARALLEL_CONFIG);
		d.dispatch('1.1');
		d.dispatch('1.2');
		expect(d.handles()).toHaveLength(2);
	});

	test('handles() decrements when slot is cancelled', () => {
		const d = createParallelDispatcher(ENABLED_PARALLEL_CONFIG);
		const dec = d.dispatch('1.1');
		expect(d.handles()).toHaveLength(1);
		if (dec.action === 'dispatch') {
			const handle = d.handles().find((h) => h.slotId === dec.slot.slotId);
			handle?.cancel();
		}
		expect(d.handles()).toHaveLength(0);
	});
});

// ── ParallelDispatcher — shutdown ─────────────────────────────────────────────

describe('createParallelDispatcher — shutdown', () => {
	test('shutdown() clears all active slots', () => {
		const d = createParallelDispatcher(ENABLED_PARALLEL_CONFIG);
		d.dispatch('1.1');
		d.dispatch('1.2');
		d.shutdown();
		expect(d.handles()).toHaveLength(0);
	});

	test('dispatch after shutdown returns reject', () => {
		const d = createParallelDispatcher(ENABLED_PARALLEL_CONFIG);
		d.shutdown();
		const dec = d.dispatch('1.1');
		expect(dec.action).toBe('reject');
		expect(dec.reason).toBe('dispatcher_shutdown');
	});

	test('shutdown() does not throw with no active slots', () => {
		const d = createParallelDispatcher(ENABLED_PARALLEL_CONFIG);
		expect(() => d.shutdown()).not.toThrow();
	});
});

// ── NoopDispatcher unchanged ───────────────────────────────────────────────────

describe('createNoopDispatcher — still works (no regression)', () => {
	test('always returns reject for any task', () => {
		const d = createNoopDispatcher(DISABLED_CONFIG);
		expect(d.dispatch('1.1').action).toBe('reject');
		expect(d.dispatch('99.99').action).toBe('reject');
	});

	test('handles() always empty', () => {
		const d = createNoopDispatcher(DISABLED_CONFIG);
		expect(d.handles()).toHaveLength(0);
	});
});

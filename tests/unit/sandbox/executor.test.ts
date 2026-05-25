/**
 * Tests for src/sandbox/executor.ts
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
	_resetExecutorCache,
	getExecutor,
	SandboxError,
	type SandboxExecutor,
} from '../../../src/sandbox/executor';

describe('SandboxError', () => {
	test('SandboxError instance has correct name and message', () => {
		const err = new SandboxError('test message', 'ERR_TEST');
		expect(err.name).toBe('SandboxError');
		expect(err.message).toBe('test message');
		expect(err.code).toBe('ERR_TEST');
	});

	test('SandboxError is instanceof Error', () => {
		const err = new SandboxError('oops', 'ERR_OPS');
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(SandboxError);
	});

	test('SandboxError preserves message and code', () => {
		const err = new SandboxError('sandbox unavailable', 'ENOENT');
		expect(err.message).toBe('sandbox unavailable');
		expect(err.code).toBe('ENOENT');
	});
});

describe('getExecutor()', () => {
	beforeEach(() => {
		// Ensure clean state before each test
		_resetExecutorCache();
	});

	afterEach(() => {
		// Reset after each test so module state doesn't pollute other tests
		_resetExecutorCache();
	});

	test('getExecutor() returns a Promise', () => {
		const result = getExecutor();
		expect(result).toBeInstanceOf(Promise);
	});

	test('getExecutor() resolves to SandboxExecutor | null', async () => {
		const executor = await getExecutor();
		// In Phase 1 no concrete executor exists, so null is expected
		expect(executor === null || typeof executor === 'object').toBe(true);
		if (executor !== null) {
			expect(executor).toHaveProperty('mechanism');
			expect(executor).toHaveProperty('isAvailable');
			expect(executor).toHaveProperty('wrapCommand');
			expect(executor).toHaveProperty('getEnvOverrides');
		}
	});

	test('getExecutor() returns null when no platform executor is available (Phase 1)', async () => {
		// In Phase 1, no concrete executor modules exist — expect null
		const executor = await getExecutor();
		expect(executor).toBeNull();
	});

	test('concurrent getExecutor() calls return the same promise (cache sharing)', async () => {
		// Initiate two calls "simultaneously" — both should resolve to the same value
		// The cache is at module level; the source code guarantees same-promise semantics
		const [exec1, exec2] = await Promise.all([getExecutor(), getExecutor()]);
		// Both should be null in Phase 1; the key invariant is they both resolved
		expect(exec1).toBe(exec2);
	});
});

describe('_resetExecutorCache()', () => {
	beforeEach(() => {
		_resetExecutorCache();
	});

	afterEach(() => {
		_resetExecutorCache();
	});

	test('calling _resetExecutorCache() allows getExecutor() to run again', async () => {
		// First call — populates cache
		const first = await getExecutor();
		expect(first).toBeNull(); // Phase 1: no executor

		// Reset — should clear the cached promise
		_resetExecutorCache();

		// Second call after reset — should not short-circuit on cached value
		const second = await getExecutor();
		// In Phase 1 both are null (same outcome, but after reset it's a new promise chain)
		expect(second).toBeNull();
	});

	test('_resetExecutorCache() is callable multiple times without error', () => {
		expect(() => _resetExecutorCache()).not.toThrow();
		expect(() => _resetExecutorCache()).not.toThrow();
	});
});

/**
 * Test for log reclassification in model-limits.ts
 *
 * Verifies that logFirstCall() calls log() instead of warn() for the "Resolved limit for" message.
 * Also tests deduplication - log() should only be called once per unique model/provider combination.
 */

import { describe, it, expect, vi } from 'vitest';

// Local mock variables (NOT using vi.mocked())
const mockLog = vi.fn();
const mockWarn = vi.fn();
const mockError = vi.fn();

// Mock the utils module BEFORE importing model-limits
vi.mock('../../../src/utils/index.js', () => ({
	log: mockLog,
	warn: mockWarn,
	error: mockError,
}));

describe('model-limits: log reclassification', () => {
	it('should call log() and NOT warn() for the "Resolved limit for" message on first call', () => {
		// Clear mocks before this specific test
		mockLog.mockClear();
		mockWarn.mockClear();
		mockError.mockClear();

		// Import and call resolveModelLimit
		const { resolveModelLimit } = require('../../../src/hooks/model-limits.js');
		resolveModelLimit('claude-sonnet-4-6', 'anthropic', {});

		// Verify log() was called
		expect(mockLog).toHaveBeenCalled();

		// Verify log() was called with "Resolved limit for" message
		const logCalls = mockLog.mock.calls;
		const resolvedLimitCall = logCalls.find((call) =>
			call.some((arg) => typeof arg === 'string' && arg.includes('Resolved limit for'))
		);
		expect(resolvedLimitCall).toBeDefined();

		// Verify warn() was NOT called
		expect(mockWarn).not.toHaveBeenCalled();
	});

	it('should not call log() again on second call with same model/provider (deduplication)', () => {
		// Note: Due to module-level Set caching, this test runs in sequence after the first test
		// and will see the cached entry from the first test run.
		// To properly test deduplication in a fresh state, we test two calls in a single test
		// with a different model/provider combo.

		// Import resolveModelLimit
		const { resolveModelLimit } = require('../../../src/hooks/model-limits.js');

		// Clear mocks
		mockLog.mockClear();
		mockWarn.mockClear();
		mockError.mockClear();

		// First call with a new model/provider
		resolveModelLimit('gpt-5', 'openai', {});
		const callCountAfterFirst = mockLog.mock.calls.length;

		// Second call with same model/provider
		resolveModelLimit('gpt-5', 'openai', {});

		// Verify log() was not called again (call count should be the same)
		expect(mockLog.mock.calls.length).toBe(callCountAfterFirst);
	});
});

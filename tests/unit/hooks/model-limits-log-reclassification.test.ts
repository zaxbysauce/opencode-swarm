/**
 * Test for log reclassification in model-limits.ts
 *
 * Verifies that logFirstCall() calls log() instead of warn() for the "Resolved limit for" message.
 * Also tests deduplication - log() should only be called once per unique model/provider combination.
 */

import { describe, it, expect, mock } from 'bun:test';

// Local mock functions
const mockLog = mock(() => {});
const mockWarn = mock(() => {});
const mockError = mock(() => {});

// Mock the utils module BEFORE importing model-limits
mock.module('../../../src/utils/index.js', () => ({
	log: mockLog,
	warn: mockWarn,
	error: mockError,
}));

mock.module('../../../src/utils/logger', () => ({
	log: mockLog,
	warn: mockWarn,
	error: mockError,
}));

describe('model-limits: log reclassification', () => {
	it('should call log() and NOT warn() for the "Resolved limit for" message on first call', () => {
		mockLog.mockClear();
		mockWarn.mockClear();
		mockError.mockClear();

		const { resolveModelLimit } = require('../../../src/hooks/model-limits.js');
		resolveModelLimit('claude-sonnet-4-6', 'anthropic', {});

		expect(mockLog).toHaveBeenCalled();

		const logCalls = mockLog.mock.calls;
		const resolvedLimitCall = logCalls.find((call: any[]) =>
			call.some((arg: any) => typeof arg === 'string' && arg.includes('Resolved limit for'))
		);
		expect(resolvedLimitCall).toBeDefined();

		expect(mockWarn).not.toHaveBeenCalled();
	});

	it('should not call log() again on second call with same model/provider (deduplication)', () => {
		const { resolveModelLimit } = require('../../../src/hooks/model-limits.js');

		mockLog.mockClear();
		mockWarn.mockClear();
		mockError.mockClear();

		resolveModelLimit('gpt-5', 'openai', {});
		const callCountAfterFirst = mockLog.mock.calls.length;

		resolveModelLimit('gpt-5', 'openai', {});

		expect(mockLog.mock.calls.length).toBe(callCountAfterFirst);
	});
});

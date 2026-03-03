/**
 * Adversarial tests for log reclassification in model-limits.ts
 *
 * Tests attack vectors and boundary violations only - no happy path.
 * Verifies that log() is used (not warn()) and handles malicious/edge inputs safely.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Local mock variable pattern - NOT vi.mocked()
const mockLog = vi.fn();

// Mock the log function
vi.mock('../../../src/utils', () => ({
	log: mockLog,
}));

// Import after mocking
import { resolveModelLimit } from '../../../src/hooks/model-limits';

describe('model-limits: adversarial/attack-vector tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Scenario 1: undefined inputs', () => {
		it('should not crash on undefined inputs and use log() with "(no model)"', () => {
			const result = resolveModelLimit(undefined, undefined, {});

			// Should return fallback value without crashing
			expect(result).toBe(128000);

			// Verify log() was called (not warn())
			expect(mockLog).toHaveBeenCalledTimes(1);

			// Verify the message contains "(no model)" and "(no provider)"
			const logCall = mockLog.mock.calls[0];
			expect(logCall[0]).toContain('(no model)');
			expect(logCall[0]).toContain('(no provider)');
			expect(logCall[0]).toContain('fallback');
		});
	});

	describe('Scenario 2: empty strings', () => {
		it('should not crash on empty strings and not call warn()', () => {
			// Use a unique provider to avoid key collision with scenario 1
			const result = resolveModelLimit('', 'empty-string-provider', {});

			// Should return fallback value without crashing
			expect(result).toBe(128000);

			// Verify log() was called (not warn())
			expect(mockLog).toHaveBeenCalledTimes(1);

			// Verify the message contains the empty provider
			const logCall = mockLog.mock.calls[0];
			expect(logCall[0]).toContain('empty-string-provider');
			expect(logCall[0]).toContain('fallback');
		});
	});

	describe('Scenario 3: null coercion', () => {
		it('should not crash on null coercion (null as any)', () => {
			// Use a unique provider to avoid key collision
			const result = resolveModelLimit(null as any, 'null-coercion-provider', {});

			// Should return fallback value without crashing
			expect(result).toBe(128000);

			// Verify log() was called (not warn())
			expect(mockLog).toHaveBeenCalledTimes(1);

			// Verify the message handles null gracefully
			const logCall = mockLog.mock.calls[0];
			expect(logCall[0]).toContain('null-coercion-provider');
			expect(logCall[0]).toContain('fallback');
		});
	});

	describe('Scenario 4: very long modelID string', () => {
		it('should not crash on 1000+ character modelID', () => {
			// Create a 1000-character model ID with unique prefix
			const longModelID = 'long1000-' + 'a'.repeat(990);
			const result = resolveModelLimit(longModelID, '', {});

			// Should return fallback value without crashing
			expect(result).toBe(128000);

			// Verify log() was called (not warn())
			expect(mockLog).toHaveBeenCalledTimes(1);

			// Verify the long string is in the log message
			const logCall = mockLog.mock.calls[0];
			expect(logCall[0]).toContain(longModelID);
			expect(logCall[0]).toContain('fallback');
		});

		it('should not crash on 10000+ character modelID (boundary test)', () => {
			// Create a 10000-character model ID with unique prefix
			const veryLongModelID = 'verylong10000-' + 'x'.repeat(9990);
			const result = resolveModelLimit(veryLongModelID, 'verylong-provider', {});

			// Should return fallback value without crashing
			expect(result).toBe(128000);

			// Verify log() was called (not warn())
			expect(mockLog).toHaveBeenCalledTimes(1);

			// Verify the very long string is in the log message
			const logCall = mockLog.mock.calls[0];
			expect(logCall[0]).toContain('verylong10000-');
			expect(logCall[0]).toContain('verylong-provider');
			expect(logCall[0]).toContain('fallback');
		});
	});

	describe('Scenario 5: injection-like characters', () => {
		it('should safely pass through backticks without crashing', () => {
			const maliciousModelID = 'backtick`${malicious}`';
			const maliciousProviderID = 'backtick`${attack}`';
			const result = resolveModelLimit(maliciousModelID, maliciousProviderID, {});

			// Should return fallback value without crashing
			expect(result).toBe(128000);

			// Verify log() was called (not warn())
			expect(mockLog).toHaveBeenCalledTimes(1);

			// Verify the malicious characters are passed through to the log
			const logCall = mockLog.mock.calls[0];
			expect(logCall[0]).toContain(maliciousModelID);
			expect(logCall[0]).toContain(maliciousProviderID);
		});

		it('should safely pass through newlines without crashing', () => {
			const maliciousModelID = 'newlines\nmodel\nwith\nnewlines';
			const maliciousProviderID = 'newlines\rprovider\rwith\rcarriage';
			const result = resolveModelLimit(maliciousModelID, maliciousProviderID, {});

			// Should return fallback value without crashing
			expect(result).toBe(128000);

			// Verify log() was called (not warn())
			expect(mockLog).toHaveBeenCalledTimes(1);

			// Verify the newlines are passed through to the log
			const logCall = mockLog.mock.calls[0];
			expect(logCall[0]).toContain(maliciousModelID);
			expect(logCall[0]).toContain(maliciousProviderID);
		});

		it('should safely pass through null bytes and special chars without crashing', () => {
			// Note: We can't actually put null bytes in JavaScript strings easily,
			// but we can test other control characters
			const maliciousModelID = 'control\x00\x1f\x7fwith\x00control\x1bchars';
			const maliciousProviderID = 'control\t\tprovider';
			const result = resolveModelLimit(maliciousModelID, maliciousProviderID, {});

			// Should return fallback value without crashing
			expect(result).toBe(128000);

			// Verify log() was called (not warn())
			expect(mockLog).toHaveBeenCalledTimes(1);

			// Verify the special characters are passed through to the log
			const logCall = mockLog.mock.calls[0];
			expect(logCall[0]).toContain(maliciousModelID);
			expect(logCall[0]).toContain(maliciousProviderID);
		});

		it('should safely handle template literal injection attempts', () => {
			const maliciousModelID = 'template-${process.exit()}';
			const maliciousProviderID = 'template-${require("child_process")}';
			const result = resolveModelLimit(maliciousModelID, maliciousProviderID, {});

			// Should return fallback value without crashing
			expect(result).toBe(128000);

			// Verify log() was called (not warn())
			expect(mockLog).toHaveBeenCalledTimes(1);

			// The template literal syntax should be treated as a string, not executed
			const logCall = mockLog.mock.calls[0];
			expect(logCall[0]).toContain(maliciousModelID);
			expect(logCall[0]).toContain(maliciousProviderID);
		});

		it('should safely handle ANSI escape sequences', () => {
			const maliciousModelID = 'ansi\x1b[31mmodel\x1b[0m';
			const maliciousProviderID = 'ansi\x1b[32mprovider\x1b[0m';
			const result = resolveModelLimit(maliciousModelID, maliciousProviderID, {});

			// Should return fallback value without crashing
			expect(result).toBe(128000);

			// Verify log() was called (not warn())
			expect(mockLog).toHaveBeenCalledTimes(1);

			// Verify the ANSI codes are passed through to the log
			const logCall = mockLog.mock.calls[0];
			expect(logCall[0]).toContain(maliciousModelID);
			expect(logCall[0]).toContain(maliciousProviderID);
		});
	});
});

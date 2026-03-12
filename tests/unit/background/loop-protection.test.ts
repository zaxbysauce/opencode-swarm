import { describe, test, expect, beforeEach } from 'bun:test';
import {
	LoopProtection,
	type LoopProtectionConfig,
} from '../../../src/background/circuit-breaker';

describe('LoopProtection', () => {
	const defaultConfig: LoopProtectionConfig = {
		maxIterations: 5,
		timeWindowMs: 1000,
		operationKey: 'default',
	};

	describe('initial state', () => {
		test('should allow first attempts', () => {
			const lp = new LoopProtection(defaultConfig);

			const allowed = lp.recordAttempt();

			expect(allowed).toBe(true);
		});

		test('should start with zero iterations', () => {
			const lp = new LoopProtection(defaultConfig);

			expect(lp.getIterationCount()).toBe(0);
		});

		test('should allow max iterations', () => {
			const lp = new LoopProtection(defaultConfig);

			for (let i = 0; i < 5; i++) {
				const allowed = lp.recordAttempt();
				expect(allowed).toBe(true);
			}
		});

		test('should block after max iterations exceeded', () => {
			const lp = new LoopProtection(defaultConfig);

			// Hit the limit
			for (let i = 0; i < 5; i++) {
				lp.recordAttempt();
			}

			// Should be blocked now
			const allowed = lp.recordAttempt();

			expect(allowed).toBe(false);
		});
	});

	describe('iteration tracking', () => {
		test('should track iteration count', () => {
			const lp = new LoopProtection(defaultConfig);

			lp.recordAttempt();
			lp.recordAttempt();
			lp.recordAttempt();

			expect(lp.getIterationCount()).toBe(3);
		});

		test('should return remaining iterations', () => {
			const lp = new LoopProtection(defaultConfig);

			lp.recordAttempt();
			lp.recordAttempt();

			expect(lp.getRemainingIterations()).toBe(3);
		});

		test('should return max when not tracked', () => {
			const lp = new LoopProtection(defaultConfig);

			expect(lp.getRemainingIterations()).toBe(5);
		});
	});

	describe('canProceed', () => {
		test('should return true when not tracked', () => {
			const lp = new LoopProtection(defaultConfig);

			expect(lp.canProceed()).toBe(true);
		});

		test('should return true within limits', () => {
			const lp = new LoopProtection(defaultConfig);

			lp.recordAttempt();
			lp.recordAttempt();

			expect(lp.canProceed()).toBe(true);
		});

		test('should return false when exceeded', () => {
			const lp = new LoopProtection(defaultConfig);

			// 5 recordAttempts = count of 5
			// 6th recordAttempt returns false and sets count to 6
			for (let i = 0; i < 6; i++) {
				lp.recordAttempt();
			}

			// After exceeding, canProceed should return false
			expect(lp.canProceed()).toBe(false);
		});
	});

	describe('time window', () => {
		test('should reset after time window expires', async () => {
			const lp = new LoopProtection({
				...defaultConfig,
				timeWindowMs: 50,
			});

			// Use up iterations (5 attempts = count 5, which equals max)
			for (let i = 0; i < 5; i++) {
				lp.recordAttempt();
			}

			// At exactly max, canProceed returns true
			expect(lp.canProceed()).toBe(true);

			// 6th attempt exceeds limit
			lp.recordAttempt();

			// Now should be blocked
			expect(lp.canProceed()).toBe(false);

			// Wait for time window to expire
			await new Promise((resolve) => setTimeout(resolve, 60));

			// Should be reset
			expect(lp.canProceed()).toBe(true);
			expect(lp.getIterationCount()).toBe(0);
		});

		test('should reset count after time window expires', async () => {
			const lp = new LoopProtection({
				...defaultConfig,
				timeWindowMs: 50,
			});

			lp.recordAttempt();

			await new Promise((resolve) => setTimeout(resolve, 60));

			lp.recordAttempt();

			// Should be 1, not 2 (count reset)
			expect(lp.getIterationCount()).toBe(1);
		});
	});

	describe('multiple operation keys', () => {
		test('should track operations separately', () => {
			const lp = new LoopProtection(defaultConfig);

			// Use up default key
			for (let i = 0; i < 5; i++) {
				lp.recordAttempt('default');
			}

			// Other keys should still be allowed
			expect(lp.canProceed('other')).toBe(true);
		});

		test('should track different keys independently', () => {
			const lp = new LoopProtection(defaultConfig);

			// Use up default
			for (let i = 0; i < 5; i++) {
				lp.recordAttempt('default');
			}

			// 'other' should still work
			expect(lp.recordAttempt('other')).toBe(true);
			expect(lp.getIterationCount('other')).toBe(1);
		});

		test('should get tracked operations', () => {
			const lp = new LoopProtection(defaultConfig);

			lp.recordAttempt('op1');
			lp.recordAttempt('op2');

			const tracked = lp.getTrackedOperations();
			expect(tracked).toContain('op1');
			expect(tracked).toContain('op2');
		});
	});

	describe('reset', () => {
		test('should reset specific operation', () => {
			const lp = new LoopProtection(defaultConfig);

			lp.recordAttempt();
			lp.recordAttempt();

			lp.reset();

			expect(lp.getIterationCount()).toBe(0);
			expect(lp.canProceed()).toBe(true);
		});

		test('should reset all operations', () => {
			const lp = new LoopProtection(defaultConfig);

			lp.recordAttempt('op1');
			lp.recordAttempt('op2');

			lp.resetAll();

			expect(lp.getIterationCount('op1')).toBe(0);
			expect(lp.getIterationCount('op2')).toBe(0);
		});

		test('should allow new attempts after reset', () => {
			const lp = new LoopProtection(defaultConfig);

			// Use up iterations
			for (let i = 0; i < 5; i++) {
				lp.recordAttempt();
			}

			lp.reset();

			// Should be allowed again
			for (let i = 0; i < 5; i++) {
				expect(lp.recordAttempt()).toBe(true);
			}
		});
	});

	describe('loop detection callback', () => {
		test('should call onLoopDetected when limit exceeded', () => {
			let detectedKey: string | null = null;
			let detectedCount = 0;

			const lp = new LoopProtection(
				defaultConfig,
				(key, count) => {
					detectedKey = key;
					detectedCount = count;
				},
			);

			// Use up iterations
			for (let i = 0; i < 5; i++) {
				lp.recordAttempt();
			}

			// Try one more to trigger callback
			lp.recordAttempt();

			expect(detectedKey).toBe('default');
			expect(detectedCount).toBe(6);
		});
	});
});

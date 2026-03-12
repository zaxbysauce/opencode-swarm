import { describe, test, expect, beforeEach } from 'bun:test';
import {
	CircuitBreaker,
	type CircuitBreakerState,
	type CircuitBreakerConfig,
} from '../../../src/background/circuit-breaker';

describe('CircuitBreaker', () => {
	const defaultConfig: Partial<CircuitBreakerConfig> = {
		failureThreshold: 3,
		resetTimeoutMs: 1000, // Short for testing
		successThreshold: 2,
		callTimeoutMs: 5000,
	};

	describe('initial state', () => {
		test('should start in closed state', () => {
			const cb = new CircuitBreaker('test', defaultConfig);
			expect(cb.getState()).toBe('closed');
		});

		test('should use default config values', () => {
			const cb = new CircuitBreaker('test');
			const stats = cb.getStats();

			expect(stats.state).toBe('closed');
			expect(stats.failureCount).toBe(0);
			expect(stats.successCount).toBe(0);
		});
	});

	describe('successful calls', () => {
		test('should execute successfully in closed state', async () => {
			const cb = new CircuitBreaker('test', defaultConfig);

			const result = await cb.execute(async () => 'success');

			expect(result).toBe('success');
			expect(cb.getState()).toBe('closed');
		});

		test('should track success count', async () => {
			const cb = new CircuitBreaker('test', defaultConfig);

			await cb.execute(async () => 'ok');
			await cb.execute(async () => 'ok');

			const stats = cb.getStats();
			expect(stats.successCount).toBe(0); // Reset after success in closed state
		});

		test('should not trip on occasional failures below threshold', async () => {
			const cb = new CircuitBreaker('test', {
				...defaultConfig,
				failureThreshold: 3,
			});

			try {
				await cb.execute(async () => {
					throw new Error('fail 1');
				});
			} catch {
				// Expected
			}
			try {
				await cb.execute(async () => {
					throw new Error('fail 2');
				});
			} catch {
				// Expected
			}

			expect(cb.getState()).toBe('closed');
		});
	});

	describe('circuit trip (open)', () => {
		test('should trip after threshold failures', async () => {
			const cb = new CircuitBreaker('test', {
				...defaultConfig,
				failureThreshold: 3,
			});

			for (let i = 0; i < 3; i++) {
				try {
					await cb.execute(async () => {
						throw new Error('failure');
					});
				} catch {
					// Expected
				}
			}

			expect(cb.getState()).toBe('open');
		});

		test('should fail fast when open', async () => {
			const cb = new CircuitBreaker('test', {
				...defaultConfig,
				failureThreshold: 1,
			});

			// Trip the circuit
			try {
				await cb.execute(async () => {
					throw new Error('failure');
				});
			} catch {
				// Expected
			}

			expect(cb.getState()).toBe('open');

			// Should fail fast
			await expect(
				cb.execute(async () => 'should not run'),
			).rejects.toThrow("Circuit breaker 'test' is open");
		});

		test('should transition from open to half-open after timeout', async () => {
			const cb = new CircuitBreaker('test', {
				...defaultConfig,
				failureThreshold: 1,
				resetTimeoutMs: 50, // Short timeout for testing
			});

			// Trip the circuit
			try {
				await cb.execute(async () => {
					throw new Error('failure');
				});
			} catch {
				// Expected
			}

			expect(cb.getState()).toBe('open');

			// Wait for timeout
			await new Promise((resolve) => setTimeout(resolve, 60));

			// Should transition to half-open
			expect(cb.getState()).toBe('half-open');
		});

		test('should reset failure count on success in closed state', async () => {
			const cb = new CircuitBreaker('test', {
				...defaultConfig,
				failureThreshold: 3,
			});

			// One failure
			try {
				await cb.execute(async () => {
					throw new Error('failure');
				});
			} catch {
				// Expected
			}

			// Several successes should reset failure count
			await cb.execute(async () => 'ok');
			await cb.execute(async () => 'ok');

			// Now failures shouldn't trip until we hit threshold again
			for (let i = 0; i < 2; i++) {
				try {
					await cb.execute(async () => {
						throw new Error('failure');
					});
				} catch {
					// Expected
				}
			}

			// Should still be closed (failures didn't accumulate)
			expect(cb.getState()).toBe('closed');
		});
	});

	describe('half-open state', () => {
		test('should allow test calls in half-open', async () => {
			const cb = new CircuitBreaker('test', {
				...defaultConfig,
				failureThreshold: 1,
				resetTimeoutMs: 50,
				successThreshold: 2,
			});

			// Trip circuit
			try {
				await cb.execute(async () => {
					throw new Error('failure');
				});
			} catch {
				// Expected
			}

			// Wait for half-open
			await new Promise((resolve) => setTimeout(resolve, 60));

			// Test call should succeed
			const result = await cb.execute(async () => 'test');
			expect(result).toBe('test');
		});

		test('should close after success threshold in half-open', async () => {
			const cb = new CircuitBreaker('test', {
				...defaultConfig,
				failureThreshold: 1,
				resetTimeoutMs: 50,
				successThreshold: 2,
			});

			// Trip circuit
			try {
				await cb.execute(async () => {
					throw new Error('failure');
				});
			} catch {
				// Expected
			}

			// Wait for half-open
			await new Promise((resolve) => setTimeout(resolve, 60));

			// Two successes should close the circuit
			await cb.execute(async () => 'ok');
			await cb.execute(async () => 'ok');

			expect(cb.getState()).toBe('closed');
		});

		test('should go back to open on failure in half-open', async () => {
			const cb = new CircuitBreaker('test', {
				...defaultConfig,
				failureThreshold: 1,
				resetTimeoutMs: 50,
				successThreshold: 2,
			});

			// Trip circuit
			try {
				await cb.execute(async () => {
					throw new Error('failure');
				});
			} catch {
				// Expected
			}

			// Wait for half-open
			await new Promise((resolve) => setTimeout(resolve, 60));

			// Failure in half-open should go back to open
			try {
				await cb.execute(async () => {
					throw new Error('failure');
				});
			} catch {
				// Expected
			}

			expect(cb.getState()).toBe('open');
		});
	});

	describe('manual reset', () => {
		test('should reset to closed state', async () => {
			const cb = new CircuitBreaker('test', {
				...defaultConfig,
				failureThreshold: 1,
			});

			// Trip circuit
			try {
				await cb.execute(async () => {
					throw new Error('failure');
				});
			} catch {
				// Expected
			}

			expect(cb.getState()).toBe('open');

			// Manual reset
			cb.reset();

			expect(cb.getState()).toBe('closed');

			// Should work normally now
			const result = await cb.execute(async () => 'success');
			expect(result).toBe('success');
		});
	});

	describe('statistics', () => {
		test('should return accurate stats', async () => {
			const cb = new CircuitBreaker('test', {
				...defaultConfig,
				failureThreshold: 3,
			});

			await cb.execute(async () => 'ok');

			try {
				await cb.execute(async () => {
					throw new Error('fail');
				});
			} catch {
				// Expected
			}

			const stats = cb.getStats();

			expect(stats.state).toBe('closed');
			expect(stats.lastFailureTime).toBeDefined();
		});
	});

	describe('call timeout', () => {
		test('should timeout slow calls', async () => {
			const cb = new CircuitBreaker('test', {
				...defaultConfig,
				callTimeoutMs: 50,
			});

			await expect(
				cb.execute(async () => {
					await new Promise((resolve) => setTimeout(resolve, 100));
					return 'slow';
				}),
			).rejects.toThrow('Call timeout');
		});

		test('should not timeout when timeout is 0', async () => {
			const cb = new CircuitBreaker('test', {
				...defaultConfig,
				callTimeoutMs: 0,
			});

			const result = await cb.execute(async () => {
				await new Promise((resolve) => setTimeout(resolve, 10));
				return 'done';
			});

			expect(result).toBe('done');
		});
	});

	describe('state change callbacks', () => {
		test('should call onStateChange for state transitions', async () => {
			const stateChanges: Array<{ type: string; data: unknown }> = [];

			const cb = new CircuitBreaker(
				'test',
				{
					...defaultConfig,
					failureThreshold: 1,
				},
				(type, data) => {
					stateChanges.push({ type, data: data as object });
				},
			);

			try {
				await cb.execute(async () => {
					throw new Error('fail');
				});
			} catch {
				// Expected
			}

			expect(stateChanges.some((c) => c.type === 'opened')).toBe(true);
		});
	});
});

describe('CircuitBreakerState', () => {
	test('should have valid states', () => {
		const validStates: CircuitBreakerState[] = ['closed', 'open', 'half-open'];

		for (const state of validStates) {
			const cb = new CircuitBreaker('test', {});
			// We can't directly set state but we can verify the type is correct
			expect(state).toBeDefined();
		}
	});
});

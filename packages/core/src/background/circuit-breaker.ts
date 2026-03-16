/**
 * Circuit Breaker + Loop Protection Primitives
 *
 * Provides fault tolerance and infinite loop prevention for background automation.
 */

/** Circuit breaker states */
export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

/** Circuit breaker configuration */
export interface CircuitBreakerConfig {
	/** Number of failures before opening circuit */
	failureThreshold: number;
	/** Time in ms to wait before attempting reset */
	resetTimeoutMs: number;
	/** Number of success calls needed to close from half-open */
	successThreshold: number;
	/** Timeout for individual calls (0 = no timeout) */
	callTimeoutMs: number;
}

/** Circuit breaker events */
export interface CircuitBreakerEvents {
	opened: { timestamp: number; failureCount: number };
	closed: { timestamp: number; successCount: number };
	'half-open': { timestamp: number };
	callSuccess: { duration: number };
	callFailure: { error: unknown; duration: number };
}

export type CircuitBreakerEventType = keyof CircuitBreakerEvents;

/**
 * Circuit Breaker Implementation
 *
 * Prevents cascading failures by stopping requests when the circuit is open.
 * States:
 * - closed: Normal operation, requests pass through
 * - open: Circuit is open, requests fail fast
 * - half-open: Testing if service recovered
 */
export class CircuitBreaker {
	private state: CircuitBreakerState = 'closed';
	private failureCount = 0;
	private successCount = 0;
	private lastFailureTime?: number;
	private readonly config: CircuitBreakerConfig;
	private readonly name: string;
	private readonly onStateChange?: (eventType: string, event: unknown) => void;

	constructor(
		name: string,
		config?: Partial<CircuitBreakerConfig>,
		onStateChange?: (eventType: string, event: unknown) => void,
	) {
		this.name = name;
		this.config = {
			failureThreshold: config?.failureThreshold ?? 5,
			resetTimeoutMs: config?.resetTimeoutMs ?? 30000,
			successThreshold: config?.successThreshold ?? 3,
			callTimeoutMs: config?.callTimeoutMs ?? 10000,
		};
		this.onStateChange = onStateChange;
	}

	/**
	 * Get current circuit state
	 */
	getState(): CircuitBreakerState {
		// Check if we should transition from open to half-open
		if (this.state === 'open' && this.lastFailureTime) {
			const timeSinceFailure = Date.now() - this.lastFailureTime;
			if (timeSinceFailure >= this.config.resetTimeoutMs) {
				this.transitionTo('half-open');
			}
		}
		return this.state;
	}

	/**
	 * Execute a function with circuit breaker protection
	 */
	async execute<T>(fn: () => Promise<T>): Promise<T> {
		const state = this.getState();

		// Fail fast if circuit is open
		if (state === 'open') {
			const error = new Error(`Circuit breaker '${this.name}' is open`);
			throw error;
		}

		// Execute with optional timeout
		const startTime = Date.now();
		try {
			const result = await this.executeWithTimeout(fn);
			const duration = Date.now() - startTime;

			this.recordSuccess(duration);
			return result;
		} catch (error) {
			const duration = Date.now() - startTime;
			this.recordFailure(error, duration);
			throw error;
		}
	}

	/**
	 * Execute with timeout
	 */
	private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
		if (this.config.callTimeoutMs <= 0) {
			return fn();
		}

		return new Promise<T>((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error(`Call timeout after ${this.config.callTimeoutMs}ms`));
			}, this.config.callTimeoutMs);

			fn()
				.then((result) => {
					clearTimeout(timeout);
					resolve(result);
				})
				.catch((error) => {
					clearTimeout(timeout);
					reject(error);
				});
		});
	}

	/**
	 * Record a successful call
	 */
	private recordSuccess(duration: number): void {
		this.failureCount = 0;

		if (this.state === 'half-open') {
			this.successCount++;
			if (this.successCount >= this.config.successThreshold) {
				this.transitionTo('closed');
			}
		}

		this.onStateChange?.('callSuccess', { duration });
	}

	/**
	 * Record a failed call
	 */
	private recordFailure(error: unknown, duration: number): void {
		this.failureCount++;
		this.lastFailureTime = Date.now();

		if (this.state === 'half-open') {
			// Any failure in half-open goes back to open
			this.transitionTo('open');
		} else if (
			this.state === 'closed' &&
			this.failureCount >= this.config.failureThreshold
		) {
			this.transitionTo('open');
		}

		this.onStateChange?.('callFailure', { error, duration });
	}

	/**
	 * Transition to a new state
	 */
	private transitionTo(newState: CircuitBreakerState): void {
		// biome-ignore lint/correctness/noUnusedVariables: oldState useful for debugging/logging in future
		const oldState = this.state;
		this.state = newState;

		if (newState === 'closed') {
			this.failureCount = 0;
			this.successCount = 0;
			this.onStateChange?.('closed', {
				timestamp: Date.now(),
				successCount: 0,
			});
		} else if (newState === 'open') {
			this.successCount = 0;
			this.onStateChange?.('opened', {
				timestamp: Date.now(),
				failureCount: this.failureCount,
			});
		} else if (newState === 'half-open') {
			this.successCount = 0;
			this.onStateChange?.('half-open', { timestamp: Date.now() });
		}
	}

	/**
	 * Manually reset the circuit breaker
	 */
	reset(): void {
		this.transitionTo('closed');
	}

	/**
	 * Get circuit breaker statistics
	 */
	getStats(): {
		state: CircuitBreakerState;
		failureCount: number;
		successCount: number;
		lastFailureTime?: number;
	} {
		return {
			state: this.getState(),
			failureCount: this.failureCount,
			successCount: this.successCount,
			lastFailureTime: this.lastFailureTime,
		};
	}
}

/**
 * Loop Protection for preventing infinite automation loops
 *
 * Tracks operation history and detects potential infinite loops.
 */
export interface LoopProtectionConfig {
	/** Maximum times an operation can be attempted */
	maxIterations: number;
	/** Time window in ms to track iterations */
	timeWindowMs: number;
	/** Unique key for the operation being protected */
	operationKey: string;
}

/** Loop protection record */
interface LoopRecord {
	count: number;
	firstAttempt: number;
	lastAttempt: number;
}

/**
 * Loop Protection Implementation
 *
 * Prevents infinite loops by tracking operation frequency.
 */
export class LoopProtection {
	private records: Map<string, LoopRecord> = new Map();
	private readonly config: LoopProtectionConfig;
	private readonly onLoopDetected?: (key: string, count: number) => void;

	constructor(
		config: LoopProtectionConfig,
		onLoopDetected?: (key: string, count: number) => void,
	) {
		this.config = config;
		this.onLoopDetected = onLoopDetected;
	}

	/**
	 * Record an iteration attempt
	 * Returns false if max iterations exceeded
	 */
	recordAttempt(key?: string): boolean {
		const operationKey = key ?? this.config.operationKey;
		const now = Date.now();

		let record = this.records.get(operationKey);

		// Check if we need to reset (outside time window)
		if (record && now - record.firstAttempt > this.config.timeWindowMs) {
			record = undefined;
		}

		if (!record) {
			// First attempt
			this.records.set(operationKey, {
				count: 1,
				firstAttempt: now,
				lastAttempt: now,
			});
			return true;
		}

		record.count++;
		record.lastAttempt = now;

		// Check if exceeded
		if (record.count > this.config.maxIterations) {
			this.onLoopDetected?.(operationKey, record.count);
			return false;
		}

		return true;
	}

	/**
	 * Check if operation is allowed without recording
	 */
	canProceed(key?: string): boolean {
		const operationKey = key ?? this.config.operationKey;
		const record = this.records.get(operationKey);

		if (!record) return true;

		const now = Date.now();
		// Check if outside time window
		if (now - record.firstAttempt > this.config.timeWindowMs) {
			return true;
		}

		return record.count <= this.config.maxIterations;
	}

	/**
	 * Get remaining iterations allowed
	 */
	getRemainingIterations(key?: string): number {
		const operationKey = key ?? this.config.operationKey;
		const record = this.records.get(operationKey);

		if (!record) return this.config.maxIterations;

		const now = Date.now();
		// Check if outside time window
		if (now - record.firstAttempt > this.config.timeWindowMs) {
			return this.config.maxIterations;
		}

		return Math.max(0, this.config.maxIterations - record.count);
	}

	/**
	 * Reset tracking for an operation
	 */
	reset(key?: string): void {
		const operationKey = key ?? this.config.operationKey;
		this.records.delete(operationKey);
	}

	/**
	 * Reset all tracking
	 */
	resetAll(): void {
		this.records.clear();
	}

	/**
	 * Get current iteration count
	 */
	getIterationCount(key?: string): number {
		const operationKey = key ?? this.config.operationKey;
		const record = this.records.get(operationKey);

		if (!record) return 0;

		const now = Date.now();
		// Check if outside time window
		if (now - record.firstAttempt > this.config.timeWindowMs) {
			return 0;
		}

		return record.count;
	}

	/**
	 * Get all operation keys being tracked
	 */
	getTrackedOperations(): string[] {
		return Array.from(this.records.keys());
	}
}

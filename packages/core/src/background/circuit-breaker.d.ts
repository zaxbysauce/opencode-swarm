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
    opened: {
        timestamp: number;
        failureCount: number;
    };
    closed: {
        timestamp: number;
        successCount: number;
    };
    'half-open': {
        timestamp: number;
    };
    callSuccess: {
        duration: number;
    };
    callFailure: {
        error: unknown;
        duration: number;
    };
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
export declare class CircuitBreaker {
    private state;
    private failureCount;
    private successCount;
    private lastFailureTime?;
    private readonly config;
    private readonly name;
    private readonly onStateChange?;
    constructor(name: string, config?: Partial<CircuitBreakerConfig>, onStateChange?: (eventType: string, event: unknown) => void);
    /**
     * Get current circuit state
     */
    getState(): CircuitBreakerState;
    /**
     * Execute a function with circuit breaker protection
     */
    execute<T>(fn: () => Promise<T>): Promise<T>;
    /**
     * Execute with timeout
     */
    private executeWithTimeout;
    /**
     * Record a successful call
     */
    private recordSuccess;
    /**
     * Record a failed call
     */
    private recordFailure;
    /**
     * Transition to a new state
     */
    private transitionTo;
    /**
     * Manually reset the circuit breaker
     */
    reset(): void;
    /**
     * Get circuit breaker statistics
     */
    getStats(): {
        state: CircuitBreakerState;
        failureCount: number;
        successCount: number;
        lastFailureTime?: number;
    };
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
/**
 * Loop Protection Implementation
 *
 * Prevents infinite loops by tracking operation frequency.
 */
export declare class LoopProtection {
    private records;
    private readonly config;
    private readonly onLoopDetected?;
    constructor(config: LoopProtectionConfig, onLoopDetected?: (key: string, count: number) => void);
    /**
     * Record an iteration attempt
     * Returns false if max iterations exceeded
     */
    recordAttempt(key?: string): boolean;
    /**
     * Check if operation is allowed without recording
     */
    canProceed(key?: string): boolean;
    /**
     * Get remaining iterations allowed
     */
    getRemainingIterations(key?: string): number;
    /**
     * Reset tracking for an operation
     */
    reset(key?: string): void;
    /**
     * Reset all tracking
     */
    resetAll(): void;
    /**
     * Get current iteration count
     */
    getIterationCount(key?: string): number;
    /**
     * Get all operation keys being tracked
     */
    getTrackedOperations(): string[];
}

/**
 * Lightweight In-Process Queue with Priorities and Retry Metadata
 *
 * Provides a simple but powerful queue abstraction for background automation.
 * Supports priorities, retry logic, and in-memory persistence only.
 * NOTE: This queue does NOT persist across restarts — all items are lost when the process exits.
 */
/** Queue priority levels */
export type QueuePriority = 'critical' | 'high' | 'normal' | 'low';
/** Retry metadata for failed items */
export interface RetryMetadata {
    attempts: number;
    maxAttempts: number;
    lastAttempt?: number;
    nextAttemptAt?: number;
    backoffMs: number;
    maxBackoffMs: number;
}
/** Queue item structure */
export interface QueueItem<T = unknown> {
    id: string;
    priority: QueuePriority;
    payload: T;
    createdAt: number;
    metadata?: Record<string, unknown>;
    retry?: RetryMetadata;
}
/** Queue configuration */
export interface QueueConfig {
    priorityLevels?: QueuePriority[];
    maxSize?: number;
    defaultMaxRetries?: number;
    defaultBackoffMs?: number;
    maxBackoffMs?: number;
}
/**
 * In-process queue with priority support and retry metadata
 */
export declare class AutomationQueue<T = unknown> {
    private items;
    private readonly maxSize;
    private readonly defaultMaxRetries;
    private readonly defaultBackoffMs;
    private readonly maxBackoffMs;
    private readonly eventBus;
    private itemCounter;
    constructor(config?: QueueConfig);
    /**
     * Generate unique item ID
     */
    private generateId;
    /**
     * Enqueue an item with priority
     */
    enqueue(payload: T, priority?: QueuePriority, metadata?: Record<string, unknown>): string;
    /**
     * Dequeue the highest priority item
     */
    dequeue(): QueueItem<T> | undefined;
    /**
     * Peek at the highest priority item without removing
     */
    peek(): QueueItem<T> | undefined;
    /**
     * Get item by ID
     */
    get(id: string): QueueItem<T> | undefined;
    /**
     * Remove specific item by ID
     */
    remove(id: string): boolean;
    /**
     * Mark item as completed and remove from queue
     */
    complete(id: string): boolean;
    /**
     * Mark item as failed and schedule retry if possible
     */
    retry(id: string, _error?: unknown): boolean;
    /**
     * Get items due for retry
     */
    getRetryableItems(): QueueItem<T>[];
    /**
     * Get current queue size
     */
    size(): number;
    /**
     * Check if queue is empty
     */
    isEmpty(): boolean;
    /**
     * Check if queue is full
     */
    isFull(): boolean;
    /**
     * Clear all items from queue
     */
    clear(): void;
    /**
     * Get all items (for debugging/inspection)
     */
    getAll(): QueueItem<T>[];
    /**
     * Get items by priority
     */
    getByPriority(priority: QueuePriority): QueueItem<T>[];
    /**
     * Get queue statistics
     */
    getStats(): {
        size: number;
        maxSize: number;
        byPriority: Record<QueuePriority, number>;
        retryable: number;
    };
}

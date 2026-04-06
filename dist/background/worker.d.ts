/**
 * Worker Lifecycle Manager
 *
 * Manages worker threads for background automation.
 * Handles registration, start/stop, and handler coordination.
 */
import type { AutomationQueue, QueueItem } from './queue';
/** Worker handler function */
export type WorkerHandler<T = unknown> = (item: QueueItem<T>) => Promise<{
    success: boolean;
    result?: unknown;
    error?: unknown;
}>;
/** Worker registration options */
export interface WorkerRegistration {
    name: string;
    handler: WorkerHandler;
    queue: AutomationQueue;
    concurrency?: number;
    autoStart?: boolean;
}
/** Worker status */
export type WorkerStatus = 'idle' | 'running' | 'stopping' | 'stopped' | 'error';
/**
 * Worker Lifecycle Manager
 *
 * Manages worker registration, lifecycle, and processing.
 */
export declare class WorkerManager {
    private workers;
    private readonly eventBus;
    constructor();
    /**
     * Register a new worker
     */
    register(registration: WorkerRegistration): void;
    /**
     * Unregister a worker
     */
    unregister(name: string): boolean;
    /**
     * Start a worker
     */
    start(name: string): boolean;
    /**
     * Start processing loop for a worker
     */
    private startProcessingLoop;
    /**
     * Handle a single queue item
     */
    private handleItem;
    /**
     * Stop a worker
     */
    stop(name: string): boolean;
    /**
     * Start all workers
     */
    startAll(): void;
    /**
     * Stop all workers
     */
    stopAll(): void;
    /**
     * Get worker status
     */
    getStatus(name: string): WorkerStatus | undefined;
    /**
     * Get worker statistics
     */
    getStats(name: string): {
        status: WorkerStatus;
        activeCount: number;
        processedCount: number;
        errorCount: number;
        lastError?: unknown;
        queueSize: number;
    } | undefined;
    /**
     * Get all worker names
     */
    getWorkerNames(): string[];
    /**
     * Check if any workers are running
     */
    isAnyRunning(): boolean;
    /**
     * Get total statistics across all workers
     */
    getTotalStats(): Record<string, ReturnType<WorkerManager['getStats']>>;
}

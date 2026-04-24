/**
 * Parallel dispatcher — enabled path for Stage B concurrent task execution.
 *
 * Uses p-limit for bounded concurrency. Returns 'dispatch' when a slot is
 * available, 'defer' when at max capacity, 'reject' when disabled.
 *
 * PR 2: implements the enabled dispatcher alongside the existing NoopDispatcher.
 * No production code imports this directly — it is wired in via createDispatcher().
 */
import type { DispatchDecision, DispatcherConfig, TaskExecutionHandle } from './types.js';
export interface ParallelDispatcher {
    readonly config: DispatcherConfig;
    dispatch(taskId: string): DispatchDecision;
    handles(): TaskExecutionHandle[];
    releaseSlot(slotId: string): void;
    shutdown(): void;
}
export declare function createParallelDispatcher(config: DispatcherConfig): ParallelDispatcher;

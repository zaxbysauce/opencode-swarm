export { createNoopDispatcher, type NoopDispatcher, } from './noop-dispatcher.js';
export { createParallelDispatcher, type ParallelDispatcher, } from './parallel-dispatcher.js';
export type { DispatchDecision, DispatcherConfig, RunSlot, TaskExecutionHandle, } from './types.js';
import { type NoopDispatcher } from './noop-dispatcher.js';
import { type ParallelDispatcher } from './parallel-dispatcher.js';
import type { DispatcherConfig } from './types.js';
/**
 * Factory: returns the appropriate dispatcher based on config.
 * When disabled or maxConcurrentTasks <= 1, returns the no-op dispatcher.
 * When enabled and maxConcurrentTasks > 1, returns the parallel dispatcher.
 */
export declare function createDispatcher(config: DispatcherConfig): NoopDispatcher | ParallelDispatcher;

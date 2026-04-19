export {
	createNoopDispatcher,
	type NoopDispatcher,
} from './noop-dispatcher.js';
export {
	createParallelDispatcher,
	type ParallelDispatcher,
} from './parallel-dispatcher.js';
export type {
	DispatchDecision,
	DispatcherConfig,
	RunSlot,
	TaskExecutionHandle,
} from './types.js';

import {
	createNoopDispatcher,
	type NoopDispatcher,
} from './noop-dispatcher.js';
import {
	createParallelDispatcher,
	type ParallelDispatcher,
} from './parallel-dispatcher.js';
import type { DispatcherConfig } from './types.js';

/**
 * Factory: returns the appropriate dispatcher based on config.
 * When disabled or maxConcurrentTasks <= 1, returns the no-op dispatcher.
 * When enabled and maxConcurrentTasks > 1, returns the parallel dispatcher.
 */
export function createDispatcher(
	config: DispatcherConfig,
): NoopDispatcher | ParallelDispatcher {
	if (!config.enabled || config.maxConcurrentTasks <= 1) {
		return createNoopDispatcher(config);
	}
	return createParallelDispatcher(config);
}

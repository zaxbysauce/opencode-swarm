/**
 * No-op dispatcher — returned when parallelization is disabled (the default).
 *
 * All dispatch methods return a 'reject' decision with reason
 * 'parallelization_disabled'.  No file I/O, no side effects, no imports of
 * production runtime modules.
 *
 * PR 2 will implement the enabled dispatcher path behind the same factory
 * interface.
 */

import type {
	DispatchDecision,
	DispatcherConfig,
	TaskExecutionHandle,
} from './types.js';

export interface NoopDispatcher {
	readonly config: DispatcherConfig;
	dispatch(taskId: string): DispatchDecision;
	handles(): TaskExecutionHandle[];
	shutdown(): void;
}

export function createNoopDispatcher(config: DispatcherConfig): NoopDispatcher {
	return {
		config,

		dispatch(_taskId: string): DispatchDecision {
			return {
				action: 'reject',
				reason: 'parallelization_disabled',
			};
		},

		handles(): TaskExecutionHandle[] {
			return [];
		},

		shutdown(): void {
			// no-op
		},
	};
}

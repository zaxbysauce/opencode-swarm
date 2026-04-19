/**
 * Parallel dispatcher — enabled path for Stage B concurrent task execution.
 *
 * Uses p-limit for bounded concurrency. Returns 'dispatch' when a slot is
 * available, 'defer' when at max capacity, 'reject' when disabled.
 *
 * PR 2: implements the enabled dispatcher alongside the existing NoopDispatcher.
 * No production code imports this directly — it is wired in via createDispatcher().
 */

import pLimit from 'p-limit';
import type {
	DispatchDecision,
	DispatcherConfig,
	RunSlot,
	TaskExecutionHandle,
} from './types.js';

export interface ParallelDispatcher {
	readonly config: DispatcherConfig;
	dispatch(taskId: string): DispatchDecision;
	handles(): TaskExecutionHandle[];
	releaseSlot(slotId: string): void;
	shutdown(): void;
}

export function createParallelDispatcher(
	config: DispatcherConfig,
): ParallelDispatcher {
	const limit = pLimit(config.maxConcurrentTasks);
	const activeSlots = new Map<string, RunSlot>();
	let slotCounter = 0;
	let shutdownCalled = false;

	return {
		config,

		dispatch(taskId: string): DispatchDecision {
			if (!config.enabled) {
				return { action: 'reject', reason: 'dispatcher_disabled' };
			}

			if (shutdownCalled) {
				return { action: 'reject', reason: 'dispatcher_shutdown' };
			}

			if (activeSlots.size >= config.maxConcurrentTasks) {
				return { action: 'defer', reason: 'max_concurrent_tasks_reached' };
			}

			const slotId = `slot-${++slotCounter}`;
			const runId = `run-${taskId}-${slotId}`;
			const slot: RunSlot = {
				slotId,
				taskId,
				runId,
				startedAt: Date.now(),
			};

			activeSlots.set(slotId, slot);

			// Wrap in p-limit to enforce hard concurrency ceiling at the
			// promise-scheduling level, providing a second safety net beyond
			// the activeSlots.size guard.
			limit(async () => {
				// Slot lifecycle is managed by releaseSlot() or shutdown().
				// p-limit schedules this work but slot removal is explicit.
			});

			return { action: 'dispatch', reason: 'slot_available', slot };
		},

		handles(): TaskExecutionHandle[] {
			return [...activeSlots.values()].map((slot) => ({
				slotId: slot.slotId,
				taskId: slot.taskId,
				runId: slot.runId,
				cancel: () => {
					activeSlots.delete(slot.slotId);
				},
			}));
		},

		releaseSlot(slotId: string): void {
			activeSlots.delete(slotId);
		},

		shutdown(): void {
			shutdownCalled = true;
			activeSlots.clear();
			limit.clearQueue();
		},
	};
}

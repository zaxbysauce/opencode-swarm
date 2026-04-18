/**
 * Type-only surfaces for the parallel task dispatcher (dark — PR 1 foundation).
 *
 * No runtime behavior here.  PR 2 will implement the enabled path.
 */

export interface DispatcherConfig {
	enabled: boolean;
	maxConcurrentTasks: number;
	evidenceLockTimeoutMs: number;
}

export interface RunSlot {
	slotId: string;
	taskId: string;
	runId: string;
	startedAt: number;
}

export type DispatchDecision =
	| { action: 'dispatch'; reason: string; slot: RunSlot }
	| { action: 'defer'; reason: string }
	| { action: 'reject'; reason: string };

export interface TaskExecutionHandle {
	slotId: string;
	taskId: string;
	runId: string;
	cancel(): void;
}

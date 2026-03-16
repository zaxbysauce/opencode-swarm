/**
 * StateBridge — disk-based swarm state bridge for Claude Code adapter.
 *
 * Reads .swarm/ (plan.json, evidence/, session state) on each hook invocation,
 * reconstructs minimal swarmState from disk, writes state changes back after
 * hook execution. Uses mtime-based cache (.swarm/state-cache.json) to avoid
 * re-parsing on every hook call.
 *
 * Target: < 50ms cold load, < 10ms cached load.
 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import * as path from 'node:path';

// ── Types ──────────────────────────────────────────────────────────────────

export interface TaskState {
	id: string;
	status: 'pending' | 'in_progress' | 'completed' | 'blocked';
	workflowState:
		| 'idle'
		| 'coder_delegated'
		| 'pre_check_passed'
		| 'reviewer_run'
		| 'tests_run'
		| 'complete';
}

export interface DelegationEntry {
	from: string;
	to: string;
	timestamp: number;
}

export interface MinimalSwarmState {
	/** Task workflow states keyed by taskId */
	taskStates: Map<string, TaskState>;
	/** Delegation chains keyed by sessionId */
	delegationChains: Map<string, DelegationEntry[]>;
	/** Tool call counts keyed by tool name */
	toolCallCounts: Map<string, number>;
	/** Current session ID */
	sessionId: string;
	/** Working directory */
	cwd: string;
}

export interface StateCache {
	version: 1;
	loadedAt: number;
	planMtime: number;
	snapshotMtime: number;
	state: {
		taskStates: Array<[string, TaskState]>;
		delegationChains: Array<[string, DelegationEntry[]]>;
		toolCallCounts: Array<[string, number]>;
	};
}

// ── StateBridge ────────────────────────────────────────────────────────────

export class StateBridge {
	private readonly swarmDir: string;
	private readonly cachePath: string;

	constructor(
		cwd: string,
		private readonly sessionId: string,
	) {
		this.swarmDir = path.join(cwd, '.swarm');
		this.cachePath = path.join(this.swarmDir, 'state-cache.json');
	}

	/**
	 * Load state from disk. Uses mtime-based cache to avoid re-parsing.
	 * Returns minimal swarmState reconstructed from plan.json + snapshot.
	 */
	load(): MinimalSwarmState {
		const planPath = path.join(this.swarmDir, 'plan.json');
		const snapshotPath = path.join(this.swarmDir, 'session', 'state.json');

		// Check mtimes to determine if cache is still valid
		const planMtime = this.getMtime(planPath);
		const snapshotMtime = this.getMtime(snapshotPath);

		// Try cache first
		const cached = this.tryLoadCache(planMtime, snapshotMtime);
		if (cached) {
			this.cachedState = cached;
			return cached;
		}

		// Cold load from disk
		const state = this.coldLoad(
			planPath,
			snapshotPath,
			planMtime,
			snapshotMtime,
		);
		this.cachedState = state;
		this.cacheLoadedAt = Date.now();

		// Persist cache for next call
		this.persistCache(state, planMtime, snapshotMtime);

		return state;
	}

	/**
	 * Write state changes back to disk.
	 * Persists delegation chains and tool counts to session/state.json,
	 * then updates the mtime-based cache.
	 */
	save(state: MinimalSwarmState): void {
		try {
			const snapshotPath = path.join(this.swarmDir, 'session', 'state.json');

			// Read existing snapshot to preserve fields we don't manage
			let existingSnapshot: Record<string, unknown> = {};
			try {
				if (existsSync(snapshotPath)) {
					existingSnapshot = JSON.parse(
						readFileSync(snapshotPath, 'utf-8'),
					) as Record<string, unknown>;
				}
			} catch {
				/* start fresh */
			}

			// Merge updated delegation chains and tool counts
			existingSnapshot.delegationChains = Object.fromEntries(
				state.delegationChains,
			);
			existingSnapshot.toolAggregates = Object.fromEntries(
				Array.from(state.toolCallCounts.entries()).map(([k, v]) => [
					k,
					{ totalCalls: v },
				]),
			);

			// Write back to session/state.json
			mkdirSync(path.dirname(snapshotPath), { recursive: true });
			writeFileSync(
				snapshotPath,
				JSON.stringify(existingSnapshot, null, 2),
				'utf-8',
			);

			// Update cache with new mtimes (after writing snapshot)
			const planPath = path.join(this.swarmDir, 'plan.json');
			const planMtime = this.getMtime(planPath);
			const snapshotMtime = this.getMtime(snapshotPath);
			this.persistCache(state, planMtime, snapshotMtime);
		} catch {
			/* non-fatal */
		}
	}

	/**
	 * Advance a task's workflow state.
	 * Validates forward-only transitions.
	 */
	advanceTaskWorkflowState(
		state: MinimalSwarmState,
		taskId: string,
		newWorkflowState: TaskState['workflowState'],
	): void {
		const STATE_ORDER: TaskState['workflowState'][] = [
			'idle',
			'coder_delegated',
			'pre_check_passed',
			'reviewer_run',
			'tests_run',
			'complete',
		];
		const existing = state.taskStates.get(taskId);
		const current = existing?.workflowState ?? 'idle';
		const currentIdx = STATE_ORDER.indexOf(current);
		const newIdx = STATE_ORDER.indexOf(newWorkflowState);
		if (newIdx <= currentIdx) return; // Already at or past this state

		state.taskStates.set(taskId, {
			id: taskId,
			status: existing?.status ?? 'in_progress',
			workflowState: newWorkflowState,
		});
	}

	/**
	 * Record a delegation in the chain for this session.
	 */
	recordDelegation(state: MinimalSwarmState, from: string, to: string): void {
		const chain = state.delegationChains.get(this.sessionId) ?? [];
		chain.push({ from, to, timestamp: Date.now() });
		state.delegationChains.set(this.sessionId, chain);
	}

	// ── Private helpers ────────────────────────────────────────────────────

	private getMtime(filePath: string): number {
		try {
			return statSync(filePath).mtimeMs;
		} catch {
			return 0;
		}
	}

	private tryLoadCache(
		planMtime: number,
		snapshotMtime: number,
	): MinimalSwarmState | null {
		try {
			if (!existsSync(this.cachePath)) return null;
			const raw = readFileSync(this.cachePath, 'utf-8');
			const cache = JSON.parse(raw) as StateCache;

			// Validate cache is still fresh (mtimes match)
			if (
				cache.planMtime !== planMtime ||
				cache.snapshotMtime !== snapshotMtime
			) {
				return null;
			}

			// Reconstruct Maps from serialized arrays
			return {
				taskStates: new Map(cache.state.taskStates),
				delegationChains: new Map(cache.state.delegationChains),
				toolCallCounts: new Map(cache.state.toolCallCounts),
				sessionId: this.sessionId,
				cwd: path.dirname(this.swarmDir),
			};
		} catch {
			return null;
		}
	}

	private coldLoad(
		planPath: string,
		snapshotPath: string,
		_planMtime: number,
		_snapshotMtime: number,
	): MinimalSwarmState {
		const state: MinimalSwarmState = {
			taskStates: new Map(),
			delegationChains: new Map(),
			toolCallCounts: new Map(),
			sessionId: this.sessionId,
			cwd: path.dirname(this.swarmDir),
		};

		// Load task states from plan.json
		try {
			if (existsSync(planPath)) {
				const planRaw = readFileSync(planPath, 'utf-8');
				const plan = JSON.parse(planRaw) as {
					phases?: Array<{
						tasks?: Array<{ id: string; status: string }>;
					}>;
				};
				for (const phase of plan.phases ?? []) {
					for (const task of phase.tasks ?? []) {
						const workflowState = this.statusToWorkflowState(task.status);
						state.taskStates.set(task.id, {
							id: task.id,
							status: task.status as TaskState['status'],
							workflowState,
						});
					}
				}
			}
		} catch {
			/* non-fatal — empty task states */
		}

		// Load delegation chains + tool counts from snapshot
		try {
			if (existsSync(snapshotPath)) {
				const snapshotRaw = readFileSync(snapshotPath, 'utf-8');
				const snapshot = JSON.parse(snapshotRaw) as {
					delegationChains?: Record<string, DelegationEntry[]>;
					toolAggregates?: Record<string, { totalCalls?: number }>;
				};

				// Restore delegation chains
				for (const [sessionId, chain] of Object.entries(
					snapshot.delegationChains ?? {},
				)) {
					state.delegationChains.set(sessionId, chain);
				}

				// Restore tool call counts
				for (const [tool, agg] of Object.entries(
					snapshot.toolAggregates ?? {},
				)) {
					state.toolCallCounts.set(tool, agg.totalCalls ?? 0);
				}
			}
		} catch {
			/* non-fatal — empty delegation chains */
		}

		return state;
	}

	private statusToWorkflowState(status: string): TaskState['workflowState'] {
		switch (status) {
			case 'completed':
				return 'complete';
			case 'in_progress':
				return 'coder_delegated';
			default:
				return 'idle';
		}
	}

	private persistCache(
		state: MinimalSwarmState,
		planMtime: number,
		snapshotMtime: number,
	): void {
		try {
			mkdirSync(this.swarmDir, { recursive: true });
			const cache: StateCache = {
				version: 1,
				loadedAt: Date.now(),
				planMtime,
				snapshotMtime,
				state: {
					taskStates: Array.from(state.taskStates.entries()),
					delegationChains: Array.from(state.delegationChains.entries()),
					toolCallCounts: Array.from(state.toolCallCounts.entries()),
				},
			};
			writeFileSync(this.cachePath, JSON.stringify(cache), 'utf-8');
		} catch {
			/* non-fatal */
		}
	}
}

/**
 * Factory function: create a StateBridge for a given session.
 */
export function createStateBridge(cwd: string, sessionId: string): StateBridge {
	return new StateBridge(cwd, sessionId);
}

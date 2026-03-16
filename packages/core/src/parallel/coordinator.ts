import {
	type DependencyGraph,
	getRunnableTasks,
	parseDependencyGraph,
	type TaskNode,
} from './dependency-graph.js';

/**
 * Execution plan with waves of tasks that can run in parallel
 */
export interface ExecutionPlan {
	/** Array of task waves (each wave can run in parallel) */
	waves: TaskNode[][];
	/** Estimated number of waves */
	estimatedWaves: number;
	/** Tasks that cannot be parallelized */
	serialFallbacks: string[];
}

/**
 * Handle for a dispatched agent task
 */
export interface AgentHandle {
	/** Task identifier */
	taskId: string;
	/** Agent name */
	agent: string;
	/** Worktree identifier for isolation */
	worktreeId?: string;
	/** Current execution status */
	status: 'pending' | 'running' | 'complete' | 'failed';
	/** Task result when complete */
	result?: unknown;
}

/**
 * Information about a file conflict between agents
 */
export interface ConflictInfo {
	/** Conflicting file path */
	file: string;
	/** Agents that touched this file */
	agents: string[];
	/** Type of conflict */
	type: 'edit_edit' | 'edit_delete' | 'delete_edit';
}

/**
 * Outcome of merging agent results
 */
export interface MergeOutcome {
	/** Whether merge was successful */
	success: boolean;
	/** File conflicts that occurred */
	conflicts: ConflictInfo[];
	/** Files that were successfully merged */
	mergedFiles: string[];
}

/**
 * Coordinator for parallel execution planning and dispatch
 */
export class ExecutionCoordinator {
	private swarmDir: string;

	constructor(swarmDir: string) {
		this.swarmDir = swarmDir;
	}

	/**
	 * Plan parallel execution by analyzing dependency graph and creating waves
	 */
	planParallelExecution(planPath: string): ExecutionPlan {
		// Use parseDependencyGraph to build dependency graph from plan file
		const graph = parseDependencyGraph(planPath);

		if (graph.tasks.size === 0) {
			return {
				waves: [],
				estimatedWaves: 0,
				serialFallbacks: [],
			};
		}

		// Build waves using topological approach with getRunnableTasks helper
		const waves: TaskNode[][] = [];
		const serialFallbacks: string[] = [];
		const assignedTasks = new Set<string>();

		// Create a working copy of the graph with all tasks marked as pending
		const workingGraph: DependencyGraph = {
			tasks: new Map(),
			phases: graph.phases,
			roots: graph.roots,
			leaves: graph.leaves,
		};

		// Copy tasks and reset status to pending for wave calculation
		// Also filter out malformed tasks (missing/invalid id, invalid depends)
		for (const [taskId, task] of graph.tasks) {
			// Skip tasks with missing or invalid IDs
			if (!taskId || typeof taskId !== 'string') {
				continue;
			}

			// Validate and normalize depends array
			// Filter to only valid strings that also exist in the task map
			let validDepends: string[] = [];
			if (Array.isArray(task.depends)) {
				const taskIdsInGraph = new Set(graph.tasks.keys());
				validDepends = task.depends.filter(
					(dep): dep is string =>
						typeof dep === 'string' &&
						dep.length > 0 &&
						taskIdsInGraph.has(dep),
				);
			}

			// Validate status
			const validStatus =
				task.status === 'pending' ||
				task.status === 'in_progress' ||
				task.status === 'complete' ||
				task.status === 'blocked'
					? task.status
					: 'pending';

			workingGraph.tasks.set(taskId, {
				...task,
				depends: validDepends,
				status: 'pending', // Reset to pending for wave calculation
			});
		}

		// If workingGraph has no valid tasks, return empty waves
		if (workingGraph.tasks.size === 0) {
			return {
				waves: [],
				estimatedWaves: 0,
				serialFallbacks: [],
			};
		}

		// Find circular dependencies for serial fallback identification
		// Use workingGraph to ensure we're working with validated task data
		const circularTasks = this.findCircularDependencies(workingGraph);

		// NOTE: We do NOT pre-filter tasks that depend on circular tasks.
		// Once circular tasks are marked complete (below), their dependents will
		// naturally become runnable through the normal wave processing.

		while (assignedTasks.size < workingGraph.tasks.size) {
			// Use getRunnableTasks to find tasks whose dependencies are satisfied
			const runnableIds = getRunnableTasks(workingGraph);

			// Filter to only unassigned runnable tasks that are not circular
			// (circular tasks are handled separately via serialFallbacks)
			const currentWaveTasks = runnableIds
				.filter((id) => !assignedTasks.has(id))
				.filter((id) => !circularTasks.has(id));

			if (currentWaveTasks.length === 0) {
				// No more runnable non-circular tasks - check for unassigned circular tasks
				// Tasks that merely depend on circular tasks are not added to serialFallbacks;
				// they will be handled after circular tasks are processed
				let hadUnassignedCircular = false;
				for (const taskId of circularTasks) {
					if (!assignedTasks.has(taskId)) {
						hadUnassignedCircular = true;
						if (!serialFallbacks.includes(taskId)) {
							serialFallbacks.push(taskId);
						}
						assignedTasks.add(taskId);
						// Mark as complete so dependent tasks can become runnable
						const workingTask = workingGraph.tasks.get(taskId);
						if (workingTask) {
							workingTask.status = 'complete';
						}
					}
				}
				// If we added circular tasks and marked them complete, continue processing
				// to handle tasks that depend on circular tasks through normal wave processing
				if (hadUnassignedCircular) {
					continue;
				}

				// No more progress possible - remaining tasks are blocked by something unsolvable
				break;
			}

			// Build the current wave from runnable tasks
			// Use shallow copy to avoid mutating wave tasks when updating workingGraph
			const currentWave: TaskNode[] = [];
			for (const taskId of currentWaveTasks) {
				const task = workingGraph.tasks.get(taskId);
				if (task) {
					currentWave.push({ ...task });
				}
			}

			// Sort by phase for consistent ordering within wave
			currentWave.sort((a, b) => a.phase - b.phase);
			waves.push(currentWave);

			// Mark tasks as assigned and update status for next wave calculation
			for (const task of currentWave) {
				assignedTasks.add(task.id);
				const workingTask = workingGraph.tasks.get(task.id);
				if (workingTask) {
					workingTask.status = 'complete';
				}
			}
		}

		// Check for any validated tasks that remain unscheduled
		const unscheduledTasks: string[] = [];
		for (const taskId of workingGraph.tasks.keys()) {
			if (!assignedTasks.has(taskId) && !serialFallbacks.includes(taskId)) {
				unscheduledTasks.push(taskId);
			}
		}

		// If there are unscheduled tasks, log them for visibility
		// In a production system, this might throw an error or return a warning
		if (unscheduledTasks.length > 0) {
			console.warn(
				`[ExecutionCoordinator] ${unscheduledTasks.length} validated task(s) could not be scheduled: ${unscheduledTasks.join(', ')}`,
			);
		}

		return {
			waves,
			estimatedWaves: waves.length,
			serialFallbacks,
		};
	}

	/**
	 * Find tasks involved in circular dependencies
	 */
	private findCircularDependencies(graph: DependencyGraph): Set<string> {
		const circular = new Set<string>();
		const visited = new Set<string>();
		const recursing = new Set<string>();

		const detectCycle = (taskId: string, path: string[]): boolean => {
			if (recursing.has(taskId)) {
				// Found a cycle - mark all tasks in the cycle as circular
				const cycleStart = path.indexOf(taskId);
				for (let i = cycleStart; i < path.length; i++) {
					circular.add(path[i]);
				}
				circular.add(taskId);
				return true;
			}

			if (visited.has(taskId)) {
				return false;
			}

			visited.add(taskId);
			recursing.add(taskId);

			const task = graph.tasks.get(taskId);
			if (task) {
				for (const depId of task.depends) {
					detectCycle(depId, [...path, taskId]);
				}
			}

			recursing.delete(taskId);
			return false;
		};

		for (const taskId of graph.tasks.keys()) {
			detectCycle(taskId, []);
		}

		return circular;
	}

	/**
	 * Dispatch an agent to execute a specific task
	 * @throws Error - Parallel execution not yet implemented
	 */
	dispatchAgent(
		taskId: string,
		agent: string,
		worktreeId?: string,
	): AgentHandle {
		throw new Error(
			'Parallel execution not yet implemented — see v7.3 roadmap',
		);
	}

	/**
	 * Wait for all dispatched agents to complete
	 * @throws Error - Parallel execution not yet implemented
	 */
	async awaitCompletion(handles: AgentHandle[]): Promise<void> {
		throw new Error(
			'Parallel execution not yet implemented — see v7.3 roadmap',
		);
	}

	/**
	 * Merge results from multiple agent executions
	 * @throws Error - Parallel execution not yet implemented
	 */
	async mergeResults(handles: AgentHandle[]): Promise<MergeOutcome> {
		throw new Error(
			'Parallel execution not yet implemented — see v7.3 roadmap',
		);
	}
}

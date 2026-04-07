export interface TaskNode {
    id: string;
    phase: number;
    description: string;
    depends: string[];
    dependents: string[];
    status: 'pending' | 'in_progress' | 'complete' | 'blocked';
}
export interface DependencyGraph {
    tasks: Map<string, TaskNode>;
    phases: Map<number, string[]>;
    roots: string[];
    leaves: string[];
}
/**
 * Parse plan.json and build dependency graph
 */
export declare function parseDependencyGraph(planPath: string): DependencyGraph;
/**
 * Get tasks that can run in parallel (no unresolved dependencies)
 */
export declare function getRunnableTasks(graph: DependencyGraph): string[];
/**
 * Check if a task is blocked (has incomplete dependencies)
 */
export declare function isTaskBlocked(graph: DependencyGraph, taskId: string): boolean;
/**
 * Get execution order (topological sort)
 */
export declare function getExecutionOrder(graph: DependencyGraph): string[];
/**
 * Find all paths from root to a task
 */
export declare function getDependencyChain(graph: DependencyGraph, taskId: string): string[];

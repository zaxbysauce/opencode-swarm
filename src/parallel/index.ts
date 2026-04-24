// Parallel execution framework for swarm tasks
export {
	EvidenceLockTimeoutError,
	withEvidenceLock,
} from '../evidence/lock.js';

export {
	type DependencyGraph,
	getDependencyChain,
	getExecutionOrder,
	getRunnableTasks,
	isTaskBlocked,
	parseDependencyGraph,
	type TaskNode,
} from './dependency-graph.js';
export {
	cleanupExpiredLocks,
	type FileLock,
	isLocked,
	listActiveLocks,
	releaseLock,
	tryAcquireLock,
} from './file-locks.js';
export {
	extractMetaSummaries,
	getLatestTaskSummary,
	indexMetaSummaries,
	type MetaSummaryEntry,
	querySummaries,
} from './meta-indexer.js';
export {
	type ComplexityMetrics,
	computeComplexity,
	type ReviewDepth,
	type ReviewRouting,
	routeReview,
	routeReviewForChanges,
	shouldParallelizeReview,
} from './review-router.js';

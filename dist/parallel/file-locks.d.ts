export interface FileLock {
    filePath: string;
    agent: string;
    taskId: string;
    timestamp: string;
    expiresAt: number;
    _release?: () => Promise<void>;
}
/**
 * Try to acquire a lock on a file using proper-lockfile
 */
export declare function tryAcquireLock(directory: string, filePath: string, agent: string, taskId: string): Promise<{
    acquired: true;
    lock: FileLock;
} | {
    acquired: false;
    existing?: FileLock;
}>;
/**
 * Release a lock on a file.
 *
 * The preferred release path is `lockResult.lock._release()` at the call site.
 * This function is kept for API compatibility but is a no-op: callers that
 * stored a proper-lockfile release function on `lock._release` should call
 * that directly.  Callers that do not have the release function (e.g. tests
 * that write lock sentinel files by hand) can ignore the return value.
 */
export declare function releaseLock(_directory: string, _filePath: string, _taskId: string): Promise<boolean>;
/**
 * Check if a file is locked
 */
export declare function isLocked(directory: string, filePath: string): FileLock | null;
/**
 * Clean up expired locks
 */
export declare function cleanupExpiredLocks(directory: string): number;
/**
 * List all active locks
 */
export declare function listActiveLocks(directory: string): FileLock[];

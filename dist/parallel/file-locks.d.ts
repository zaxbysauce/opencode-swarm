export interface FileLock {
    filePath: string;
    agent: string;
    taskId: string;
    timestamp: string;
    expiresAt: number;
}
/**
 * Try to acquire a lock on a file
 */
export declare function tryAcquireLock(directory: string, filePath: string, agent: string, taskId: string): {
    acquired: true;
    lock: FileLock;
} | {
    acquired: false;
    existing?: FileLock;
};
/**
 * Release a lock on a file
 */
export declare function releaseLock(directory: string, filePath: string, taskId: string): boolean;
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

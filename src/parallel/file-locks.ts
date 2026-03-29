import * as fs from 'node:fs';
import * as path from 'node:path';

const LOCKS_DIR = '.swarm/locks';
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface FileLock {
	filePath: string;
	agent: string;
	taskId: string;
	timestamp: string;
	expiresAt: number;
}

/**
 * Get lock file path for a file
 */
function getLockFilePath(directory: string, filePath: string): string {
	// Normalize path before validation to handle relative segments
	const normalized = path.resolve(directory, filePath);

	// Validate path to prevent traversal attacks
	if (!normalized.startsWith(path.resolve(directory))) {
		throw new Error('Invalid file path: path traversal not allowed');
	}

	// Hash the normalized file path to create a safe lock filename
	const hash = Buffer.from(normalized)
		.toString('base64')
		.replace(/[/+=]/g, '_');
	return path.join(directory, LOCKS_DIR, `${hash}.lock`);
}

/**
 * Try to acquire a lock on a file
 */
export function tryAcquireLock(
	directory: string,
	filePath: string,
	agent: string,
	taskId: string,
):
	| { acquired: true; lock: FileLock }
	| { acquired: false; existing?: FileLock } {
	const lockPath = getLockFilePath(directory, filePath);
	const locksDir = path.dirname(lockPath);

	// Ensure locks directory exists
	if (!fs.existsSync(locksDir)) {
		fs.mkdirSync(locksDir, { recursive: true });
	}

	// Check if lock exists and is not expired
	if (fs.existsSync(lockPath)) {
		try {
			const existingLock: FileLock = JSON.parse(
				fs.readFileSync(lockPath, 'utf-8'),
			);

			// Check if expired
			if (Date.now() > existingLock.expiresAt) {
				// Lock expired, remove it
				fs.unlinkSync(lockPath);
			} else {
				// Lock is still valid
				return { acquired: false, existing: existingLock };
			}
		} catch {
			// Corrupted lock file, remove it
			fs.unlinkSync(lockPath);
		}
	}

	// Create new lock
	const lock: FileLock = {
		filePath,
		agent,
		taskId,
		timestamp: new Date().toISOString(),
		expiresAt: Date.now() + LOCK_TIMEOUT_MS,
	};

	// Write atomically using temp file
	const tempPath = `${lockPath}.tmp`;
	fs.writeFileSync(tempPath, JSON.stringify(lock, null, 2), 'utf-8');
	fs.renameSync(tempPath, lockPath);

	return { acquired: true, lock };
}

/**
 * Release a lock on a file
 */
export function releaseLock(
	directory: string,
	filePath: string,
	taskId: string,
): boolean {
	const lockPath = getLockFilePath(directory, filePath);

	if (!fs.existsSync(lockPath)) {
		return true; // Already released
	}

	try {
		const lock: FileLock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));

		// Only release if owned by the same task
		if (lock.taskId === taskId) {
			fs.unlinkSync(lockPath);
			return true;
		}

		return false; // Not the owner
	} catch {
		// Corrupted lock, remove it
		fs.unlinkSync(lockPath);
		return true;
	}
}

/**
 * Check if a file is locked
 */
export function isLocked(directory: string, filePath: string): FileLock | null {
	const lockPath = getLockFilePath(directory, filePath);

	if (!fs.existsSync(lockPath)) {
		return null;
	}

	try {
		const lock: FileLock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));

		// Check if expired
		if (Date.now() > lock.expiresAt) {
			fs.unlinkSync(lockPath);
			return null;
		}

		return lock;
	} catch {
		// Corrupted lock
		fs.unlinkSync(lockPath);
		return null;
	}
}

/**
 * Clean up expired locks
 */
export function cleanupExpiredLocks(directory: string): number {
	const locksDir = path.join(directory, LOCKS_DIR);

	if (!fs.existsSync(locksDir)) {
		return 0;
	}

	let cleaned = 0;
	const files = fs.readdirSync(locksDir);

	for (const file of files) {
		if (!file.endsWith('.lock')) continue;

		const lockPath = path.join(locksDir, file);

		try {
			const lock: FileLock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));

			if (Date.now() > lock.expiresAt) {
				fs.unlinkSync(lockPath);
				cleaned++;
			}
		} catch {
			// Corrupted, remove it
			fs.unlinkSync(lockPath);
			cleaned++;
		}
	}

	return cleaned;
}

/**
 * List all active locks
 */
export function listActiveLocks(directory: string): FileLock[] {
	const locksDir = path.join(directory, LOCKS_DIR);
	const locks: FileLock[] = [];

	if (!fs.existsSync(locksDir)) {
		return locks;
	}

	const files = fs.readdirSync(locksDir);

	for (const file of files) {
		if (!file.endsWith('.lock')) continue;

		const lockPath = path.join(locksDir, file);

		try {
			const lock: FileLock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));

			if (Date.now() <= lock.expiresAt) {
				locks.push(lock);
			} else {
				fs.unlinkSync(lockPath);
			}
		} catch {
			fs.unlinkSync(lockPath);
		}
	}

	return locks;
}

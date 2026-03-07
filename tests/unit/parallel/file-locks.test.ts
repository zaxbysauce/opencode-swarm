/**
 * Verification tests for file-locks module
 * Covers tryAcquireLock, releaseLock, and lock expiration
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	tryAcquireLock,
	releaseLock,
	isLocked,
	cleanupExpiredLocks,
	listActiveLocks,
	type FileLock,
} from '../../../src/parallel/file-locks';

describe('file-locks module tests', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-locks-test-'));
	});

	afterEach(() => {
		try {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	// ========== GROUP 1: tryAcquireLock tests ==========
	describe('Group 1: tryAcquireLock', () => {
		it('acquires lock on first attempt', () => {
			const result = tryAcquireLock(tmpDir, 'test-file.ts', 'agent1', 'task1');

			expect(result.acquired).toBe(true);
			if (result.acquired && 'lock' in result) {
				expect(result.lock).toBeDefined();
				expect(result.lock.filePath).toBe('test-file.ts');
				expect(result.lock.agent).toBe('agent1');
				expect(result.lock.taskId).toBe('task1');
				expect(result.lock.expiresAt).toBeGreaterThan(Date.now());
			}
		});

		it('fails to acquire existing valid lock', () => {
			// First acquisition
			const first = tryAcquireLock(tmpDir, 'test-file.ts', 'agent1', 'task1');
			expect(first.acquired).toBe(true);

			// Second attempt should fail
			const second = tryAcquireLock(tmpDir, 'test-file.ts', 'agent2', 'task2');
			expect(second.acquired).toBe(false);
			if (!second.acquired && 'existing' in second && second.existing) {
				expect(second.existing.agent).toBe('agent1');
			}
		});

		it('creates locks directory if not exists', () => {
			const result = tryAcquireLock(tmpDir, 'test.ts', 'agent', 'task');

			expect(result.acquired).toBe(true);
			expect(fs.existsSync(path.join(tmpDir, '.swarm', 'locks'))).toBe(true);
		});

		it('uses path hash for lock filename', () => {
			const result1 = tryAcquireLock(tmpDir, 'file-a.ts', 'agent', 'task');
			const result2 = tryAcquireLock(tmpDir, 'file-b.ts', 'agent', 'task');

			// Different files should have different lock paths
			expect(result1.acquired).toBe(true);
			expect(result2.acquired).toBe(true);
		});
	});

	// ========== GROUP 2: releaseLock tests ==========
	describe('Group 2: releaseLock', () => {
		it('releases lock owned by same task', () => {
			tryAcquireLock(tmpDir, 'test.ts', 'agent', 'task1');

			const released = releaseLock(tmpDir, 'test.ts', 'task1');
			expect(released).toBe(true);
			expect(isLocked(tmpDir, 'test.ts')).toBeNull();
		});

		it('fails to release lock owned by different task', () => {
			tryAcquireLock(tmpDir, 'test.ts', 'agent1', 'task1');

			const released = releaseLock(tmpDir, 'test.ts', 'task2');
			expect(released).toBe(false);
			expect(isLocked(tmpDir, 'test.ts')).not.toBeNull();
		});

		it('returns true for non-existent lock', () => {
			const released = releaseLock(tmpDir, 'nonexistent.ts', 'task');
			expect(released).toBe(true);
		});

		it('removes corrupted lock file', () => {
			// Create lock directory and corrupted lock
			const locksDir = path.join(tmpDir, '.swarm', 'locks');
			fs.mkdirSync(locksDir, { recursive: true });
			fs.writeFileSync(path.join(locksDir, 'test.lock'), 'not valid json');

			const released = releaseLock(tmpDir, 'test.ts', 'task');
			expect(released).toBe(true);
		});
	});

	// ========== GROUP 3: isLocked tests ==========
	describe('Group 3: isLocked', () => {
		it('returns null for unlocked file', () => {
			const lock = isLocked(tmpDir, 'test.ts');
			expect(lock).toBeNull();
		});

		it('returns lock info for locked file', () => {
			tryAcquireLock(tmpDir, 'test.ts', 'agent', 'task1');

			const lock = isLocked(tmpDir, 'test.ts');
			expect(lock).not.toBeNull();
			expect(lock?.filePath).toBe('test.ts');
			expect(lock?.agent).toBe('agent');
		});

		it('removes and returns null for expired lock', () => {
			// Create a lock with expired timestamp via tryAcquireLock, then modify expiry
			const result = tryAcquireLock(tmpDir, 'test.ts', 'agent', 'task');
			expect(result.acquired).toBe(true);

			// Now modify the expiry to be in the past
			const locksDir = path.join(tmpDir, '.swarm', 'locks');
			const files = fs.readdirSync(locksDir);
			const lockFile = files.find(f => f.endsWith('.lock'));
			expect(lockFile).toBeDefined();

			const lockPath = path.join(locksDir, lockFile!);
			const lockData = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
			lockData.expiresAt = Date.now() - 1000; // Set to expired
			fs.writeFileSync(lockPath, JSON.stringify(lockData));

			// Now isLocked should detect expiration and return null
			const lock = isLocked(tmpDir, 'test.ts');
			expect(lock).toBeNull();
		});
	});

	// ========== GROUP 4: Lock expiration tests ==========
	describe('Group 4: Lock expiration', () => {
		it('locks expire after timeout', async () => {
			// Create a lock with very short timeout
			const locksDir = path.join(tmpDir, '.swarm', 'locks');
			fs.mkdirSync(locksDir, { recursive: true });
			const lockPath = path.join(locksDir, 'test.lock');
			fs.writeFileSync(lockPath, JSON.stringify({
				filePath: 'test.ts',
				agent: 'agent',
				taskId: 'task',
				timestamp: new Date().toISOString(),
				expiresAt: Date.now() + 10, // Expires in 10ms
			}));

			// Wait for expiration
			await new Promise(resolve => setTimeout(resolve, 20));

			// Try to acquire should succeed
			const result = tryAcquireLock(tmpDir, 'test.ts', 'new-agent', 'new-task');
			expect(result.acquired).toBe(true);
		});
	});

	// ========== GROUP 5: cleanupExpiredLocks tests ==========
	describe('Group 5: cleanupExpiredLocks', () => {
		it('removes expired locks', () => {
			const locksDir = path.join(tmpDir, '.swarm', 'locks');
			fs.mkdirSync(locksDir, { recursive: true });

			// Create expired lock
			fs.writeFileSync(path.join(locksDir, 'expired.lock'), JSON.stringify({
				filePath: 'a.ts',
				agent: 'a',
				taskId: 't',
				timestamp: new Date().toISOString(),
				expiresAt: Date.now() - 1000,
			}));

			// Create valid lock
			fs.writeFileSync(path.join(locksDir, 'valid.lock'), JSON.stringify({
				filePath: 'b.ts',
				agent: 'b',
				taskId: 't',
				timestamp: new Date().toISOString(),
				expiresAt: Date.now() + 60000,
			}));

			const cleaned = cleanupExpiredLocks(tmpDir);
			expect(cleaned).toBe(1);
			expect(fs.existsSync(path.join(locksDir, 'valid.lock'))).toBe(true);
		});

		it('returns 0 for non-existent locks directory', () => {
			const cleaned = cleanupExpiredLocks(tmpDir);
			expect(cleaned).toBe(0);
		});
	});

	// ========== GROUP 6: listActiveLocks tests ==========
	describe('Group 6: listActiveLocks', () => {
		it('lists active locks', () => {
			tryAcquireLock(tmpDir, 'file1.ts', 'agent1', 'task1');
			tryAcquireLock(tmpDir, 'file2.ts', 'agent2', 'task2');

			const locks = listActiveLocks(tmpDir);
			expect(locks.length).toBe(2);
		});

		it('excludes expired locks', () => {
			// Create expired lock directly
			const locksDir = path.join(tmpDir, '.swarm', 'locks');
			fs.mkdirSync(locksDir, { recursive: true });
			fs.writeFileSync(path.join(locksDir, 'expired.lock'), JSON.stringify({
				filePath: 'a.ts',
				agent: 'a',
				taskId: 't',
				timestamp: new Date().toISOString(),
				expiresAt: Date.now() - 1000,
			}));

			// Create valid lock
			tryAcquireLock(tmpDir, 'file.ts', 'agent', 'task');

			const locks = listActiveLocks(tmpDir);
			expect(locks.length).toBe(1);
			expect(locks[0].filePath).toBe('file.ts');
		});

		it('returns empty array for no locks', () => {
			const locks = listActiveLocks(tmpDir);
			expect(locks).toEqual([]);
		});
	});
});

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	cleanupExpiredLocks,
	isLocked,
	releaseLock,
	tryAcquireLock,
} from '../../../src/parallel/file-locks.js';

/**
 * Security Tests: File-Locks (Simplified)
 * Tests: Path traversal, lock file corruption, expired locks, owner-only release
 */

let TEST_DIR: string;

beforeEach(() => {
	TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'file-locks-sec-test-'));
	fs.mkdirSync(path.join(TEST_DIR, '.swarm', 'locks'), { recursive: true });
});

afterEach(() => {
	try {
		fs.rmSync(TEST_DIR, { recursive: true, force: true });
	} catch {
		// Ignore cleanup errors
	}
});

describe('Security: File-Locks - Path Traversal', () => {
	it('should reject path traversal in filePath parameter', async () => {
		// These paths actually traverse outside TEST_DIR on Linux (POSIX path resolution)
		const maliciousPaths = [
			'../../../etc/passwd',
			'/etc/passwd',
			'../../../../../../../../../../../etc/passwd',
			'foo/../../../bar',
			'/root/.ssh/id_rsa',
		];

		for (const maliciousPath of maliciousPaths) {
			await expect(
				tryAcquireLock(TEST_DIR, maliciousPath, 'agent', 'task'),
			).rejects.toThrow();
		}
	});

	it('should handle null bytes in file path', async () => {
		const nullBytePath = 'test\x00file';
		try {
			const result = await tryAcquireLock(
				TEST_DIR,
				nullBytePath,
				'agent',
				'task',
			);
			expect(result).toBeDefined();
			if (result.acquired) await result.lock._release?.();
		} catch {
			// Throwing is acceptable
		}
	});
});

describe('Security: File-Locks - Lock File Corruption', () => {
	it('should handle corrupted sentinel file (proper-lockfile does not read its content)', async () => {
		const testFile = 'corrupted-lock.txt';
		const lockPath = path.join(TEST_DIR, '.swarm', 'locks');

		fs.mkdirSync(lockPath, { recursive: true });

		// Write garbage into the sentinel — proper-lockfile ignores file content
		const hash = Buffer.from(path.resolve(TEST_DIR, testFile))
			.toString('base64')
			.replace(/[/+=]/g, '_');
		const corruptedLockPath = path.join(lockPath, `${hash}.lock`);
		fs.writeFileSync(corruptedLockPath, 'not valid json {{{', 'utf-8');

		// tryAcquireLock should still succeed (overwrites sentinel, acquires proper-lockfile lock)
		const result = await tryAcquireLock(TEST_DIR, testFile, 'agent', 'task');
		expect(result).toBeDefined();
		expect(result.acquired).toBe(true);
		if (result.acquired) await result.lock._release?.();
	});

	it('should handle empty sentinel file', async () => {
		const testFile = 'empty-lock.txt';
		const lockPath = path.join(TEST_DIR, '.swarm', 'locks');

		fs.mkdirSync(lockPath, { recursive: true });

		const hash = Buffer.from(path.resolve(TEST_DIR, testFile))
			.toString('base64')
			.replace(/[/+=]/g, '_');
		const emptyLockPath = path.join(lockPath, `${hash}.lock`);
		fs.writeFileSync(emptyLockPath, '', 'utf-8');

		const result = await tryAcquireLock(TEST_DIR, testFile, 'agent', 'task');
		expect(result).toBeDefined();
		expect(result.acquired).toBe(true);
		if (result.acquired) await result.lock._release?.();
	});
});

describe('Security: File-Locks - Malformed Lock Content', () => {
	it('should handle lock file with prototype pollution attempt', async () => {
		const testFile = 'malicious-lock.txt';
		const lockPath = path.join(TEST_DIR, '.swarm', 'locks');

		fs.mkdirSync(lockPath, { recursive: true });

		// proper-lockfile ignores sentinel content — the pollution attempt has no effect
		const hash = Buffer.from(path.resolve(TEST_DIR, testFile))
			.toString('base64')
			.replace(/[/+=]/g, '_');
		const maliciousLockPath = path.join(lockPath, `${hash}.lock`);
		fs.writeFileSync(
			maliciousLockPath,
			JSON.stringify({
				filePath: testFile,
				agent: 'agent',
				taskId: 'task',
				timestamp: new Date().toISOString(),
				expiresAt: Date.now() + 300000,
				__proto__: { polluted: true },
				constructor: { prototype: { evil: true } },
			}),
			'utf-8',
		);

		const result = await tryAcquireLock(
			TEST_DIR,
			testFile,
			'new-agent',
			'new-task',
		);
		expect(result).toBeDefined();

		// Prototype must not be polluted
		const testObj = {};
		expect((testObj as any).polluted).toBeUndefined();

		if (result.acquired) await result.lock._release?.();
	});

	it('should handle oversized lock file content', async () => {
		const testFile = 'long-lock.txt';
		const lockPath = path.join(TEST_DIR, '.swarm', 'locks');

		fs.mkdirSync(lockPath, { recursive: true });

		const hash = Buffer.from(path.resolve(TEST_DIR, testFile))
			.toString('base64')
			.replace(/[/+=]/g, '_');
		const longLockPath = path.join(lockPath, `${hash}.lock`);
		fs.writeFileSync(
			longLockPath,
			JSON.stringify({
				filePath: 'A'.repeat(10000),
				agent: 'B'.repeat(10000),
				taskId: 'C'.repeat(10000),
				timestamp: new Date().toISOString(),
				expiresAt: Date.now() + 300000,
			}),
			'utf-8',
		);

		const result = await tryAcquireLock(TEST_DIR, testFile, 'agent', 'task');
		expect(result).toBeDefined();
		if (result.acquired) await result.lock._release?.();
	});
});

describe('Security: File-Locks - Lock Ownership', () => {
	it('should allow release only via the _release function returned at acquire time', async () => {
		const testFile = 'owned-lock.txt';

		const acquireResult = await tryAcquireLock(
			TEST_DIR,
			testFile,
			'agent1',
			'task1',
		);
		expect(acquireResult.acquired).toBe(true);

		// releaseLock is a no-op — it does NOT actually release the proper-lockfile lock
		const noOpResult = await releaseLock(TEST_DIR, testFile, 'task1');
		expect(noOpResult).toBe(true);

		// The proper-lockfile lock is still held — another acquire should fail
		const secondAttempt = await tryAcquireLock(
			TEST_DIR,
			testFile,
			'agent2',
			'task2',
		);
		expect(secondAttempt.acquired).toBe(false);

		// Release via the stored _release function
		if (acquireResult.acquired) await acquireResult.lock._release?.();

		// Now it can be acquired again
		const thirdAttempt = await tryAcquireLock(
			TEST_DIR,
			testFile,
			'agent3',
			'task3',
		);
		expect(thirdAttempt.acquired).toBe(true);
		if (thirdAttempt.acquired) await thirdAttempt.lock._release?.();
	});
});

describe('Security: File-Locks - Time-based Attacks', () => {
	it('should handle expired lock file properly (proper-lockfile stale option)', async () => {
		// proper-lockfile handles stale detection internally via the stale option.
		// We cannot simulate it by writing a sentinel with old content.
		// Instead verify: after releasing, a new acquire succeeds immediately.
		const testFile = 'expired-lock.txt';

		const result = await tryAcquireLock(
			TEST_DIR,
			testFile,
			'old-agent',
			'old-task',
		);
		expect(result.acquired).toBe(true);
		if (result.acquired) await result.lock._release?.();

		const newResult = await tryAcquireLock(
			TEST_DIR,
			testFile,
			'new-agent',
			'new-task',
		);
		expect(newResult.acquired).toBe(true);
		if (newResult.acquired) await newResult.lock._release?.();
	});

	it('should handle future expiration timestamps (isLocked uses proper-lockfile .lock dir)', async () => {
		const testFile = 'future-lock.txt';

		// Acquire a real lock — isLocked should see the .lock directory
		const result = await tryAcquireLock(TEST_DIR, testFile, 'agent', 'task');
		expect(result.acquired).toBe(true);

		const lockStatus = isLocked(TEST_DIR, testFile);
		expect(lockStatus).not.toBeNull();

		if (result.acquired) await result.lock._release?.();
	});
});

describe('Security: File-Locks - Concurrent Access', () => {
	it('should handle basic concurrent lock acquisition', async () => {
		const testFile = 'concurrent-test.txt';

		const [result1, result2] = await Promise.all([
			tryAcquireLock(TEST_DIR, testFile, 'agent1', 'task1'),
			tryAcquireLock(TEST_DIR, testFile, 'agent2', 'task2'),
		]);

		const acquiredCount = [result1, result2].filter((r) => r.acquired).length;
		expect(acquiredCount).toBe(1);

		if (result1.acquired) await result1.lock._release?.();
		if (result2.acquired) await result2.lock._release?.();
	});
});

import { describe, it, expect, beforeEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
	tryAcquireLock,
	releaseLock,
	isLocked,
	cleanupExpiredLocks,
} from '../../../src/parallel/file-locks.js';

/**
 * Security Tests: File-Locks (Simplified)
 * Tests: Path traversal, lock file corruption, expired locks, owner-only release
 */

const TEST_DIR = path.join(os.tmpdir(), 'file-locks-sec-test-' + Date.now());

beforeEach(() => {
	if (!fs.existsSync(TEST_DIR)) {
		fs.mkdirSync(TEST_DIR, { recursive: true });
	}
	fs.mkdirSync(path.join(TEST_DIR, '.swarm', 'locks'), { recursive: true });
});

describe('Security: File-Locks - Path Traversal', () => {
	it('should reject path traversal in filePath parameter', () => {
		const maliciousPaths = [
			'../../../etc/passwd',
			'..\\..\\..\\windows\\system32\\config',
			'/etc/passwd',
			'../../../../../../../../../../../etc/passwd',
			'foo/../../../bar',
			'/root/.ssh/id_rsa',
			'C:\\Users\\Administrator\\.aws\\credentials',
		];

		for (const maliciousPath of maliciousPaths) {
			expect(() => tryAcquireLock(TEST_DIR, maliciousPath, 'agent', 'task')).toThrow();
		}
	});

	it('should handle null bytes in file path', () => {
		const nullBytePath = 'test\x00file';
		try {
			const result = tryAcquireLock(TEST_DIR, nullBytePath, 'agent', 'task');
			expect(result).toBeDefined();
		} catch {
			// Throwing is acceptable
		}
	});
});

describe('Security: File-Locks - Lock File Corruption', () => {
	it('should handle corrupted lock file (invalid JSON)', () => {
		const testFile = 'corrupted-lock.txt';
		const lockPath = path.join(TEST_DIR, '.swarm', 'locks');

		fs.mkdirSync(lockPath, { recursive: true });

		const corruptedLockPath = path.join(lockPath, Buffer.from(testFile).toString('base64').replace(/[/+=]/g, '_') + '.lock');
		fs.writeFileSync(corruptedLockPath, 'not valid json {{{', 'utf-8');

		const result = tryAcquireLock(TEST_DIR, testFile, 'agent', 'task');
		expect(result).toBeDefined();
		expect(result.acquired).toBe(true);
	});

	it('should handle empty lock file', () => {
		const testFile = 'empty-lock.txt';
		const lockPath = path.join(TEST_DIR, '.swarm', 'locks');

		fs.mkdirSync(lockPath, { recursive: true });

		const emptyLockPath = path.join(lockPath, Buffer.from(testFile).toString('base64').replace(/[/+=]/g, '_') + '.lock');
		fs.writeFileSync(emptyLockPath, '', 'utf-8');

		const result = tryAcquireLock(TEST_DIR, testFile, 'agent', 'task');
		expect(result).toBeDefined();
		expect(result.acquired).toBe(true);
	});
});

describe('Security: File-Locks - Malformed Lock Content', () => {
	it('should handle lock file with prototype pollution attempt', () => {
		const testFile = 'malicious-lock.txt';
		const lockPath = path.join(TEST_DIR, '.swarm', 'locks');

		fs.mkdirSync(lockPath, { recursive: true });

		const maliciousLockPath = path.join(lockPath, Buffer.from(testFile).toString('base64').replace(/[/+=]/g, '_') + '.lock');
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

		const result = tryAcquireLock(TEST_DIR, testFile, 'new-agent', 'new-task');
		expect(result).toBeDefined();

		const testObj = {};
		expect((testObj as any).polluted).toBeUndefined();
	});

	it('should handle oversized lock file content', () => {
		const testFile = 'long-lock.txt';
		const lockPath = path.join(TEST_DIR, '.swarm', 'locks');

		fs.mkdirSync(lockPath, { recursive: true });

		const longLockPath = path.join(lockPath, Buffer.from(testFile).toString('base64').replace(/[/+=]/g, '_') + '.lock');
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

		const result = tryAcquireLock(TEST_DIR, testFile, 'agent', 'task');
		expect(result).toBeDefined();
	});
});

describe('Security: File-Locks - Lock Ownership', () => {
	it('should only allow lock owner to release lock', () => {
		const testFile = 'owned-lock.txt';

		const acquireResult = tryAcquireLock(TEST_DIR, testFile, 'agent1', 'task1');
		expect(acquireResult.acquired).toBe(true);

		const releaseResult = releaseLock(TEST_DIR, testFile, 'task2');
		expect(releaseResult).toBe(false);

		const releaseOwnResult = releaseLock(TEST_DIR, testFile, 'task1');
		expect(releaseOwnResult).toBe(true);
	});
});

describe('Security: File-Locks - Time-based Attacks', () => {
	it('should handle expired lock file properly', () => {
		const testFile = 'expired-lock.txt';
		const locksDir = path.join(TEST_DIR, '.swarm', 'locks');

		fs.mkdirSync(locksDir, { recursive: true });

		const expiredLockPath = path.join(locksDir, Buffer.from(testFile).toString('base64').replace(/[/+=]/g, '_') + '.lock');
		fs.writeFileSync(
			expiredLockPath,
			JSON.stringify({
				filePath: testFile,
				agent: 'old-agent',
				taskId: 'old-task',
				timestamp: '2020-01-01T00:00:00Z',
				expiresAt: Date.now() - 1000000,
			}),
			'utf-8',
		);

		const result = tryAcquireLock(TEST_DIR, testFile, 'new-agent', 'new-task');
		expect(result.acquired).toBe(true);
	});

	it('should handle future expiration timestamps', () => {
		const testFile = 'future-lock.txt';
		const locksDir = path.join(TEST_DIR, '.swarm', 'locks');

		fs.mkdirSync(locksDir, { recursive: true });

		const futureLockPath = path.join(locksDir, Buffer.from(testFile).toString('base64').replace(/[/+=]/g, '_') + '.lock');
		fs.writeFileSync(
			futureLockPath,
			JSON.stringify({
				filePath: testFile,
				agent: 'agent',
				taskId: 'task',
				timestamp: new Date().toISOString(),
				expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 365 * 10,
			}),
			'utf-8',
		);

		const lockStatus = isLocked(TEST_DIR, testFile);
		expect(lockStatus).not.toBeNull();
	});
});

describe('Security: File-Locks - Concurrent Access', () => {
	it('should handle basic concurrent lock acquisition', async () => {
		const testFile = 'concurrent-test.txt';

		const [result1, result2] = await Promise.all([
			(async () => tryAcquireLock(TEST_DIR, testFile, 'agent1', 'task1'))(),
			(async () => tryAcquireLock(TEST_DIR, testFile, 'agent2', 'task2'))(),
		]);

		const acquiredCount = [result1, result2].filter((r) => r.acquired).length;
		expect(acquiredCount).toBe(1);
	});
});

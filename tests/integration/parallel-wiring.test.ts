import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	isLocked,
	releaseLock,
	tryAcquireLock,
} from '../../src/parallel/file-locks';
import {
	type ComplexityMetrics,
	routeReview,
	shouldParallelizeReview,
} from '../../src/parallel/review-router';

describe('file lock integration', () => {
	const tmpDir = path.join(os.tmpdir(), `lock-test-${Date.now()}`);

	test('tryAcquireLock acquires and releaseLock releases', async () => {
		const result = await tryAcquireLock(
			tmpDir,
			'plan.json',
			'architect',
			'task-1',
		);
		expect(result.acquired).toBe(true);
		if (result.acquired) {
			await (
				result.lock as unknown as { _release: () => Promise<void> }
			)._release();
		}
		expect(isLocked(tmpDir, 'plan.json')).toBeNull();
	});

	test('concurrent writes are serialized via locks', async () => {
		const result1 = await tryAcquireLock(
			tmpDir,
			'plan.json',
			'architect',
			'task-a',
		);
		expect(result1.acquired).toBe(true);
		const result2 = await tryAcquireLock(
			tmpDir,
			'plan.json',
			'coder',
			'task-b',
		);
		expect(result2.acquired).toBe(false);
		if (result1.acquired) {
			await (
				result1.lock as unknown as { _release: () => Promise<void> }
			)._release();
		}
	});

	test('lock is released even on write failure', async () => {
		const result = await tryAcquireLock(
			tmpDir,
			'test.json',
			'architect',
			'task-c',
		);
		expect(result.acquired).toBe(true);
		try {
			throw new Error('simulated write failure');
		} catch {
			// simulated failure
		} finally {
			if (result.acquired) {
				await (
					result.lock as unknown as { _release: () => Promise<void> }
				)._release();
			}
		}
		expect(isLocked(tmpDir, 'test.json')).toBeNull();
	});
});

describe('review router integration', () => {
	test('shouldParallelizeReview is true for high complexity', () => {
		const metrics: ComplexityMetrics = {
			fileCount: 10,
			functionCount: 20,
			astChangeCount: 50,
			maxFileComplexity: 20,
		};
		const routing = routeReview(metrics);
		expect(shouldParallelizeReview(routing)).toBe(true);
		expect(routing.depth).toBe('double');
		expect(routing.reviewerCount).toBe(2);
	});

	test('shouldParallelizeReview is false for low complexity', () => {
		const metrics: ComplexityMetrics = {
			fileCount: 2,
			functionCount: 3,
			astChangeCount: 5,
			maxFileComplexity: 3,
		};
		const routing = routeReview(metrics);
		expect(shouldParallelizeReview(routing)).toBe(false);
		expect(routing.depth).toBe('single');
	});
});

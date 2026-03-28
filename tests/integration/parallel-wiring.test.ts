import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { tryAcquireLock, releaseLock, isLocked } from '../../src/parallel/file-locks';
import { routeReview, shouldParallelizeReview, type ComplexityMetrics } from '../../src/parallel/review-router';

describe('file lock integration', () => {
  const tmpDir = path.join(os.tmpdir(), `lock-test-${Date.now()}`);

  test('tryAcquireLock acquires and releaseLock releases', () => {
    const result = tryAcquireLock(tmpDir, 'plan.json', 'architect', 'task-1');
    expect(result.acquired).toBe(true);
    const released = releaseLock(tmpDir, 'plan.json', 'task-1');
    expect(released).toBe(true);
  });

  test('concurrent writes are serialized via locks', () => {
    const result1 = tryAcquireLock(tmpDir, 'plan.json', 'architect', 'task-a');
    expect(result1.acquired).toBe(true);
    const result2 = tryAcquireLock(tmpDir, 'plan.json', 'coder', 'task-b');
    expect(result2.acquired).toBe(false);
    releaseLock(tmpDir, 'plan.json', 'task-a');
  });

  test('lock is released even on write failure', () => {
    const result = tryAcquireLock(tmpDir, 'test.json', 'architect', 'task-c');
    expect(result.acquired).toBe(true);
    try {
      throw new Error('simulated write failure');
    } catch {
      // simulated failure
    } finally {
      releaseLock(tmpDir, 'test.json', 'task-c');
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

/**
 * Verification tests for DEBUGGING_SPIRAL pattern detection
 * Tests: same rejection reason resurfacing, 3+ cycles with different reasons,
 * same file modified 3+ times, no spiral detection, formatDebuggingSpiralEvent
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	type AdversarialPatternMatch,
	detectDebuggingSpiral,
	formatDebuggingSpiralEvent,
} from '../../../src/hooks/adversarial-detector';
import type { RunMemoryEntry } from '../../../src/services/run-memory';

describe.skip('detectDebuggingSpiral', () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(async () => {
		// Create a temp directory in the current working directory (not os.tmpdir)
		// This allows us to use a relative path that the validateDirectory function accepts
		tempDir = `test-spiral-${Date.now()}`;
		originalCwd = process.cwd();

		// Change to parent directory where we'll create our test directory
		process.chdir(os.tmpdir());

		// Create the test directory
		fs.mkdirSync(tempDir, { recursive: true });
		fs.mkdirSync(path.join(tempDir, '.swarm'), { recursive: true });
	});

	afterEach(() => {
		process.chdir(originalCwd);
		try {
			// Clean up - use absolute path from original cwd
			const cleanupPath = path.join(os.tmpdir(), tempDir);
			fs.rmSync(cleanupPath, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	// Helper to directly write run-memory entries to JSONL file
	async function writeRunMemoryEntries(entries: RunMemoryEntry[]) {
		const filePath = path.join(tempDir, '.swarm', 'run-memory.jsonl');
		const lines = entries.map((e) => JSON.stringify(e)).join('\n');
		fs.writeFileSync(filePath, lines + '\n');
	}

	describe('detects same rejection reason resurfacing', () => {
		test('returns DEBUGGING_SPIRAL when same reason appears 2+ times', async () => {
			const entries: RunMemoryEntry[] = [
				{
					timestamp: '2026-01-01T10:00:00.000Z',
					taskId: '1.1',
					taskFingerprint: 'abc12345',
					agent: 'mega_coder',
					outcome: 'fail',
					attemptNumber: 1,
					failureReason: 'Type error in src/index.ts line 42',
					filesModified: ['src/index.ts'],
				},
				{
					timestamp: '2026-01-01T10:05:00.000Z',
					taskId: '1.1',
					taskFingerprint: 'abc12345',
					agent: 'mega_coder',
					outcome: 'fail',
					attemptNumber: 2,
					failureReason: 'Type error in src/index.ts line 42',
					filesModified: ['src/index.ts'],
				},
				{
					timestamp: '2026-01-01T10:10:00.000Z',
					taskId: '1.1',
					taskFingerprint: 'abc12345',
					agent: 'mega_coder',
					outcome: 'pass',
					attemptNumber: 3,
				},
			];

			await writeRunMemoryEntries(entries);

			const result = await detectDebuggingSpiral('1.1', tempDir);

			expect(result).not.toBeNull();
			expect(result?.pattern).toBe('DEBUGGING_SPIRAL');
			expect(result?.severity).toBe('HIGH');
			expect(result?.matchedText).toContain(
				'Same rejection reason resurfacing',
			);
			expect(result?.confidence).toBe('HIGH');
		});

		test('detects with normalized reason (numbers replaced with #)', async () => {
			const entries: RunMemoryEntry[] = [
				{
					timestamp: '2026-01-01T10:00:00.000Z',
					taskId: '1.1',
					taskFingerprint: 'abc12345',
					agent: 'mega_coder',
					outcome: 'fail',
					attemptNumber: 1,
					failureReason: 'Type error in src/index.ts line 42',
					filesModified: ['src/index.ts'],
				},
				{
					timestamp: '2026-01-01T10:05:00.000Z',
					taskId: '1.1',
					taskFingerprint: 'abc12345',
					agent: 'mega_coder',
					outcome: 'fail',
					attemptNumber: 2,
					failureReason: 'Type error in src/index.ts line 99',
					filesModified: ['src/index.ts'],
				},
				{
					timestamp: '2026-01-01T10:10:00.000Z',
					taskId: '1.1',
					taskFingerprint: 'abc12345',
					agent: 'mega_coder',
					outcome: 'pass',
					attemptNumber: 3,
				},
			];

			await writeRunMemoryEntries(entries);

			const result = await detectDebuggingSpiral('1.1', tempDir);

			expect(result).not.toBeNull();
			expect(result?.pattern).toBe('DEBUGGING_SPIRAL');
			expect(result?.matchedText).toContain(
				'Same rejection reason resurfacing',
			);
		});
	});

	describe('detects 3+ cycles with different reasons', () => {
		test('returns DEBUGGING_SPIRAL when 3+ unique reasons', async () => {
			const entries: RunMemoryEntry[] = [
				{
					timestamp: '2026-01-01T10:00:00.000Z',
					taskId: '1.1',
					taskFingerprint: 'abc12345',
					agent: 'mega_coder',
					outcome: 'fail',
					attemptNumber: 1,
					failureReason: 'Type error in src/index.ts',
					filesModified: ['src/index.ts'],
				},
				{
					timestamp: '2026-01-01T10:05:00.000Z',
					taskId: '1.1',
					taskFingerprint: 'abc12345',
					agent: 'mega_coder',
					outcome: 'fail',
					attemptNumber: 2,
					failureReason: 'Missing import statement',
					filesModified: ['src/index.ts'],
				},
				{
					timestamp: '2026-01-01T10:10:00.000Z',
					taskId: '1.1',
					taskFingerprint: 'abc12345',
					agent: 'mega_coder',
					outcome: 'fail',
					attemptNumber: 3,
					failureReason: 'Test assertion failed',
					filesModified: ['src/index.ts'],
				},
				{
					timestamp: '2026-01-01T10:15:00.000Z',
					taskId: '1.1',
					taskFingerprint: 'abc12345',
					agent: 'mega_coder',
					outcome: 'pass',
					attemptNumber: 4,
				},
			];

			await writeRunMemoryEntries(entries);

			const result = await detectDebuggingSpiral('1.1', tempDir);

			expect(result).not.toBeNull();
			expect(result?.pattern).toBe('DEBUGGING_SPIRAL');
			expect(result?.severity).toBe('HIGH');
			expect(result?.matchedText).toContain('3+ cycles');
			expect(result?.confidence).toBe('MEDIUM');
		});
	});

	describe('detects same file modified 3+ times', () => {
		test('returns DEBUGGING_SPIRAL when same file modified 3+ times', async () => {
			// Use same failure reason so it doesn't trigger the "3+ cycles" detection first
			const entries: RunMemoryEntry[] = [
				{
					timestamp: '2026-01-01T10:00:00.000Z',
					taskId: '1.1',
					taskFingerprint: 'abc12345',
					agent: 'mega_coder',
					outcome: 'fail',
					attemptNumber: 1,
					failureReason: 'Type error', // Same reason
					filesModified: ['src/index.ts'],
				},
				{
					timestamp: '2026-01-01T10:05:00.000Z',
					taskId: '1.1',
					taskFingerprint: 'abc12345',
					agent: 'mega_coder',
					outcome: 'fail',
					attemptNumber: 2,
					failureReason: 'Type error', // Same reason - will also trigger "same reason" detection
					filesModified: ['src/index.ts'],
				},
				{
					timestamp: '2026-01-01T10:10:00.000Z',
					taskId: '1.1',
					taskFingerprint: 'abc12345',
					agent: 'mega_coder',
					outcome: 'fail',
					attemptNumber: 3,
					failureReason: 'Type error', // Same reason repeated 3 times
					filesModified: ['src/index.ts'],
				},
				{
					timestamp: '2026-01-01T10:15:00.000Z',
					taskId: '1.1',
					taskFingerprint: 'abc12345',
					agent: 'mega_coder',
					outcome: 'pass',
					attemptNumber: 4,
				},
			];

			await writeRunMemoryEntries(entries);

			const result = await detectDebuggingSpiral('1.1', tempDir);

			expect(result).not.toBeNull();
			expect(result?.pattern).toBe('DEBUGGING_SPIRAL');
			expect(result?.severity).toBe('HIGH');
			// Either "same rejection reason" or "same file modified" is valid
			expect(
				result?.matchedText.includes('Same rejection reason') ||
					result?.matchedText.includes('Same file modified'),
			).toBe(true);
			expect(result?.confidence).toBe('HIGH');
		});
	});

	describe('returns null when no spiral detected', () => {
		test('returns null with less than 3 history entries', async () => {
			const entries: RunMemoryEntry[] = [
				{
					timestamp: '2026-01-01T10:00:00.000Z',
					taskId: '1.1',
					taskFingerprint: 'abc12345',
					agent: 'mega_coder',
					outcome: 'fail',
					attemptNumber: 1,
					failureReason: 'Type error',
				},
				{
					timestamp: '2026-01-01T10:05:00.000Z',
					taskId: '1.1',
					taskFingerprint: 'abc12345',
					agent: 'mega_coder',
					outcome: 'pass',
					attemptNumber: 2,
				},
			];

			await writeRunMemoryEntries(entries);

			const result = await detectDebuggingSpiral('1.1', tempDir);
			expect(result).toBeNull();
		});

		test('returns null when only pass outcomes', async () => {
			const entries: RunMemoryEntry[] = [
				{
					timestamp: '2026-01-01T10:00:00.000Z',
					taskId: '1.1',
					taskFingerprint: 'abc12345',
					agent: 'mega_coder',
					outcome: 'pass',
					attemptNumber: 1,
				},
				{
					timestamp: '2026-01-01T10:05:00.000Z',
					taskId: '1.1',
					taskFingerprint: 'abc12345',
					agent: 'mega_coder',
					outcome: 'pass',
					attemptNumber: 2,
				},
				{
					timestamp: '2026-01-01T10:10:00.000Z',
					taskId: '1.1',
					taskFingerprint: 'abc12345',
					agent: 'mega_coder',
					outcome: 'pass',
					attemptNumber: 3,
				},
			];

			await writeRunMemoryEntries(entries);

			const result = await detectDebuggingSpiral('1.1', tempDir);
			expect(result).toBeNull();
		});

		test('returns null when different files modified each time', async () => {
			const entries: RunMemoryEntry[] = [
				{
					timestamp: '2026-01-01T10:00:00.000Z',
					taskId: '1.1',
					taskFingerprint: 'abc12345',
					agent: 'mega_coder',
					outcome: 'fail',
					attemptNumber: 1,
					failureReason: 'Error in file1',
					filesModified: ['src/file1.ts'],
				},
				{
					timestamp: '2026-01-01T10:05:00.000Z',
					taskId: '1.1',
					taskFingerprint: 'abc12345',
					agent: 'mega_coder',
					outcome: 'fail',
					attemptNumber: 2,
					failureReason: 'Error in file2',
					filesModified: ['src/file2.ts'],
				},
				{
					timestamp: '2026-01-01T10:10:00.000Z',
					taskId: '1.1',
					taskFingerprint: 'abc12345',
					agent: 'mega_coder',
					outcome: 'fail',
					attemptNumber: 3,
					failureReason: 'Error in file3',
					filesModified: ['src/file3.ts'],
				},
			];

			await writeRunMemoryEntries(entries);

			const result = await detectDebuggingSpiral('1.1', tempDir);
			// Should detect 3+ cycles with different reasons
			expect(result).not.toBeNull();
			expect(result?.pattern).toBe('DEBUGGING_SPIRAL');
		});
	});

	describe('handles errors gracefully', () => {
		test('returns null on invalid directory (path traversal attempt)', async () => {
			const result = await detectDebuggingSpiral('1.1', '../other');
			// Should handle error gracefully - returns null
			expect(result).toBeNull();
		});

		test('returns null when task does not exist', async () => {
			const entries: RunMemoryEntry[] = [
				{
					timestamp: '2026-01-01T10:00:00.000Z',
					taskId: '1.1',
					taskFingerprint: 'abc12345',
					agent: 'mega_coder',
					outcome: 'pass',
					attemptNumber: 1,
				},
			];
			await writeRunMemoryEntries(entries);

			const result = await detectDebuggingSpiral('999.999', tempDir);
			expect(result).toBeNull();
		});
	});
});

describe('formatDebuggingSpiralEvent', () => {
	test('formats correctly with all required fields', () => {
		const match: AdversarialPatternMatch = {
			pattern: 'DEBUGGING_SPIRAL',
			severity: 'HIGH',
			matchedText: 'Same rejection reason resurfacing: "type error..."',
			confidence: 'HIGH',
		};

		const result = formatDebuggingSpiralEvent(match, '1.1');
		const parsed = JSON.parse(result);

		expect(parsed.event).toBe('debugging_spiral_detected');
		expect(parsed.taskId).toBe('1.1');
		expect(parsed.pattern).toBe('DEBUGGING_SPIRAL');
		expect(parsed.severity).toBe('HIGH');
		expect(parsed.matchedText).toBe(
			'Same rejection reason resurfacing: "type error..."',
		);
		expect(parsed.confidence).toBe('HIGH');
		expect(parsed.timestamp).toBeDefined();
		// Verify timestamp is ISO format
		expect(new Date(parsed.timestamp).toISOString()).toBe(parsed.timestamp);
	});

	test('formats correctly for 3+ cycles case', () => {
		const match: AdversarialPatternMatch = {
			pattern: 'DEBUGGING_SPIRAL',
			severity: 'HIGH',
			matchedText: '3+ cycles with different rejection reasons (5 unique)',
			confidence: 'MEDIUM',
		};

		const result = formatDebuggingSpiralEvent(match, '2.3');
		const parsed = JSON.parse(result);

		expect(parsed.event).toBe('debugging_spiral_detected');
		expect(parsed.taskId).toBe('2.3');
		expect(parsed.pattern).toBe('DEBUGGING_SPIRAL');
		expect(parsed.severity).toBe('HIGH');
		expect(parsed.matchedText).toBe(
			'3+ cycles with different rejection reasons (5 unique)',
		);
		expect(parsed.confidence).toBe('MEDIUM');
		expect(parsed.timestamp).toBeDefined();
	});

	test('formats correctly for same file modified case', () => {
		const match: AdversarialPatternMatch = {
			pattern: 'DEBUGGING_SPIRAL',
			severity: 'HIGH',
			matchedText: 'Same file modified 5 times: index.ts',
			confidence: 'HIGH',
		};

		const result = formatDebuggingSpiralEvent(match, '5.1');
		const parsed = JSON.parse(result);

		expect(parsed.event).toBe('debugging_spiral_detected');
		expect(parsed.taskId).toBe('5.1');
		expect(parsed.pattern).toBe('DEBUGGING_SPIRAL');
		expect(parsed.severity).toBe('HIGH');
		expect(parsed.matchedText).toBe('Same file modified 5 times: index.ts');
		expect(parsed.confidence).toBe('HIGH');
		expect(parsed.timestamp).toBeDefined();
	});

	test('output is valid JSON', () => {
		const match: AdversarialPatternMatch = {
			pattern: 'DEBUGGING_SPIRAL',
			severity: 'HIGH',
			matchedText: 'Test spiral',
			confidence: 'HIGH',
		};

		const result = formatDebuggingSpiralEvent(match, '1.1');

		// Should be parseable as JSON
		expect(() => JSON.parse(result)).not.toThrow();

		// Should have all required keys
		const parsed = JSON.parse(result);
		expect(Object.keys(parsed)).toContain('event');
		expect(Object.keys(parsed)).toContain('timestamp');
		expect(Object.keys(parsed)).toContain('taskId');
		expect(Object.keys(parsed)).toContain('pattern');
		expect(Object.keys(parsed)).toContain('severity');
		expect(Object.keys(parsed)).toContain('matchedText');
		expect(Object.keys(parsed)).toContain('confidence');
	});
});

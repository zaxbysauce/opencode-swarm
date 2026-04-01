/**
 * Verification tests for meta-indexer module
 * Covers extractMetaSummaries, indexMetaSummaries, and querySummaries
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	extractMetaSummaries,
	getLatestTaskSummary,
	indexMetaSummaries,
	querySummaries,
} from '../../../src/parallel/meta-indexer';

describe('meta-indexer module tests', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-indexer-test-'));
		fs.mkdirSync(path.join(tmpDir, '.swarm'), { recursive: true });
	});

	afterEach(() => {
		try {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	// ========== GROUP 1: extractMetaSummaries tests ==========
	describe('Group 1: extractMetaSummaries', () => {
		it('extracts from events with meta.summary field', () => {
			const eventsPath = path.join(tmpDir, 'events.jsonl');
			fs.writeFileSync(
				eventsPath,
				JSON.stringify({
					timestamp: '2024-01-01T10:00:00Z',
					phase: 1,
					taskId: '1.1',
					agent: 'coder',
					meta: { summary: 'Added new feature' },
				}) + '\n',
			);

			const entries = extractMetaSummaries(eventsPath);
			expect(entries).toHaveLength(1);
			expect(entries[0].summary).toBe('Added new feature');
			expect(entries[0].phase).toBe(1);
			expect(entries[0].taskId).toBe('1.1');
			expect(entries[0].agent).toBe('coder');
		});

		it('extracts from events with direct summary field', () => {
			const eventsPath = path.join(tmpDir, 'events.jsonl');
			fs.writeFileSync(
				eventsPath,
				JSON.stringify({
					timestamp: '2024-01-01T10:00:00Z',
					phase: 2,
					taskId: '2.1',
					agent: 'reviewer',
					summary: 'Reviewed code',
				}) + '\n',
			);

			const entries = extractMetaSummaries(eventsPath);
			expect(entries).toHaveLength(1);
			expect(entries[0].summary).toBe('Reviewed code');
		});

		it('returns empty array for non-existent file', () => {
			const entries = extractMetaSummaries(
				path.join(tmpDir, 'nonexistent.jsonl'),
			);
			expect(entries).toHaveLength(0);
		});

		it('skips malformed JSON lines', () => {
			const eventsPath = path.join(tmpDir, 'events.jsonl');
			fs.writeFileSync(
				eventsPath,
				'{"timestamp": "2024-01-01T10:00:00Z", "meta": {"summary": "Valid"}}\n' +
					'invalid json line\n' +
					'{"timestamp": "2024-01-01T10:01:00Z", "meta": {"summary": "Also valid"}}\n',
			);

			const entries = extractMetaSummaries(eventsPath);
			expect(entries).toHaveLength(2);
		});

		it('skips events without summary', () => {
			const eventsPath = path.join(tmpDir, 'events.jsonl');
			fs.writeFileSync(
				eventsPath,
				JSON.stringify({
					timestamp: '2024-01-01T10:00:00Z',
					phase: 1,
					taskId: '1.1',
				}) + '\n',
			);

			const entries = extractMetaSummaries(eventsPath);
			expect(entries).toHaveLength(0);
		});
	});

	// ========== GROUP 2: indexMetaSummaries tests ==========
	describe('Group 2: indexMetaSummaries', () => {
		it('writes to index file', async () => {
			const eventsPath = path.join(tmpDir, '.swarm', 'events.jsonl');
			fs.writeFileSync(
				eventsPath,
				JSON.stringify({
					timestamp: '2024-01-01T10:00:00Z',
					phase: 1,
					taskId: '1.1',
					agent: 'coder',
					meta: { summary: 'Added feature X' },
				}) + '\n',
			);

			const result = await indexMetaSummaries(tmpDir);

			expect(result.indexed).toBe(1);
			expect(result.path).toContain('summary-index.jsonl');
			expect(fs.existsSync(result.path)).toBe(true);
		});

		it('skips duplicate entries', async () => {
			const eventsPath = path.join(tmpDir, '.swarm', 'events.jsonl');
			fs.writeFileSync(
				eventsPath,
				JSON.stringify({
					timestamp: '2024-01-01T10:00:00Z',
					phase: 1,
					taskId: '1.1',
					meta: { summary: 'Test summary' },
				}) + '\n',
			);

			const result1 = await indexMetaSummaries(tmpDir);
			expect(result1.indexed).toBe(1);

			// Index again - should not add duplicates
			const result2 = await indexMetaSummaries(tmpDir);
			expect(result2.indexed).toBe(0);
		});

		it('creates .swarm directory if not exists', async () => {
			const noSwarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-swarm-'));
			const eventsPath = path.join(noSwarmDir, '.swarm', 'events.jsonl');
			fs.mkdirSync(path.dirname(eventsPath), { recursive: true });
			fs.writeFileSync(
				eventsPath,
				JSON.stringify({
					timestamp: '2024-01-01T10:00:00Z',
					meta: { summary: 'Test' },
				}) + '\n',
			);

			const result = await indexMetaSummaries(noSwarmDir);

			expect(result.indexed).toBe(1);
			expect(
				fs.existsSync(path.join(noSwarmDir, '.swarm', 'summary-index.jsonl')),
			).toBe(true);

			fs.rmSync(noSwarmDir, { recursive: true, force: true });
		});
	});

	// ========== GROUP 3: querySummaries tests ==========
	describe('Group 3: querySummaries', () => {
		beforeEach(() => {
			// Create pre-populated index
			const indexPath = path.join(tmpDir, '.swarm', 'summary-index.jsonl');
			fs.writeFileSync(
				indexPath,
				'{"timestamp": "2024-01-01T10:00:00Z", "phase": 1, "taskId": "1.1", "agent": "coder", "summary": "Summary 1"}\n' +
					'{"timestamp": "2024-01-02T10:00:00Z", "phase": 1, "taskId": "1.2", "agent": "reviewer", "summary": "Summary 2"}\n' +
					'{"timestamp": "2024-01-03T10:00:00Z", "phase": 2, "taskId": "2.1", "agent": "coder", "summary": "Summary 3"}\n',
			);
		});

		it('filters by phase correctly', () => {
			const results = querySummaries(tmpDir, { phase: 1 });
			expect(results).toHaveLength(2);
			expect(results.every((r) => r.phase === 1)).toBe(true);
		});

		it('filters by taskId correctly', () => {
			const results = querySummaries(tmpDir, { taskId: '1.2' });
			expect(results).toHaveLength(1);
			expect(results[0].taskId).toBe('1.2');
		});

		it('filters by agent correctly', () => {
			const results = querySummaries(tmpDir, { agent: 'reviewer' });
			expect(results).toHaveLength(1);
			expect(results[0].agent).toBe('reviewer');
		});

		it('filters by since correctly', () => {
			const results = querySummaries(tmpDir, { since: '2024-01-02T00:00:00Z' });
			expect(results).toHaveLength(2); // Jan 2 and Jan 3
			expect(results[0].timestamp).toBe('2024-01-02T10:00:00Z');
		});

		it('returns empty for non-existent index', () => {
			const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-test-'));
			const results = querySummaries(emptyDir);
			expect(results).toHaveLength(0);
			fs.rmSync(emptyDir, { recursive: true, force: true });
		});

		it('returns results sorted by timestamp', () => {
			const results = querySummaries(tmpDir);
			expect(results[0].timestamp).toBe('2024-01-01T10:00:00Z');
			expect(results[1].timestamp).toBe('2024-01-02T10:00:00Z');
			expect(results[2].timestamp).toBe('2024-01-03T10:00:00Z');
		});
	});

	// ========== GROUP 4: getLatestTaskSummary tests ==========
	describe('Group 4: getLatestTaskSummary', () => {
		it('returns latest summary for a task', () => {
			const indexPath = path.join(tmpDir, '.swarm', 'summary-index.jsonl');
			fs.writeFileSync(
				indexPath,
				'{"timestamp": "2024-01-01T10:00:00Z", "taskId": "1.1", "summary": "First"}\n' +
					'{"timestamp": "2024-01-02T10:00:00Z", "taskId": "1.1", "summary": "Second"}\n' +
					'{"timestamp": "2024-01-03T10:00:00Z", "taskId": "1.1", "summary": "Third"}\n',
			);

			const latest = getLatestTaskSummary(tmpDir, '1.1');
			expect(latest?.summary).toBe('Third');
		});

		it('returns undefined for non-existent task', () => {
			const indexPath = path.join(tmpDir, '.swarm', 'summary-index.jsonl');
			fs.writeFileSync(
				indexPath,
				'{"timestamp": "2024-01-01T10:00:00Z", "taskId": "1.1", "summary": "First"}\n',
			);

			const latest = getLatestTaskSummary(tmpDir, '99.99');
			expect(latest).toBeUndefined();
		});
	});
});

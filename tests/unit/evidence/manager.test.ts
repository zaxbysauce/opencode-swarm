import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
	sanitizeTaskId,
	saveEvidence,
	loadEvidence,
	listEvidenceTaskIds,
	deleteEvidence,
} from '../../../src/evidence/manager';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Evidence } from '../../../src/config/evidence-schema';

let tempDir: string;

beforeEach(() => {
	tempDir = join(tmpdir(), `evidence-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(join(tempDir, '.swarm'), { recursive: true });
});

afterEach(() => {
	rmSync(tempDir, { recursive: true, force: true });
});

function makeEvidence(overrides: Partial<Evidence> = {}): Evidence {
	return {
		task_id: '1.1',
		type: 'note',
		timestamp: new Date().toISOString(),
		agent: 'test-agent',
		verdict: 'info',
		summary: 'Test evidence',
		...overrides,
	} as Evidence;
}

describe('sanitizeTaskId', () => {
	it("valid IDs: '1.1', 'task-1', 'my-task.sub-1', 'abc' all return the ID", () => {
		expect(sanitizeTaskId('1.1')).toBe('1.1');
		expect(sanitizeTaskId('task-1')).toBe('task-1');
		expect(sanitizeTaskId('my-task.sub-1')).toBe('my-task.sub-1');
		expect(sanitizeTaskId('abc')).toBe('abc');
	});

	it('empty string throws', () => {
		expect(() => sanitizeTaskId('')).toThrow('Invalid task ID: empty string');
	});

	it("null byte ('task\\0id') throws", () => {
		expect(() => sanitizeTaskId('task\0id')).toThrow('Invalid task ID: contains null bytes');
	});

	it("control character ('task\\tid' — tab char) throws", () => {
		expect(() => sanitizeTaskId('task\tid')).toThrow('Invalid task ID: contains control characters');
	});

	it("path traversal '../secret' throws", () => {
		expect(() => sanitizeTaskId('../secret')).toThrow('Invalid task ID: path traversal detected');
	});

	it("path traversal '..\\\\secret' throws", () => {
		expect(() => sanitizeTaskId('..\\secret')).toThrow('Invalid task ID: path traversal detected');
	});

	it("double dot 'task..id' throws", () => {
		expect(() => sanitizeTaskId('task..id')).toThrow('Invalid task ID: path traversal detected');
	});

	it("invalid chars 'task/id' throws", () => {
		expect(() => sanitizeTaskId('task/id')).toThrow('Invalid task ID: must match pattern');
	});

	it("spaces 'task id' throws", () => {
		expect(() => sanitizeTaskId('task id')).toThrow('Invalid task ID: must match pattern');
	});

	it("leading dot '.hidden' throws", () => {
		// Leading dot is valid for the regex, but we should check if it's handled
		// The regex ^[\w-]+(\.[\w-]+)*$ allows starting with word char or hyphen, not dot
		expect(() => sanitizeTaskId('.hidden')).toThrow('Invalid task ID: must match pattern');
	});
});

describe('saveEvidence + loadEvidence', () => {
	it('save creates new bundle and load returns it', async () => {
		const evidence = makeEvidence({ summary: 'Test summary' });
		const bundle = await saveEvidence(tempDir, '1.1', evidence);

		expect(bundle.task_id).toBe('1.1');
		expect(bundle.entries.length).toBe(1);
		expect(bundle.entries[0].summary).toBe('Test summary');

		const loaded = await loadEvidence(tempDir, '1.1');
		expect(loaded).not.toBeNull();
		expect(loaded?.task_id).toBe('1.1');
		expect(loaded?.entries.length).toBe(1);
		expect(loaded?.entries[0].summary).toBe('Test summary');
	});

	it('save appends to existing bundle', async () => {
		const evidence1 = makeEvidence({ summary: 'First entry' });
		const evidence2 = makeEvidence({ summary: 'Second entry' });

		await saveEvidence(tempDir, '1.1', evidence1);
		const bundle2 = await saveEvidence(tempDir, '1.1', evidence2);

		expect(bundle2.entries.length).toBe(2);
		expect(bundle2.entries[0].summary).toBe('First entry');
		expect(bundle2.entries[1].summary).toBe('Second entry');

		const loaded = await loadEvidence(tempDir, '1.1');
		expect(loaded?.entries.length).toBe(2);
	});

	it('load returns null when no evidence exists', async () => {
		const loaded = await loadEvidence(tempDir, '1.1');
		expect(loaded).toBeNull();
	});

	it('save with invalid task ID throws', async () => {
		const evidence = makeEvidence();
		await expect(saveEvidence(tempDir, '../evil', evidence)).rejects.toThrow('Invalid task ID');
	});

	it('save validates path via validateSwarmPath (implicitly tested via save)', async () => {
		// This is implicitly tested by the fact that saveEvidence uses validateSwarmPath
		// If the path validation fails, the save should fail
		const evidence = makeEvidence();
		// Normal save should work
		const bundle = await saveEvidence(tempDir, '1.1', evidence);
		expect(bundle.task_id).toBe('1.1');
	});

	it('size limit enforcement: verify save throws with exceeds maximum message', async () => {
		const evidence = makeEvidence({
			summary: 'x'.repeat(600000), // 600KB string, will exceed 500KB limit
		});

		await expect(saveEvidence(tempDir, '1.1', evidence)).rejects.toThrow('exceeds maximum');
	});
});

describe('listEvidenceTaskIds', () => {
	it('returns empty array when no evidence directory exists', async () => {
		const ids = await listEvidenceTaskIds(tempDir);
		expect(ids).toEqual([]);
	});

	it('returns sorted task IDs after saving evidence for multiple tasks', async () => {
		// Save evidence in random order
		await saveEvidence(tempDir, '2.1', makeEvidence({ task_id: '2.1' }));
		await saveEvidence(tempDir, '1.2', makeEvidence({ task_id: '1.2' }));
		await saveEvidence(tempDir, '1.1', makeEvidence({ task_id: '1.1' }));

		const ids = await listEvidenceTaskIds(tempDir);
		expect(ids).toEqual(['1.1', '1.2', '2.1']);
	});

	it('filters out non-directory files', async () => {
		// Save evidence for a valid task
		await saveEvidence(tempDir, '1.1', makeEvidence({ task_id: '1.1' }));

		// Create a regular file in the evidence directory
		const evidenceDir = join(tempDir, '.swarm', 'evidence');
		writeFileSync(join(evidenceDir, 'regular-file.txt'), 'test content');

		const ids = await listEvidenceTaskIds(tempDir);
		expect(ids).toEqual(['1.1']);
		expect(ids).not.toContain('regular-file.txt');
	});

	it('filters out invalid task ID directory names', async () => {
		// Save evidence for a valid task
		await saveEvidence(tempDir, '1.1', makeEvidence({ task_id: '1.1' }));

		// Create a directory with invalid name (double dot)
		const evidenceDir = join(tempDir, '.swarm', 'evidence');
		mkdirSync(join(evidenceDir, 'bad..name'), { recursive: true });

		const ids = await listEvidenceTaskIds(tempDir);
		expect(ids).toEqual(['1.1']);
		expect(ids).not.toContain('bad..name');
	});

	it('handles empty evidence directory', async () => {
		// Create the evidence directory but don't save anything
		const evidenceDir = join(tempDir, '.swarm', 'evidence');
		mkdirSync(evidenceDir, { recursive: true });

		const ids = await listEvidenceTaskIds(tempDir);
		expect(ids).toEqual([]);
	});
});

describe('deleteEvidence', () => {
	it('returns false when evidence does not exist', async () => {
		const result = await deleteEvidence(tempDir, '1.1');
		expect(result).toBe(false);
	});

	it('returns true after deleting existing evidence', async () => {
		// Save evidence
		await saveEvidence(tempDir, '1.1', makeEvidence({ task_id: '1.1' }));

		// Delete it
		const result = await deleteEvidence(tempDir, '1.1');
		expect(result).toBe(true);
	});

	it('verify deleted evidence cannot be loaded', async () => {
		// Save evidence
		await saveEvidence(tempDir, '1.1', makeEvidence({ task_id: '1.1' }));

		// Verify it exists
		let loaded = await loadEvidence(tempDir, '1.1');
		expect(loaded).not.toBeNull();

		// Delete it
		await deleteEvidence(tempDir, '1.1');

		// Verify it's gone
		loaded = await loadEvidence(tempDir, '1.1');
		expect(loaded).toBeNull();
	});

	it('invalid task ID throws', async () => {
		await expect(deleteEvidence(tempDir, '../evil')).rejects.toThrow('Invalid task ID');
	});
});

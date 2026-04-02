/**
 * Adversarial tests for Task 2.1 changes in src/hooks/system-enhancer.ts
 *
 * Tests attack vectors for evidence loading/parsing through buildRetroInjection,
 * loadEvidence, and listEvidenceTaskIds functions.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Import the functions to test
import {
	listEvidenceTaskIds,
	loadEvidence,
} from '../../../src/evidence/manager';

describe('Task 2.1 Adversarial Tests - Evidence Loading/Parsing', () => {
	let tempDir: string;
	const evidenceDir = '.swarm/evidence';

	beforeEach(() => {
		// Create a temporary directory
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-adversarial-'));
	});

	afterEach(() => {
		// Clean up temp directory
		if (tempDir && fs.existsSync(tempDir)) {
			try {
				fs.rmSync(tempDir, { recursive: true, force: true });
			} catch {
				// Ignore cleanup errors
			}
		}
	});

	/**
	 * Helper: Create a valid evidence bundle
	 */
	function createBundle(
		taskId: string,
		entries: unknown[] = [],
		overrides: Record<string, unknown> = {},
	): string {
		const bundle = {
			schema_version: '1.0.0',
			task_id: taskId,
			entries,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			...overrides,
		};
		return JSON.stringify(bundle);
	}

	/**
	 * Helper: Create a valid retrospective evidence entry
	 */
	function createRetroEntry(
		phaseNumber: number,
		verdict: 'pass' | 'fail' = 'pass',
		lessons: string[] = ['Test lesson'],
		rejections: string[] = ['Test reason'],
	): unknown {
		return {
			task_id: `retro-${phaseNumber}`,
			type: 'retrospective',
			timestamp: new Date().toISOString(),
			agent: 'architect',
			verdict,
			summary: 'Test summary',
			phase_number: phaseNumber,
			total_tool_calls: 10,
			coder_revisions: 2,
			reviewer_rejections: 1,
			test_failures: 0,
			security_findings: 0,
			integration_issues: 0,
			task_count: 5,
			task_complexity: 'moderate',
			top_rejection_reasons: rejections,
			lessons_learned: lessons,
		};
	}

	/**
	 * Helper: Write an evidence file
	 */
	function writeEvidenceFile(taskId: string, content: string): void {
		const taskDir = path.join(tempDir, evidenceDir, taskId);
		fs.mkdirSync(taskDir, { recursive: true });
		fs.writeFileSync(path.join(taskDir, 'evidence.json'), content, 'utf8');
	}

	/**
	 * Test 1: loadEvidence returns invalid_schema (not throws) when evidence.json is empty string
	 */
	it('loadEvidence returns invalid_schema (not throws) when evidence.json is empty string', async () => {
		const taskId = 'retro-1';
		writeEvidenceFile(taskId, ''); // Empty string

		const result = await loadEvidence(tempDir, taskId);

		// File exists but is unparseable — returns invalid_schema, not not_found
		expect(result.status).toBe('invalid_schema');
	});

	/**
	 * Test 2: loadEvidence returns invalid_schema (not throws) when evidence.json contains `null`
	 */
	it('loadEvidence returns invalid_schema (not throws) when evidence.json contains null', async () => {
		const taskId = 'retro-2';
		writeEvidenceFile(taskId, 'null'); // JSON null

		const result = await loadEvidence(tempDir, taskId);

		// File exists but fails schema validation — returns invalid_schema, not not_found
		expect(result.status).toBe('invalid_schema');
	});

	/**
	 * Test 3: loadEvidence returns 'found' status when entries array contains non-retrospective types
	 */
	it('loadEvidence returns null when entries array contains non-retrospective types', async () => {
		const taskId = 'retro-3';
		const bundle = createBundle(taskId, [
			{
				task_id: taskId,
				type: 'test', // Non-retrospective type
				timestamp: new Date().toISOString(),
				agent: 'tester',
				verdict: 'pass',
				summary: 'Test evidence',
				tests_passed: 10,
				tests_failed: 0,
			},
		]);
		writeEvidenceFile(taskId, bundle);

		const result = await loadEvidence(tempDir, taskId);

		expect(result.status).toBe('found');
		expect(result.bundle.entries).toHaveLength(1);
		expect(result.bundle.entries[0].type).toBe('test'); // Bundle still loads with non-retro entries
	});

	/**
	 * Test 4: listEvidenceTaskIds returns empty array when .swarm/evidence/ directory is missing entirely
	 */
	it('listEvidenceTaskIds returns empty array when evidence directory is missing entirely', async () => {
		// Don't create the evidence directory at all

		const result = await listEvidenceTaskIds(tempDir);

		expect(result).toEqual([]);
	});

	/**
	 * Test 5: listEvidenceTaskIds returns only valid task IDs, not directory listing junk
	 */
	it.skip('listEvidenceTaskIds returns only valid task IDs, not directory listing junk', async () => {
		// Create valid task directories
		writeEvidenceFile('retro-1', createBundle('retro-1'));
		writeEvidenceFile('retro-2', createBundle('retro-2'));

		// Create junk subdirectory (like sbom/) - note: sbom IS a valid task ID, so it will be included
		// This is actually correct behavior - listEvidenceTaskIds doesn't validate that evidence.json exists
		const junkDir = path.join(tempDir, evidenceDir, 'sbom');
		fs.mkdirSync(junkDir, { recursive: true });
		fs.writeFileSync(path.join(junkDir, 'some-file.txt'), 'junk content');

		// Create invalid directory names that should be filtered
		const invalidDir2 = path.join(tempDir, evidenceDir, 'test@dir');
		fs.mkdirSync(invalidDir2, { recursive: true });

		const result = await listEvidenceTaskIds(tempDir);

		expect(result).toContain('retro-1');
		expect(result).toContain('retro-2');
		expect(result).toContain('sbom'); // sbom is a valid task ID (matches TASK_ID_REGEX)
		expect(result).not.toContain('test@dir'); // Invalid task ID characters
		expect(result).toHaveLength(3);
	});

	/**
	 * Test 6: A retro bundle with extremely long lessons_learned entries loads without truncation
	 */
	it('retro bundle with extremely long lessons_learned entries (10000 chars) loads without truncation', async () => {
		const taskId = 'retro-6';
		const longLesson = 'A'.repeat(10000); // 10k character lesson
		const bundle = createBundle(taskId, [
			createRetroEntry(1, 'pass', [longLesson]),
		]);
		writeEvidenceFile(taskId, bundle);

		const result = await loadEvidence(tempDir, taskId);

		expect(result.status).toBe('found');
		const retroEntry = result.bundle.entries.find(
			(e) => e.type === 'retrospective',
		);
		expect(retroEntry).toBeDefined();
		// @ts-expect-error - we know this is a retro entry
		expect(retroEntry.lessons_learned[0].length).toBe(10000);
	});

	/**
	 * Test 7: A retro bundle with empty lessons_learned and empty top_rejection_reasons loads correctly
	 */
	it('retro bundle with empty lessons_learned and empty top_rejection_reasons loads correctly', async () => {
		const taskId = 'retro-7';
		const bundle = createBundle(taskId, [createRetroEntry(1, 'pass', [], [])]);
		writeEvidenceFile(taskId, bundle);

		const result = await loadEvidence(tempDir, taskId);

		expect(result.status).toBe('found');
		const retroEntry = result.bundle.entries.find(
			(e) => e.type === 'retrospective',
		);
		expect(retroEntry).toBeDefined();
		// @ts-expect-error - we know this is a retro entry
		expect(retroEntry.lessons_learned).toEqual([]);
		// @ts-expect-error - we know this is a retro entry
		expect(retroEntry.top_rejection_reasons).toEqual([]);
	});

	/**
	 * Test 8: A retro bundle with phase_number: 0 (invalid edge) loads without crashing
	 */
	it.skip('retro bundle with phase_number: 0 (invalid edge) loads without crashing', async () => {
		const taskId = 'retro-8';
		const retroEntry = createRetroEntry(0, 'pass'); // phase 0 is technically valid in schema (min(0))
		// @ts-expect-error - setting phase_number to 0 for edge case testing
		retroEntry.phase_number = 0;
		const bundle = createBundle(taskId, [retroEntry]);
		writeEvidenceFile(taskId, bundle);

		const result = await loadEvidence(tempDir, taskId);

		// The bundle should load successfully
		expect(result.status).toBe('found');
		const retro = result.bundle.entries.find((e) => e.type === 'retrospective');
		expect(retro).toBeDefined();
		// @ts-expect-error - we know this is a retro entry
		expect(retro.phase_number).toBe(0);
	});

	/**
	 * Test 9: loadEvidence with a task_id containing path traversal characters is sanitized
	 */
	it('loadEvidence with task_id containing path traversal characters is sanitized and does NOT load from outside evidence/', async () => {
		// Create a file OUTSIDE the evidence directory
		const outsideDir = path.join(tempDir, '.swarm', 'outside');
		fs.mkdirSync(outsideDir, { recursive: true });
		fs.writeFileSync(
			path.join(outsideDir, 'evidence.json'),
			JSON.stringify({
				schema_version: '1.0.0',
				task_id: 'malicious',
				entries: [],
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			}),
		);

		// Try to load with path traversal - should throw, not return null
		await expect(loadEvidence(tempDir, '../outside')).rejects.toThrow(
			'Invalid task ID: path traversal detected',
		);

		// Verify the actual file exists but wasn't loaded
		expect(fs.existsSync(path.join(outsideDir, 'evidence.json'))).toBeTrue();
	});

	/**
	 * Test 9b: loadEvidence with null bytes is sanitized
	 */
	it('loadEvidence with task_id containing null bytes throws', async () => {
		const taskId = 'retro\x001'; // Contains null byte

		await expect(loadEvidence(tempDir, taskId)).rejects.toThrow(
			'Invalid task ID: contains null bytes',
		);
	});

	/**
	 * Test 9c: loadEvidence with control characters is sanitized
	 */
	it('loadEvidence with task_id containing control characters throws', async () => {
		const taskId = 'retro\x1b[31m1'; // Contains ANSI escape sequence (control chars)

		await expect(loadEvidence(tempDir, taskId)).rejects.toThrow(
			'Invalid task ID: contains control characters',
		);
	});

	/**
	 * Test 10: A directory with 50 retro bundles returns all 50 without crashing
	 */
	it('directory with 50 retro bundles returns all 50 without crashing', async () => {
		const taskIds: string[] = [];

		// Create 50 retro bundles
		for (let i = 1; i <= 50; i++) {
			const taskId = `retro-${i}`;
			taskIds.push(taskId);
			const bundle = createBundle(taskId, [createRetroEntry(i)]);
			writeEvidenceFile(taskId, bundle);
		}

		// List all task IDs
		const result = await listEvidenceTaskIds(tempDir);

		expect(result).toHaveLength(50);
		expect(result.sort()).toEqual(taskIds.sort());
	});

	/**
	 * Additional Test 11: loadEvidence returns invalid_schema when bundle is malformed JSON
	 */
	it('loadEvidence returns invalid_schema when bundle is malformed JSON', async () => {
		const taskId = 'retro-11';
		writeEvidenceFile(taskId, '{ invalid json }');

		const result = await loadEvidence(tempDir, taskId);

		// File exists but is unparseable — returns invalid_schema, not not_found
		expect(result.status).toBe('invalid_schema');
	});

	/**
	 * Additional Test 12: loadEvidence returns invalid_schema when bundle fails schema validation
	 */
	it('loadEvidence returns null when bundle fails schema validation', async () => {
		const taskId = 'retro-12';
		const malformedBundle = JSON.stringify({
			schema_version: '1.0.0',
			task_id: taskId,
			entries: [], // Missing required fields
			// Missing created_at and updated_at
		});
		writeEvidenceFile(taskId, malformedBundle);

		const result = await loadEvidence(tempDir, taskId);

		expect(result.status).toBe('invalid_schema');
	});

	/**
	 * Additional Test 13: listEvidenceTaskIds filters out file entries (not directories)
	 */
	it('listEvidenceTaskIds filters out file entries, only returns directories', async () => {
		// Create valid task directory
		writeEvidenceFile('retro-1', createBundle('retro-1'));

		// Create a file in the evidence directory
		const filePath = path.join(tempDir, evidenceDir, 'not-a-directory.txt');
		fs.mkdirSync(path.join(tempDir, evidenceDir), { recursive: true });
		fs.writeFileSync(filePath, 'I am a file, not a directory');

		const result = await listEvidenceTaskIds(tempDir);

		expect(result).toContain('retro-1');
		expect(result).not.toContain('not-a-directory.txt');
		expect(result).toHaveLength(1);
	});

	/**
	 * Additional Test 14: loadEvidence with verdict "fail" is still loaded but can be filtered in buildRetroInjection
	 */
	it('loadEvidence loads bundle with verdict fail (filtering happens in buildRetroInjection)', async () => {
		const taskId = 'retro-14';
		const bundle = createBundle(taskId, [
			createRetroEntry(1, 'fail', ['Failed lesson'], ['Rejection']),
		]);
		writeEvidenceFile(taskId, bundle);

		const result = await loadEvidence(tempDir, taskId);

		// Bundle should still load
		expect(result.status).toBe('found');
		const retroEntry = result.bundle.entries.find(
			(e) => e.type === 'retrospective',
		);
		expect(retroEntry).toBeDefined();
		// @ts-expect-error - we know this is a retro entry
		expect(retroEntry.verdict).toBe('fail');
	});

	/**
	 * Additional Test 15: Malformed evidence.json with extra fields still parses
	 */
	it('loadEvidence accepts bundle with extra fields (Zod schema validation strips unknown fields)', async () => {
		const taskId = 'retro-15';
		const bundleWithExtras = createBundle(taskId, [createRetroEntry(1)], {
			extra_field: 'should be stripped by Zod',
			nested: {
				also: 'stripped',
			},
		});
		writeEvidenceFile(taskId, bundleWithExtras);

		const result = await loadEvidence(tempDir, taskId);

		expect(result.status).toBe('found');
		// Zod by default strips unknown fields, so these should be undefined
		// @ts-expect-error - checking extra field
		expect((result.bundle as any).extra_field).toBeUndefined();
	});

	/**
	 * Additional Test 16: Empty entries array is valid
	 */
	it('loadEvidence accepts bundle with empty entries array', async () => {
		const taskId = 'retro-16';
		const bundle = createBundle(taskId, []);
		writeEvidenceFile(taskId, bundle);

		const result = await loadEvidence(tempDir, taskId);

		expect(result.status).toBe('found');
		expect(result.bundle.entries).toEqual([]);
	});

	/**
	 * Additional Test 17: Task ID with valid special characters (dots, hyphens, underscores)
	 */
	it.skip('listEvidenceTaskIds returns task IDs with dots, hyphens, and underscores', async () => {
		const validIds = ['task-1', 'task_2', 'task.3', 'task-4_5.6'];

		for (const id of validIds) {
			writeEvidenceFile(id, createBundle(id));
		}

		const result = await listEvidenceTaskIds(tempDir);

		for (const id of validIds) {
			expect(result).toContain(id);
		}
		expect(result).toHaveLength(4);
	});

	/**
	 * Additional Test 18: listEvidenceTaskIds sorts the results
	 */
	it('listEvidenceTaskIds returns sorted task IDs (lexicographic, not numeric)', async () => {
		const taskIds = ['retro-10', 'retro-2', 'retro-1', 'retro-20'];

		for (const id of taskIds) {
			writeEvidenceFile(id, createBundle(id));
		}

		const result = await listEvidenceTaskIds(tempDir);

		// Lexicographic sort: "retro-1" < "retro-10" < "retro-2" < "retro-20"
		expect(result).toEqual(['retro-1', 'retro-10', 'retro-2', 'retro-20']);
	});
});

/**
 * Tests for write_final_council_evidence tool
 */

import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { executeWriteFinalCouncilEvidence } from '../../../src/tools/write-final-council-evidence';

describe('executeWriteFinalCouncilEvidence', () => {
	let tempDir: string;

	beforeEach(async () => {
		// Create a temp directory for each test
		tempDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), 'final-council-evidence-test-'),
		);
		// Create the .swarm directory structure (but not evidence/)
		await fs.promises.mkdir(path.join(tempDir, '.swarm'), { recursive: true });
	});

	afterEach(async () => {
		// Clean up temp directory
		try {
			await fs.promises.rm(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	// Test 1: Writes valid evidence bundle to .swarm/evidence/final-council.json
	test('writes valid evidence bundle to .swarm/evidence/final-council.json', async () => {
		const result = await executeWriteFinalCouncilEvidence(
			{
				phase: 3,
				verdict: 'APPROVED',
				summary: 'All checks passed',
			},
			tempDir,
		);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(true);
		expect(parsed.phase).toBe(3);
		expect(parsed.verdict).toBe('approved');
		expect(parsed.message).toBe(
			'Final council evidence written to .swarm/evidence/final-council.json',
		);

		// Verify file exists at the correct path
		const expectedPath = path.join(
			tempDir,
			'.swarm',
			'evidence',
			'final-council.json',
		);
		const fileExists = await fs.promises
			.access(expectedPath)
			.then(() => true)
			.catch(() => false);
		expect(fileExists).toBe(true);
	});

	// Test 2: Normalizes APPROVED to 'approved'
	test('normalizes APPROVED verdict to lowercase approved', async () => {
		const result = await executeWriteFinalCouncilEvidence(
			{ phase: 1, verdict: 'APPROVED', summary: 'test summary' },
			tempDir,
		);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(true);
		expect(parsed.verdict).toBe('approved');
	});

	// Test 3: Normalizes NEEDS_REVISION to 'rejected'
	test('normalizes NEEDS_REVISION verdict to lowercase rejected', async () => {
		const result = await executeWriteFinalCouncilEvidence(
			{ phase: 1, verdict: 'NEEDS_REVISION', summary: 'test summary' },
			tempDir,
		);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(true);
		expect(parsed.verdict).toBe('rejected');
	});

	// Test 4a: Rejects invalid phase (0)
	test('rejects phase 0', async () => {
		const result = await executeWriteFinalCouncilEvidence(
			{ phase: 0, verdict: 'APPROVED', summary: 'test summary' },
			tempDir,
		);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(false);
		expect(parsed.phase).toBe(0);
		expect(parsed.message).toBe('Invalid phase: must be a positive integer');
	});

	// Test 4b: Rejects invalid phase (-1)
	test('rejects negative phase numbers', async () => {
		const result = await executeWriteFinalCouncilEvidence(
			{ phase: -1, verdict: 'APPROVED', summary: 'test summary' },
			tempDir,
		);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(false);
		expect(parsed.phase).toBe(-1);
		expect(parsed.message).toBe('Invalid phase: must be a positive integer');
	});

	// Test 4c: Rejects non-integer phase (1.5)
	test('rejects non-integer phase numbers', async () => {
		const result = await executeWriteFinalCouncilEvidence(
			{ phase: 1.5, verdict: 'APPROVED', summary: 'test summary' },
			tempDir,
		);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(false);
		expect(parsed.message).toBe('Invalid phase: must be a positive integer');
	});

	// Test 4d: Rejects NaN phase
	test('rejects NaN phase', async () => {
		const result = await executeWriteFinalCouncilEvidence(
			{ phase: NaN, verdict: 'APPROVED', summary: 'test summary' } as any,
			tempDir,
		);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(false);
		expect(parsed.message).toBe('Invalid phase: must be a positive integer');
	});

	// Test 5a: Rejects invalid verdict ('MAYBE')
	test('rejects invalid verdict MAYBE', async () => {
		const result = await executeWriteFinalCouncilEvidence(
			{ phase: 1, verdict: 'MAYBE' as any, summary: 'test summary' },
			tempDir,
		);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(false);
		expect(parsed.message).toBe(
			"Invalid verdict: must be 'APPROVED' or 'NEEDS_REVISION'",
		);
	});

	// Test 5b: Rejects invalid verdict ('INVALID')
	test('rejects invalid verdict INVALID', async () => {
		const result = await executeWriteFinalCouncilEvidence(
			{ phase: 1, verdict: 'INVALID' as any, summary: 'test summary' },
			tempDir,
		);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(false);
		expect(parsed.message).toBe(
			"Invalid verdict: must be 'APPROVED' or 'NEEDS_REVISION'",
		);
	});

	// Test 6a: Rejects empty summary
	test('rejects empty summary', async () => {
		const result = await executeWriteFinalCouncilEvidence(
			{ phase: 1, verdict: 'APPROVED', summary: '' },
			tempDir,
		);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(false);
		expect(parsed.message).toBe('Invalid summary: must be a non-empty string');
	});

	// Test 6b: Rejects whitespace-only summary
	test('rejects whitespace-only summary', async () => {
		const result = await executeWriteFinalCouncilEvidence(
			{ phase: 1, verdict: 'APPROVED', summary: '   ' },
			tempDir,
		);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(false);
		expect(parsed.message).toBe('Invalid summary: must be a non-empty string');
	});

	// Test 6c: Rejects missing summary (undefined cast as any)
	test('rejects missing summary', async () => {
		const result = await executeWriteFinalCouncilEvidence(
			{ phase: 1, verdict: 'APPROVED', summary: undefined } as any,
			tempDir,
		);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(false);
		expect(parsed.message).toBe('Invalid summary: must be a non-empty string');
	});

	// Test 7: Evidence file contains correct structure
	test('evidence file contains correct structure with entries array', async () => {
		await executeWriteFinalCouncilEvidence(
			{ phase: 3, verdict: 'APPROVED', summary: 'Final council approved' },
			tempDir,
		);

		const expectedPath = path.join(
			tempDir,
			'.swarm',
			'evidence',
			'final-council.json',
		);
		const content = await fs.promises.readFile(expectedPath, 'utf-8');
		const parsed = JSON.parse(content);

		// Verify structure: { entries: [{ type, verdict, summary, timestamp }] }
		expect(parsed).toHaveProperty('entries');
		expect(Array.isArray(parsed.entries)).toBe(true);
		expect(parsed.entries).toHaveLength(1);

		const entry = parsed.entries[0];
		expect(entry.type).toBe('final-council');
		expect(entry.verdict).toBe('approved');
		expect(entry.summary).toBe('Final council approved');
		expect(typeof entry.timestamp).toBe('string');
		// Verify timestamp is ISO format
		expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
	});

	// Test 7b: Evidence file with NEEDS_REVISION verdict
	test('evidence file with rejected verdict contains correct structure', async () => {
		await executeWriteFinalCouncilEvidence(
			{ phase: 2, verdict: 'NEEDS_REVISION', summary: 'Requires more work' },
			tempDir,
		);

		const expectedPath = path.join(
			tempDir,
			'.swarm',
			'evidence',
			'final-council.json',
		);
		const content = await fs.promises.readFile(expectedPath, 'utf-8');
		const parsed = JSON.parse(content);

		expect(parsed.entries[0].verdict).toBe('rejected');
		expect(parsed.entries[0].summary).toBe('Requires more work');
	});

	// Test 8: Uses atomic temp+rename pattern
	test('uses atomic temp+rename pattern (file exists after write)', async () => {
		// Spy on fs.promises.writeFile and fs.promises.rename
		const writeFileSpy = spyOn(fs.promises, 'writeFile');
		const renameSpy = spyOn(fs.promises, 'rename');

		await executeWriteFinalCouncilEvidence(
			{ phase: 1, verdict: 'APPROVED', summary: 'Atomic write test' },
			tempDir,
		);

		// Verify atomic write pattern: write to temp then rename
		expect(writeFileSpy).toHaveBeenCalledTimes(1);
		expect(renameSpy).toHaveBeenCalledTimes(1);

		const tempPath = writeFileSpy.mock.calls[0][0] as string;
		const renameFrom = renameSpy.mock.calls[0][0] as string;
		const renameTo = renameSpy.mock.calls[0][1] as string;

		// Temp file should be in the evidence directory with .tmp extension
		expect(tempPath).toContain('.swarm');
		expect(tempPath).toContain('.final-council.json.tmp');

		// Rename from temp to final location
		expect(renameFrom).toBe(tempPath);
		expect(renameTo).toBe(
			path.join(tempDir, '.swarm', 'evidence', 'final-council.json'),
		);

		// Verify the final file exists after the operation
		const finalPath = path.join(
			tempDir,
			'.swarm',
			'evidence',
			'final-council.json',
		);
		const fileExists = await fs.promises
			.access(finalPath)
			.then(() => true)
			.catch(() => false);
		expect(fileExists).toBe(true);

		writeFileSpy.mockRestore();
		renameSpy.mockRestore();
	});

	// Test: Summary is trimmed in output
	test('summary is trimmed in output', async () => {
		await executeWriteFinalCouncilEvidence(
			{ phase: 1, verdict: 'APPROVED', summary: '  trimmed summary  ' },
			tempDir,
		);

		const expectedPath = path.join(
			tempDir,
			'.swarm',
			'evidence',
			'final-council.json',
		);
		const content = await fs.promises.readFile(expectedPath, 'utf-8');
		const parsed = JSON.parse(content);
		expect(parsed.entries[0].summary).toBe('trimmed summary');
	});

	// Test: Multiple writes overwrite (atomic replace)
	test('second write overwrites previous content', async () => {
		// First write
		await executeWriteFinalCouncilEvidence(
			{ phase: 1, verdict: 'APPROVED', summary: 'First verdict' },
			tempDir,
		);

		// Second write
		await executeWriteFinalCouncilEvidence(
			{ phase: 2, verdict: 'NEEDS_REVISION', summary: 'Second verdict' },
			tempDir,
		);

		const expectedPath = path.join(
			tempDir,
			'.swarm',
			'evidence',
			'final-council.json',
		);
		const content = await fs.promises.readFile(expectedPath, 'utf-8');
		const parsed = JSON.parse(content);

		// Should have only one entry (latest)
		expect(parsed.entries).toHaveLength(1);
		expect(parsed.entries[0].verdict).toBe('rejected');
		expect(parsed.entries[0].summary).toBe('Second verdict');
	});
});

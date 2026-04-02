/**
 * Tests for writeDriftEvidence tool
 */

import {
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

// Import the function to test
import { executeWriteDriftEvidence } from '../../../src/tools/write-drift-evidence';

describe('executeWriteDriftEvidence', () => {
	let tempDir: string;

	beforeEach(async () => {
		// Create a temp directory for each test
		tempDir = await fs.promises.mkdtemp(
			path.join(process.env.TEMP || '/tmp', 'drift-evidence-test-'),
		);
	});

	afterEach(async () => {
		// Clean up temp directory
		try {
			await fs.promises.rm(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	// Test 1: Positive integer phase validation
	test('rejects non-positive phase numbers', async () => {
		const result = await executeWriteDriftEvidence(
			{ phase: 0, verdict: 'APPROVED', summary: 'test summary' },
			tempDir,
		);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(false);
		expect(parsed.phase).toBe(0);
		expect(parsed.message).toBe('Invalid phase: must be a positive integer');
	});

	test('rejects negative phase numbers', async () => {
		const result = await executeWriteDriftEvidence(
			{ phase: -1, verdict: 'APPROVED', summary: 'test summary' },
			tempDir,
		);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(false);
		expect(parsed.phase).toBe(-1);
		expect(parsed.message).toBe('Invalid phase: must be a positive integer');
	});

	test('rejects non-integer phase numbers', async () => {
		const result = await executeWriteDriftEvidence(
			{ phase: 1.5, verdict: 'APPROVED', summary: 'test summary' },
			tempDir,
		);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(false);
		expect(parsed.message).toBe('Invalid phase: must be a positive integer');
	});

	// Test 2: Invalid verdict rejection
	test('rejects invalid verdict values', async () => {
		const result = await executeWriteDriftEvidence(
			{ phase: 1, verdict: 'INVALID_VERDICT' as any, summary: 'test summary' },
			tempDir,
		);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(false);
		expect(parsed.message).toBe(
			"Invalid verdict: must be 'APPROVED' or 'NEEDS_REVISION'",
		);
	});

	// Test 3: Empty summary rejection
	test('rejects empty summary', async () => {
		const result = await executeWriteDriftEvidence(
			{ phase: 1, verdict: 'APPROVED', summary: '' },
			tempDir,
		);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(false);
		expect(parsed.message).toBe('Invalid summary: must be a non-empty string');
	});

	test('rejects whitespace-only summary', async () => {
		const result = await executeWriteDriftEvidence(
			{ phase: 1, verdict: 'APPROVED', summary: '   ' },
			tempDir,
		);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(false);
		expect(parsed.message).toBe('Invalid summary: must be a non-empty string');
	});

	// Test 4: APPROVED verdict normalization to 'approved'
	test('normalizes APPROVED verdict to approved', async () => {
		const result = await executeWriteDriftEvidence(
			{ phase: 5, verdict: 'APPROVED', summary: 'All changes verified' },
			tempDir,
		);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(true);
		expect(parsed.verdict).toBe('approved');
		expect(parsed.phase).toBe(5);
	});

	// Test 5: NEEDS_REVISION verdict normalization to 'rejected'
	test('normalizes NEEDS_REVISION verdict to rejected', async () => {
		const result = await executeWriteDriftEvidence(
			{ phase: 3, verdict: 'NEEDS_REVISION', summary: 'Changes need revision' },
			tempDir,
		);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(true);
		expect(parsed.verdict).toBe('rejected');
		expect(parsed.phase).toBe(3);
	});

	// Test 6: Successful write with approved verdict
	test('writes evidence file successfully with approved verdict', async () => {
		const result = await executeWriteDriftEvidence(
			{
				phase: 1,
				verdict: 'APPROVED',
				summary: 'Phase 1 drift verification passed',
			},
			tempDir,
		);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(true);
		expect(parsed.phase).toBe(1);
		expect(parsed.verdict).toBe('approved');
		expect(parsed.message).toBe(
			'Drift evidence written to .swarm/evidence/1/drift-verifier.json',
		);

		// Verify file was created in correct location
		const expectedPath = path.join(
			tempDir,
			'.swarm',
			'evidence',
			'1',
			'drift-verifier.json',
		);
		const fileExists = await fs.promises
			.access(expectedPath)
			.then(() => true)
			.catch(() => false);
		expect(fileExists).toBe(true);

		// Verify the content includes gate-contract format
		const fileContent = await fs.promises.readFile(expectedPath, 'utf-8');
		const parsedContent = JSON.parse(fileContent);
		expect(parsedContent.entries).toBeArrayOfSize(1);
		expect(parsedContent.entries[0].type).toBe('drift-verification');
		expect(parsedContent.entries[0].verdict).toBe('approved');
		expect(parsedContent.entries[0].summary).toBe(
			'Phase 1 drift verification passed',
		);
		expect(parsedContent.entries[0].timestamp).toBeString();
	});

	// Test 7: Successful write with rejected verdict
	test('writes evidence file successfully with rejected verdict', async () => {
		const result = await executeWriteDriftEvidence(
			{
				phase: 2,
				verdict: 'NEEDS_REVISION',
				summary: 'Phase 2 drift issues found',
			},
			tempDir,
		);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(true);
		expect(parsed.phase).toBe(2);
		expect(parsed.verdict).toBe('rejected');

		// Verify the content includes rejected verdict
		const expectedPath = path.join(
			tempDir,
			'.swarm',
			'evidence',
			'2',
			'drift-verifier.json',
		);
		const fileContent = await fs.promises.readFile(expectedPath, 'utf-8');
		const parsedContent = JSON.parse(fileContent);
		expect(parsedContent.entries[0].verdict).toBe('rejected');
		expect(parsedContent.entries[0].summary).toBe('Phase 2 drift issues found');
	});

	// Test 8: Atomic write pattern (temp + rename)
	test('uses atomic write pattern with temp file and rename', async () => {
		// Spy on fs.promises.writeFile and fs.promises.rename to verify atomic pattern
		const writeFileSpy = spyOn(fs.promises, 'writeFile');
		const renameSpy = spyOn(fs.promises, 'rename');

		await executeWriteDriftEvidence(
			{ phase: 7, verdict: 'APPROVED', summary: 'Atomic write test' },
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
		expect(tempPath).toContain('.drift-verifier.json.tmp');

		// Rename from temp to final location
		expect(renameFrom).toBe(tempPath);
		expect(renameTo).toBe(
			path.join(tempDir, '.swarm', 'evidence', '7', 'drift-verifier.json'),
		);

		writeFileSpy.mockRestore();
		renameSpy.mockRestore();
	});

	test('summary is trimmed in output', async () => {
		await executeWriteDriftEvidence(
			{ phase: 1, verdict: 'APPROVED', summary: '  trimmed summary  ' },
			tempDir,
		);

		const expectedPath = path.join(
			tempDir,
			'.swarm',
			'evidence',
			'1',
			'drift-verifier.json',
		);
		const fileContent = await fs.promises.readFile(expectedPath, 'utf-8');
		const parsedContent = JSON.parse(fileContent);
		expect(parsedContent.entries[0].summary).toBe('trimmed summary');
	});
});

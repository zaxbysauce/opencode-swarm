/**
 * Test for requirementCoverage wiring in write_drift_evidence tool
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { executeWriteDriftEvidence } from '../tools/write-drift-evidence';

describe('executeWriteDriftEvidence with requirementCoverage', () => {
	let tempDir: string;

	beforeEach(async () => {
		// Create temp directory with .swarm subdirectory (required by validateSwarmPath)
		tempDir = path.join(
			import.meta.dir,
			'tmp-requirement-coverage-test-' +
				Date.now() +
				'-' +
				Math.random().toString(36).slice(2),
		);
		await fs.promises.mkdir(path.join(tempDir, '.swarm'), { recursive: true });
	});

	afterEach(async () => {
		// Clean up temp directory
		try {
			await fs.promises.rm(tempDir, { force: true, recursive: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	test('writes requirementCoverage to output JSON file when provided', async () => {
		const reqCoverage = JSON.stringify({
			total: 10,
			covered: 8,
			coverage: '80%',
		});

		const result = await executeWriteDriftEvidence(
			{
				phase: 5,
				verdict: 'APPROVED',
				summary: 'Drift verification passed',
				requirementCoverage: reqCoverage,
			},
			tempDir,
		);

		const resultObj = JSON.parse(result);
		expect(resultObj.success).toBe(true);

		// Read the output file and verify requirementCoverage is present
		const evidencePath = path.join(
			tempDir,
			'.swarm',
			'evidence',
			'5',
			'drift-verifier.json',
		);
		const content = await fs.promises.readFile(evidencePath, 'utf-8');
		const evidence = JSON.parse(content);

		expect(evidence.entries).toHaveLength(1);
		expect(evidence.entries[0].type).toBe('drift-verification');
		expect(evidence.entries[0].verdict).toBe('approved');
		expect(evidence.entries[0].summary).toBe('Drift verification passed');
		expect(evidence.entries[0].requirementCoverage).toBe(reqCoverage);
	});

	test('does not include requirementCoverage field when not provided', async () => {
		const result = await executeWriteDriftEvidence(
			{
				phase: 3,
				verdict: 'NEEDS_REVISION',
				summary: 'Drift issues found',
			},
			tempDir,
		);

		const resultObj = JSON.parse(result);
		expect(resultObj.success).toBe(true);

		// Read the output file and verify requirementCoverage is NOT present
		const evidencePath = path.join(
			tempDir,
			'.swarm',
			'evidence',
			'3',
			'drift-verifier.json',
		);
		const content = await fs.promises.readFile(evidencePath, 'utf-8');
		const evidence = JSON.parse(content);

		expect(evidence.entries).toHaveLength(1);
		expect(evidence.entries[0].type).toBe('drift-verification');
		expect(evidence.entries[0].verdict).toBe('rejected');
		expect(evidence.entries[0].requirementCoverage).toBeUndefined();
	});
});

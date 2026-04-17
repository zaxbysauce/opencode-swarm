/**
 * Tests for write_hallucination_evidence tool
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { executeWriteHallucinationEvidence } from '../../../src/tools/write-hallucination-evidence';

describe('executeWriteHallucinationEvidence', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), 'hallucination-evidence-test-'),
		);
		await fs.promises.mkdir(path.join(tempDir, '.swarm'), { recursive: true });
	});

	afterEach(async () => {
		try {
			await fs.promises.rm(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	test('valid APPROVED input writes evidence file with approved verdict', async () => {
		const result = await executeWriteHallucinationEvidence(
			{
				phase: 1,
				verdict: 'APPROVED',
				summary: 'All APIs verified. No fabrications detected.',
			},
			tempDir,
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(true);
		expect(parsed.verdict).toBe('approved');

		const evidencePath = path.join(
			tempDir,
			'.swarm',
			'evidence',
			'1',
			'hallucination-guard.json',
		);
		expect(fs.existsSync(evidencePath)).toBe(true);
		const content = JSON.parse(fs.readFileSync(evidencePath, 'utf-8'));
		expect(content.entries).toHaveLength(1);
		expect(content.entries[0].type).toBe('hallucination-verification');
		expect(content.entries[0].verdict).toBe('approved');
	});

	test('valid NEEDS_REVISION input writes evidence file with rejected verdict', async () => {
		const result = await executeWriteHallucinationEvidence(
			{
				phase: 2,
				verdict: 'NEEDS_REVISION',
				summary: 'Fabricated API detected: foobar() in express.',
				findings: '- API Existence: FABRICATED — foobar not in express package',
			},
			tempDir,
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(true);
		expect(parsed.verdict).toBe('rejected');

		const evidencePath = path.join(
			tempDir,
			'.swarm',
			'evidence',
			'2',
			'hallucination-guard.json',
		);
		const content = JSON.parse(fs.readFileSync(evidencePath, 'utf-8'));
		expect(content.entries[0].verdict).toBe('rejected');
		expect(content.entries[0].findings).toBeDefined();
	});

	test('invalid phase (0) returns success: false', async () => {
		const result = await executeWriteHallucinationEvidence(
			{ phase: 0, verdict: 'APPROVED', summary: 'Test' },
			tempDir,
		);
		expect(JSON.parse(result).success).toBe(false);
	});

	test('invalid phase (negative) returns success: false', async () => {
		const result = await executeWriteHallucinationEvidence(
			{ phase: -1, verdict: 'APPROVED', summary: 'Test' },
			tempDir,
		);
		expect(JSON.parse(result).success).toBe(false);
	});

	test('invalid verdict string returns success: false', async () => {
		const result = await executeWriteHallucinationEvidence(
			{ phase: 1, verdict: 'UNKNOWN' as 'APPROVED', summary: 'Test' },
			tempDir,
		);
		expect(JSON.parse(result).success).toBe(false);
	});

	test('empty summary returns success: false', async () => {
		const result = await executeWriteHallucinationEvidence(
			{ phase: 1, verdict: 'APPROVED', summary: '   ' },
			tempDir,
		);
		expect(JSON.parse(result).success).toBe(false);
	});

	test('does NOT write ledger snapshot or lock QA profile', async () => {
		await executeWriteHallucinationEvidence(
			{
				phase: 1,
				verdict: 'APPROVED',
				summary: 'All verified.',
			},
			tempDir,
		);

		// No ledger should be created (write_drift_evidence creates one; we should not)
		const ledgerPath = path.join(tempDir, '.swarm', 'events.jsonl');
		expect(fs.existsSync(ledgerPath)).toBe(false);

		// No QA profile lock should be set (no swarm.db interaction)
		const dbPath = path.join(tempDir, '.swarm', 'swarm.db');
		expect(fs.existsSync(dbPath)).toBe(false);
	});

	test('creates nested evidence directory if not present', async () => {
		const result = await executeWriteHallucinationEvidence(
			{ phase: 5, verdict: 'APPROVED', summary: 'OK' },
			tempDir,
		);
		expect(JSON.parse(result).success).toBe(true);
		const dir = path.join(tempDir, '.swarm', 'evidence', '5');
		expect(fs.existsSync(dir)).toBe(true);
	});
});

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EvidenceBundleSchema } from '../../../src/config/evidence-schema';
import { loadEvidence } from '../../../src/evidence/manager';

let tempDir: string;

beforeEach(() => {
	tempDir = join(
		tmpdir(),
		`flat-retro-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	mkdirSync(join(tempDir, '.swarm'), { recursive: true });
});

afterEach(() => {
	rmSync(tempDir, { recursive: true, force: true });
});

describe('loadEvidence flat retrospective detection', () => {
	/**
	 * Test 1: Flat retrospective object (legacy format without EvidenceBundle wrapper)
	 * should return { status: 'found', bundle } instead of 'invalid_schema'
	 */
	it('should return found for flat retrospective object instead of invalid_schema', async () => {
		// Create a flat retrospective file (legacy format - just the evidence object, no wrapper)
		const flatRetro = {
			type: 'retrospective',
			task_id: 'retro-1',
			timestamp: '2024-01-01T00:00:00.000Z',
			agent: 'test-agent',
			verdict: 'info',
			summary: 'Sprint retrospective',
			phase_number: 1,
			total_tool_calls: 100,
			coder_revisions: 5,
			reviewer_rejections: 2,
			test_failures: 1,
			security_findings: 0,
			integration_issues: 0,
			task_count: 10,
			task_complexity: 'moderate',
			top_rejection_reasons: [],
			lessons_learned: [],
		};

		const evidenceDir = join(tempDir, '.swarm', 'evidence', 'retro-1');
		mkdirSync(evidenceDir, { recursive: true });
		writeFileSync(
			join(evidenceDir, 'evidence.json'),
			JSON.stringify(flatRetro),
		);

		const result = await loadEvidence(tempDir, 'retro-1');

		// Should return 'found' status, not 'invalid_schema'
		expect(result.status).toBe('found');
		if (result.status !== 'found') return;

		// The wrapped bundle should pass Zod validation
		const validated = EvidenceBundleSchema.parse(result.bundle);
		expect(validated.schema_version).toBe('1.0.0');
		expect(validated.task_id).toBe('retro-1');
		expect(validated.entries).toHaveLength(1);
		expect(validated.entries[0].type).toBe('retrospective');
	});

	/**
	 * Test 2: The wrapped bundle passes EvidenceBundleSchema.parse()
	 * (flat retrospective with all required fields)
	 */
	it('wrapped bundle should pass EvidenceBundleSchema validation', async () => {
		// Flat retrospective with all required fields for the retrospective type
		const flatRetro = {
			type: 'retrospective',
			task_id: 'retro-2', // Required field in the entry
			timestamp: '2024-01-01T00:00:00.000Z',
			agent: 'test-agent',
			verdict: 'info',
			summary: 'Sprint retrospective',
			phase_number: 1,
			total_tool_calls: 100,
			coder_revisions: 5,
			reviewer_rejections: 2,
			test_failures: 1,
			security_findings: 0,
			integration_issues: 0,
			task_count: 10,
			task_complexity: 'moderate',
			top_rejection_reasons: [],
			lessons_learned: [],
		};

		const evidenceDir = join(tempDir, '.swarm', 'evidence', 'retro-2');
		mkdirSync(evidenceDir, { recursive: true });
		writeFileSync(
			join(evidenceDir, 'evidence.json'),
			JSON.stringify(flatRetro),
		);

		const result = await loadEvidence(tempDir, 'retro-2');

		expect(result.status).toBe('found');
		if (result.status !== 'found') return;

		// This should NOT throw - validates the bundle is correct
		expect(() => EvidenceBundleSchema.parse(result.bundle)).not.toThrow();
	});

	/**
	 * Test 3: Incomplete flat retrospective (missing required fields) should return invalid_schema
	 */
	it('incomplete flat retrospective should return invalid_schema', async () => {
		// Flat retrospective missing required fields for the retrospective type
		const flatRetro = {
			type: 'retrospective',
			timestamp: '2024-01-01T00:00:00.000Z',
			// Missing: agent, verdict, summary, phase_number, total_tool_calls,
			// coder_revisions, reviewer_rejections, test_failures, security_findings,
			// integration_issues, task_count, task_complexity
		};

		const evidenceDir = join(tempDir, '.swarm', 'evidence', 'bad-incomplete');
		mkdirSync(evidenceDir, { recursive: true });
		writeFileSync(
			join(evidenceDir, 'evidence.json'),
			JSON.stringify(flatRetro),
		);

		const result = await loadEvidence(tempDir, 'bad-incomplete');

		// Should return 'invalid_schema' for incomplete flat retrospective
		expect(result.status).toBe('invalid_schema');
		if (result.status !== 'invalid_schema') return;
		expect(result.errors.length).toBeGreaterThan(0);
	});

	/**
	 * Test 4: Non-retrospective malformed files should still return invalid_schema
	 */
	it('non-retrospective malformed files should still return invalid_schema', async () => {
		// Malformed file - missing required fields for a proper bundle
		const malformed = {
			type: 'note', // not a retrospective
			summary: 'Incomplete note - missing required fields',
		};

		const evidenceDir = join(tempDir, '.swarm', 'evidence', 'bad-1');
		mkdirSync(evidenceDir, { recursive: true });
		writeFileSync(
			join(evidenceDir, 'evidence.json'),
			JSON.stringify(malformed),
		);

		const result = await loadEvidence(tempDir, 'bad-1');

		// Should return 'invalid_schema' for non-retrospective malformed files
		expect(result.status).toBe('invalid_schema');
		if (result.status !== 'invalid_schema') return;
		expect(result.errors.length).toBeGreaterThan(0);
	});

	/**
	 * Test 5: Invalid JSON should still return invalid_schema
	 */
	it('invalid JSON should still return invalid_schema', async () => {
		const evidenceDir = join(tempDir, '.swarm', 'evidence', 'bad-2');
		mkdirSync(evidenceDir, { recursive: true });
		writeFileSync(join(evidenceDir, 'evidence.json'), 'not valid json {');

		const result = await loadEvidence(tempDir, 'bad-2');

		expect(result.status).toBe('invalid_schema');
		if (result.status !== 'invalid_schema') return;
		expect(result.errors).toContain('Invalid JSON');
	});

	/**
	 * Test 6: Valid wrapped bundle should still work normally
	 */
	it('valid wrapped bundle should still work normally', async () => {
		// Proper EvidenceBundle format
		const validBundle = {
			schema_version: '1.0.0',
			task_id: 'good-1',
			created_at: '2024-01-01T00:00:00.000Z',
			updated_at: '2024-01-01T00:00:00.000Z',
			entries: [
				{
					type: 'note',
					task_id: 'good-1',
					timestamp: '2024-01-01T00:00:00.000Z',
					agent: 'test-agent',
					verdict: 'info',
					summary: 'Valid note',
				},
			],
		};

		const evidenceDir = join(tempDir, '.swarm', 'evidence', 'good-1');
		mkdirSync(evidenceDir, { recursive: true });
		writeFileSync(
			join(evidenceDir, 'evidence.json'),
			JSON.stringify(validBundle),
		);

		const result = await loadEvidence(tempDir, 'good-1');

		expect(result.status).toBe('found');
		if (result.status !== 'found') return;
		expect(result.bundle.task_id).toBe('good-1');
		expect(result.bundle.entries).toHaveLength(1);
	});
});

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EvidenceBundleSchema } from '../../../src/config/evidence-schema';
import { loadEvidence } from '../../../src/evidence/manager';

let tempDir: string;

beforeEach(() => {
	tempDir = join(
		tmpdir(),
		`legacy-complexity-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	mkdirSync(join(tempDir, '.swarm'), { recursive: true });
});

afterEach(() => {
	rmSync(tempDir, { recursive: true, force: true });
});

describe('Legacy task_complexity remapping', () => {
	/**
	 * Test: Legacy 'low' task_complexity is remapped to 'simple'
	 */
	it('remaps legacy "low" to "simple"', async () => {
		const flatRetro = {
			type: 'retrospective',
			task_id: 'legacy-low',
			timestamp: '2024-01-01T00:00:00.000Z',
			agent: 'test-agent',
			verdict: 'info',
			summary: 'Test retrospective',
			phase_number: 1,
			total_tool_calls: 100,
			coder_revisions: 5,
			reviewer_rejections: 2,
			test_failures: 1,
			security_findings: 0,
			integration_issues: 0,
			task_count: 10,
			task_complexity: 'low', // Legacy value
			top_rejection_reasons: [],
			lessons_learned: [],
		};

		const evidenceDir = join(tempDir, '.swarm', 'evidence', 'legacy-low');
		mkdirSync(evidenceDir, { recursive: true });
		writeFileSync(
			join(evidenceDir, 'evidence.json'),
			JSON.stringify(flatRetro),
		);

		const result = await loadEvidence(tempDir, 'legacy-low');

		expect(result.status).toBe('found');
		if (result.status !== 'found') return;

		const entry = result.bundle.entries[0] as Record<string, unknown>;

		// Verify the remapped value
		expect(entry.task_complexity).toBe('simple');

		// Verify it validates against EvidenceBundleSchema
		const validated = EvidenceBundleSchema.parse(result.bundle);
		const validatedEntry = validated.entries[0] as Record<string, unknown>;
		expect(validatedEntry.task_complexity).toBe('simple');
	});

	/**
	 * Test: Legacy 'medium' task_complexity is remapped to 'moderate'
	 */
	it('remaps legacy "medium" to "moderate"', async () => {
		const flatRetro = {
			type: 'retrospective',
			task_id: 'legacy-medium',
			timestamp: '2024-01-01T00:00:00.000Z',
			agent: 'test-agent',
			verdict: 'info',
			summary: 'Test retrospective',
			phase_number: 1,
			total_tool_calls: 100,
			coder_revisions: 5,
			reviewer_rejections: 2,
			test_failures: 1,
			security_findings: 0,
			integration_issues: 0,
			task_count: 10,
			task_complexity: 'medium', // Legacy value
			top_rejection_reasons: [],
			lessons_learned: [],
		};

		const evidenceDir = join(tempDir, '.swarm', 'evidence', 'legacy-medium');
		mkdirSync(evidenceDir, { recursive: true });
		writeFileSync(
			join(evidenceDir, 'evidence.json'),
			JSON.stringify(flatRetro),
		);

		const result = await loadEvidence(tempDir, 'legacy-medium');

		expect(result.status).toBe('found');
		if (result.status !== 'found') return;

		const entry = result.bundle.entries[0] as Record<string, unknown>;

		// Verify the remapped value
		expect(entry.task_complexity).toBe('moderate');

		// Verify it validates against EvidenceBundleSchema
		const validated = EvidenceBundleSchema.parse(result.bundle);
		const validatedEntry = validated.entries[0] as Record<string, unknown>;
		expect(validatedEntry.task_complexity).toBe('moderate');
	});

	/**
	 * Test: Legacy 'high' task_complexity is remapped to 'complex'
	 */
	it('remaps legacy "high" to "complex"', async () => {
		const flatRetro = {
			type: 'retrospective',
			task_id: 'legacy-high',
			timestamp: '2024-01-01T00:00:00.000Z',
			agent: 'test-agent',
			verdict: 'info',
			summary: 'Test retrospective',
			phase_number: 1,
			total_tool_calls: 100,
			coder_revisions: 5,
			reviewer_rejections: 2,
			test_failures: 1,
			security_findings: 0,
			integration_issues: 0,
			task_count: 10,
			task_complexity: 'high', // Legacy value
			top_rejection_reasons: [],
			lessons_learned: [],
		};

		const evidenceDir = join(tempDir, '.swarm', 'evidence', 'legacy-high');
		mkdirSync(evidenceDir, { recursive: true });
		writeFileSync(
			join(evidenceDir, 'evidence.json'),
			JSON.stringify(flatRetro),
		);

		const result = await loadEvidence(tempDir, 'legacy-high');

		expect(result.status).toBe('found');
		if (result.status !== 'found') return;

		const entry = result.bundle.entries[0] as Record<string, unknown>;

		// Verify the remapped value
		expect(entry.task_complexity).toBe('complex');

		// Verify it validates against EvidenceBundleSchema
		const validated = EvidenceBundleSchema.parse(result.bundle);
		const validatedEntry = validated.entries[0] as Record<string, unknown>;
		expect(validatedEntry.task_complexity).toBe('complex');
	});

	/**
	 * Test: Non-legacy task_complexity values are not modified
	 */
	it('preserves non-legacy task_complexity values', async () => {
		const flatRetro = {
			type: 'retrospective',
			task_id: 'non-legacy',
			timestamp: '2024-01-01T00:00:00.000Z',
			agent: 'test-agent',
			verdict: 'info',
			summary: 'Test retrospective',
			phase_number: 1,
			total_tool_calls: 100,
			coder_revisions: 5,
			reviewer_rejections: 2,
			test_failures: 1,
			security_findings: 0,
			integration_issues: 0,
			task_count: 10,
			task_complexity: 'trivial', // Non-legacy value
			top_rejection_reasons: [],
			lessons_learned: [],
		};

		const evidenceDir = join(tempDir, '.swarm', 'evidence', 'non-legacy');
		mkdirSync(evidenceDir, { recursive: true });
		writeFileSync(
			join(evidenceDir, 'evidence.json'),
			JSON.stringify(flatRetro),
		);

		const result = await loadEvidence(tempDir, 'non-legacy');

		expect(result.status).toBe('found');
		if (result.status !== 'found') return;

		const entry = result.bundle.entries[0] as Record<string, unknown>;

		// Verify the value is preserved
		expect(entry.task_complexity).toBe('trivial');
	});

	/**
	 * Test: Repaired file is persisted to disk with remapped values
	 */
	it('persists repaired flat retrospective to disk with remapped values', async () => {
		const flatRetro = {
			type: 'retrospective',
			task_id: 'persist-test',
			timestamp: '2024-01-01T00:00:00.000Z',
			agent: 'test-agent',
			verdict: 'info',
			summary: 'Test retrospective',
			phase_number: 1,
			total_tool_calls: 100,
			coder_revisions: 5,
			reviewer_rejections: 2,
			test_failures: 1,
			security_findings: 0,
			integration_issues: 0,
			task_count: 10,
			task_complexity: 'low', // Legacy value
			top_rejection_reasons: [],
			lessons_learned: [],
		};

		const evidencePath = join(
			tempDir,
			'.swarm',
			'evidence',
			'persist-test',
			'evidence.json',
		);
		mkdirSync(join(tempDir, '.swarm', 'evidence', 'persist-test'), {
			recursive: true,
		});
		writeFileSync(evidencePath, JSON.stringify(flatRetro));

		// First load - triggers repair
		const result = await loadEvidence(tempDir, 'persist-test');
		expect(result.status).toBe('found');

		// Read the file directly from disk
		const persistedContent = readFileSync(evidencePath, 'utf-8');
		const persisted = JSON.parse(persistedContent) as Record<string, unknown>;

		// Verify the file now has schema_version (wrapped format)
		expect(persisted.schema_version).toBe('1.0.0');

		// Verify the remapped value is persisted
		const persistedEntry = persisted.entries?.[0] as Record<string, unknown>;
		expect(persistedEntry?.task_complexity).toBe('simple');

		// Verify it validates against EvidenceBundleSchema
		const validated = EvidenceBundleSchema.parse(persisted);
		const validatedEntry = validated.entries[0] as Record<string, unknown>;
		expect(validatedEntry.task_complexity).toBe('simple');
	});

	/**
	 * Test: All legacy complexity values remapped and persisted correctly
	 */
	it('handles all three legacy complexity values in sequence', async () => {
		const legacyValues = [
			{ task_id: 'test-low', task_complexity: 'low', expected: 'simple' },
			{
				task_id: 'test-medium',
				task_complexity: 'medium',
				expected: 'moderate',
			},
			{ task_id: 'test-high', task_complexity: 'high', expected: 'complex' },
		];

		for (const { task_id, task_complexity, expected } of legacyValues) {
			const flatRetro = {
				type: 'retrospective',
				task_id,
				timestamp: '2024-01-01T00:00:00.000Z',
				agent: 'test-agent',
				verdict: 'info',
				summary: 'Test retrospective',
				phase_number: 1,
				total_tool_calls: 100,
				coder_revisions: 5,
				reviewer_rejections: 2,
				test_failures: 1,
				security_findings: 0,
				integration_issues: 0,
				task_count: 10,
				task_complexity,
				top_rejection_reasons: [],
				lessons_learned: [],
			};

			const evidencePath = join(
				tempDir,
				'.swarm',
				'evidence',
				task_id,
				'evidence.json',
			);
			mkdirSync(join(tempDir, '.swarm', 'evidence', task_id), {
				recursive: true,
			});
			writeFileSync(evidencePath, JSON.stringify(flatRetro));

			const result = await loadEvidence(tempDir, task_id);
			expect(result.status).toBe('found');
			if (result.status !== 'found') continue;

			// Verify remapped value in result
			const entry = result.bundle.entries[0] as Record<string, unknown>;
			expect(entry.task_complexity).toBe(expected);

			// Verify persisted file has remapped value
			const persistedContent = readFileSync(evidencePath, 'utf-8');
			const persisted = JSON.parse(persistedContent) as Record<string, unknown>;
			const persistedEntry = persisted.entries?.[0] as Record<string, unknown>;
			expect(persistedEntry?.task_complexity).toBe(expected);

			// Verify validates against schema
			const validated = EvidenceBundleSchema.parse(persisted);
			const validatedEntry = validated.entries[0] as Record<string, unknown>;
			expect(validatedEntry.task_complexity).toBe(expected);
		}
	});
});

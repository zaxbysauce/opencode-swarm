import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EvidenceBundle } from '../../../src/config/evidence-schema';
import {
	listEvidenceTaskIds,
	loadEvidence,
} from '../../../src/evidence/manager';

describe('Task 2.1: System Enhancer Retrospective Injection', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'swarm-retro-21-test-'));
	});

	afterEach(async () => {
		try {
			await rm(tempDir, { recursive: true, force: true });
		} catch {}
	});

	async function createRetroBundle(
		phaseNumber: number,
		verdict: 'pass' | 'fail' | 'info',
		lessons: string[] = [],
		rejections: string[] = [],
		summary: string = 'Phase completed.',
	): Promise<string> {
		const taskDir = join(tempDir, '.swarm', 'evidence', `retro-${phaseNumber}`);
		await mkdir(taskDir, { recursive: true });

		const bundle: EvidenceBundle = {
			schema_version: '1.0.0',
			task_id: `retro-${phaseNumber}`,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			entries: [
				{
					type: 'retrospective',
					task_id: `retro-${phaseNumber}`,
					timestamp: new Date().toISOString(),
					agent: 'architect',
					verdict,
					summary,
					phase_number: phaseNumber,
					total_tool_calls: 42,
					coder_revisions: 2,
					reviewer_rejections: rejections.length,
					test_failures: 0,
					security_findings: 0,
					integration_issues: 0,
					task_count: 5,
					task_complexity: 'moderate',
					top_rejection_reasons: rejections,
					lessons_learned: lessons,
				},
			],
		};

		const bundlePath = join(taskDir, 'evidence.json');
		await writeFile(bundlePath, JSON.stringify(bundle, null, 2));
		return bundlePath;
	}

	function getRetrospectiveEntry(bundle: EvidenceBundle) {
		return bundle.entries.find((e) => e.type === 'retrospective');
	}

	describe('loadEvidence', () => {
		it('returns the retro bundle when retro-1/evidence.json exists with valid retrospective entry', async () => {
			// Create retro-1 bundle with pass verdict
			await createRetroBundle(
				1,
				'pass',
				['lesson A', 'lesson B'],
				['reason X'],
				'Phase 1 completed successfully.',
			);

			// Load the bundle
			const result = await loadEvidence(tempDir, 'retro-1');

			// Assert bundle is loaded correctly
			expect(result.status).toBe('found');
			expect(result.bundle.task_id).toBe('retro-1');
			expect(result.bundle.entries.length).toBe(1);
			expect(result.bundle.entries[0].type).toBe('retrospective');
		});

		it('returns not_found when the directory does not exist', async () => {
			// Try to load from non-existent directory
			const result = await loadEvidence(tempDir, 'retro-99');

			// Should return not_found
			expect(result.status).toBe('not_found');
		});

		it('returns bundle for retro with verdict "fail" (when filtered by caller)', async () => {
			// Create retro-2 bundle with fail verdict
			await createRetroBundle(2, 'fail', [], [], 'Phase 2 failed.');

			// Load the bundle - should still load the data
			const result = await loadEvidence(tempDir, 'retro-2');

			// The bundle should load successfully (loadEvidence doesn't filter by verdict)
			expect(result.status).toBe('found');
			const entry = getRetrospectiveEntry(result.bundle);
			expect(entry?.verdict).toBe('fail');
			// But caller (buildRetroInjection) should skip it
		});

		it('loads a retro bundle with phase_number=1, lessons_learned, top_rejection_reasons, verdict=pass correctly', async () => {
			// Create retro-1 bundle with specific fields
			await createRetroBundle(
				1,
				'pass',
				['lesson A', 'lesson B'],
				['reason X', 'reason Y'],
				'Phase 1 completed.',
			);

			// Load the bundle
			const result = await loadEvidence(tempDir, 'retro-1');

			// Assert all fields are loaded correctly
			expect(result.status).toBe('found');
			const entry = getRetrospectiveEntry(result.bundle);
			expect(entry?.type).toBe('retrospective');
			expect((entry as any).phase_number).toBe(1);
			expect((entry as any).lessons_learned).toEqual(['lesson A', 'lesson B']);
			expect((entry as any).top_rejection_reasons).toEqual([
				'reason X',
				'reason Y',
			]);
			expect(entry?.verdict).toBe('pass');
		});

		it('loads a retro bundle with verdict="fail" correctly (data is present)', async () => {
			// Create retro-1 bundle with fail verdict
			await createRetroBundle(
				1,
				'fail',
				['lesson about failure'],
				['reason for failure'],
				'Phase 1 failed.',
			);

			// Load the bundle
			const result = await loadEvidence(tempDir, 'retro-1');

			// Assert bundle loads with fail verdict intact
			expect(result.status).toBe('found');
			const entry = getRetrospectiveEntry(result.bundle);
			expect(entry?.verdict).toBe('fail');
			expect((entry as any).lessons_learned).toEqual(['lesson about failure']);
			expect((entry as any).top_rejection_reasons).toEqual([
				'reason for failure',
			]);
		});

		it('returns invalid_schema when evidence.json has invalid schema', async () => {
			// Create directory with invalid JSON
			const taskDir = join(tempDir, '.swarm', 'evidence', 'retro-1');
			await mkdir(taskDir, { recursive: true });
			const bundlePath = join(taskDir, 'evidence.json');
			await writeFile(bundlePath, '{ invalid json }');

			// Load should return invalid_schema due to validation failure
			const result = await loadEvidence(tempDir, 'retro-1');
			expect(result.status).toBe('invalid_schema');
		});
	});

	describe('listEvidenceTaskIds', () => {
		it("returns 'retro-1' when only retro-1 bundle exists", async () => {
			// Create retro-1 bundle
			await createRetroBundle(1, 'pass');

			// List task IDs
			const taskIds = await listEvidenceTaskIds(tempDir);

			// Should contain only retro-1
			expect(taskIds).toEqual(['retro-1']);
		});

		it('returns sorted array of multiple retro task IDs', async () => {
			// Create multiple retro bundles
			await createRetroBundle(1, 'pass');
			await createRetroBundle(3, 'pass');
			await createRetroBundle(2, 'pass');

			// List task IDs
			const taskIds = await listEvidenceTaskIds(tempDir);

			// Should be sorted
			expect(taskIds).toEqual(['retro-1', 'retro-2', 'retro-3']);
		});

		it('returns empty array when no evidence bundles exist', async () => {
			// Create empty .swarm directory
			await mkdir(join(tempDir, '.swarm', 'evidence'), { recursive: true });

			// List task IDs
			const taskIds = await listEvidenceTaskIds(tempDir);

			// Should be empty
			expect(taskIds).toEqual([]);
		});

		it('returns empty array when evidence directory does not exist', async () => {
			// Don't create any directories
			const taskIds = await listEvidenceTaskIds(tempDir);
			expect(taskIds).toEqual([]);
		});
	});

	describe('Integration: retro bundle structure', () => {
		it('creates a valid evidence bundle with all required RetrospectiveEvidence fields', async () => {
			// Create retro-1 with all required fields
			await createRetroBundle(
				1,
				'pass',
				['lesson A', 'lesson B'],
				['reason X'],
				'Phase completed.',
			);

			// Load and validate
			const result = await loadEvidence(tempDir, 'retro-1');
			expect(result.status).toBe('found');

			const entry = getRetrospectiveEntry(result.bundle);
			expect(entry?.type).toBe('retrospective');
			expect(entry?.task_id).toBe('retro-1');
			expect(entry?.agent).toBe('architect');
			expect(entry?.timestamp).toBeDefined();
			expect(entry?.summary).toBe('Phase completed.');

			// Retrospective-specific fields
			const retroEntry = entry as any;
			expect(retroEntry.phase_number).toBe(1);
			expect(retroEntry.total_tool_calls).toBe(42);
			expect(retroEntry.coder_revisions).toBe(2);
			expect(retroEntry.reviewer_rejections).toBe(1);
			expect(retroEntry.test_failures).toBe(0);
			expect(retroEntry.security_findings).toBe(0);
			expect(retroEntry.integration_issues).toBe(0);
			expect(retroEntry.task_count).toBe(5);
			expect(retroEntry.task_complexity).toBe('moderate');
		});

		it('creates multiple entries in a single bundle', async () => {
			// Create a bundle with multiple entries
			const taskDir = join(tempDir, '.swarm', 'evidence', 'retro-1');
			await mkdir(taskDir, { recursive: true });

			const bundle: EvidenceBundle = {
				schema_version: '1.0.0',
				task_id: 'retro-1',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				entries: [
					{
						type: 'retrospective',
						task_id: 'retro-1',
						timestamp: new Date().toISOString(),
						agent: 'architect',
						verdict: 'pass',
						summary: 'Phase completed.',
						phase_number: 1,
						total_tool_calls: 42,
						coder_revisions: 2,
						reviewer_rejections: 0,
						test_failures: 0,
						security_findings: 0,
						integration_issues: 0,
						task_count: 5,
						task_complexity: 'moderate',
						top_rejection_reasons: [],
						lessons_learned: ['lesson A'],
					},
					{
						type: 'note',
						task_id: 'retro-1',
						timestamp: new Date().toISOString(),
						agent: 'architect',
						verdict: 'info',
						summary: 'Additional note',
					},
				],
			};

			const bundlePath = join(taskDir, 'evidence.json');
			await writeFile(bundlePath, JSON.stringify(bundle, null, 2));

			// Load and verify both entries
			const result = await loadEvidence(tempDir, 'retro-1');
			expect(result.status).toBe('found');
			expect(result.bundle.entries.length).toBe(2);
			expect(result.bundle.entries[0].type).toBe('retrospective');
			expect(result.bundle.entries[1].type).toBe('note');
		});
	});
});

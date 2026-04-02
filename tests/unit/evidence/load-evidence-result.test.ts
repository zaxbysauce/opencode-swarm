import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	type LoadEvidenceResult,
	loadEvidence,
} from '../../../src/evidence/manager.js';

// Helper function to write evidence file to a task directory
async function writeEvidenceFile(
	tempDir: string,
	taskId: string,
	content: string,
): Promise<void> {
	const dir = join(tempDir, '.swarm', 'evidence', taskId);
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, 'evidence.json'), content);
}

// Helper function to create a valid evidence bundle JSON string
function makeValidBundle(taskId: string, entries: unknown[] = []): string {
	return JSON.stringify({
		schema_version: '1.0.0',
		task_id: taskId,
		entries,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
	});
}

describe('loadEvidence LoadEvidenceResult discriminated union', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'load-evidence-test-'));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	// ===========================================================================
	// Group 1: not_found status
	// ===========================================================================

	describe('not_found status', () => {
		it('returns { status: "not_found" } when evidence directory does not exist at all', async () => {
			const result: LoadEvidenceResult = await loadEvidence(
				tempDir,
				'nonexistent-task',
			);

			expect(result.status).toBe('not_found');
			expect(result).not.toHaveProperty('bundle');
		});

		it('returns { status: "not_found" } when task directory exists but evidence.json is absent', async () => {
			// Create task directory but no evidence.json file
			const taskDir = join(tempDir, '.swarm', 'evidence', 'task-without-file');
			await mkdir(taskDir, { recursive: true });

			const result: LoadEvidenceResult = await loadEvidence(
				tempDir,
				'task-without-file',
			);

			expect(result.status).toBe('not_found');
			expect(result).not.toHaveProperty('bundle');
		});
	});

	// ===========================================================================
	// Group 2: invalid_schema status
	// ===========================================================================

	describe('invalid_schema status', () => {
		it('returns { status: "invalid_schema" } with errors array when JSON is malformed', async () => {
			await writeEvidenceFile(tempDir, 'bad-json', '{ invalid }');

			const result: LoadEvidenceResult = await loadEvidence(
				tempDir,
				'bad-json',
			);

			expect(result.status).toBe('invalid_schema');
			if (result.status === 'invalid_schema') {
				expect(result.errors).toBeDefined();
				expect(Array.isArray(result.errors)).toBe(true);
				expect(result.errors.length).toBeGreaterThan(0);
			}
		});

		it('returns { status: "invalid_schema" } with errors array when file is empty string', async () => {
			await writeEvidenceFile(tempDir, 'empty-file', '');

			const result: LoadEvidenceResult = await loadEvidence(
				tempDir,
				'empty-file',
			);

			expect(result.status).toBe('invalid_schema');
			if (result.status === 'invalid_schema') {
				expect(result.errors).toBeDefined();
				expect(Array.isArray(result.errors)).toBe(true);
			}
		});

		it('returns { status: "invalid_schema" } with errors array when file contains JSON null', async () => {
			await writeEvidenceFile(tempDir, 'null-content', 'null');

			const result: LoadEvidenceResult = await loadEvidence(
				tempDir,
				'null-content',
			);

			expect(result.status).toBe('invalid_schema');
			if (result.status === 'invalid_schema') {
				expect(result.errors).toBeDefined();
				expect(Array.isArray(result.errors)).toBe(true);
			}
		});

		it('returns { status: "invalid_schema" } when schema_version field is missing', async () => {
			const bundle = JSON.stringify({
				task_id: 'task-1',
				entries: [],
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			});
			await writeEvidenceFile(tempDir, 'missing-schema-version', bundle);

			const result: LoadEvidenceResult = await loadEvidence(
				tempDir,
				'missing-schema-version',
			);

			expect(result.status).toBe('invalid_schema');
			if (result.status === 'invalid_schema') {
				expect(result.errors).toBeDefined();
			}
		});

		it('returns { status: "invalid_schema" } when created_at and updated_at are missing - verify errors array contains at least one entry with created_at in the message', async () => {
			const bundle = JSON.stringify({
				schema_version: '1.0.0',
				task_id: 'task-1',
				entries: [],
			});
			await writeEvidenceFile(tempDir, 'missing-timestamps', bundle);

			const result: LoadEvidenceResult = await loadEvidence(
				tempDir,
				'missing-timestamps',
			);

			expect(result.status).toBe('invalid_schema');
			if (result.status === 'invalid_schema') {
				expect(result.errors).toBeDefined();
				expect(Array.isArray(result.errors)).toBe(true);
				expect(result.errors.length).toBeGreaterThan(0);
				// Verify at least one error mentions created_at
				const hasCreatedAtError = result.errors.some((e) =>
					e.toLowerCase().includes('created_at'),
				);
				expect(hasCreatedAtError).toBe(true);
			}
		});

		it('returns { status: "invalid_schema" } when entries is not an array', async () => {
			const bundle = JSON.stringify({
				schema_version: '1.0.0',
				task_id: 'task-1',
				entries: 'not-an-array',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			});
			await writeEvidenceFile(tempDir, 'entries-string', bundle);

			const result: LoadEvidenceResult = await loadEvidence(
				tempDir,
				'entries-string',
			);

			expect(result.status).toBe('invalid_schema');
			if (result.status === 'invalid_schema') {
				expect(result.errors).toBeDefined();
			}
		});
	});

	// ===========================================================================
	// Group 3: found status
	// ===========================================================================

	describe('found status', () => {
		it('returns { status: "found", bundle } for a valid bundle with empty entries', async () => {
			const bundle = makeValidBundle('task-empty', []);
			await writeEvidenceFile(tempDir, 'task-empty', bundle);

			const result: LoadEvidenceResult = await loadEvidence(
				tempDir,
				'task-empty',
			);

			expect(result.status).toBe('found');
			if (result.status === 'found') {
				expect(result.bundle).toBeDefined();
				expect(result.bundle.task_id).toBe('task-empty');
				expect(result.bundle.entries).toHaveLength(0);
			}
		});

		it('returns { status: "found", bundle } for a valid bundle with one retrospective entry - verify bundle.task_id and bundle.entries.length', async () => {
			const retroEntry = {
				task_id: 'retro-1',
				type: 'retrospective' as const,
				timestamp: new Date().toISOString(),
				agent: 'test-agent',
				verdict: 'pass' as const,
				summary: 'Sprint retrospective',
				phase_number: 1,
				total_tool_calls: 100,
				coder_revisions: 2,
				reviewer_rejections: 1,
				test_failures: 0,
				security_findings: 0,
				integration_issues: 0,
				task_count: 5,
				task_complexity: 'moderate' as const,
			};
			const bundle = makeValidBundle('retro-1', [retroEntry]);
			await writeEvidenceFile(tempDir, 'retro-1', bundle);

			const result: LoadEvidenceResult = await loadEvidence(tempDir, 'retro-1');

			expect(result.status).toBe('found');
			if (result.status === 'found') {
				expect(result.bundle).toBeDefined();
				expect(result.bundle.task_id).toBe('retro-1');
				expect(result.bundle.entries.length).toBe(1);
			}
		});

		it('bundle.entries[0].type === "retrospective" for a retro bundle', async () => {
			const retroEntry = {
				task_id: 'retro-2',
				type: 'retrospective' as const,
				timestamp: new Date().toISOString(),
				agent: 'test-agent',
				verdict: 'pass' as const,
				summary: 'Sprint retrospective',
				phase_number: 1,
				total_tool_calls: 50,
				coder_revisions: 1,
				reviewer_rejections: 0,
				test_failures: 0,
				security_findings: 0,
				integration_issues: 0,
				task_count: 3,
				task_complexity: 'simple' as const,
			};
			const bundle = makeValidBundle('retro-2', [retroEntry]);
			await writeEvidenceFile(tempDir, 'retro-2', bundle);

			const result: LoadEvidenceResult = await loadEvidence(tempDir, 'retro-2');

			expect(result.status).toBe('found');
			if (result.status === 'found') {
				expect(result.bundle.entries[0].type).toBe('retrospective');
			}
		});

		it('found bundle has the correct schema_version, created_at, updated_at fields', async () => {
			const now = new Date().toISOString();
			const bundle = JSON.stringify({
				schema_version: '1.0.0',
				task_id: 'task-complete',
				entries: [],
				created_at: now,
				updated_at: now,
			});
			await writeEvidenceFile(tempDir, 'task-complete', bundle);

			const result: LoadEvidenceResult = await loadEvidence(
				tempDir,
				'task-complete',
			);

			expect(result.status).toBe('found');
			if (result.status === 'found') {
				expect(result.bundle.schema_version).toBe('1.0.0');
				expect(result.bundle.created_at).toBe(now);
				expect(result.bundle.updated_at).toBe(now);
			}
		});
	});

	// ===========================================================================
	// Group 4: errors field on invalid_schema
	// ===========================================================================

	describe('errors field on invalid_schema', () => {
		it('errors is an array on invalid_schema result', async () => {
			await writeEvidenceFile(tempDir, 'errors-test-1', '{ invalid }');

			const result: LoadEvidenceResult = await loadEvidence(
				tempDir,
				'errors-test-1',
			);

			expect(result.status).toBe('invalid_schema');
			if (result.status === 'invalid_schema') {
				expect(Array.isArray(result.errors)).toBe(true);
			}
		});

		it('errors contains at least one string message when schema validation fails', async () => {
			const bundle = JSON.stringify({
				schema_version: '1.0.0',
				task_id: 'task-1',
				entries: 'not-an-array',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			});
			await writeEvidenceFile(tempDir, 'errors-test-2', bundle);

			const result: LoadEvidenceResult = await loadEvidence(
				tempDir,
				'errors-test-2',
			);

			expect(result.status).toBe('invalid_schema');
			if (result.status === 'invalid_schema') {
				expect(result.errors.length).toBeGreaterThan(0);
				expect(typeof result.errors[0]).toBe('string');
				expect(result.errors[0].length).toBeGreaterThan(0);
			}
		});

		it('for malformed JSON, errors[0] is a non-empty string describing the parse error', async () => {
			await writeEvidenceFile(tempDir, 'errors-test-3', '{ broken json');

			const result: LoadEvidenceResult = await loadEvidence(
				tempDir,
				'errors-test-3',
			);

			expect(result.status).toBe('invalid_schema');
			if (result.status === 'invalid_schema') {
				expect(typeof result.errors[0]).toBe('string');
				expect(result.errors[0].length).toBeGreaterThan(0);
			}
		});

		it('errors array contains multiple messages when multiple fields fail validation', async () => {
			const taskId = 'test-multi-error';
			await writeEvidenceFile(
				tempDir,
				taskId,
				JSON.stringify({
					schema_version: '1.0.0',
					task_id: taskId,
					entries: [],
					// Missing created_at AND updated_at — should produce 2 errors
				}),
			);
			const result = await loadEvidence(tempDir, taskId);
			expect(result.status).toBe('invalid_schema');
			if (result.status === 'invalid_schema') {
				expect(result.errors.length).toBeGreaterThanOrEqual(2);
			}
		});
	});

	// ===========================================================================
	// Group 5: Type narrowing (compile-time behavior tests)
	// ===========================================================================

	describe('type narrowing behavior', () => {
		it('after result.status === "found", accessing result.bundle is valid', async () => {
			const bundle = makeValidBundle('narrow-found', []);
			await writeEvidenceFile(tempDir, 'narrow-found', bundle);

			const result: LoadEvidenceResult = await loadEvidence(
				tempDir,
				'narrow-found',
			);

			if (result.status === 'found') {
				// This should compile and work correctly
				const taskId: string = result.bundle.task_id;
				expect(taskId).toBe('narrow-found');
			} else {
				throw new Error('Expected status to be "found"');
			}
		});

		it('after result.status === "not_found", there is no bundle property', async () => {
			const result: LoadEvidenceResult = await loadEvidence(
				tempDir,
				'nonexistent',
			);

			if (result.status === 'not_found') {
				expect(!('bundle' in result)).toBe(true);
			} else {
				throw new Error('Expected status to be "not_found"');
			}
		});

		it('after result.status === "invalid_schema", there is no bundle property but errors exists', async () => {
			await writeEvidenceFile(tempDir, 'narrow-invalid', '{ invalid }');

			const result: LoadEvidenceResult = await loadEvidence(
				tempDir,
				'narrow-invalid',
			);

			if (result.status === 'invalid_schema') {
				expect(!('bundle' in result)).toBe(true);
				expect('errors' in result).toBe(true);
			} else {
				throw new Error('Expected status to be "invalid_schema"');
			}
		});
	});
});

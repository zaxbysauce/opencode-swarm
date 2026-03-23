import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadEvidence } from '../../../src/evidence/manager.js';

// Helper to create a temp directory
function createTempDir(): string {
	const tempDir = path.join(os.tmpdir(), `load-evidence-test-${Date.now()}-${Math.random().toString(36).substring(7)}`);
	mkdirSync(tempDir, { recursive: true });
	return tempDir;
}

// Helper to create evidence.json in a temp directory
function createEvidenceFile(tempDir: string, taskId: string, content: string): void {
	const evidencePath = path.join(tempDir, '.swarm', 'evidence', taskId, 'evidence.json');
	const evidenceDir = path.dirname(evidencePath);
	mkdirSync(evidenceDir, { recursive: true });
	writeFileSync(evidencePath, content, 'utf-8');
}

// Clean up temp directories
const tempDirs: string[] = [];

afterEach(() => {
	// Clean up all temp directories created during tests
	for (const dir of tempDirs) {
		try {
			if (existsSync(dir)) {
				rmSync(dir, { recursive: true, force: true });
			}
		} catch (error) {
			// Ignore cleanup errors
		}
	}
	tempDirs.length = 0;
});

describe('loadEvidence discriminated union behavior', () => {
	it('NOT_FOUND: returns { status: "not_found" } when file does not exist', async () => {
		const tempDir = createTempDir();
		tempDirs.push(tempDir);

		const result = await loadEvidence(tempDir, 'nonexistent-task-12345');

		expect(result).toEqual({
			status: 'not_found',
		});
	});

	it('FOUND: returns { status: "found", bundle } with valid evidence.json', async () => {
		const tempDir = createTempDir();
		tempDirs.push(tempDir);

		const validEvidence = {
			schema_version: '1.0.0',
			task_id: '5.1',
			entries: [{
				task_id: '5.1',
				type: 'note',
				timestamp: '2026-01-01T00:00:00.000Z',
				agent: 'architect',
				verdict: 'info',
				summary: 'test note',
			}],
			created_at: '2026-01-01T00:00:00.000Z',
			updated_at: '2026-01-01T00:00:00.000Z',
		};

		createEvidenceFile(tempDir, '5.1', JSON.stringify(validEvidence));

		const result = await loadEvidence(tempDir, '5.1');

		expect(result.status).toBe('found');
		if (result.status === 'found') {
			expect(result.bundle).toBeDefined();
			expect(result.bundle.schema_version).toBe('1.0.0');
			expect(result.bundle.task_id).toBe('5.1');
			expect(result.bundle.entries).toHaveLength(1);
			expect(result.bundle.entries[0].type).toBe('note');
			expect(result.bundle.entries[0].summary).toBe('test note');
		}
	});

	it('INVALID_SCHEMA: returns { status: "invalid_schema", errors } for invalid evidence.json', async () => {
		const tempDir = createTempDir();
		tempDirs.push(tempDir);

		const invalidEvidence = {
			status: 'invalid',
			bad: 'data',
		};

		createEvidenceFile(tempDir, '5.2', JSON.stringify(invalidEvidence));

		const result = await loadEvidence(tempDir, '5.2');

		expect(result.status).toBe('invalid_schema');
		if (result.status === 'invalid_schema') {
			expect(result.errors).toBeDefined();
			expect(result.errors.length).toBeGreaterThan(0);
			// Verify errors contain field names and messages
			expect(result.errors.some(e => e.includes('schema_version') || e.includes('entries'))).toBe(true);
		}
	});

	it('FOUND: handles task IDs with dots and hyphens (version-like IDs)', async () => {
		const tempDir = createTempDir();
		tempDirs.push(tempDir);

		const validEvidence = {
			schema_version: '1.0.0',
			task_id: '1.2.3',
			entries: [{
				task_id: '1.2.3',
				type: 'note',
				timestamp: '2026-01-01T00:00:00.000Z',
				agent: 'architect',
				verdict: 'info',
				summary: 'test note',
			}],
			created_at: '2026-01-01T00:00:00.000Z',
			updated_at: '2026-01-01T00:00:00.000Z',
		};

		createEvidenceFile(tempDir, '1.2.3', JSON.stringify(validEvidence));

		const result = await loadEvidence(tempDir, '1.2.3');

		expect(result.status).toBe('found');
		if (result.status === 'found') {
			expect(result.bundle.task_id).toBe('1.2.3');
		}
	});

	it('INVALID_SCHEMA: returns errors for missing required fields', async () => {
		const tempDir = createTempDir();
		tempDirs.push(tempDir);

		const invalidEvidence = {
			schema_version: '1.0.0',
			// Missing task_id, entries, created_at, updated_at
		};

		createEvidenceFile(tempDir, '5.3', JSON.stringify(invalidEvidence));

		const result = await loadEvidence(tempDir, '5.3');

		expect(result.status).toBe('invalid_schema');
		if (result.status === 'invalid_schema') {
			expect(result.errors.length).toBeGreaterThan(0);
		}
	});
});

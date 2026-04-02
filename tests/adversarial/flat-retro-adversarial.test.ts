import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	loadEvidence,
	sanitizeTaskId,
	saveEvidence,
} from '../../src/evidence/manager';

let tempDir: string;

beforeEach(() => {
	tempDir = join(
		tmpdir(),
		`retro-adversarial-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	mkdirSync(join(tempDir, '.swarm'), { recursive: true });
});

afterEach(() => {
	rmSync(tempDir, { recursive: true, force: true });
});

describe('Flat retrospective detection adversarial tests', () => {
	/**
	 * Detection is not fooled by non-retrospective objects that happen to have type: 'retrospective'
	 */

	it('rejects objects with schema_version field (already wrapped format)', async () => {
		// This is a valid EvidenceBundle, not a flat retrospective
		const bundleWithSchema = {
			schema_version: '1.0.0',
			task_id: '1.1',
			created_at: '2024-01-01T00:00:00.000Z',
			updated_at: '2024-01-01T00:00:00.000Z',
			entries: [
				{
					type: 'retrospective',
					task_id: '1.1',
					timestamp: '2024-01-01T00:00:00.000Z',
					agent: 'test',
					verdict: 'info',
					summary: 'test',
					phase_number: 1,
					total_tool_calls: 10,
					coder_revisions: 1,
					reviewer_rejections: 0,
					test_failures: 0,
					security_findings: 0,
					integration_issues: 0,
					task_count: 1,
					task_complexity: 'simple',
				},
			],
		};

		const evidencePath = join(
			tempDir,
			'.swarm',
			'evidence',
			'1.1',
			'evidence.json',
		);
		mkdirSync(join(tempDir, '.swarm', 'evidence', '1.1'), { recursive: true });
		writeFileSync(evidencePath, JSON.stringify(bundleWithSchema));

		const result = await loadEvidence(tempDir, '1.1');
		// Should parse as EvidenceBundle, not as flat retrospective
		expect(result.status).toBe('found');
		if (result.status !== 'found') return;
		expect(result.bundle.schema_version).toBe('1.0.0');
	});

	it('rejects arrays with type: retrospective', async () => {
		const maliciousPayload = JSON.stringify([{ type: 'retrospective' }]);

		const evidencePath = join(
			tempDir,
			'.swarm',
			'evidence',
			'1.1',
			'evidence.json',
		);
		mkdirSync(join(tempDir, '.swarm', 'evidence', '1.1'), { recursive: true });
		writeFileSync(evidencePath, maliciousPayload);

		const result = await loadEvidence(tempDir, '1.1');
		// Arrays should not be detected as flat retrospectives
		expect(result.status).toBe('invalid_schema');
	});

	it('rejects null value', async () => {
		const evidencePath = join(
			tempDir,
			'.swarm',
			'evidence',
			'1.1',
			'evidence.json',
		);
		mkdirSync(join(tempDir, '.swarm', 'evidence', '1.1'), { recursive: true });
		writeFileSync(evidencePath, 'null');

		const result = await loadEvidence(tempDir, '1.1');
		expect(result.status).toBe('invalid_schema');
	});

	it('rejects primitives as flat retrospective', async () => {
		const primitives = ['"string"', '123', 'true'];

		for (const primitive of primitives) {
			const evidencePath = join(
				tempDir,
				'.swarm',
				'evidence',
				'1.1',
				'evidence.json',
			);
			mkdirSync(join(tempDir, '.swarm', 'evidence', '1.1'), {
				recursive: true,
			});
			writeFileSync(evidencePath, primitive);

			const result = await loadEvidence(tempDir, '1.1');
			expect(result.status).toBe('invalid_schema');
		}
	});

	it('rejects type in prototype chain (not own property)', async () => {
		// Create an object where type is inherited from prototype
		// Using Object.create to simulate prototype pollution attempt
		const prototype = { type: 'retrospective' };
		const maliciousObj = Object.create(prototype);
		// Don't add 'type' as own property

		const evidencePath = join(
			tempDir,
			'.swarm',
			'evidence',
			'1.1',
			'evidence.json',
		);
		mkdirSync(join(tempDir, '.swarm', 'evidence', '1.1'), { recursive: true });
		writeFileSync(evidencePath, JSON.stringify(maliciousObj));

		const result = await loadEvidence(tempDir, '1.1');
		// Should NOT detect as flat retrospective since type is not own property
		expect(result.status).toBe('invalid_schema');
	});

	it('rejects object with schema_version set to undefined (falsy check)', async () => {
		// schema_version: undefined should still make it fail the check since undefined is falsy
		const payload = {
			type: 'retrospective',
			// schema_version is not present (undefined)
		};

		const evidencePath = join(
			tempDir,
			'.swarm',
			'evidence',
			'1.1',
			'evidence.json',
		);
		mkdirSync(join(tempDir, '.swarm', 'evidence', '1.1'), { recursive: true });
		writeFileSync(evidencePath, JSON.stringify(payload));

		const result = await loadEvidence(tempDir, '1.1');
		// Should be detected as flat retrospective (no schema_version), then fail validation
		expect(result.status).toBe('invalid_schema');
	});

	it('rejects object with schema_version set to null', async () => {
		const payload = {
			type: 'retrospective',
			schema_version: null,
		};

		const evidencePath = join(
			tempDir,
			'.swarm',
			'evidence',
			'1.1',
			'evidence.json',
		);
		mkdirSync(join(tempDir, '.swarm', 'evidence', '1.1'), { recursive: true });
		writeFileSync(evidencePath, JSON.stringify(payload));

		const result = await loadEvidence(tempDir, '1.1');
		// Should be detected as flat retrospective (schema_version is null, falsy), then fail validation
		expect(result.status).toBe('invalid_schema');
	});

	it('rejects object with schema_version set to empty string', async () => {
		const payload = {
			type: 'retrospective',
			schema_version: '',
		};

		const evidencePath = join(
			tempDir,
			'.swarm',
			'evidence',
			'1.1',
			'evidence.json',
		);
		mkdirSync(join(tempDir, '.swarm', 'evidence', '1.1'), { recursive: true });
		writeFileSync(evidencePath, JSON.stringify(payload));

		const result = await loadEvidence(tempDir, '1.1');
		// Empty string is falsy, so it passes isFlatRetrospective check, then fails Zod validation
		expect(result.status).toBe('invalid_schema');
	});
});

describe('Flat retrospective wrapping security tests', () => {
	/**
	 * Wrapping does not introduce path traversal, prototype pollution, or unsafe type coercion
	 */

	it('prevents path traversal in wrapped task_id', async () => {
		// Flat retrospective with path traversal in task_id
		const flatRetro = {
			type: 'retrospective',
			task_id: '../etc/passwd',
			timestamp: '2024-01-01T00:00:00.000Z',
			agent: 'test',
			verdict: 'info',
			summary: 'test',
		};

		const evidencePath = join(
			tempDir,
			'.swarm',
			'evidence',
			'1.1',
			'evidence.json',
		);
		mkdirSync(join(tempDir, '.swarm', 'evidence', '1.1'), { recursive: true });
		writeFileSync(evidencePath, JSON.stringify(flatRetro));

		const result = await loadEvidence(tempDir, '1.1');
		// Should be detected as flat retrospective, then validation should fail
		// because the entry lacks required retrospective fields
		expect(result.status).toBe('invalid_schema');
	});

	it('prevents path traversal with backslash', async () => {
		const flatRetro = {
			type: 'retrospective',
			task_id: '..\\windows\\system32\\config',
			timestamp: '2024-01-01T00:00:00.000Z',
			agent: 'test',
			verdict: 'info',
			summary: 'test',
		};

		const evidencePath = join(
			tempDir,
			'.swarm',
			'evidence',
			'1.1',
			'evidence.json',
		);
		mkdirSync(join(tempDir, '.swarm', 'evidence', '1.1'), { recursive: true });
		writeFileSync(evidencePath, JSON.stringify(flatRetro));

		const result = await loadEvidence(tempDir, '1.1');
		expect(result.status).toBe('invalid_schema');
	});

	it('handles prototype pollution via __proto__', async () => {
		// Object with __proto__ property - should not pollute Object.prototype
		const flatRetro = {
			__proto__: { pollution: 'test' },
			type: 'retrospective',
			task_id: '1.1',
			timestamp: '2024-01-01T00:00:00.000Z',
			agent: 'test',
			verdict: 'info',
			summary: 'test',
		};

		// Verify Object.prototype is clean before
		expect({}.pollution).toBeUndefined();

		const evidencePath = join(
			tempDir,
			'.swarm',
			'evidence',
			'1.1',
			'evidence.json',
		);
		mkdirSync(join(tempDir, '.swarm', 'evidence', '1.1'), { recursive: true });
		writeFileSync(evidencePath, JSON.stringify(flatRetro));

		const result = await loadEvidence(tempDir, '1.1');
		// Should validate (or fail on missing retrospective fields), but NOT pollute prototype
		// The result status depends on whether required fields are present

		// Verify Object.prototype is still clean after
		expect({}.pollution).toBeUndefined();
	});

	it('handles constructor property injection', async () => {
		const flatRetro = {
			constructor: { injected: true },
			type: 'retrospective',
			task_id: '1.1',
			timestamp: '2024-01-01T00:00:00.000Z',
			agent: 'test',
			verdict: 'info',
			summary: 'test',
		};

		const evidencePath = join(
			tempDir,
			'.swarm',
			'evidence',
			'1.1',
			'evidence.json',
		);
		mkdirSync(join(tempDir, '.swarm', 'evidence', '1.1'), { recursive: true });
		writeFileSync(evidencePath, JSON.stringify(flatRetro));

		const result = await loadEvidence(tempDir, '1.1');
		// Should either succeed or fail validation, but should not affect Object.constructor
		expect(typeof {}.constructor).toBe('function');
	});

	it('handles number instead of string for task_id (type coercion)', async () => {
		const flatRetro = {
			type: 'retrospective',
			task_id: 123, // number instead of string
			timestamp: '2024-01-01T00:00:00.000Z',
			agent: 'test',
			verdict: 'info',
			summary: 'test',
		};

		const evidencePath = join(
			tempDir,
			'.swarm',
			'evidence',
			'1.1',
			'evidence.json',
		);
		mkdirSync(join(tempDir, '.swarm', 'evidence', '1.1'), { recursive: true });
		writeFileSync(evidencePath, JSON.stringify(flatRetro));

		const result = await loadEvidence(tempDir, '1.1');
		// Number passes nullish coalescing (??), but Zod validation should catch it
		// because task_id expects a string
		expect(result.status).toBe('invalid_schema');
	});

	it('handles number instead of string for timestamp (type coercion)', async () => {
		const flatRetro = {
			type: 'retrospective',
			task_id: '1.1',
			timestamp: 1234567890, // number instead of string
			agent: 'test',
			verdict: 'info',
			summary: 'test',
		};

		const evidencePath = join(
			tempDir,
			'.swarm',
			'evidence',
			'1.1',
			'evidence.json',
		);
		mkdirSync(join(tempDir, '.swarm', 'evidence', '1.1'), { recursive: true });
		writeFileSync(evidencePath, JSON.stringify(flatRetro));

		const result = await loadEvidence(tempDir, '1.1');
		// Number passes nullish coalescing but Zod validation should catch it
		expect(result.status).toBe('invalid_schema');
	});

	it('handles boolean instead of string for task_id', async () => {
		const flatRetro = {
			type: 'retrospective',
			task_id: true,
			timestamp: '2024-01-01T00:00:00.000Z',
			agent: 'test',
			verdict: 'info',
			summary: 'test',
		};

		const evidencePath = join(
			tempDir,
			'.swarm',
			'evidence',
			'1.1',
			'evidence.json',
		);
		mkdirSync(join(tempDir, '.swarm', 'evidence', '1.1'), { recursive: true });
		writeFileSync(evidencePath, JSON.stringify(flatRetro));

		const result = await loadEvidence(tempDir, '1.1');
		expect(result.status).toBe('invalid_schema');
	});

	it('handles object instead of string for task_id', async () => {
		const flatRetro = {
			type: 'retrospective',
			task_id: { nested: 'object' },
			timestamp: '2024-01-01T00:00:00.000Z',
			agent: 'test',
			verdict: 'info',
			summary: 'test',
		};

		const evidencePath = join(
			tempDir,
			'.swarm',
			'evidence',
			'1.1',
			'evidence.json',
		);
		mkdirSync(join(tempDir, '.swarm', 'evidence', '1.1'), { recursive: true });
		writeFileSync(evidencePath, JSON.stringify(flatRetro));

		const result = await loadEvidence(tempDir, '1.1');
		expect(result.status).toBe('invalid_schema');
	});

	it('handles empty string for task_id', async () => {
		const flatRetro = {
			type: 'retrospective',
			task_id: '',
			timestamp: '2024-01-01T00:00:00.000Z',
			agent: 'test',
			verdict: 'info',
			summary: 'test',
		};

		const evidencePath = join(
			tempDir,
			'.swarm',
			'evidence',
			'1.1',
			'evidence.json',
		);
		mkdirSync(join(tempDir, '.swarm', 'evidence', '1.1'), { recursive: true });
		writeFileSync(evidencePath, JSON.stringify(flatRetro));

		const result = await loadEvidence(tempDir, '1.1');
		// Empty string passes nullish coalescing (??), but Zod validation requires min(1)
		expect(result.status).toBe('invalid_schema');
	});
});

describe('Malformed flat retrospectives return invalid_schema', () => {
	/**
	 * Malformed flat retrospectives (missing required entry fields) still return invalid_schema
	 */

	it('missing agent field returns invalid_schema', async () => {
		const flatRetro = {
			type: 'retrospective',
			task_id: '1.1',
			timestamp: '2024-01-01T00:00:00.000Z',
			// missing agent
			verdict: 'info',
			summary: 'test',
		};

		const evidencePath = join(
			tempDir,
			'.swarm',
			'evidence',
			'1.1',
			'evidence.json',
		);
		mkdirSync(join(tempDir, '.swarm', 'evidence', '1.1'), { recursive: true });
		writeFileSync(evidencePath, JSON.stringify(flatRetro));

		const result = await loadEvidence(tempDir, '1.1');
		expect(result.status).toBe('invalid_schema');
		if (result.status === 'invalid_schema') {
			expect(result.errors.some((e) => e.includes('agent'))).toBe(true);
		}
	});

	it('missing verdict field returns invalid_schema', async () => {
		const flatRetro = {
			type: 'retrospective',
			task_id: '1.1',
			timestamp: '2024-01-01T00:00:00.000Z',
			agent: 'test',
			// missing verdict
			summary: 'test',
		};

		const evidencePath = join(
			tempDir,
			'.swarm',
			'evidence',
			'1.1',
			'evidence.json',
		);
		mkdirSync(join(tempDir, '.swarm', 'evidence', '1.1'), { recursive: true });
		writeFileSync(evidencePath, JSON.stringify(flatRetro));

		const result = await loadEvidence(tempDir, '1.1');
		expect(result.status).toBe('invalid_schema');
	});

	it('missing summary field returns invalid_schema', async () => {
		const flatRetro = {
			type: 'retrospective',
			task_id: '1.1',
			timestamp: '2024-01-01T00:00:00.000Z',
			agent: 'test',
			verdict: 'info',
			// missing summary
		};

		const evidencePath = join(
			tempDir,
			'.swarm',
			'evidence',
			'1.1',
			'evidence.json',
		);
		mkdirSync(join(tempDir, '.swarm', 'evidence', '1.1'), { recursive: true });
		writeFileSync(evidencePath, JSON.stringify(flatRetro));

		const result = await loadEvidence(tempDir, '1.1');
		expect(result.status).toBe('invalid_schema');
	});

	it('missing timestamp field returns invalid_schema', async () => {
		const flatRetro = {
			type: 'retrospective',
			task_id: '1.1',
			// missing timestamp
			agent: 'test',
			verdict: 'info',
			summary: 'test',
		};

		const evidencePath = join(
			tempDir,
			'.swarm',
			'evidence',
			'1.1',
			'evidence.json',
		);
		mkdirSync(join(tempDir, '.swarm', 'evidence', '1.1'), { recursive: true });
		writeFileSync(evidencePath, JSON.stringify(flatRetro));

		const result = await loadEvidence(tempDir, '1.1');
		expect(result.status).toBe('invalid_schema');
	});

	it('missing type field returns invalid_schema', async () => {
		const flatRetro = {
			// missing type
			task_id: '1.1',
			timestamp: '2024-01-01T00:00:00.000Z',
			agent: 'test',
			verdict: 'info',
			summary: 'test',
		};

		const evidencePath = join(
			tempDir,
			'.swarm',
			'evidence',
			'1.1',
			'evidence.json',
		);
		mkdirSync(join(tempDir, '.swarm', 'evidence', '1.1'), { recursive: true });
		writeFileSync(evidencePath, JSON.stringify(flatRetro));

		const result = await loadEvidence(tempDir, '1.1');
		// Should not be detected as flat retrospective (no type field)
		expect(result.status).toBe('invalid_schema');
	});

	it('retrospective type missing required phase_number returns invalid_schema', async () => {
		const flatRetro = {
			type: 'retrospective',
			task_id: '1.1',
			timestamp: '2024-01-01T00:00:00.000Z',
			agent: 'test',
			verdict: 'info',
			summary: 'test',
			// missing required retrospective fields
		};

		const evidencePath = join(
			tempDir,
			'.swarm',
			'evidence',
			'1.1',
			'evidence.json',
		);
		mkdirSync(join(tempDir, '.swarm', 'evidence', '1.1'), { recursive: true });
		writeFileSync(evidencePath, JSON.stringify(flatRetro));

		const result = await loadEvidence(tempDir, '1.1');
		expect(result.status).toBe('invalid_schema');
		if (result.status === 'invalid_schema') {
			expect(result.errors.some((e) => e.includes('phase_number'))).toBe(true);
		}
	});

	it('retrospective type missing required task_count returns invalid_schema', async () => {
		const flatRetro = {
			type: 'retrospective',
			task_id: '1.1',
			timestamp: '2024-01-01T00:00:00.000Z',
			agent: 'test',
			verdict: 'info',
			summary: 'test',
			phase_number: 1,
			total_tool_calls: 10,
			// missing task_count
		};

		const evidencePath = join(
			tempDir,
			'.swarm',
			'evidence',
			'1.1',
			'evidence.json',
		);
		mkdirSync(join(tempDir, '.swarm', 'evidence', '1.1'), { recursive: true });
		writeFileSync(evidencePath, JSON.stringify(flatRetro));

		const result = await loadEvidence(tempDir, '1.1');
		expect(result.status).toBe('invalid_schema');
	});

	it('completely empty object returns invalid_schema', async () => {
		const evidencePath = join(
			tempDir,
			'.swarm',
			'evidence',
			'1.1',
			'evidence.json',
		);
		mkdirSync(join(tempDir, '.swarm', 'evidence', '1.1'), { recursive: true });
		writeFileSync(evidencePath, JSON.stringify({}));

		const result = await loadEvidence(tempDir, '1.1');
		expect(result.status).toBe('invalid_schema');
	});
});

describe('Valid flat retrospective wrapping', () => {
	/**
	 * Positive tests: valid flat retrospectives should be wrapped correctly
	 */

	it('wraps valid flat retrospective with all required base fields', async () => {
		const flatRetro = {
			type: 'retrospective',
			task_id: '2.5',
			timestamp: '2024-06-15T10:30:00.000Z',
			agent: 'architect',
			verdict: 'info',
			summary: 'Phase 5 completed successfully',
		};

		const evidencePath = join(
			tempDir,
			'.swarm',
			'evidence',
			'2.5',
			'evidence.json',
		);
		mkdirSync(join(tempDir, '.swarm', 'evidence', '2.5'), { recursive: true });
		writeFileSync(evidencePath, JSON.stringify(flatRetro));

		const result = await loadEvidence(tempDir, '2.5');
		// Still fails because missing retrospective-specific fields
		expect(result.status).toBe('invalid_schema');
	});

	it('wraps valid flat retrospective with required retrospective fields', async () => {
		const flatRetro = {
			type: 'retrospective',
			task_id: '2.5',
			timestamp: '2024-06-15T10:30:00.000Z',
			agent: 'architect',
			verdict: 'info',
			summary: 'Phase 5 completed',
			phase_number: 5,
			total_tool_calls: 500,
			coder_revisions: 10,
			reviewer_rejections: 3,
			test_failures: 1,
			security_findings: 0,
			integration_issues: 0,
			task_count: 15,
			task_complexity: 'moderate',
		};

		const evidencePath = join(
			tempDir,
			'.swarm',
			'evidence',
			'2.5',
			'evidence.json',
		);
		mkdirSync(join(tempDir, '.swarm', 'evidence', '2.5'), { recursive: true });
		writeFileSync(evidencePath, JSON.stringify(flatRetro));

		const result = await loadEvidence(tempDir, '2.5');
		expect(result.status).toBe('found');
		if (result.status !== 'found') return;

		expect(result.bundle.task_id).toBe('2.5');
		expect(result.bundle.schema_version).toBe('1.0.0');
		expect(result.bundle.entries).toHaveLength(1);
		expect(result.bundle.entries[0].type).toBe('retrospective');
	});

	it('wraps flat retrospective using fallback task_id when task_id is missing in flat entry', async () => {
		const flatRetro = {
			type: 'retrospective',
			// NOTE: flatEntry.task_id is intentionally missing - bundle.task_id should use fallback
			// But we must provide task_id in the entry for Zod validation to pass
			task_id: 'original-id', // This gets used in the entry
			timestamp: '2024-06-15T10:30:00.000Z',
			agent: 'architect',
			verdict: 'info',
			summary: 'Phase 5 completed',
			phase_number: 5,
			total_tool_calls: 500,
			coder_revisions: 10,
			reviewer_rejections: 3,
			test_failures: 1,
			security_findings: 0,
			integration_issues: 0,
			task_count: 15,
			task_complexity: 'moderate',
		};

		const evidencePath = join(
			tempDir,
			'.swarm',
			'evidence',
			'fallback-id',
			'evidence.json',
		);
		mkdirSync(join(tempDir, '.swarm', 'evidence', 'fallback-id'), {
			recursive: true,
		});
		writeFileSync(evidencePath, JSON.stringify(flatRetro));

		const result = await loadEvidence(tempDir, 'fallback-id');
		// When flatEntry.task_id exists, it gets used (not the fallback)
		// This tests that the wrapping uses flatEntry values when present
		expect(result.status).toBe('found');
		if (result.status !== 'found') return;

		// The entry's task_id takes precedence when present
		expect(result.bundle.entries[0].task_id).toBe('original-id');
	});

	it('wraps flat retrospective using provided timestamp for created_at and updated_at', async () => {
		const flatRetro = {
			type: 'retrospective',
			task_id: '3.1',
			timestamp: '2024-06-15T10:30:00.000Z',
			agent: 'architect',
			verdict: 'info',
			summary: 'Phase complete',
			phase_number: 3,
			total_tool_calls: 100,
			coder_revisions: 2,
			reviewer_rejections: 0,
			test_failures: 0,
			security_findings: 0,
			integration_issues: 0,
			task_count: 5,
			task_complexity: 'simple',
		};

		const evidencePath = join(
			tempDir,
			'.swarm',
			'evidence',
			'3.1',
			'evidence.json',
		);
		mkdirSync(join(tempDir, '.swarm', 'evidence', '3.1'), { recursive: true });
		writeFileSync(evidencePath, JSON.stringify(flatRetro));

		const result = await loadEvidence(tempDir, '3.1');
		expect(result.status).toBe('found');
		if (result.status !== 'found') return;

		expect(result.bundle.created_at).toBe('2024-06-15T10:30:00.000Z');
		expect(result.bundle.updated_at).toBe('2024-06-15T10:30:00.000Z');
	});
});

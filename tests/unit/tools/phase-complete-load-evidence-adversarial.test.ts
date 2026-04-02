/**
 * Adversarial tests for phase-complete.ts loadEvidence callers — attack vectors only
 * Tests error propagation, memory overflow, injection, boundary violations
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ensureAgentSession, resetSwarmState } from '../../../src/state';

// Mock loadEvidence and listEvidenceTaskIds from evidence/manager
// IMPORTANT: Use local mock variable pattern, NOT vi.mocked()
const mockLoadEvidence =
	vi.fn<
		(
			dir: string,
			taskId: string,
		) => Promise<
			| {
					status: 'found';
					bundle: {
						schema_version: string;
						task_id: string;
						created_at: string;
						updated_at: string;
						entries: Array<{
							task_id: string;
							type: string;
							timestamp: string;
							agent: string;
							verdict: string;
							summary: string;
							phase_number: number;
							[key: string]: unknown;
						}>;
					};
			  }
			| { status: 'not_found' }
			| { status: 'invalid_schema'; errors: string[] }
		>
	>();
const mockListEvidenceTaskIds = vi.fn<(dir: string) => Promise<string[]>>();

vi.mock('../../../src/evidence/manager.js', () => ({
	loadEvidence: (...args: unknown[]) =>
		mockLoadEvidence(...(args as [string, string])),
	listEvidenceTaskIds: (...args: unknown[]) =>
		mockListEvidenceTaskIds(...(args as [string])),
}));

// Import the tool after mocking
const { phase_complete } = await import('../../../src/tools/phase-complete.js');

describe('phase_complete - loadEvidence adversarial testing', () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		// Reset state before each test
		resetSwarmState();
		vi.clearAllMocks();

		// Create temp directory
		tempDir = fs.realpathSync(
			fs.mkdtempSync(
				path.join(os.tmpdir(), 'phase-complete-load-evidence-adversarial-'),
			),
		);
		originalCwd = process.cwd();
		process.chdir(tempDir);

		// Create .swarm directory and config
		fs.mkdirSync(path.join(tempDir, '.swarm'), { recursive: true });
		fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });

		// Create minimal config
		fs.writeFileSync(
			path.join(tempDir, '.opencode', 'opencode-swarm.json'),
			JSON.stringify({
				phase_complete: {
					enabled: true,
					required_agents: [],
					require_docs: false,
					policy: 'enforce',
				},
			}),
		);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
		resetSwarmState();
		vi.clearAllMocks();
	});

	describe('loadEvidence throwing (sync/async) — propagation vs swallow', () => {
		test('should resolve with error result when loadEvidence throws sync Error', async () => {
			const phase = 1;
			ensureAgentSession('sess1');

			mockLoadEvidence.mockImplementation(() => {
				throw new Error('Sync loadEvidence failure');
			});

			// The implementation catches errors and resolves with failure result
			const result = await phase_complete.execute({
				phase,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
		});

		test('should resolve with error result when loadEvidence rejects async', async () => {
			const phase = 1;
			ensureAgentSession('sess1');

			mockLoadEvidence.mockRejectedValue(
				new Error('Async loadEvidence failure'),
			);

			const result = await phase_complete.execute({
				phase,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
		});

		test('should resolve with error result when loadEvidence throws non-Error', async () => {
			const phase = 1;
			ensureAgentSession('sess1');

			mockLoadEvidence.mockImplementation(() => {
				throw { custom: 'error object' };
			});

			const result = await phase_complete.execute({
				phase,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
		});

		test('should resolve with error result when fallback loadEvidence throws', async () => {
			const phase = 1;
			ensureAgentSession('sess1');

			mockLoadEvidence
				.mockResolvedValueOnce({ status: 'not_found' })
				.mockRejectedValue(new Error('Fallback loadEvidence failure'));

			mockListEvidenceTaskIds.mockResolvedValue(['retro-2']);

			const result = await phase_complete.execute({
				phase,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
		});
	});

	describe('invalid_schema with large errors array — memory overflow via join()', () => {
		test('should handle 1000 error messages without overflow', async () => {
			// Arrange
			const phase = 1;
			ensureAgentSession('sess1');

			// Generate 1000 error messages
			const largeErrorArray = Array.from(
				{ length: 1000 },
				(_, i) => `error.field.${i}: Field validation failed`,
			);

			// Mock loadEvidence to return invalid_schema with 1000 errors
			mockLoadEvidence.mockResolvedValue({
				status: 'invalid_schema',
				errors: largeErrorArray,
			});
			mockListEvidenceTaskIds.mockResolvedValue([]);

			// Act
			const result = await phase_complete.execute({
				phase,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);

			// Assert - should handle large error array
			expect(parsed.success).toBe(false);
			expect(parsed.status).toBe('blocked');
			expect(parsed.message).toContain('Schema validation failed');
			expect(parsed.message).toContain('error.field.0');
			expect(parsed.message).toContain('error.field.999');
		});

		test('should handle each error being large (100 chars × 1000 = 100KB)', async () => {
			// Arrange
			const phase = 1;
			ensureAgentSession('sess1');

			// Generate 1000 error messages with 100 chars each
			const largeErrorArray = Array.from({ length: 1000 }, (_, i) =>
				`error.field.${String(i).padStart(5, '0')}: This is a very long error message that is exactly 100 characters long!`.slice(
					0,
					100,
				),
			);

			mockLoadEvidence.mockResolvedValue({
				status: 'invalid_schema',
				errors: largeErrorArray,
			});
			mockListEvidenceTaskIds.mockResolvedValue([]);

			// Act - should not throw memory error
			const result = await phase_complete.execute({
				phase,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);

			// Assert - actual length is ~91KB (1000 * ~91 chars)
			expect(parsed.success).toBe(false);
			expect(parsed.message.length).toBeGreaterThan(90000); // ~91KB
		});

		test('should handle accumulated errors from multiple retro bundles', async () => {
			// Arrange
			const phase = 1;
			ensureAgentSession('sess1');

			// Create 50 retro bundles, each with 100 errors
			const retroTaskIds = Array.from(
				{ length: 50 },
				(_, i) => `retro-${i + 2}`,
			);
			const bundleErrors = Array.from(
				{ length: 100 },
				(_, i) => `bundle.error.${i}: Schema validation error`,
			);

			// Primary returns not_found, fallbacks all return invalid_schema
			mockLoadEvidence.mockResolvedValueOnce({ status: 'not_found' });

			for (let i = 0; i < 50; i++) {
				mockLoadEvidence.mockResolvedValue({
					status: 'invalid_schema',
					errors: bundleErrors,
				});
			}

			mockListEvidenceTaskIds.mockResolvedValue(retroTaskIds);

			// Act - should handle 50 × 100 = 5000 errors
			const result = await phase_complete.execute({
				phase,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);

			// Assert - all errors should be accumulated
			expect(parsed.success).toBe(false);
			expect(parsed.message).toContain('Schema validation failed');
			expect(parsed.message).toContain('bundle.error.0');
			expect(parsed.message).toContain('bundle.error.99');
		});
	});

	describe('invalid_schema with malicious error strings (XSS, injection)', () => {
		test('should not sanitize XSS in error messages - they appear in output', async () => {
			// Arrange
			const phase = 1;
			ensureAgentSession('sess1');

			const xssError = '<script>alert("XSS")</script>';
			const xssErrors = [
				`field1: ${xssError}`,
				'field2: <img src=x onerror=alert(1)>',
			];

			mockLoadEvidence.mockResolvedValue({
				status: 'invalid_schema',
				errors: xssErrors,
			});
			mockListEvidenceTaskIds.mockResolvedValue([]);

			// Act
			const result = await phase_complete.execute({
				phase,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);

			// Assert - XSS appears unsanitized in message (this is expected behavior for logging)
			expect(parsed.message).toContain('<script>alert("XSS")</script>');
			expect(parsed.message).toContain('<img src=x onerror=alert(1)>');
		});

		test('should handle JSON injection in error messages', async () => {
			// Arrange
			const phase = 1;
			ensureAgentSession('sess1');

			const jsonInjection = '{"injected":true,"malicious":"payload"}';

			mockLoadEvidence.mockResolvedValue({
				status: 'invalid_schema',
				errors: [`field: ${jsonInjection}`],
			});
			mockListEvidenceTaskIds.mockResolvedValue([]);

			// Act
			const result = await phase_complete.execute({
				phase,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);

			// Assert - JSON injection appears as string, not parsed
			expect(parsed.message).toContain(jsonInjection);
		});

		test('should handle SQL injection patterns in error messages', async () => {
			// Arrange
			const phase = 1;
			ensureAgentSession('sess1');

			const sqlInjectionErrors = [
				'field: " OR "1"="1',
				'field2: ; DROP TABLE users--',
			];

			mockLoadEvidence.mockResolvedValue({
				status: 'invalid_schema',
				errors: sqlInjectionErrors,
			});
			mockListEvidenceTaskIds.mockResolvedValue([]);

			// Act
			const result = await phase_complete.execute({
				phase,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);

			// Assert - SQL injection appears in message
			expect(parsed.message).toContain('" OR "1"="1');
			expect(parsed.message).toContain('; DROP TABLE users--');
		});

		test('should handle line break injection in error messages', async () => {
			// Arrange
			const phase = 1;
			ensureAgentSession('sess1');

			const lineBreakErrors = [
				'field1: Error\nInjected: malicious',
				'field2: Error\r\nAnother: injection',
			];

			mockLoadEvidence.mockResolvedValue({
				status: 'invalid_schema',
				errors: lineBreakErrors,
			});
			mockListEvidenceTaskIds.mockResolvedValue([]);

			// Act
			const result = await phase_complete.execute({
				phase,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);

			// Assert - line breaks appear in message
			expect(parsed.message).toContain('\nInjected: malicious');
			expect(parsed.message).toContain('\r\nAnother: injection');
		});

		test('should handle unicode and emoji injection in error messages', async () => {
			// Arrange
			const phase = 1;
			ensureAgentSession('sess1');

			const unicodeErrors = [
				'field: 😱 Unicode test 😀',
				'field2: \u0000 null byte attempt',
				'field3: \u202E right-to-left override',
			];

			mockLoadEvidence.mockResolvedValue({
				status: 'invalid_schema',
				errors: unicodeErrors,
			});
			mockListEvidenceTaskIds.mockResolvedValue([]);

			// Act
			const result = await phase_complete.execute({
				phase,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);

			// Assert - unicode appears in message
			expect(parsed.message).toContain('😱');
			expect(parsed.message).toContain('😀');
			expect(parsed.message).toContain('\u0000');
			expect(parsed.message).toContain('\u202E');
		});
	});

	describe('Phase number boundary violations', () => {
		test('should reject phase 0', async () => {
			// Arrange
			ensureAgentSession('sess1');

			// Act
			const result = await phase_complete.execute({
				phase: 0,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);

			// Assert
			expect(parsed.success).toBe(false);
			expect(parsed.message).toContain('Invalid phase number');
			expect(parsed.warnings).toContain('Phase must be a positive number');
		});

		test('should reject negative phase', async () => {
			// Arrange
			ensureAgentSession('sess1');

			// Act
			const result = await phase_complete.execute({
				phase: -1,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);

			// Assert
			expect(parsed.success).toBe(false);
			expect(parsed.message).toContain('Invalid phase number');
		});

		test('should accept MAX_SAFE_INTEGER but handle in template', async () => {
			// Arrange
			const phase = Number.MAX_SAFE_INTEGER;
			ensureAgentSession('sess1');

			mockLoadEvidence.mockResolvedValue({ status: 'not_found' });
			mockListEvidenceTaskIds.mockResolvedValue([]);

			// Act
			const result = await phase_complete.execute({
				phase,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);

			// Assert - should accept and use in template
			expect(parsed.success).toBe(false);
			expect(parsed.phase).toBe(Number.MAX_SAFE_INTEGER);

			// Verify template includes MAX_SAFE_INTEGER
			const template = JSON.parse(parsed.warnings[1] as string);
			expect(template.entries[0].phase_number).toBe(Number.MAX_SAFE_INTEGER);
		});

		test('should handle NaN phase', async () => {
			// Arrange
			ensureAgentSession('sess1');

			// Act
			const result = await phase_complete.execute({
				phase: NaN,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);

			// Assert
			expect(parsed.success).toBe(false);
			expect(parsed.message).toContain('Invalid phase number');
		});

		test('should handle Infinity phase', async () => {
			// Arrange
			ensureAgentSession('sess1');

			mockLoadEvidence.mockResolvedValue({ status: 'not_found' });
			mockListEvidenceTaskIds.mockResolvedValue([]);

			// Act
			const result = await phase_complete.execute({
				phase: Infinity,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);

			// Assert - Infinity >= 1 is true, so it passes validation but fails on missing retro
			// Note: JSON.stringify converts Infinity to null
			expect(parsed.success).toBe(false); // But will fail due to missing retro
			expect(parsed.phase).toBe(null); // Infinity becomes null after JSON.stringify
		});
	});

	describe('Multiple retro-* bundles ALL returning invalid_schema — accumulated size', () => {
		test('should accumulate errors from 100 invalid retro bundles', async () => {
			// Arrange
			const phase = 1;
			ensureAgentSession('sess1');

			// Create 100 retro task IDs
			const retroTaskIds = Array.from(
				{ length: 100 },
				(_, i) => `retro-${i + 2}`,
			);
			const singleError = ['error: Schema validation failed'];

			// Primary returns not_found, all 100 fallbacks return invalid_schema
			mockLoadEvidence.mockResolvedValueOnce({ status: 'not_found' });

			for (let i = 0; i < 100; i++) {
				mockLoadEvidence.mockResolvedValue({
					status: 'invalid_schema',
					errors: singleError,
				});
			}

			mockListEvidenceTaskIds.mockResolvedValue(retroTaskIds);

			// Act - should handle 100 bundles
			const result = await phase_complete.execute({
				phase,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);

			// Assert - should have accumulated all errors
			expect(parsed.success).toBe(false);
			expect(parsed.message).toContain('Schema validation failed');
		});

		test('should handle 1000 retro bundles with complex errors', async () => {
			// Arrange
			const phase = 1;
			ensureAgentSession('sess1');

			// Create 1000 retro task IDs
			const retroTaskIds = Array.from(
				{ length: 1000 },
				(_, i) => `retro-${i + 2}`,
			);
			const complexErrors = [
				'schema_version: Required',
				'entries: Must be array',
				'entries.0.type: Invalid enum',
				'entries.0.timestamp: Invalid date format',
				'entries.0.phase_number: Expected number',
			];

			// Primary returns not_found, all 1000 fallbacks return invalid_schema
			mockLoadEvidence.mockResolvedValueOnce({ status: 'not_found' });

			for (let i = 0; i < 1000; i++) {
				mockLoadEvidence.mockResolvedValue({
					status: 'invalid_schema',
					errors: complexErrors,
				});
			}

			mockListEvidenceTaskIds.mockResolvedValue(retroTaskIds);

			// Act - should handle 1000 × 5 = 5000 errors
			const result = await phase_complete.execute({
				phase,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);

			// Assert
			expect(parsed.success).toBe(false);
			// Check message contains multiple error types
			expect(parsed.message).toContain('schema_version: Required');
			expect(parsed.message).toContain('entries: Must be array');
		});
	});

	describe('warnings[1] template — injection via phase number', () => {
		test('should embed phase number in template without sanitization', async () => {
			// Arrange
			const phase = 1;
			ensureAgentSession('sess1');

			mockLoadEvidence.mockResolvedValue({ status: 'not_found' });
			mockListEvidenceTaskIds.mockResolvedValue([]);

			// Act
			const result = await phase_complete.execute({
				phase,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);

			// Assert - phase number appears in template
			const template = JSON.parse(parsed.warnings[1] as string);
			expect(template.entries[0].phase_number).toBe(1);
			expect(template.task_id).toBe('retro-1');
			expect(template.entries[0].summary).toContain('Phase 1');
		});

		test('should handle large phase number in template', async () => {
			// Arrange
			const phase = 999999999;
			ensureAgentSession('sess1');

			mockLoadEvidence.mockResolvedValue({ status: 'not_found' });
			mockListEvidenceTaskIds.mockResolvedValue([]);

			// Act
			const result = await phase_complete.execute({
				phase,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);

			// Assert - large phase number appears in template
			const template = JSON.parse(parsed.warnings[1] as string);
			expect(template.entries[0].phase_number).toBe(999999999);
			expect(template.task_id).toBe('retro-999999999');
		});

		test('should handle MAX_SAFE_INTEGER phase in template', async () => {
			// Arrange
			const phase = Number.MAX_SAFE_INTEGER;
			ensureAgentSession('sess1');

			mockLoadEvidence.mockResolvedValue({ status: 'not_found' });
			mockListEvidenceTaskIds.mockResolvedValue([]);

			// Act
			const result = await phase_complete.execute({
				phase,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);

			// Assert - MAX_SAFE_INTEGER appears in template
			const template = JSON.parse(parsed.warnings[1] as string);
			expect(template.entries[0].phase_number).toBe(Number.MAX_SAFE_INTEGER);
			expect(template.task_id).toBe(`retro-${Number.MAX_SAFE_INTEGER}`);
		});

		test('template phase_number cannot be used for JSON injection', async () => {
			// Arrange
			const phase = 1;
			ensureAgentSession('sess1');

			mockLoadEvidence.mockResolvedValue({ status: 'not_found' });
			mockListEvidenceTaskIds.mockResolvedValue([]);

			// Act
			const result = await phase_complete.execute({
				phase,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);

			// Assert - phase_number is a number, not a string, so injection impossible
			const template = JSON.parse(parsed.warnings[1] as string);
			expect(typeof template.entries[0].phase_number).toBe('number');
		});

		test('template task_id with phase cannot be used for injection', async () => {
			// Arrange
			const phase = 1;
			ensureAgentSession('sess1');

			mockLoadEvidence.mockResolvedValue({ status: 'not_found' });
			mockListEvidenceTaskIds.mockResolvedValue([]);

			// Act
			const result = await phase_complete.execute({
				phase,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);

			// Assert - task_id is constructed from phase, not user input
			const template = JSON.parse(parsed.warnings[1] as string);
			expect(template.task_id).toBe('retro-1');
			expect(typeof template.task_id).toBe('string');
			expect(template.task_id).not.toContain('<');
			expect(template.task_id).not.toContain('>');
		});
	});
});

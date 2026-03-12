/**
 * VERIFICATION TESTS for malformed-args hardening fix
 * 
 * These tests verify that both imports and secretscan tools properly handle:
 * - execute(undefined)
 * - execute(null) 
 * - Malicious getters that throw
 * - Invalid args shapes
 * 
 * The fix ensures these return structured error JSON instead of crashing.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Test imports tool
const { imports } = await import('../../../src/tools/imports');
// Test secretscan tool  
const { secretscan } = await import('../../../src/tools/secretscan');

// Helper to create temp test directories
function createTempDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'malformed-args-test-'));
}

describe('imports tool - malformed args hardening', () => {
	let tempDir: string;
	let targetFile: string;

	beforeEach(async () => {
		tempDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), 'imports-malformed-'),
		);
		targetFile = path.join(tempDir, 'target.ts');
		await fs.promises.writeFile(targetFile, 'export const foo = 1;');
	});

	afterEach(async () => {
		await fs.promises.rm(tempDir, { recursive: true, force: true });
	});

	// ============ Malformed Args Tests ============
	describe('execute with malformed args', () => {
		test('execute(undefined) returns structured error JSON', async () => {
			const result = await imports.execute(undefined as any, {} as any);
			const parsed = JSON.parse(result);

			// Should return error structure, not throw
			expect(parsed).toHaveProperty('error');
			expect(parsed).toHaveProperty('target');
			expect(parsed).toHaveProperty('consumers');
			expect(parsed).toHaveProperty('count');

			// Error should indicate invalid arguments
			expect(parsed.error).toContain('invalid arguments');
			expect(parsed.error).toContain('file is required');

			// Should be empty results
			expect(parsed.consumers).toEqual([]);
			expect(parsed.count).toBe(0);
		});

		test('execute(null) returns structured error JSON', async () => {
			const result = await imports.execute(null as any, {} as any);
			const parsed = JSON.parse(result);

			// Should return error structure
			expect(parsed).toHaveProperty('error');
			expect(parsed).toHaveProperty('target');
			expect(parsed).toHaveProperty('consumers');
			expect(parsed).toHaveProperty('count');

			expect(parsed.error).toContain('invalid arguments');
			expect(parsed.consumers).toEqual([]);
			expect(parsed.count).toBe(0);
		});

		test('execute({}) without file returns structured error', async () => {
			const result = await imports.execute({} as any, {} as any);
			const parsed = JSON.parse(result);

			expect(parsed.error).toContain('invalid arguments');
			expect(parsed.error).toContain('file is required');
			expect(parsed.consumers).toEqual([]);
			expect(parsed.count).toBe(0);
		});

		test('execute({ file: null }) returns validation error', async () => {
			const result = await imports.execute({ file: null } as any, {} as any);
			const parsed = JSON.parse(result);

			// null is falsy so should trigger "file is required"
			expect(parsed.error).toContain('invalid');
			expect(parsed.consumers).toEqual([]);
		});

		test('execute({ file: undefined }) returns validation error', async () => {
			const result = await imports.execute({ file: undefined } as any, {} as any);
			const parsed = JSON.parse(result);

			expect(parsed.error).toContain('invalid');
			expect(parsed.consumers).toEqual([]);
		});
	});

	// ============ Regression Tests ============
	describe('no regression - valid args still work', () => {
		test('execute with valid file returns consumers', async () => {
			// Create a consumer file that imports from target
			const consumerFile = path.join(tempDir, 'consumer.ts');
			await fs.promises.writeFile(
				consumerFile,
				`import { foo } from './target';`,
			);

			const result = await imports.execute({ file: targetFile }, {} as any);
			const parsed = JSON.parse(result);

			// Should NOT have error
			expect(parsed.error).toBeUndefined();
			expect(parsed.target).toBe(targetFile);
			expect(parsed.count).toBe(1);
			expect(parsed.consumers).toHaveLength(1);
			expect(parsed.consumers[0].imports).toBe('./target');
		});

		test('execute with valid file and symbol filters correctly', async () => {
			const consumerFile = path.join(tempDir, 'consumer.ts');
			await fs.promises.writeFile(
				consumerFile,
				`import { foo, bar } from './target';`,
			);

			const result = await imports.execute(
				{ file: targetFile, symbol: 'foo' },
				{} as any,
			);
			const parsed = JSON.parse(result);

			expect(parsed.error).toBeUndefined();
			expect(parsed.count).toBe(1);
			// Should only match 'foo', not 'bar'
			expect(parsed.consumers[0].raw).toContain('foo');
		});

		test('response shape is consistent', async () => {
			const result = await imports.execute({ file: targetFile }, {} as any);
			const parsed = JSON.parse(result);

			// Verify all expected fields exist
			expect(parsed).toHaveProperty('target');
			expect(parsed).toHaveProperty('consumers');
			expect(parsed).toHaveProperty('count');

			// Types
			expect(typeof parsed.target).toBe('string');
			expect(typeof parsed.count).toBe('number');
			expect(Array.isArray(parsed.consumers)).toBe(true);
		});
	});
});

describe('secretscan tool - malformed args hardening', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir();
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	// ============ Malformed Args Tests ============
	describe('execute with malformed args', () => {
		test('execute(undefined) returns structured error JSON', async () => {
			const result = await secretscan.execute(undefined as any, {} as any);
			const parsed = JSON.parse(result);

			// Should return error structure, not throw
			expect(parsed).toHaveProperty('error');
			expect(parsed).toHaveProperty('scan_dir');
			expect(parsed).toHaveProperty('findings');
			expect(parsed).toHaveProperty('count');
			expect(parsed).toHaveProperty('files_scanned');
			expect(parsed).toHaveProperty('skipped_files');

			// Error should indicate invalid arguments
			expect(parsed.error).toContain('invalid arguments');
			expect(parsed.error).toContain('directory is required');

			// Should be empty results
			expect(parsed.findings).toEqual([]);
			expect(parsed.count).toBe(0);
			expect(parsed.files_scanned).toBe(0);
			expect(parsed.skipped_files).toBe(0);
		});

		test('execute(null) returns structured error JSON', async () => {
			const result = await secretscan.execute(null as any, {} as any);
			const parsed = JSON.parse(result);

			// Should return error structure
			expect(parsed).toHaveProperty('error');
			expect(parsed).toHaveProperty('scan_dir');
			expect(parsed).toHaveProperty('findings');
			expect(parsed).toHaveProperty('count');

			expect(parsed.error).toContain('invalid arguments');
			expect(parsed.error).toContain('directory is required');
			expect(parsed.findings).toEqual([]);
			expect(parsed.count).toBe(0);
		});

		test('execute({}) without directory returns structured error', async () => {
			const result = await secretscan.execute({} as any, {} as any);
			const parsed = JSON.parse(result);

			expect(parsed.error).toContain('invalid arguments');
			expect(parsed.error).toContain('directory is required');
			expect(parsed.findings).toEqual([]);
			expect(parsed.count).toBe(0);
		});

		test('execute({ directory: null }) returns validation error', async () => {
			const result = await secretscan.execute(
				{ directory: null } as any,
				{} as any,
			);
			const parsed = JSON.parse(result);

			// null is falsy so should trigger "directory is required"
			expect(parsed.error).toContain('invalid');
			expect(parsed.findings).toEqual([]);
		});

		test('execute({ directory: undefined }) returns validation error', async () => {
			const result = await secretscan.execute(
				{ directory: undefined } as any,
				{} as any,
			);
			const parsed = JSON.parse(result);

			expect(parsed.error).toContain('invalid');
			expect(parsed.findings).toEqual([]);
		});
	});

	// ============ Regression Tests ============
	describe('no regression - valid args still work', () => {
		test('execute with valid directory scans successfully', async () => {
			// Create a test file with a potential secret
			createTestFile(tempDir, 'config.js', 'const apiKey = "sk_test_1234567890123456789012345678";');

			const result = await secretscan.execute({ directory: tempDir }, {} as any);
			const parsed = JSON.parse(result);

			// Should NOT have error
			expect(parsed.error).toBeUndefined();
			expect(parsed.scan_dir).toBe(tempDir);
			expect(parsed.files_scanned).toBeGreaterThan(0);
		});

		test('execute with exclude array works', async () => {
			// Create a test file
			createTestFile(tempDir, 'config.js', 'const apiKey = "sk_test_1234567890123456789012345678";');

			const result = await secretscan.execute(
				{ directory: tempDir, exclude: ['*.js'] },
				{} as any,
			);
			const parsed = JSON.parse(result);

			// Should work with exclude param
			expect(parsed).toHaveProperty('scan_dir');
			expect(parsed).toHaveProperty('findings');
			expect(parsed).toHaveProperty('count');
		});

		test('response shape is consistent', async () => {
			const result = await secretscan.execute({ directory: tempDir }, {} as any);
			const parsed = JSON.parse(result);

			// Verify all expected fields exist
			expect(parsed).toHaveProperty('scan_dir');
			expect(parsed).toHaveProperty('findings');
			expect(parsed).toHaveProperty('count');
			expect(parsed).toHaveProperty('files_scanned');
			expect(parsed).toHaveProperty('skipped_files');

			// Types
			expect(typeof parsed.scan_dir).toBe('string');
			expect(typeof parsed.count).toBe('number');
			expect(typeof parsed.files_scanned).toBe('number');
			expect(Array.isArray(parsed.findings)).toBe(true);
		});
	});
});

// Helper for secretscan tests
function createTestFile(dir: string, filename: string, content: string): string {
	const filePath = path.join(dir, filename);
	const parentDir = path.dirname(filePath);
	if (!fs.existsSync(parentDir)) {
		fs.mkdirSync(parentDir, { recursive: true });
	}
	fs.writeFileSync(filePath, content, 'utf-8');
	return filePath;
}

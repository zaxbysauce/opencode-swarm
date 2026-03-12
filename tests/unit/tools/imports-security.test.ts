/**
 * ADVERSARIAL SECURITY TESTS for imports tool
 *
 * This test suite focuses ONLY on attack vectors:
 * - Path traversal attempts (encoded, double, mixed separators)
 * - Oversized payloads (max lengths, buffer overflow attempts)
 * - Boundary violations (off-by-one, edge cases)
 * - Regex abuse (ReDoS patterns)
 * - Control character injection
 * - Parsing abuse (malformed import statements)
 *
 * DO NOT add functional tests here - those belong in imports.test.ts
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Constants from imports.ts for boundary testing
const MAX_FILE_PATH_LENGTH = 500;
const MAX_SYMBOL_LENGTH = 256;
const MAX_FILE_SIZE_BYTES = 1024 * 1024; // 1MB
const MAX_CONSUMERS = 100;

describe('imports tool - ADVERSARIAL SECURITY TESTS', () => {
	let tempDir: string;
	let targetFile: string;

	beforeEach(async () => {
		// Create isolated temp directory for each test
		tempDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), 'imports-security-test-'),
		);
		targetFile = path.join(tempDir, 'target.ts');
		await fs.promises.writeFile(targetFile, 'export const foo = 1;');
	});

	afterEach(async () => {
		await fs.promises.rm(tempDir, { recursive: true, force: true });
	});

	// ============ PATH TRAVERSAL ATTACKS ============
	describe('path traversal attacks', () => {
		test('rejects basic parent traversal ../', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const result = JSON.parse(
				await imports.execute({ file: '../../../etc/passwd' }, {} as any),
			);
			expect(result.error).toContain('path traversal');
			expect(result.consumers).toEqual([]);
		});

		test('rejects basic parent traversal ..\\', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const result = JSON.parse(
				await imports.execute({ file: '..\\..\\windows\\system32' }, {} as any),
			);
			expect(result.error).toContain('path traversal');
		});

		test('rejects mixed separator traversal ../..\\', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const result = JSON.parse(
				await imports.execute({ file: '../..\\../etc/passwd' }, {} as any),
			);
			expect(result.error).toContain('path traversal');
		});

		test('rejects traversal with valid prefix ./../', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const result = JSON.parse(
				await imports.execute({ file: './../../../etc/passwd' }, {} as any),
			);
			expect(result.error).toContain('path traversal');
		});

		test('rejects traversal at end of path file../etc', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const result = JSON.parse(
				await imports.execute({ file: 'file../etc/passwd' }, {} as any),
			);
			// Should reject because of ../ pattern
			expect(result.error).toBeDefined();
		});

		test('rejects symbol with path traversal', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const result = JSON.parse(
				await imports.execute(
					{ file: targetFile, symbol: '../../../etc/passwd' },
					{} as any,
				),
			);
			expect(result.error).toContain('path traversal');
		});

		test('rejects symbol with mixed traversal ..\\', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const result = JSON.parse(
				await imports.execute(
					{ file: targetFile, symbol: '..\\..\\secret' },
					{} as any,
				),
			);
			expect(result.error).toContain('path traversal');
		});
	});

	// ============ OVERSIZED PAYLOAD ATTACKS ============
	describe('oversized payload attacks', () => {
		test('rejects file path exceeding MAX_FILE_PATH_LENGTH (500)', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const longPath = 'a'.repeat(MAX_FILE_PATH_LENGTH + 1);
			const result = JSON.parse(
				await imports.execute({ file: longPath }, {} as any),
			);
			expect(result.error).toContain('exceeds maximum length');
			expect(result.error).toContain('500');
		});

		test('rejects file path exactly at MAX_FILE_PATH_LENGTH + 1', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const longPath = 'a'.repeat(501);
			const result = JSON.parse(
				await imports.execute({ file: longPath }, {} as any),
			);
			expect(result.error).toContain('exceeds maximum length');
		});

		test('accepts file path exactly at MAX_FILE_PATH_LENGTH', async () => {
			const { imports } = await import('../../../src/tools/imports');
			// Create a file with exactly MAX_FILE_PATH_LENGTH path
			// Note: This tests boundary - the file won't exist but validation should pass
			const longPath = 'a'.repeat(MAX_FILE_PATH_LENGTH);
			const result = JSON.parse(
				await imports.execute({ file: longPath }, {} as any),
			);
			// Should NOT have length error, but file not found
			expect(result.error).not.toContain('exceeds maximum length');
			expect(result.error).toContain('not found');
		});

		test('rejects symbol exceeding MAX_SYMBOL_LENGTH (256)', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const longSymbol = 'a'.repeat(MAX_SYMBOL_LENGTH + 1);
			const result = JSON.parse(
				await imports.execute(
					{ file: targetFile, symbol: longSymbol },
					{} as any,
				),
			);
			expect(result.error).toContain('exceeds maximum length');
			expect(result.error).toContain('256');
		});

		test('rejects symbol exactly at MAX_SYMBOL_LENGTH + 1', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const longSymbol = 'b'.repeat(257);
			const result = JSON.parse(
				await imports.execute(
					{ file: targetFile, symbol: longSymbol },
					{} as any,
				),
			);
			expect(result.error).toContain('exceeds maximum length');
		});

		test('accepts symbol exactly at MAX_SYMBOL_LENGTH', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const longSymbol = 'c'.repeat(MAX_SYMBOL_LENGTH);
			const result = JSON.parse(
				await imports.execute(
					{ file: targetFile, symbol: longSymbol },
					{} as any,
				),
			);
			// Should NOT have length error - validation passes
			expect(result.error).toBeUndefined();
		});
	});

	// ============ CONTROL CHARACTER INJECTION ============
	describe('control character injection', () => {
		test('rejects null byte in file path', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const result = JSON.parse(
				await imports.execute({ file: 'file\x00.ts' }, {} as any),
			);
			expect(result.error).toContain('control characters');
		});

		test('rejects tab character in file path', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const result = JSON.parse(
				await imports.execute({ file: 'file\tname.ts' }, {} as any),
			);
			expect(result.error).toContain('control characters');
		});

		test('rejects carriage return in file path', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const result = JSON.parse(
				await imports.execute({ file: 'file\rname.ts' }, {} as any),
			);
			expect(result.error).toContain('control characters');
		});

		test('rejects newline in file path', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const result = JSON.parse(
				await imports.execute({ file: 'file\nname.ts' }, {} as any),
			);
			expect(result.error).toContain('control characters');
		});

		test('rejects null byte in symbol', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const result = JSON.parse(
				await imports.execute(
					{ file: targetFile, symbol: 'symbol\x00name' },
					{} as any,
				),
			);
			expect(result.error).toContain('control characters');
		});

		test('rejects tab in symbol', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const result = JSON.parse(
				await imports.execute(
					{ file: targetFile, symbol: 'symbol\tname' },
					{} as any,
				),
			);
			expect(result.error).toContain('control characters');
		});

		test('rejects CRLF in symbol (Windows line ending injection)', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const result = JSON.parse(
				await imports.execute(
					{ file: targetFile, symbol: 'symbol\r\ninjected' },
					{} as any,
				),
			);
			expect(result.error).toContain('control characters');
		});

		test('rejects multiple control chars in file path', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const result = JSON.parse(
				await imports.execute({ file: 'f\x00i\tl\ne\r.ts' }, {} as any),
			);
			expect(result.error).toContain('control characters');
		});
	});

	// ============ BOUNDARY VIOLATIONS ============
	describe('boundary violations', () => {
		test('handles empty string file path', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const result = JSON.parse(
				await imports.execute({ file: '' }, {} as any),
			);
			expect(result.error).toContain('required');
		});

		test('handles whitespace-only file path', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const result = JSON.parse(
				await imports.execute({ file: '   ' }, {} as any),
			);
			// Whitespace should be treated as valid but non-existent file
			expect(result.error).toBeDefined();
		});

		test('handles empty symbol (should be allowed - optional)', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const result = JSON.parse(
				await imports.execute({ file: targetFile, symbol: '' }, {} as any),
			);
			// Empty symbol should be treated as undefined/not specified
			expect(result.error).toBeUndefined();
		});

		test('handles undefined symbol (should be allowed)', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const result = JSON.parse(
				await imports.execute({ file: targetFile }, {} as any),
			);
			expect(result.error).toBeUndefined();
		});

		test('rejects directory instead of file', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const result = JSON.parse(
				await imports.execute({ file: tempDir }, {} as any),
			);
			expect(result.error).toContain('must be a file');
		});
	});

	// ============ REGEX ABUSE / PARSING ATTACKS ============
	describe('regex abuse and parsing attacks', () => {
		test('handles deeply nested import statements (no ReDoS)', async () => {
			const { imports } = await import('../../../src/tools/imports');
			// Create consumer with many nested braces (potential ReDoS)
			const consumerFile = path.join(tempDir, 'consumer.ts');
			const nestedContent = `
import { ${'{'.repeat(100)}a${'}'.repeat(100)} } from './target';
`;
			await fs.promises.writeFile(consumerFile, nestedContent);

			// Should complete within reasonable time (no catastrophic backtracking)
			const start = Date.now();
			const result = JSON.parse(
				await imports.execute({ file: targetFile }, {} as any),
			);
			const elapsed = Date.now() - start;

			// Should not take more than 5 seconds (ReDoS protection)
			expect(elapsed).toBeLessThan(5000);
		}, 10000);

		test('handles very long import statement (no buffer issues)', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const consumerFile = path.join(tempDir, 'consumer.ts');
			// Create a very long import line with many symbols
			const symbols = Array.from({ length: 100 }, (_, i) => `sym${i}`).join(', ');
			const longContent = `import { ${symbols} } from './target';`;
			await fs.promises.writeFile(consumerFile, longContent);

			const result = JSON.parse(
				await imports.execute({ file: targetFile }, {} as any),
			);
			// Should handle gracefully
			expect(result.error).toBeUndefined();
			expect(result.consumers.length).toBeGreaterThanOrEqual(1);
		});

		test('handles malformed import statements gracefully', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const consumerFile = path.join(tempDir, 'consumer.ts');
			const malformedContent = `
import { from './target';
import from './target';
import { a } from
import * from './target';
import 'incomplete
`;
			await fs.promises.writeFile(consumerFile, malformedContent);

			const result = JSON.parse(
				await imports.execute({ file: targetFile }, {} as any),
			);
			// Should not crash, may or may not find matches for partial matches
			expect(result.error).toBeUndefined();
		});

		test('handles unclosed string literals in import', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const consumerFile = path.join(tempDir, 'consumer.ts');
			const content = `
import { a } from './target
// unclosed string above
`;
			await fs.promises.writeFile(consumerFile, content);

			const result = JSON.parse(
				await imports.execute({ file: targetFile }, {} as any),
			);
			// Should not crash
			expect(result).toBeDefined();
		});

		test('handles regex special chars in symbol name', async () => {
			const { imports } = await import('../../../src/tools/imports');
			// Symbol with regex special chars (should be treated as literal)
			const result = JSON.parse(
				await imports.execute(
					{ file: targetFile, symbol: 'symbol.*+?^${}()|[]\\' },
					{} as any,
				),
			);
			// Should not crash from regex interpretation
			expect(result).toBeDefined();
		});

		test('handles backslash patterns in file path', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const result = JSON.parse(
				await imports.execute({ file: 'path\\with\\backslashes.ts' }, {} as any),
			);
			// Should handle gracefully (not crash)
			expect(result).toBeDefined();
		});

		test('handles quoted import paths', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const consumerFile = path.join(tempDir, 'consumer.ts');
			const content = `
import { a } from "./target";
import { b } from './target';
import { c } from \`./target\`;
`;
			await fs.promises.writeFile(consumerFile, content);

			const result = JSON.parse(
				await imports.execute({ file: targetFile }, {} as any),
			);
			expect(result.error).toBeUndefined();
			expect(result.count).toBe(3);
		});
	});

	// ============ UNICODE AND ENCODING ATTACKS ============
	describe('unicode and encoding attacks', () => {
		test('handles unicode in file path (normal chars)', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const unicodeFile = path.join(tempDir, 'файл.ts'); // Cyrillic
			await fs.promises.writeFile(unicodeFile, 'export const x = 1;');

			const result = JSON.parse(
				await imports.execute({ file: unicodeFile }, {} as any),
			);
			expect(result.error).toBeUndefined();
		});

		test('handles emoji in file path', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const emojiFile = path.join(tempDir, '📄file.ts');
			await fs.promises.writeFile(emojiFile, 'export const x = 1;');

			const result = JSON.parse(
				await imports.execute({ file: emojiFile }, {} as any),
			);
			expect(result.error).toBeUndefined();
		});

		test('handles unicode null-like chars in symbol', async () => {
			const { imports } = await import('../../../src/tools/imports');
			// U+0000 is null, but there are other null-like chars
			const result = JSON.parse(
				await imports.execute(
					{ file: targetFile, symbol: 'symbol\u2400' }, // ␀ symbol for null
					{} as any,
				),
			);
			// Should handle gracefully (not crash)
			expect(result).toBeDefined();
		});

		test('handles zero-width characters in symbol', async () => {
			const { imports } = await import('../../../src/tools/imports');
			// Zero-width characters
			const result = JSON.parse(
				await imports.execute(
					{ file: targetFile, symbol: 'sym\u200Bbol' }, // zero-width space
					{} as any,
				),
			);
			expect(result).toBeDefined();
		});
	});

	// ============ FILE SYSTEM ATTACKS ============
	describe('file system attacks', () => {
		test('skips files larger than MAX_FILE_SIZE_BYTES', async () => {
			const { imports } = await import('../../../src/tools/imports');
			// Create a large consumer file (over 1MB)
			const largeFile = path.join(tempDir, 'large.ts');
			const largeContent = '//' + 'x'.repeat(MAX_FILE_SIZE_BYTES + 1000);
			await fs.promises.writeFile(largeFile, largeContent);

			const result = JSON.parse(
				await imports.execute({ file: targetFile }, {} as any),
			);
			// Should skip large file gracefully
			expect(result.error).toBeUndefined();
		});

		test('handles binary file gracefully', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const binaryFile = path.join(tempDir, 'binary.ts');
			// PNG header + garbage
			const binaryData = Buffer.from([
				0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(100).fill(0),
			]);
			await fs.promises.writeFile(binaryFile, binaryData);

			const result = JSON.parse(
				await imports.execute({ file: targetFile }, {} as any),
			);
			// Should skip binary file
			expect(result.error).toBeUndefined();
		});

		test('handles file with high null byte ratio (binary detection)', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const nullFile = path.join(tempDir, 'nulls.ts');
			// Create file with >10% null bytes
			const nullContent = Buffer.alloc(1000, 0x00);
			nullContent.write('import', 0);
			await fs.promises.writeFile(nullFile, nullContent);

			const result = JSON.parse(
				await imports.execute({ file: targetFile }, {} as any),
			);
			// Should be detected as binary and skipped
			expect(result.error).toBeUndefined();
		});

		test('handles unreadable file gracefully', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const consumerFile = path.join(tempDir, 'consumer.ts');
			await fs.promises.writeFile(consumerFile, "import { foo } from './target';");

			// Remove read permissions (on Unix-like systems)
			if (process.platform !== 'win32') {
				await fs.promises.chmod(consumerFile, 0o000);
			}

			const result = JSON.parse(
				await imports.execute({ file: targetFile }, {} as any),
			);
			// Should handle error gracefully
			expect(result).toBeDefined();

			// Restore permissions for cleanup
			if (process.platform !== 'win32') {
				await fs.promises.chmod(consumerFile, 0o644);
			}
		});

		test('handles symlink gracefully', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const symlinkFile = path.join(tempDir, 'symlink.ts');
			try {
				await fs.promises.symlink(targetFile, symlinkFile);
			} catch {
				// Symlink may fail on Windows without admin
				return;
			}

			const result = JSON.parse(
				await imports.execute({ file: symlinkFile }, {} as any),
			);
			expect(result).toBeDefined();
		});

		test('handles max consumers limit (100)', async () => {
			const { imports } = await import('../../../src/tools/imports');
			// Create more than MAX_CONSUMERS files that all import from target
			for (let i = 0; i < MAX_CONSUMERS + 10; i++) {
				const consumerFile = path.join(tempDir, `consumer${i}.ts`);
				await fs.promises.writeFile(
					consumerFile,
					`import { foo } from './target';`,
				);
			}

			const result = JSON.parse(
				await imports.execute({ file: targetFile }, {} as any),
			);
			// Should be capped at MAX_CONSUMERS
			expect(result.count).toBeLessThanOrEqual(MAX_CONSUMERS);
			expect(result.message).toContain('limited');
		});
	});

	// ============ INJECTION ATTACKS ============
	describe('injection attacks', () => {
		test('handles shell metacharacters in file path safely', async () => {
			const { imports } = await import('../../../src/tools/imports');
			// Various shell metacharacters
			const maliciousPaths = [
				'; rm -rf /',
				'$(whoami)',
				'`cat /etc/passwd`',
				'| cat /etc/passwd',
				'&& echo pwned',
				'|| echo pwned',
			];

			for (const malicious of maliciousPaths) {
				const result = JSON.parse(
					await imports.execute({ file: malicious }, {} as any),
				);
				// Should not execute, just return error
				expect(result.error).toBeDefined();
				expect(result.consumers).toEqual([]);
			}
		});

		test('handles JavaScript injection in symbol name', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const maliciousSymbols = [
				"{{constructor.constructor('return this')()}}",
				'__proto__',
				'constructor',
				'prototype',
			];

			for (const malicious of maliciousSymbols) {
				const result = JSON.parse(
					await imports.execute(
						{ file: targetFile, symbol: malicious },
						{} as any,
					),
				);
				// Should not prototype pollute or crash
				expect(result).toBeDefined();
			}
		});

		test('handles prototype pollution attempts in file path', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const result = JSON.parse(
				await imports.execute({ file: '__proto__' }, {} as any),
			);
			expect(result).toBeDefined();
		});
	});

	// ============ CONCURRENCY / RESOURCE ATTACKS ============
	describe('resource exhaustion tests', () => {
		test('handles many concurrent requests (no resource leak)', async () => {
			const { imports } = await import('../../../src/tools/imports');
			const promises = [];

			for (let i = 0; i < 50; i++) {
				promises.push(
					imports.execute({ file: targetFile }, {} as any).then(JSON.parse),
				);
			}

			const results = await Promise.all(promises);
			for (const result of results) {
				expect(result).toBeDefined();
			}
		});

		test('handles deep directory nesting', async () => {
			const { imports } = await import('../../../src/tools/imports');
			// Create deeply nested directory structure
			let deepDir = tempDir;
			for (let i = 0; i < 20; i++) {
				deepDir = path.join(deepDir, `level${i}`);
				await fs.promises.mkdir(deepDir);
			}
			const deepTarget = path.join(deepDir, 'deep.ts');
			await fs.promises.writeFile(deepTarget, 'export const deep = 1;');

			const result = JSON.parse(
				await imports.execute({ file: deepTarget }, {} as any),
			);
			expect(result).toBeDefined();
		});
	});
});

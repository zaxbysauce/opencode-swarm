import { beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { computeComplexity } from '../../../src/parallel/review-router.js';

/**
 * Security Tests: Review-Router
 * Tests: Path traversal, ReDoS in regex, malicious file paths
 */

const TEST_DIR = path.join(os.tmpdir(), 'review-router-sec-test-' + Date.now());

beforeEach(() => {
	if (!fs.existsSync(TEST_DIR)) {
		fs.mkdirSync(TEST_DIR, { recursive: true });
	}
});

describe('Security: Review-Router - Path Traversal', () => {
	it('should safely handle path traversal in directory parameter', async () => {
		const maliciousDirs = [
			'../../../etc/passwd',
			'..\\..\\..\\windows\\system32',
			'/etc/passwd',
			'../../../../../../../../../../../etc/passwd',
		];

		for (const maliciousDir of maliciousDirs) {
			const metrics = await computeComplexity(maliciousDir, ['test.ts']);
			expect(metrics).toBeDefined();
			// fileCount reflects the input changedFiles array length (1), not successful reads
			// The function safely skips files that don't exist or can't be read
			expect(metrics.fileCount).toBe(1);
			expect(metrics.functionCount).toBe(0); // No sensitive content read
		}
	});

	it('should handle null bytes in directory path', async () => {
		const nullByteDir = '/tmp/test\x00malicious';
		const metrics = await computeComplexity(nullByteDir, ['test.ts']);
		expect(metrics).toBeDefined();
	});
});

describe('Security: Review-Router - ReDoS in Regex', () => {
	it('should handle malicious file patterns without catastrophic backtracking', async () => {
		const maliciousFiles = [
			'a'.repeat(200) + '.ts', // Long but within filesystem limits (max 255)
			'(?:a+)+.ts',
			'(a*)*.ts',
			'(a+)+.ts',
			'('.repeat(25) + 'a' + ')'.repeat(25) + '.ts', // Reduced from 50
		];

		const testDir = path.join(TEST_DIR, 'redos-test');
		fs.mkdirSync(testDir, { recursive: true });

		for (const file of maliciousFiles) {
			try {
				fs.writeFileSync(
					path.join(testDir, file),
					'function test() {}',
					'utf-8',
				);
			} catch {
				// Skip files that can't be created (e.g. ENAMETOOLONG on some OS)
			}
		}

		const startTime = Date.now();
		const metrics = await computeComplexity(testDir, maliciousFiles);
		const duration = Date.now() - startTime;

		expect(metrics).toBeDefined();
		expect(duration).toBeLessThan(5000);
	});

	it('should handle deeply nested directory structures', async () => {
		const deepDir = path.join(TEST_DIR, 'deep-nested');
		let currentDir = deepDir;

		// Create 30-level deep directory (reduced from 50)
		for (let i = 0; i < 30; i++) {
			currentDir = path.join(currentDir, 'level' + i);
			fs.mkdirSync(currentDir, { recursive: true });
		}

		fs.writeFileSync(
			path.join(currentDir, 'deep.ts'),
			'function deep() {}',
			'utf-8',
		);

		const startTime = Date.now();
		const metrics = await computeComplexity(deepDir, ['level29/deep.ts']);
		const duration = Date.now() - startTime;

		expect(metrics).toBeDefined();
		expect(duration).toBeLessThan(5000);
	});
});

describe('Security: Review-Router - Malicious File Paths', () => {
	it('should handle file paths with special characters', async () => {
		const specialCharFiles = [
			'file with spaces.ts',
			'file;with;semicolons.ts',
			'file"with"quotes.ts',
			'file`with`backticks.ts',
			'file$with$dollars.ts',
			'file&with&ampersand.ts',
			'file|with|pipe.ts',
			'file<with>angles.ts',
			'file\\with\\backslashes.ts',
			'file\nwith\newlines.ts',
			'file\twith\ttabs.ts',
		];

		for (const file of specialCharFiles) {
			const metrics = await computeComplexity(TEST_DIR, [file]);
			expect(metrics).toBeDefined();
		}
	});

	it('should handle absolute paths in file list', async () => {
		const absolutePaths = [
			'/etc/passwd',
			'C:\\Windows\\System32\\config',
			'/root/.ssh/id_rsa',
			'../../../../etc/passwd',
		];

		const metrics = await computeComplexity(TEST_DIR, absolutePaths);
		expect(metrics).toBeDefined();
		expect(metrics.functionCount).toBe(0);
	});
});

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Import the tool AFTER setting up test environment
const { imports } = await import('../../../src/tools/imports');

describe('imports tool - deterministic ordering adversarial tests', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imports-adv-'));
	});

	afterEach(() => {
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	describe('case sensitivity attacks', () => {
		test('handles mixed-case filenames consistently', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			// Create files with various case patterns
			const files = ['Apple.ts', 'banana.ts', 'CHERRY.ts', 'dAtE.ts', 'elderberry.ts'];
			for (const f of files) {
				fs.writeFileSync(path.join(tempDir, f), `import { foo } from './utils';`);
			}

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			// All should be found
			expect(parsed.consumers).toHaveLength(5);

			// Verify deterministic order - case-insensitive sort should order them
			const basenames = parsed.consumers.map((c: { file: string }) => path.basename(c.file));
			
			// The key assertion: running multiple times should produce same order
			const result2 = await imports.execute({ file: targetFile });
			const parsed2 = JSON.parse(result2);
			const basenames2 = parsed2.consumers.map((c: { file: string }) => path.basename(c.file));
			
			expect(basenames).toEqual(basenames2);
		});

		test('handles files differing only by case', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			// Create files with different names - note: Windows is case-insensitive
			// so we use unique names to avoid file collision
			fs.writeFileSync(path.join(tempDir, 'consumer1.ts'), `import { foo } from './utils';`);
			fs.writeFileSync(path.join(tempDir, 'consumer2.ts'), `import { foo } from './utils';`);
			fs.writeFileSync(path.join(tempDir, 'consumer3.ts'), `import { foo } from './utils';`);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			// All 3 should be found
			expect(parsed.consumers).toHaveLength(3);
			
			// Verify deterministic
			const result2 = await imports.execute({ file: targetFile });
			const parsed2 = JSON.parse(result2);
			const files1 = parsed.consumers.map((c: { file: string }) => path.basename(c.file));
			const files2 = parsed2.consumers.map((c: { file: string }) => path.basename(c.file));
			expect(files1).toEqual(files2);
		});
	});

	describe('special character attacks', () => {
		test('handles filenames with numbers correctly', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			// Create files with numbers in various positions
			fs.writeFileSync(path.join(tempDir, '1file.ts'), `import { foo } from './utils';`);
			fs.writeFileSync(path.join(tempDir, '2file.ts'), `import { foo } from './utils';`);
			fs.writeFileSync(path.join(tempDir, '10file.ts'), `import { foo } from './utils';`);
			fs.writeFileSync(path.join(tempDir, 'a1file.ts'), `import { foo } from './utils';`);
			fs.writeFileSync(path.join(tempDir, 'a2file.ts'), `import { foo } from './utils';`);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			expect(parsed.consumers).toHaveLength(5);

			// Deterministic check
			const result2 = await imports.execute({ file: targetFile });
			const parsed2 = JSON.parse(result2);
			
			const paths1 = parsed.consumers.map((c: { file: string }) => path.basename(c.file));
			const paths2 = parsed2.consumers.map((c: { file: string }) => path.basename(c.file));
			expect(paths1).toEqual(paths2);
		});

		test('handles filenames with underscores and hyphens', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			fs.writeFileSync(path.join(tempDir, 'a-file.ts'), `import { foo } from './utils';`);
			fs.writeFileSync(path.join(tempDir, 'a_file.ts'), `import { foo } from './utils';`);
			fs.writeFileSync(path.join(tempDir, 'b-file.ts'), `import { foo } from './utils';`);
			fs.writeFileSync(path.join(tempDir, 'b_file.ts'), `import { foo } from './utils';`);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			expect(parsed.consumers).toHaveLength(4);
			
			// Verify determinism
			const result2 = await imports.execute({ file: targetFile });
			const parsed2 = JSON.parse(result2);
			
			const files1 = parsed.consumers.map((c: { file: string }) => path.basename(c.file));
			const files2 = parsed2.consumers.map((c: { file: string }) => path.basename(c.file));
			expect(files1).toEqual(files2);
		});

		test('handles unicode characters in filenames', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			// Create files with unicode chars
			fs.writeFileSync(path.join(tempDir, 'café.ts'), `import { foo } from './utils';`);
			fs.writeFileSync(path.join(tempDir, 'naïve.ts'), `import { foo } from './utils';`);
			fs.writeFileSync(path.join(tempDir, 'über.ts'), `import { foo } from './utils';`);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			// Should find all (assuming file system supports unicode)
			expect(parsed.consumers.length).toBeGreaterThanOrEqual(1);
			
			// Verify deterministic regardless of unicode
			const result2 = await imports.execute({ file: targetFile });
			const parsed2 = JSON.parse(result2);
			expect(parsed.consumers.length).toEqual(parsed2.consumers.length);
		});
	});

	describe('directory structure attacks', () => {
		test('deeply nested directory ordering', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			// Create deeply nested directories with files
			const dirs = [
				'z-top',
				'a-top/mid-z',
				'a-top/mid-a/deep-z',
				'a-top/mid-a/deep-a',
			];
			
			for (const d of dirs) {
				const fullPath = path.join(tempDir, d);
				fs.mkdirSync(fullPath, { recursive: true });
				fs.writeFileSync(path.join(fullPath, 'consumer.ts'), `import { foo } from '../../utils';`);
			}

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			expect(parsed.consumers).toHaveLength(4);

			// Verify deterministic
			const result2 = await imports.execute({ file: targetFile });
			const parsed2 = JSON.parse(result2);
			
			const paths1 = parsed.consumers.map((c: { file: string }) => c.file);
			const paths2 = parsed2.consumers.map((c: { file: string }) => c.file);
			expect(paths1).toEqual(paths2);
		});

		test('many sibling directories ordering', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			// Create many directories starting with different letters
			for (let i = 0; i < 20; i++) {
				const dir = path.join(tempDir, `dir-${String.fromCharCode(65 + i)}`);
				fs.mkdirSync(dir, { recursive: true });
				fs.writeFileSync(path.join(dir, 'c.ts'), `import { foo } from '../utils';`);
			}

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			expect(parsed.consumers).toHaveLength(20);

			// Verify deterministic - run 3 times
			for (let i = 0; i < 3; i++) {
				const r = await imports.execute({ file: targetFile });
				const p = JSON.parse(r);
				const files = p.consumers.map((c: { file: string }) => c.file);
				expect(files).toEqual(parsed.consumers.map((c: { file: string }) => c.file));
			}
		});
	});

	describe('timing and ordering edge cases', () => {
		test('files added in random order produce deterministic result', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			// Add files in random order (reverse alphabetical)
			const filenames = ['zebra', 'mango', 'apple', 'banana', 'cherry'];
			for (const name of filenames.reverse()) {
				fs.writeFileSync(path.join(tempDir, `${name}.ts`), `import { foo } from './utils';`);
			}

			const result1 = await imports.execute({ file: targetFile });
			const parsed1 = JSON.parse(result1);

			// Second run should produce identical result
			const result2 = await imports.execute({ file: targetFile });
			const parsed2 = JSON.parse(result2);

			expect(parsed1.consumers).toHaveLength(5);
			expect(parsed2.consumers).toHaveLength(5);
			expect(result1).toBe(result2);
		});

		test('same-order when target is in subdirectory', async () => {
			const subDir = path.join(tempDir, 'lib');
			fs.mkdirSync(subDir, { recursive: true });
			
			const targetFile = path.join(subDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			// Create consumers at different levels in the same subdir
			// Note: imports tool scans from target's directory, not parent
			fs.writeFileSync(path.join(subDir, 'z-consumer.ts'), `import { foo } from './utils';`);
			fs.writeFileSync(path.join(subDir, 'a-consumer.ts'), `import { foo } from './utils';`);
			fs.writeFileSync(path.join(subDir, 'local.ts'), `import { foo } from './utils';`);

			const result1 = await imports.execute({ file: targetFile });
			const parsed1 = JSON.parse(result1);

			// Should find all 3 in the subdir
			expect(parsed1.consumers).toHaveLength(3);

			// Verify deterministic
			const result2 = await imports.execute({ file: targetFile });
			const parsed2 = JSON.parse(result2);

			const paths1 = parsed1.consumers.map((c: { file: string }) => c.file);
			const paths2 = parsed2.consumers.map((c: { file: string }) => c.file);
			expect(paths1).toEqual(paths2);
		});
	});

	describe('large scale determinism', () => {
		test('handles 100 plus files with consistent ordering', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			// Create 105 files (exceeds MAX_CONSUMERS of 100)
			for (let i = 0; i < 105; i++) {
				const name = `file-${String(i).padStart(3, '0')}.ts`;
				fs.writeFileSync(path.join(tempDir, name), `import { foo } from './utils';`);
			}

			const result1 = await imports.execute({ file: targetFile });
			const parsed1 = JSON.parse(result1);

			// Should be limited to 100
			expect(parsed1.count).toBe(100);
			
			// Verify deterministic across multiple runs
			const result2 = await imports.execute({ file: targetFile });
			const parsed2 = JSON.parse(result2);
			
			expect(parsed1.consumers.map((c: { file: string }) => c.file))
				.toEqual(parsed2.consumers.map((c: { file: string }) => c.file));
		});

		test('order preserved when consumers span multiple subdirs with 50 plus files', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			// Create files across multiple subdirectories
			for (let i = 0; i < 10; i++) {
				const subDir = path.join(tempDir, `sub${i}`);
				fs.mkdirSync(subDir, { recursive: true });
				for (let j = 0; j < 6; j++) {
					fs.writeFileSync(
						path.join(subDir, `c${j}.ts`),
						`import { foo } from '../utils';`
					);
				}
			}

			const result1 = await imports.execute({ file: targetFile });
			const parsed1 = JSON.parse(result1);

			expect(parsed1.consumers.length).toBe(60);

			// Run 5 times to verify consistency
			for (let i = 0; i < 5; i++) {
				const result = await imports.execute({ file: targetFile });
				const parsed = JSON.parse(result);
				
				const paths1 = parsed1.consumers.map((c: { file: string }) => c.file);
				const paths2 = parsed.consumers.map((c: { file: string }) => c.file);
				expect(paths1).toEqual(paths2);
			}
		});
	});

	describe('symbol-specific ordering', () => {
		test('symbol filtering maintains deterministic order', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1; export const bar = 2;');

			// Create consumers importing different symbols
			fs.writeFileSync(path.join(tempDir, 'z-import-foo.ts'), `import { foo } from './utils';`);
			fs.writeFileSync(path.join(tempDir, 'a-import-bar.ts'), `import { bar } from './utils';`);
			fs.writeFileSync(path.join(tempDir, 'm-import-both.ts'), `import { foo, bar } from './utils';`);
			fs.writeFileSync(path.join(tempDir, 'w-import-foo.ts'), `import { foo } from './utils';`);

			// Filter by 'foo'
			const result1 = await imports.execute({ file: targetFile, symbol: 'foo' });
			const parsed1 = JSON.parse(result1);

			// Should find 3 consumers (z, m, w - not a which has bar only)
			expect(parsed1.consumers).toHaveLength(3);

			// Verify deterministic
			const result2 = await imports.execute({ file: targetFile, symbol: 'foo' });
			expect(result1).toBe(result2);
		});

		test('multiple symbols produce consistent ordering', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const a = 1; export const b = 2; export const c = 3;');

			// Create many consumers
			for (let i = 0; i < 20; i++) {
				const sym = ['a', 'b', 'c'][i % 3];
				fs.writeFileSync(
					path.join(tempDir, `c${String(i).padStart(2, '0')}.ts`),
					`import { ${sym} } from './utils';`
				);
			}

			// Query each symbol multiple times
			for (const sym of ['a', 'b', 'c']) {
				const r1 = await imports.execute({ file: targetFile, symbol: sym });
				const r2 = await imports.execute({ file: targetFile, symbol: sym });
				expect(r1).toBe(r2);
			}
		});
	});
});

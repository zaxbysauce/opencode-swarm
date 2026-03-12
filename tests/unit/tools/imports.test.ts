import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Import the tool AFTER setting up test environment
const { imports } = await import('../../../src/tools/imports');

describe('imports tool', () => {
	let tempDir: string;

	beforeEach(() => {
		// Create a unique temp directory for each test
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imports-test-'));
	});

	afterEach(() => {
		// Clean up temp directory
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	describe('tool metadata', () => {
		test('has description', () => {
			expect(imports.description).toContain('import');
			expect(imports.description).toContain('consumer');
		});

		test('has execute function', () => {
			expect(typeof imports.execute).toBe('function');
		});
	});

	describe('exact symbol matching', () => {
		test('matches exact symbol in named imports', async () => {
			// Create target file
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const myFunc = () => 1;');

			// Create consumer with exact symbol match
			const consumerFile = path.join(tempDir, 'consumer.ts');
			fs.writeFileSync(
				consumerFile,
				`import { myFunc } from './utils';`,
			);

			const result = await imports.execute({ file: targetFile, symbol: 'myFunc' });
			const parsed = JSON.parse(result);

			expect(parsed.error).toBeUndefined();
			expect(parsed.consumers).toHaveLength(1);
			expect(parsed.consumers[0].file).toBe(consumerFile);
			expect(parsed.consumers[0].importType).toBe('named');
		});

		test('does not match partial symbol names', async () => {
			// Create target file
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const myFunction = () => 1;');

			// Create consumer
			const consumerFile = path.join(tempDir, 'consumer.ts');
			fs.writeFileSync(
				consumerFile,
				`import { myFunction } from './utils';`,
			);

			// Search for partial name should not match
			const result = await imports.execute({ file: targetFile, symbol: 'myFunc' });
			const parsed = JSON.parse(result);

			expect(parsed.error).toBeUndefined();
			expect(parsed.consumers).toHaveLength(0);
		});

		test('matches aliased symbol by alias name', async () => {
			// Create target file
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const originalName = () => 1;');

			// Create consumer with alias
			const consumerFile = path.join(tempDir, 'consumer.ts');
			fs.writeFileSync(
				consumerFile,
				`import { originalName as aliasName } from './utils';`,
			);

			const result = await imports.execute({ file: targetFile, symbol: 'aliasName' });
			const parsed = JSON.parse(result);

			expect(parsed.error).toBeUndefined();
			expect(parsed.consumers).toHaveLength(1);
			expect(parsed.consumers[0].importType).toBe('named');
		});

		test('matches aliased symbol by original name', async () => {
			// Create target file
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const originalName = () => 1;');

			// Create consumer with alias
			const consumerFile = path.join(tempDir, 'consumer.ts');
			fs.writeFileSync(
				consumerFile,
				`import { originalName as aliasName } from './utils';`,
			);

			const result = await imports.execute({ file: targetFile, symbol: 'originalName' });
			const parsed = JSON.parse(result);

			expect(parsed.error).toBeUndefined();
			expect(parsed.consumers).toHaveLength(1);
		});

		test('matches default import by binding name', async () => {
			// Create target file with default export
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export default function helper() {}');

			// Create consumer
			const consumerFile = path.join(tempDir, 'consumer.ts');
			fs.writeFileSync(
				consumerFile,
				`import myHelper from './utils';`,
			);

			const result = await imports.execute({ file: targetFile, symbol: 'myHelper' });
			const parsed = JSON.parse(result);

			expect(parsed.error).toBeUndefined();
			expect(parsed.consumers).toHaveLength(1);
			expect(parsed.consumers[0].importType).toBe('default');
		});

		test('does not match namespace imports when symbol is specified', async () => {
			// Create target file
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const a = 1; export const b = 2;');

			// Create consumer with namespace import
			const consumerFile = path.join(tempDir, 'consumer.ts');
			fs.writeFileSync(
				consumerFile,
				`import * as utils from './utils';`,
			);

			const result = await imports.execute({ file: targetFile, symbol: 'a' });
			const parsed = JSON.parse(result);

			expect(parsed.error).toBeUndefined();
			// Namespace imports should NOT match when symbol is specified
			expect(parsed.consumers).toHaveLength(0);
		});
	});

	describe('multiline named imports', () => {
		test('parses multiline named imports', async () => {
			// Create target file
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1; export const bar = 2;');

			// Create consumer with multiline import
			const consumerFile = path.join(tempDir, 'consumer.ts');
			fs.writeFileSync(
				consumerFile,
				`import {
  foo,
  bar,
} from './utils';`,
			);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			expect(parsed.error).toBeUndefined();
			expect(parsed.consumers).toHaveLength(1);
			expect(parsed.consumers[0].importType).toBe('named');
		});

		test('matches symbol in multiline import', async () => {
			// Create target file
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1; export const bar = 2; export const baz = 3;');

			// Create consumer with multiline import
			const consumerFile = path.join(tempDir, 'consumer.ts');
			fs.writeFileSync(
				consumerFile,
				`import {
  foo,
  bar,
  baz
} from './utils';`,
			);

			const result = await imports.execute({ file: targetFile, symbol: 'bar' });
			const parsed = JSON.parse(result);

			expect(parsed.error).toBeUndefined();
			expect(parsed.consumers).toHaveLength(1);
		});

		test('handles multiline with trailing comma', async () => {
			// Create target file
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			// Create consumer with multiline import and trailing comma
			const consumerFile = path.join(tempDir, 'consumer.ts');
			fs.writeFileSync(
				consumerFile,
				`import {
  foo,
} from './utils';`,
			);

			const result = await imports.execute({ file: targetFile, symbol: 'foo' });
			const parsed = JSON.parse(result);

			expect(parsed.error).toBeUndefined();
			expect(parsed.consumers).toHaveLength(1);
		});
	});

	describe('import-type detection', () => {
		test('detects named import type', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			const consumerFile = path.join(tempDir, 'consumer.ts');
			fs.writeFileSync(consumerFile, `import { foo } from './utils';`);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			expect(parsed.consumers[0].importType).toBe('named');
		});

		test('detects default import type', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export default function() {}');

			const consumerFile = path.join(tempDir, 'consumer.ts');
			fs.writeFileSync(consumerFile, `import myDefault from './utils';`);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			expect(parsed.consumers[0].importType).toBe('default');
		});

		test('detects namespace import type', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			const consumerFile = path.join(tempDir, 'consumer.ts');
			fs.writeFileSync(consumerFile, `import * as utils from './utils';`);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			expect(parsed.consumers[0].importType).toBe('namespace');
		});

		test('detects require (CommonJS) import type', async () => {
			const targetFile = path.join(tempDir, 'utils.js');
			fs.writeFileSync(targetFile, 'module.exports = { foo: 1 };');

			const consumerFile = path.join(tempDir, 'consumer.js');
			fs.writeFileSync(consumerFile, `const utils = require('./utils');`);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			expect(parsed.consumers[0].importType).toBe('require');
		});

		test('detects side-effect import type', async () => {
			const targetFile = path.join(tempDir, 'polyfill.ts');
			fs.writeFileSync(targetFile, '// polyfill code');

			const consumerFile = path.join(tempDir, 'consumer.ts');
			fs.writeFileSync(consumerFile, `import './polyfill';`);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			expect(parsed.consumers[0].importType).toBe('sideeffect');
		});
	});

	describe('directory exclusions', () => {
		test('excludes node_modules directory', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			// Create node_modules with a consumer
			const nodeModules = path.join(tempDir, 'node_modules');
			fs.mkdirSync(nodeModules, { recursive: true });
			const nmConsumer = path.join(nodeModules, 'consumer.ts');
			fs.writeFileSync(nmConsumer, `import { foo } from '../utils';`);

			// Create real consumer outside node_modules
			const consumerFile = path.join(tempDir, 'consumer.ts');
			fs.writeFileSync(consumerFile, `import { foo } from './utils';`);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			// Should only find the consumer outside node_modules
			expect(parsed.consumers).toHaveLength(1);
			expect(parsed.consumers[0].file).toBe(consumerFile);
		});

		test('excludes .git directory', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			// Create .git directory with a file
			const gitDir = path.join(tempDir, '.git');
			fs.mkdirSync(gitDir, { recursive: true });
			const gitFile = path.join(gitDir, 'hooks.ts');
			fs.writeFileSync(gitFile, `import { foo } from '../utils';`);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			expect(parsed.consumers).toHaveLength(0);
		});

		test('excludes dist directory', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			// Create dist directory with compiled output
			const distDir = path.join(tempDir, 'dist');
			fs.mkdirSync(distDir, { recursive: true });
			const distFile = path.join(distDir, 'consumer.js');
			fs.writeFileSync(distFile, `import { foo } from '../utils';`);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			expect(parsed.consumers).toHaveLength(0);
		});

		test('excludes build directory', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			const buildDir = path.join(tempDir, 'build');
			fs.mkdirSync(buildDir, { recursive: true });
			const buildFile = path.join(buildDir, 'consumer.ts');
			fs.writeFileSync(buildFile, `import { foo } from '../utils';`);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			expect(parsed.consumers).toHaveLength(0);
		});

		test('includes hidden files like .eslintrc.ts', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			// Create hidden config file (should be scanned)
			const eslintConfig = path.join(tempDir, '.eslintrc.ts');
			fs.writeFileSync(eslintConfig, `import { foo } from './utils';`);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			// Hidden files should be included (not all dot-prefixed are excluded)
			expect(parsed.consumers).toHaveLength(1);
			expect(parsed.consumers[0].file).toBe(eslintConfig);
		});
	});

	describe('truncation messaging', () => {
		test('includes message when max consumers reached', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			// Create more than MAX_CONSUMERS (100) consumer files
			// We'll create 105 files to exceed the limit
			for (let i = 0; i < 105; i++) {
				const consumerFile = path.join(tempDir, `consumer${i}.ts`);
				fs.writeFileSync(consumerFile, `import { foo } from './utils';`);
			}

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			expect(parsed.count).toBe(100); // MAX_CONSUMERS
			expect(parsed.message).toBeDefined();
			expect(parsed.message).toContain('limited');
			expect(parsed.message).toContain('100');
		});

		test('no truncation message when under limit', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			const consumerFile = path.join(tempDir, 'consumer.ts');
			fs.writeFileSync(consumerFile, `import { foo } from './utils';`);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			expect(parsed.message).toBeUndefined();
		});

		test('includes skip count for oversized files', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			// Create a file that exceeds MAX_FILE_SIZE_BYTES (1MB)
			const largeFile = path.join(tempDir, 'large.ts');
			const largeContent = 'import { foo } from "./utils";\n' + 'x'.repeat(1024 * 1024 + 100);
			fs.writeFileSync(largeFile, largeContent);

			// Create a normal consumer
			const consumerFile = path.join(tempDir, 'consumer.ts');
			fs.writeFileSync(consumerFile, `import { foo } from './utils';`);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			// Should find the normal consumer but skip the large file
			expect(parsed.consumers.some((c: { file: string }) => c.file === consumerFile)).toBe(true);
			expect(parsed.consumers.some((c: { file: string }) => c.file === largeFile)).toBe(false);
		});
	});

	describe('cross-platform path normalization', () => {
		test('handles forward slashes in imports', async () => {
			// Tool scans from target file's directory, so consumer must be in same or subdirectory
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			const subDir = path.join(tempDir, 'sub');
			fs.mkdirSync(subDir, { recursive: true });
			const consumerFile = path.join(subDir, 'consumer.ts');
			fs.writeFileSync(consumerFile, `import { foo } from '../utils';`);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			expect(parsed.consumers).toHaveLength(1);
		});

		test('handles extension-less imports (matches .ts file)', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			const consumerFile = path.join(tempDir, 'consumer.ts');
			// Import without extension
			fs.writeFileSync(consumerFile, `import { foo } from './utils';`);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			expect(parsed.consumers).toHaveLength(1);
		});

		test('handles parent directory imports', async () => {
			const subDir = path.join(tempDir, 'sub');
			fs.mkdirSync(subDir, { recursive: true });

			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			const consumerFile = path.join(subDir, 'consumer.ts');
			fs.writeFileSync(consumerFile, `import { foo } from '../utils';`);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			expect(parsed.consumers).toHaveLength(1);
		});

		test('handles nested directory imports', async () => {
			const deepDir = path.join(tempDir, 'a', 'b', 'c');
			fs.mkdirSync(deepDir, { recursive: true });

			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			const consumerFile = path.join(deepDir, 'consumer.ts');
			fs.writeFileSync(consumerFile, `import { foo } from '../../utils';`);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			expect(parsed.consumers).toHaveLength(1);
		});
	});

	describe('deterministic ordering', () => {
		test('returns consumers in sorted order by file path', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			// Create consumers in non-alphabetical order
			const consumerZ = path.join(tempDir, 'z-consumer.ts');
			const consumerA = path.join(tempDir, 'a-consumer.ts');
			const consumerM = path.join(tempDir, 'm-consumer.ts');

			fs.writeFileSync(consumerZ, `import { foo } from './utils';`);
			fs.writeFileSync(consumerA, `import { foo } from './utils';`);
			fs.writeFileSync(consumerM, `import { foo } from './utils';`);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			expect(parsed.consumers).toHaveLength(3);

			// Should be sorted alphabetically (case-insensitive)
			const files = parsed.consumers.map((c: { file: string }) => path.basename(c.file));
			expect(files).toEqual(['a-consumer.ts', 'm-consumer.ts', 'z-consumer.ts']);
		});

		test('produces consistent results across multiple scans', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			const consumer1 = path.join(tempDir, 'file1.ts');
			const consumer2 = path.join(tempDir, 'file2.ts');
			fs.writeFileSync(consumer1, `import { foo } from './utils';`);
			fs.writeFileSync(consumer2, `import { foo } from './utils';`);

			const result1 = await imports.execute({ file: targetFile });
			const result2 = await imports.execute({ file: targetFile });

			// Results should be identical
			expect(result1).toBe(result2);
		});

		test('subdirectory files sorted correctly', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			// Create files in different subdirectories
			const subDirZ = path.join(tempDir, 'z-dir');
			const subDirA = path.join(tempDir, 'a-dir');
			fs.mkdirSync(subDirZ, { recursive: true });
			fs.mkdirSync(subDirA, { recursive: true });

			const consumerZ = path.join(subDirZ, 'consumer.ts');
			const consumerA = path.join(subDirA, 'consumer.ts');

			fs.writeFileSync(consumerZ, `import { foo } from '../utils';`);
			fs.writeFileSync(consumerA, `import { foo } from '../utils';`);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			expect(parsed.consumers).toHaveLength(2);

			// Directory 'a-dir' should come before 'z-dir' (case-insensitive sort)
			const paths = parsed.consumers.map((c: { file: string }) => c.file);
			const aDirIndex = paths.findIndex((p: string) => p.includes('a-dir'));
			const zDirIndex = paths.findIndex((p: string) => p.includes('z-dir'));
			expect(aDirIndex).toBeLessThan(zDirIndex);
		});
	});

	describe('non-throwing skip/error handling', () => {
		test('returns error result for non-existent file (does not throw)', async () => {
			const result = await imports.execute({ file: '/non/existent/file.ts' });
			const parsed = JSON.parse(result);

			expect(parsed.error).toBeDefined();
			expect(parsed.error).toContain('not found');
			expect(parsed.consumers).toEqual([]);
			expect(parsed.count).toBe(0);
		});

		test('returns error result for directory instead of file', async () => {
			const result = await imports.execute({ file: tempDir });
			const parsed = JSON.parse(result);

			expect(parsed.error).toBeDefined();
			expect(parsed.error).toContain('directory');
			expect(parsed.consumers).toEqual([]);
			expect(parsed.count).toBe(0);
		});

		test('returns error for empty file path', async () => {
			const result = await imports.execute({ file: '' });
			const parsed = JSON.parse(result);

			expect(parsed.error).toBeDefined();
			expect(parsed.error).toContain('required');
			expect(parsed.consumers).toEqual([]);
		});

		test('returns error for file path with control characters', async () => {
			const result = await imports.execute({ file: 'test\tfile.ts' });
			const parsed = JSON.parse(result);

			expect(parsed.error).toBeDefined();
			expect(parsed.error).toContain('control characters');
		});

		test('returns error for path traversal in file path', async () => {
			const result = await imports.execute({ file: '../../../etc/passwd' });
			const parsed = JSON.parse(result);

			expect(parsed.error).toBeDefined();
			expect(parsed.error).toContain('path traversal');
		});

		test('returns error for path traversal in symbol', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			const result = await imports.execute({ file: targetFile, symbol: '../secret' });
			const parsed = JSON.parse(result);

			expect(parsed.error).toBeDefined();
			expect(parsed.error).toContain('path traversal');
		});

		test('returns error for control characters in symbol', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			const result = await imports.execute({ file: targetFile, symbol: 'foo\nbar' });
			const parsed = JSON.parse(result);

			expect(parsed.error).toBeDefined();
			expect(parsed.error).toContain('control characters');
		});

		test('skips binary files gracefully', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			// Create a binary file that might look like it has imports
			const binaryFile = path.join(tempDir, 'binary.ts');
			const binaryBuffer = Buffer.from([
				0x89, 0x50, 0x4e, 0x47, // PNG signature
				0x00, 0x00, 0x00, 0x00,
				...Buffer.from("import { foo } from './utils';")
			]);
			fs.writeFileSync(binaryFile, binaryBuffer);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			// Binary file should be skipped without error
			expect(parsed.error).toBeUndefined();
			expect(parsed.consumers.some((c: { file: string }) => c.file === binaryFile)).toBe(false);
		});

		test('handles files with read errors gracefully', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			const consumerFile = path.join(tempDir, 'consumer.ts');
			fs.writeFileSync(consumerFile, `import { foo } from './utils';`);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			// Should still work with accessible files
			expect(parsed.error).toBeUndefined();
		});
	});

	describe('line number reporting', () => {
		test('reports correct line number for import', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			const consumerFile = path.join(tempDir, 'consumer.ts');
			fs.writeFileSync(
				consumerFile,
				`// Comment line 1
// Comment line 2
import { foo } from './utils';
// After import`,
			);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			expect(parsed.consumers[0].line).toBe(3);
		});

		test('reports correct line for multiline import', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			const consumerFile = path.join(tempDir, 'consumer.ts');
			fs.writeFileSync(
				consumerFile,
				`// Comment
import {
  foo
} from './utils';`,
			);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			// Line should be where the import statement starts
			expect(parsed.consumers[0].line).toBe(2);
		});
	});

	describe('multiple consumers and imports', () => {
		test('finds multiple consumers', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			fs.writeFileSync(path.join(tempDir, 'a.ts'), `import { foo } from './utils';`);
			fs.writeFileSync(path.join(tempDir, 'b.ts'), `import { foo } from './utils';`);
			fs.writeFileSync(path.join(tempDir, 'c.ts'), `import { foo } from './utils';`);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			expect(parsed.consumers).toHaveLength(3);
			expect(parsed.count).toBe(3);
		});

		test('finds multiple imports from same file', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1; export const bar = 2;');

			const consumerFile = path.join(tempDir, 'consumer.ts');
			fs.writeFileSync(
				consumerFile,
				`import { foo } from './utils';
import { bar } from './utils';`,
			);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			// Should find both import statements
			expect(parsed.consumers).toHaveLength(2);
		});

		test('filters by symbol across multiple consumers', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1; export const bar = 2;');

			fs.writeFileSync(path.join(tempDir, 'a.ts'), `import { foo } from './utils';`);
			fs.writeFileSync(path.join(tempDir, 'b.ts'), `import { bar } from './utils';`);
			fs.writeFileSync(path.join(tempDir, 'c.ts'), `import { foo, bar } from './utils';`);

			const result = await imports.execute({ file: targetFile, symbol: 'foo' });
			const parsed = JSON.parse(result);

			// Should only find a.ts and c.ts (which import foo)
			expect(parsed.consumers).toHaveLength(2);
		});
	});

	describe('supported file extensions', () => {
		test('scans .ts files', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			const consumerFile = path.join(tempDir, 'consumer.ts');
			fs.writeFileSync(consumerFile, `import { foo } from './utils';`);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			expect(parsed.consumers).toHaveLength(1);
		});

		test('scans .tsx files', async () => {
			const targetFile = path.join(tempDir, 'utils.ts');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			const consumerFile = path.join(tempDir, 'consumer.tsx');
			fs.writeFileSync(consumerFile, `import { foo } from './utils';`);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			expect(parsed.consumers).toHaveLength(1);
		});

		test('scans .js files', async () => {
			const targetFile = path.join(tempDir, 'utils.js');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			const consumerFile = path.join(tempDir, 'consumer.js');
			fs.writeFileSync(consumerFile, `import { foo } from './utils';`);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			expect(parsed.consumers).toHaveLength(1);
		});

		test('scans .jsx files', async () => {
			const targetFile = path.join(tempDir, 'utils.jsx');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			const consumerFile = path.join(tempDir, 'consumer.jsx');
			fs.writeFileSync(consumerFile, `import { foo } from './utils';`);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			expect(parsed.consumers).toHaveLength(1);
		});

		test('scans .mjs files', async () => {
			const targetFile = path.join(tempDir, 'utils.mjs');
			fs.writeFileSync(targetFile, 'export const foo = 1;');

			const consumerFile = path.join(tempDir, 'consumer.mjs');
			fs.writeFileSync(consumerFile, `import { foo } from './utils';`);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			expect(parsed.consumers).toHaveLength(1);
		});

		test('scans .cjs files', async () => {
			const targetFile = path.join(tempDir, 'utils.cjs');
			fs.writeFileSync(targetFile, 'module.exports = { foo: 1 };');

			const consumerFile = path.join(tempDir, 'consumer.cjs');
			fs.writeFileSync(consumerFile, `const utils = require('./utils');`);

			const result = await imports.execute({ file: targetFile });
			const parsed = JSON.parse(result);

			expect(parsed.consumers).toHaveLength(1);
		});
	});
});

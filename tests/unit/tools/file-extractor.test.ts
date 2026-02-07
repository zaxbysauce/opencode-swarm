import { describe, it, expect } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { extractFilename, extract_code_blocks } from '../../../src/tools/file-extractor';

describe('file-extractor', () => {
	describe('extractFilename', () => {
		it('extracts filename from # filename: comment', () => {
			const code = `# filename: test.py\nprint("hello")`;
			const result = extractFilename(code, 'python', 0);
			expect(result).toBe('test.py');
		});

		it('extracts filename from // filename: comment', () => {
			const code = `// filename: app.js\nconsole.log("hello");`;
			const result = extractFilename(code, 'javascript', 0);
			expect(result).toBe('app.js');
		});

		it('extracts bare filename from # pattern', () => {
			const code = `# myfile.ps1\nGet-Process`;
			const result = extractFilename(code, 'powershell', 0);
			expect(result).toBe('myfile.ps1');
		});

		it('extracts filename from def function definition', () => {
			const code = `def my_function():\n    pass`;
			const result = extractFilename(code, 'python', 0);
			expect(result).toBe('my_function.py');
		});

		it('extracts filename from class definition', () => {
			const code = `class MyClass:\n    def __init__(self):\n        pass`;
			const result = extractFilename(code, 'python', 0);
			expect(result).toBe('MyClass.py');
		});

		it('extracts filename from function keyword', () => {
			const code = `function Get-Process {\n    Get-Process`;
			const result = extractFilename(code, 'powershell', 0);
			expect(result).toBe('Get-Process.ps1');
		});

		it('skips private functions starting with _', () => {
			const code = `def _private_function():\n    pass`;
			const result = extractFilename(code, 'python', 0);
			// Should fallback to timestamp-based name
			expect(result).toMatch(/^output_1_.*\.py$/);
		});

		it('falls back to timestamp-based name when no patterns match', () => {
			const code = `some random code\nwith no patterns`;
			const result = extractFilename(code, 'python', 0);
			expect(result).toMatch(/^output_1_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.py$/);
		});

		it('uses correct extensions from EXT_MAP for known languages', () => {
			const code = `print("hello")`;
			const testCases = [
				{ language: 'python', expected: '.py' },
				{ language: 'javascript', expected: '.js' },
				{ language: 'typescript', expected: '.ts' },
				{ language: 'powershell', expected: '.ps1' },
				{ language: 'bash', expected: '.sh' },
				{ language: 'json', expected: '.json' },
				{ language: 'yaml', expected: '.yaml' },
				{ language: 'xml', expected: '.xml' },
				{ language: 'html', expected: '.html' },
				{ language: 'css', expected: '.css' },
				{ language: 'sql', expected: '.sql' },
			];

			testCases.forEach(({ language, expected }) => {
				const result = extractFilename(code, language, 0);
				expect(result).toEndWith(expected);
			});
		});

		it('uses .txt for unknown languages', () => {
			const code = `some code`;
			const result = extractFilename(code, 'unknown_language', 0);
			expect(result).toEndWith('.txt');
		});
	});

	describe('extract_code_blocks.execute', () => {
		it('extracts single code block and writes to disk', async () => {
			const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'extractor-test-'));
			const content = '```python\nprint("hello")\n```';
			
			const result = await extract_code_blocks.execute(
				{ content, output_dir: tempDir },
				{} as any
			);

			expect(result).toContain('Extracted 1 file(s):');
			expect(result).toContain(tempDir);
			
			const files = fs.readdirSync(tempDir);
			expect(files).toHaveLength(1);
			
			const fileContent = fs.readFileSync(path.join(tempDir, files[0]), 'utf-8');
			expect(fileContent).toBe('print("hello")');

			// Cleanup
			fs.rmSync(tempDir, { recursive: true, force: true });
		});

		it('extracts multiple code blocks', async () => {
			const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'extractor-test-'));
			const content = `
\`\`\`python
def hello():
    print("hello")
\`\`\`

\`\`\`javascript
console.log("world");
\`\`\`
`;

			const result = await extract_code_blocks.execute(
				{ content, output_dir: tempDir },
				{} as any
			);

			expect(result).toContain('Extracted 2 file(s):');
			
			const files = fs.readdirSync(tempDir);
			expect(files).toHaveLength(2);
			
			// Check that both files were created with correct extensions
			const pyFile = files.find(f => f.endsWith('.py'));
			const jsFile = files.find(f => f.endsWith('.js'));
			
			expect(pyFile).toBeDefined();
			expect(jsFile).toBeDefined();

			// Cleanup
			fs.rmSync(tempDir, { recursive: true, force: true });
		});

		it('returns "No code blocks found" for content without fences', async () => {
			const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'extractor-test-'));
			const content = 'This is just plain text without any code blocks.';

			const result = await extract_code_blocks.execute(
				{ content, output_dir: tempDir },
				{} as any
			);

			expect(result).toBe('No code blocks found in content.');
			
			const files = fs.readdirSync(tempDir);
			expect(files).toHaveLength(0);

			// Cleanup
			fs.rmSync(tempDir, { recursive: true, force: true });
		});

		it('applies prefix to filenames', async () => {
			const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'extractor-test-'));
			const content = '```python\nprint("hello")\n```';

			const result = await extract_code_blocks.execute(
				{ content, output_dir: tempDir, prefix: 'test_prefix' },
				{} as any
			);

			expect(result).toContain('test_prefix_');
			
			const files = fs.readdirSync(tempDir);
			expect(files[0]).toStartWith('test_prefix_');

			// Cleanup
			fs.rmSync(tempDir, { recursive: true, force: true });
		});

		it('handles filename collisions by incrementing counter', async () => {
			const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'extractor-test-'));
			const content = `
\`\`\`python
print("first")
\`\`\`

\`\`\`python
print("second")
\`\`\`
`;

			// Manually create a file first to force collision
			const existingFile = path.join(tempDir, 'output_1_1970-01-01T00-00-00.py');
			fs.writeFileSync(existingFile, 'existing content');

			const result = await extract_code_blocks.execute(
				{ content, output_dir: tempDir },
				{} as any
			);

			const files = fs.readdirSync(tempDir);
			expect(files).toHaveLength(3); // existing + 2 new files
			
			// Should have counter appended to avoid collision
			const newFiles = files.filter(f => f !== path.basename(existingFile));
			expect(newFiles.some(f => f.includes('_1_'))).toBe(true);

			// Cleanup
			fs.rmSync(tempDir, { recursive: true, force: true });
		});

		it('creates output directory if it doesn\'t exist', async () => {
			const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'extractor-test-'));
			const nonExistentDir = path.join(tempDir, 'non-existent-subdir');
			const content = '```python\nprint("hello")\n```';

			const result = await extract_code_blocks.execute(
				{ content, output_dir: nonExistentDir },
				{} as any
			);

			expect(fs.existsSync(nonExistentDir)).toBe(true);
			expect(result).toContain('Extracted 1 file(s):');
			
			const files = fs.readdirSync(nonExistentDir);
			expect(files).toHaveLength(1);

			// Cleanup
			fs.rmSync(tempDir, { recursive: true, force: true });
		});
	});
});
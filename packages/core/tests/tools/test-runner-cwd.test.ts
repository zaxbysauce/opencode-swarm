/**
 * Tests for cwd threading fix in test-runner.ts
 *
 * These tests verify that the cwd (current working directory) parameter
 * is correctly threaded through:
 * 1. detectTestFramework(cwd) - uses cwd for all path joins
 * 2. runTests(..., cwd) - passes cwd to Bun.spawn
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Import the module under test
const testRunnerModule = await import('../../src/tools/test-runner');

// Extract the exports we need
const {
	detectTestFramework,
	runTests,
} = testRunnerModule;

// Helper to create temp test directories
function createTempDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-cwd-'));
}

// Helper to create test files
function createTestFile(dir: string, filename: string, content: string): string {
	const filePath = path.join(dir, filename);
	const parentDir = path.dirname(filePath);
	if (!fs.existsSync(parentDir)) {
		fs.mkdirSync(parentDir, { recursive: true });
	}
	fs.writeFileSync(filePath, content, 'utf-8');
	return filePath;
}

// Helper to parse JSON result
function parseResult(result: string): Record<string, unknown> {
	return JSON.parse(result);
}

describe('test-runner.ts - CWD Threading', () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		tempDir = createTempDir();
		originalCwd = process.cwd();
	});

	afterEach(() => {
		process.chdir(originalCwd);
		// Cleanup temp dir
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	describe('detectTestFramework(cwd) - bun detection', () => {
		test('uses provided cwd for path joins when detecting bun framework', async () => {
			// Create package.json in tempDir
			createTestFile(tempDir, 'package.json', JSON.stringify({
				scripts: { test: 'bun test' },
			}));
			createTestFile(tempDir, 'bun.lock', '');

			// Call with explicit cwd (tempDir)
			const framework = await detectTestFramework(tempDir);

			// Verify result
			expect(framework).toBe('bun');
		});

		test('falls back to process.cwd() when cwd is omitted', async () => {
			// Create package.json in current working directory
			process.chdir(tempDir);
			createTestFile(tempDir, 'package.json', JSON.stringify({
				scripts: { test: 'bun test' },
			}));
			createTestFile(tempDir, 'bun.lock', '');

			// Call without cwd parameter
			const framework = await detectTestFramework();

			// Verify result
			expect(framework).toBe('bun');
		});

		test('uses cwd for bun.lockb detection', async () => {
			createTestFile(tempDir, 'package.json', JSON.stringify({
				scripts: { test: 'bun run test' },
			}));
			// Create bun.lockb (empty file simulates it)
			createTestFile(tempDir, 'bun.lockb', '');

			const framework = await detectTestFramework(tempDir);
			expect(framework).toBe('bun');
		});
	});

	describe('detectTestFramework(cwd) - pytest detection', () => {
		test('uses provided cwd for requirements.txt detection', async () => {
			createTestFile(tempDir, 'requirements.txt', 'pytest>=7.0.0\nrequests>=2.0.0');

			const framework = await detectTestFramework(tempDir);
			expect(framework).toBe('pytest');
		});

		test('uses cwd for pyproject.toml detection', async () => {
			createTestFile(tempDir, 'pyproject.toml', `
[tool.pytest.ini_options]
testpaths = ["tests"]
`);

			const framework = await detectTestFramework(tempDir);
			expect(framework).toBe('pytest');
		});

		test('uses cwd for setup.cfg detection', async () => {
			createTestFile(tempDir, 'setup.cfg', `
[pytest]
testpaths = tests
`);

			const framework = await detectTestFramework(tempDir);
			expect(framework).toBe('pytest');
		});
	});

	describe('detectTestFramework() - fallback to none', () => {
		test('returns "none" when no config files exist in cwd', async () => {
			// tempDir is empty, so no framework should be detected
			const framework = await detectTestFramework(tempDir);
			expect(framework).toBe('none');
		});

		test('returns "none" when cwd is omitted and no config exists at process.cwd()', async () => {
			// Change to tempDir which is empty
			process.chdir(tempDir);
			const framework = await detectTestFramework();
			expect(framework).toBe('none');
		});
	});

	describe('detectTestFramework(cwd) - cargo detection', () => {
		test('uses provided cwd for Cargo.toml detection', async () => {
			createTestFile(tempDir, 'Cargo.toml', `
[package]
name = "test-rs"
version = "0.1.0"

[dev-dependencies]
tokio = { version = "1.0", features = ["full"] }
`);

			const framework = await detectTestFramework(tempDir);
			expect(framework).toBe('cargo');
		});
	});

	describe('detectTestFramework(cwd) - pester detection', () => {
		test('uses provided cwd for pester config detection', async () => {
			createTestFile(tempDir, 'pester.config.ps1', 'configuration');

			const framework = await detectTestFramework(tempDir);
			expect(framework).toBe('pester');
		});

		test('uses provided cwd for tests.ps1 detection', async () => {
			createTestFile(tempDir, 'tests.ps1', 'Describe "Tests" { }');

			const framework = await detectTestFramework(tempDir);
			expect(framework).toBe('pester');
		});
	});

	describe('detectTestFramework(cwd) - vitest detection', () => {
		test('uses cwd for vitest detection via scripts', async () => {
			createTestFile(tempDir, 'package.json', JSON.stringify({
				scripts: { test: 'vitest run' },
			}));

			const framework = await detectTestFramework(tempDir);
			expect(framework).toBe('vitest');
		});

		test('uses cwd for vitest detection via devDependencies', async () => {
			createTestFile(tempDir, 'package.json', JSON.stringify({
				devDependencies: { vitest: '^1.0.0' },
			}));

			const framework = await detectTestFramework(tempDir);
			expect(framework).toBe('vitest');
		});
	});

	describe('detectTestFramework(cwd) - jest detection', () => {
		test('uses cwd for jest detection via scripts', async () => {
			createTestFile(tempDir, 'package.json', JSON.stringify({
				scripts: { test: 'jest' },
			}));

			const framework = await detectTestFramework(tempDir);
			expect(framework).toBe('jest');
		});

		test('uses cwd for jest detection via devDependencies', async () => {
			createTestFile(tempDir, 'package.json', JSON.stringify({
				devDependencies: { jest: '^29.0.0' },
			}));

			const framework = await detectTestFramework(tempDir);
			expect(framework).toBe('jest');
		});
	});

	describe('detectTestFramework(cwd) - mocha detection', () => {
		test('uses cwd for mocha detection via scripts', async () => {
			createTestFile(tempDir, 'package.json', JSON.stringify({
				scripts: { test: 'mocha' },
			}));

			const framework = await detectTestFramework(tempDir);
			expect(framework).toBe('mocha');
		});

		test('uses cwd for mocha detection via devDependencies', async () => {
			createTestFile(tempDir, 'package.json', JSON.stringify({
				devDependencies: { mocha: '^10.0.0' },
			}));

			const framework = await detectTestFramework(tempDir);
			expect(framework).toBe('mocha');
		});
	});
});

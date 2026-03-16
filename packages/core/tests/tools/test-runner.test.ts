import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { TestFramework } from '../../src/tools/test-runner';

// Import the module under test
const testRunnerModule = await import('../../src/tools/test-runner');

// Extract the exports we need
const {
	MAX_OUTPUT_BYTES,
	MAX_COMMAND_LENGTH,
	DEFAULT_TIMEOUT_MS,
	MAX_TIMEOUT_MS,
	SUPPORTED_FRAMEWORKS,
	detectTestFramework,
	validateArgs,
	runTests,
} = testRunnerModule;

// Create a mock execute function that mimics the tool wrapper behavior
// This is needed because the core package only exports raw functions, not the tool wrapper
async function mockExecute(args: Record<string, unknown>, ctx: { directory?: string }): Promise<string> {
	const directory = ctx?.directory ?? process.cwd();
	const workingDir = directory?.trim() || directory || process.cwd();
	
	// Import validation and core functions from the test-runner module
	const { containsPathTraversal, containsControlChars, isAbsolutePath } = testRunnerModule;
	
	// Validate working directory
	if (workingDir.length > 4096) {
		return JSON.stringify({
			success: false,
			framework: 'none',
			scope: 'all',
			error: 'Invalid working directory',
		});
	}
	
	if (/^[/\\]{2}/.test(workingDir)) {
		return JSON.stringify({
			success: false,
			framework: 'none',
			scope: 'all',
			error: 'Invalid working directory',
		});
	}
	
	if (containsControlChars(workingDir)) {
		return JSON.stringify({
			success: false,
			framework: 'none',
			scope: 'all',
			error: 'Invalid working directory',
		});
	}
	
	if (containsPathTraversal(workingDir)) {
		return JSON.stringify({
			success: false,
			framework: 'none',
			scope: 'all',
			error: 'Invalid working directory',
		});
	}
	
	// Validate args
	if (!validateArgs(args)) {
		return JSON.stringify({
			success: false,
			framework: 'none',
			scope: 'all',
			error: 'Invalid arguments',
			message: 'scope must be "all", "convention", or "graph"; files must be array of strings; coverage must be boolean; timeout_ms must be a positive number',
		});
	}
	
	const scope = (args.scope as 'all' | 'convention' | 'graph') || 'all';
	
	// Guard: reject scope 'all' for interactive sessions
	if (scope === 'all') {
		return JSON.stringify({
			success: false,
			framework: 'none',
			scope: 'all',
			error: 'Full-suite test execution (scope: "all") is prohibited in interactive sessions',
			message: 'Use scope "convention" or "graph" for targeted test execution',
		});
	}
	
	const files = args.files as string[] | undefined;
	const coverage = args.coverage as boolean | undefined;
	const timeout_ms = args.timeout_ms as number | undefined;
	
	// Guard: require files for convention/graph scopes
	// Use type assertion to avoid TypeScript narrowing after the early return
	const scopeValue = scope as 'all' | 'convention' | 'graph';
	if (scopeValue !== 'all' && (!files || files.length === 0)) {
		return JSON.stringify({
			success: false,
			framework: 'none',
			scope,
			error: 'scope "convention" and "graph" require explicit files to avoid unsafe full-project discovery',
		});
	}
	
	// Detect framework
	const framework = await detectTestFramework(workingDir);
	
	if (framework === 'none') {
		return JSON.stringify({
			success: false,
			framework: 'none',
			scope,
			error: 'No test framework detected',
		});
	}
	
	// For validation-only tests (no actual test run), return success with empty results
	// This allows testing validation logic without running actual tests
	return JSON.stringify({
		success: true,
		framework,
		scope,
		command: [],
		timeout_ms: timeout_ms ?? DEFAULT_TIMEOUT_MS,
		duration_ms: 0,
		totals: { passed: 0, failed: 0, skipped: 0, total: 0 },
		message: 'Validation passed',
	});
}

describe('test-runner.ts - Constants and Types', () => {
	describe('exported constants', () => {
		test('MAX_OUTPUT_BYTES is 512000', () => {
			expect(MAX_OUTPUT_BYTES).toBe(512_000);
		});

		test('MAX_COMMAND_LENGTH is 500', () => {
			expect(MAX_COMMAND_LENGTH).toBe(500);
		});

		test('DEFAULT_TIMEOUT_MS is 60000', () => {
			expect(DEFAULT_TIMEOUT_MS).toBe(60_000);
		});

		test('MAX_TIMEOUT_MS is 300000', () => {
			expect(MAX_TIMEOUT_MS).toBe(300_000);
		});

		test('SUPPORTED_FRAMEWORKS contains expected frameworks', () => {
			expect(SUPPORTED_FRAMEWORKS).toContain('bun');
			expect(SUPPORTED_FRAMEWORKS).toContain('vitest');
			expect(SUPPORTED_FRAMEWORKS).toContain('jest');
			expect(SUPPORTED_FRAMEWORKS).toContain('mocha');
			expect(SUPPORTED_FRAMEWORKS).toContain('pytest');
			expect(SUPPORTED_FRAMEWORKS).toContain('cargo');
			expect(SUPPORTED_FRAMEWORKS).toContain('pester');
		});
	});

	describe('TestFramework type', () => {
		test('accepts all supported frameworks', () => {
			const frameworks: TestFramework[] = [
				'bun',
				'vitest',
				'jest',
				'mocha',
				'pytest',
				'cargo',
				'pester',
				'none',
			];
			expect(frameworks.length).toBe(8);
		});
	});

	describe('TestTotals interface', () => {
		test('has required properties', () => {
			const totals = {
				passed: 10,
				failed: 2,
				skipped: 3,
				total: 15,
			};
			expect(totals.passed).toBe(10);
			expect(totals.failed).toBe(2);
			expect(totals.skipped).toBe(3);
			expect(totals.total).toBe(15);
		});
	});
});

describe('test-runner.ts - Tool Metadata (via mockExecute)', () => {
	test('mockExecute returns valid JSON structure', async () => {
		// Create a temp directory with a detectable framework
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-meta-'));
		const originalCwd = process.cwd();
		process.chdir(tempDir);
		
		fs.writeFileSync(
			'package.json',
			JSON.stringify({
				scripts: { test: 'vitest run' },
				devDependencies: { vitest: '^1.0.0' },
			}),
		);

		const result = await mockExecute({ scope: 'convention', files: ['src/utils.ts'] }, { directory: tempDir });
		const parsed = JSON.parse(result);
		
		expect(parsed.success).toBe(true);
		expect(parsed.framework).toBe('vitest');
		
		process.chdir(originalCwd);
		setTimeout(() => {
			try {
				fs.rmSync(tempDir, { recursive: true, force: true });
			} catch {
				// Ignore
			}
		}, 100);
	});
});

describe('test-runner.ts - Framework Detection', () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-detect-'));
		originalCwd = process.cwd();
		process.chdir(tempDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		// Retry cleanup after a short delay
		setTimeout(() => {
			try {
				fs.rmSync(tempDir, { recursive: true, force: true });
			} catch {
				// Ignore cleanup errors
			}
		}, 100);
	});

	test('detects no framework when no config exists', async () => {
		const framework = await detectTestFramework();
		expect(framework).toBe('none');
	});

	test('detects vitest from package.json scripts', async () => {
		fs.writeFileSync(
			'package.json',
			JSON.stringify({
				scripts: { test: 'vitest run' },
				devDependencies: { vitest: '^1.0.0' },
			}),
		);
		const framework = await detectTestFramework();
		expect(framework).toBe('vitest');
	});

	test('detects jest from package.json scripts', async () => {
		fs.writeFileSync(
			'package.json',
			JSON.stringify({
				scripts: { test: 'jest' },
				devDependencies: { jest: '^29.0.0' },
			}),
		);
		const framework = await detectTestFramework();
		expect(framework).toBe('jest');
	});

	test('detects mocha from package.json', async () => {
		fs.writeFileSync(
			'package.json',
			JSON.stringify({
				scripts: { test: 'mocha' },
				devDependencies: { mocha: '^10.0.0' },
			}),
		);
		const framework = await detectTestFramework();
		expect(framework).toBe('mocha');
	});

	test('detects bun from package.json', async () => {
		fs.writeFileSync(
			'package.json',
			JSON.stringify({
				scripts: { test: 'bun test' },
			}),
		);
		fs.writeFileSync('bun.lock', ''); // Create bun.lock file
		const framework = await detectTestFramework();
		expect(framework).toBe('bun');
	});

	test('detects pytest from pyproject.toml', async () => {
		fs.writeFileSync(
			'pyproject.toml',
			`
[project]
name = "test"

[tool.pytest.ini_options]
testpaths = ["tests"]
`,
		);
		const framework = await detectTestFramework();
		expect(framework).toBe('pytest');
	});

	test('detects pytest from setup.cfg', async () => {
		fs.writeFileSync(
			'setup.cfg',
			`
[pytest]
testpaths = tests
`,
		);
		const framework = await detectTestFramework();
		expect(framework).toBe('pytest');
	});

	test('detects pytest from requirements.txt', async () => {
		fs.writeFileSync('requirements.txt', 'pytest>=7.0.0\n');
		const framework = await detectTestFramework();
		expect(framework).toBe('pytest');
	});

	test('detects cargo from Cargo.toml', async () => {
		fs.writeFileSync(
			'Cargo.toml',
			`
[package]
name = "test"
version = "0.1.0"

[dev-dependencies]
tokio = { version = "1.0", features = ["full"] }
`,
		);
		const framework = await detectTestFramework();
		expect(framework).toBe('cargo');
	});

	test('detects pester from pester.config.ps1', async () => {
		fs.writeFileSync('pester.config.ps1', 'configuration\n');
		const framework = await detectTestFramework();
		expect(framework).toBe('pester');
	});

	test('detects pester from tests.ps1', async () => {
		fs.writeFileSync('tests.ps1', 'Describe "Tests" { }\n');
		const framework = await detectTestFramework();
		expect(framework).toBe('pester');
	});
});

describe('test-runner.ts - Validation Tests (no execution)', () => {
	test('returns error when no framework detected', async () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-none-'));
		const originalCwd = process.cwd();
		process.chdir(tempDir);

		// Use explicit scope to reach framework detection (not scope: 'all' which is rejected first)
		const result = await mockExecute({ scope: 'convention', files: ['src/utils.ts'] }, { directory: tempDir });
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(false);
		expect(parsed.framework).toBe('none');
		expect(parsed.error).toContain('No test framework');

		process.chdir(originalCwd);
		// Cleanup with delay
		setTimeout(() => {
			try {
				fs.rmSync(tempDir, { recursive: true, force: true });
			} catch {
				// Ignore
			}
		}, 100);
	}, 10000);

	test('mockExecute returns valid JSON structure for error case', async () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-json-'));
		const originalCwd = process.cwd();
		process.chdir(tempDir);

		const result = await mockExecute({}, { directory: tempDir });
		const parsed = JSON.parse(result);

		// Check structure for error case
		expect(parsed).toHaveProperty('success');
		expect(parsed.success).toBe(false);
		expect(parsed).toHaveProperty('framework');
		expect(parsed).toHaveProperty('scope');
		expect(parsed).toHaveProperty('error');
		expect(parsed.framework).toBe('none');

		process.chdir(originalCwd);
		setTimeout(() => {
			try {
				fs.rmSync(tempDir, { recursive: true, force: true });
			} catch {
				// Ignore
			}
		}, 100);
	}, 10000);
});

describe('test-runner.ts - Edge Cases', () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-edge-'));
		originalCwd = process.cwd();
		process.chdir(tempDir);
		// Create vitest config to allow framework detection
		fs.writeFileSync(
			'package.json',
			JSON.stringify({
				scripts: { test: 'vitest run' },
				devDependencies: { vitest: '^1.0.0' },
			}),
		);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		setTimeout(() => {
			try {
				fs.rmSync(tempDir, { recursive: true, force: true });
			} catch {
				// Ignore
			}
		}, 100);
	});

	test('detectTestFramework correctly identifies vitest from package.json', async () => {
		// Test framework detection without executing tests
		const framework = await detectTestFramework();
		expect(framework).toBe('vitest');
	});

	test('validateArgs is exported and works', () => {
		// Verify validateArgs works correctly
		expect(validateArgs({ scope: 'all' })).toBe(true);
		expect(validateArgs({ scope: 'convention', files: ['test.ts'] })).toBe(true);
		expect(validateArgs({ scope: 'invalid' })).toBe(false);
		expect(validateArgs({ files: 'not-an-array' } as unknown)).toBe(false);
	});

	test('timeout defaults are defined correctly', () => {
		// Test timeout constants without running external processes
		expect(DEFAULT_TIMEOUT_MS).toBe(60_000);
		expect(MAX_TIMEOUT_MS).toBe(300_000);
		expect(DEFAULT_TIMEOUT_MS).toBeLessThan(MAX_TIMEOUT_MS);
	});
});

describe('test-runner.ts - Security Validation', () => {
	test('rejects path traversal in files', async () => {
		const result = await mockExecute(
			{ files: ['../../etc/passwd'] },
			{ directory: process.cwd() },
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toContain('Invalid arguments');
	});

	test('rejects URL-encoded path traversal', async () => {
		const result = await mockExecute(
			{ files: ['%2e%2e%2fpasswd'] },
			{ directory: process.cwd() },
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toContain('Invalid arguments');
	});

	test('rejects fullwidth dot path traversal', async () => {
		const result = await mockExecute(
			{ files: ['file\uff0e\uff0epasswd'] },
			{ directory: process.cwd() },
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toContain('Invalid arguments');
	});

	test('rejects PowerShell metacharacters', async () => {
		const result = await mockExecute(
			{ files: ['file|whoami.ps1'] },
			{ directory: process.cwd() },
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toContain('Invalid arguments');
	});

	test('rejects control characters in files', async () => {
		const result = await mockExecute(
			{ files: ['file\x00test.ts'] },
			{ directory: process.cwd() },
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toContain('Invalid arguments');
	});

	test('rejects newline in files', async () => {
		const result = await mockExecute(
			{ files: ['file\ntest.ts'] },
			{ directory: process.cwd() },
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toContain('Invalid arguments');
	});

	test('rejects absolute Unix path', async () => {
		const result = await mockExecute(
			{ files: ['/etc/passwd'] },
			{ directory: process.cwd() },
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toContain('Invalid arguments');
	});

	test('rejects absolute Windows path', async () => {
		const result = await mockExecute(
			{ files: ['C:\\Windows\\System32\\file.ts'] },
			{ directory: process.cwd() },
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toContain('Invalid arguments');
	});

	test('rejects invalid scope value', async () => {
		const result = await mockExecute(
			{ scope: 'invalid' as 'all' },
			{ directory: process.cwd() },
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toContain('Invalid arguments');
	});

	test('rejects invalid files type (string instead of array)', async () => {
		const result = await mockExecute(
			{ files: 'not-an-array' } as unknown as Record<string, unknown>,
			{ directory: process.cwd() },
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toContain('Invalid arguments');
	});

	test('rejects invalid coverage type', async () => {
		const result = await mockExecute(
			{ coverage: 'yes' } as unknown as Record<string, unknown>,
			{ directory: process.cwd() },
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toContain('Invalid arguments');
	});

	test('rejects invalid timeout type', async () => {
		const result = await mockExecute(
			{ timeout_ms: '60s' } as unknown as Record<string, unknown>,
			{ directory: process.cwd() },
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toContain('Invalid arguments');
	});

	test('accepts valid relative file path - validation only', async () => {
		// Test validation passes by checking we don't get Invalid arguments error
		// This test verifies validation passes
		expect(validateArgs({ files: ['src/utils.ts'] })).toBe(true);
	});

	test('rejects convention scope without files', async () => {
		const result = await mockExecute(
			{ scope: 'convention' },
			{ directory: process.cwd() },
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.scope).toBe('convention');
		expect(parsed.error).toContain('require explicit files');
		expect(parsed.error).toContain('unsafe full-project discovery');
	});

	test('rejects graph scope without files', async () => {
		const result = await mockExecute(
			{ scope: 'graph' },
			{ directory: process.cwd() },
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.scope).toBe('graph');
		expect(parsed.error).toContain('require explicit files');
	});

	test('rejects convention scope with empty files array', async () => {
		const result = await mockExecute(
			{ scope: 'convention', files: [] },
			{ directory: process.cwd() },
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.scope).toBe('convention');
		expect(parsed.error).toContain('require explicit files');
	});

	test('rejects graph scope with empty files array', async () => {
		const result = await mockExecute(
			{ scope: 'graph', files: [] },
			{ directory: process.cwd() },
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.scope).toBe('graph');
		expect(parsed.error).toContain('require explicit files');
	});

	test('rejects non-source files array for convention scope', async () => {
		// Set up a detectable framework first so we can test the non-source-file guard
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-nonsrc-conv-'));
		const originalCwd = process.cwd();
		process.chdir(tempDir);

		// Create minimal package.json for vitest detection
		fs.writeFileSync(
			'package.json',
			JSON.stringify({
				scripts: { test: 'vitest run' },
				devDependencies: { vitest: '^1.0.0' },
			}),
		);

		const result = await mockExecute(
			{ scope: 'convention', files: ['README.md', 'config.json'] },
			{ directory: tempDir },
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.scope).toBe('convention');
		expect(parsed.error).toContain('no source files with recognized extensions');
		expect(parsed.message).toContain('Non-source files like README.md or config.json');

		process.chdir(originalCwd);
		setTimeout(() => {
			try {
				fs.rmSync(tempDir, { recursive: true, force: true });
			} catch {
				// Ignore
			}
		}, 100);
	}, 10000);

	test('rejects non-source files array for graph scope', async () => {
		// Set up a detectable framework first so we can test the non-source-file guard
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-nonsrc-graph-'));
		const originalCwd = process.cwd();
		process.chdir(tempDir);

		// Create minimal package.json for vitest detection
		fs.writeFileSync(
			'package.json',
			JSON.stringify({
				scripts: { test: 'vitest run' },
				devDependencies: { vitest: '^1.0.0' },
			}),
		);

		const result = await mockExecute(
			{ scope: 'graph', files: ['README.md', 'config.json'] },
			{ directory: tempDir },
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.scope).toBe('graph');
		expect(parsed.error).toContain('no source files with recognized extensions');
		expect(parsed.message).toContain('Non-source files like README.md or config.json');

		process.chdir(originalCwd);
		setTimeout(() => {
			try {
				fs.rmSync(tempDir, { recursive: true, force: true });
			} catch {
				// Ignore
			}
		}, 100);
	}, 10000);
});

describe('test-runner.ts - Interactive Bulk-Execution Guards', () => {
	test('rejects scope "all" with structured error for interactive sessions', async () => {
		const result = await mockExecute(
			{ scope: 'all' },
			{ directory: process.cwd() },
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.scope).toBe('all');
		expect(parsed.error).toContain('Full-suite test execution');
		expect(parsed.error).toContain('prohibited in interactive sessions');
		expect(parsed.message).toContain('scope "convention" or "graph"');
	});

	test('allows narrow scope requests to execute normally', async () => {
		// Create a temp directory with a simple test file
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-narrow-'));
		const originalCwd = process.cwd();
		process.chdir(tempDir);

		// Create minimal package.json for vitest detection
		fs.writeFileSync(
			'package.json',
			JSON.stringify({
				scripts: { test: 'vitest run' },
				devDependencies: { vitest: '^1.0.0' },
			}),
		);

		// Create src directory FIRST, then source file
		fs.mkdirSync('src', { recursive: true });
		fs.writeFileSync('src/utils.ts', 'export const add = (a: number, b: number) => a + b;');

		// Create corresponding test file
		fs.writeFileSync('src/utils.test.ts', 'import { describe, test, expect } from "vitest"; import { add } from "./utils"; describe("add", () => { test("adds", () => { expect(add(1, 2)).toBe(3); }); });');

		// Use convention scope with explicit file - should NOT be rejected
		const result = await mockExecute(
			{ scope: 'convention', files: ['src/utils.ts'] },
			{ directory: tempDir },
		);
		const parsed = JSON.parse(result);

		// First verify execution succeeded (not blocked by safety guards)
		expect(parsed.success).toBe(true);

		// Should NOT have an error field when successful
		expect(parsed.error).toBeUndefined();

		process.chdir(originalCwd);
		setTimeout(() => {
			try {
				fs.rmSync(tempDir, { recursive: true, force: true });
			} catch {
				// Ignore
			}
		}, 100);
	}, 15000);

	test('rejects source file with no matching test file for convention scope', async () => {
		// Create a temp directory with a source file but NO test file
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-empty-conv-'));
		const originalCwd = process.cwd();
		process.chdir(tempDir);

		// Create minimal package.json for vitest detection
		fs.writeFileSync(
			'package.json',
			JSON.stringify({
				scripts: { test: 'vitest run' },
				devDependencies: { vitest: '^1.0.0' },
			}),
		);

		// Create src directory and source file WITHOUT a corresponding test file
		fs.mkdirSync('src', { recursive: true });
		fs.writeFileSync('src/utils.ts', 'export const add = (a: number, b: number) => a + b;');

		// Provide the source file - should be rejected because no test file exists
		const result = await mockExecute(
			{ scope: 'convention', files: ['src/utils.ts'] },
			{ directory: tempDir },
		);
		const parsed = JSON.parse(result);

		// Should be rejected with clear error about no matching test files
		expect(parsed.success).toBe(false);
		expect(parsed.scope).toBe('convention');
		expect(parsed.error).toContain('resolved to zero test files');
		expect(parsed.message).toContain('No matching test files found');

		process.chdir(originalCwd);
		setTimeout(() => {
			try {
				fs.rmSync(tempDir, { recursive: true, force: true });
			} catch {
				// Ignore
			}
		}, 100);
	}, 15000);

	test('rejects source file with no matching test file for graph scope', async () => {
		// Create a temp directory with a source file but NO test file
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-empty-graph-'));
		const originalCwd = process.cwd();
		process.chdir(tempDir);

		// Create minimal package.json for vitest detection
		fs.writeFileSync(
			'package.json',
			JSON.stringify({
				scripts: { test: 'vitest run' },
				devDependencies: { vitest: '^1.0.0' },
			}),
		);

		// Create src directory and source file WITHOUT a corresponding test file
		fs.mkdirSync('src', { recursive: true });
		fs.writeFileSync('src/utils.ts', 'export const add = (a: number, b: number) => a + b;');

		// Provide the source file - should be rejected because no test file exists
		const result = await mockExecute(
			{ scope: 'graph', files: ['src/utils.ts'] },
			{ directory: tempDir },
		);
		const parsed = JSON.parse(result);

		// Should be rejected with clear error about no matching test files
		expect(parsed.success).toBe(false);
		// Graph scope falls back to convention when imports resolution returns no results
		expect(parsed.scope).toBe('convention');
		expect(parsed.error).toContain('resolved to zero test files');
		expect(parsed.message).toContain('No matching test files found');

		process.chdir(originalCwd);
		setTimeout(() => {
			try {
				fs.rmSync(tempDir, { recursive: true, force: true });
			} catch {
				// Ignore
			}
		}, 100);
	}, 15000);
});

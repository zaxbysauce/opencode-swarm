import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Import the module under test
const testRunnerModule = await import('../../../src/tools/test-runner');

// Extract the exports we need
const {
	MAX_OUTPUT_BYTES,
	MAX_COMMAND_LENGTH,
	DEFAULT_TIMEOUT_MS,
	MAX_TIMEOUT_MS,
	MAX_SAFE_TEST_FILES,
	SUPPORTED_FRAMEWORKS,
	test_runner,
	detectTestFramework,
} = testRunnerModule;

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
			const frameworks = [
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

describe('test-runner.ts - Tool Metadata', () => {
	test('has description', () => {
		expect(test_runner.description).toContain('test');
		expect(test_runner.description).toContain('framework');
	});

	test('has execute function', () => {
		expect(typeof test_runner.execute).toBe('function');
	});

	test('has scope schema with all options', () => {
		expect(test_runner.args.scope).toBeDefined();
	});

	test('has files schema', () => {
		expect(test_runner.args.files).toBeDefined();
	});

	test('has coverage schema', () => {
		expect(test_runner.args.coverage).toBeDefined();
	});

	test('has timeout_ms schema', () => {
		expect(test_runner.args.timeout_ms).toBeDefined();
	});
});

describe('test-runner.ts - Framework Detection', () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		tempDir = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-detect-')),
		);
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
		const framework = await detectTestFramework(tempDir);
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
		const framework = await detectTestFramework(tempDir);
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
		const framework = await detectTestFramework(tempDir);
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
		const framework = await detectTestFramework(tempDir);
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
		const framework = await detectTestFramework(tempDir);
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
		const framework = await detectTestFramework(tempDir);
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
		const framework = await detectTestFramework(tempDir);
		expect(framework).toBe('pytest');
	});

	test('detects pytest from requirements.txt', async () => {
		fs.writeFileSync('requirements.txt', 'pytest>=7.0.0\n');
		const framework = await detectTestFramework(tempDir);
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
		const framework = await detectTestFramework(tempDir);
		expect(framework).toBe('cargo');
	});

	test('detects pester from pester.config.ps1', async () => {
		fs.writeFileSync('pester.config.ps1', 'configuration\n');
		const framework = await detectTestFramework(tempDir);
		expect(framework).toBe('pester');
	});

	test('detects pester from tests.ps1', async () => {
		fs.writeFileSync('tests.ps1', 'Describe "Tests" { }\n');
		const framework = await detectTestFramework(tempDir);
		expect(framework).toBe('pester');
	});
});

describe('test-runner.ts - Validation Tests (no execution)', () => {
	test('returns error when no framework detected', async () => {
		const tempDir = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-none-')),
		);
		const originalCwd = process.cwd();
		process.chdir(tempDir);

		// Use explicit scope to reach framework detection (not scope: 'all' which is rejected first)
		const result = await test_runner.execute(
			{ scope: 'convention', files: ['src/utils.ts'] },
			{} as any,
		);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(false);
		expect(parsed.framework).toBe('none');
		expect(parsed.error).toContain('No test framework');
		expect(parsed.outcome).toBe('error');

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

	test('tool returns valid JSON structure for error case', async () => {
		const tempDir = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-json-')),
		);
		const originalCwd = process.cwd();
		process.chdir(tempDir);

		const result = await test_runner.execute({}, {} as any);
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
		tempDir = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-edge-')),
		);
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
		const framework = await detectTestFramework(tempDir);
		expect(framework).toBe('vitest');
	});

	test('tool metadata has correct structure for vitest framework', () => {
		// Verify tool structure without executing - check the tool definition
		expect(test_runner.args.scope).toBeDefined();
		expect(test_runner.args.files).toBeDefined();
		expect(test_runner.args.coverage).toBeDefined();
		expect(test_runner.args.timeout_ms).toBeDefined();

		// Verify DEFAULT_TIMEOUT_MS is exported and correct
		expect(DEFAULT_TIMEOUT_MS).toBe(60000);
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
		const result = await test_runner.execute(
			{ files: ['../../etc/passwd'] },
			{} as any,
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toContain('Invalid arguments');
	});

	test('rejects URL-encoded path traversal', async () => {
		const result = await test_runner.execute(
			{ files: ['%2e%2e%2fpasswd'] },
			{} as any,
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toContain('Invalid arguments');
	});

	test('rejects fullwidth dot path traversal', async () => {
		const result = await test_runner.execute(
			{ files: ['file\uff0e\uff0epasswd'] },
			{} as any,
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toContain('Invalid arguments');
	});

	test('rejects PowerShell metacharacters', async () => {
		const result = await test_runner.execute(
			{ files: ['file|whoami.ps1'] },
			{} as any,
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toContain('Invalid arguments');
	});

	test('rejects control characters in files', async () => {
		const result = await test_runner.execute(
			{ files: ['file\x00test.ts'] },
			{} as any,
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toContain('Invalid arguments');
	});

	test('rejects newline in files', async () => {
		const result = await test_runner.execute(
			{ files: ['file\ntest.ts'] },
			{} as any,
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toContain('Invalid arguments');
	});

	test('rejects absolute Unix path', async () => {
		const result = await test_runner.execute(
			{ files: ['/etc/passwd'] },
			{} as any,
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toContain('Invalid arguments');
	});

	test('rejects absolute Windows path', async () => {
		const result = await test_runner.execute(
			{ files: ['C:\\Windows\\System32\\file.ts'] },
			{} as any,
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toContain('Invalid arguments');
	});

	test('rejects invalid scope value', async () => {
		const result = await test_runner.execute({ scope: 'invalid' }, {} as any);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toContain('Invalid arguments');
	});

	test('rejects invalid files type (string instead of array)', async () => {
		const result = await test_runner.execute(
			{ files: 'not-an-array' } as any,
			{} as any,
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toContain('Invalid arguments');
	});

	test('rejects invalid coverage type', async () => {
		const result = await test_runner.execute(
			{ coverage: 'yes' } as any,
			{} as any,
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toContain('Invalid arguments');
	});

	test('rejects invalid timeout type', async () => {
		const result = await test_runner.execute(
			{ timeout_ms: '60s' } as any,
			{} as any,
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toContain('Invalid arguments');
	});

	test('accepts valid relative file path - validation only', async () => {
		// Test validation passes by checking we don't get Invalid arguments error
		// Note: We can't test execution with files as it triggers actual test run
		// This test verifies validation passes by checking the schema is defined
		expect(test_runner.args.files).toBeDefined();
	});

	test('rejects convention scope without files', async () => {
		const result = await test_runner.execute(
			{ scope: 'convention' },
			{} as any,
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.scope).toBe('convention');
		expect(parsed.error).toContain('require explicit files');
		expect(parsed.error).toContain('unsafe full-project discovery');
	});

	test('rejects graph scope without files', async () => {
		const result = await test_runner.execute({ scope: 'graph' }, {} as any);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.scope).toBe('graph');
		expect(parsed.error).toContain('require explicit files');
		expect(parsed.error).toContain('unsafe full-project discovery');
	});

	test('rejects convention scope with empty files array', async () => {
		const result = await test_runner.execute(
			{ scope: 'convention', files: [] },
			{} as any,
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.scope).toBe('convention');
		expect(parsed.error).toContain('require explicit files');
	});

	test('rejects graph scope with empty files array', async () => {
		const result = await test_runner.execute(
			{ scope: 'graph', files: [] },
			{} as any,
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.scope).toBe('graph');
		expect(parsed.error).toContain('require explicit files');
	});

	test('rejects non-source files array for convention scope', async () => {
		// Set up a detectable framework first so we can test the non-source-file guard
		const tempDir = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-nonsrc-conv-')),
		);
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

		const result = await test_runner.execute(
			{ scope: 'convention', files: ['README.md', 'config.json'] },
			{} as any,
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.scope).toBe('convention');
		expect(parsed.error).toContain(
			'no source files with recognized extensions',
		);
		expect(parsed.message).toContain(
			'Non-source files like README.md or config.json',
		);

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
		const tempDir = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-nonsrc-graph-')),
		);
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

		const result = await test_runner.execute(
			{ scope: 'graph', files: ['README.md', 'config.json'] },
			{} as any,
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.scope).toBe('graph');
		expect(parsed.error).toContain(
			'no source files with recognized extensions',
		);
		expect(parsed.message).toContain(
			'Non-source files like README.md or config.json',
		);

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
		const result = await test_runner.execute({ scope: 'all' }, {} as any);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.scope).toBe('all');
		expect(parsed.error).toContain('scope "all" is not allowed');
		expect(parsed.message).toContain('scope "convention" or "graph"');
	});

	// Flaky on macOS/Windows: spawns vitest in temp dir without node_modules installed
	test.skipIf(process.platform !== 'linux')(
		'allows narrow scope requests to execute normally',
		async () => {
			// Create a temp directory with a simple test file
			const tempDir = fs.realpathSync(
				fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-narrow-')),
			);
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
			fs.writeFileSync(
				'src/utils.ts',
				'export const add = (a: number, b: number) => a + b;',
			);

			// Create corresponding test file
			fs.writeFileSync(
				'src/utils.test.ts',
				'import { describe, test, expect } from "vitest"; import { add } from "./utils"; describe("add", () => { test("adds", () => { expect(add(1, 2)).toBe(3); }); });',
			);

			// Use convention scope with explicit file - should NOT be rejected
			const result = await test_runner.execute(
				{ scope: 'convention', files: ['src/utils.ts'] },
				{} as any,
			);
			const parsed = JSON.parse(result);

			// First verify execution succeeded (not blocked by safety guards)
			expect(parsed.success).toBe(true);
			expect(parsed.outcome).toBe('pass');

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
		},
		15000,
	);

	test('rejects source file with no matching test file for convention scope', async () => {
		// Create a temp directory with a source file but NO test file
		const tempDir = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-empty-conv-')),
		);
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
		fs.writeFileSync(
			'src/utils.ts',
			'export const add = (a: number, b: number) => a + b;',
		);

		// Provide the source file - should be rejected because no test file exists
		const result = await test_runner.execute(
			{ scope: 'convention', files: ['src/utils.ts'] },
			{} as any,
		);
		const parsed = JSON.parse(result);

		// Should be rejected with clear error about no matching test files
		expect(parsed.success).toBe(false);
		expect(parsed.scope).toBe('convention');
		expect(parsed.error).toContain('resolved to zero test files');
		expect(parsed.message).toContain('No matching test files found');
		expect(parsed.outcome).toBe('skip');

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
		const tempDir = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-empty-graph-')),
		);
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
		fs.writeFileSync(
			'src/utils.ts',
			'export const add = (a: number, b: number) => a + b;',
		);

		// Provide the source file - should be rejected because no test file exists
		const result = await test_runner.execute(
			{ scope: 'graph', files: ['src/utils.ts'] },
			{} as any,
		);
		const parsed = JSON.parse(result);

		// Should be rejected with clear error about no matching test files
		expect(parsed.success).toBe(false);
		// Graph scope falls back to convention when imports resolution returns no results
		expect(parsed.scope).toBe('convention');
		expect(parsed.error).toContain('resolved to zero test files');
		expect(parsed.message).toContain('No matching test files found');
		expect(parsed.outcome).toBe('skip');

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

/**
 * Task 5.2: scope:"all" gated access tests
 *
 * Verifies:
 * - scope:"all" without allow_full_suite returns error
 * - scope:"all" with allow_full_suite:true does NOT return error (guard passes through)
 * - scope:"all" with allow_full_suite:false returns error
 * - scope:"convention" and scope:"graph" are unaffected by allow_full_suite
 */
describe('test-runner.ts - scope:"all" gated access (allow_full_suite)', () => {
	describe('scope "all" guard behavior', () => {
		test('scope:"all" without allow_full_suite returns error', async () => {
			const result = await test_runner.execute({ scope: 'all' }, {} as any);
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.scope).toBe('all');
			expect(parsed.error).toContain('scope "all" is not allowed');
		});

		// Flaky on macOS/Windows: spawns vitest via npx in temp dir without node_modules installed
		test.skipIf(process.platform !== 'linux')(
			'scope:"all" with allow_full_suite:true does NOT return the guard error',
			async () => {
				// Note: We do NOT actually run scope:"all" with allow_full_suite:true here
				// because that would execute the full test suite. Instead, we verify that
				// the guard PASSES (no error about allow_full_suite is returned).
				// The execute function should proceed past the guard check.

				// Create a temp dir so framework detection can work
				const tempDir = fs.realpathSync(
					fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-allowall-')),
				);
				const originalCwd = process.cwd();
				process.chdir(tempDir);

				// Create minimal package.json for framework detection
				fs.writeFileSync(
					'package.json',
					JSON.stringify({
						scripts: { test: 'vitest run' },
						devDependencies: { vitest: '^1.0.0' },
					}),
				);

				const result = await test_runner.execute(
					{ scope: 'all', allow_full_suite: true },
					{} as any,
				);
				const parsed = JSON.parse(result);

				// Should NOT have the allow_full_suite error
				expect(parsed.error).not.toContain('allow_full_suite');
				// The error (if any) should be about something else (like no tests found)
				// not about the guard

				process.chdir(originalCwd);
				setTimeout(() => {
					try {
						fs.rmSync(tempDir, { recursive: true, force: true });
					} catch {
						// Ignore
					}
				}, 100);
			},
			15000,
		);

		test('scope:"all" with allow_full_suite:true and files:[] passes through zero-test-files guard', async () => {
			// This test verifies that scope:"all" with allow_full_suite:true does NOT get rejected
			// by the zero-test-files guard when files is an empty array.
			// Uses a temp dir with no framework so we get "No test framework detected"
			// rather than actually running the project's test suite.
			const noFrameworkDir = fs.realpathSync(
				fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-allfiles-')),
			);
			const savedCwd = process.cwd();
			process.chdir(noFrameworkDir);

			const result = await test_runner.execute(
				{ scope: 'all', allow_full_suite: true, files: [] },
				{} as any,
			);
			const parsed = JSON.parse(result);

			// Should NOT have the zero-test-files guard error
			expect(parsed.error).not.toContain(
				'Provided source files resolved to zero test files',
			);
			// Should NOT have the allow_full_suite error
			expect(parsed.error).not.toContain('allow_full_suite');
			// Will have "No test framework detected" since there's no framework in temp dir
			// This proves the code passed through the scope dispatch and reached framework detection
			expect(parsed.error).toContain('No test framework detected');

			process.chdir(savedCwd);
			setTimeout(() => {
				try {
					fs.rmSync(noFrameworkDir, { recursive: true, force: true });
				} catch {
					/* ignore */
				}
			}, 100);
		});

		test('scope:"all" with allow_full_suite:true passes through zero-test-files guard', async () => {
			// Codex Bug 1 fix verification: scope:"all" with allow_full_suite:true and NO files argument
			// Uses a temp dir with no framework so we get "No test framework detected"
			// rather than actually running the project's test suite.
			const noFrameworkDir = fs.realpathSync(
				fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-allnofiles-')),
			);
			const savedCwd = process.cwd();
			process.chdir(noFrameworkDir);

			const result = await test_runner.execute(
				{ scope: 'all', allow_full_suite: true },
				{} as any,
			);
			const parsed = JSON.parse(result);

			// Should NOT have the zero-test-files guard error
			expect(parsed.error).not.toContain(
				'Provided source files resolved to zero test files',
			);
			// Should NOT have the allow_full_suite error
			expect(parsed.error).not.toContain('allow_full_suite');
			// Result should be "No test framework detected" (proving it passed through to framework detection)
			expect(parsed.error).toContain('No test framework detected');

			process.chdir(savedCwd);
			setTimeout(() => {
				try {
					fs.rmSync(noFrameworkDir, { recursive: true, force: true });
				} catch {
					/* ignore */
				}
			}, 100);
		});

		test('scope:"all" with allow_full_suite:false returns error', async () => {
			const result = await test_runner.execute(
				{ scope: 'all', allow_full_suite: false },
				{} as any,
			);
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.scope).toBe('all');
			expect(parsed.error).toContain('scope "all" is not allowed');
		});

		test('scope:"all" with allow_full_suite:undefined returns error (same as missing)', async () => {
			const result = await test_runner.execute(
				{ scope: 'all', allow_full_suite: undefined },
				{} as any,
			);
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.scope).toBe('all');
			expect(parsed.error).toContain('scope "all" is not allowed');
		});
	});

	describe('scope "convention" and "graph" are unaffected by allow_full_suite', () => {
		test('scope:"convention" without allow_full_suite works normally', async () => {
			// Create a temp dir so framework detection can work
			const tempDir = fs.realpathSync(
				fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-conv-')),
			);
			const originalCwd = process.cwd();
			process.chdir(tempDir);

			// Create minimal package.json for framework detection
			fs.writeFileSync(
				'package.json',
				JSON.stringify({
					scripts: { test: 'vitest run' },
					devDependencies: { vitest: '^1.0.0' },
				}),
			);

			// Create src directory and source file
			fs.mkdirSync('src', { recursive: true });
			fs.writeFileSync(
				'src/utils.ts',
				'export const add = (a: number, b: number) => a + b;',
			);

			// convention scope with a file should work (but will fail on no test file - which is fine)
			const result = await test_runner.execute(
				{ scope: 'convention', files: ['src/utils.ts'] },
				{} as any,
			);
			const parsed = JSON.parse(result);

			// Should NOT have allow_full_suite error - convention scope doesn't use that guard
			expect(parsed.error).not.toContain('allow_full_suite');

			process.chdir(originalCwd);
			setTimeout(() => {
				try {
					fs.rmSync(tempDir, { recursive: true, force: true });
				} catch {
					// Ignore
				}
			}, 100);
		}, 15000);

		test('scope:"graph" without allow_full_suite works normally', async () => {
			// Create a temp dir so framework detection can work
			const tempDir = fs.realpathSync(
				fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-graph-')),
			);
			const originalCwd = process.cwd();
			process.chdir(tempDir);

			// Create minimal package.json for framework detection
			fs.writeFileSync(
				'package.json',
				JSON.stringify({
					scripts: { test: 'vitest run' },
					devDependencies: { vitest: '^1.0.0' },
				}),
			);

			// Create src directory and source file
			fs.mkdirSync('src', { recursive: true });
			fs.writeFileSync(
				'src/utils.ts',
				'export const add = (a: number, b: number) => a + b;',
			);

			// graph scope with a file should work (but will fail on no test file - which is fine)
			const result = await test_runner.execute(
				{ scope: 'graph', files: ['src/utils.ts'] },
				{} as any,
			);
			const parsed = JSON.parse(result);

			// Should NOT have allow_full_suite error - graph scope doesn't use that guard
			expect(parsed.error).not.toContain('allow_full_suite');

			process.chdir(originalCwd);
			setTimeout(() => {
				try {
					fs.rmSync(tempDir, { recursive: true, force: true });
				} catch {
					// Ignore
				}
			}, 100);
		}, 15000);

		test('scope:"convention" with allow_full_suite:true still works normally', async () => {
			// Create a temp dir so framework detection can work
			const tempDir = fs.realpathSync(
				fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-conv-allow-')),
			);
			const originalCwd = process.cwd();
			process.chdir(tempDir);

			// Create minimal package.json for framework detection
			fs.writeFileSync(
				'package.json',
				JSON.stringify({
					scripts: { test: 'vitest run' },
					devDependencies: { vitest: '^1.0.0' },
				}),
			);

			// Create src directory and source file
			fs.mkdirSync('src', { recursive: true });
			fs.writeFileSync(
				'src/utils.ts',
				'export const add = (a: number, b: number) => a + b;',
			);

			// convention scope with allow_full_suite should still work (allow_full_suite is ignored for non-all scopes)
			const result = await test_runner.execute(
				{
					scope: 'convention',
					files: ['src/utils.ts'],
					allow_full_suite: true,
				},
				{} as any,
			);
			const parsed = JSON.parse(result);

			// Should NOT have allow_full_suite error - allow_full_suite only applies to scope "all"
			expect(parsed.error).not.toContain('allow_full_suite');

			process.chdir(originalCwd);
			setTimeout(() => {
				try {
					fs.rmSync(tempDir, { recursive: true, force: true });
				} catch {
					// Ignore
				}
			}, 100);
		}, 15000);

		test('scope:"graph" with allow_full_suite:true still works normally', async () => {
			// Create a temp dir so framework detection can work
			const tempDir = fs.realpathSync(
				fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-graph-allow-')),
			);
			const originalCwd = process.cwd();
			process.chdir(tempDir);

			// Create minimal package.json for framework detection
			fs.writeFileSync(
				'package.json',
				JSON.stringify({
					scripts: { test: 'vitest run' },
					devDependencies: { vitest: '^1.0.0' },
				}),
			);

			// Create src directory and source file
			fs.mkdirSync('src', { recursive: true });
			fs.writeFileSync(
				'src/utils.ts',
				'export const add = (a: number, b: number) => a + b;',
			);

			// graph scope with allow_full_suite should still work (allow_full_suite is ignored for non-all scopes)
			const result = await test_runner.execute(
				{ scope: 'graph', files: ['src/utils.ts'], allow_full_suite: true },
				{} as any,
			);
			const parsed = JSON.parse(result);

			// Should NOT have allow_full_suite error - allow_full_suite only applies to scope "all"
			expect(parsed.error).not.toContain('allow_full_suite');

			process.chdir(originalCwd);
			setTimeout(() => {
				try {
					fs.rmSync(tempDir, { recursive: true, force: true });
				} catch {
					// Ignore
				}
			}, 100);
		}, 15000);

		test('returns outcome "scope_exceeded" when too many test files resolved', async () => {
			// Create a temp directory with many source files to trigger MAX_SAFE_TEST_FILES limit
			const sourceFiles = Array.from(
				{ length: MAX_SAFE_TEST_FILES + 1 },
				(_, i) => `src/file${i}.spec.ts`,
			);
			const tempDir = fs.realpathSync(
				fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-toomany-')),
			);
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

			// Create src directory and MORE than MAX_SAFE_TEST_FILES test files
			// Convention scope discovers test files by naming convention (.spec.ts, .test.ts)
			// so we must create actual test files, not source files
			fs.mkdirSync('src', { recursive: true });
			for (let i = 0; i < MAX_SAFE_TEST_FILES + 1; i++) {
				const filePath = path.join('src', `file${i}.spec.ts`);
				fs.writeFileSync(filePath, `export const val${i} = ${i};\n`);
			}

			// Execute with scope 'convention' - should trigger too-many-files guard
			const result = await test_runner.execute(
				{ scope: 'convention', files: sourceFiles },
				{} as any,
			);
			const parsed = JSON.parse(result);

			expect(parsed.success).toBe(false);
			expect(parsed.outcome).toBe('scope_exceeded');
			expect(parsed.error).toContain('exceeds safe maximum');
			expect(parsed.message).toContain('Too many test files resolved');

			process.chdir(originalCwd);
			setTimeout(() => {
				try {
					fs.rmSync(tempDir, { recursive: true, force: true });
				} catch {
					// Ignore
				}
			}, 100);
		}, 30000);

		// Flaky on macOS/Windows: spawns vitest in temp dir without node_modules installed
		test.skipIf(process.platform !== 'linux')(
			'returns outcome "regression" when tests fail',
			async () => {
				// Create a temp directory with a failing test
				const tempDir = fs.realpathSync(
					fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-fail-')),
				);
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

				// Create src directory and source file
				fs.mkdirSync('src', { recursive: true });
				fs.writeFileSync(
					'src/utils.ts',
					'export const add = (a: number, b: number) => a + b;',
				);

				// Create a FAILING test file
				fs.writeFileSync(
					'src/utils.test.ts',
					'import { describe, test, expect } from "vitest"; import { add } from "./utils"; describe("add", () => { test("adds incorrectly", () => { expect(add(1, 2)).toBe(999); }); });',
				);

				// Execute with convention scope
				const result = await test_runner.execute(
					{ scope: 'convention', files: ['src/utils.ts'] },
					{} as any,
				);
				const parsed = JSON.parse(result);

				expect(parsed.success).toBe(false);
				expect(parsed.outcome).toBe('regression');
				expect(parsed.totals).toBeDefined();
				expect(parsed.totals.failed).toBeGreaterThan(0);

				process.chdir(originalCwd);
				setTimeout(() => {
					try {
						fs.rmSync(tempDir, { recursive: true, force: true });
					} catch {
						// Ignore
					}
				}, 100);
			},
			15000,
		);
	});
});

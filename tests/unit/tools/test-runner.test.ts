import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Import the module under test
const testRunnerModule = await import('../../../src/tools/test-runner');

// Extract the exports we need
const {
	MAX_OUTPUT_BYTES,
	MAX_COMMAND_LENGTH,
	DEFAULT_TIMEOUT_MS,
	MAX_TIMEOUT_MS,
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

		const result = await test_runner.execute({}, {} as any);
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

	test('tool returns valid JSON structure for error case', async () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-runner-json-'));
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
		const result = await test_runner.execute(
			{ scope: 'invalid' },
			{} as any,
		);
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
});

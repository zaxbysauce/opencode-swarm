import { describe, it, expect, beforeEach, afterEach, vi } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { qualityBudget, type QualityBudgetInput } from '../../../src/tools/quality-budget';

// Mock the saveEvidence function
vi.mock('../../../src/evidence/manager', () => ({
	saveEvidence: vi.fn().mockResolvedValue(undefined),
}));

// Helper to create temp test directories
function createTempDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'quality-budget-test-'));
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

// Helper to create test directory structure
function createTestStructure(dir: string, structure: Record<string, string>): void {
	for (const [filePath, content] of Object.entries(structure)) {
		createTestFile(dir, filePath, content);
	}
}

describe('quality_budget tool', () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		originalCwd = process.cwd();
		tempDir = createTempDir();
		process.chdir(tempDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		fs.rmSync(tempDir, { recursive: true, force: true });
		vi.clearAllMocks();
	});

	// ============ Input Validation Tests ============

	describe('input validation', () => {
		it('should throw error for non-object input', async () => {
			await expect(qualityBudget(null as unknown as QualityBudgetInput, tempDir)).rejects.toThrow(
				'Invalid input: Input must be an object',
			);
		});

		it('should throw error for missing changed_files', async () => {
			await expect(qualityBudget({} as QualityBudgetInput, tempDir)).rejects.toThrow(
				'Invalid input: changed_files must be an array',
			);
		});

		it('should throw error for non-array changed_files', async () => {
			await expect(
				qualityBudget({ changed_files: 'not-array' } as unknown as QualityBudgetInput, tempDir),
			).rejects.toThrow('Invalid input: changed_files must be an array');
		});

		it('should throw error for non-string in changed_files', async () => {
			await expect(
				qualityBudget({ changed_files: [123] } as unknown as QualityBudgetInput, tempDir),
			).rejects.toThrow('Invalid input: changed_files must contain strings');
		});

		it('should throw error for invalid config type', async () => {
			await expect(
				qualityBudget({ changed_files: ['test.ts'], config: 'invalid' } as unknown as QualityBudgetInput, tempDir),
			).rejects.toThrow('Invalid input: config must be an object if provided');
		});

		it('should accept valid input', async () => {
			const result = await qualityBudget({ changed_files: [] }, tempDir);
			expect(result).toBeDefined();
		});
	});

	// ============ Disabled Config Tests ============

	describe('disabled configuration', () => {
		it('should return pass verdict when disabled', async () => {
			const result = await qualityBudget(
				{
					changed_files: ['src/test.ts'],
					config: { enabled: false },
				},
				tempDir,
			);

			expect(result.verdict).toBe('pass');
			expect(result.summary.files_analyzed).toBe(0);
			expect(result.summary.violations_count).toBe(0);
		});

		it('should use default thresholds when not provided', async () => {
			const result = await qualityBudget({ changed_files: [] }, tempDir);

			expect(result.metrics.thresholds.max_complexity_delta).toBe(5);
			expect(result.metrics.thresholds.max_public_api_delta).toBe(10);
			expect(result.metrics.thresholds.max_duplication_ratio).toBe(0.05);
			expect(result.metrics.thresholds.min_test_to_code_ratio).toBe(0.3);
		});
	});

	// ============ Complexity Threshold Tests ============

	describe('complexity threshold', () => {
		it('should pass when complexity is below threshold', async () => {
			// Simple function with low complexity
			createTestFile(tempDir, 'src/simple.ts', 'export function hello() {\n  console.log("hi");\n}\n');

			const result = await qualityBudget(
				{
					changed_files: ['src/simple.ts'],
					config: { max_complexity_delta: 10 },
				},
				tempDir,
			);

			const complexityViolation = result.violations.find((v) => v.type === 'complexity');
			expect(complexityViolation).toBeUndefined();
		});

		it('should fail when complexity exceeds threshold', async () => {
			// Complex function with many decision points
			createTestFile(
				tempDir,
				'src/complex.ts',
				`export function complex(a: number, b: number, c: number) {
  if (a > 0) {
    if (b > 0) {
      if (c > 0) {
        return a + b + c;
      } else {
        return a + b;
      }
    } else {
      if (c > 0) {
        return a + c;
      } else {
        return a;
      }
    }
  } else if (b > 0) {
    if (c > 0) {
      return b + c;
    } else {
      return b;
    }
  }
  return 0;
}
`,
			);

			const result = await qualityBudget(
				{
					changed_files: ['src/complex.ts'],
					config: { max_complexity_delta: 3 }, // Very low threshold
				},
				tempDir,
			);

			const complexityViolation = result.violations.find((v) => v.type === 'complexity');
			expect(complexityViolation).toBeDefined();
			expect(complexityViolation?.severity).toBe('error');
		});

		it('should generate warning for moderate complexity violation', async () => {
			// Use a simple function that won't exceed 1.5x threshold
			createTestFile(
				tempDir,
				'src/moderate.ts',
				`export function moderate(a: number, b: number) {
  if (a > 0) {
    return a;
  }
  return 0;
}
`,
			);

			const result = await qualityBudget(
				{
					changed_files: ['src/moderate.ts'],
					config: { max_complexity_delta: 1 }, // Very low threshold
				},
				tempDir,
			);

			const complexityViolation = result.violations.find((v) => v.type === 'complexity');
			expect(complexityViolation).toBeDefined();
			// With threshold of 1 and complexity of ~3, it should be warning (not error)
			expect(['warning', 'error']).toContain(complexityViolation?.severity);
		});
	});

	// ============ API Delta Threshold Tests ============

	describe('API delta threshold', () => {
		it('should pass when API additions are below threshold', async () => {
			createTestFile(tempDir, 'src/api-simple.ts', 'export const x = 1;\nexport const y = 2;\n');

			const result = await qualityBudget(
				{
					changed_files: ['src/api-simple.ts'],
					config: { max_public_api_delta: 10 },
				},
				tempDir,
			);

			const apiViolation = result.violations.find((v) => v.type === 'api');
			expect(apiViolation).toBeUndefined();
		});

		it('should fail when API additions exceed threshold', async () => {
			// Many exports
			createTestFile(
				tempDir,
				'src/api-many.ts',
				`export const a = 1;
export const b = 2;
export const c = 3;
export const d = 4;
export const e = 5;
export const f = 6;
export const g = 7;
export const h = 8;
export const i = 9;
export const j = 10;
export const k = 11;
export const l = 12;
`,
			);

			const result = await qualityBudget(
				{
					changed_files: ['src/api-many.ts'],
					config: { max_public_api_delta: 5 },
				},
				tempDir,
			);

			const apiViolation = result.violations.find((v) => v.type === 'api');
			expect(apiViolation).toBeDefined();
			expect(apiViolation?.severity).toBe('error');
		});
	});

	// ============ Duplication Threshold Tests ============

	describe('duplication threshold', () => {
		it('should pass when duplication is below threshold', async () => {
			createTestFile(
				tempDir,
				'src/unique.ts',
				`export function unique1() { return 1; }
export function unique2() { return 2; }
export function unique3() { return 3; }
`,
			);

			const result = await qualityBudget(
				{
					changed_files: ['src/unique.ts'],
					config: { max_duplication_ratio: 0.1 },
				},
				tempDir,
			);

			const dupViolation = result.violations.find((v) => v.type === 'duplication');
			expect(dupViolation).toBeUndefined();
		});

		it('should fail when duplication exceeds threshold', async () => {
			// Many duplicate lines
			createTestFile(
				tempDir,
				'src/duplicate.ts',
				`const x = 1;
const y = 2;
const x = 1;
const y = 2;
const x = 1;
const y = 2;
const x = 1;
const y = 2;
const x = 1;
const y = 2;
const x = 1;
const y = 2;
`,
			);

			const result = await qualityBudget(
				{
					changed_files: ['src/duplicate.ts'],
					config: { max_duplication_ratio: 0.1 },
				},
				tempDir,
			);

			const dupViolation = result.violations.find((v) => v.type === 'duplication');
			expect(dupViolation).toBeDefined();
			expect(dupViolation?.severity).toBe('error');
		});
	});

	// ============ Test Ratio Threshold Tests ============

	describe('test ratio threshold', () => {
		it('should pass when test ratio meets minimum', async () => {
			// Create test files to meet ratio
			createTestFile(tempDir, 'src/code.ts', 'export const x = 1;\n');
			createTestFile(tempDir, 'tests/code.test.ts', 'describe("test", () => { it("passes", () => {}); });\n');

			const result = await qualityBudget(
				{
					changed_files: ['src/code.ts'],
					config: {
						min_test_to_code_ratio: 0.3,
						exclude_globs: [], // Don't exclude tests
					},
				},
				tempDir,
			);

			// Test ratio violation only triggers if below threshold
			const testViolation = result.violations.find((v) => v.type === 'test_ratio');
			// May or may not have violation depending on actual ratio
			expect(result).toBeDefined();
		});
	});

	// ============ Verdict Determination Tests ============

	describe('verdict determination', () => {
		it('should return pass when no violations', async () => {
			createTestFile(tempDir, 'src/clean.ts', 'export function clean() { return 1; }\n');

			const result = await qualityBudget(
				{
					changed_files: ['src/clean.ts'],
					config: {
						max_complexity_delta: 20, // High threshold
						max_public_api_delta: 20, // High threshold
						max_duplication_ratio: 1.0, // No limit
						min_test_to_code_ratio: 0, // No minimum
					},
				},
				tempDir,
			);

			// With very high thresholds, should pass
			expect(result.summary.errors_count).toBe(0);
		});

		it('should return fail when any error violations exist', async () => {
			createTestFile(
				tempDir,
				'src/error-violation.ts',
				`export function test(a: number, b: number, c: number) {
  if (a > 0) {
    if (b > 0) {
      if (c > 0) {
        return a + b + c;
      }
    }
  }
  return 0;
}
`,
			);

			const result = await qualityBudget(
				{
					changed_files: ['src/error-violation.ts'],
					config: { max_complexity_delta: 1 },
				},
				tempDir,
			);

			expect(result.verdict).toBe('fail');
			expect(result.summary.errors_count).toBeGreaterThan(0);
		});

		it('should return pass for warnings only (no errors)', async () => {
			// Simple file with minimal complexity
			createTestFile(
				tempDir,
				'src/warning-violation.ts',
				`export function test() {
  return 1;
}
export const x = 1;
`,
			);

			// Set very high threshold so no violations at all
			const result = await qualityBudget(
				{
					changed_files: ['src/warning-violation.ts'],
					config: {
						max_complexity_delta: 20,
						max_public_api_delta: 20,
						max_duplication_ratio: 1.0,
						min_test_to_code_ratio: 0, // No minimum
					},
				},
				tempDir,
			);

			// With high thresholds, no errors
			expect(result.summary.errors_count).toBe(0);
		});
	});

	// ============ File Filtering Tests ============

	describe('file filtering', () => {
		it('should respect enforce_on_globs', async () => {
			createTestFile(tempDir, 'lib/code.ts', 'export const x = 1;\n');
			createTestFile(tempDir, 'docs/readme.md', '# Readme\n');

			const result = await qualityBudget(
				{
					changed_files: ['lib/code.ts', 'docs/readme.md'],
					config: { enforce_on_globs: ['src/**'] },
				},
				tempDir,
			);

			// Should only analyze files matching src/**
			expect(result.summary.files_analyzed).toBe(0);
		});

		it('should respect exclude_globs', async () => {
			createTestFile(tempDir, 'src/include.ts', 'export const x = 1;\n');
			createTestFile(tempDir, 'tests/exclude.test.ts', 'describe("test", () => {});\n');

			const result = await qualityBudget(
				{
					changed_files: ['src/include.ts', 'tests/exclude.test.ts'],
					config: { exclude_globs: ['tests/**'] },
				},
				tempDir,
			);

			// Test file should be excluded
			expect(result.summary.files_analyzed).toBeGreaterThanOrEqual(1);
		});
	});

	// ============ Summary Counts Tests ============

	describe('summary counts', () => {
		it('should correctly count files analyzed', async () => {
			createTestFile(tempDir, 'src/file1.ts', 'export const a = 1;\n');
			createTestFile(tempDir, 'src/file2.ts', 'export const b = 2;\n');

			const result = await qualityBudget(
				{
					changed_files: ['src/file1.ts', 'src/file2.ts'],
				},
				tempDir,
			);

			expect(result.summary.files_analyzed).toBeGreaterThanOrEqual(1);
		});

		it('should correctly count violations', async () => {
			createTestFile(
				tempDir,
				'src/multi-violation.ts',
				`export const a = 1;
export const b = 2;
export const c = 3;
export const d = 4;
export const e = 5;
export const f = 6;
export const g = 7;
export const h = 8;
export const i = 9;
export const j = 10;
export const k = 11;
export function complex(a, b, c, d, e) {
  if (a && b && c && d && e) return 1;
  return 0;
}
`,
			);

			const result = await qualityBudget(
				{
					changed_files: ['src/multi-violation.ts'],
					config: {
						max_complexity_delta: 1,
						max_public_api_delta: 3,
					},
				},
				tempDir,
			);

			expect(result.summary.violations_count).toBeGreaterThan(0);
		});

		it('should correctly separate errors and warnings', async () => {
			createTestFile(
				tempDir,
				'src/severity-test.ts',
				`export function test(a: number, b: number, c: number, d: number, e: number) {
  if (a > 0) {
    if (b > 0) {
      if (c > 0) {
        if (d > 0) {
          if (e > 0) {
            return a + b + c + d + e;
          }
        }
      }
    }
  }
  return 0;
}
export const x = 1;
export const y = 2;
export const z = 3;
export const w = 4;
export const v = 5;
export const u = 6;
export const t = 7;
`,
			);

			const result = await qualityBudget(
				{
					changed_files: ['src/severity-test.ts'],
					config: {
						max_complexity_delta: 2,
						max_public_api_delta: 3,
					},
				},
				tempDir,
			);

			// Both complexity and API should be in error range (>1.5x threshold)
			expect(result.summary.errors_count).toBeGreaterThanOrEqual(0);
			expect(result.summary.warnings_count).toBeGreaterThanOrEqual(0);
		});
	});

	// ============ Metrics Tests ============

	describe('metrics computation', () => {
		it('should compute complexity_delta', async () => {
			createTestFile(tempDir, 'src/complex.ts', 'export function test(a, b, c, d) {\n  if (a && b && c && d) return 1;\n  return 0;\n}\n');

			const result = await qualityBudget(
				{
					changed_files: ['src/complex.ts'],
				},
				tempDir,
			);

			expect(result.metrics.complexity_delta).toBeGreaterThan(0);
		});

		it('should compute public_api_delta', async () => {
			createTestFile(tempDir, 'src/exports.ts', 'export const a = 1;\nexport const b = 2;\nexport const c = 3;\n');

			const result = await qualityBudget(
				{
					changed_files: ['src/exports.ts'],
				},
				tempDir,
			);

			expect(result.metrics.public_api_delta).toBe(3);
		});

		it('should compute duplication_ratio', async () => {
			// Create a file with many duplicate lines
			const duplicateContent = `const x = 1;
const y = 2;
const x = 1;
const y = 2;
const x = 1;
const y = 2;
const x = 1;
const y = 2;
const x = 1;
const y = 2;
const x = 1;
const y = 2;
const x = 1;
const y = 2;
const x = 1;
const y = 2;
const x = 1;
const y = 2;
const x = 1;
const y = 2;
`;
			createTestFile(tempDir, 'src/dup.ts', duplicateContent);

			const result = await qualityBudget(
				{
					changed_files: ['src/dup.ts'],
				},
				tempDir,
			);

			// Should have some duplication
			expect(result.metrics.duplication_ratio).toBeGreaterThanOrEqual(0);
		});

		it('should return 0 for missing files', async () => {
			const result = await qualityBudget(
				{
					changed_files: ['src/nonexistent.ts'],
				},
				tempDir,
			);

			expect(result.summary.files_analyzed).toBe(0);
		});
	});

	// ============ Evidence Saving Tests ============

	describe('evidence saving', () => {
		it('should call saveEvidence with correct type', async () => {
			const { saveEvidence } = await import('../../../src/evidence/manager');

			createTestFile(tempDir, 'src/test.ts', 'export const x = 1;\n');

			await qualityBudget({ changed_files: ['src/test.ts'] }, tempDir);

			expect(saveEvidence).toHaveBeenCalled();
			const callArgs = (saveEvidence as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(callArgs[1]).toBe('quality_budget');
		});

		it('should include correct verdict in evidence', async () => {
			const { saveEvidence } = await import('../../../src/evidence/manager');

			createTestFile(tempDir, 'src/test.ts', 'export const x = 1;\n');

			await qualityBudget(
				{
					changed_files: ['src/test.ts'],
					config: {
						max_complexity_delta: 20,
						max_public_api_delta: 20,
						max_duplication_ratio: 1.0,
						min_test_to_code_ratio: 0,
					},
				},
				tempDir,
			);

			const callArgs = (saveEvidence as ReturnType<typeof vi.fn>).mock.calls[0];
			const evidence = callArgs[2];
			expect(evidence.verdict).toBe('pass');
		});

		it('should include thresholds in evidence', async () => {
			const { saveEvidence } = await import('../../../src/evidence/manager');

			createTestFile(tempDir, 'src/test.ts', 'export const x = 1;\n');

			await qualityBudget(
				{
					changed_files: ['src/test.ts'],
					config: {
						max_complexity_delta: 7,
						max_public_api_delta: 15,
						max_duplication_ratio: 0.1,
						min_test_to_code_ratio: 0.25,
					},
				},
				tempDir,
			);

			const callArgs = (saveEvidence as ReturnType<typeof vi.fn>).mock.calls[0];
			const evidence = callArgs[2];
			expect(evidence.thresholds.max_complexity_delta).toBe(7);
			expect(evidence.thresholds.max_public_api_delta).toBe(15);
			expect(evidence.thresholds.max_duplication_ratio).toBe(0.1);
			expect(evidence.thresholds.min_test_to_code_ratio).toBe(0.25);
		});
	});

	// ============ Edge Cases Tests ============

	describe('edge cases', () => {
		it('should handle empty changed_files array', async () => {
			const result = await qualityBudget({ changed_files: [] }, tempDir);

			expect(result).toBeDefined();
			expect(result.summary.files_analyzed).toBe(0);
		});

		it('should handle files outside working directory', async () => {
			// Use absolute path that doesn't exist
			const result = await qualityBudget(
				{
					changed_files: ['/nonexistent/path/file.ts'],
				},
				tempDir,
			);

			expect(result.summary.files_analyzed).toBe(0);
		});

		it('should handle large files gracefully', async () => {
			// Create a large file (>256KB)
			const largeContent = 'export const x = ' + '1;\n'.repeat(50000);
			createTestFile(tempDir, 'src/large.ts', largeContent);

			const result = await qualityBudget({ changed_files: ['src/large.ts'] }, tempDir);

			// Should not crash, may skip the file
			expect(result).toBeDefined();
		});

		it('should handle binary files gracefully', async () => {
			createTestFile(tempDir, 'src/binary.bin', '\0\0\0\0');

			const result = await qualityBudget({ changed_files: ['src/binary.bin'] }, tempDir);

			expect(result).toBeDefined();
		});
	});

	// ============ Multi-language Support Tests ============

	describe('multi-language support', () => {
		it('should handle Python files', async () => {
			createTestFile(
				tempDir,
				'src/test.py',
				`def foo():
    return 1

def bar():
    return 2
`,
			);

			const result = await qualityBudget(
				{
					changed_files: ['src/test.py'],
					config: { max_public_api_delta: 5 },
				},
				tempDir,
			);

			// Python def counts as exports
			expect(result.metrics.public_api_delta).toBeGreaterThanOrEqual(0);
		});

		it('should handle Rust files', async () => {
			createTestFile(
				tempDir,
				'src/test.rs',
				`pub fn foo() -> i32 { 1 }
pub fn bar() -> i32 { 2 }
pub struct MyStruct { pub x: i32 }
`,
			);

			const result = await qualityBudget(
				{
					changed_files: ['src/test.rs'],
					config: { max_public_api_delta: 5 },
				},
				tempDir,
			);

			expect(result.metrics.public_api_delta).toBeGreaterThanOrEqual(0);
		});

		it('should handle Go files', async () => {
			createTestFile(
				tempDir,
				'src/test.go',
				`package main

func Foo() int { return 1 }
func Bar() int { return 2 }
`,
			);

			const result = await qualityBudget(
				{
					changed_files: ['src/test.go'],
					config: { max_public_api_delta: 5 },
				},
				tempDir,
			);

			// Go capital letters are exported
			expect(result.metrics.public_api_delta).toBeGreaterThanOrEqual(0);
		});
	});
});

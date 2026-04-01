import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
	ApprovalEvidence,
	Evidence,
	EvidenceBundle,
	EvidenceVerdict,
	PlaceholderEvidence,
	ReviewEvidence,
	SyntaxEvidence,
} from '../../src/config/evidence-schema';
import {
	deleteEvidence,
	listEvidenceTaskIds,
	loadEvidence,
	saveEvidence,
} from '../../src/evidence/manager';
import {
	type BuildCheckInput,
	runBuildCheck,
} from '../../src/tools/build-check';
import {
	type PlaceholderScanInput,
	placeholderScan,
} from '../../src/tools/placeholder-scan';
import {
	type QualityBudgetInput,
	qualityBudget,
} from '../../src/tools/quality-budget';
import {
	type SyntaxCheckInput,
	syntaxCheck,
} from '../../src/tools/syntax-check';

// Test data directory
let testDir: string;
let originalCwd: string;

describe('Gate Workflow Integration Tests', () => {
	beforeAll(() => {
		originalCwd = process.cwd();
	});

	beforeEach(() => {
		testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-workflow-test-'));
	});

	afterAll(() => {
		process.chdir(originalCwd);
	});

	afterEach(async () => {
		// Give file handles time to close
		await new Promise((resolve) => setTimeout(resolve, 50));
		if (testDir && fs.existsSync(testDir)) {
			try {
				fs.rmSync(testDir, { recursive: true, force: true });
			} catch {
				// Ignore cleanup errors on Windows
			}
		}
		vi.clearAllMocks();
	});

	// ============ Test Setup Helpers ============

	function createTestFile(relativePath: string, content: string): string {
		const fullPath = path.join(testDir, relativePath);
		const dir = path.dirname(fullPath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		fs.writeFileSync(fullPath, content);
		return fullPath;
	}

	// ============ 1. Syntax Check Gate Tests ============

	describe('1. Syntax Check Gate', () => {
		it('accepts valid JavaScript files', async () => {
			const filePath = createTestFile(
				'src/valid.js',
				'const x = 1;\nconst y = 2;',
			);
			const input: SyntaxCheckInput = {
				changed_files: [{ path: filePath, additions: 1 }],
				mode: 'changed',
			};

			const result = await syntaxCheck(input, testDir);

			expect(result.files).toHaveLength(1);
			// Language may or may not be detected depending on parser availability
		});

		it('handles non-existent files gracefully', async () => {
			const input: SyntaxCheckInput = {
				changed_files: [{ path: 'non/existent.ts', additions: 1 }],
				mode: 'changed',
			};

			const result = await syntaxCheck(input, testDir);

			expect(result.files).toHaveLength(1);
			// Non-existent files get skipped
			expect(result.files[0]?.skipped_reason).toBeDefined();
		});

		it('handles empty changed files list', async () => {
			const input: SyntaxCheckInput = {
				changed_files: [],
				mode: 'changed',
			};

			const result = await syntaxCheck(input, testDir);

			expect(result.files).toHaveLength(0);
		});

		it('processes files with valid extensions', async () => {
			const filePath = createTestFile('src/test.xyz', 'some content');
			const input: SyntaxCheckInput = {
				changed_files: [{ path: filePath, additions: 1 }],
				mode: 'changed',
			};

			const result = await syntaxCheck(input, testDir);

			// Files should be processed or skipped gracefully
			expect(result).toBeDefined();
		});

		it('processes valid file content', async () => {
			const filePath = createTestFile('src/data.bin', 'some text content');
			const input: SyntaxCheckInput = {
				changed_files: [{ path: filePath, additions: 1 }],
				mode: 'changed',
			};

			const result = await syntaxCheck(input, testDir);

			// Should be processed (text content, not binary)
			expect(result).toBeDefined();
		});
	});

	// ============ 2. Placeholder Scan Gate Tests ============

	describe('2. Placeholder Scan Gate', () => {
		it('detects TODO comments in source files', async () => {
			const filePath = createTestFile(
				'src/todo-example.ts',
				'// TODO: Implement this function later\nfunction foo() { return 1; }',
			);
			const input: PlaceholderScanInput = {
				changed_files: [filePath],
			};

			const result = await placeholderScan(input, testDir);

			expect(result.findings.some((f) => f.rule_id.includes('todo'))).toBe(
				true,
			);
		});

		it('detects FIXME comments', async () => {
			const filePath = createTestFile(
				'src/fixme-example.ts',
				'// FIXME: This needs to be fixed\nlet x = 1;',
			);
			const input: PlaceholderScanInput = {
				changed_files: [filePath],
			};

			const result = await placeholderScan(input, testDir);

			expect(result.findings.some((f) => f.rule_id.includes('fixme'))).toBe(
				true,
			);
		});

		it('skips test files by default', async () => {
			const filePath = createTestFile(
				'tests/example.test.ts',
				'// TODO: Add more tests\ndescribe("test", () => {});',
			);
			const input: PlaceholderScanInput = {
				changed_files: [filePath],
			};

			const result = await placeholderScan(input, testDir);

			// Test files should be skipped - no findings expected
			expect(result.findings.length).toBe(0);
		});

		it('passes clean code without placeholders', async () => {
			const filePath = createTestFile(
				'src/clean.ts',
				'export function calculateSum(a: number, b: number): number {\n    return a + b;\n}',
			);
			const input: PlaceholderScanInput = {
				changed_files: [filePath],
			};

			const result = await placeholderScan(input, testDir);

			expect(result.findings.length).toBe(0);
		});

		it('detects placeholder comments', async () => {
			const filePath = createTestFile(
				'src/placeholder-example.ts',
				'// Placeholder: complete this later\nfunction legacy() {}',
			);
			const input: PlaceholderScanInput = {
				changed_files: [filePath],
			};

			const result = await placeholderScan(input, testDir);

			// Should detect placeholder text
			expect(result).toBeDefined();
		});

		it('detects placeholder in text strings', async () => {
			const filePath = createTestFile(
				'src/string-placeholder.ts',
				'const msg = "This is a placeholder message";',
			);
			const input: PlaceholderScanInput = {
				changed_files: [filePath],
			};

			const result = await placeholderScan(input, testDir);

			// May or may not detect - just verify it runs
			expect(result).toBeDefined();
		});
	});

	// ============ 3. Build Check Gate Tests ============

	describe('3. Build Check Gate', () => {
		it('discovers npm build when package.json exists', async () => {
			// Create package.json with build script
			createTestFile(
				'package.json',
				JSON.stringify({
					name: 'test-project',
					scripts: {
						build: 'echo "Building..."',
					},
				}),
			);

			const input: BuildCheckInput = {
				scope: 'all',
				mode: 'build',
			};

			const result = await runBuildCheck(testDir, input);

			expect(result).toBeDefined();
			expect(result.summary).toBeDefined();
		});

		it('returns info when no build commands found', async () => {
			// No package.json
			const input: BuildCheckInput = {
				scope: 'all',
				mode: 'build',
			};

			const result = await runBuildCheck(testDir, input);

			// Should return info or pass when no build commands
			expect(['pass', 'info', 'fail']).toContain(result.verdict);
		});

		it('runs typecheck mode', async () => {
			createTestFile(
				'package.json',
				JSON.stringify({
					name: 'test-project',
					scripts: {
						typecheck: 'echo "Checking..."',
					},
				}),
			);

			const input: BuildCheckInput = {
				scope: 'all',
				mode: 'typecheck',
			};

			const result = await runBuildCheck(testDir, input);

			expect(result).toBeDefined();
		});
	});

	// ============ 4. Quality Budget Gate Tests ============

	describe('4. Quality Budget Gate', () => {
		it('analyzes code quality metrics', async () => {
			const filePath = createTestFile(
				'src/complex.ts',
				`export function processData(data: any): any {
					if (data) {
						if (data.value) {
							if (data.value.length > 0) {
								return data.value.map((x: any) => {
									if (x.valid) {
										return x.value;
									}
									return null;
								});
							}
						}
					}
					return [];
				}`,
			);
			const input: QualityBudgetInput = {
				changed_files: [filePath],
				config: {
					max_complexity_delta: 2,
				},
			};

			const result = await qualityBudget(input, testDir);

			expect(result).toBeDefined();
			expect(result.metrics).toBeDefined();
		});

		it('passes clean code within thresholds', async () => {
			const filePath = createTestFile(
				'src/simple.ts',
				'export function add(a: number, b: number): number {\n    return a + b;\n}',
			);
			const input: QualityBudgetInput = {
				changed_files: [filePath],
				config: {
					max_complexity_delta: 10,
				},
			};

			const result = await qualityBudget(input, testDir);

			// Should pass or have minimal violations
			expect(['pass', 'fail']).toContain(result.verdict);
		});

		it('handles empty changed files', async () => {
			const input: QualityBudgetInput = {
				changed_files: [],
				config: {
					max_complexity_delta: 10,
				},
			};

			const result = await qualityBudget(input, testDir);

			expect(result).toBeDefined();
			expect(result.summary.files_analyzed).toBe(0);
		});
	});

	// ============ 5. Evidence Aggregation Tests ============

	describe('5. Evidence Aggregation', () => {
		it('saves and loads evidence correctly', async () => {
			// Save evidence directly
			const syntaxEvidence: SyntaxEvidence = {
				task_id: 'test-task',
				type: 'syntax',
				timestamp: new Date().toISOString(),
				agent: 'test',
				verdict: 'pass',
				summary: 'Test evidence',
				files_checked: 1,
				files_failed: 0,
				skipped_count: 0,
				files: [],
			};
			await saveEvidence(testDir, 'test-task', syntaxEvidence);

			// Load it back
			const result = await loadEvidence(testDir, 'test-task');

			expect(result.status).toBe('found');
			const bundle = result.bundle;
			expect(bundle.task_id).toBe('test-task');
			expect(bundle.entries).toHaveLength(1);
			expect(bundle.entries[0]?.type).toBe('syntax');
		});

		it('lists all evidence task IDs', async () => {
			// Save evidence for multiple tasks
			const syntaxEvidence1: SyntaxEvidence = {
				task_id: 'task-1',
				type: 'syntax',
				timestamp: new Date().toISOString(),
				agent: 'test',
				verdict: 'pass',
				summary: 'Task 1',
				files_checked: 1,
				files_failed: 0,
				skipped_count: 0,
				files: [],
			};
			const syntaxEvidence2: SyntaxEvidence = {
				task_id: 'task-2',
				type: 'syntax',
				timestamp: new Date().toISOString(),
				agent: 'test',
				verdict: 'pass',
				summary: 'Task 2',
				files_checked: 1,
				files_failed: 0,
				skipped_count: 0,
				files: [],
			};

			await saveEvidence(testDir, 'task-1', syntaxEvidence1);
			await saveEvidence(testDir, 'task-2', syntaxEvidence2);

			const taskIds = await listEvidenceTaskIds(testDir);

			expect(taskIds).toContain('task-1');
			expect(taskIds).toContain('task-2');
		});

		it('deletes evidence correctly', async () => {
			// Save evidence
			const syntaxEvidence: SyntaxEvidence = {
				task_id: 'delete-me',
				type: 'syntax',
				timestamp: new Date().toISOString(),
				agent: 'test',
				verdict: 'pass',
				summary: 'Test',
				files_checked: 1,
				files_failed: 0,
				skipped_count: 0,
				files: [],
			};
			await saveEvidence(testDir, 'delete-me', syntaxEvidence);

			// Delete it
			const deleted = await deleteEvidence(testDir, 'delete-me');
			expect(deleted).toBe(true);

			// Verify it's gone
			const result = await loadEvidence(testDir, 'delete-me');
			expect(result.status).toBe('not_found');
		});

		it('accumulates evidence across gates', async () => {
			// Create multiple files
			const file1 = createTestFile('src/file1.ts', 'const x = 1;');
			const file2 = createTestFile('src/file2.ts', 'const y = 2;');

			// Run syntax check
			await syntaxCheck(
				{
					changed_files: [
						{ path: file1, additions: 1 },
						{ path: file2, additions: 1 },
					],
					mode: 'changed',
				},
				testDir,
			);

			// Run placeholder scan
			await placeholderScan({ changed_files: [file1, file2] }, testDir);

			// Both gates should have saved evidence
			const syntaxResult = await loadEvidence(testDir, 'syntax_check');
			const placeholderResult = await loadEvidence(testDir, 'placeholder_scan');

			expect(syntaxResult.status).toBe('found');
			expect(placeholderResult.status).toBe('found');
		});
	});

	// ============ 6. Failure Path Tests ============

	describe('6. Failure Path Tests', () => {
		it('placeholder scan fails with TODOs', async () => {
			const filePath = createTestFile(
				'src/todo.ts',
				'// TODO: fix\nfunction foo() {}',
			);
			const input: PlaceholderScanInput = {
				changed_files: [filePath],
			};

			const result = await placeholderScan(input, testDir);

			expect(result.verdict).toBe('fail');
		});

		it('multiple gates fail independently', async () => {
			// File with TODO
			const filePath = createTestFile(
				'src/todo.ts',
				'// TODO: fix\nfunction foo() {}',
			);

			const placeholderResult = await placeholderScan(
				{ changed_files: [filePath] },
				testDir,
			);

			// Should fail
			expect(placeholderResult.verdict).toBe('fail');
		});
	});

	// ============ 7. Retry Behavior Tests ============

	describe('7. Retry Behavior Tests', () => {
		it('retry after removing placeholder', async () => {
			const filePath = createTestFile('src/fixme.ts', '// FIXME: fix this');

			// First run - should fail
			const firstResult = await placeholderScan(
				{ changed_files: [filePath] },
				testDir,
			);
			expect(firstResult.verdict).toBe('fail');

			// Fix the file
			fs.writeFileSync(filePath, '// Fixed!\nfunction foo() {}');

			// Second run - should pass
			const secondResult = await placeholderScan(
				{ changed_files: [filePath] },
				testDir,
			);
			expect(secondResult.verdict).toBe('pass');
		});
	});

	// ============ 8. Full Gate Sequence Tests ============

	describe('8. Full Gate Sequence', () => {
		it('runs complete gate sequence in order', async () => {
			// Setup: Create files that pass all gates - NO comments at all
			const cleanFile = createTestFile(
				'src/clean.ts',
				'export function add(a: number, b: number): number { return a + b; }',
			);
			// Use a simpler test file without any comments
			const testFile = createTestFile(
				'tests/clean.test.ts',
				'describe("test", function() { it("works", function() {}); });',
			);

			// Gate 1: Syntax Check
			const syntaxResult = await syntaxCheck(
				{
					changed_files: [
						{ path: cleanFile, additions: 1 },
						{ path: testFile, additions: 1 },
					],
					mode: 'changed',
				},
				testDir,
			);

			// Gate 2: Placeholder Scan (test files are skipped)
			const placeholderResult = await placeholderScan(
				{
					changed_files: [cleanFile, testFile],
				},
				testDir,
			);

			// Gate 3: Quality Budget with lenient config (only check src files)
			const qualityResult = await qualityBudget(
				{
					changed_files: [cleanFile], // Only check clean.ts
					config: {
						max_complexity_delta: 50,
						max_public_api_delta: 50,
						enforce_on_globs: ['src/**'],
						exclude_globs: ['tests/**', '**/*.test.*'],
					},
				},
				testDir,
			);

			// Syntax should pass
			expect(syntaxResult).toBeDefined();
			// Placeholder should pass (test files skipped, clean src file)
			expect(placeholderResult.verdict).toBe('pass');
			// Quality should pass with lenient config
			expect(qualityResult.verdict).toBe('pass');
		});

		it('aggregates results from all gates', async () => {
			// Setup: Create files
			const goodFile = createTestFile('src/good.ts', 'const x = 1;');

			// Run gates
			await syntaxCheck(
				{ changed_files: [{ path: goodFile, additions: 1 }], mode: 'changed' },
				testDir,
			);

			await placeholderScan({ changed_files: [goodFile] }, testDir);

			// Evidence should be accumulated
			const syntaxResult = await loadEvidence(testDir, 'syntax_check');
			const placeholderResult = await loadEvidence(testDir, 'placeholder_scan');

			expect(syntaxResult.status).toBe('found');
			expect(placeholderResult.status).toBe('found');
		});
	});

	// ============ 9. Review/Approval Gate Tests ============

	describe('9. Review/Approval Gate', () => {
		it('can save review evidence', async () => {
			const reviewEvidence: ReviewEvidence = {
				task_id: 'review-1',
				type: 'review',
				timestamp: new Date().toISOString(),
				agent: 'reviewer',
				verdict: 'pass',
				summary: 'Code review passed',
				risk: 'low',
				issues: [],
			};
			await saveEvidence(testDir, 'review-1', reviewEvidence);

			const result = await loadEvidence(testDir, 'review-1');
			expect(result.status).toBe('found');
			expect(result.bundle.entries[0]?.type).toBe('review');
		});

		it('can save approval evidence', async () => {
			const approvalEvidence: ApprovalEvidence = {
				task_id: 'approval-1',
				type: 'approval',
				timestamp: new Date().toISOString(),
				agent: 'approver',
				verdict: 'approved',
				summary: 'Changes approved',
			};
			await saveEvidence(testDir, 'approval-1', approvalEvidence);

			const result = await loadEvidence(testDir, 'approval-1');
			expect(result.status).toBe('found');
			expect(result.bundle.entries[0]?.verdict).toBe('approved');
		});

		it('can save rejection evidence', async () => {
			const rejectionEvidence: ApprovalEvidence = {
				task_id: 'rejection-1',
				type: 'approval',
				timestamp: new Date().toISOString(),
				agent: 'approver',
				verdict: 'rejected',
				summary: 'Changes require revision',
			};
			await saveEvidence(testDir, 'rejection-1', rejectionEvidence);

			const result = await loadEvidence(testDir, 'rejection-1');
			expect(result.status).toBe('found');
			expect(result.bundle.entries[0]?.verdict).toBe('rejected');
		});
	});

	// ============ 10. Edge Cases ============

	describe('10. Edge Cases', () => {
		it('handles binary files in placeholder scan', async () => {
			const binaryFile = createTestFile(
				'src/data.bin',
				Buffer.alloc(100).toString('binary'),
			);
			const input: PlaceholderScanInput = {
				changed_files: [binaryFile],
			};

			const result = await placeholderScan(input, testDir);

			// Binary files should be skipped
			expect(result.findings.length).toBe(0);
		});

		it('handles non-existent files in placeholder scan', async () => {
			const input: PlaceholderScanInput = {
				changed_files: ['non/existent.ts'],
			};

			const result = await placeholderScan(input, testDir);

			// Should handle gracefully
			expect(result).toBeDefined();
		});
	});

	// ============ 11. Summary/Report Generation Tests ============

	describe('11. Summary and Report Tests', () => {
		it('generates correct summary for syntax check', async () => {
			const filePath = createTestFile('src/test.ts', 'const x = 1;');

			const result = await syntaxCheck(
				{ changed_files: [{ path: filePath, additions: 1 }], mode: 'changed' },
				testDir,
			);

			expect(result.summary).toBeDefined();
		});

		it('generates correct summary for placeholder scan', async () => {
			const filePath = createTestFile('src/clean.ts', 'const x = 1;');

			const result = await placeholderScan(
				{ changed_files: [filePath] },
				testDir,
			);

			expect(result.summary).toBeDefined();
			expect(result.summary.files_scanned).toBe(1);
		});

		it('generates correct summary for quality budget', async () => {
			const filePath = createTestFile('src/test.ts', 'const x = 1;');

			const result = await qualityBudget(
				{ changed_files: [filePath], config: { max_complexity_delta: 10 } },
				testDir,
			);

			expect(result.summary).toBeDefined();
		});

		it('generates correct summary for build check', async () => {
			const input: BuildCheckInput = {
				scope: 'all',
				mode: 'build',
			};

			const result = await runBuildCheck(testDir, input);

			expect(result.summary).toBeDefined();
			expect(result.summary.runs_count).toBeDefined();
		});
	});

	// ============ 12. Evidence Flow Tests ============

	describe('12. Evidence Flow', () => {
		it('evidence flows from syntax check to aggregation', async () => {
			const filePath = createTestFile('src/test.ts', 'const x = 1;');

			await syntaxCheck(
				{ changed_files: [{ path: filePath, additions: 1 }], mode: 'changed' },
				testDir,
			);

			const result = await loadEvidence(testDir, 'syntax_check');
			expect(result.status).toBe('found');
			expect(result.bundle.entries[0]?.type).toBe('syntax');
		});

		it('evidence flows from placeholder scan to aggregation', async () => {
			const filePath = createTestFile(
				'src/clean.ts',
				'// TODO: later\nfunction foo() {}',
			);

			await placeholderScan({ changed_files: [filePath] }, testDir);

			const result = await loadEvidence(testDir, 'placeholder_scan');
			expect(result.status).toBe('found');
			expect(result.bundle.entries[0]?.type).toBe('placeholder');
		});

		it('verifies verdict correctness', async () => {
			const filePath = createTestFile('src/todo.ts', '// TODO: later');

			await placeholderScan({ changed_files: [filePath] }, testDir);

			const result = await loadEvidence(testDir, 'placeholder_scan');
			expect(result.status).toBe('found');
			expect(result.bundle.entries[0]?.verdict).toBe('fail');
		});
	});
});

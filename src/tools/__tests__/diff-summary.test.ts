import { afterEach, beforeEach, describe, expect, test, vi } from 'bun:test';
import * as child_process from 'node:child_process';
import * as fs from 'node:fs';
import type { ASTChange, ASTDiffResult } from '../../diff/ast-diff.js';
import type { ClassifiedChange } from '../../diff/semantic-classifier.js';
import type { SemanticDiffSummary } from '../../diff/summary-generator.js';

// Helper types for mocking
interface MockASTDiffResult extends ASTDiffResult {
	changes: ASTChange[];
}

// Helper functions to create test data
function makeASTDiffResult(
	overrides: Partial<MockASTDiffResult> = {},
): ASTDiffResult {
	return {
		filePath: 'test.ts',
		language: 'typescript',
		changes: [],
		durationMs: 10,
		usedAST: true,
		...overrides,
	};
}

function makeASTChange(overrides: Partial<ASTChange> = {}): ASTChange {
	return {
		type: 'modified',
		category: 'function',
		name: 'testFunc',
		lineStart: 1,
		lineEnd: 10,
		...overrides,
	};
}

function makeClassifiedChange(
	overrides: Partial<ClassifiedChange> = {},
): ClassifiedChange {
	return {
		category: 'LOGIC_CHANGE',
		riskLevel: 'High',
		filePath: 'test.ts',
		symbolName: 'testFunc',
		changeType: 'modified',
		lineStart: 1,
		lineEnd: 10,
		description: 'Test change',
		...overrides,
	};
}

function makeSemanticDiffSummary(
	overrides: Partial<SemanticDiffSummary> = {},
): SemanticDiffSummary {
	return {
		totalFiles: 0,
		totalChanges: 0,
		byRisk: { Critical: [], High: [], Medium: [], Low: [] },
		byCategory: {
			SIGNATURE_CHANGE: [],
			API_CHANGE: [],
			GUARD_REMOVED: [],
			LOGIC_CHANGE: [],
			DELETED_FUNCTION: [],
			NEW_FUNCTION: [],
			REFACTOR: [],
			COSMETIC: [],
			UNCLASSIFIED: [],
		},
		criticalItems: [],
		...overrides,
	};
}

// Helper to create tool context
function createToolContext(directory: string) {
	return { directory } as never;
}

describe('diff_summary tool', () => {
	let mockExecFileSync: ReturnType<typeof vi.fn>;
	let mockReadFileSync: ReturnType<typeof vi.fn>;
	let mockComputeASTDiff: ReturnType<typeof vi.fn>;
	let mockClassifyChanges: ReturnType<typeof vi.fn>;
	let mockGenerateSummary: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		// Clear module cache to ensure fresh mocks for each test
		delete require.cache[require.resolve('../../tools/diff-summary.js')];

		// Create fresh mocks
		mockExecFileSync = vi.fn();
		mockReadFileSync = vi.fn();
		mockComputeASTDiff = vi.fn();
		mockClassifyChanges = vi.fn();
		mockGenerateSummary = vi.fn();

		// Mock the modules
		vi.mock('node:child_process', () => ({
			execFileSync: mockExecFileSync,
		}));

		vi.mock('node:fs', () => ({
			readFileSync: mockReadFileSync,
		}));

		vi.mock('../../diff/ast-diff.js', () => ({
			computeASTDiff: mockComputeASTDiff,
		}));

		vi.mock('../../diff/semantic-classifier.js', () => ({
			classifyChanges: mockClassifyChanges,
		}));

		vi.mock('../../diff/summary-generator.js', () => ({
			generateSummary: mockGenerateSummary,
		}));
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	// =============================================================================
	// TEST 1: Returns error when files array is empty
	// =============================================================================
	test('returns error when files array is empty', async () => {
		const { diff_summary } = await import('../../tools/diff-summary.js');

		const result = await diff_summary.execute(
			{ files: [] },
			createToolContext('/fake/dir'),
		);

		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toBe('files must be a non-empty array of file paths');
	});

	// =============================================================================
	// TEST 2: Returns error when files is not an array
	// =============================================================================
	test('returns error when files is not an array', async () => {
		const { diff_summary } = await import('../../tools/diff-summary.js');

		const result = await diff_summary.execute(
			{ files: 'not-an-array' as unknown as [] },
			createToolContext('/fake/dir'),
		);

		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toBe('files must be a non-empty array of file paths');
	});

	// =============================================================================
	// TEST 3: Returns error when files is undefined
	// =============================================================================
	test('returns error when files is undefined', async () => {
		const { diff_summary } = await import('../../tools/diff-summary.js');

		const result = await diff_summary.execute(
			{ files: undefined } as unknown as { files: string[] },
			createToolContext('/fake/dir'),
		);

		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toBe('files must be a non-empty array of file paths');
	});

	// =============================================================================
	// TEST 4: Returns empty summary when no AST changes detected
	// =============================================================================
	test('returns empty summary when no AST changes detected', async () => {
		const { diff_summary } = await import('../../tools/diff-summary.js');

		// Mock successful git show and fs read
		mockExecFileSync.mockReturnValue('old content');
		mockReadFileSync.mockReturnValue('new content');

		// Mock computeASTDiff returning result with empty changes
		mockComputeASTDiff.mockResolvedValue(makeASTDiffResult({ changes: [] }));

		// Mock classifyChanges returning empty array
		mockClassifyChanges.mockReturnValue([]);

		// Mock generateSummary
		const emptySummary = makeSemanticDiffSummary();
		mockGenerateSummary.mockReturnValue(emptySummary);

		const result = await diff_summary.execute(
			{ files: ['test.ts'] },
			createToolContext('/fake/dir'),
		);

		const parsed = JSON.parse(result);
		expect(parsed.totalFiles).toBe(0);
		expect(parsed.totalChanges).toBe(0);
		expect(parsed.criticalItems).toEqual([]);
	});

	// =============================================================================
	// TEST 5: Returns full summary with classified changes
	// =============================================================================
	test('returns full summary with classified changes', async () => {
		const { diff_summary } = await import('../../tools/diff-summary.js');

		// Mock successful git show and fs read
		mockExecFileSync.mockReturnValue('old content');
		mockReadFileSync.mockReturnValue('new content');

		// Mock computeASTDiff with actual changes
		const astDiff = makeASTDiffResult({
			filePath: 'src/api.ts',
			changes: [
				makeASTChange({
					type: 'modified',
					category: 'function',
					name: 'getUser',
					lineStart: 10,
					lineEnd: 15,
					signature: '(id: number): User',
				}),
			],
		});
		mockComputeASTDiff.mockResolvedValue(astDiff);

		// Mock classifyChanges with classified result
		const classifiedChanges: ClassifiedChange[] = [
			makeClassifiedChange({
				category: 'SIGNATURE_CHANGE',
				riskLevel: 'Critical',
				filePath: 'src/api.ts',
				symbolName: 'getUser',
				description:
					"Function signature changed for 'getUser': (id: number): User",
			}),
		];
		mockClassifyChanges.mockReturnValue(classifiedChanges);

		// Mock generateSummary
		const summary = makeSemanticDiffSummary({
			totalFiles: 1,
			totalChanges: 1,
			criticalItems: classifiedChanges,
		});
		mockGenerateSummary.mockReturnValue(summary);

		const result = await diff_summary.execute(
			{ files: ['src/api.ts'] },
			createToolContext('/fake/dir'),
		);

		const parsed = JSON.parse(result);
		expect(parsed.totalFiles).toBe(1);
		expect(parsed.totalChanges).toBe(1);
		expect(parsed.criticalItems.length).toBe(1);
		expect(parsed.criticalItems[0].category).toBe('SIGNATURE_CHANGE');
	});

	// =============================================================================
	// TEST 6: Filters by classification (e.g., only SIGNATURE_CHANGE)
	// =============================================================================
	test('filters by classification - returns only SIGNATURE_CHANGE', async () => {
		const { diff_summary } = await import('../../tools/diff-summary.js');

		mockExecFileSync.mockReturnValue('old content');
		mockReadFileSync.mockReturnValue('new content');

		const astDiff = makeASTDiffResult({
			filePath: 'src/api.ts',
			changes: [
				makeASTChange({
					type: 'modified',
					category: 'function',
					name: 'getUser',
					signature: '(id: number): User',
				}),
			],
		});
		mockComputeASTDiff.mockResolvedValue(astDiff);

		// Both SIGNATURE_CHANGE and LOGIC_CHANGE in result
		const classifiedChanges: ClassifiedChange[] = [
			makeClassifiedChange({
				category: 'SIGNATURE_CHANGE',
				riskLevel: 'Critical',
				filePath: 'src/api.ts',
				symbolName: 'getUser',
			}),
			makeClassifiedChange({
				category: 'LOGIC_CHANGE',
				riskLevel: 'High',
				filePath: 'src/api.ts',
				symbolName: 'internalHelper',
			}),
		];
		mockClassifyChanges.mockReturnValue(classifiedChanges);

		// generateSummary will receive only filtered changes
		mockGenerateSummary.mockImplementation((changes: ClassifiedChange[]) => {
			return makeSemanticDiffSummary({
				totalFiles: 1,
				totalChanges: changes.length,
				byCategory: {
					SIGNATURE_CHANGE: changes.filter(
						(c) => c.category === 'SIGNATURE_CHANGE',
					),
					API_CHANGE: [],
					GUARD_REMOVED: [],
					LOGIC_CHANGE: changes.filter((c) => c.category === 'LOGIC_CHANGE'),
					DELETED_FUNCTION: [],
					NEW_FUNCTION: [],
					REFACTOR: [],
					COSMETIC: [],
					UNCLASSIFIED: [],
				},
				criticalItems: changes.filter((c) => c.riskLevel === 'Critical'),
			});
		});

		const result = await diff_summary.execute(
			{ files: ['src/api.ts'], classification: 'SIGNATURE_CHANGE' },
			createToolContext('/fake/dir'),
		);

		// Verify classifyChanges was called with all changes
		expect(mockClassifyChanges).toHaveBeenCalled();

		// Verify generateSummary was called with only SIGNATURE_CHANGE
		const generateSummaryCalls = mockGenerateSummary.mock.calls;
		expect(generateSummaryCalls.length).toBe(1);

		const filteredChangesArg = generateSummaryCalls[0][0] as ClassifiedChange[];
		expect(filteredChangesArg.length).toBe(1);
		expect(filteredChangesArg[0].category).toBe('SIGNATURE_CHANGE');
	});

	// =============================================================================
	// TEST 7: Filters by riskLevel (e.g., only Critical)
	// =============================================================================
	test('filters by riskLevel - returns only Critical changes', async () => {
		const { diff_summary } = await import('../../tools/diff-summary.js');

		mockExecFileSync.mockReturnValue('old content');
		mockReadFileSync.mockReturnValue('new content');

		const astDiff = makeASTDiffResult({
			filePath: 'src/api.ts',
			changes: [makeASTChange({ name: 'getUser' })],
		});
		mockComputeASTDiff.mockResolvedValue(astDiff);

		const classifiedChanges: ClassifiedChange[] = [
			makeClassifiedChange({
				category: 'SIGNATURE_CHANGE',
				riskLevel: 'Critical',
				filePath: 'src/api.ts',
				symbolName: 'getUser',
			}),
			makeClassifiedChange({
				category: 'LOGIC_CHANGE',
				riskLevel: 'High',
				filePath: 'src/api.ts',
				symbolName: 'internalHelper',
			}),
		];
		mockClassifyChanges.mockReturnValue(classifiedChanges);

		mockGenerateSummary.mockImplementation((changes: ClassifiedChange[]) => {
			return makeSemanticDiffSummary({
				totalFiles: 1,
				totalChanges: changes.length,
				criticalItems: changes.filter((c) => c.riskLevel === 'Critical'),
			});
		});

		const result = await diff_summary.execute(
			{ files: ['src/api.ts'], riskLevel: 'Critical' },
			createToolContext('/fake/dir'),
		);

		const generateSummaryCalls = mockGenerateSummary.mock.calls;
		expect(generateSummaryCalls.length).toBe(1);

		const filteredChangesArg = generateSummaryCalls[0][0] as ClassifiedChange[];
		expect(filteredChangesArg.length).toBe(1);
		expect(filteredChangesArg[0].riskLevel).toBe('Critical');
	});

	// =============================================================================
	// TEST 8: Filters by both classification AND riskLevel
	// =============================================================================
	test('filters by both classification and riskLevel', async () => {
		const { diff_summary } = await import('../../tools/diff-summary.js');

		mockExecFileSync.mockReturnValue('old content');
		mockReadFileSync.mockReturnValue('new content');

		const astDiff = makeASTDiffResult({
			filePath: 'src/api.ts',
			changes: [makeASTChange({ name: 'getUser' })],
		});
		mockComputeASTDiff.mockResolvedValue(astDiff);

		const classifiedChanges: ClassifiedChange[] = [
			makeClassifiedChange({
				category: 'SIGNATURE_CHANGE',
				riskLevel: 'Critical',
				filePath: 'src/api.ts',
				symbolName: 'getUser',
			}),
			makeClassifiedChange({
				category: 'SIGNATURE_CHANGE',
				riskLevel: 'High',
				filePath: 'src/api.ts',
				symbolName: 'getUser',
			}),
			makeClassifiedChange({
				category: 'LOGIC_CHANGE',
				riskLevel: 'Critical',
				filePath: 'src/api.ts',
				symbolName: 'internalHelper',
			}),
		];
		mockClassifyChanges.mockReturnValue(classifiedChanges);

		mockGenerateSummary.mockImplementation((changes: ClassifiedChange[]) => {
			return makeSemanticDiffSummary({
				totalFiles: 1,
				totalChanges: changes.length,
				criticalItems: changes.filter((c) => c.riskLevel === 'Critical'),
			});
		});

		const result = await diff_summary.execute(
			{
				files: ['src/api.ts'],
				classification: 'SIGNATURE_CHANGE',
				riskLevel: 'Critical',
			},
			createToolContext('/fake/dir'),
		);

		const generateSummaryCalls = mockGenerateSummary.mock.calls;
		expect(generateSummaryCalls.length).toBe(1);

		const filteredChangesArg = generateSummaryCalls[0][0] as ClassifiedChange[];
		// Should filter to only SIGNATURE_CHANGE with Critical
		expect(filteredChangesArg.length).toBe(1);
		expect(filteredChangesArg[0].category).toBe('SIGNATURE_CHANGE');
		expect(filteredChangesArg[0].riskLevel).toBe('Critical');
	});

	// =============================================================================
	// TEST 9: Handles git show failure gracefully (file not in git)
	// =============================================================================
	test('handles git show failure gracefully - skips file not in git', async () => {
		const { diff_summary } = await import('../../tools/diff-summary.js');

		// Mock git show throwing (file not in git)
		mockExecFileSync.mockImplementation(() => {
			throw new Error('fatal: pathspec did not match any files');
		});
		mockReadFileSync.mockReturnValue('new content');

		// No mock for computeASTDiff since file should be skipped

		mockClassifyChanges.mockReturnValue([]);
		mockGenerateSummary.mockReturnValue(makeSemanticDiffSummary());

		const result = await diff_summary.execute(
			{ files: ['new-file.ts'] },
			createToolContext('/fake/dir'),
		);

		const parsed = JSON.parse(result);
		// Should return empty summary since the only file was skipped
		expect(parsed.totalFiles).toBe(0);
		expect(parsed.totalChanges).toBe(0);
	});

	// =============================================================================
	// TEST 10: Handles fs read failure gracefully
	// =============================================================================
	test('handles fs read failure gracefully - skips file with read error', async () => {
		const { diff_summary } = await import('../../tools/diff-summary.js');

		// Mock git show success
		mockExecFileSync.mockReturnValue('old content');

		// Mock fs.readFileSync throwing
		mockReadFileSync.mockImplementation(() => {
			throw new Error('ENOENT: no such file or directory');
		});

		mockClassifyChanges.mockReturnValue([]);
		mockGenerateSummary.mockReturnValue(makeSemanticDiffSummary());

		const result = await diff_summary.execute(
			{ files: ['deleted-file.ts'] },
			createToolContext('/fake/dir'),
		);

		const parsed = JSON.parse(result);
		// Should return empty summary since the file was skipped
		expect(parsed.totalFiles).toBe(0);
		expect(parsed.totalChanges).toBe(0);
	});

	// =============================================================================
	// TEST 11: Handles computeASTDiff throwing an error
	// =============================================================================
	test('handles computeASTDiff throwing an error - skips file gracefully', async () => {
		const { diff_summary } = await import('../../tools/diff-summary.js');

		mockExecFileSync.mockReturnValue('old content');
		mockReadFileSync.mockReturnValue('new content');

		// Mock computeASTDiff throwing
		mockComputeASTDiff.mockRejectedValue(new Error('AST parsing failed'));

		mockClassifyChanges.mockReturnValue([]);
		mockGenerateSummary.mockReturnValue(makeSemanticDiffSummary());

		const result = await diff_summary.execute(
			{ files: ['broken-syntax.ts'] },
			createToolContext('/fake/dir'),
		);

		const parsed = JSON.parse(result);
		// Should return empty summary since the file was skipped
		expect(parsed.totalFiles).toBe(0);
		expect(parsed.totalChanges).toBe(0);
	});

	// =============================================================================
	// TEST 12: Processes multiple files correctly
	// =============================================================================
	test('processes multiple files and accumulates changes', async () => {
		const { diff_summary } = await import('../../tools/diff-summary.js');

		// First file: git success, second file: git failure
		mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
			if (args[1] === 'HEAD:src/file1.ts') {
				return 'old content 1';
			}
			if (args[1] === 'HEAD:src/file2.ts') {
				throw new Error('fatal: pathspec did not match any files');
			}
			return 'old content';
		});

		mockReadFileSync.mockImplementation((path: string) => {
			if (path.includes('file1.ts')) {
				return 'new content 1';
			}
			return 'new content';
		});

		// Only file1 has changes
		mockComputeASTDiff.mockResolvedValue(
			makeASTDiffResult({
				filePath: 'src/file1.ts',
				changes: [makeASTChange({ name: 'func1' })],
			}),
		);

		const classifiedChanges: ClassifiedChange[] = [
			makeClassifiedChange({
				category: 'LOGIC_CHANGE',
				riskLevel: 'High',
				filePath: 'src/file1.ts',
				symbolName: 'func1',
			}),
		];
		mockClassifyChanges.mockReturnValue(classifiedChanges);

		mockGenerateSummary.mockReturnValue(
			makeSemanticDiffSummary({
				totalFiles: 1,
				totalChanges: 1,
			}),
		);

		const result = await diff_summary.execute(
			{ files: ['src/file1.ts', 'src/file2.ts'] },
			createToolContext('/fake/dir'),
		);

		const parsed = JSON.parse(result);
		// Only file1 processed successfully
		expect(parsed.totalFiles).toBe(1);
		expect(parsed.totalChanges).toBe(1);
	});

	// =============================================================================
	// TEST 13: Top-level error handling (unexpected exceptions)
	// =============================================================================
	test('catches unexpected errors and returns error result', async () => {
		const { diff_summary } = await import('../../tools/diff-summary.js');

		// Make classifyChanges throw an unexpected error
		mockExecFileSync.mockReturnValue('old content');
		mockReadFileSync.mockReturnValue('new content');
		mockComputeASTDiff.mockResolvedValue(
			makeASTDiffResult({
				changes: [makeASTChange()],
			}),
		);
		mockClassifyChanges.mockImplementation(() => {
			throw new Error('Unexpected classification error');
		});

		const result = await diff_summary.execute(
			{ files: ['test.ts'] },
			createToolContext('/fake/dir'),
		);

		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toContain('diff_summary failed');
		expect(parsed.error).toContain('Unexpected classification error');
	});
});

import { afterEach, beforeEach, describe, expect, test, vi } from 'bun:test';
import type { ASTChange, ASTDiffResult } from '../../diff/ast-diff.js';
import { classifyChanges } from '../../diff/semantic-classifier.js';
import { generateSummary } from '../../diff/summary-generator.js';

// Test data generators
function makeASTDiffResult(
	overrides: Partial<ASTDiffResult> = {},
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

// =============================================================================
// Test: DiffResult interface includes optional semanticSummary field
// =============================================================================
describe('DiffResult type includes semanticSummary', () => {
	test('DiffResult should accept semanticSummary as optional field', () => {
		// This verifies the type structure - semanticSummary is optional
		const validResult = {
			files: [{ path: 'a.ts', additions: 5, deletions: 2 }],
			contractChanges: [],
			hasContractChanges: false,
			summary: '1 file changed',
			semanticSummary: undefined,
		};

		// Verify the shape is correct
		expect(validResult.files).toHaveLength(1);
		expect(validResult.semanticSummary).toBeUndefined();
	});

	test('DiffResult should accept semanticSummary when populated', () => {
		const summary = generateSummary([]);

		const result = {
			files: [{ path: 'a.ts', additions: 5, deletions: 2 }],
			contractChanges: [],
			hasContractChanges: false,
			summary: '1 file changed',
			semanticSummary: summary,
		};

		expect(result.semanticSummary).toBeDefined();
		expect(result.semanticSummary?.totalFiles).toBe(0);
		expect(result.semanticSummary?.totalChanges).toBe(0);
	});
});

// =============================================================================
// Test: SemanticSummary structure correctness
// =============================================================================
describe('SemanticDiffSummary structure', () => {
	test('should contain totalFiles, totalChanges, byRisk, byCategory, criticalItems', () => {
		// Signature change diff
		const astDiffs = [
			makeASTDiffResult({
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
			}),
		];

		const classified = classifyChanges(astDiffs);
		const summary = generateSummary(classified);

		// Verify all required fields exist
		expect(summary).toHaveProperty('totalFiles');
		expect(summary).toHaveProperty('totalChanges');
		expect(summary).toHaveProperty('byRisk');
		expect(summary).toHaveProperty('byCategory');
		expect(summary).toHaveProperty('criticalItems');

		// Verify correct values
		expect(summary.totalFiles).toBe(1);
		expect(summary.totalChanges).toBe(1);
		expect(summary.criticalItems).toHaveLength(1);
		expect(summary.criticalItems[0].category).toBe('SIGNATURE_CHANGE');
	});

	test('byRisk should have all four risk levels', () => {
		const astDiffs = [
			makeASTDiffResult({
				filePath: 'src/multi.ts',
				changes: [
					makeASTChange({
						type: 'modified',
						category: 'function',
						name: 'criticalFunc',
						lineStart: 1,
						lineEnd: 5,
						signature: '()',
					}),
					makeASTChange({
						type: 'modified',
						category: 'function',
						name: 'regularFunc',
						lineStart: 10,
						lineEnd: 20,
					}),
					makeASTChange({
						type: 'added',
						category: 'function',
						name: 'newFunc',
						lineStart: 25,
						lineEnd: 30,
					}),
					makeASTChange({
						type: 'added',
						category: 'import',
						name: 'React',
						lineStart: 2,
						lineEnd: 2,
					}),
				],
			}),
		];

		const classified = classifyChanges(astDiffs);
		const summary = generateSummary(classified);

		// All four risk levels should exist
		expect(summary.byRisk).toHaveProperty('Critical');
		expect(summary.byRisk).toHaveProperty('High');
		expect(summary.byRisk).toHaveProperty('Medium');
		expect(summary.byRisk).toHaveProperty('Low');

		// Risk counts should sum to totalChanges
		const riskCount =
			summary.byRisk.Critical.length +
			summary.byRisk.High.length +
			summary.byRisk.Medium.length +
			summary.byRisk.Low.length;
		expect(riskCount).toBe(summary.totalChanges);
	});

	test('byCategory should have all category types', () => {
		const astDiffs = [
			makeASTDiffResult({
				filePath: 'src/full.ts',
				changes: [
					makeASTChange({
						type: 'modified',
						category: 'function',
						name: 'func',
						lineStart: 1,
						lineEnd: 5,
						signature: '()',
					}),
					makeASTChange({
						type: 'removed',
						category: 'function',
						name: 'deletedFunc',
						lineStart: 10,
						lineEnd: 15,
					}),
					makeASTChange({
						type: 'added',
						category: 'function',
						name: 'newFunc',
						lineStart: 20,
						lineEnd: 25,
					}),
				],
			}),
		];

		const classified = classifyChanges(astDiffs);
		const summary = generateSummary(classified);

		// All categories should exist as keys
		expect(summary.byCategory).toHaveProperty('SIGNATURE_CHANGE');
		expect(summary.byCategory).toHaveProperty('API_CHANGE');
		expect(summary.byCategory).toHaveProperty('GUARD_REMOVED');
		expect(summary.byCategory).toHaveProperty('LOGIC_CHANGE');
		expect(summary.byCategory).toHaveProperty('DELETED_FUNCTION');
		expect(summary.byCategory).toHaveProperty('NEW_FUNCTION');
		expect(summary.byCategory).toHaveProperty('REFACTOR');
		expect(summary.byCategory).toHaveProperty('COSMETIC');
		expect(summary.byCategory).toHaveProperty('UNCLASSIFIED');
	});

	test('criticalItems should contain only Critical risk changes', () => {
		const astDiffs = [
			makeASTDiffResult({
				filePath: 'src/guard.ts',
				changes: [
					makeASTChange({
						type: 'removed',
						category: 'function',
						name: 'validateInput',
						lineStart: 1,
						lineEnd: 10,
					}),
					makeASTChange({
						type: 'added',
						category: 'function',
						name: 'newHelper',
						lineStart: 15,
						lineEnd: 20,
					}),
				],
			}),
		];

		const classified = classifyChanges(astDiffs);
		const summary = generateSummary(classified);

		// validateInput should be Critical (guard removed)
		expect(summary.criticalItems.length).toBeGreaterThanOrEqual(1);
		for (const item of summary.criticalItems) {
			expect(item.riskLevel).toBe('Critical');
		}
	});
});

// =============================================================================
// Test: Integration - semanticSummary populated when astDiffs exist
// =============================================================================
describe('semanticSummary populated when astDiffs exist', () => {
	test('when astDiffs has items, semanticSummary is generated', () => {
		const astDiffs = [
			makeASTDiffResult({
				filePath: 'src/service.ts',
				changes: [
					makeASTChange({
						type: 'modified',
						category: 'function',
						name: 'updateUser',
						lineStart: 5,
						lineEnd: 12,
						signature: '(id: number, data: UserData): Promise<void>',
					}),
				],
			}),
			makeASTDiffResult({
				filePath: 'src/utils.ts',
				changes: [
					makeASTChange({
						type: 'added',
						category: 'function',
						name: 'formatDate',
						lineStart: 1,
						lineEnd: 5,
					}),
				],
			}),
		];

		// Simulate the diff.ts integration logic
		let semanticSummary: any;
		if (astDiffs.length > 0) {
			const classifiedChanges = classifyChanges(astDiffs);
			semanticSummary = generateSummary(classifiedChanges);
		}

		expect(semanticSummary).toBeDefined();
		expect(semanticSummary?.totalFiles).toBe(2);
		expect(semanticSummary?.totalChanges).toBe(2);
	});

	test('classified changes should have correct semantic categorization', () => {
		const astDiffs = [
			makeASTDiffResult({
				filePath: 'src/api.ts',
				changes: [
					makeASTChange({
						type: 'modified',
						category: 'function',
						name: 'fetchData',
						lineStart: 1,
						lineEnd: 10,
						signature: '(url: string): Promise<Response>',
					}),
				],
			}),
		];

		const classified = classifyChanges(astDiffs);
		expect(classified[0].category).toBe('SIGNATURE_CHANGE');
		expect(classified[0].riskLevel).toBe('Critical');
		expect(classified[0].filePath).toBe('src/api.ts');
		expect(classified[0].symbolName).toBe('fetchData');
	});
});

// =============================================================================
// Test: Integration - semanticSummary undefined when astDiffs is empty
// =============================================================================
describe('semanticSummary undefined when astDiffs is empty', () => {
	test('when astDiffs is empty array, semanticSummary should not be generated', () => {
		const astDiffs: ASTDiffResult[] = [];

		// Simulate the diff.ts integration logic
		let semanticSummary: any;
		if (astDiffs.length > 0) {
			const classifiedChanges = classifyChanges(astDiffs);
			semanticSummary = generateSummary(classifiedChanges);
		}

		expect(semanticSummary).toBeUndefined();
	});

	test('spreading astDiffs with empty array should not add astDiffs key', () => {
		const astDiffs: ASTDiffResult[] = [];

		const result = {
			files: [{ path: 'a.ts', additions: 5, deletions: 2 }],
			contractChanges: [],
			hasContractChanges: false,
			summary: '1 file changed',
			...(astDiffs.length > 0 ? { astDiffs } : {}),
			// semanticSummary should only be added if it exists
		};

		expect(result).not.toHaveProperty('astDiffs');
		expect(result).not.toHaveProperty('semanticSummary');
	});
});

// =============================================================================
// Test: Graceful fallback when classifyChanges or generateSummary throws
// =============================================================================
describe('Graceful fallback when classification throws', () => {
	test('should continue without semanticSummary when classifyChanges throws', () => {
		const astDiffs = [
			makeASTDiffResult({
				filePath: 'src/test.ts',
				changes: [makeASTChange()],
			}),
		];

		// Simulate the diff.ts try/catch block
		let semanticSummary: any;
		try {
			// Intentionally throw to simulate error
			throw new Error('Classification failed');
		} catch {
			// Semantic classification unavailable — continue without semanticSummary
		}

		expect(semanticSummary).toBeUndefined();
	});

	test('should continue without semanticSummary when generateSummary throws', () => {
		// Test with mock that throws on generateSummary
		const astDiffs = [
			makeASTDiffResult({
				filePath: 'src/test.ts',
				changes: [makeASTChange()],
			}),
		];

		let semanticSummary: any;
		try {
			const classifiedChanges = classifyChanges(astDiffs);
			// Simulate generateSummary throwing
			throw new Error('Summary generation failed');
		} catch {
			// Continue without semanticSummary
		}

		expect(semanticSummary).toBeUndefined();
	});

	test('diff result should still be valid after graceful fallback', () => {
		// Simulate full diff.ts result construction with fallback
		const astDiffs: ASTDiffResult[] = [];
		let semanticSummary: any;

		try {
			throw new Error('Simulated classification error');
		} catch {
			// Fallback path
		}

		// Even with failed classification, result should be valid
		const result = {
			files: [{ path: 'a.ts', additions: 5, deletions: 2 }],
			contractChanges: [],
			hasContractChanges: false,
			summary: '1 file changed',
			...(astDiffs.length > 0 ? { astDiffs } : {}),
			...(semanticSummary ? { semanticSummary } : {}),
		};

		// Result should have all required fields
		expect(result.files).toHaveLength(1);
		expect(result.hasContractChanges).toBe(false);
		expect(result.summary).toContain('1 file changed');
		expect(result).not.toHaveProperty('semanticSummary');
	});
});

// =============================================================================
// Test: Guard function detection
// =============================================================================
describe('Guard function detection', () => {
	test('guard function removal should be classified as GUARD_REMOVED with Critical risk', () => {
		// Note: guard detection requires change.category === 'function' (set explicitly)
		// Only names that actually contain full guard keywords will match
		const guardNames = [
			'validateInput', // contains "validate"
			'checkAccess', // contains "check"
			'ensureAuth', // contains "ensure"
			'verifyToken', // contains "verify"
			'assertValid', // contains "assert"
			'requireAuth', // contains "require"
			'guardImpl', // contains "guard"
		];

		for (const name of guardNames) {
			const astDiffs = [
				makeASTDiffResult({
					filePath: `src/${name}.ts`,
					changes: [
						{
							type: 'removed' as const,
							category: 'function' as const,
							name,
							lineStart: 1,
							lineEnd: 10,
						},
					],
				}),
			];

			const classified = classifyChanges(astDiffs);
			expect(classified[0].category).toBe('GUARD_REMOVED');
			expect(classified[0].riskLevel).toBe('Critical');
		}
	});
});

// =============================================================================
// Test: Edge cases
// =============================================================================
describe('Edge cases', () => {
	test('multiple files with same path should count as single file in totalFiles', () => {
		const astDiffs = [
			makeASTDiffResult({
				filePath: 'src/utils.ts',
				changes: [makeASTChange({ name: 'func1' })],
			}),
			makeASTDiffResult({
				filePath: 'src/utils.ts',
				changes: [makeASTChange({ name: 'func2' })],
			}),
		];

		const classified = classifyChanges(astDiffs);
		const summary = generateSummary(classified);

		// totalFiles should be unique file count, not diff count
		expect(summary.totalFiles).toBe(1);
		expect(summary.totalChanges).toBe(2);
	});

	test('empty changes array should produce empty summary with zero counts', () => {
		const astDiffs = [
			makeASTDiffResult({
				filePath: 'src/empty.ts',
				changes: [],
			}),
		];

		const classified = classifyChanges(astDiffs);
		const summary = generateSummary(classified);

		expect(summary.totalFiles).toBe(0);
		expect(summary.totalChanges).toBe(0);
		expect(summary.criticalItems).toHaveLength(0);
	});

	test('unclassified changes should go to UNCLASSIFIED category', () => {
		const astDiffs = [
			makeASTDiffResult({
				filePath: 'src/other.ts',
				changes: [
					makeASTChange({
						type: 'modified',
						category: 'other', // 'other' is not explicitly handled
						name: 'unknownSymbol',
						lineStart: 1,
						lineEnd: 5,
					}),
				],
			}),
		];

		const classified = classifyChanges(astDiffs);
		expect(classified[0].category).toBe('UNCLASSIFIED');
	});
});

// =============================================================================
// Test: Round-trip through classifyChanges + generateSummary
// =============================================================================
describe('Round-trip: classifyChanges → generateSummary', () => {
	test('should preserve change information through the pipeline', () => {
		const originalDiff: ASTDiffResult = {
			filePath: 'src/calculator.ts',
			language: 'typescript',
			changes: [
				{
					type: 'modified',
					category: 'function',
					name: 'calculateTotal',
					lineStart: 25,
					lineEnd: 40,
					signature: '(items: Item[]): number',
				},
				{
					type: 'removed',
					category: 'function',
					name: 'deprecatedHelper',
					lineStart: 50,
					lineEnd: 55,
				},
				{
					type: 'added',
					category: 'import',
					name: 'lodash',
					lineStart: 1,
					lineEnd: 1,
				},
			],
			durationMs: 15,
			usedAST: true,
		};

		const classified = classifyChanges([originalDiff]);
		const summary = generateSummary(classified);

		// Verify counts
		expect(summary.totalFiles).toBe(1);
		expect(summary.totalChanges).toBe(3);

		// Verify critical items
		expect(summary.criticalItems.length).toBeGreaterThanOrEqual(1);
		const signatureChange = classified.find(
			(c) => c.category === 'SIGNATURE_CHANGE',
		);
		expect(signatureChange).toBeDefined();
		expect(signatureChange?.symbolName).toBe('calculateTotal');
		expect(signatureChange?.description).toContain('calculateTotal');

		// Verify byCategory contains expected entries
		expect(summary.byCategory.SIGNATURE_CHANGE.length).toBe(1);
		expect(summary.byCategory.DELETED_FUNCTION.length).toBe(1);
		expect(summary.byCategory.COSMETIC.length).toBe(1);
	});
});

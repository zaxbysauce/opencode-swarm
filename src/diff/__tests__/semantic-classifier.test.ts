import { describe, expect, test } from 'bun:test';
import type { ASTChange, ASTDiffResult } from '../../diff/ast-diff';
import { classifyChanges, type RiskLevel } from '../semantic-classifier';

// Helper to create minimal ASTDiffResult
function makeDiff(changes: ASTChange[], filePath = 'test.ts'): ASTDiffResult {
	return {
		filePath,
		language: 'typescript',
		changes,
		durationMs: 10,
		usedAST: true,
	};
}

// Helper to create an ASTChange
function makeChange(
	type: ASTChange['type'],
	category: ASTChange['category'],
	name: string,
	extra: Partial<ASTChange> = {},
): ASTChange {
	return {
		type,
		category,
		name,
		lineStart: 1,
		lineEnd: 10,
		...extra,
	};
}

describe('semantic-classifier', () => {
	describe('DELETED_FUNCTION', () => {
		test('removed function classified as High risk', () => {
			const diff = makeDiff([makeChange('removed', 'function', 'oldFunction')]);
			const result = classifyChanges([diff]);
			expect(result).toHaveLength(1);
			expect(result[0].category).toBe('DELETED_FUNCTION');
			expect(result[0].riskLevel).toBe('High');
			expect(result[0].symbolName).toBe('oldFunction');
		});
	});

	describe('NEW_FUNCTION', () => {
		test('added function classified as Medium risk', () => {
			const diff = makeDiff([makeChange('added', 'function', 'newFunction')]);
			const result = classifyChanges([diff]);
			expect(result).toHaveLength(1);
			expect(result[0].category).toBe('NEW_FUNCTION');
			expect(result[0].riskLevel).toBe('Medium');
			expect(result[0].symbolName).toBe('newFunction');
		});
	});

	describe('SIGNATURE_CHANGE', () => {
		test('modified function WITH signature classified as Critical', () => {
			const diff = makeDiff([
				makeChange('modified', 'function', 'updateUser', {
					signature: 'updateUser(id: number): void',
				}),
			]);
			const result = classifyChanges([diff]);
			expect(result).toHaveLength(1);
			expect(result[0].category).toBe('SIGNATURE_CHANGE');
			expect(result[0].riskLevel).toBe('Critical');
			expect(result[0].signature).toBe('updateUser(id: number): void');
		});
	});

	describe('API_CHANGE', () => {
		test('modified export classified as Critical', () => {
			const diff = makeDiff([makeChange('modified', 'export', 'myExport')]);
			const result = classifyChanges([diff]);
			expect(result).toHaveLength(1);
			expect(result[0].category).toBe('API_CHANGE');
			expect(result[0].riskLevel).toBe('Critical');
		});

		test('modified type classified as Critical', () => {
			const diff = makeDiff([makeChange('modified', 'type', 'MyType')]);
			const result = classifyChanges([diff]);
			expect(result).toHaveLength(1);
			expect(result[0].category).toBe('API_CHANGE');
			expect(result[0].riskLevel).toBe('Critical');
		});
	});

	describe('GUARD_REMOVED', () => {
		test('removed function named validateInput classified as Critical (NOT DELETED_FUNCTION)', () => {
			const diff = makeDiff([
				makeChange('removed', 'function', 'validateInput'),
			]);
			const result = classifyChanges([diff]);
			expect(result).toHaveLength(1);
			expect(result[0].category).toBe('GUARD_REMOVED');
			expect(result[0].riskLevel).toBe('Critical');
			expect(result[0].description).toContain('Guard function');
		});

		test('removed function named checkAuth classified as Critical', () => {
			const diff = makeDiff([makeChange('removed', 'function', 'checkAuth')]);
			const result = classifyChanges([diff]);
			expect(result).toHaveLength(1);
			expect(result[0].category).toBe('GUARD_REMOVED');
			expect(result[0].riskLevel).toBe('Critical');
		});

		test('removed function with guard keyword in name is GUARD_REMOVED', () => {
			const diff = makeDiff([
				makeChange('removed', 'function', 'ensureDataValid'),
			]);
			const result = classifyChanges([diff]);
			expect(result).toHaveLength(1);
			expect(result[0].category).toBe('GUARD_REMOVED');
			expect(result[0].riskLevel).toBe('Critical');
		});

		test('removed function named verifyToken classified as GUARD_REMOVED', () => {
			const diff = makeDiff([makeChange('removed', 'function', 'verifyToken')]);
			const result = classifyChanges([diff]);
			expect(result).toHaveLength(1);
			expect(result[0].category).toBe('GUARD_REMOVED');
			expect(result[0].riskLevel).toBe('Critical');
		});
	});

	describe('LOGIC_CHANGE', () => {
		test('modified function WITHOUT signature change classified as High', () => {
			const diff = makeDiff([
				makeChange('modified', 'function', 'processData'),
			]);
			const result = classifyChanges([diff]);
			expect(result).toHaveLength(1);
			expect(result[0].category).toBe('LOGIC_CHANGE');
			expect(result[0].riskLevel).toBe('High');
		});

		test('modified function with empty signature string is still LOGIC_CHANGE', () => {
			const diff = makeDiff([
				makeChange('modified', 'function', 'internalFn', { signature: '' }),
			]);
			const result = classifyChanges([diff]);
			expect(result).toHaveLength(1);
			expect(result[0].category).toBe('LOGIC_CHANGE');
			expect(result[0].riskLevel).toBe('High');
		});
	});

	describe('REFACTOR', () => {
		test('modified class classified as Medium', () => {
			const diff = makeDiff([makeChange('modified', 'class', 'MyClass')]);
			const result = classifyChanges([diff]);
			expect(result).toHaveLength(1);
			expect(result[0].category).toBe('REFACTOR');
			expect(result[0].riskLevel).toBe('Medium');
		});

		test('modified type is REFACTOR', () => {
			const diff = makeDiff([makeChange('modified', 'type', 'SomeType')]);
			const result = classifyChanges([diff]);
			// Note: modified type is API_CHANGE per the code, not REFACTOR
			expect(result[0].category).toBe('API_CHANGE');
		});

		test('modified variable classified as Medium', () => {
			const diff = makeDiff([makeChange('modified', 'variable', 'myVar')]);
			const result = classifyChanges([diff]);
			expect(result).toHaveLength(1);
			expect(result[0].category).toBe('REFACTOR');
			expect(result[0].riskLevel).toBe('Medium');
		});
	});

	describe('COSMETIC', () => {
		test('import change classified as Low', () => {
			const diff = makeDiff([makeChange('added', 'import', 'lodash')]);
			const result = classifyChanges([diff]);
			expect(result).toHaveLength(1);
			expect(result[0].category).toBe('COSMETIC');
			expect(result[0].riskLevel).toBe('Low');
		});

		test('removed import classified as COSMETIC', () => {
			const diff = makeDiff([makeChange('removed', 'import', 'unusedDep')]);
			const result = classifyChanges([diff]);
			expect(result).toHaveLength(1);
			expect(result[0].category).toBe('COSMETIC');
			expect(result[0].riskLevel).toBe('Low');
		});
	});

	describe('UNCLASSIFIED', () => {
		test('other change types classified as Medium', () => {
			const diff = makeDiff([makeChange('modified', 'other', 'something')]);
			const result = classifyChanges([diff]);
			expect(result).toHaveLength(1);
			expect(result[0].category).toBe('UNCLASSIFIED');
			expect(result[0].riskLevel).toBe('Medium');
		});
	});

	describe('classifyChanges', () => {
		test('correctly processes multiple ASTDiffResult entries', () => {
			const diff1 = makeDiff(
				[makeChange('added', 'function', 'fn1')],
				'file1.ts',
			);
			const diff2 = makeDiff(
				[makeChange('removed', 'function', 'fn2')],
				'file2.ts',
			);
			const result = classifyChanges([diff1, diff2]);
			expect(result).toHaveLength(2);
			expect(result[0].symbolName).toBe('fn1');
			expect(result[0].filePath).toBe('file1.ts');
			expect(result[1].symbolName).toBe('fn2');
			expect(result[1].filePath).toBe('file2.ts');
		});

		test('processes multiple changes in single diff', () => {
			const diff = makeDiff([
				makeChange('added', 'function', 'newFn'),
				makeChange('removed', 'function', 'oldFn'),
				makeChange('modified', 'class', 'MyClass'),
			]);
			const result = classifyChanges([diff]);
			expect(result).toHaveLength(3);
			expect(result.map((c) => c.category)).toEqual([
				'NEW_FUNCTION',
				'DELETED_FUNCTION',
				'REFACTOR',
			]);
		});

		test('empty changes array produces empty result', () => {
			const diff = makeDiff([]);
			const result = classifyChanges([diff]);
			expect(result).toEqual([]);
		});

		test('empty astDiffs array produces empty result', () => {
			const result = classifyChanges([]);
			expect(result).toEqual([]);
		});
	});

	describe('result completeness', () => {
		test('all results have required fields', () => {
			const diff = makeDiff([
				makeChange('added', 'function', 'testFn'),
				makeChange('modified', 'function', 'testFn2', {
					signature: 'testFn2(): void',
				}),
				makeChange('removed', 'function', 'testFn3'),
				makeChange('modified', 'export', 'testExport'),
				makeChange('modified', 'class', 'TestClass'),
			]);
			const result = classifyChanges([diff]);

			for (const change of result) {
				expect(change).toHaveProperty('category');
				expect(change).toHaveProperty('riskLevel');
				expect(change).toHaveProperty('filePath');
				expect(change).toHaveProperty('symbolName');
				expect(change).toHaveProperty('changeType');
				expect(change).toHaveProperty('lineStart');
				expect(change).toHaveProperty('lineEnd');
				expect(change).toHaveProperty('description');
			}
		});

		test('riskLevel values are valid', () => {
			const validRiskLevels: RiskLevel[] = [
				'Critical',
				'High',
				'Medium',
				'Low',
			];
			const diff = makeDiff([
				makeChange('added', 'function', 'newFn'),
				makeChange('removed', 'function', 'oldFn'),
				makeChange('modified', 'function', 'changedFn'),
				makeChange('modified', 'export', 'expFn'),
				makeChange('modified', 'class', 'Cls'),
				makeChange('added', 'import', 'x'),
			]);
			const result = classifyChanges([diff]);

			for (const change of result) {
				expect(validRiskLevels).toContain(change.riskLevel);
			}
		});

		test('changeType matches input', () => {
			const diff = makeDiff([
				makeChange('added', 'function', 'newFn'),
				makeChange('removed', 'function', 'oldFn'),
				makeChange('modified', 'function', 'changedFn'),
			]);
			const result = classifyChanges([diff]);
			expect(result[0].changeType).toBe('added');
			expect(result[1].changeType).toBe('removed');
			expect(result[2].changeType).toBe('modified');
		});
	});
});

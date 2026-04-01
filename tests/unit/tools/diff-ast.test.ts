import { describe, expect, test } from 'bun:test';
import type { DiffResult } from '../../../src/tools/diff';

describe('AST diff integration', () => {
	test('DiffResult type includes optional astDiffs field', () => {
		// Verify the type allows astDiffs
		const result: DiffResult = {
			files: [{ path: 'test.ts', additions: 1, deletions: 0 }],
			contractChanges: [],
			hasContractChanges: false,
			summary: '1 files changed. Contract changes: NO',
		};
		expect(result.astDiffs).toBeUndefined();
	});

	test('DiffResult can include AST diff results', () => {
		const result: DiffResult = {
			files: [{ path: 'test.ts', additions: 5, deletions: 2 }],
			contractChanges: [],
			hasContractChanges: false,
			summary: '1 files changed. Contract changes: NO',
			astDiffs: [
				{
					filePath: 'test.ts',
					language: 'typescript',
					changes: [
						{
							type: 'added',
							category: 'function',
							name: 'newFunc',
							lineStart: 10,
							lineEnd: 15,
						},
					],
					durationMs: 50,
					usedAST: true,
				},
			],
		};
		expect(result.astDiffs).toHaveLength(1);
		expect(result.astDiffs![0].usedAST).toBe(true);
	});

	test('computeASTDiff returns empty changes for unsupported file types', async () => {
		const { computeASTDiff } = await import('../../../src/diff/ast-diff');
		const result = await computeASTDiff('test.xyz', 'old', 'new');
		expect(result.usedAST).toBe(false);
		expect(result.changes).toEqual([]);
	});
});

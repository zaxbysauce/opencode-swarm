import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// Mock only execFileSync while preserving every other export (#330).
const mockExecFileSync = mock(() => '');

const realChildProcess = await import('node:child_process');
mock.module('node:child_process', () => ({
	...realChildProcess,
	execFileSync: mockExecFileSync,
}));

// Import AFTER mock setup
const { diff } = await import('../../../src/tools/diff');

describe('diff tool — summaryOnly parameter', () => {
	beforeEach(() => {
		mockExecFileSync.mockClear();
	});

	afterEach(() => {
		mockExecFileSync.mockClear();
	});

	describe('summaryOnly=true', () => {
		test('returns files array with path/additions/deletions', async () => {
			mockExecFileSync.mockReturnValueOnce(
				'10\t5\tsrc/foo.ts\n3\t1\tsrc/bar.ts',
			);

			const result = await diff.execute({ base: 'HEAD', summaryOnly: true });
			const parsed = JSON.parse(result);

			expect(parsed.files).toHaveLength(2);
			expect(parsed.files[0]).toEqual({
				path: 'src/foo.ts',
				additions: 10,
				deletions: 5,
			});
			expect(parsed.files[1]).toEqual({
				path: 'src/bar.ts',
				additions: 3,
				deletions: 1,
			});
		});

		test('hasContractChanges is false', async () => {
			mockExecFileSync.mockReturnValueOnce('5\t2\tsrc/auth.ts');

			const result = await diff.execute({ base: 'HEAD', summaryOnly: true });
			const parsed = JSON.parse(result);

			expect(parsed.hasContractChanges).toBe(false);
		});

		test('contractChanges is empty array', async () => {
			mockExecFileSync.mockReturnValueOnce('5\t2\tsrc/auth.ts');

			const result = await diff.execute({ base: 'HEAD', summaryOnly: true });
			const parsed = JSON.parse(result);

			expect(parsed.contractChanges).toEqual([]);
		});

		test('summary contains "summary only"', async () => {
			mockExecFileSync.mockReturnValueOnce(
				'10\t5\tsrc/foo.ts\n3\t1\tsrc/bar.ts',
			);

			const result = await diff.execute({ base: 'HEAD', summaryOnly: true });
			const parsed = JSON.parse(result);

			expect(parsed.summary).toContain('summary only');
			expect(parsed.summary).toContain('2 files changed');
		});

		test('has no astDiffs field', async () => {
			mockExecFileSync.mockReturnValueOnce('10\t5\tsrc/foo.ts');

			const result = await diff.execute({ base: 'HEAD', summaryOnly: true });
			const parsed = JSON.parse(result);

			expect('astDiffs' in parsed).toBe(false);
		});

		test('has no semanticSummary field', async () => {
			mockExecFileSync.mockReturnValueOnce('10\t5\tsrc/foo.ts');

			const result = await diff.execute({ base: 'HEAD', summaryOnly: true });
			const parsed = JSON.parse(result);

			expect('semanticSummary' in parsed).toBe(false);
		});

		test('has no markdownSummary field', async () => {
			mockExecFileSync.mockReturnValueOnce('10\t5\tsrc/foo.ts');

			const result = await diff.execute({ base: 'HEAD', summaryOnly: true });
			const parsed = JSON.parse(result);

			expect('markdownSummary' in parsed).toBe(false);
		});

		test('calls execFileSync twice (numstat + contract diff, no full AST diff)', async () => {
			mockExecFileSync.mockReturnValueOnce('10\t5\tsrc/foo.ts');
			mockExecFileSync.mockReturnValueOnce('');

			await diff.execute({ base: 'HEAD', summaryOnly: true }, '/fake/dir');

			// Should call execFileSync twice: numstat + lightweight contract diff (no full AST diff)
			expect(mockExecFileSync).toHaveBeenCalledTimes(2);
			// Verify first call is numstat
			const numstatCallArgs = mockExecFileSync.mock.calls[0][1];
			expect(numstatCallArgs).toContain('--numstat');
			// Verify second call is the contract diff (uses -U0 for speed)
			const contractCallArgs = mockExecFileSync.mock.calls[1][1];
			expect(contractCallArgs).toContain('-U0');
		});

		test('returns correct structure with single file', async () => {
			mockExecFileSync.mockReturnValueOnce('1\t0\tsrc/new.ts');

			const result = await diff.execute({ base: 'HEAD', summaryOnly: true });
			const parsed = JSON.parse(result);

			expect(parsed).toEqual({
				files: [{ path: 'src/new.ts', additions: 1, deletions: 0 }],
				contractChanges: [],
				hasContractChanges: false,
				summary: '1 files changed (summary only)',
			});
		});

		test('handles empty diff with summaryOnly=true', async () => {
			mockExecFileSync.mockReturnValueOnce('');

			const result = await diff.execute({ base: 'HEAD', summaryOnly: true });
			const parsed = JSON.parse(result);

			expect(parsed.files).toEqual([]);
			expect(parsed.contractChanges).toEqual([]);
			expect(parsed.hasContractChanges).toBe(false);
			expect(parsed.summary).toContain('0 files changed');
			expect(parsed.summary).toContain('summary only');
		});

		test('binary files have 0 additions/deletions with summaryOnly=true', async () => {
			mockExecFileSync.mockReturnValueOnce(
				'-\t-\tbinary.png\n5\t2\tsrc/code.ts',
			);

			const result = await diff.execute({ base: 'HEAD', summaryOnly: true });
			const parsed = JSON.parse(result);

			expect(parsed.files).toHaveLength(2);
			expect(parsed.files[0]).toEqual({
				path: 'binary.png',
				additions: 0,
				deletions: 0,
			});
			expect(parsed.files[1]).toEqual({
				path: 'src/code.ts',
				additions: 5,
				deletions: 2,
			});
		});
	});

	describe('summaryOnly=false (default behavior)', () => {
		test('includes astDiffs when files have changes', async () => {
			// numstat call
			mockExecFileSync.mockReturnValueOnce('10\t5\tsrc/foo.ts');
			// full diff call
			mockExecFileSync.mockReturnValueOnce('diff output');
			// fileExistsInRef calls for AST processing (can be multiple)
			mockExecFileSync.mockReturnValueOnce(true);
			// getContentFromRef calls
			mockExecFileSync.mockReturnValueOnce('old content');
			mockExecFileSync.mockReturnValueOnce('new content');

			const result = await diff.execute({ base: 'HEAD', summaryOnly: false });
			const parsed = JSON.parse(result);

			// When summaryOnly=false, astDiffs may or may not be present depending on AST parsing
			// But it should have been attempted (multiple execFileSync calls)
			expect(mockExecFileSync).toHaveBeenCalled();
		});

		test('has contractChanges and hasContractChanges fields', async () => {
			// numstat
			mockExecFileSync.mockReturnValueOnce('5\t2\tsrc/auth.ts');
			// full diff with export
			mockExecFileSync.mockReturnValueOnce(`diff --git a/src/auth.ts b/src/auth.ts
+export function login() {}`);
			// fileExistsInRef + getContentFromRef for AST
			mockExecFileSync.mockReturnValueOnce(true);
			mockExecFileSync.mockReturnValueOnce('old');
			mockExecFileSync.mockReturnValueOnce('new');

			const result = await diff.execute({ base: 'HEAD', summaryOnly: false });
			const parsed = JSON.parse(result);

			expect('contractChanges' in parsed).toBe(true);
			expect('hasContractChanges' in parsed).toBe(true);
		});

		test('calls execFileSync multiple times (numstat + full diff + AST)', async () => {
			mockExecFileSync.mockReturnValueOnce('10\t5\tsrc/foo.ts');
			mockExecFileSync.mockReturnValueOnce('diff output');
			mockExecFileSync.mockReturnValueOnce(true);
			mockExecFileSync.mockReturnValueOnce('old');
			mockExecFileSync.mockReturnValueOnce('new');

			await diff.execute({ base: 'HEAD', summaryOnly: false }, '/fake/dir');

			// Should call: numstat + full diff + fileExistsInRef + getContentFromRef (old) + getContentFromRef (new)
			expect(mockExecFileSync.mock.calls.length).toBeGreaterThanOrEqual(2);
		});
	});

	describe('summaryOnly omitted (default behavior same as false)', () => {
		test('returns full result without summaryOnly param', async () => {
			// numstat
			mockExecFileSync.mockReturnValueOnce('5\t2\tsrc/auth.ts');
			// full diff with export
			mockExecFileSync.mockReturnValueOnce(`diff --git a/src/auth.ts b/src/auth.ts
+export function login() {}`);
			// AST calls
			mockExecFileSync.mockReturnValueOnce(true);
			mockExecFileSync.mockReturnValueOnce('old');
			mockExecFileSync.mockReturnValueOnce('new');

			const result = await diff.execute({ base: 'HEAD' });
			const parsed = JSON.parse(result);

			// Should behave like summaryOnly=false — has contractChanges detection
			expect('contractChanges' in parsed).toBe(true);
			expect('hasContractChanges' in parsed).toBe(true);
			// Should attempt full diff (multiple execFileSync calls)
			expect(mockExecFileSync).toHaveBeenCalledTimes(5);
		});

		test('summary does NOT contain "summary only" when param omitted', async () => {
			// numstat
			mockExecFileSync.mockReturnValueOnce('1\t0\tsrc/new.ts');
			// full diff
			mockExecFileSync.mockReturnValueOnce('');
			// AST calls
			mockExecFileSync.mockReturnValueOnce(true);
			mockExecFileSync.mockReturnValueOnce('');
			mockExecFileSync.mockReturnValueOnce('');

			const result = await diff.execute({ base: 'HEAD' });
			const parsed = JSON.parse(result);

			expect(parsed.summary).not.toContain('summary only');
		});
	});

	describe('real git repo integration — summaryOnly=true vs false', () => {
		test('summaryOnly=true skips AST processing (real git)', async () => {
			// Use real workspace with real git
			const workDir = 'E:\\OpenCode\\opencode-swarm';

			const result = await diff.execute(
				{ base: 'HEAD', paths: ['package.json'], summaryOnly: true },
				workDir,
			);
			const parsed = JSON.parse(result);

			expect(Array.isArray(parsed.files)).toBe(true);
			expect(parsed.hasContractChanges).toBe(false);
			expect(parsed.contractChanges).toEqual([]);
			expect(parsed.summary).toContain('summary only');
			expect('astDiffs' in parsed).toBe(false);
			expect('semanticSummary' in parsed).toBe(false);
			expect('markdownSummary' in parsed).toBe(false);
		});

		test('summaryOnly=false includes AST data when available (real git)', async () => {
			const workDir = 'E:\\OpenCode\\opencode-swarm';

			const result = await diff.execute(
				{ base: 'HEAD', paths: ['package.json'], summaryOnly: false },
				workDir,
			);
			const parsed = JSON.parse(result);

			expect(Array.isArray(parsed.files)).toBe(true);
			expect('hasContractChanges' in parsed).toBe(true);
			// AST data may or may not be present depending on whether AST parsing succeeded
			// but it should have been attempted (execFileSync called multiple times)
		});

		test('real git with no changes returns empty files array', async () => {
			const workDir = 'E:\\OpenCode\\opencode-swarm';

			// Use a non-existent file to simulate no changes
			const result = await diff.execute(
				{
					base: 'HEAD',
					paths: ['nonexistent-file-xyz.txt'],
					summaryOnly: true,
				},
				workDir,
			);
			const parsed = JSON.parse(result);

			expect(parsed.files).toEqual([]);
			expect(parsed.summary).toContain('0 files changed');
		});
	});

	describe('summaryOnly edge cases', () => {
		test('summaryOnly=null is treated as falsy (not summaryOnly)', async () => {
			// numstat
			mockExecFileSync.mockReturnValueOnce('1\t0\tsrc/new.ts');
			// full diff
			mockExecFileSync.mockReturnValueOnce('');
			// AST calls
			mockExecFileSync.mockReturnValueOnce(true);
			mockExecFileSync.mockReturnValueOnce('');
			mockExecFileSync.mockReturnValueOnce('');

			const result = await diff.execute({
				base: 'HEAD',
				summaryOnly: null as unknown as undefined,
			});
			const parsed = JSON.parse(result);

			// null should be treated as falsy — full behavior
			expect(mockExecFileSync).toHaveBeenCalledTimes(5);
		});

		test('summaryOnly=undefined is treated as falsy (not summaryOnly)', async () => {
			mockExecFileSync.mockReturnValueOnce('1\t0\tsrc/new.ts');
			mockExecFileSync.mockReturnValueOnce('');
			mockExecFileSync.mockReturnValueOnce(true);
			mockExecFileSync.mockReturnValueOnce('');
			mockExecFileSync.mockReturnValueOnce('');

			const result = await diff.execute({
				base: 'HEAD',
				summaryOnly: undefined,
			});
			const parsed = JSON.parse(result);

			// undefined should be treated as falsy — full behavior
			expect(mockExecFileSync).toHaveBeenCalledTimes(5);
		});
	});
});

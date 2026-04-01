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

describe('diff tool - directory validation and cwd fix', () => {
	beforeEach(() => {
		mockExecFileSync.mockClear();
	});

	afterEach(() => {
		mockExecFileSync.mockClear();
	});

	describe('EC-001: context.directory validation - fail-fast guard', () => {
		test('falls back to process.cwd() when directory is null (wrapper behavior)', async () => {
			// createSwarmTool wrapper does: ctx?.directory ?? process.cwd()
			// null is a nullish value, so ?? falls back to process.cwd()
			mockExecFileSync.mockReturnValueOnce('');
			mockExecFileSync.mockReturnValueOnce('');

			const result = await diff.execute({ base: 'HEAD' }, {
				directory: null,
			} as any);
			const parsed = JSON.parse(result);

			// Should NOT return the directory-required error; wrapper provides process.cwd()
			expect(parsed.error).toBeUndefined();
			expect(mockExecFileSync).toHaveBeenCalled();
		});

		test('falls back to process.cwd() when directory is undefined (wrapper behavior)', async () => {
			// createSwarmTool wrapper does: ctx?.directory ?? process.cwd()
			// undefined is a nullish value, so ?? falls back to process.cwd()
			mockExecFileSync.mockReturnValueOnce('');
			mockExecFileSync.mockReturnValueOnce('');

			const result = await diff.execute({ base: 'HEAD' }, {
				directory: undefined,
			} as any);
			const parsed = JSON.parse(result);

			// Should NOT return the directory-required error; wrapper provides process.cwd()
			expect(parsed.error).toBeUndefined();
			expect(mockExecFileSync).toHaveBeenCalled();
		});

		test('returns error when directory is empty string', async () => {
			const result = await diff.execute({ base: 'HEAD' }, {
				directory: '',
			} as any);
			const parsed = JSON.parse(result);

			expect(parsed.error).toBe(
				'project directory is required but was not provided',
			);
			expect(parsed.files).toEqual([]);
		});

		test('returns error when directory is whitespace-only string', async () => {
			const result = await diff.execute({ base: 'HEAD' }, {
				directory: '   ',
			} as any);
			const parsed = JSON.parse(result);

			expect(parsed.error).toBe(
				'project directory is required but was not provided',
			);
			expect(parsed.files).toEqual([]);
		});

		test('returns error when directory is not a string (number)', async () => {
			const result = await diff.execute({ base: 'HEAD' }, {
				directory: 123,
			} as any);
			const parsed = JSON.parse(result);

			expect(parsed.error).toBe(
				'project directory is required but was not provided',
			);
			expect(parsed.files).toEqual([]);
		});

		test('returns error when directory is an object', async () => {
			const result = await diff.execute({ base: 'HEAD' }, {
				directory: { path: '/test' },
			} as any);
			const parsed = JSON.parse(result);

			expect(parsed.error).toBe(
				'project directory is required but was not provided',
			);
			expect(parsed.files).toEqual([]);
		});

		test('execFileSync IS called when directory is null (wrapper provides process.cwd())', async () => {
			// createSwarmTool wrapper falls back to process.cwd() for null directory
			mockExecFileSync.mockReturnValueOnce('');
			mockExecFileSync.mockReturnValueOnce('');

			await diff.execute({ base: 'HEAD' }, { directory: null } as any);

			expect(mockExecFileSync).toHaveBeenCalled();
		});
	});

	describe('execFileSync cwd option - working directory fix', () => {
		test('passes cwd option to numstat execFileSync call', async () => {
			mockExecFileSync.mockReturnValueOnce('');
			mockExecFileSync.mockReturnValueOnce('');

			await diff.execute({ base: 'HEAD' }, {
				directory: '/test/project',
			} as any);

			// Check first call (numstat) - options are the 3rd argument
			const firstCallOptions = mockExecFileSync.mock.calls[0][2];
			expect(firstCallOptions).toBeDefined();
			expect(firstCallOptions.cwd).toBe('/test/project');
		});

		test('passes cwd option to fullDiff execFileSync call', async () => {
			mockExecFileSync.mockReturnValueOnce('');
			mockExecFileSync.mockReturnValueOnce('');

			await diff.execute({ base: 'HEAD' }, {
				directory: '/test/project',
			} as any);

			// Check second call (fullDiff) - options are the 3rd argument
			const secondCallOptions = mockExecFileSync.mock.calls[1][2];
			expect(secondCallOptions).toBeDefined();
			expect(secondCallOptions.cwd).toBe('/test/project');
		});

		test('uses correct cwd for different directories', async () => {
			mockExecFileSync.mockReturnValueOnce('');
			mockExecFileSync.mockReturnValueOnce('');

			await diff.execute({ base: 'main' }, {
				directory: '/custom/path',
			} as any);

			// Both calls should use the same cwd
			const firstCallOptions = mockExecFileSync.mock.calls[0][2];
			const secondCallOptions = mockExecFileSync.mock.calls[1][2];
			expect(firstCallOptions.cwd).toBe('/custom/path');
			expect(secondCallOptions.cwd).toBe('/custom/path');
		});

		test('cwd is passed to both calls with different paths', async () => {
			mockExecFileSync.mockReturnValueOnce('');
			mockExecFileSync.mockReturnValueOnce('');

			await diff.execute({ base: 'HEAD', paths: ['src/file.ts'] }, {
				directory: '/workspace',
			} as any);

			// Both calls should have cwd set
			expect(mockExecFileSync.mock.calls[0][2].cwd).toBe('/workspace');
			expect(mockExecFileSync.mock.calls[1][2].cwd).toBe('/workspace');
		});
	});

	describe('error handling - uses e.message not e.constructor.name', () => {
		test('error message includes e.message from thrown Error', async () => {
			const errorMessage = 'this is the actual error message from git';
			mockExecFileSync.mockImplementation(() => {
				throw new Error(errorMessage);
			});

			const result = await diff.execute({ base: 'HEAD' }, {
				directory: '/test',
			} as any);
			const parsed = JSON.parse(result);

			// Error message should include the actual error message, not constructor name
			expect(parsed.error).toContain(errorMessage);
			expect(parsed.error).not.toContain('Error'); // Should not just say "Error"
		});

		test('error message uses generic text for non-Error objects', async () => {
			mockExecFileSync.mockImplementation(() => {
				throw 'string error';
			});

			const result = await diff.execute({ base: 'HEAD' }, {
				directory: '/test',
			} as any);
			const parsed = JSON.parse(result);

			// Should fall back to generic error message
			expect(parsed.error).toContain('git diff failed');
			expect(parsed.error).toContain('unknown error');
		});

		test('error message properly formats Error.message', async () => {
			mockExecFileSync.mockImplementation(() => {
				throw new Error('git failed with code 128');
			});

			const result = await diff.execute({ base: 'HEAD' }, {
				directory: '/test',
			} as any);
			const parsed = JSON.parse(result);

			expect(parsed.error).toBe('git diff failed: git failed with code 128');
		});
	});

	describe('normal execution with valid directory', () => {
		test('returns structured DiffResult with valid directory', async () => {
			mockExecFileSync.mockReturnValueOnce('10\t5\tsrc/file.ts');
			mockExecFileSync.mockReturnValueOnce('');

			const result = await diff.execute({ base: 'HEAD' }, {
				directory: '/test/project',
			} as any);
			const parsed = JSON.parse(result);

			expect(parsed.files).toHaveLength(1);
			expect(parsed.files[0]).toEqual({
				path: 'src/file.ts',
				additions: 10,
				deletions: 5,
			});
			expect(parsed.contractChanges).toEqual([]);
			expect(parsed.hasContractChanges).toBe(false);
			expect(parsed.summary).toContain('1 files changed');
		});

		test('execFileSync is called when valid directory provided', async () => {
			mockExecFileSync.mockReturnValueOnce('');
			mockExecFileSync.mockReturnValueOnce('');

			await diff.execute({ base: 'HEAD' }, {
				directory: '/test/project',
			} as any);

			expect(mockExecFileSync).toHaveBeenCalledTimes(2);
		});

		test('returns contract changes correctly with valid directory', async () => {
			mockExecFileSync.mockReturnValueOnce('5\t2\tsrc/auth.ts');
			mockExecFileSync.mockReturnValueOnce(`diff --git a/src/auth.ts b/src/auth.ts
+export function login(email: string) {
+  return true;
+}`);

			const result = await diff.execute({ base: 'HEAD' }, {
				directory: '/test/project',
			} as any);
			const parsed = JSON.parse(result);

			expect(parsed.hasContractChanges).toBe(true);
			expect(parsed.contractChanges.length).toBeGreaterThan(0);
			expect(parsed.contractChanges[0]).toContain('export function login');
		});
	});
});

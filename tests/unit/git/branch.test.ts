/**
 * Comprehensive tests for src/git/branch.ts
 * Tests all git branch management functions with mocked spawnSync
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';

// Create mock function for spawnSync
let callIndex = 0;
let returnValues: Array<{ status: number; stdout: string; stderr: string }> =
	[];

const mockSpawnSync = mock(
	(command: string, args: string[], options: { cwd: string }) => {
		// console.log(`Mock call ${callIndex}: git ${args.join(' ')}`);
		const result = returnValues[callIndex] ?? {
			status: 0,
			stdout: '',
			stderr: '',
		};
		callIndex++;
		return result;
	},
);

// Mock the node:child_process module BEFORE importing branch
mock.module('node:child_process', () => ({
	spawnSync: mockSpawnSync,
}));

// Import AFTER mock setup
const branch = await import('../../../src/git/branch');

function setupMock(
	...values: Array<{ status: number; stdout: string; stderr: string }>
) {
	callIndex = 0;
	returnValues = values;
	mockSpawnSync.mockClear();
}

describe('Git Branch Module', () => {
	const testCwd = '/test/repo';

	beforeEach(() => {
		// Reset mock before each test
		callIndex = 0;
		returnValues = [];
		mockSpawnSync.mockClear();
	});

	describe('isGitRepo()', () => {
		test('returns true when git rev-parse succeeds', () => {
			setupMock({ status: 0, stdout: '.git', stderr: '' });

			const result = branch.isGitRepo(testCwd);

			expect(result).toBe(true);
		});

		test('returns false when git rev-parse fails (not a git repo)', () => {
			setupMock({ status: 128, stdout: '', stderr: 'not a git repo' });

			const result = branch.isGitRepo(testCwd);

			expect(result).toBe(false);
		});

		test('returns false when git command throws', () => {
			mockSpawnSync.mockImplementationOnce(() => {
				throw new Error('git not found');
			});

			const result = branch.isGitRepo(testCwd);

			expect(result).toBe(false);
		});
	});

	describe('getCurrentBranch()', () => {
		test('returns branch name correctly', () => {
			setupMock({ status: 0, stdout: '  main\n', stderr: '' });

			const result = branch.getCurrentBranch(testCwd);

			expect(result).toBe('main');
		});

		test('handles branch name with whitespace', () => {
			setupMock({ status: 0, stdout: '  feature/test-branch  \n', stderr: '' });

			const result = branch.getCurrentBranch(testCwd);

			expect(result).toBe('feature/test-branch');
		});

		test('throws error when not in a git repo', () => {
			setupMock({
				status: 128,
				stdout: '',
				stderr: 'fatal: not a git repository',
			});

			expect(() => branch.getCurrentBranch(testCwd)).toThrow();
		});
	});

	describe('createBranch()', () => {
		test('creates new branch when remote branch does not exist', () => {
			// First call: check remote branch (fails - doesn't exist)
			// Second call: create new branch (should succeed)
			// Using only 2 mock values to match the 2 git calls made
			setupMock(
				{ status: 128, stdout: '', stderr: "fatal: couldn't find remote ref" }, // remote check fails
				{ status: 0, stdout: '', stderr: '' }, // checkout -b succeeds
			);

			// Should not throw - should create branch successfully
			branch.createBranch(testCwd, 'new-feature');

			// Verify mock was called at least once (for the successful checkout)
			expect(mockSpawnSync).toHaveBeenCalled();
		});

		test('checkout existing local branch when remote exists', () => {
			// First call: check remote branch (succeeds)
			// Second call: check local branch (succeeds)
			// Third call: checkout local branch
			setupMock(
				{ status: 0, stdout: 'abc123', stderr: '' },
				{ status: 0, stdout: 'abc123', stderr: '' },
				{ status: 0, stdout: '', stderr: '' },
			);

			branch.createBranch(testCwd, 'existing-branch');

			expect(mockSpawnSync).toHaveBeenCalledTimes(3);
		});

		test('checkout from remote when local branch does not exist', () => {
			// First call: check remote branch (succeeds)
			// Second call: check local branch (fails)
			// Third call: checkout from remote
			setupMock(
				{ status: 0, stdout: 'abc123', stderr: '' },
				{ status: 128, stdout: '', stderr: 'fatal: invalid reference' },
				{ status: 0, stdout: '', stderr: '' },
			);

			branch.createBranch(testCwd, 'remote-branch');

			expect(mockSpawnSync).toHaveBeenCalledTimes(3);
		});

		test('respects custom remote parameter', () => {
			// First call: check upstream remote (fails)
			// Second call: create new branch (should succeed)
			setupMock(
				{ status: 128, stdout: '', stderr: "fatal: couldn't find remote ref" },
				{ status: 0, stdout: '', stderr: '' },
			);

			// Should not throw - should create branch successfully
			branch.createBranch(testCwd, 'my-branch', 'upstream');

			expect(mockSpawnSync).toHaveBeenCalled();
		});
	});

	describe('getChangedFiles()', () => {
		test('returns array of changed files', () => {
			// First call: getDefaultBaseBranch (succeeds - origin/main)
			// Second call: diff --name-only
			setupMock(
				{ status: 0, stdout: '.git', stderr: '' },
				{ status: 0, stdout: 'file1.ts\nfile2.ts\nfile3.ts\n', stderr: '' },
			);

			const result = branch.getChangedFiles(testCwd);

			expect(result).toEqual(['file1.ts', 'file2.ts', 'file3.ts']);
		});

		test('returns empty array when no changes', () => {
			setupMock(
				{ status: 0, stdout: '.git', stderr: '' },
				{ status: 0, stdout: '', stderr: '' },
			);

			const result = branch.getChangedFiles(testCwd);

			expect(result).toEqual([]);
		});

		test('returns empty array and logs error on git failure', () => {
			setupMock(
				{ status: 0, stdout: '.git', stderr: '' },
				{ status: 128, stdout: '', stderr: 'fatal: ambiguous argument' },
			);

			const result = branch.getChangedFiles(testCwd);

			expect(result).toEqual([]);
		});

		test('uses provided branch instead of default', () => {
			// When a branch is provided, getDefaultBaseBranch is NOT called
			// Only the diff command is called with the provided branch
			setupMock(
				{ status: 0, stdout: 'modified.ts\n', stderr: '' }, // diff with develop
			);

			const result = branch.getChangedFiles(testCwd, 'develop');

			expect(result).toEqual(['modified.ts']);
		});

		test('filters out empty strings from split', () => {
			setupMock(
				{ status: 0, stdout: '.git', stderr: '' },
				{ status: 0, stdout: 'file1.ts\n\nfile2.ts\n\n', stderr: '' },
			);

			const result = branch.getChangedFiles(testCwd);

			expect(result).toEqual(['file1.ts', 'file2.ts']);
		});
	});

	describe('getDefaultBaseBranch()', () => {
		test('returns origin/main when it exists', () => {
			setupMock({ status: 0, stdout: 'abc123', stderr: '' });

			const result = branch.getDefaultBaseBranch(testCwd);

			expect(result).toBe('origin/main');
		});

		test('returns origin/master when main does not exist', () => {
			setupMock(
				{ status: 128, stdout: '', stderr: "fatal: couldn't find remote ref" },
				{ status: 0, stdout: 'abc123', stderr: '' },
			);

			const result = branch.getDefaultBaseBranch(testCwd);

			expect(result).toBe('origin/master');
		});

		test('falls back to origin/main when neither main nor master exist', () => {
			setupMock(
				{ status: 128, stdout: '', stderr: "fatal: couldn't find remote ref" },
				{ status: 128, stdout: '', stderr: "fatal: couldn't find remote ref" },
			);

			const result = branch.getDefaultBaseBranch(testCwd);

			expect(result).toBe('origin/main');
		});
	});

	describe('stageFiles()', () => {
		test('stages specific files successfully', () => {
			setupMock({ status: 0, stdout: '', stderr: '' });

			branch.stageFiles(testCwd, ['file1.ts', 'file2.ts']);

			expect(mockSpawnSync).toHaveBeenCalled();
		});

		test('stages single file', () => {
			setupMock({ status: 0, stdout: '', stderr: '' });

			branch.stageFiles(testCwd, ['single-file.ts']);

			expect(mockSpawnSync).toHaveBeenCalled();
		});

		test('throws error when files array is empty', () => {
			expect(() => branch.stageFiles(testCwd, [])).toThrow(
				'files array cannot be empty. Use stageAll() to stage all files.',
			);
		});

		test('does not call git exec when files array is empty', () => {
			expect(() => branch.stageFiles(testCwd, [])).toThrow();
			// Verify mock was NOT called - call count should be 0
			expect(mockSpawnSync).toHaveBeenCalledTimes(0);
		});

		test('handles files with spaces in path', () => {
			setupMock({ status: 0, stdout: '', stderr: '' });

			branch.stageFiles(testCwd, [
				'path with spaces/file.ts',
				'another path/file.ts',
			]);

			expect(mockSpawnSync).toHaveBeenCalled();
		});
	});

	describe('stageAll()', () => {
		test('stages all files with git add .', () => {
			setupMock({ status: 0, stdout: '', stderr: '' });

			branch.stageAll(testCwd);

			expect(mockSpawnSync).toHaveBeenCalled();
		});

		test('throws error on git failure', () => {
			setupMock({ status: 128, stdout: '', stderr: 'fatal: could not stage' });

			expect(() => branch.stageAll(testCwd)).toThrow();
		});
	});

	describe('commitChanges()', () => {
		test('commits with message', () => {
			setupMock({ status: 0, stdout: '', stderr: '' });

			branch.commitChanges(testCwd, 'feat: add new feature');

			expect(mockSpawnSync).toHaveBeenCalled();
		});

		test('commits with multi-line message', () => {
			setupMock({ status: 0, stdout: '', stderr: '' });

			const multiLineMessage =
				'feat: add new feature\n\n- Added feature X\n- Fixed bug Y';
			branch.commitChanges(testCwd, multiLineMessage);

			expect(mockSpawnSync).toHaveBeenCalled();
		});

		test('throws error on commit failure', () => {
			setupMock({ status: 1, stdout: '', stderr: 'nothing to commit' });

			expect(() => branch.commitChanges(testCwd, 'test commit')).toThrow();
		});
	});

	describe('getCurrentSha()', () => {
		test('returns full commit SHA', () => {
			setupMock({ status: 0, stdout: 'abc123def456789', stderr: '' });

			const result = branch.getCurrentSha(testCwd);

			expect(result).toBe('abc123def456789');
		});

		test('trims whitespace from output', () => {
			setupMock({ status: 0, stdout: '  sha1234567890  \n', stderr: '' });

			const result = branch.getCurrentSha(testCwd);

			expect(result).toBe('sha1234567890');
		});

		test('throws error when not in git repo', () => {
			setupMock({
				status: 128,
				stdout: '',
				stderr: 'fatal: not a git repository',
			});

			expect(() => branch.getCurrentSha(testCwd)).toThrow();
		});
	});

	describe('hasUncommittedChanges()', () => {
		test('returns true when there are uncommitted changes', () => {
			setupMock({
				status: 0,
				stdout: ' M modified.ts\n?? untracked.ts\n',
				stderr: '',
			});

			const result = branch.hasUncommittedChanges(testCwd);

			expect(result).toBe(true);
		});

		test('returns false when working directory is clean', () => {
			setupMock({ status: 0, stdout: '', stderr: '' });

			const result = branch.hasUncommittedChanges(testCwd);

			expect(result).toBe(false);
		});

		test('returns false when status output is just whitespace', () => {
			setupMock({ status: 0, stdout: '   \n  \n', stderr: '' });

			const result = branch.hasUncommittedChanges(testCwd);

			expect(result).toBe(false);
		});

		test('detects staged changes', () => {
			setupMock({ status: 0, stdout: 'M  staged.ts\n', stderr: '' });

			const result = branch.hasUncommittedChanges(testCwd);

			expect(result).toBe(true);
		});
	});

	describe('Integration: Full git workflow', () => {
		test('complete workflow: check repo, create branch, stage, commit', () => {
			// isGitRepo
			setupMock({ status: 0, stdout: '.git', stderr: '' });
			expect(branch.isGitRepo(testCwd)).toBe(true);

			// getCurrentBranch
			setupMock({ status: 0, stdout: 'main', stderr: '' });
			expect(branch.getCurrentBranch(testCwd)).toBe('main');

			// createBranch - new branch: remote check fails (1), checkout -b succeeds (2)
			setupMock(
				{ status: 128, stdout: '', stderr: 'not found' }, // remote check fails
				{ status: 0, stdout: '', stderr: '' }, // checkout -b succeeds
			);
			branch.createBranch(testCwd, 'feature-branch');
			expect(mockSpawnSync).toHaveBeenCalled();

			// stageFiles
			setupMock({ status: 0, stdout: '', stderr: '' });
			branch.stageFiles(testCwd, ['new-file.ts']);

			// getCurrentSha before commit
			setupMock({ status: 0, stdout: 'abc123', stderr: '' });
			expect(branch.getCurrentSha(testCwd)).toBe('abc123');

			// hasUncommittedChanges before commit
			setupMock({ status: 0, stdout: 'M new-file.ts', stderr: '' });
			expect(branch.hasUncommittedChanges(testCwd)).toBe(true);

			// commitChanges
			setupMock({ status: 0, stdout: '', stderr: '' });
			branch.commitChanges(testCwd, 'feat: add new file');

			// hasUncommittedChanges after commit
			setupMock({ status: 0, stdout: '', stderr: '' });
			expect(branch.hasUncommittedChanges(testCwd)).toBe(false);
		});
	});
});

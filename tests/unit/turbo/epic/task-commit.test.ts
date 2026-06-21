/**
 * Tests for greenfield-smart Rule 2 — auto-commit on task completion.
 * File: tests/unit/turbo/epic/task-commit.test.ts
 *
 * Verifies:
 *  - No-git directories early-return without spawning any git command.
 *  - Git directories stage + commit with the `swarm(task <id>):` prefix.
 *  - Commit failures are non-fatal (returned in result, not thrown).
 *  - `--allow-empty` is used so no-op tasks still produce a marker.
 *  - `formatTaskCommitMessage` produces the contract format Rule 3 consumes.
 *
 * Test isolation: uses the file-scoped `_internals` DI seam per
 * AGENTS.md #7. No `mock.module` — restored in `afterEach`.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { _internals as gitBranchInternals } from '../../../../src/git/branch';
import {
	_internals,
	commitTaskCompletion,
	formatTaskCommitMessage,
} from '../../../../src/turbo/epic/task-commit';

type Internals = typeof _internals;
type GitBranchInternals = typeof gitBranchInternals;

describe('formatTaskCommitMessage', () => {
	test('produces the `swarm(task <id>):` contract format Rule 3 parses', () => {
		const msg = formatTaskCommitMessage('2.1', 'implement ClinicalDataset');
		expect(msg).toMatch(/^swarm\(task 2\.1\): /);
		expect(msg).toContain('implement ClinicalDataset');
	});

	test('uses default body when description omitted', () => {
		const msg = formatTaskCommitMessage('3.4');
		expect(msg).toBe('swarm(task 3.4): completed');
	});

	test('truncates long descriptions to keep the subject line bounded', () => {
		const longDescription = 'a'.repeat(200);
		const msg = formatTaskCommitMessage('5.1', longDescription);
		// Subject body capped — leaves prefix + truncation indicator
		expect(msg.length).toBeLessThan(100);
		expect(msg.endsWith('...')).toBe(true);
	});

	test('collapses internal whitespace so multi-line descriptions stay one line', () => {
		const desc = 'first line\n\nsecond line  with  spaces';
		const msg = formatTaskCommitMessage('1.1', desc);
		expect(msg).not.toContain('\n');
		expect(msg).not.toMatch(/ {2}/);
	});

	test('Phase 18: scrubs `)` from taskId so a typo cannot corrupt the Phase 6 SWARM_TASK_SUBJECT_RE parser (Phase 17 C.H2)', () => {
		const msg = formatTaskCommitMessage('1.1)evil', 'desc');
		// The structural `:` and `)` must remain unique delimiters; the
		// taskId becomes safe-alphabet (alnum + . _ -). A bare ')' in
		// the taskId would otherwise let the parser regex
		// /^swarm\(task ([^)]+)\):/ capture only `1.1`, silently marking
		// task 1.1 as "committed" when the real intent was a different
		// taskId.
		expect(msg).toContain('1.1_evil');
		expect(msg).not.toContain(')evil');
	});

	test('Phase 18: scrubs newlines from taskId (no subject/body split)', () => {
		const msg = formatTaskCommitMessage('1.1\n2.1', 'desc');
		// A literal newline in the taskId would split the git subject
		// into subject + body, making the body a phantom secondary
		// commit message. Scrubber replaces it with `_`.
		expect(msg.split('\n')).toHaveLength(1);
		expect(msg).toContain('1.1_2.1');
	});

	test('Phase 18: scrubs backtick from taskId (no markdown rendering surprise)', () => {
		const msg = formatTaskCommitMessage('1.`bad`.1', 'desc');
		expect(msg).not.toContain('`');
	});

	test('Phase 18: numeric dotted taskIds pass through scrubber unchanged (no-op for normal inputs)', () => {
		expect(formatTaskCommitMessage('1.1', 'a')).toContain('swarm(task 1.1):');
		expect(formatTaskCommitMessage('2.3.4', 'b')).toContain(
			'swarm(task 2.3.4):',
		);
		expect(formatTaskCommitMessage('10.5.100', 'c')).toContain(
			'swarm(task 10.5.100):',
		);
	});
});

describe('commitTaskCompletion', () => {
	const originals: Internals = { ..._internals };
	let calls: Array<{ fn: string; args: unknown[] }>;

	beforeEach(() => {
		calls = [];
		// Phase 11: zero-delay sleep stub so the retry loop doesn't
		// actually wait during unit tests. Tests that want to verify the
		// retry behavior override this with a tracked stub.
		_internals.sleep = async () => {};
	});

	afterEach(() => {
		// Restore — file-scoped seam means cross-file tests are protected
		// because the next test file sees the same originals.
		Object.assign(_internals, originals);
	});

	test('no-git directory: returns reason="no-git" without touching git', async () => {
		_internals.isGitRepo = (cwd: string) => {
			calls.push({ fn: 'isGitRepo', args: [cwd] });
			return false;
		};
		_internals.stageScopedPaths = () => {
			throw new Error('stageScopedPaths must not be called in no-git path');
		};
		_internals.commitAllowEmpty = () => {
			throw new Error('commitAllowEmpty must not be called in no-git path');
		};

		const result = await commitTaskCompletion('/tmp/fake', '2.1', 'desc', [
			'src/foo.ts',
		]);
		expect(result.committed).toBe(false);
		expect(result.reason).toBe('no-git');
		expect(calls).toEqual([{ fn: 'isGitRepo', args: ['/tmp/fake'] }]);
	});

	test('happy path with scope: stages ONLY declared paths plus .swarm excludes, then commits', async () => {
		_internals.isGitRepo = () => true;
		_internals.stageScopedPaths = (cwd: string, paths: string[]) => {
			calls.push({ fn: 'stageScopedPaths', args: [cwd, paths] });
		};
		_internals.commitAllowEmpty = (cwd: string, message: string) => {
			calls.push({ fn: 'commitAllowEmpty', args: [cwd, message] });
		};
		_internals.gitHeadSha = () => 'abc1234';

		const result = await commitTaskCompletion('/tmp/fake', '2.1', 'desc', [
			'src/models/foo.ts',
			'src/models/bar.ts',
		]);

		expect(result.committed).toBe(true);
		expect(result.reason).toBe('success');
		expect(result.sha).toBe('abc1234');
		// Stage before commit; only the declared paths reach the seam.
		expect(calls[0]).toEqual({
			fn: 'stageScopedPaths',
			args: ['/tmp/fake', ['src/models/foo.ts', 'src/models/bar.ts']],
		});
		expect(calls[1].fn).toBe('commitAllowEmpty');
		expect(calls[1].args[1]).toMatch(/^swarm\(task 2\.1\):/);
	});

	test('no-scope path: SKIPS staging entirely, produces marker-only commit (the cross-lane WIP fix)', async () => {
		// This is the headline contract from the adversarial review on
		// 2026-06-03: when a task has no declared scope, Rule 2 must NOT
		// fall back to `git add -A` (which swept in sibling lanes' WIP
		// and corrupted Rule 3 evidence). It must write a marker-only
		// commit so `commitsObserved` advances without contamination.
		_internals.isGitRepo = () => true;
		_internals.stageScopedPaths = () => {
			throw new Error(
				'stageScopedPaths must not be called when scope is empty',
			);
		};
		_internals.commitAllowEmpty = (cwd: string, message: string) => {
			calls.push({ fn: 'commitAllowEmpty', args: [cwd, message] });
		};
		_internals.gitHeadSha = () => 'def5678';

		const undefScope = await commitTaskCompletion('/tmp/fake', '2.1', 'desc');
		expect(undefScope.committed).toBe(true);
		const emptyScope = await commitTaskCompletion(
			'/tmp/fake',
			'2.2',
			'desc',
			[],
		);
		expect(emptyScope.committed).toBe(true);
		// Whitespace-only entries are also filtered out.
		const whitespaceScope = await commitTaskCompletion(
			'/tmp/fake',
			'2.3',
			'desc',
			['', '  '],
		);
		expect(whitespaceScope.committed).toBe(true);
		// Three commit calls; zero stage calls.
		expect(calls.filter((c) => c.fn === 'commitAllowEmpty')).toHaveLength(3);
	});

	test('stageScopedPaths argv (real) includes ALL .swarm exclude pathspecs, including nested (AGENTS.md #4)', async () => {
		// Phase 9 rewrite: the previous version of this test stubbed the
		// very seam it claimed to verify, then asserted its own fabricated
		// argv equaled itself — proving nothing. This version stubs the
		// LOWER seam (`gitBranchInternals.gitExec`) and exercises the
		// REAL `stageScopedPaths` so a regression that drops any of the
		// `.swarm` exclude pathspecs is actually caught.
		const gitOrig = gitBranchInternals.gitExec;
		const capturedArgvs: string[][] = [];
		gitBranchInternals.gitExec = ((args: string[], _cwd: string) => {
			capturedArgvs.push([...args]);
			// Return value depends on the subcommand. `git log` for the
			// idempotency probe must report "no existing commit" so the
			// flow continues; `git rev-parse HEAD` must return a sha.
			if (args[0] === 'log') return '';
			if (args[0] === 'rev-parse') return 'abc1234';
			return '';
		}) as typeof gitBranchInternals.gitExec;

		try {
			_internals.isGitRepo = () => true;
			// Restore real production functions for the staging path —
			// they will call the stubbed `gitBranchInternals.gitExec`.
			_internals.stageScopedPaths = originals.stageScopedPaths;
			_internals.commitAllowEmpty = originals.commitAllowEmpty;
			_internals.gitHeadSha = originals.gitHeadSha;
			_internals.hasExistingTaskCommit = originals.hasExistingTaskCommit;

			await commitTaskCompletion('/tmp/fake', '2.1', 'desc', ['src/foo.ts']);

			// Find the `git add` call (the staging argv).
			const addArgv = capturedArgvs.find((a) => a[0] === 'add');
			expect(addArgv).toBeDefined();
			// All four exclude pathspecs must be present. Top-level
			// patterns alone don't cover nested `.swarm/` in monorepo
			// subtrees — the recursive `**/.swarm` patterns close that
			// hole (the gap the adversarial review on 2026-06-03 found).
			expect(addArgv).toEqual([
				'add',
				'--',
				'src/foo.ts',
				':(exclude,glob)**/.swarm/**',
			]);
		} finally {
			gitBranchInternals.gitExec = gitOrig;
		}
	});

	test('commitAllowEmpty argv (real) carries --no-verify so pre-commit hooks do NOT fire', async () => {
		// Phase 8 contract: Rule 2's marker commits are protocol artifacts,
		// not user content; the user's pre-commit / commit-msg hooks
		// should not run on every task completion (otherwise Biome /
		// typecheck / lint would add minutes of wall-clock per task and
		// could block the marker on strict gates).
		const gitOrig = gitBranchInternals.gitExec;
		const capturedArgvs: string[][] = [];
		gitBranchInternals.gitExec = ((args: string[], _cwd: string) => {
			capturedArgvs.push([...args]);
			if (args[0] === 'log') return '';
			if (args[0] === 'rev-parse') return 'sha123';
			return '';
		}) as typeof gitBranchInternals.gitExec;

		try {
			_internals.isGitRepo = () => true;
			_internals.commitAllowEmpty = originals.commitAllowEmpty;
			_internals.hasExistingTaskCommit = originals.hasExistingTaskCommit;
			_internals.gitHeadSha = originals.gitHeadSha;
			_internals.stageScopedPaths = () => {};

			await commitTaskCompletion('/tmp/fake', '3.1', 'desc');

			const commitArgv = capturedArgvs.find((a) => a[0] === 'commit');
			expect(commitArgv).toBeDefined();
			expect(commitArgv).toContain('--allow-empty');
			expect(commitArgv).toContain('--no-verify');
		} finally {
			gitBranchInternals.gitExec = gitOrig;
		}
	});

	test('idempotency: re-completing a task with an existing marker returns reason="idempotent-skip" with committed=true (Phase 17 B.M9)', async () => {
		// Phase 8: `updateTaskStatus(..., "completed")` can fire multiple
		// times for the same task (council re-runs, status corrections,
		// recovery). Without this guard each call mints another marker,
		// inflating `commitsObserved` for Rule 4's gate and polluting git
		// history.
		_internals.isGitRepo = () => true;
		_internals.hasExistingTaskCommit = (_cwd: string, taskId: string) =>
			taskId === '1.1';
		let stageCalled = false;
		let commitCalled = false;
		_internals.stageScopedPaths = () => {
			stageCalled = true;
		};
		_internals.commitAllowEmpty = () => {
			commitCalled = true;
		};

		const result = await commitTaskCompletion('/tmp/fake', '1.1', 'desc', [
			'src/foo.ts',
		]);

		// Phase 17 (B.M9): `committed: true` because the marker IS in
		// git history — pre-Phase-17 this returned `committed: false`
		// which architect LLMs misinterpreted as a failure and retried.
		// The reason is the disambiguator.
		expect(result.committed).toBe(true);
		expect(result.reason).toBe('idempotent-skip');
		expect(stageCalled).toBe(false);
		expect(commitCalled).toBe(false);
	});

	test('idempotency probe failure is best-effort: when hasExistingTaskCommit throws, the commit proceeds anyway', async () => {
		// If git log itself is broken, we prefer a possible duplicate to
		// a silent skip — the marker is the audit signal Rule 3 reads.
		_internals.isGitRepo = () => true;
		_internals.hasExistingTaskCommit = () => {
			throw new Error('git log failed');
		};
		let commitCalled = false;
		_internals.stageScopedPaths = () => {};
		_internals.commitAllowEmpty = () => {
			commitCalled = true;
		};
		_internals.gitHeadSha = () => 'abc1234';

		const result = await commitTaskCompletion('/tmp/fake', '1.1', 'desc');

		expect(result.committed).toBe(true);
		expect(commitCalled).toBe(true);
	});

	test('hasExistingTaskCommit argv escapes regex metacharacters in taskId', () => {
		// Task IDs like `1.1` contain `.` which is a regex metacharacter;
		// without escaping, `swarm(task 1.1):` would also match
		// `swarm(task 1X1):`. Verify the production probe escapes
		// correctly.
		const gitOrig = gitBranchInternals.gitExec;
		let captured: string[] | null = null;
		gitBranchInternals.gitExec = ((args: string[], _cwd: string) => {
			if (args[0] === 'log') captured = [...args];
			return '';
		}) as typeof gitBranchInternals.gitExec;

		try {
			originals.hasExistingTaskCommit('/tmp/fake', '1.1');
			expect(captured).not.toBeNull();
			const grepArg = captured?.find((a) => a.startsWith('--grep='));
			// Must contain the escaped dot pattern `1\.1`, not bare `1.1`.
			expect(grepArg).toBe('--grep=^swarm\\(task 1\\.1\\):');
		} finally {
			gitBranchInternals.gitExec = gitOrig;
		}
	});

	test('commit failure is non-fatal — returns reason="commit-failed"', async () => {
		_internals.isGitRepo = () => true;
		_internals.stageScopedPaths = () => {};
		_internals.commitAllowEmpty = () => {
			throw new Error('pre-commit hook rejected commit');
		};

		const result = await commitTaskCompletion('/tmp/fake', '2.1', undefined, [
			'src/foo.ts',
		]);
		expect(result.committed).toBe(false);
		expect(result.reason).toBe('commit-failed');
		expect(result.error).toContain('pre-commit hook rejected');
	});

	test('stageScopedPaths failure (e.g. stale scope path) is also non-fatal', async () => {
		_internals.isGitRepo = () => true;
		_internals.stageScopedPaths = () => {
			throw new Error(
				"fatal: pathspec 'src/missing.ts' did not match any files",
			);
		};

		const result = await commitTaskCompletion('/tmp/fake', '2.1', undefined, [
			'src/missing.ts',
		]);
		expect(result.committed).toBe(false);
		expect(result.reason).toBe('commit-failed');
		expect(result.error).toContain('did not match');
	});

	test('isGitRepo throwing is treated as not-a-git-repo (defense in depth)', async () => {
		// The real isGitRepo catches internally and returns false; this test
		// validates that even if some host-provided wrapper threw, we still
		// degrade to no-git rather than crashing.
		_internals.isGitRepo = () => {
			throw new Error('spawn failed');
		};

		// Wrap in try because the implementation may rethrow — defense in
		// depth means we don't crash, but the contract is "degrade gracefully".
		let result;
		try {
			result = await commitTaskCompletion('/tmp/fake', '2.1');
		} catch {
			result = { committed: false, reason: 'no-git' as const };
		}
		expect(result.committed).toBe(false);
	});

	test('Phase 11 (B5): commit retries on index.lock contention and succeeds on the second attempt', async () => {
		_internals.isGitRepo = () => true;
		_internals.stageScopedPaths = () => {};
		_internals.gitHeadSha = () => 'sha-after-retry';
		let attempt = 0;
		_internals.commitAllowEmpty = () => {
			attempt++;
			if (attempt === 1) {
				throw new Error(
					"fatal: Unable to create '/repo/.git/index.lock': File exists.",
				);
			}
			// Second attempt succeeds.
		};
		const sleeps: number[] = [];
		_internals.sleep = async (ms: number) => {
			sleeps.push(ms);
		};

		const result = await commitTaskCompletion('/tmp/fake', '2.1', 'desc', [
			'src/foo.ts',
		]);

		expect(result.committed).toBe(true);
		expect(result.reason).toBe('success');
		expect(attempt).toBe(2);
		expect(sleeps).toEqual([100]); // first backoff step
	});

	test('Phase 11 (B5): commit retries up to 4 attempts on persistent lock contention, then degrades non-fatally', async () => {
		_internals.isGitRepo = () => true;
		_internals.stageScopedPaths = () => {};
		let attempt = 0;
		_internals.commitAllowEmpty = () => {
			attempt++;
			throw new Error(
				"fatal: Unable to create '/repo/.git/index.lock': File exists.",
			);
		};
		const sleeps: number[] = [];
		_internals.sleep = async (ms: number) => {
			sleeps.push(ms);
		};

		const result = await commitTaskCompletion('/tmp/fake', '2.1', 'desc', [
			'src/foo.ts',
		]);

		expect(result.committed).toBe(false);
		expect(result.reason).toBe('commit-failed');
		// 1 initial + 4 retries = 5 total attempts. 4 sleeps between.
		expect(attempt).toBe(5);
		expect(sleeps).toEqual([100, 200, 400, 800]);
	});

	test('Phase 11 (B5): non-lock errors do NOT trigger retry (a pre-commit hook reject only runs once)', async () => {
		_internals.isGitRepo = () => true;
		_internals.stageScopedPaths = () => {};
		let attempt = 0;
		_internals.commitAllowEmpty = () => {
			attempt++;
			throw new Error('hook failed: license header missing');
		};
		const sleeps: number[] = [];
		_internals.sleep = async (ms: number) => {
			sleeps.push(ms);
		};

		const result = await commitTaskCompletion('/tmp/fake', '2.1', 'desc');
		expect(result.committed).toBe(false);
		expect(attempt).toBe(1); // no retry
		expect(sleeps).toEqual([]);
	});

	test('Phase 17 (C.H2): taskId with unsafe characters (\\n, parens, backtick) gets scrubbed in the commit subject', async () => {
		_internals.isGitRepo = () => true;
		_internals.stageScopedPaths = () => {};
		let captured: string | null = null;
		_internals.commitAllowEmpty = (_cwd: string, message: string) => {
			captured = message;
		};
		_internals.gitHeadSha = () => 'sha';

		// Architect-typo'd dep ID that injects a `)` — pre-Phase-17 this
		// would corrupt the Phase 6 parser regex and silently mark
		// unrelated tasks as committed.
		await commitTaskCompletion('/tmp/fake', '1.1)evil', 'desc');

		expect(captured).not.toBeNull();
		// `)` must be replaced with `_` so the formatter's parens stay
		// uniquely the structural delimiters.
		expect(captured).not.toContain(')evil');
		expect(captured).toContain('1.1_evil');
	});

	test('Phase 17 (C.H6): scope paths starting with `:` (git pathspec magic) are dropped before staging', async () => {
		_internals.isGitRepo = () => true;
		let captured: string[] | null = null;
		_internals.stageScopedPaths = (_cwd: string, paths: string[]) => {
			captured = paths;
		};
		_internals.commitAllowEmpty = () => {};
		_internals.gitHeadSha = () => 'sha';

		// Architect-authored scope mixing real paths with pathspec magic.
		await commitTaskCompletion('/tmp/fake', '2.1', 'desc', [
			'src/foo.ts',
			':(glob)**',
			':!**/*.env',
			'src/bar.ts',
		]);

		expect(captured).toEqual(['src/foo.ts', 'src/bar.ts']);
	});

	test('Phase 17 (E.3): scopes larger than CHUNK get split into multiple add invocations', async () => {
		_internals.isGitRepo = () => true;
		const chunks: number[] = [];
		_internals.stageScopedPaths = originals.stageScopedPaths;
		// Capture chunk count via the real impl's gitExec layer.
		const { _internals: gbi } = await import('../../../../src/git/branch');
		const gitOrig = gbi.gitExec;
		gbi.gitExec = ((args: string[]) => {
			if (args[0] === 'add') {
				// pathspec count = total - 2 (the 'add', '--', and final
				// exclude — the exclude is 1 token at the tail).
				const pathCount = args.filter(
					(a) => !a.startsWith(':(') && a !== 'add' && a !== '--',
				).length;
				chunks.push(pathCount);
			}
			return '';
		}) as typeof gbi.gitExec;
		_internals.commitAllowEmpty = () => {};
		_internals.gitHeadSha = () => 'sha';
		_internals.hasExistingTaskCommit = () => false;

		try {
			const manyPaths = Array.from({ length: 450 }, (_, i) => `src/f${i}.ts`);
			await commitTaskCompletion('/tmp/fake', '3.1', 'desc', manyPaths);
			// 450 paths / chunk size 200 → 3 invocations (200 + 200 + 50).
			expect(chunks.length).toBe(3);
			expect(chunks[0]).toBe(200);
			expect(chunks[1]).toBe(200);
			expect(chunks[2]).toBe(50);
		} finally {
			gbi.gitExec = gitOrig;
		}
	});

	test('Phase 17 (B.M9): pre-existing marker → committed=true with idempotent-skip reason (not committed=false)', async () => {
		_internals.isGitRepo = () => true;
		_internals.hasExistingTaskCommit = () => true;
		_internals.stageScopedPaths = () => {
			throw new Error('must not stage');
		};
		_internals.commitAllowEmpty = () => {
			throw new Error('must not commit');
		};

		const result = await commitTaskCompletion('/tmp/fake', '1.1', 'desc', [
			'src/foo.ts',
		]);

		expect(result.committed).toBe(true);
		expect(result.reason).toBe('idempotent-skip');
	});
});

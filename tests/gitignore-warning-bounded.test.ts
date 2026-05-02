/**
 * Regression tests for the plugin-load hang caused by unbounded `git`
 * subprocess calls in `ensureSwarmGitExcluded`.
 *
 * Engineering rule under test:
 *   "OpenCode plugin registration must never await unbounded filesystem,
 *    Git, network, package-manager, repo-scan, or cache-repair work."
 *
 * The previous implementation issued up to four sequential `bunSpawn(['git', ...])`
 * calls with no per-call `timeout`, no `stdin: 'ignore'`, and no
 * `try { … } finally { proc.kill() }`. Any host condition that prevents
 * `git` from exiting promptly (antivirus interception, credential prompt,
 * NFS-stalled `.git`, Bun-on-Windows stdin pipe semantics) hangs plugin
 * init forever; OpenCode's plugin host silently drops a plugin whose entry
 * never resolves, so no agents appear in the TUI / GUI.
 *
 * Tests use the file-scoped `_internals` DI seam exported from
 * `gitignore-warning.ts` rather than `mock.module`, because Bun runs all
 * test files in a shared process and `mock.module` mutations leak across
 * unrelated suites that import `bun-compat`.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	_internals,
	ENSURE_SWARM_GIT_EXCLUDED_OUTER_TIMEOUT_MS,
	ENSURE_SWARM_GIT_EXCLUDED_PER_CALL_TIMEOUT_MS,
	ensureSwarmGitExcluded,
	resetSwarmGitExcludedState,
} from '../src/utils/gitignore-warning';

const realBunSpawn = _internals.bunSpawn;

afterEach(() => {
	_internals.bunSpawn = realBunSpawn;
});

beforeEach(() => {
	resetSwarmGitExcludedState();
});

describe('ensureSwarmGitExcluded — bounded execution', () => {
	test('exports the per-call and outer timeout constants', () => {
		expect(ENSURE_SWARM_GIT_EXCLUDED_OUTER_TIMEOUT_MS).toBe(3_000);
		expect(ENSURE_SWARM_GIT_EXCLUDED_PER_CALL_TIMEOUT_MS).toBe(1_500);
	});

	test('every bunSpawn call passes timeout + stdin:ignore + pipe stdout/stderr', async () => {
		const observed: Array<Record<string, unknown>> = [];
		const killCalls = { count: 0 };
		_internals.bunSpawn = ((
			_cmd: string[],
			options?: Record<string, unknown>,
		) => {
			if (options) observed.push(options);
			// Resolve with a non-zero exit so the function short-circuits
			// after the first spawn — happy-path coverage is in a separate
			// test below.
			return {
				stdout: { text: () => Promise.resolve('') },
				stderr: { text: () => Promise.resolve('') },
				exited: Promise.resolve(1),
				exitCode: 1,
				kill: () => {
					killCalls.count += 1;
				},
			};
		}) as unknown as typeof realBunSpawn;

		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-bounded-1-'));
		try {
			await ensureSwarmGitExcluded(tmpDir, { quiet: true });

			expect(observed.length).toBeGreaterThanOrEqual(1);
			for (const opts of observed) {
				expect(opts.timeout).toBe(
					ENSURE_SWARM_GIT_EXCLUDED_PER_CALL_TIMEOUT_MS,
				);
				expect(opts.stdin).toBe('ignore');
				expect(opts.stdout).toBe('pipe');
				expect(opts.stderr).toBe('pipe');
			}
			// Every spawn site must invoke kill() in its finally — defensive
			// cleanup so a runtime that ignored `timeout` cannot leak orphans.
			expect(killCalls.count).toBe(observed.length);
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	test('reaches every spawn site (4 git calls) when the happy path runs', async () => {
		const cmds: string[][] = [];
		const killCalls = { count: 0 };
		let callIndex = 0;

		const responses: Array<{ exitCode: number; stdout: string }> = [
			// 1. rev-parse --show-toplevel
			{ exitCode: 0, stdout: '/tmp/fake-gitroot\n' },
			// 2. rev-parse --git-path info/exclude
			{ exitCode: 0, stdout: '/tmp/fake-gitroot/.git/info/exclude\n' },
			// 3. check-ignore -q .swarm/.gitkeep — non-zero means NOT ignored
			{ exitCode: 1, stdout: '' },
			// 4. ls-files -- .swarm — empty stdout means no tracked files
			{ exitCode: 0, stdout: '' },
		];

		_internals.bunSpawn = ((cmd: string[]) => {
			cmds.push(cmd);
			const response = responses[callIndex] ?? { exitCode: 0, stdout: '' };
			callIndex += 1;
			return {
				stdout: { text: () => Promise.resolve(response.stdout) },
				stderr: { text: () => Promise.resolve('') },
				exited: Promise.resolve(response.exitCode),
				exitCode: response.exitCode,
				kill: () => {
					killCalls.count += 1;
				},
			};
		}) as unknown as typeof realBunSpawn;

		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-bounded-2-'));
		try {
			fs.mkdirSync('/tmp/fake-gitroot/.git/info', { recursive: true });
			await ensureSwarmGitExcluded(tmpDir, { quiet: true });
			expect(cmds.length).toBe(4);
			expect(cmds[0]).toEqual([
				'git',
				'-C',
				tmpDir,
				'rev-parse',
				'--show-toplevel',
			]);
			expect(cmds[1]).toEqual([
				'git',
				'-C',
				tmpDir,
				'rev-parse',
				'--git-path',
				'info/exclude',
			]);
			expect(cmds[2]).toEqual([
				'git',
				'-C',
				tmpDir,
				'check-ignore',
				'-q',
				'.swarm/.gitkeep',
			]);
			expect(cmds[3]).toEqual([
				'git',
				'-C',
				tmpDir,
				'ls-files',
				'--',
				'.swarm',
			]);
			// Every spawn site invokes kill() in its finally.
			expect(killCalls.count).toBe(4);
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
			fs.rmSync('/tmp/fake-gitroot', { recursive: true, force: true });
		}
	});
});

import { afterEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	_internals,
	clearWorktreeMergeStatus,
	getWorktreeMergeFailure,
	initDurableStatusPath,
	recordWorktreeMergeFailure,
} from './worktree-merge-status';

const FAILURE_STUB = {
	outcome: 'failed' as const,
	stage: 'merge',
	message: 'conflict in src/a.ts',
};

describe('worktree-merge-status registry — in-memory', () => {
	afterEach(() => {
		_internals.resetForTest();
	});

	it('records and retrieves a failure keyed by task id', () => {
		recordWorktreeMergeFailure('2.1', FAILURE_STUB);
		expect(getWorktreeMergeFailure('2.1')).toEqual(FAILURE_STUB);
	});

	it('records a partial outcome distinctly from failed', () => {
		recordWorktreeMergeFailure('2.2', {
			outcome: 'partial',
			stage: 'rebase',
			message: 'partial apply',
		});
		expect(getWorktreeMergeFailure('2.2')?.outcome).toBe('partial');
	});

	it('returns undefined for a task with no recorded failure', () => {
		expect(getWorktreeMergeFailure('nope')).toBeUndefined();
	});

	it('clear() removes a recorded failure (success supersedes prior failure)', () => {
		recordWorktreeMergeFailure('2.3', FAILURE_STUB);
		expect(getWorktreeMergeFailure('2.3')).toBeDefined();
		clearWorktreeMergeStatus('2.3');
		expect(getWorktreeMergeFailure('2.3')).toBeUndefined();
	});

	it('is a no-op (no throw) for undefined task ids — non-plan dispatches', () => {
		expect(() =>
			recordWorktreeMergeFailure(undefined, FAILURE_STUB),
		).not.toThrow();
		expect(() => clearWorktreeMergeStatus(undefined)).not.toThrow();
		expect(_internals.failuresByTask.size).toBe(0);
	});

	it('a later record for the same task overwrites the earlier one', () => {
		recordWorktreeMergeFailure('2.4', {
			outcome: 'partial',
			stage: 'auto-commit',
			message: 'first',
		});
		recordWorktreeMergeFailure('2.4', {
			outcome: 'failed',
			stage: 'merge',
			message: 'second',
		});
		expect(getWorktreeMergeFailure('2.4')).toEqual({
			outcome: 'failed',
			stage: 'merge',
			message: 'second',
		});
	});
});

describe('worktree-merge-status registry — durability (restart survival)', () => {
	let tmpDir: string;

	afterEach(() => {
		_internals.resetForTest();
		if (tmpDir) {
			try {
				fs.rmSync(tmpDir, { recursive: true });
			} catch {}
		}
	});

	function makeTmpDir(): string {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-merge-status-test-'));
		fs.mkdirSync(path.join(tmpDir, '.swarm'), { recursive: true });
		return tmpDir;
	}

	it('persists failure to disk immediately on record', () => {
		const dir = makeTmpDir();
		initDurableStatusPath(dir);

		recordWorktreeMergeFailure('task-A', FAILURE_STUB);

		const statusFile = path.join(dir, '.swarm', 'worktree-merge-status.json');
		expect(fs.existsSync(statusFile)).toBe(true);
		const data = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
		expect(data['task-A']).toEqual(FAILURE_STUB);
	});

	it('survives plugin restart: re-init after clearing in-memory map restores from disk', () => {
		const dir = makeTmpDir();
		initDurableStatusPath(dir);
		recordWorktreeMergeFailure('task-B', FAILURE_STUB);

		// Simulate plugin restart: clear in-memory state
		_internals.resetForTest();
		expect(_internals.failuresByTask.size).toBe(0);

		// Re-init as plugin startup would do
		initDurableStatusPath(dir);

		// Failure should be restored from disk
		expect(getWorktreeMergeFailure('task-B')).toEqual(FAILURE_STUB);
	});

	it('clearWorktreeMergeStatus removes from disk so restart does not see stale entry', () => {
		const dir = makeTmpDir();
		initDurableStatusPath(dir);
		recordWorktreeMergeFailure('task-C', FAILURE_STUB);
		clearWorktreeMergeStatus('task-C');

		// Simulate restart
		_internals.resetForTest();
		initDurableStatusPath(dir);

		// Cleared entry must not come back
		expect(getWorktreeMergeFailure('task-C')).toBeUndefined();
	});

	it('a successful re-dispatch (clear) then failure records the failure durably', () => {
		const dir = makeTmpDir();
		initDurableStatusPath(dir);
		recordWorktreeMergeFailure('task-D', FAILURE_STUB);
		clearWorktreeMergeStatus('task-D'); // success re-dispatch
		recordWorktreeMergeFailure('task-D', {
			outcome: 'partial',
			stage: 'rebase',
			message: 'retry fail',
		});

		_internals.resetForTest();
		initDurableStatusPath(dir);

		expect(getWorktreeMergeFailure('task-D')).toEqual({
			outcome: 'partial',
			stage: 'rebase',
			message: 'retry fail',
		});
	});

	it('corrupt status file fails open — empty map, no throw', () => {
		const dir = makeTmpDir();
		const statusFile = path.join(dir, '.swarm', 'worktree-merge-status.json');
		fs.writeFileSync(statusFile, '{ CORRUPT JSON ]]', 'utf-8');

		// Should not throw; map should be empty
		expect(() => initDurableStatusPath(dir)).not.toThrow();
		expect(_internals.failuresByTask.size).toBe(0);
	});

	it('missing .swarm dir is created on first record', () => {
		// Provide a dir without pre-creating .swarm
		const base = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-no-swarm-'));
		tmpDir = base;
		initDurableStatusPath(base);

		expect(() =>
			recordWorktreeMergeFailure('task-E', FAILURE_STUB),
		).not.toThrow();

		const statusFile = path.join(base, '.swarm', 'worktree-merge-status.json');
		expect(fs.existsSync(statusFile)).toBe(true);
	});

	it('multiple tasks all survive restart', () => {
		const dir = makeTmpDir();
		initDurableStatusPath(dir);

		recordWorktreeMergeFailure('x.1', FAILURE_STUB);
		recordWorktreeMergeFailure('x.2', {
			outcome: 'partial',
			stage: 'rebase',
			message: 'p',
		});
		recordWorktreeMergeFailure('x.3', FAILURE_STUB);
		clearWorktreeMergeStatus('x.2'); // cleared mid-session

		_internals.resetForTest();
		initDurableStatusPath(dir);

		expect(getWorktreeMergeFailure('x.1')).toEqual(FAILURE_STUB);
		expect(getWorktreeMergeFailure('x.2')).toBeUndefined(); // was cleared
		expect(getWorktreeMergeFailure('x.3')).toEqual(FAILURE_STUB);
	});
});

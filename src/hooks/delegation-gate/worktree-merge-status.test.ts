import { afterEach, describe, expect, it } from 'bun:test';
import {
	_internals,
	clearWorktreeMergeStatus,
	getWorktreeMergeFailure,
	recordWorktreeMergeFailure,
} from './worktree-merge-status';

describe('worktree-merge-status registry', () => {
	afterEach(() => {
		_internals.failuresByTask.clear();
	});

	it('records and retrieves a failure keyed by task id', () => {
		recordWorktreeMergeFailure('2.1', {
			outcome: 'failed',
			stage: 'merge',
			message: 'conflict in src/a.ts',
		});
		const got = getWorktreeMergeFailure('2.1');
		expect(got).toEqual({
			outcome: 'failed',
			stage: 'merge',
			message: 'conflict in src/a.ts',
		});
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
		recordWorktreeMergeFailure('2.3', {
			outcome: 'failed',
			stage: 'merge',
			message: 'x',
		});
		expect(getWorktreeMergeFailure('2.3')).toBeDefined();
		clearWorktreeMergeStatus('2.3');
		expect(getWorktreeMergeFailure('2.3')).toBeUndefined();
	});

	it('is a no-op (no throw) for undefined task ids — non-plan dispatches', () => {
		expect(() =>
			recordWorktreeMergeFailure(undefined, {
				outcome: 'failed',
				stage: 'merge',
				message: 'x',
			}),
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

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Plan } from '../../src/config/plan-schema';
import type { StandardWorktreeDispatch } from '../../src/hooks/delegation-gate/worktree-isolation';
import {
	finishStandardWorktreeDispatch,
	_internals as wtiInternals,
} from '../../src/hooks/delegation-gate/worktree-isolation';
import { _internals as mergeStatus } from '../../src/hooks/delegation-gate/worktree-merge-status';
import {
	_internals as managerInternals,
	savePlan,
	updateTaskStatus,
} from '../../src/plan/manager';

/**
 * End-to-end coverage for the Epic Mode × worktree-isolation interaction —
 * the combination that had no test coverage before the Epic port. It joins
 * the two halves of the guard:
 *
 *   WRITER: `finishStandardWorktreeDispatch` records the merge-back outcome
 *           into the leaf status registry (failed/partial → record;
 *           merged → clear).
 *   READER: Epic Rule 2 in `updateTaskStatus` consults that registry and
 *           skips the completion marker when the task's work never landed.
 */
function makePlan(): Plan {
	return {
		schema_version: '1.0.0',
		title: 'Epic × Worktree Guard',
		swarm: 'test-swarm',
		current_phase: 1,
		phases: [
			{
				id: 1,
				name: 'Phase 1',
				status: 'pending',
				tasks: [
					{
						id: '1.1',
						phase: 1,
						status: 'in_progress',
						size: 'small',
						description: 'Worktree-isolated task',
						depends: [],
						files_touched: [],
					},
				],
			},
		],
		migration_status: 'native',
	};
}

function makeDispatch(planTaskId: string): StandardWorktreeDispatch {
	return {
		callID: `call-${planTaskId}`,
		parentSessionID: `architect-session-${planTaskId}`,
		taskId: planTaskId,
		planTaskId,
		handle: {
			worktreePath: `/tmp/wt-${planTaskId}`,
			branchName: `swarm-lane/${planTaskId}`,
			purpose: 'lane' as never,
			id: `wt-${planTaskId}`,
			sessionId: `coder-${planTaskId}`,
		},
		mergeStrategy: 'merge',
	};
}

describe('Epic Mode × worktree isolation — merge-back guard (e2e)', () => {
	let tempDir: string;
	const origWti = {
		attemptMergeBackFromDirty: wtiInternals.attemptMergeBackFromDirty,
		removeWorktree: wtiInternals.removeWorktree,
		postMergeCleanup: wtiInternals.postMergeCleanup,
	};
	const origMgr = {
		isGitRepo: managerInternals.isGitRepo,
		isEpicModeActiveForProject: managerInternals.isEpicModeActiveForProject,
		readTaskScopes: managerInternals.readTaskScopes,
		commitTaskCompletion: managerInternals.commitTaskCompletion,
	};
	let commitCalls: string[];

	beforeEach(async () => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'epic-wt-guard-'));
		fs.mkdirSync(path.join(tempDir, '.swarm'), { recursive: true });
		await savePlan(tempDir, makePlan());

		commitCalls = [];
		// No real git/worktree side effects.
		wtiInternals.removeWorktree = async () => {};
		wtiInternals.postMergeCleanup = async () => {};
		managerInternals.isGitRepo = () => true;
		managerInternals.isEpicModeActiveForProject = () => true;
		managerInternals.readTaskScopes = () => undefined;
		managerInternals.commitTaskCompletion = async (_dir, taskId) => {
			commitCalls.push(taskId);
		};
		mergeStatus.failuresByTask.clear();
	});

	afterEach(() => {
		wtiInternals.attemptMergeBackFromDirty = origWti.attemptMergeBackFromDirty;
		wtiInternals.removeWorktree = origWti.removeWorktree;
		wtiInternals.postMergeCleanup = origWti.postMergeCleanup;
		managerInternals.isGitRepo = origMgr.isGitRepo;
		managerInternals.isEpicModeActiveForProject =
			origMgr.isEpicModeActiveForProject;
		managerInternals.readTaskScopes = origMgr.readTaskScopes;
		managerInternals.commitTaskCompletion = origMgr.commitTaskCompletion;
		mergeStatus.failuresByTask.clear();
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('clean merge-back → Rule 2 fires the completion marker', async () => {
		wtiInternals.attemptMergeBackFromDirty = async () => ({
			merged: true as const,
			strategy: 'merge',
			autoCommitted: true,
			cleaned: true,
		});

		await finishStandardWorktreeDispatch(tempDir, makeDispatch('1.1'));
		expect(mergeStatus.failuresByTask.has('1.1')).toBe(false);

		await updateTaskStatus(tempDir, '1.1', 'completed');
		expect(commitCalls).toEqual(['1.1']); // marker written
	});

	it('FAILED merge-back → Rule 2 skips the marker (no false Rule 3 evidence)', async () => {
		wtiInternals.attemptMergeBackFromDirty = async () => ({
			failed: true as const,
			stage: 'merge',
			message: 'merge conflict in src/a.ts',
		});

		await finishStandardWorktreeDispatch(tempDir, makeDispatch('1.1'));
		// Writer recorded the failure...
		expect(mergeStatus.failuresByTask.get('1.1')?.outcome).toBe('failed');

		// ...and the reader honors it: no marker, but status still advances.
		const updated = await updateTaskStatus(tempDir, '1.1', 'completed');
		expect(commitCalls).toEqual([]);
		expect(updated.phases[0].tasks[0].status).toBe('completed');
	});

	it('PARTIAL merge-back → Rule 2 also skips the marker', async () => {
		wtiInternals.attemptMergeBackFromDirty = async () => ({
			partial: true as const,
			stage: 'rebase',
			autoCommitted: true,
			cleaned: false,
			message: 'some hunks did not apply',
		});

		await finishStandardWorktreeDispatch(tempDir, makeDispatch('1.1'));
		expect(mergeStatus.failuresByTask.get('1.1')?.outcome).toBe('partial');

		await updateTaskStatus(tempDir, '1.1', 'completed');
		expect(commitCalls).toEqual([]);
	});

	it('a successful re-dispatch after a failure clears the block and re-enables the marker', async () => {
		// First dispatch fails.
		wtiInternals.attemptMergeBackFromDirty = async () => ({
			failed: true as const,
			stage: 'merge',
			message: 'conflict',
		});
		await finishStandardWorktreeDispatch(tempDir, makeDispatch('1.1'));
		expect(mergeStatus.failuresByTask.has('1.1')).toBe(true);

		// Re-dispatch merges cleanly → failure cleared.
		wtiInternals.attemptMergeBackFromDirty = async () => ({
			merged: true as const,
			strategy: 'merge',
			autoCommitted: true,
			cleaned: true,
		});
		await finishStandardWorktreeDispatch(tempDir, makeDispatch('1.1'));
		expect(mergeStatus.failuresByTask.has('1.1')).toBe(false);

		await updateTaskStatus(tempDir, '1.1', 'completed');
		expect(commitCalls).toEqual(['1.1']);
	});
});

/**
 * Edge-case integration tests for the Stage B advancement helpers inside
 * `createDelegationGateHook` (delegation-gate.ts).
 *
 * The helpers (`advanceStageBForSession`, cross-session seeding, barrier logic)
 * are closure-private, so they are exercised through `toolAfter`. Each test
 * targets a specific edge condition identified in the council review of PR #728.
 *
 * Edge cases covered:
 *  1. null/undefined taskWorkflowStates → advancement loop is skipped
 *  2. Exception during advanceTaskState is caught and does not propagate
 *  3. Parallel barrier with only one agent (reviewer only) → stays at reviewer_run
 *  4. getSeedTaskId returns null (no currentTaskId or lastCoderDelegationTaskId) → cross-session seeding skipped
 *  5. Cross-session task seeding when task already exists → does not overwrite existing state
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { PluginConfig } from '../../../src/config';
import { createDelegationGateHook } from '../../../src/hooks/delegation-gate';
import {
	advanceTaskState,
	ensureAgentSession,
	getTaskState,
	resetSwarmState,
	startAgentSession,
	swarmState,
} from '../../../src/state';

function makeConfig(): PluginConfig {
	return {
		max_iterations: 5,
		qa_retry_limit: 3,
		inject_phase_reminders: true,
		hooks: {
			system_enhancer: true,
			compaction: true,
			agent_activity: true,
			delegation_tracker: false,
			agent_awareness_max_chars: 300,
			delegation_gate: true,
			delegation_max_chars: 4000,
		},
	} as PluginConfig;
}

beforeEach(() => {
	resetSwarmState();
});

afterEach(() => {
	resetSwarmState();
});

describe('Stage B helpers — edge cases', () => {
	it('EC-1: null taskWorkflowStates — advancement loop is skipped without error', async () => {
		const config = makeConfig();
		const hook = createDelegationGateHook(config);

		startAgentSession('sess-ec1', 'architect');
		const session = ensureAgentSession('sess-ec1');
		// Intentionally clear taskWorkflowStates to simulate missing map
		(session as Record<string, unknown>).taskWorkflowStates = null;

		// Should not throw; the loop guard `if (!session.taskWorkflowStates)` must protect it.
		await expect(
			hook.toolAfter(
				{
					tool: 'Task',
					sessionID: 'sess-ec1',
					callID: 'call-ec1',
					args: { subagent_type: 'reviewer' },
				},
				{},
			),
		).resolves.toBeUndefined();
	});

	it('EC-2: exception during advanceTaskState is caught and does not propagate', async () => {
		const config = makeConfig();
		const hook = createDelegationGateHook(config);

		startAgentSession('sess-ec2', 'architect');
		const session = ensureAgentSession('sess-ec2');
		session.currentTaskId = '1.1';
		// Place the task in tests_run — a second advancement to tests_run throws.
		advanceTaskState(session, '1.1', 'coder_delegated');
		advanceTaskState(session, '1.1', 'reviewer_run');
		advanceTaskState(session, '1.1', 'tests_run');

		// Attempting to advance again (test_engineer triggers another try) must not throw.
		await expect(
			hook.toolAfter(
				{
					tool: 'Task',
					sessionID: 'sess-ec2',
					callID: 'call-ec2',
					args: { subagent_type: 'test_engineer' },
				},
				{},
			),
		).resolves.toBeUndefined();

		// State remains at tests_run (not corrupted by the failed advancement).
		expect(getTaskState(session, '1.1')).toBe('tests_run');
	});

	it('EC-3: parallel barrier with reviewer only — stays at reviewer_run, not tests_run', async () => {
		const config = makeConfig();
		const hook = createDelegationGateHook(config);

		startAgentSession('sess-ec3', 'architect');
		const session = ensureAgentSession('sess-ec3');
		session.currentTaskId = '1.1';
		session.taskWorkflowStates.set('1.1', 'coder_delegated');

		// Only reviewer dispatched — test_engineer has NOT completed.
		await hook.toolAfter(
			{
				tool: 'Task',
				sessionID: 'sess-ec3',
				callID: 'call-ec3',
				args: { subagent_type: 'reviewer' },
			},
			{},
		);

		// Barrier not satisfied: state should advance only to reviewer_run.
		expect(getTaskState(session, '1.1')).toBe('reviewer_run');
	});

	it('EC-4: getSeedTaskId returns null — cross-session seeding is skipped', async () => {
		const config = makeConfig();
		const hook = createDelegationGateHook(config);

		// Primary session: no currentTaskId and no lastCoderDelegationTaskId → getSeedTaskId = null.
		startAgentSession('sess-ec4-primary', 'architect');
		const primary = ensureAgentSession('sess-ec4-primary');
		primary.currentTaskId = '1.1';
		primary.taskWorkflowStates.set('1.1', 'coder_delegated');

		// Secondary session: has NO task entries yet.
		startAgentSession('sess-ec4-other', 'architect');
		const other = ensureAgentSession('sess-ec4-other');
		// Clear currentTaskId so cross-session seeding cannot resolve a seed task for primary.
		primary.currentTaskId = undefined as unknown as string;
		// Ensure lastCoderDelegationTaskId is also absent.
		primary.lastCoderDelegationTaskId = undefined;

		await hook.toolAfter(
			{
				tool: 'Task',
				sessionID: 'sess-ec4-primary',
				callID: 'call-ec4',
				args: { subagent_type: 'reviewer' },
			},
			{},
		);

		// The other session must have received no seeded task entries.
		expect(other.taskWorkflowStates.size).toBe(0);
	});

	it('EC-5: cross-session seeding skipped when task already exists in other session', async () => {
		const config = makeConfig();
		const hook = createDelegationGateHook(config);

		startAgentSession('sess-ec5-primary', 'architect');
		const primary = ensureAgentSession('sess-ec5-primary');
		primary.currentTaskId = '1.1';
		primary.taskWorkflowStates.set('1.1', 'coder_delegated');

		// Secondary session already has '1.1' at reviewer_run — must not be downgraded.
		startAgentSession('sess-ec5-other', 'architect');
		const other = ensureAgentSession('sess-ec5-other');
		advanceTaskState(other, '1.1', 'coder_delegated');
		advanceTaskState(other, '1.1', 'reviewer_run');

		await hook.toolAfter(
			{
				tool: 'Task',
				sessionID: 'sess-ec5-primary',
				callID: 'call-ec5',
				args: { subagent_type: 'reviewer' },
			},
			{},
		);

		// The other session must NOT have been downgraded from reviewer_run.
		// It should stay at reviewer_run (or advance, not regress).
		const otherState = getTaskState(other, '1.1');
		expect(['reviewer_run', 'tests_run', 'complete']).toContain(otherState);
	});
});

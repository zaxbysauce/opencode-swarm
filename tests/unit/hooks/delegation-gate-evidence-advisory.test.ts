/**
 * Fail-loud advisory coverage for gate-agent dispatches with unresolved task id.
 *
 * When the primary evidence-write block in `delegation-gate.ts` cannot
 * resolve a task id and the dispatched agent is a gate agent
 * (reviewer/test_engineer/docs/designer/critic/explorer/sme), the hook
 * now pushes a deduped advisory to `pendingAdvisoryMessages` so the next
 * architect system message will surface the corrective nudge.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createDelegationGateHook } from '../../../src/hooks/delegation-gate';
import {
	ensureAgentSession,
	resetSwarmState,
	startAgentSession,
} from '../../../src/state';

const testConfig = {
	hooks: { delegation_gate: true },
} as unknown as Parameters<typeof createDelegationGateHook>[0];

const DEDUP_TOKEN = 'evidence-task-id-unresolved';

describe('delegation-gate: fail-loud advisory for unresolved gate-evidence task id', () => {
	let projectDir: string;

	beforeEach(() => {
		resetSwarmState();
		projectDir = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), 'dg-evidence-advisory-')),
		);
		fs.mkdirSync(path.join(projectDir, '.swarm', 'evidence'), {
			recursive: true,
		});
	});

	afterEach(() => {
		try {
			fs.rmSync(projectDir, { recursive: true, force: true });
		} catch {
			/* best effort */
		}
		resetSwarmState();
	});

	it('pushes exactly one advisory across repeated gate-agent dispatches when task id is unresolvable', async () => {
		const hook = createDelegationGateHook(testConfig, projectDir);

		startAgentSession('sess-adv-1', 'architect');
		const session = ensureAgentSession('sess-adv-1');
		// No currentTaskId, no lastCoderDelegationTaskId, multiple stale workflow
		// states so the `getOnlyWorkflowTaskId` fallback also returns null.
		session.currentTaskId = null;
		session.lastCoderDelegationTaskId = null;
		session.taskWorkflowStates.set('1.1', 'tests_run');
		session.taskWorkflowStates.set('1.2', 'tests_run');
		session.pendingAdvisoryMessages = [];

		await hook.toolAfter(
			{
				tool: 'Task',
				sessionID: 'sess-adv-1',
				callID: 'call-adv-1',
				args: { subagent_type: 'reviewer' },
			},
			{},
		);
		await hook.toolAfter(
			{
				tool: 'Task',
				sessionID: 'sess-adv-1',
				callID: 'call-adv-2',
				args: { subagent_type: 'reviewer' },
			},
			{},
		);

		const matches = (session.pendingAdvisoryMessages ?? []).filter((m) =>
			m.includes(DEDUP_TOKEN),
		);
		expect(matches.length).toBe(1);
		expect(matches[0]).toContain('Gate evidence has NOT been written');
		expect(matches[0]).toContain('reviewer');
	});

	it('does NOT push an advisory when the gate-agent dispatch resolves a task id', async () => {
		const hook = createDelegationGateHook(testConfig, projectDir);

		startAgentSession('sess-adv-2', 'architect');
		const session = ensureAgentSession('sess-adv-2');
		session.currentTaskId = '2.1';
		session.pendingAdvisoryMessages = [];

		await hook.toolAfter(
			{
				tool: 'Task',
				sessionID: 'sess-adv-2',
				callID: 'call-adv-3',
				args: { subagent_type: 'reviewer', task_id: '2.1' },
			},
			{},
		);

		const matches = (session.pendingAdvisoryMessages ?? []).filter((m) =>
			m.includes(DEDUP_TOKEN),
		);
		expect(matches.length).toBe(0);
	});

	it('does NOT push an advisory for a non-gate agent (coder) with unresolvable task id', async () => {
		// The gate at delegation-gate.ts only fires for the gateAgents allowlist
		// (reviewer/test_engineer/docs/designer/critic/explorer/sme). A coder
		// dispatch with no resolvable task id must stay silent — otherwise every
		// coder delegation in a fresh session would spam the architect.
		const hook = createDelegationGateHook(testConfig, projectDir);

		startAgentSession('sess-adv-3', 'architect');
		const session = ensureAgentSession('sess-adv-3');
		session.currentTaskId = null;
		session.lastCoderDelegationTaskId = null;
		session.taskWorkflowStates.set('1.1', 'tests_run');
		session.taskWorkflowStates.set('1.2', 'tests_run');
		session.pendingAdvisoryMessages = [];

		await hook.toolAfter(
			{
				tool: 'Task',
				sessionID: 'sess-adv-3',
				callID: 'call-adv-4',
				args: { subagent_type: 'coder' },
			},
			{},
		);

		const matches = (session.pendingAdvisoryMessages ?? []).filter((m) =>
			m.includes(DEDUP_TOKEN),
		);
		expect(matches.length).toBe(0);
	});

	it('initializes pendingAdvisoryMessages when undefined before pushing the advisory', async () => {
		// The source uses `session.pendingAdvisoryMessages ??= []` to handle a
		// session rehydrated without the field. Cover the undefined branch.
		const hook = createDelegationGateHook(testConfig, projectDir);

		startAgentSession('sess-adv-4', 'architect');
		const session = ensureAgentSession('sess-adv-4');
		session.currentTaskId = null;
		session.lastCoderDelegationTaskId = null;
		session.taskWorkflowStates.set('1.1', 'tests_run');
		session.taskWorkflowStates.set('1.2', 'tests_run');
		// Force the undefined branch (default-initialized sessions get `[]`).
		(
			session as { pendingAdvisoryMessages?: string[] }
		).pendingAdvisoryMessages = undefined;

		await hook.toolAfter(
			{
				tool: 'Task',
				sessionID: 'sess-adv-4',
				callID: 'call-adv-5',
				args: { subagent_type: 'reviewer' },
			},
			{},
		);

		expect(Array.isArray(session.pendingAdvisoryMessages)).toBe(true);
		const matches = (session.pendingAdvisoryMessages ?? []).filter((m) =>
			m.includes(DEDUP_TOKEN),
		);
		expect(matches.length).toBe(1);
	});
});

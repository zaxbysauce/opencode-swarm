/**
 * Cross-phase evidence-routing regression coverage.
 *
 * Before the fix, `getEvidenceTaskId` in `src/hooks/delegation-gate.ts`
 * had a fallback `session.taskWorkflowStates.keys().next().value` that
 * returned a *stale* Phase-N-1 task id when `currentTaskId` and
 * `lastCoderDelegationTaskId` were both null after a phase boundary.
 * That caused `recordAgentDispatch` to write evidence under the wrong
 * (prior-phase) task id when the architect dispatched a non-gate agent
 * (docs/designer/critic/explorer/sme).
 *
 * The fix routes the fallback through `getOnlyWorkflowTaskId` which
 * returns null when more than one strict task id is present. With no
 * `plan.json`, the resolver returns null and no evidence file is written.
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

describe('delegation-gate: cross-phase evidence-routing fallback', () => {
	let projectDir: string;

	beforeEach(() => {
		resetSwarmState();
		projectDir = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), 'dg-evidence-routing-')),
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

	it('does NOT write evidence for stale Phase-1 task id when current task is unset and multiple workflow states exist', async () => {
		const hook = createDelegationGateHook(testConfig, projectDir);

		startAgentSession('sess-routing-1', 'architect');
		const session = ensureAgentSession('sess-routing-1');
		// Seed two stale Phase-1 entries; both should be ignored by the
		// post-fix resolver because the count > 1.
		session.taskWorkflowStates.set('1.1', 'tests_run');
		session.taskWorkflowStates.set('1.2', 'tests_run');
		session.currentTaskId = null;
		session.lastCoderDelegationTaskId = null;

		// Dispatch a non-gate agent (docs) — pre-fix path routes through
		// recordAgentDispatch which would write `.swarm/evidence/1.1.json`.
		await hook.toolAfter(
			{
				tool: 'Task',
				sessionID: 'sess-routing-1',
				callID: 'call-routing-1',
				args: { subagent_type: 'docs' },
			},
			{},
		);

		const evidenceDir = path.join(projectDir, '.swarm', 'evidence');
		const stale = path.join(evidenceDir, '1.1.json');
		const staleAlt = path.join(evidenceDir, '1.2.json');
		expect(fs.existsSync(stale)).toBe(false);
		expect(fs.existsSync(staleAlt)).toBe(false);
	});

	it('does NOT write evidence when taskWorkflowStates is empty and no plan.json exists', async () => {
		// Empty-map path: `getOnlyWorkflowTaskId` returns null, the plan.json
		// scan finds no file, and `getEvidenceTaskId` returns null.
		// No evidence file must be created under any task id.
		const hook = createDelegationGateHook(testConfig, projectDir);

		startAgentSession('sess-routing-empty', 'architect');
		const session = ensureAgentSession('sess-routing-empty');
		session.currentTaskId = null;
		session.lastCoderDelegationTaskId = null;
		// Intentionally leave taskWorkflowStates empty.

		await hook.toolAfter(
			{
				tool: 'Task',
				sessionID: 'sess-routing-empty',
				callID: 'call-routing-empty',
				args: { subagent_type: 'docs' },
			},
			{},
		);

		const evidenceDir = path.join(projectDir, '.swarm', 'evidence');
		const evidenceFiles = fs
			.readdirSync(evidenceDir)
			.filter((f) => f.endsWith('.json'));
		expect(evidenceFiles).toEqual([]);
	});

	it('still writes evidence under the only workflow task id when exactly one entry exists', async () => {
		const hook = createDelegationGateHook(testConfig, projectDir);

		startAgentSession('sess-routing-2', 'architect');
		const session = ensureAgentSession('sess-routing-2');
		// Exactly one strict task id — fallback should resolve to it.
		session.taskWorkflowStates.set('2.1', 'coder_delegated');
		session.currentTaskId = null;
		session.lastCoderDelegationTaskId = null;

		await hook.toolAfter(
			{
				tool: 'Task',
				sessionID: 'sess-routing-2',
				callID: 'call-routing-2',
				args: { subagent_type: 'docs' },
			},
			{},
		);

		const evidencePath = path.join(
			projectDir,
			'.swarm',
			'evidence',
			'2.1.json',
		);
		expect(fs.existsSync(evidencePath)).toBe(true);
	});
});

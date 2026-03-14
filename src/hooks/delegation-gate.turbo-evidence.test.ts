/**
 * Tests for Task 3.16: Propagate turboMode through evidence recording
 *
 * This verifies that when a session has turboMode enabled, the turbo flag is
 * recorded in the evidence JSON files for all agent delegations (reviewer,
 * test_engineer, docs, designer, critic, explorer, sme, coder).
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readTaskEvidence } from '../gate-evidence';
import {
	ensureAgentSession,
	resetSwarmState,
	startAgentSession,
	swarmState,
} from '../state';
import { createDelegationGateHook } from './delegation-gate';

// Minimal plugin config
const testConfig = {
	hooks: { delegation_gate: true },
} as unknown as Parameters<typeof createDelegationGateHook>[0];

let tmpDir: string;
let origCwd: string;

beforeEach(() => {
	resetSwarmState();
	origCwd = process.cwd();
	tmpDir = mkdtempSync(path.join(os.tmpdir(), 'dg-turbo-test-'));
	mkdirSync(path.join(tmpDir, '.swarm'), { recursive: true });
	process.chdir(tmpDir);
});

afterEach(() => {
	process.chdir(origCwd);
	resetSwarmState();
	try {
		rmSync(tmpDir, { recursive: true, force: true });
	} catch {
		/* best effort */
	}
});

/**
 * Fires toolAfter with the given subagent_type for the given session.
 */
async function fireToolAfter(
	sessionId: string,
	subagentType: string,
	callID = 'call-1',
): Promise<void> {
	const hook = createDelegationGateHook(testConfig, tmpDir);
	await hook.toolAfter(
		{
			tool: 'Task',
			sessionID: sessionId,
			callID,
			args: { subagent_type: subagentType },
		},
		{},
	);
}

describe('Task 3.16: turboMode propagation through evidence recording', () => {
	// TEST 1: reviewer delegation with turboMode: true should record turbo: true in evidence
	it('1. reviewer evidence includes turbo: true when session has turboMode: true', async () => {
		startAgentSession('sess-turbo-1', 'architect');
		const session = ensureAgentSession('sess-turbo-1');
		session.currentTaskId = '1.1';
		session.turboMode = true;

		await fireToolAfter('sess-turbo-1', 'reviewer');

		const evidence = await readTaskEvidence(tmpDir, '1.1');
		expect(evidence).not.toBeNull();
		expect(evidence!.gates.reviewer).toBeDefined();
		expect(evidence!.turbo).toBe(true);
	});

	// TEST 2: test_engineer delegation with turboMode: true should record turbo: true
	it('2. test_engineer evidence includes turbo: true when session has turboMode: true', async () => {
		startAgentSession('sess-turbo-2', 'architect');
		const session = ensureAgentSession('sess-turbo-2');
		session.currentTaskId = '1.2';
		session.turboMode = true;

		await fireToolAfter('sess-turbo-2', 'test_engineer');

		const evidence = await readTaskEvidence(tmpDir, '1.2');
		expect(evidence).not.toBeNull();
		expect(evidence!.gates.test_engineer).toBeDefined();
		expect(evidence!.turbo).toBe(true);
	});

	// TEST 3: reviewer delegation with turboMode: false should NOT have turbo: true
	it('3. reviewer evidence does NOT have turbo: true when session has turboMode: false', async () => {
		startAgentSession('sess-turbo-3', 'architect');
		const session = ensureAgentSession('sess-turbo-3');
		session.currentTaskId = '1.3';
		session.turboMode = false;

		await fireToolAfter('sess-turbo-3', 'reviewer');

		const evidence = await readTaskEvidence(tmpDir, '1.3');
		expect(evidence).not.toBeNull();
		expect(evidence!.gates.reviewer).toBeDefined();
		// turbo should be undefined or falsy when turboMode is false
		expect(evidence!.turbo).toBeFalsy();
	});

	// TEST 4: reviewer delegation without turboMode should NOT have turbo: true
	it('4. reviewer evidence does NOT have turbo: true when session has no turboMode', async () => {
		startAgentSession('sess-turbo-4', 'architect');
		const session = ensureAgentSession('sess-turbo-4');
		session.currentTaskId = '1.4';
		// turboMode is undefined by default

		await fireToolAfter('sess-turbo-4', 'reviewer');

		const evidence = await readTaskEvidence(tmpDir, '1.4');
		expect(evidence).not.toBeNull();
		expect(evidence!.gates.reviewer).toBeDefined();
		expect(evidence!.turbo).toBeFalsy();
	});

	// TEST 5: coder dispatch with turboMode: true should record turbo: true via recordAgentDispatch
	it('5. coder dispatch evidence includes turbo: true when session has turboMode: true', async () => {
		startAgentSession('sess-turbo-5', 'architect');
		const session = ensureAgentSession('sess-turbo-5');
		session.currentTaskId = '1.5';
		session.turboMode = true;

		await fireToolAfter('sess-turbo-5', 'coder');

		const evidence = await readTaskEvidence(tmpDir, '1.5');
		expect(evidence).not.toBeNull();
		expect(evidence!.required_gates).toEqual(['reviewer', 'test_engineer']);
		expect(evidence!.turbo).toBe(true);
	});

	// TEST 6: docs delegation with turboMode: true should record turbo: true
	it('6. docs evidence includes turbo: true when session has turboMode: true', async () => {
		startAgentSession('sess-turbo-6', 'architect');
		const session = ensureAgentSession('sess-turbo-6');
		session.currentTaskId = '1.6';
		session.turboMode = true;

		await fireToolAfter('sess-turbo-6', 'docs');

		const evidence = await readTaskEvidence(tmpDir, '1.6');
		expect(evidence).not.toBeNull();
		expect(evidence!.gates.docs).toBeDefined();
		expect(evidence!.turbo).toBe(true);
	});

	// TEST 7: designer delegation with turboMode: true should record turbo: true
	it('7. designer evidence includes turbo: true when session has turboMode: true', async () => {
		startAgentSession('sess-turbo-7', 'architect');
		const session = ensureAgentSession('sess-turbo-7');
		session.currentTaskId = '1.7';
		session.turboMode = true;

		await fireToolAfter('sess-turbo-7', 'designer');

		const evidence = await readTaskEvidence(tmpDir, '1.7');
		expect(evidence).not.toBeNull();
		expect(evidence!.gates.designer).toBeDefined();
		expect(evidence!.turbo).toBe(true);
	});

	// TEST 8: explorer delegation with turboMode: true should record turbo: true
	it('8. explorer evidence includes turbo: true when session has turboMode: true', async () => {
		startAgentSession('sess-turbo-8', 'architect');
		const session = ensureAgentSession('sess-turbo-8');
		session.currentTaskId = '1.8';
		session.turboMode = true;

		await fireToolAfter('sess-turbo-8', 'explorer');

		const evidence = await readTaskEvidence(tmpDir, '1.8');
		expect(evidence).not.toBeNull();
		expect(evidence!.gates.explorer).toBeDefined();
		expect(evidence!.turbo).toBe(true);
	});

	// TEST 9: sme delegation with turboMode: true should record turbo: true
	it('9. sme evidence includes turbo: true when session has turboMode: true', async () => {
		startAgentSession('sess-turbo-9', 'architect');
		const session = ensureAgentSession('sess-turbo-9');
		session.currentTaskId = '1.9';
		session.turboMode = true;

		await fireToolAfter('sess-turbo-9', 'sme');

		const evidence = await readTaskEvidence(tmpDir, '1.9');
		expect(evidence).not.toBeNull();
		expect(evidence!.gates.sme).toBeDefined();
		expect(evidence!.turbo).toBe(true);
	});

	// TEST 10: critic delegation with turboMode: true should record turbo: true
	it('10. critic evidence includes turbo: true when session has turboMode: true', async () => {
		startAgentSession('sess-turbo-10', 'architect');
		const session = ensureAgentSession('sess-turbo-10');
		session.currentTaskId = '1.10';
		session.turboMode = true;

		await fireToolAfter('sess-turbo-10', 'critic');

		const evidence = await readTaskEvidence(tmpDir, '1.10');
		expect(evidence).not.toBeNull();
		expect(evidence!.gates.critic).toBeDefined();
		expect(evidence!.turbo).toBe(true);
	});

	// TEST 11: turboMode persists across multiple agent delegations (all gates get same turbo value)
	it('11. turboMode persists across reviewer + test_engineer delegations', async () => {
		startAgentSession('sess-turbo-11', 'architect');
		const session = ensureAgentSession('sess-turbo-11');
		session.currentTaskId = '1.11';
		session.turboMode = true;

		// First delegation: coder
		await fireToolAfter('sess-turbo-11', 'coder', 'call-1');
		// Second delegation: reviewer
		await fireToolAfter('sess-turbo-11', 'reviewer', 'call-2');
		// Third delegation: test_engineer
		await fireToolAfter('sess-turbo-11', 'test_engineer', 'call-3');

		const evidence = await readTaskEvidence(tmpDir, '1.11');
		expect(evidence).not.toBeNull();
		expect(evidence!.gates.reviewer).toBeDefined();
		expect(evidence!.gates.test_engineer).toBeDefined();
		expect(evidence!.turbo).toBe(true);
	});

	// TEST 12: delegation-chain fallback path also propagates turboMode (when subagent_type not in args)
	it('12. delegation-chain fallback path propagates turboMode to evidence', async () => {
		startAgentSession('sess-turbo-12', 'architect');
		const session = ensureAgentSession('sess-turbo-12');
		session.currentTaskId = null;
		session.lastCoderDelegationTaskId = null;
		session.taskWorkflowStates = new Map();
		session.turboMode = true;

		// Set up delegation chain to trigger fallback path
		swarmState.delegationChains.set('sess-turbo-12', [
			{ from: 'architect', to: 'coder', timestamp: Date.now() },
			{ from: 'coder', to: 'reviewer', timestamp: Date.now() },
		]);

		// Create plan.json to provide task ID
		const planJson = {
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					tasks: [{ id: '1.12', description: 'Test', status: 'in_progress' }],
				},
			],
		};
		writeFileSync(
			path.join(tmpDir, '.swarm', 'plan.json'),
			JSON.stringify(planJson),
		);

		const hook = createDelegationGateHook(testConfig, tmpDir);
		// Fire WITHOUT subagent_type to trigger delegation-chain fallback
		await hook.toolAfter(
			{
				tool: 'Task',
				sessionID: 'sess-turbo-12',
				callID: 'call-1',
				args: {}, // NO subagent_type - triggers fallback
			},
			{},
		);

		const evidence = await readTaskEvidence(tmpDir, '1.12');
		expect(evidence).not.toBeNull();
		expect(evidence!.gates.reviewer).toBeDefined();
		expect(evidence!.turbo).toBe(true);
	});

	// TEST 13: turboMode: false should NOT propagate to evidence even via fallback path
	it('13. delegation-chain fallback path does NOT propagate turboMode when false', async () => {
		startAgentSession('sess-turbo-13', 'architect');
		const session = ensureAgentSession('sess-turbo-13');
		session.currentTaskId = null;
		session.lastCoderDelegationTaskId = null;
		session.taskWorkflowStates = new Map();
		session.turboMode = false;

		// Set up delegation chain to trigger fallback path
		swarmState.delegationChains.set('sess-turbo-13', [
			{ from: 'architect', to: 'coder', timestamp: Date.now() },
			{ from: 'coder', to: 'reviewer', timestamp: Date.now() },
		]);

		// Create plan.json to provide task ID
		const planJson = {
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					tasks: [{ id: '1.13', description: 'Test', status: 'in_progress' }],
				},
			],
		};
		writeFileSync(
			path.join(tmpDir, '.swarm', 'plan.json'),
			JSON.stringify(planJson),
		);

		const hook = createDelegationGateHook(testConfig, tmpDir);
		// Fire WITHOUT subagent_type to trigger delegation-chain fallback
		await hook.toolAfter(
			{
				tool: 'Task',
				sessionID: 'sess-turbo-13',
				callID: 'call-1',
				args: {}, // NO subagent_type - triggers fallback
			},
			{},
		);

		const evidence = await readTaskEvidence(tmpDir, '1.13');
		expect(evidence).not.toBeNull();
		expect(evidence!.gates.reviewer).toBeDefined();
		expect(evidence!.turbo).toBeFalsy();
	});

	// TEST 14: turboMode persists in evidence after multiple agent dispatches (no overwrite)
	it('14. turboMode is preserved when subsequent agents are dispatched (no overwrite)', async () => {
		startAgentSession('sess-turbo-14', 'architect');
		const session = ensureAgentSession('sess-turbo-14');
		session.currentTaskId = '1.14';
		session.turboMode = true;

		// First: docs dispatch
		await fireToolAfter('sess-turbo-14', 'docs', 'call-1');

		let evidence = await readTaskEvidence(tmpDir, '1.14');
		expect(evidence!.turbo).toBe(true);

		// Second: coder dispatch (should NOT overwrite turbo)
		await fireToolAfter('sess-turbo-14', 'coder', 'call-2');

		evidence = await readTaskEvidence(tmpDir, '1.14');
		// turbo should still be true (not overwritten)
		expect(evidence!.turbo).toBe(true);

		// Third: reviewer dispatch
		await fireToolAfter('sess-turbo-14', 'reviewer', 'call-3');

		evidence = await readTaskEvidence(tmpDir, '1.14');
		expect(evidence!.turbo).toBe(true);
	});

	// TEST 15: hasActiveTurboMode returns true when any session has turboMode: true
	it('15. hasActiveTurboMode returns true when session has turboMode: true', async () => {
		const { hasActiveTurboMode } = await import('../state');

		// Session with turboMode: false
		startAgentSession('sess-false', 'architect');
		let session = ensureAgentSession('sess-false');
		session.turboMode = false;
		expect(hasActiveTurboMode()).toBe(false);

		// Session with turboMode: true
		startAgentSession('sess-true', 'architect');
		session = ensureAgentSession('sess-true');
		session.turboMode = true;
		expect(hasActiveTurboMode()).toBe(true);
	});

	// TEST 16: Evidence from stored-args path propagates turboMode correctly
	it('16. stored-args path (subagent_type in args) propagates turboMode to evidence', async () => {
		startAgentSession('sess-turbo-16', 'architect');
		const session = ensureAgentSession('sess-turbo-16');
		session.currentTaskId = '1.16';
		session.turboMode = true;

		// Fire with subagent_type in args (stored-args path)
		const hook = createDelegationGateHook(testConfig, tmpDir);
		await hook.toolAfter(
			{
				tool: 'Task',
				sessionID: 'sess-turbo-16',
				callID: 'call-1',
				args: { subagent_type: 'reviewer' },
			},
			{},
		);

		const evidence = await readTaskEvidence(tmpDir, '1.16');
		expect(evidence).not.toBeNull();
		expect(evidence!.turbo).toBe(true);
	});
});

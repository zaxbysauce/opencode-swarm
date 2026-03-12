/**
 * Integration tests for evidence recording in delegation-gate.ts toolAfter.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { hasPassedAllGates, readTaskEvidence } from '../gate-evidence';
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
	tmpDir = mkdtempSync(path.join(os.tmpdir(), 'dg-evidence-test-'));
	mkdirSync(path.join(tmpDir, '.swarm'), { recursive: true });
	// Point process.cwd() to tmpDir so evidence is written there
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
	const hook = createDelegationGateHook(testConfig);
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

describe('delegation-gate evidence recording', () => {
	it('1. toolAfter with subagent_type: reviewer creates reviewer evidence for currentTaskId', async () => {
		startAgentSession('sess-1', 'architect');
		const session = ensureAgentSession('sess-1');
		session.currentTaskId = '1.1';

		await fireToolAfter('sess-1', 'reviewer');

		const evidence = await readTaskEvidence(tmpDir, '1.1');
		expect(evidence).not.toBeNull();
		expect(evidence!.gates.reviewer).toBeDefined();
		expect(evidence!.gates.reviewer.sessionId).toBe('sess-1');
	});

	it('2. toolAfter with subagent_type: test_engineer creates test_engineer evidence', async () => {
		startAgentSession('sess-2', 'architect');
		const session = ensureAgentSession('sess-2');
		session.currentTaskId = '1.2';

		await fireToolAfter('sess-2', 'test_engineer');

		const evidence = await readTaskEvidence(tmpDir, '1.2');
		expect(evidence).not.toBeNull();
		expect(evidence!.gates.test_engineer).toBeDefined();
	});

	it('3. toolAfter with subagent_type: coder creates dispatch record (required_gates set, gates empty)', async () => {
		startAgentSession('sess-3', 'architect');
		const session = ensureAgentSession('sess-3');
		session.currentTaskId = '1.3';

		await fireToolAfter('sess-3', 'coder');

		const evidence = await readTaskEvidence(tmpDir, '1.3');
		expect(evidence).not.toBeNull();
		expect(evidence!.required_gates).toEqual(['reviewer', 'test_engineer']);
		expect(Object.keys(evidence!.gates)).toHaveLength(0);
	});

	it('4. toolAfter with subagent_type: docs creates evidence with required_gates:[docs] and docs gate', async () => {
		startAgentSession('sess-4', 'architect');
		const session = ensureAgentSession('sess-4');
		session.currentTaskId = '1.4';

		await fireToolAfter('sess-4', 'docs');

		const evidence = await readTaskEvidence(tmpDir, '1.4');
		expect(evidence).not.toBeNull();
		expect(evidence!.required_gates).toEqual(['docs']);
		expect(evidence!.gates.docs).toBeDefined();
	});

	it('5. after both reviewer + test_engineer toolAfter, hasPassedAllGates returns true', async () => {
		startAgentSession('sess-5', 'architect');
		const session = ensureAgentSession('sess-5');
		session.currentTaskId = '1.5';

		// Coder dispatch sets required_gates
		await fireToolAfter('sess-5', 'coder', 'call-1');
		// Reviewer pass
		await fireToolAfter('sess-5', 'reviewer', 'call-2');
		// test_engineer pass
		await fireToolAfter('sess-5', 'test_engineer', 'call-3');

		expect(await hasPassedAllGates(tmpDir, '1.5')).toBe(true);
	});

	it('6. after docs toolAfter on docs task, hasPassedAllGates returns true', async () => {
		startAgentSession('sess-6', 'architect');
		const session = ensureAgentSession('sess-6');
		session.currentTaskId = '1.6';

		await fireToolAfter('sess-6', 'docs', 'call-1');

		expect(await hasPassedAllGates(tmpDir, '1.6')).toBe(true);
	});

	it('7. evidence is recorded even when state advancement produces warnings', async () => {
		startAgentSession('sess-7', 'architect');
		const session = ensureAgentSession('sess-7');
		session.currentTaskId = '1.7';

		// Fire reviewer without prior coder_delegated state — advanceTaskState will warn but not throw
		await fireToolAfter('sess-7', 'reviewer', 'call-1');

		const evidence = await readTaskEvidence(tmpDir, '1.7');
		expect(evidence).not.toBeNull();
		expect(evidence!.gates.reviewer).toBeDefined();
	});

	it('8. evidence uses lastCoderDelegationTaskId when currentTaskId is null', async () => {
		startAgentSession('sess-8', 'architect');
		const session = ensureAgentSession('sess-8');
		session.currentTaskId = null;
		session.lastCoderDelegationTaskId = '2.1';

		await fireToolAfter('sess-8', 'reviewer', 'call-1');

		const evidence = await readTaskEvidence(tmpDir, '2.1');
		expect(evidence).not.toBeNull();
		expect(evidence!.gates.reviewer).toBeDefined();
	});

	it('9. no evidence recorded when both currentTaskId and lastCoderDelegationTaskId are null', async () => {
		startAgentSession('sess-9', 'architect');
		const session = ensureAgentSession('sess-9');
		session.currentTaskId = null;
		session.lastCoderDelegationTaskId = null;

		await fireToolAfter('sess-9', 'reviewer', 'call-1');

		// No task ID → no evidence file created (no error either)
		// Evidence dir may not even exist
		const evidence = await readTaskEvidence(tmpDir, '1.1');
		expect(evidence).toBeNull();
	});

	it('10. docs dispatch then coder dispatch expands required_gates; hasPassedAllGates false until reviewer+test_engineer', async () => {
		startAgentSession('sess-10', 'architect');
		const session = ensureAgentSession('sess-10');
		session.currentTaskId = '3.1';

		// docs delegation — sets required_gates: [docs], records docs gate
		await fireToolAfter('sess-10', 'docs', 'call-1');

		let evidence = await readTaskEvidence(tmpDir, '3.1');
		expect(evidence!.required_gates).toEqual(['docs']);

		// coder delegation — expands required_gates: [docs, reviewer, test_engineer]
		await fireToolAfter('sess-10', 'coder', 'call-2');
		evidence = await readTaskEvidence(tmpDir, '3.1');
		expect(evidence!.required_gates).toEqual(['docs', 'reviewer', 'test_engineer']);

		// Not all gates passed yet
		expect(await hasPassedAllGates(tmpDir, '3.1')).toBe(false);

		// Record reviewer and test_engineer
		await fireToolAfter('sess-10', 'reviewer', 'call-3');
		await fireToolAfter('sess-10', 'test_engineer', 'call-4');

		expect(await hasPassedAllGates(tmpDir, '3.1')).toBe(true);
	});
});

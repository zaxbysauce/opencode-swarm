import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	type DelegationEntry,
	resetSwarmState,
	startAgentSession,
	swarmState,
	getTaskState,
	advanceTaskState,
} from '../../src/state';
import {
	checkReviewerGate,
	recoverTaskStateFromDelegations,
} from '../../src/tools/update-task-status';

let tmpDir: string;

beforeEach(() => {
	tmpDir = mkdtempSync(path.join(os.tmpdir(), 'hotfix-a-test-'));
	mkdirSync(path.join(tmpDir, '.swarm'), { recursive: true });
});

afterEach(() => {
	resetSwarmState();
	try {
		rmSync(tmpDir, { recursive: true, force: true });
	} catch {
		/* best effort */
	}
});

describe('Hotfix A: recoverTaskStateFromDelegations Pass 2 fallback', () => {
	/**
	 * Test: Pass 2 is skipped when Pass 1 already found reviewer/test_engineer
	 *
	 * Scenario: Session has currentTaskId set to the task.
	 * Pass 1 finds reviewer+test_engineer via task-scoped scan.
	 * Pass 2 should NOT run (no double-scan).
	 *
	 * Expected: State advances to tests_run
	 */
	it('Pass 2 is skipped when Pass 1 already found reviewer/test_engineer', () => {
		// Set up session with currentTaskId pointing to our task (Pass 1 will match)
		startAgentSession('session-1', 'architect');
		const session = swarmState.agentSessions.get('session-1')!;
		session.currentTaskId = '5.1';

		// Chain with reviewer and test_engineer after coder
		const chain: DelegationEntry[] = [
			{ from: 'architect', to: 'mega_coder', timestamp: Date.now() },
			{ from: 'architect', to: 'mega_reviewer', timestamp: Date.now() + 1 },
			{ from: 'architect', to: 'mega_test_engineer', timestamp: Date.now() + 2 },
		];
		swarmState.delegationChains.set('session-1', chain);

		// Verify initial state is idle
		expect(getTaskState(session, '5.1')).toBe('idle');

		// Call recoverTaskStateFromDelegations
		recoverTaskStateFromDelegations('5.1');

		// State should advance to tests_run (Pass 1 found both gates)
		const sessionAfter = swarmState.agentSessions.get('session-1')!;
		expect(getTaskState(sessionAfter, '5.1')).toBe('tests_run');

		// checkReviewerGate should pass via session state
		const result = checkReviewerGate('5.1', tmpDir);
		expect(result.blocked).toBe(false);
	});

	/**
	 * Test: Pass 2 scans same-session chains only
	 *
	 * Scenario: Task has NO currentTaskId/lastCoderDelegationTaskId (Pass 1 finds nothing).
	 * Pass 2 runs. There is a chain in an active session that has reviewer+test_engineer after coder.
	 * There is ALSO a chain in a stale/inactive session (not in agentSessions) that has gates.
	 *
	 * Expected: Only active session chain is scanned; inactive session chain is ignored
	 */
	it('Pass 2 scans same-session chains only (cross-session chains ignored)', () => {
		// Set up an active session (NO currentTaskId set, so Pass 1 finds nothing)
		startAgentSession('session-active', 'architect');
		const activeSession = swarmState.agentSessions.get('session-active')!;
		// Do NOT set currentTaskId or lastCoderDelegationTaskId - triggers Pass 2

		// Create chain in ACTIVE session with reviewer+test_engineer after coder
		const activeChain: DelegationEntry[] = [
			{ from: 'architect', to: 'mega_coder', timestamp: Date.now() },
			{ from: 'architect', to: 'mega_reviewer', timestamp: Date.now() + 1 },
			{ from: 'architect', to: 'mega_test_engineer', timestamp: Date.now() + 2 },
		];
		swarmState.delegationChains.set('session-active', activeChain);

		// Create chain in INACTIVE session (not in agentSessions)
		// This should be IGNORED by Pass 2
		const inactiveChain: DelegationEntry[] = [
			{ from: 'architect', to: 'mega_coder', timestamp: Date.now() },
			{ from: 'architect', to: 'mega_reviewer', timestamp: Date.now() + 1 },
			{ from: 'architect', to: 'mega_test_engineer', timestamp: Date.now() + 2 },
		];
		swarmState.delegationChains.set('session-inactive', inactiveChain);

		// Call recoverTaskStateFromDelegations
		recoverTaskStateFromDelegations('5.2');

		// State should advance to tests_run (active session chain was scanned)
		const sessionAfter = swarmState.agentSessions.get('session-active')!;
		expect(getTaskState(sessionAfter, '5.2')).toBe('tests_run');
	});

	/**
	 * Test: Pass 2 skips chains with lastCoderIndex === -1
	 *
	 * Scenario: Task has NO currentTaskId/lastCoderDelegationTaskId (Pass 1 finds nothing).
	 * Pass 2 runs. Chain has reviewer+test_engineer but NO coder.
	 *
	 * Expected: Chain is skipped; state remains idle; gate blocks
	 */
	it('Pass 2 skips chains with no coder (lastCoderIndex === -1)', () => {
		// Set up active session
		startAgentSession('session-1', 'architect');
		// Do NOT set currentTaskId or lastCoderDelegationTaskId - triggers Pass 2

		// Create chain with reviewer+test_engineer but NO coder
		const chain: DelegationEntry[] = [
			{ from: 'architect', to: 'mega_reviewer', timestamp: Date.now() },
			{ from: 'architect', to: 'mega_test_engineer', timestamp: Date.now() + 1 },
		];
		swarmState.delegationChains.set('session-1', chain);

		// Call recoverTaskStateFromDelegations
		recoverTaskStateFromDelegations('5.3');

		// State should remain idle (chain was skipped due to no coder)
		const sessionAfter = swarmState.agentSessions.get('session-1')!;
		expect(getTaskState(sessionAfter, '5.3')).toBe('idle');

		// checkReviewerGate should block
		const result = checkReviewerGate('5.3', tmpDir);
		expect(result.blocked).toBe(true);
	});

	/**
	 * Test: Pass 2 correctly unblocks when both reviewer+test_engineer appear after last coder
	 *
	 * Scenario: Task has NO currentTaskId/lastCoderDelegationTaskId (Pass 1 finds nothing).
	 * Pass 2 runs. Chain has: [..., coder, reviewer, test_engineer]
	 *
	 * Expected: State advances to tests_run; gate passes
	 */
	it('Pass 2 correctly unblocks when both reviewer+test_engineer appear after last coder', () => {
		// Set up active session
		startAgentSession('session-1', 'architect');
		// Do NOT set currentTaskId or lastCoderDelegationTaskId - triggers Pass 2

		// Create chain with reviewer+test_engineer AFTER coder
		const chain: DelegationEntry[] = [
			{ from: 'architect', to: 'mega_coder', timestamp: Date.now() },
			{ from: 'architect', to: 'mega_reviewer', timestamp: Date.now() + 1 },
			{ from: 'architect', to: 'mega_test_engineer', timestamp: Date.now() + 2 },
		];
		swarmState.delegationChains.set('session-1', chain);

		// Call recoverTaskStateFromDelegations
		recoverTaskStateFromDelegations('5.4');

		// State should advance to tests_run
		const sessionAfter = swarmState.agentSessions.get('session-1')!;
		expect(getTaskState(sessionAfter, '5.4')).toBe('tests_run');

		// checkReviewerGate should pass
		const result = checkReviewerGate('5.4', tmpDir);
		expect(result.blocked).toBe(false);
	});
});

describe('Hotfix A: checkReviewerGate chain fallback', () => {
	/**
	 * Test: checkReviewerGate chain fallback unblocks when both appear after last coder
	 *
	 * Scenario: Session state is idle (no tests_run).
	 * Chain has: [..., coder, reviewer, test_engineer]
	 *
	 * Expected: Gate passes via chain fallback
	 */
	it('chain fallback unblocks when both reviewer+test_engineer appear after last coder', () => {
		// Set up session with idle state
		startAgentSession('session-1', 'architect');
		// Session state is idle (no task state advancement)

		// Create chain with reviewer+test_engineer AFTER coder
		const chain: DelegationEntry[] = [
			{ from: 'architect', to: 'mega_coder', timestamp: Date.now() },
			{ from: 'architect', to: 'mega_reviewer', timestamp: Date.now() + 1 },
			{ from: 'architect', to: 'mega_test_engineer', timestamp: Date.now() + 2 },
		];
		swarmState.delegationChains.set('session-1', chain);

		// Gate should pass via chain fallback
		const result = checkReviewerGate('6.1', tmpDir);
		expect(result.blocked).toBe(false);
	});

	/**
	 * Test: checkReviewerGate chain fallback does NOT unblock when only reviewer appears
	 *
	 * Scenario: Session state is idle (no tests_run).
	 * Chain has: [..., coder, reviewer] (no test_engineer)
	 *
	 * Expected: Gate blocks (needs both reviewer AND test_engineer)
	 */
	it('chain fallback does NOT unblock when only reviewer (no test_engineer) appears', () => {
		// Set up session with idle state
		startAgentSession('session-1', 'architect');

		// Create chain with ONLY reviewer (no test_engineer) after coder
		const chain: DelegationEntry[] = [
			{ from: 'architect', to: 'mega_coder', timestamp: Date.now() },
			{ from: 'architect', to: 'mega_reviewer', timestamp: Date.now() + 1 },
			// No test_engineer!
		];
		swarmState.delegationChains.set('session-1', chain);

		// Gate should block (needs BOTH reviewer AND test_engineer)
		const result = checkReviewerGate('6.2', tmpDir);
		expect(result.blocked).toBe(true);
		expect(result.reason).toContain('Missing required state');
	});

	/**
	 * Test: checkReviewerGate chain fallback does NOT unblock on chains with no coder
	 *
	 * Scenario: Session state is idle (no tests_run).
	 * Chain has: [reviewer, test_engineer] (no coder)
	 *
	 * Expected: Chain is skipped; gate blocks
	 */
	it('chain fallback does NOT unblock on chains with no coder', () => {
		// Set up session with idle state
		startAgentSession('session-1', 'architect');

		// Create chain with reviewer+test_engineer but NO coder
		const chain: DelegationEntry[] = [
			{ from: 'architect', to: 'mega_reviewer', timestamp: Date.now() },
			{ from: 'architect', to: 'mega_test_engineer', timestamp: Date.now() + 1 },
		];
		swarmState.delegationChains.set('session-1', chain);

		// Gate should block (chain was skipped due to no coder)
		const result = checkReviewerGate('6.3', tmpDir);
		expect(result.blocked).toBe(true);
	});

	/**
	 * Test: checkReviewerGate chain fallback ignores cross-session chains
	 *
	 * Scenario: Session state is idle.
	 * Active session has chain: [coder] only (no gates after coder).
	 * Inactive session has chain: [coder, reviewer, test_engineer]
	 *
	 * Expected: Gate blocks (only active session chain is scanned)
	 */
	it('chain fallback ignores cross-session chains (same-session only)', () => {
		// Set up active session with idle state
		startAgentSession('session-active', 'architect');

		// Create chain in ACTIVE session with coder but NO gates after it
		const activeChain: DelegationEntry[] = [
			{ from: 'architect', to: 'mega_coder', timestamp: Date.now() },
			// No reviewer or test_engineer after coder!
		];
		swarmState.delegationChains.set('session-active', activeChain);

		// Create chain in INACTIVE session with gates (should be ignored)
		const inactiveChain: DelegationEntry[] = [
			{ from: 'architect', to: 'mega_coder', timestamp: Date.now() },
			{ from: 'architect', to: 'mega_reviewer', timestamp: Date.now() + 1 },
			{ from: 'architect', to: 'mega_test_engineer', timestamp: Date.now() + 2 },
		];
		swarmState.delegationChains.set('session-inactive', inactiveChain);

		// Gate should block (active session chain has no gates after coder)
		const result = checkReviewerGate('6.4', tmpDir);
		expect(result.blocked).toBe(true);
	});

	/**
	 * Test: checkReviewerGate chain fallback requires BOTH gates in SAME chain
	 *
	 * Scenario: Session state is idle.
	 * Chain A: [coder, reviewer]
	 * Chain B: [coder, test_engineer] (different chains)
	 *
	 * Expected: Gate blocks (both gates must be in same chain after last coder)
	 */
	it('chain fallback requires both gates in same chain', () => {
		// Set up active session
		startAgentSession('session-1', 'architect');

		// Create two separate chains: one has reviewer, one has test_engineer
		const chainA: DelegationEntry[] = [
			{ from: 'architect', to: 'mega_coder', timestamp: Date.now() },
			{ from: 'architect', to: 'mega_reviewer', timestamp: Date.now() + 1 },
		];
		const chainB: DelegationEntry[] = [
			{ from: 'architect', to: 'mega_coder', timestamp: Date.now() },
			{ from: 'architect', to: 'mega_test_engineer', timestamp: Date.now() + 1 },
		];
		swarmState.delegationChains.set('session-1', chainA);
		swarmState.delegationChains.set('session-2', chainB);

		// Gate should block (gates not in same chain)
		const result = checkReviewerGate('6.5', tmpDir);
		expect(result.blocked).toBe(true);
	});
});

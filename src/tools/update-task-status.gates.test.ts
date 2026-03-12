import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { recordGateEvidence } from '../gate-evidence';
import {
	advanceTaskState,
	resetSwarmState,
	startAgentSession,
	swarmState,
} from '../state';
import { checkReviewerGate, executeUpdateTaskStatus } from './update-task-status';

let tmpDir: string;

beforeEach(() => {
	tmpDir = mkdtempSync(path.join(os.tmpdir(), 'gate-check-test-'));
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

describe('checkReviewerGate', () => {
	it('allows completion when task state is tests_run', () => {
		startAgentSession('session-1', 'architect');
		const session = swarmState.agentSessions.get('session-1');
		expect(session).toBeDefined();
		if (!session) return;

		advanceTaskState(session, '2.1', 'coder_delegated');
		advanceTaskState(session, '2.1', 'pre_check_passed');
		advanceTaskState(session, '2.1', 'reviewer_run');
		advanceTaskState(session, '2.1', 'tests_run');

		const result = checkReviewerGate('2.1');
		expect(result.blocked).toBe(false);
	});

	it('blocks completion when all valid sessions show idle state (no delegations)', () => {
		startAgentSession('session-1', 'architect');
		startAgentSession('session-2', 'architect');

		// Idle means task was never worked on — gate should block.
		// The recovery mechanism in executeUpdateTaskStatus handles
		// cases where delegations occurred but state wasn't advanced.
		const result = checkReviewerGate('2.2');
		expect(result.blocked).toBe(true);
	});

	it('blocks completion when non-idle states exist but no tests_run/complete state', () => {
		startAgentSession('session-1', 'architect');
		const session = swarmState.agentSessions.get('session-1');
		expect(session).toBeDefined();
		if (!session) return;

		advanceTaskState(session, '2.3', 'coder_delegated');

		const result = checkReviewerGate('2.3');
		expect(result.blocked).toBe(true);
		expect(result.reason).toContain('session-1: coder_delegated');
		expect(result.reason).toContain('Missing required state');
	});

	// ── evidence-first checks ──────────────────────────────────────────────

	it('passes when evidence file has all required gates (code task)', async () => {
		await recordGateEvidence(tmpDir, '3.1', 'reviewer', 'sess-1');
		await recordGateEvidence(tmpDir, '3.1', 'test_engineer', 'sess-2');

		// Session state alone is idle (would block), but evidence wins
		startAgentSession('session-1', 'architect');

		const result = checkReviewerGate('3.1', tmpDir);
		expect(result.blocked).toBe(false);
	});

	it('passes when evidence file has all required gates (docs task — only docs gate)', async () => {
		await recordGateEvidence(tmpDir, '3.2', 'docs', 'sess-1');

		startAgentSession('session-1', 'architect');

		const result = checkReviewerGate('3.2', tmpDir);
		expect(result.blocked).toBe(false);
	});

	it('blocks with specific error when evidence is missing some gates', async () => {
		await recordGateEvidence(tmpDir, '3.3', 'reviewer', 'sess-1');
		// test_engineer not yet recorded — required_gates comes from reviewer default

		startAgentSession('session-1', 'architect');

		// Force required_gates to include both by doing a coder dispatch first
		const { recordAgentDispatch } = await import('../gate-evidence');
		await recordAgentDispatch(tmpDir, '3.3', 'coder');

		const result = checkReviewerGate('3.3', tmpDir);
		expect(result.blocked).toBe(true);
		expect(result.reason).toContain('test_engineer');
		expect(result.reason).toContain('missing required gates');
	});

	it('falls through to session state when no evidence file', () => {
		startAgentSession('session-1', 'architect');
		const session = swarmState.agentSessions.get('session-1')!;
		advanceTaskState(session, '3.4', 'coder_delegated');
		advanceTaskState(session, '3.4', 'pre_check_passed');
		advanceTaskState(session, '3.4', 'reviewer_run');
		advanceTaskState(session, '3.4', 'tests_run');

		// No evidence file in tmpDir, uses session state
		const result = checkReviewerGate('3.4', tmpDir);
		expect(result.blocked).toBe(false);
	});

	it('executeUpdateTaskStatus completes when evidence exists (no session state needed)', async () => {
		// Create plan.json
		const planJson = JSON.stringify({
			schema_version: '1.0.0',
			title: 'Test',
			swarm: 'test-swarm',
			current_phase: 1,
			phases: [{
				id: 1,
				name: 'Phase 1',
				status: 'in_progress',
				tasks: [{ id: '1.1', phase: 1, status: 'in_progress', size: 'small', description: 'test task', depends: [], files_touched: [] }],
			}],
		});
		writeFileSync(path.join(tmpDir, '.swarm', 'plan.json'), planJson);

		await recordGateEvidence(tmpDir, '1.1', 'reviewer', 'sess-1');
		await recordGateEvidence(tmpDir, '1.1', 'test_engineer', 'sess-2');

		const result = await executeUpdateTaskStatus(
			{ task_id: '1.1', status: 'completed', working_directory: tmpDir },
		);
		expect(result.success).toBe(true);
	});

	it('end-to-end: recordGateEvidence → executeUpdateTaskStatus succeeds (code task)', async () => {
		const planJson = JSON.stringify({
			schema_version: '1.0.0',
			title: 'Test',
			swarm: 'test-swarm',
			current_phase: 1,
			phases: [{
				id: 1,
				name: 'Phase 1',
				status: 'in_progress',
				tasks: [{ id: '2.1', phase: 1, status: 'in_progress', size: 'small', description: 'code task', depends: [], files_touched: [] }],
			}],
		});
		writeFileSync(path.join(tmpDir, '.swarm', 'plan.json'), planJson);

		await recordGateEvidence(tmpDir, '2.1', 'reviewer', 'sess-r');
		await recordGateEvidence(tmpDir, '2.1', 'test_engineer', 'sess-te');

		const result = await executeUpdateTaskStatus(
			{ task_id: '2.1', status: 'completed', working_directory: tmpDir },
		);
		expect(result.success).toBe(true);
		expect(result.new_status).toBe('completed');
	});

	it('end-to-end: recordGateEvidence → executeUpdateTaskStatus succeeds (docs task)', async () => {
		const planJson = JSON.stringify({
			schema_version: '1.0.0',
			title: 'Test',
			swarm: 'test-swarm',
			current_phase: 1,
			phases: [{
				id: 1,
				name: 'Phase 1',
				status: 'in_progress',
				tasks: [{ id: '2.2', phase: 1, status: 'in_progress', size: 'small', description: 'docs task', depends: [], files_touched: [] }],
			}],
		});
		writeFileSync(path.join(tmpDir, '.swarm', 'plan.json'), planJson);

		await recordGateEvidence(tmpDir, '2.2', 'docs', 'sess-docs');

		const result = await executeUpdateTaskStatus(
			{ task_id: '2.2', status: 'completed', working_directory: tmpDir },
		);
		expect(result.success).toBe(true);
	});

	it('error message includes names of missing gates', async () => {
		const { recordAgentDispatch } = await import('../gate-evidence');
		await recordAgentDispatch(tmpDir, '3.9', 'coder');
		await recordGateEvidence(tmpDir, '3.9', 'reviewer', 'sess-r');
		// test_engineer missing

		startAgentSession('session-1', 'architect');

		const result = checkReviewerGate('3.9', tmpDir);
		expect(result.blocked).toBe(true);
		expect(result.reason).toContain('test_engineer');
	});
});

/**
 * Council phase gate — end-to-end behaviour after the v7.0.x routing fix.
 *
 * Covers:
 *   1. submit_phase_council_verdicts — quorum enforcement (insufficient and sufficient)
 *   2. submit_phase_council_verdicts — evidence file write contents
 *   3. update_task_status no longer blocks per-task on missing council gate
 *   4. Stage B state machine still advances per-task when council mode is active
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PluginConfig as DGPluginConfig } from '../config';
import { createDelegationGateHook } from '../hooks/delegation-gate';
import {
	ensureAgentSession,
	getTaskState,
	startAgentSession,
} from '../state';
import { submit_phase_council_verdicts } from '../tools/submit-phase-council-verdicts';
import { executeUpdateTaskStatus } from '../tools/update-task-status';
import { closeProjectDb } from '../db/project-db';
import { getOrCreateProfile, setGates } from '../db/qa-gate-profile';

let tempDir: string;

const PLAN_SWARM = 'mega';
const PLAN_TITLE = 'phase-council-test';
const PLAN_ID = `${PLAN_SWARM}-${PLAN_TITLE}`.replace(/[^a-zA-Z0-9-_]/g, '_');

function writePlan(taskId = '1.1', taskStatus = 'completed') {
	mkdirSync(join(tempDir, '.swarm'), { recursive: true });
	writeFileSync(
		join(tempDir, '.swarm', 'plan.json'),
		JSON.stringify({
			schema_version: '1.0.0',
			swarm: PLAN_SWARM,
			title: PLAN_TITLE,
			spec: '',
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					tasks: [
						{
							id: taskId,
							phase: 1,
							status: taskStatus,
							description: 'Test task',
						},
					],
				},
			],
		}),
	);
}

function writePluginConfig(council?: Record<string, unknown>) {
	mkdirSync(join(tempDir, '.opencode'), { recursive: true });
	const cfg: Record<string, unknown> = {};
	if (council) cfg.council = council;
	writeFileSync(
		join(tempDir, '.opencode', 'opencode-swarm.json'),
		JSON.stringify(cfg),
	);
}

function makeVerdict(
	agent: 'critic' | 'reviewer' | 'sme' | 'test_engineer' | 'explorer',
	verdict: 'APPROVE' | 'CONCERNS' | 'REJECT' = 'APPROVE',
) {
	return {
		agent,
		verdict,
		confidence: 0.9,
		findings: [],
		criteriaAssessed: ['C1', 'C2'],
		criteriaUnmet: [],
		durationMs: 100,
	};
}

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), 'council-phase-gate-test-'));
});

afterEach(() => {
	closeProjectDb(tempDir);
	rmSync(tempDir, { recursive: true, force: true });
});

describe('submit_phase_council_verdicts — quorum enforcement', () => {
	test('5 verdicts → quorum met, synthesis succeeds and writes evidence', async () => {
		writePluginConfig({ enabled: true });
		const verdicts = [
			makeVerdict('critic'),
			makeVerdict('reviewer'),
			makeVerdict('sme'),
			makeVerdict('test_engineer'),
			makeVerdict('explorer'),
		];
		const result = await submit_phase_council_verdicts.execute!(
			{
				phaseNumber: 1,
				swarmId: PLAN_SWARM,
				phaseSummary: 'Implemented router and added tests.',
				verdicts,
				working_directory: tempDir,
			} as unknown as never,
			{ sessionID: 'sess-x' } as never,
		);
		const parsed = JSON.parse(result as string);
		expect(parsed.success).toBe(true);
		expect(parsed.quorumSize).toBe(5);
		expect(parsed.membersAbsent).toEqual([]);
		expect(parsed.evidencePath).toContain('phase-council.json');
	});

	test('2 verdicts (below default minimum 3) → insufficient_quorum, no evidence written', async () => {
		writePluginConfig({ enabled: true });
		const verdicts = [makeVerdict('critic'), makeVerdict('reviewer')];
		const result = await submit_phase_council_verdicts.execute!(
			{
				phaseNumber: 1,
				swarmId: PLAN_SWARM,
				phaseSummary: 'Quorum-fail test',
				verdicts,
				working_directory: tempDir,
			} as unknown as never,
			{ sessionID: 'sess-x' } as never,
		);
		const parsed = JSON.parse(result as string);
		expect(parsed.success).toBe(false);
		expect(parsed.reason).toBe('insufficient_quorum');
		expect(parsed.quorumRequired).toBe(3);
		const evidence = join(tempDir, '.swarm', 'evidence', '1', 'phase-council.json');
		expect(existsSync(evidence)).toBe(false);
	});

	test('3 verdicts (exactly at default minimum 3) → quorum met', async () => {
		writePluginConfig({ enabled: true });
		const verdicts = [
			makeVerdict('critic'),
			makeVerdict('reviewer'),
			makeVerdict('sme'),
		];
		const result = await submit_phase_council_verdicts.execute!(
			{
				phaseNumber: 1,
				swarmId: PLAN_SWARM,
				phaseSummary: 'At-minimum quorum test',
				verdicts,
				working_directory: tempDir,
			} as unknown as never,
			{ sessionID: 'sess-x' } as never,
		);
		const parsed = JSON.parse(result as string);
		expect(parsed.success).toBe(true);
		expect(parsed.quorumSize).toBe(3);
	});

	test('council disabled → returns disabled error', async () => {
		writePluginConfig({ enabled: false });
		const verdicts = [
			makeVerdict('critic'),
			makeVerdict('reviewer'),
			makeVerdict('sme'),
		];
		const result = await submit_phase_council_verdicts.execute!(
			{
				phaseNumber: 1,
				swarmId: PLAN_SWARM,
				phaseSummary: 'Disabled test',
				verdicts,
				working_directory: tempDir,
			} as unknown as never,
			{ sessionID: 'sess-x' } as never,
		);
		const parsed = JSON.parse(result as string);
		expect(parsed.success).toBe(false);
		expect(parsed.reason).toContain('council feature is disabled');
	});
});

describe('submit_phase_council_verdicts — round monotonicity', () => {
	test('rejects submission whose roundNumber does not exceed prior round', async () => {
		writePluginConfig({ enabled: true });
		const verdicts = [
			makeVerdict('critic'),
			makeVerdict('reviewer'),
			makeVerdict('sme'),
			makeVerdict('test_engineer'),
			makeVerdict('explorer'),
		];

		// Round 1 succeeds.
		const r1 = await submit_phase_council_verdicts.execute!(
			{
				phaseNumber: 1,
				swarmId: PLAN_SWARM,
				phaseSummary: 'Round 1.',
				verdicts,
				roundNumber: 1,
				working_directory: tempDir,
			} as unknown as never,
			{ sessionID: 'sess-x' } as never,
		);
		const parsed1 = JSON.parse(r1 as string);
		expect(parsed1.success).toBe(true);
		expect(parsed1.roundNumber).toBe(1);

		// Round 1 again (no increment) is rejected.
		const r1again = await submit_phase_council_verdicts.execute!(
			{
				phaseNumber: 1,
				swarmId: PLAN_SWARM,
				phaseSummary: 'Round 1 retry — should be blocked.',
				verdicts,
				roundNumber: 1,
				working_directory: tempDir,
			} as unknown as never,
			{ sessionID: 'sess-x' } as never,
		);
		const parsed1again = JSON.parse(r1again as string);
		expect(parsed1again.success).toBe(false);
		expect(parsed1again.reason).toBe('round_not_increasing');
		expect(parsed1again.priorRoundNumber).toBe(1);
		expect(parsed1again.requestedRoundNumber).toBe(1);

		// Round 2 (strict increase) succeeds.
		const r2 = await submit_phase_council_verdicts.execute!(
			{
				phaseNumber: 1,
				swarmId: PLAN_SWARM,
				phaseSummary: 'Round 2 with new verdicts.',
				verdicts,
				roundNumber: 2,
				working_directory: tempDir,
			} as unknown as never,
			{ sessionID: 'sess-x' } as never,
		);
		const parsed2 = JSON.parse(r2 as string);
		expect(parsed2.success).toBe(true);
		expect(parsed2.roundNumber).toBe(2);
	});
});

describe('submit_phase_council_verdicts — evidence file contents', () => {
	test('evidence file at .swarm/evidence/{phase}/phase-council.json with phase-council entry', async () => {
		writePluginConfig({ enabled: true });
		const verdicts = [
			makeVerdict('critic'),
			makeVerdict('reviewer'),
			makeVerdict('sme'),
			makeVerdict('test_engineer'),
			makeVerdict('explorer'),
		];
		const result = await submit_phase_council_verdicts.execute!(
			{
				phaseNumber: 2,
				swarmId: PLAN_SWARM,
				phaseSummary: 'Phase 2 evidence test',
				verdicts,
				working_directory: tempDir,
			} as unknown as never,
			{ sessionID: 'sess-x' } as never,
		);
		const parsed = JSON.parse(result as string);
		expect(parsed.success).toBe(true);

		const evidencePath = join(tempDir, '.swarm', 'evidence', '2', 'phase-council.json');
		expect(existsSync(evidencePath)).toBe(true);

		const evidence = JSON.parse(readFileSync(evidencePath, 'utf-8'));
		expect(Array.isArray(evidence.entries)).toBe(true);
		expect(evidence.entries[0].type).toBe('phase-council');
		expect(evidence.entries[0].phase_number).toBe(2);
		expect(evidence.entries[0].quorumSize).toBe(5);
	});
});

describe('update_task_status no longer requires per-task council gate', () => {
	test('completes a task with no council gate evidence even when council_mode is on', async () => {
		writePlan('1.1', 'pending');
		writePluginConfig({ enabled: true });

		// Enable council_mode in QA profile to confirm the OLD per-task block is gone.
		getOrCreateProfile(tempDir, PLAN_ID);
		setGates(tempDir, PLAN_ID, { council_mode: true });

		// Seed evidence so non-council gates pass: reviewer + test_engineer.
		const evidenceDir = join(tempDir, '.swarm', 'evidence');
		mkdirSync(evidenceDir, { recursive: true });
		const ts = new Date().toISOString();
		const taskEvidence = {
			taskId: '1.1',
			required_gates: ['reviewer', 'test_engineer'],
			gates: {
				reviewer: {
					sessionId: 'sess-uts',
					timestamp: ts,
					agent: 'mega_reviewer',
				},
				test_engineer: {
					sessionId: 'sess-uts',
					timestamp: ts,
					agent: 'mega_test_engineer',
				},
			},
		};
		writeFileSync(
			join(evidenceDir, '1.1.json'),
			JSON.stringify(taskEvidence),
		);

		// Drive state machine through the required transitions.
		startAgentSession('sess-uts', 'architect');
		const session = ensureAgentSession('sess-uts');
		session.currentTaskId = '1.1';
		session.taskWorkflowStates.set('1.1', 'tests_run');

		const result = await executeUpdateTaskStatus(
			{
				task_id: '1.1',
				status: 'completed',
				working_directory: tempDir,
			},
			tempDir,
		);

		// Even with council_mode=true and no per-task council evidence, the
		// transition is allowed: phase-level council is enforced by Gate 5
		// in phase_complete, not per-task.
		expect(result.success).toBe(true);
	});
});

describe('Stage B state machine — advancement is unconditional under council mode', () => {
	function makeConfig(council?: { enabled?: boolean }): DGPluginConfig {
		return {
			parallelization: { stageB: { parallel: { enabled: false } } },
			council: council ?? { enabled: false },
		} as unknown as DGPluginConfig;
	}

	function enableCouncilGate() {
		getOrCreateProfile(tempDir, PLAN_ID);
		setGates(tempDir, PLAN_ID, { council_mode: true });
	}

	test('reviewer dispatch advances coder_delegated → reviewer_run when council_mode is on', async () => {
		writePlan('1.1', 'pending');
		writePluginConfig({ enabled: true });
		enableCouncilGate();

		const config = makeConfig({ enabled: true });
		const hook = createDelegationGateHook(config, tempDir);

		startAgentSession('sess-rev', 'architect');
		const session = ensureAgentSession('sess-rev');
		session.currentTaskId = '1.1';
		session.taskWorkflowStates.set('1.1', 'coder_delegated');

		await hook.toolAfter(
			{
				tool: 'Task',
				sessionID: 'sess-rev',
				callID: 'call-rev-1',
				args: { subagent_type: 'reviewer' },
			} as never,
			{} as never,
		);

		expect(getTaskState(session, '1.1')).toBe('reviewer_run');
	});

	test('test_engineer dispatch advances reviewer_run → tests_run when council_mode is on', async () => {
		writePlan('1.1', 'pending');
		writePluginConfig({ enabled: true });
		enableCouncilGate();

		const config = makeConfig({ enabled: true });
		const hook = createDelegationGateHook(config, tempDir);

		startAgentSession('sess-te', 'architect');
		const session = ensureAgentSession('sess-te');
		session.currentTaskId = '1.1';
		session.taskWorkflowStates.set('1.1', 'reviewer_run');

		await hook.toolAfter(
			{
				tool: 'Task',
				sessionID: 'sess-te',
				callID: 'call-te-1',
				args: { subagent_type: 'test_engineer' },
			} as never,
			{} as never,
		);

		expect(getTaskState(session, '1.1')).toBe('tests_run');
	});
});

/**
 * Phase-boundary cleanup for contributor session state.
 *
 * After a successful `phase_complete(N)`, the post-success reset block
 * must prune Phase-N-and-earlier entries from:
 *   - session.taskWorkflowStates
 *   - session.stageBCompletion
 *   - session.requiredStageBGates
 * and conditionally clear `currentTaskId` / `lastCoderDelegationTaskId`
 * when those reference Phase-N or earlier.
 *
 * Future-phase entries (Phase N+1+) must survive — they may have been
 * pre-staged by the architect's next `update_task_status` call.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
	ensureAgentSession,
	resetSwarmState,
	swarmState,
} from '../../../src/state';

const { phase_complete } = await import('../../../src/tools/phase-complete');

describe('phase_complete: phase-boundary contributor-session cleanup', () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		resetSwarmState();
		tempDir = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), 'pc-cleanup-test-')),
		);
		originalCwd = process.cwd();
		process.chdir(tempDir);

		execSync('git init', { encoding: 'utf-8' });
		execSync('git config --local commit.gpgsign false', { encoding: 'utf-8' });
		execSync('git config user.email "test@test.com"', { encoding: 'utf-8' });
		execSync('git config user.name "Test"', { encoding: 'utf-8' });
		fs.writeFileSync(path.join(tempDir, 'initial.txt'), 'initial');
		execSync('git add .', { encoding: 'utf-8' });
		execSync('git commit -m "initial"', { encoding: 'utf-8' });

		fs.mkdirSync(path.join(tempDir, '.swarm', 'evidence'), { recursive: true });
		fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
		fs.writeFileSync(
			path.join(tempDir, '.opencode', 'opencode-swarm.json'),
			JSON.stringify({
				phase_complete: {
					enabled: true,
					required_agents: [],
					require_docs: false,
					policy: 'warn',
				},
			}),
		);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {
			/* best effort */
		}
		resetSwarmState();
	});

	function writeRetroBundle(phase: number) {
		const retroDir = path.join(tempDir, '.swarm', 'evidence', `retro-${phase}`);
		fs.mkdirSync(retroDir, { recursive: true });
		fs.writeFileSync(
			path.join(retroDir, 'evidence.json'),
			JSON.stringify({
				schema_version: '1.0.0',
				task_id: `retro-${phase}`,
				entries: [
					{
						task_id: `retro-${phase}`,
						type: 'retrospective',
						timestamp: new Date().toISOString(),
						agent: 'architect',
						verdict: 'pass',
						summary: 'Phase retrospective',
						metadata: {},
						phase_number: phase,
						total_tool_calls: 1,
						coder_revisions: 0,
						reviewer_rejections: 0,
						test_failures: 0,
						security_findings: 0,
						integration_issues: 0,
						task_count: 1,
						task_complexity: 'simple',
						top_rejection_reasons: [],
						lessons_learned: ['lesson'],
					},
				],
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			}),
		);
	}

	test('prior-phase task state is pruned; next-phase entries survive (and open-state drop logs a warn)', async () => {
		const sessionId = 'sess-cleanup-1';
		const session = ensureAgentSession(sessionId);

		// Seed stale Phase-1 entries (everything must be cleared) and a
		// pre-staged Phase-2 entry that MUST survive.
		session.taskWorkflowStates.set('1.1', 'tests_run');
		session.taskWorkflowStates.set('1.2', 'coder_delegated'); // open state
		session.taskWorkflowStates.set('2.1', 'coder_delegated');

		session.stageBCompletion = new Map();
		session.stageBCompletion.set('1.1', new Set(['reviewer']));
		session.stageBCompletion.set('2.1', new Set(['reviewer']));

		// Capture console.warn so we can assert the open-state drop warning
		// fires for 1.2 (state `coder_delegated`, classified as an "open" state).
		const originalWarn = console.warn;
		const warnCalls: string[] = [];
		console.warn = (...args: unknown[]) => {
			warnCalls.push(args.map(String).join(' '));
		};
		try {
			session.requiredStageBGates = new Map();
			session.requiredStageBGates.set('1.1', new Set(['reviewer']));
			session.requiredStageBGates.set('2.1', new Set(['reviewer']));

			session.currentTaskId = '1.2';
			session.lastCoderDelegationTaskId = '1.2';

			writeRetroBundle(1);

			const result = await phase_complete.execute({
				phase: 1,
				sessionID: sessionId,
			});
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(true);

			const refreshed = swarmState.agentSessions.get(sessionId);
			expect(refreshed).toBeDefined();

			// Prior-phase entries pruned across all three maps.
			expect(refreshed?.taskWorkflowStates.has('1.1')).toBe(false);
			expect(refreshed?.taskWorkflowStates.has('1.2')).toBe(false);
			expect(refreshed?.stageBCompletion?.has('1.1')).toBe(false);
			expect(refreshed?.requiredStageBGates?.has('1.1')).toBe(false);

			// Next-phase entries survive.
			expect(refreshed?.taskWorkflowStates.has('2.1')).toBe(true);
			expect(refreshed?.stageBCompletion?.has('2.1')).toBe(true);
			expect(refreshed?.requiredStageBGates?.has('2.1')).toBe(true);

			// Prior-phase `currentTaskId` cleared; would be Phase-2 if re-staged.
			expect(refreshed?.currentTaskId).toBeNull();
			expect(refreshed?.lastCoderDelegationTaskId).toBeNull();

			// Open-state drop warning: `1.2` was in state `coder_delegated`
			// (an "open" state) when pruned, so the boundary log must fire.
			const dropWarn = warnCalls.find(
				(m) =>
					m.includes('dropping open task state at phase boundary') &&
					m.includes('taskId=1.2') &&
					m.includes('state=coder_delegated') &&
					m.includes('phaseCompleted=1'),
			);
			expect(dropWarn).toBeDefined();
		} finally {
			console.warn = originalWarn;
		}
	});

	test('non-strict task ids (e.g. "1-debug", "retro-1") are NEVER pruned by phase boundary', async () => {
		// Regression: `parseInt('1-debug', 10)` returns 1; an early version of
		// `taskIdToPhase` would have wrongly classified `'1-debug'` as a Phase-1
		// id and pruned it. The hardened version uses `isStrictTaskId` first.
		const sessionId = 'sess-cleanup-nonstrict';
		const session = ensureAgentSession(sessionId);
		session.taskWorkflowStates.set('1-debug', 'tests_run');
		session.taskWorkflowStates.set('retro-1', 'tests_run');
		session.stageBCompletion = new Map();
		session.stageBCompletion.set('1-debug', new Set(['reviewer']));
		session.requiredStageBGates = new Map();
		session.requiredStageBGates.set('retro-1', new Set(['reviewer']));

		writeRetroBundle(1);

		const result = await phase_complete.execute({
			phase: 1,
			sessionID: sessionId,
		});
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(true);

		const refreshed = swarmState.agentSessions.get(sessionId);
		expect(refreshed?.taskWorkflowStates.has('1-debug')).toBe(true);
		expect(refreshed?.taskWorkflowStates.has('retro-1')).toBe(true);
		expect(refreshed?.stageBCompletion?.has('1-debug')).toBe(true);
		expect(refreshed?.requiredStageBGates?.has('retro-1')).toBe(true);
	});

	test('next-phase currentTaskId is preserved across phase boundary', async () => {
		const sessionId = 'sess-cleanup-2';
		const session = ensureAgentSession(sessionId);

		// Architect has already pre-staged Phase-2 work before calling
		// phase_complete(1). That state must NOT be wiped.
		session.taskWorkflowStates.set('2.1', 'coder_delegated');
		session.currentTaskId = '2.1';
		session.lastCoderDelegationTaskId = '2.1';

		writeRetroBundle(1);

		const result = await phase_complete.execute({
			phase: 1,
			sessionID: sessionId,
		});
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(true);

		const refreshed = swarmState.agentSessions.get(sessionId);
		expect(refreshed?.currentTaskId).toBe('2.1');
		expect(refreshed?.lastCoderDelegationTaskId).toBe('2.1');
		expect(refreshed?.taskWorkflowStates.has('2.1')).toBe(true);
	});
});

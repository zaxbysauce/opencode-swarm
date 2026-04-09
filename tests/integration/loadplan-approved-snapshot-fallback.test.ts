/**
 * Integration test: loadPlan recovers from a critic-approved immutable snapshot
 * when plan.json, plan.md, and normal ledger replay are all unusable.
 *
 * This verifies the Step 4b fallback wired into src/plan/manager.ts: the
 * "allow the architect to fall back to a plan file that cannot be changed"
 * requirement. The helper loadLastApprovedPlan was previously defined but
 * dangling (no production callers), so this end-to-end test is the safety
 * net that proves the recovery path is actually reachable from loadPlan.
 *
 * Recovery scenario exercised:
 *   1. Create a valid plan and initialize the ledger.
 *   2. Persist a critic_approved snapshot via takeSnapshotEvent.
 *   3. Persist a later non-approved snapshot so replayFromLedger's
 *      "latest-snapshot" selector picks that one, not the approved one.
 *   4. Append a plan_reset event so replayFromLedger returns null after
 *      processing the latest (non-approved) snapshot.
 *   5. Delete plan.json and plan.md so Steps 1-3 of loadPlan all miss.
 *   6. Call loadPlan and expect the critic_approved plan back.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Plan } from '../../src/config/plan-schema';
import {
	appendLedgerEvent,
	computePlanHash,
	initLedger,
	takeSnapshotEvent,
} from '../../src/plan/ledger';
import { loadPlan, resetStartupLedgerCheck } from '../../src/plan/manager';

function createApprovedPlan(): Plan {
	return {
		schema_version: '1.0.0',
		title: 'Approved Snapshot Recovery Test',
		swarm: 'approved-recovery-swarm',
		current_phase: 2,
		phases: [
			{
				id: 1,
				name: 'Phase 1 (approved)',
				status: 'complete',
				tasks: [
					{
						id: '1.1',
						phase: 1,
						status: 'completed',
						size: 'small',
						description: 'First task — approved by critic',
						depends: [],
						files_touched: [],
					},
				],
			},
			{
				id: 2,
				name: 'Phase 2 (not started)',
				status: 'pending',
				tasks: [
					{
						id: '2.1',
						phase: 2,
						status: 'pending',
						size: 'small',
						description: 'Future work',
						depends: [],
						files_touched: [],
					},
				],
			},
		],
	};
}

describe('loadPlan: critic-approved snapshot recovery (Step 4b)', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'loadplan-approved-recovery-'));
		await mkdir(join(tempDir, '.swarm'), { recursive: true });
		resetStartupLedgerCheck();
	});

	afterEach(async () => {
		if (existsSync(tempDir)) {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	test('recovers the critic_approved plan when replayFromLedger returns null', async () => {
		const approvedPlan = createApprovedPlan();
		const planId = 'approved-recovery-swarm-Approved_Snapshot_Recovery_Test';

		// 1. Write an initial plan.json and initialize the ledger so future
		//    appendLedgerEvent calls have a baseline hash to chain from.
		writeFileSync(
			join(tempDir, '.swarm', 'plan.json'),
			JSON.stringify(approvedPlan, null, 2),
			'utf-8',
		);
		await initLedger(tempDir, planId, computePlanHash(approvedPlan));

		// 2. Persist a critic_approved snapshot. This is the state we expect
		//    loadPlan to recover later.
		await takeSnapshotEvent(tempDir, approvedPlan, {
			source: 'critic_approved',
			approvalMetadata: {
				phase: 1,
				verdict: 'APPROVED',
				summary: 'Phase 1 approved by critic',
				approved_at: new Date().toISOString(),
			},
		});

		// 3. Persist a LATER non-approved snapshot with a mutated plan. This is
		//    important: replayFromLedger's snapshot selector picks the latest
		//    snapshot regardless of source, so we need a non-approved one to be
		//    last. Otherwise replayFromLedger would return the approved snapshot
		//    directly and Step 4b would never fire.
		const mutatedPlan: Plan = {
			...approvedPlan,
			title: 'Mutated Later State',
			phases: approvedPlan.phases.map((p) => ({
				...p,
				status: 'in_progress',
				tasks: p.tasks.map((t) => ({ ...t, status: 'in_progress' })),
			})),
		};
		await takeSnapshotEvent(tempDir, mutatedPlan);

		// 4. Append a plan_reset so replayFromLedger returns null after
		//    processing events after the latest snapshot.
		await appendLedgerEvent(tempDir, {
			plan_id: planId,
			event_type: 'plan_reset',
			source: 'test-harness',
		});

		// 5. Delete plan.json and plan.md so Steps 1-3 of loadPlan all miss and
		//    it falls through to the ledger/approved-snapshot recovery paths.
		await unlink(join(tempDir, '.swarm', 'plan.json'));
		// plan.md was never written, but be explicit
		if (existsSync(join(tempDir, '.swarm', 'plan.md'))) {
			await unlink(join(tempDir, '.swarm', 'plan.md'));
		}

		// 6. Call loadPlan — it should fall through to Step 4b and recover the
		//    critic_approved snapshot.
		const recovered = await loadPlan(tempDir);

		expect(recovered).not.toBeNull();
		// Recovered plan must be the approved one, not the later mutated state.
		expect(recovered?.title).toBe('Approved Snapshot Recovery Test');
		expect(recovered?.phases[0].status).toBe('complete');
		expect(recovered?.phases[0].tasks[0].status).toBe('completed');
		expect(recovered?.phases[1].status).toBe('pending');
		// And it must NOT be the mutated later snapshot.
		expect(recovered?.title).not.toBe('Mutated Later State');

		// loadPlan writes the recovered plan back to plan.json so subsequent
		// sessions can read it normally.
		expect(existsSync(join(tempDir, '.swarm', 'plan.json'))).toBe(true);
	});

	test('returns null when no approved snapshot exists and replay fails', async () => {
		const plan = createApprovedPlan();
		const planId = 'approved-recovery-swarm-Approved_Snapshot_Recovery_Test';

		writeFileSync(
			join(tempDir, '.swarm', 'plan.json'),
			JSON.stringify(plan, null, 2),
			'utf-8',
		);
		await initLedger(tempDir, planId, computePlanHash(plan));

		// Only a non-approved snapshot + plan_reset — no approved snapshot to
		// recover from. This confirms Step 4b doesn't return a bogus value.
		await takeSnapshotEvent(tempDir, plan);
		await appendLedgerEvent(tempDir, {
			plan_id: planId,
			event_type: 'plan_reset',
			source: 'test-harness',
		});

		await unlink(join(tempDir, '.swarm', 'plan.json'));

		const result = await loadPlan(tempDir);
		expect(result).toBeNull();
	});
});

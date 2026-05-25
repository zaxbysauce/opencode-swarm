/**
 * Tests for FR-003: plan_rebuilt ledger event appended by rebuildPlan().
 *
 * Verifies that:
 * 1. A plan_rebuilt event is appended after rebuildPlan() completes atomic writes
 * 2. Replay of the plan_rebuilt event is idempotent (applyEventToPlan no-op)
 * 3. The reason field defaults to ledger_replay_recovery; options.reason overrides it
 * 4. The event includes a valid SHA-256 plan_hash_after field
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Plan } from '../../../src/config/plan-schema';
import { readLedgerEvents, replayFromLedger } from '../../../src/plan/ledger';
import { rebuildPlan, savePlan } from '../../../src/plan/manager';
import { derivePlanId } from '../../../src/plan/utils';

let tmpDir: string;

beforeEach(async () => {
	tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plan-rebuilt-'));
	await fs.mkdir(path.join(tmpDir, '.swarm'), { recursive: true });
	await fs.writeFile(path.join(tmpDir, '.swarm', 'spec.md'), '# Test Spec\n');
});

afterEach(async () => {
	try {
		await fs.rm(tmpDir, { recursive: true, force: true });
	} catch {
		// best effort
	}
});

function createTestPlan(overrides?: Partial<Plan>): Plan {
	return {
		schema_version: '1.0.0',
		title: 'Rebuild Test Plan',
		swarm: 'test-swarm',
		current_phase: 1,
		phases: [
			{
				id: 1,
				name: 'Phase 1',
				status: 'in_progress',
				tasks: [
					{
						id: '1.1',
						phase: 1,
						description: 'Task one',
						status: 'pending',
						size: 'small',
						depends: [],
						files_touched: [],
					},
				],
			},
		],
		...overrides,
	};
}

describe('rebuildPlan plan_rebuilt ledger event (FR-003)', () => {
	test('1. rebuildPlan() appends a plan_rebuilt event to the ledger', async () => {
		const plan = createTestPlan();
		// Seed the plan via savePlan to bootstrap the ledger with plan_created
		await savePlan(tmpDir, plan);

		// Trigger a rebuild with an explicit plan (no options.reason → defaults to ledger_replay_recovery)
		const result = await rebuildPlan(tmpDir, plan);
		expect(result).not.toBeNull();

		// Read the ledger and find the plan_rebuilt event
		const events = await readLedgerEvents(tmpDir);
		const rebuiltEvents = events.filter((e) => e.event_type === 'plan_rebuilt');
		expect(rebuiltEvents.length).toBeGreaterThanOrEqual(1);

		const lastRebuilt = rebuiltEvents[rebuiltEvents.length - 1];
		expect(lastRebuilt.plan_id).toBe(derivePlanId(plan));
		expect(lastRebuilt.source).toBe('rebuildPlan');
		expect(lastRebuilt.payload).toBeDefined();
		expect((lastRebuilt.payload as Record<string, unknown>).reason).toBe(
			'ledger_replay_recovery',
		);
	});

	test('2. plan_rebuilt replay is idempotent — replayFromLedger completes without error', async () => {
		const plan = createTestPlan();
		await savePlan(tmpDir, plan);

		// Trigger a rebuild (which appends plan_rebuilt event)
		await rebuildPlan(tmpDir, plan);

		// Replay from ledger — must not throw and must return a valid plan
		const replayedPlan = await replayFromLedger(tmpDir);
		expect(replayedPlan).not.toBeNull();
		expect(replayedPlan!.title).toBe(plan.title);
		expect(replayedPlan!.swarm).toBe(plan.swarm);
		expect(replayedPlan!.phases.length).toBe(plan.phases.length);
	});

	test('3. default reason is ledger_replay_recovery; options.reason overrides it', async () => {
		const plan = createTestPlan();
		await savePlan(tmpDir, plan);

		// Rebuild with explicit plan but no options.reason — default should be ledger_replay_recovery
		await rebuildPlan(tmpDir, plan);
		const eventsAfterDefault = await readLedgerEvents(tmpDir);
		const defaultEvents = eventsAfterDefault.filter(
			(e) => e.event_type === 'plan_rebuilt',
		);
		expect(defaultEvents.length).toBeGreaterThanOrEqual(1);
		const lastDefault = defaultEvents[defaultEvents.length - 1];
		expect((lastDefault.payload as Record<string, unknown>).reason).toBe(
			'ledger_replay_recovery',
		);

		// Rebuild with options.reason — should use the provided reason
		await rebuildPlan(tmpDir, plan, { reason: 'explicit_rebuild' });
		const eventsAfterExplicit = await readLedgerEvents(tmpDir);
		const explicitEvents = eventsAfterExplicit.filter(
			(e) => e.event_type === 'plan_rebuilt',
		);
		expect(explicitEvents.length).toBeGreaterThanOrEqual(2);
		const lastExplicit = explicitEvents[explicitEvents.length - 1];
		expect((lastExplicit.payload as Record<string, unknown>).reason).toBe(
			'explicit_rebuild',
		);

		// Rebuild without plan param — reason should still be ledger_replay_recovery
		await rebuildPlan(tmpDir);
		const eventsAfterReplay = await readLedgerEvents(tmpDir);
		const replayEvents = eventsAfterReplay.filter(
			(e) => e.event_type === 'plan_rebuilt',
		);
		expect(replayEvents.length).toBeGreaterThanOrEqual(3);
		const lastReplay = replayEvents[replayEvents.length - 1];
		expect((lastReplay.payload as Record<string, unknown>).reason).toBe(
			'ledger_replay_recovery',
		);
	});

	test('4. plan_rebuilt event includes a valid SHA-256 plan_hash_after', async () => {
		const plan = createTestPlan();
		await savePlan(tmpDir, plan);

		await rebuildPlan(tmpDir, plan);

		const events = await readLedgerEvents(tmpDir);
		const rebuiltEvents = events.filter((e) => e.event_type === 'plan_rebuilt');
		expect(rebuiltEvents.length).toBeGreaterThanOrEqual(1);
		const lastRebuilt = rebuiltEvents[rebuiltEvents.length - 1];

		// SHA-256 hex string is exactly 64 characters of [0-9a-f]
		expect(lastRebuilt.plan_hash_after).toMatch(/^[0-9a-f]{64}$/);
	});

	test('5. rebuildPlan() called when ledger does not exist — appendLedgerEvent throws but is caught non-fatally', async () => {
		// Set up .swarm dir with spec but NO ledger
		const plan = createTestPlan();

		// rebuildPlan with explicit plan should still write plan.json even without ledger
		const result = await rebuildPlan(tmpDir, plan);
		expect(result).not.toBeNull();
		expect(result!.title).toBe(plan.title);

		// The ledger should not exist (appendLedgerEvent throws and is caught)
		const ledgerPath = path.join(tmpDir, '.swarm', 'plan-ledger.jsonl');
		const ledgerExists = await fs
			.stat(ledgerPath)
			.then(() => true)
			.catch(() => false);
		expect(ledgerExists).toBe(false);
	});

	test('6. rebuildPlan() without plan param returns null when ledger does not exist', async () => {
		// Set up .swarm dir with spec but NO ledger, NO plan.json
		const result = await rebuildPlan(tmpDir);
		// replayFromLedger returns null when no ledger, so rebuildPlan returns null
		expect(result).toBeNull();
	});

	test('7. rebuildPlan() called multiple times appends multiple plan_rebuilt events with incrementing seq', async () => {
		const plan = createTestPlan();
		await savePlan(tmpDir, plan);

		// First rebuild (no options.reason → default)
		await rebuildPlan(tmpDir, plan);
		// Second rebuild (no options.reason → default)
		await rebuildPlan(tmpDir, plan);
		// Third rebuild (with explicit reason)
		await rebuildPlan(tmpDir, plan, { reason: 'explicit_rebuild' });

		const events = await readLedgerEvents(tmpDir);
		const rebuiltEvents = events.filter((e) => e.event_type === 'plan_rebuilt');
		expect(rebuiltEvents.length).toBe(3);

		// Each event should have incrementing seq
		expect(rebuiltEvents[0].seq).toBeLessThan(rebuiltEvents[1].seq);
		expect(rebuiltEvents[1].seq).toBeLessThan(rebuiltEvents[2].seq);

		// All should have the same plan_id
		const planId = derivePlanId(plan);
		expect(rebuiltEvents[0].plan_id).toBe(planId);
		expect(rebuiltEvents[1].plan_id).toBe(planId);
		expect(rebuiltEvents[2].plan_id).toBe(planId);

		// First two should be default reason, third should be explicit_rebuild
		expect((rebuiltEvents[0].payload as Record<string, unknown>).reason).toBe(
			'ledger_replay_recovery',
		);
		expect((rebuiltEvents[1].payload as Record<string, unknown>).reason).toBe(
			'ledger_replay_recovery',
		);
		expect((rebuiltEvents[2].payload as Record<string, unknown>).reason).toBe(
			'explicit_rebuild',
		);
	});

	test('8. options.reason passes through custom reason strings verbatim', async () => {
		const plan = createTestPlan();
		await savePlan(tmpDir, plan);

		await rebuildPlan(tmpDir, plan, {
			reason: 'ledger_hash_mismatch_recovery',
		});

		const events = await readLedgerEvents(tmpDir);
		const rebuiltEvents = events.filter((e) => e.event_type === 'plan_rebuilt');
		expect(rebuiltEvents.length).toBeGreaterThanOrEqual(1);
		const lastRebuilt = rebuiltEvents[rebuiltEvents.length - 1];
		expect((lastRebuilt.payload as Record<string, unknown>).reason).toBe(
			'ledger_hash_mismatch_recovery',
		);
	});

	test('9. options.reason with validation_failure_recovery is recorded correctly', async () => {
		const plan = createTestPlan();
		await savePlan(tmpDir, plan);

		await rebuildPlan(tmpDir, plan, {
			reason: 'validation_failure_recovery',
		});

		const events = await readLedgerEvents(tmpDir);
		const rebuiltEvents = events.filter((e) => e.event_type === 'plan_rebuilt');
		expect(rebuiltEvents.length).toBeGreaterThanOrEqual(1);
		const lastRebuilt = rebuiltEvents[rebuiltEvents.length - 1];
		expect((lastRebuilt.payload as Record<string, unknown>).reason).toBe(
			'validation_failure_recovery',
		);
	});
});

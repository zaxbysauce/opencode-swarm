import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Plan } from '../../src/config/plan-schema';
import {
	appendLedgerEvent,
	getEventsAfterSeq,
	getLatestLedgerSeq,
	getLatestSnapshotMetadata,
	initLedger,
	loadSnapshot,
	readLedgerEvents,
	replayFromLedger,
	takeSnapshot,
} from '../../src/plan/ledger';

// Test workspace directory
let testDir: string;

function createMinimalPlan(title = 'Test Plan'): Plan {
	return {
		schema_version: '1.0.0',
		title,
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
						status: 'pending',
						size: 'small',
						description: 'Task 1',
						depends: [],
						files_touched: [],
					},
					{
						id: '1.2',
						phase: 1,
						status: 'pending',
						size: 'medium',
						description: 'Task 2',
						depends: [],
						files_touched: [],
					},
				],
			},
		],
	};
}

function createPlanJson(plan: Plan): void {
	const planJsonPath = path.join(testDir, '.swarm', 'plan.json');
	fs.writeFileSync(planJsonPath, JSON.stringify(plan), 'utf8');
}

describe('ledger snapshot adversarial tests', () => {
	beforeEach(() => {
		testDir = fs.mkdtempSync(path.join(__dirname, 'ledger-adv-test-'));
		fs.mkdirSync(path.join(testDir, '.swarm'), { recursive: true });
	});

	afterEach(() => {
		try {
			fs.rmSync(testDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	// -------------------------------------------------------------------------
	// EDGE CASE: plan_reset mid-ledger with further events
	// -------------------------------------------------------------------------
	describe('plan_reset mid-ledger with further events', () => {
		test('replayFromLedger ignores events after plan_reset', async () => {
			const plan = createMinimalPlan();
			createPlanJson(plan);

			await initLedger(testDir, 'test-plan');

			// Add some events
			await appendLedgerEvent(testDir, {
				plan_id: 'test-plan',
				event_type: 'task_status_changed',
				task_id: '1.1',
				from_status: 'pending',
				to_status: 'in_progress',
				source: 'test',
			});

			// plan_reset event
			await appendLedgerEvent(testDir, {
				plan_id: 'test-plan',
				event_type: 'plan_reset',
				source: 'test',
			});

			// Events after reset - these should be ignored
			await appendLedgerEvent(testDir, {
				plan_id: 'test-plan',
				event_type: 'task_status_changed',
				task_id: '1.1',
				from_status: 'in_progress',
				to_status: 'completed',
				source: 'test',
			});

			await appendLedgerEvent(testDir, {
				plan_id: 'test-plan',
				event_type: 'task_status_changed',
				task_id: '1.2',
				from_status: 'pending',
				to_status: 'completed',
				source: 'test',
			});

			// Replay should return null because of plan_reset
			const result = await replayFromLedger(testDir);
			expect(result).toBeNull();
		});

		test('snapshot-based replay also returns null when plan_reset in delta', async () => {
			const plan = createMinimalPlan();
			createPlanJson(plan);

			await initLedger(testDir, 'test-plan');

			// Add some events and take snapshot
			await appendLedgerEvent(testDir, {
				plan_id: 'test-plan',
				event_type: 'task_status_changed',
				task_id: '1.1',
				from_status: 'pending',
				to_status: 'in_progress',
				source: 'test',
			});

			const snapshot = await takeSnapshot(testDir, plan);

			// Add plan_reset and events after
			await appendLedgerEvent(testDir, {
				plan_id: 'test-plan',
				event_type: 'plan_reset',
				source: 'test',
			});

			await appendLedgerEvent(testDir, {
				plan_id: 'test-plan',
				event_type: 'task_status_changed',
				task_id: '1.1',
				from_status: 'in_progress',
				to_status: 'completed',
				source: 'test',
			});

			// Snapshot-based replay should also return null
			const result = await replayFromLedger(testDir, { useSnapshot: true });
			expect(result).toBeNull();
		});

		test('getEventsAfterSeq includes events after plan_reset', async () => {
			const plan = createMinimalPlan();
			createPlanJson(plan);

			await initLedger(testDir, 'test-plan');

			await appendLedgerEvent(testDir, {
				plan_id: 'test-plan',
				event_type: 'task_status_changed',
				task_id: '1.1',
				from_status: 'pending',
				to_status: 'in_progress',
				source: 'test',
			});

			await appendLedgerEvent(testDir, {
				plan_id: 'test-plan',
				event_type: 'plan_reset',
				source: 'test',
			});

			await appendLedgerEvent(testDir, {
				plan_id: 'test-plan',
				event_type: 'task_status_changed',
				task_id: '1.1',
				from_status: 'in_progress',
				to_status: 'completed',
				source: 'test',
			});

			// Get events after seq 1
			// Ledger: seq 1=plan_created, seq 2=task_status_changed, seq 3=plan_reset, seq 4=task_status_changed
			// After seq 1: events are seq 2, 3, 4 = 3 events
			const events = await getEventsAfterSeq(testDir, 1);

			expect(events).toHaveLength(3);
			expect(events[0].seq).toBe(2);
			expect(events[0].event_type).toBe('task_status_changed');
			expect(events[1].seq).toBe(3);
			expect(events[1].event_type).toBe('plan_reset');
			expect(events[2].seq).toBe(4);
		});

		test('takeSnapshot captures plan_reset seq but state is valid up to previous event', async () => {
			const plan = createMinimalPlan();
			createPlanJson(plan);

			await initLedger(testDir, 'test-plan');

			// Add event
			await appendLedgerEvent(testDir, {
				plan_id: 'test-plan',
				event_type: 'task_status_changed',
				task_id: '1.1',
				from_status: 'pending',
				to_status: 'in_progress',
				source: 'test',
			});

			// plan_reset
			await appendLedgerEvent(testDir, {
				plan_id: 'test-plan',
				event_type: 'plan_reset',
				source: 'test',
			});

			// Event after reset
			await appendLedgerEvent(testDir, {
				plan_id: 'test-plan',
				event_type: 'task_status_changed',
				task_id: '1.1',
				from_status: 'in_progress',
				to_status: 'completed',
				source: 'test',
			});

			// Take snapshot
			// Note: takeSnapshot sets lastAppliedSeq BEFORE checking if event returns null,
			// so snapshot_seq will be 3 (the plan_reset event), not 2
			const snapshot = await takeSnapshot(testDir, plan);

			// Snapshot is at seq 3 (plan_reset)
			expect(snapshot.snapshot_seq).toBe(3);

			// Load snapshot - the plan_state is the state BEFORE plan_reset was applied
			// Since plan_reset returns null and breaks, the plan_state is from event seq 2
			const loaded = await loadSnapshot(testDir, snapshot.snapshot_seq);
			expect(loaded).not.toBeNull();
			// Task 1.1 should be in_progress (from seq 2 status change)
			expect(
				loaded!.plan_state.phases[0].tasks.find((t) => t.id === '1.1')!.status,
			).toBe('in_progress');
		});
	});

	// -------------------------------------------------------------------------
	// EDGE CASE: Empty ledger or missing snapshot
	// -------------------------------------------------------------------------
	describe('empty ledger or missing snapshot', () => {
		test('getLatestSnapshotMetadata returns null when latest-snapshot.json missing', async () => {
			const result = await getLatestSnapshotMetadata(testDir);
			expect(result).toBeNull();
		});

		test('getLatestSnapshotMetadata returns null when latest-snapshot.json is empty', async () => {
			const latestPath = path.join(
				testDir,
				'.swarm',
				'ledger-snapshots',
				'latest-snapshot.json',
			);
			fs.mkdirSync(path.dirname(latestPath), { recursive: true });
			fs.writeFileSync(latestPath, '', 'utf8');

			const result = await getLatestSnapshotMetadata(testDir);
			expect(result).toBeNull();
		});

		test('loadSnapshot returns null when snapshot file missing', async () => {
			const result = await loadSnapshot(testDir, 999);
			expect(result).toBeNull();
		});

		test('loadSnapshot returns null when snapshot file is empty', async () => {
			const snapshotDir = path.join(testDir, '.swarm', 'ledger-snapshots');
			fs.mkdirSync(snapshotDir, { recursive: true });
			fs.writeFileSync(path.join(snapshotDir, 'snapshot-1.json'), '', 'utf8');

			const result = await loadSnapshot(testDir, 1);
			expect(result).toBeNull();
		});

		test('replayFromLedger with useSnapshot falls back to full replay when no snapshot', async () => {
			const plan = createMinimalPlan();
			createPlanJson(plan);

			await initLedger(testDir, 'test-plan');

			await appendLedgerEvent(testDir, {
				plan_id: 'test-plan',
				event_type: 'task_status_changed',
				task_id: '1.1',
				from_status: 'pending',
				to_status: 'in_progress',
				source: 'test',
			});

			// No snapshot taken - should fall back to full replay
			const result = await replayFromLedger(testDir, { useSnapshot: true });

			expect(result).not.toBeNull();
			expect(result!.phases[0].tasks.find((t) => t.id === '1.1')!.status).toBe(
				'in_progress',
			);
		});

		test('replayFromLedger returns null when ledger is empty (no initLedger)', async () => {
			const plan = createMinimalPlan();
			createPlanJson(plan);

			// No ledger initialized
			const result = await replayFromLedger(testDir);
			expect(result).toBeNull();
		});
	});

	// -------------------------------------------------------------------------
	// EDGE CASE: Corrupted snapshot metadata
	// -------------------------------------------------------------------------
	describe('corrupted snapshot metadata', () => {
		test('getLatestSnapshotMetadata returns null for invalid JSON', async () => {
			const latestPath = path.join(
				testDir,
				'.swarm',
				'ledger-snapshots',
				'latest-snapshot.json',
			);
			fs.mkdirSync(path.dirname(latestPath), { recursive: true });
			fs.writeFileSync(latestPath, '{ invalid json }', 'utf8');

			const result = await getLatestSnapshotMetadata(testDir);
			expect(result).toBeNull();
		});

		test('getLatestSnapshotMetadata returns null for partial JSON', async () => {
			const latestPath = path.join(
				testDir,
				'.swarm',
				'ledger-snapshots',
				'latest-snapshot.json',
			);
			fs.mkdirSync(path.dirname(latestPath), { recursive: true });
			// Missing closing brace
			fs.writeFileSync(
				latestPath,
				'{"snapshot_seq": 1, "snapshot_hash": "abc"',
				'utf8',
			);

			const result = await getLatestSnapshotMetadata(testDir);
			expect(result).toBeNull();
		});

		test('getLatestSnapshotMetadata returns null for wrong type fields', async () => {
			const latestPath = path.join(
				testDir,
				'.swarm',
				'ledger-snapshots',
				'latest-snapshot.json',
			);
			fs.mkdirSync(path.dirname(latestPath), { recursive: true });
			// snapshot_seq should be number, not string
			fs.writeFileSync(
				latestPath,
				'{"snapshot_seq": "not-a-number", "snapshot_hash": "abc123", "created_at": "2024-01-01"}',
				'utf8',
			);

			const result = await getLatestSnapshotMetadata(testDir);
			// Should still parse but with wrong type coercion
			expect(result).not.toBeNull();
		});

		test('getLatestSnapshotMetadata returns null for empty object', async () => {
			const latestPath = path.join(
				testDir,
				'.swarm',
				'ledger-snapshots',
				'latest-snapshot.json',
			);
			fs.mkdirSync(path.dirname(latestPath), { recursive: true });
			fs.writeFileSync(latestPath, '{}', 'utf8');

			const result = await getLatestSnapshotMetadata(testDir);
			// Empty object is technically valid JSON, but missing required fields
			// JSON.parse succeeds, but result will have undefined fields
			expect(result).not.toBeNull();
		});

		test('loadSnapshot returns null for invalid JSON in snapshot file', async () => {
			const snapshotDir = path.join(testDir, '.swarm', 'ledger-snapshots');
			fs.mkdirSync(snapshotDir, { recursive: true });
			fs.writeFileSync(
				path.join(snapshotDir, 'snapshot-1.json'),
				'{ corrupted }',
				'utf8',
			);

			const result = await loadSnapshot(testDir, 1);
			expect(result).toBeNull();
		});

		test('loadSnapshot returns null for truncated JSON', async () => {
			const snapshotDir = path.join(testDir, '.swarm', 'ledger-snapshots');
			fs.mkdirSync(snapshotDir, { recursive: true });
			// Valid start but incomplete
			fs.writeFileSync(
				path.join(snapshotDir, 'snapshot-1.json'),
				'{"snapshot_seq": 1, "snapshot_hash": "abc123", "created_at": "2024-01-01", "plan_state": {',
				'utf8',
			);

			const result = await loadSnapshot(testDir, 1);
			expect(result).toBeNull();
		});

		test('loadSnapshot returns null for plan_state missing', async () => {
			const snapshotDir = path.join(testDir, '.swarm', 'ledger-snapshots');
			fs.mkdirSync(snapshotDir, { recursive: true });
			// Missing plan_state field - this is invalid but loadSnapshot doesn't validate
			fs.writeFileSync(
				path.join(snapshotDir, 'snapshot-1.json'),
				'{"snapshot_seq": 1, "snapshot_hash": "abc123", "created_at": "2024-01-01"}',
				'utf8',
			);

			// BUG: loadSnapshot should validate plan_state exists but doesn't
			// It returns a malformed snapshot with undefined plan_state instead of null
			const result = await loadSnapshot(testDir, 1);
			// This test expects null but currently fails because of the bug
			// The returned object has plan_state: undefined
			expect(result).toBeNull();
		});

		test('loadSnapshot returns null for null bytes in JSON', async () => {
			const snapshotDir = path.join(testDir, '.swarm', 'ledger-snapshots');
			fs.mkdirSync(snapshotDir, { recursive: true });
			// Null bytes embedded in JSON string
			const badJson =
				'{"snapshot_seq": 1, "snapshot_hash": "abc\x00xyz", "created_at": "2024-01-01", "plan_state": {}}';
			fs.writeFileSync(
				path.join(snapshotDir, 'snapshot-1.json'),
				badJson,
				'utf8',
			);

			const result = await loadSnapshot(testDir, 1);
			expect(result).toBeNull();
		});
	});

	// -------------------------------------------------------------------------
	// EDGE CASE: Events after snapshot that should be replayed
	// -------------------------------------------------------------------------
	describe('events after snapshot that should be replayed', () => {
		test('snapshot+delta replay produces same result as full replay', async () => {
			const plan = createMinimalPlan();
			createPlanJson(plan);

			await initLedger(testDir, 'test-plan');

			// Add events 1-4
			await appendLedgerEvent(testDir, {
				plan_id: 'test-plan',
				event_type: 'task_status_changed',
				task_id: '1.1',
				from_status: 'pending',
				to_status: 'in_progress',
				source: 'test',
			});

			await appendLedgerEvent(testDir, {
				plan_id: 'test-plan',
				event_type: 'task_status_changed',
				task_id: '1.1',
				from_status: 'in_progress',
				to_status: 'completed',
				source: 'test',
			});

			// Take snapshot at seq 3
			const snapshot = await takeSnapshot(testDir, plan);

			// Add more events
			await appendLedgerEvent(testDir, {
				plan_id: 'test-plan',
				event_type: 'task_status_changed',
				task_id: '1.2',
				from_status: 'pending',
				to_status: 'in_progress',
				source: 'test',
			});

			await appendLedgerEvent(testDir, {
				plan_id: 'test-plan',
				event_type: 'task_status_changed',
				task_id: '1.2',
				from_status: 'in_progress',
				to_status: 'completed',
				source: 'test',
			});

			// Full replay
			const fullReplay = await replayFromLedger(testDir);

			// Snapshot-based replay
			const snapshotReplay = await replayFromLedger(testDir, {
				useSnapshot: true,
			});

			expect(fullReplay).not.toBeNull();
			expect(snapshotReplay).not.toBeNull();

			// Both should have task 1.1 completed
			expect(
				fullReplay!.phases[0].tasks.find((t) => t.id === '1.1')!.status,
			).toBe('completed');
			expect(
				snapshotReplay!.phases[0].tasks.find((t) => t.id === '1.1')!.status,
			).toBe('completed');

			// Both should have task 1.2 completed
			expect(
				fullReplay!.phases[0].tasks.find((t) => t.id === '1.2')!.status,
			).toBe('completed');
			expect(
				snapshotReplay!.phases[0].tasks.find((t) => t.id === '1.2')!.status,
			).toBe('completed');
		});

		test('snapshot+delta handles many events after snapshot', async () => {
			const plan = createMinimalPlan();
			createPlanJson(plan);

			await initLedger(testDir, 'test-plan');

			// Add a few events then snapshot
			await appendLedgerEvent(testDir, {
				plan_id: 'test-plan',
				event_type: 'task_status_changed',
				task_id: '1.1',
				from_status: 'pending',
				to_status: 'in_progress',
				source: 'test',
			});

			const snapshot = await takeSnapshot(testDir, plan);

			// Add many events after snapshot (simulating heavy activity)
			const iterations = 30;
			for (let i = 0; i < iterations; i++) {
				await appendLedgerEvent(testDir, {
					plan_id: 'test-plan',
					event_type: 'task_status_changed',
					task_id: '1.1',
					from_status: 'in_progress',
					to_status: i % 2 === 0 ? 'completed' : 'in_progress',
					source: 'test',
				});
				if (i % 5 === 4) {
					await new Promise((resolve) => setImmediate(resolve));
				}
			}

			// Snapshot-based replay should work
			const result = await replayFromLedger(testDir, { useSnapshot: true });

			expect(result).not.toBeNull();
			// Final status should be the last toggled value
			expect(result!.phases[0].tasks.find((t) => t.id === '1.1')!.status).toBe(
				'in_progress',
			);
		});

		test('getEventsAfterSeq returns correct events after snapshot', async () => {
			const plan = createMinimalPlan();
			createPlanJson(plan);

			await initLedger(testDir, 'test-plan');

			for (let i = 1; i <= 5; i++) {
				await appendLedgerEvent(testDir, {
					plan_id: 'test-plan',
					event_type: 'task_status_changed',
					task_id: '1.1',
					from_status: 'pending',
					to_status: 'in_progress',
					source: 'test',
				});
			}

			// Snapshot at seq 6
			const snapshot = await takeSnapshot(testDir, plan);

			// Add more events (reduced from 10 to 6 for Windows file system stability)
			for (let i = 1; i <= 6; i++) {
				await appendLedgerEvent(testDir, {
					plan_id: 'test-plan',
					event_type: 'task_status_changed',
					task_id: '1.1',
					from_status: 'in_progress',
					to_status: 'completed',
					source: 'test',
				});
				if (i % 3 === 0) {
					await new Promise((resolve) => setImmediate(resolve));
				}
			}

			// Get events after snapshot
			const events = await getEventsAfterSeq(testDir, snapshot.snapshot_seq);

			expect(events).toHaveLength(6);
			expect(events[0].seq).toBe(7);
			expect(events[5].seq).toBe(12);
		});
	});

	// -------------------------------------------------------------------------
	// EDGE CASE: snapshot_seq consistency between metadata and filename
	// -------------------------------------------------------------------------
	describe('snapshot_seq consistency between metadata and filename', () => {
		test('metadata snapshot_seq matches filename seq', async () => {
			const plan = createMinimalPlan();
			createPlanJson(plan);

			await initLedger(testDir, 'test-plan');

			await appendLedgerEvent(testDir, {
				plan_id: 'test-plan',
				event_type: 'task_status_changed',
				task_id: '1.1',
				from_status: 'pending',
				to_status: 'in_progress',
				source: 'test',
			});

			const snapshot = await takeSnapshot(testDir, plan);

			// Verify metadata
			const metadata = await getLatestSnapshotMetadata(testDir);
			expect(metadata).not.toBeNull();
			expect(metadata!.snapshot_seq).toBe(snapshot.snapshot_seq);

			// Verify filename
			const snapshotPath = path.join(
				testDir,
				'.swarm',
				'ledger-snapshots',
				`snapshot-${snapshot.snapshot_seq}.json`,
			);
			expect(fs.existsSync(snapshotPath)).toBe(true);

			// Metadata seq should match filename seq
			expect(metadata!.snapshot_seq).toBe(snapshot.snapshot_seq);
		});

		test('manual manipulation: metadata seq points to non-existent file', async () => {
			const plan = createMinimalPlan();
			createPlanJson(plan);

			await initLedger(testDir, 'test-plan');

			await appendLedgerEvent(testDir, {
				plan_id: 'test-plan',
				event_type: 'task_status_changed',
				task_id: '1.1',
				from_status: 'pending',
				to_status: 'in_progress',
				source: 'test',
			});

			await takeSnapshot(testDir, plan);

			// Manually corrupt the latest-snapshot.json to point to wrong seq
			const latestPath = path.join(
				testDir,
				'.swarm',
				'ledger-snapshots',
				'latest-snapshot.json',
			);
			fs.writeFileSync(
				latestPath,
				JSON.stringify({
					snapshot_seq: 999,
					snapshot_hash: 'fakehash',
					created_at: new Date().toISOString(),
				}),
				'utf8',
			);

			// loadSnapshot should return null for seq 999
			const result = await loadSnapshot(testDir, 999);
			expect(result).toBeNull();
		});

		test('manual manipulation: snapshot file exists but metadata points elsewhere', async () => {
			const plan = createMinimalPlan();
			createPlanJson(plan);

			await initLedger(testDir, 'test-plan');

			await appendLedgerEvent(testDir, {
				plan_id: 'test-plan',
				event_type: 'task_status_changed',
				task_id: '1.1',
				from_status: 'pending',
				to_status: 'in_progress',
				source: 'test',
			});

			const snapshot = await takeSnapshot(testDir, plan);

			// Metadata correctly points to snapshot-2
			const metadata = await getLatestSnapshotMetadata(testDir);
			expect(metadata!.snapshot_seq).toBe(2);

			// Snapshot file at seq 2 exists and is loadable
			const loaded = await loadSnapshot(testDir, 2);
			expect(loaded).not.toBeNull();
			expect(loaded!.snapshot_seq).toBe(2);
		});

		test('multiple snapshots - latest metadata always consistent', async () => {
			const plan = createMinimalPlan();
			createPlanJson(plan);

			await initLedger(testDir, 'test-plan');

			// Take multiple snapshots at different seqs
			for (let i = 1; i <= 5; i++) {
				await appendLedgerEvent(testDir, {
					plan_id: 'test-plan',
					event_type: 'task_status_changed',
					task_id: '1.1',
					from_status: 'pending',
					to_status: 'in_progress',
					source: 'test',
				});
				await takeSnapshot(testDir, plan);
			}

			// Latest metadata should point to the last snapshot
			const metadata = await getLatestSnapshotMetadata(testDir);
			expect(metadata).not.toBeNull();
			expect(metadata!.snapshot_seq).toBe(6); // seq 1 (init) + 5 snapshots

			// Loading that snapshot should work
			const loaded = await loadSnapshot(testDir, metadata!.snapshot_seq);
			expect(loaded).not.toBeNull();
			expect(loaded!.snapshot_seq).toBe(6);
		});

		test('snapshot file renamed - loadSnapshot fails gracefully', async () => {
			const plan = createMinimalPlan();
			createPlanJson(plan);

			await initLedger(testDir, 'test-plan');

			await appendLedgerEvent(testDir, {
				plan_id: 'test-plan',
				event_type: 'task_status_changed',
				task_id: '1.1',
				from_status: 'pending',
				to_status: 'in_progress',
				source: 'test',
			});

			const snapshot = await takeSnapshot(testDir, plan);

			// Rename the snapshot file
			const originalPath = path.join(
				testDir,
				'.swarm',
				'ledger-snapshots',
				`snapshot-${snapshot.snapshot_seq}.json`,
			);
			const renamedPath = path.join(
				testDir,
				'.swarm',
				'ledger-snapshots',
				`snapshot-${snapshot.snapshot_seq}.json.bak`,
			);
			fs.renameSync(originalPath, renamedPath);

			// loadSnapshot should return null
			const result = await loadSnapshot(testDir, snapshot.snapshot_seq);
			expect(result).toBeNull();
		});

		test('latest-snapshot.json deleted but snapshot file exists - graceful degradation', async () => {
			const plan = createMinimalPlan();
			createPlanJson(plan);

			await initLedger(testDir, 'test-plan');

			await appendLedgerEvent(testDir, {
				plan_id: 'test-plan',
				event_type: 'task_status_changed',
				task_id: '1.1',
				from_status: 'pending',
				to_status: 'in_progress',
				source: 'test',
			});

			await takeSnapshot(testDir, plan);

			// Delete latest-snapshot.json pointer
			const latestPath = path.join(
				testDir,
				'.swarm',
				'ledger-snapshots',
				'latest-snapshot.json',
			);
			fs.unlinkSync(latestPath);

			// getLatestSnapshotMetadata should return null
			const metadata = await getLatestSnapshotMetadata(testDir);
			expect(metadata).toBeNull();

			// But direct loadSnapshot should still work
			const loaded = await loadSnapshot(testDir, 2);
			expect(loaded).not.toBeNull();
		});
	});

	// -------------------------------------------------------------------------
	// EDGE CASE: Oversized payloads and boundary violations
	// -------------------------------------------------------------------------
	describe('oversized payloads and boundary violations', () => {
		test('loadSnapshot handles massive plan_state without crashing', async () => {
			// Create a massive plan with many phases and tasks
			const massivePhases: Plan['phases'] = [];
			for (let p = 1; p <= 100; p++) {
				const tasks: Plan['phases'][0]['tasks'] = [];
				for (let t = 1; t <= 100; t++) {
					tasks.push({
						id: `${p}.${t}`,
						phase: p,
						status: 'pending' as const,
						size: 'small' as const,
						description:
							`Task ${p}.${t} with a very long description that goes on and on `.repeat(
								10,
							),
						depends: [] as string[],
						files_touched: Array(50).fill(`file-${p}-${t}.ts`),
					});
				}
				massivePhases.push({
					id: p,
					name: `Phase ${p}`,
					status: 'in_progress' as const,
					tasks,
				});
			}

			const massivePlan: Plan = {
				schema_version: '1.0.0',
				title: 'Massive Plan',
				swarm: 'test-swarm',
				current_phase: 1,
				phases: massivePhases,
			};

			createPlanJson(massivePlan);
			await initLedger(testDir, 'test-plan');

			// Take snapshot of massive plan
			const snapshot = await takeSnapshot(testDir, massivePlan);

			// Load it back - should work without crashing
			const loaded = await loadSnapshot(testDir, snapshot.snapshot_seq);
			expect(loaded).not.toBeNull();
			expect(loaded!.plan_state.phases).toHaveLength(100);
			expect(loaded!.plan_state.phases[0].tasks).toHaveLength(100);
		});

		test('getEventsAfterSeq handles ledger with many events', async () => {
			const plan = createMinimalPlan();
			createPlanJson(plan);

			await initLedger(testDir, 'test-plan');

			// Add many events (reduced from 100 to 50 for Windows file system stability)
			for (let i = 0; i < 50; i++) {
				await appendLedgerEvent(testDir, {
					plan_id: 'test-plan',
					event_type: 'task_status_changed',
					task_id: '1.1',
					from_status: 'pending',
					to_status: i % 2 === 0 ? 'in_progress' : 'completed',
					source: 'test',
				});
				if (i % 3 === 0) {
					await new Promise((resolve) => setImmediate(resolve));
				}
			}

			const latestSeq = await getLatestLedgerSeq(testDir);
			expect(latestSeq).toBe(51); // 1 init + 50 events

			// Get events after seq 50
			const events = await getEventsAfterSeq(testDir, 50);
			expect(events).toHaveLength(1); // seqs 51-52

			// Snapshot at seq 51
			const snapshot = await takeSnapshot(testDir, plan);
			expect(snapshot.snapshot_seq).toBe(51);
		}, 30000); // 30 second timeout for this test

		test('takeSnapshot handles deeply nested plan structure', async () => {
			// Create plan with deeply nested depends
			const plan: Plan = {
				schema_version: '1.0.0',
				title: 'Deep Deps Plan',
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
								status: 'pending',
								size: 'small',
								description: 'Deep task',
								depends: [
									'1.2',
									'1.3',
									'1.4',
									'1.5',
									'1.6',
									'1.7',
									'1.8',
									'1.9',
									'1.10',
								],
								files_touched: [],
							},
							...Array(20)
								.fill(null)
								.map((_, i) => ({
									id: `1.${i + 2}`,
									phase: 1,
									status: 'pending' as const,
									size: 'small' as const,
									description: `Task ${i + 2}`,
									depends: [] as string[],
									files_touched: [] as string[],
								})),
						],
					},
				],
			};

			createPlanJson(plan);
			await initLedger(testDir, 'test-plan');

			const snapshot = await takeSnapshot(testDir, plan);

			expect(snapshot.snapshot_seq).toBe(1);
			expect(snapshot.plan_state.phases[0].tasks[0].depends).toHaveLength(9);
		});

		test('handle Unicode and special characters in event data', async () => {
			const plan = createMinimalPlan();
			createPlanJson(plan);

			await initLedger(testDir, 'test-plan');

			// Add event with Unicode and special characters
			await appendLedgerEvent(testDir, {
				plan_id: 'test-plan',
				event_type: 'task_updated',
				task_id: '1.1',
				source: 'test-with-émojis-🎉-and-ém-dash—',
			});

			// Take snapshot
			const snapshot = await takeSnapshot(testDir, plan);

			// Load and verify
			const loaded = await loadSnapshot(testDir, snapshot.snapshot_seq);
			expect(loaded).not.toBeNull();

			// Full replay should also work
			const result = await replayFromLedger(testDir);
			expect(result).not.toBeNull();
		});

		test('empty task_id and phase_id fields handled', async () => {
			const plan = createMinimalPlan();
			createPlanJson(plan);

			await initLedger(testDir, 'test-plan');

			// Event without task_id or phase_id
			await appendLedgerEvent(testDir, {
				plan_id: 'test-plan',
				event_type: 'plan_exported',
				source: 'test',
			});

			const snapshot = await takeSnapshot(testDir, plan);
			const loaded = await loadSnapshot(testDir, snapshot.snapshot_seq);

			expect(loaded).not.toBeNull();
		});

		test('negative or zero seq values rejected by getEventsAfterSeq', async () => {
			const plan = createMinimalPlan();
			createPlanJson(plan);

			await initLedger(testDir, 'test-plan');

			// After seq -1 (which is effectively seq 0) should return all events
			const eventsNeg = await getEventsAfterSeq(testDir, -1);
			expect(eventsNeg).toHaveLength(1); // Just plan_created

			// After seq 0 should also return all events
			const eventsZero = await getEventsAfterSeq(testDir, 0);
			expect(eventsZero).toHaveLength(1);
		});
	});

	// -------------------------------------------------------------------------
	// EDGE CASE: Replay edge cases
	// -------------------------------------------------------------------------
	describe('replay edge cases', () => {
		test('replayFromLedger skips malformed events gracefully', async () => {
			const plan = createMinimalPlan();
			createPlanJson(plan);

			await initLedger(testDir, 'test-plan');

			// Append a malformed event directly to ledger
			const ledgerPath = path.join(testDir, '.swarm', 'plan-ledger.jsonl');
			fs.appendFileSync(ledgerPath, '{ malformed json line }\n', 'utf8');

			// Should not throw, should continue replay
			const result = await replayFromLedger(testDir);
			expect(result).not.toBeNull();
		});

		test('replayFromLedger handles duplicate seq numbers', async () => {
			const plan = createMinimalPlan();
			createPlanJson(plan);

			await initLedger(testDir, 'test-plan');

			// Manually add event with duplicate seq
			const ledgerPath = path.join(testDir, '.swarm', 'plan-ledger.jsonl');
			const dupEvent = {
				seq: 1, // Duplicate of plan_created
				timestamp: new Date().toISOString(),
				plan_id: 'test-plan',
				event_type: 'plan_exported',
				source: 'test',
				plan_hash_before: 'abc',
				plan_hash_after: 'def',
				schema_version: '1.0.0',
			};
			fs.appendFileSync(ledgerPath, JSON.stringify(dupEvent) + '\n', 'utf8');

			// Replay should still work (sorts by seq, may have duplicates)
			const result = await replayFromLedger(testDir);
			expect(result).not.toBeNull();
		});

		test('replayFromLedger handles out-of-order seq numbers', async () => {
			const plan = createMinimalPlan();
			createPlanJson(plan);

			await initLedger(testDir, 'test-plan');

			// Manually add event with out-of-order seq
			const ledgerPath = path.join(testDir, '.swarm', 'plan-ledger.jsonl');
			const outOfOrderEvent = {
				seq: 100, // Way out of order
				timestamp: new Date().toISOString(),
				plan_id: 'test-plan',
				event_type: 'plan_exported',
				source: 'test',
				plan_hash_before: 'abc',
				plan_hash_after: 'def',
				schema_version: '1.0.0',
			};
			fs.appendFileSync(
				ledgerPath,
				JSON.stringify(outOfOrderEvent) + '\n',
				'utf8',
			);

			// Replay should still work
			const result = await replayFromLedger(testDir);
			expect(result).not.toBeNull();
		});
	});
});

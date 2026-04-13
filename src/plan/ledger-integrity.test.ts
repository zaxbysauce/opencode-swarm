/**
 * Tests for ledger integrity functions: readLedgerEventsWithIntegrity,
 * quarantineLedgerSuffix, and replayWithIntegrity
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Plan } from '../../src/config/plan-schema';
import {
	appendLedgerEvent,
	initLedger,
	type LedgerEvent,
	quarantineLedgerSuffix,
	readLedgerEventsWithIntegrity,
	replayWithIntegrity,
	takeSnapshotEvent,
} from '../../src/plan/ledger';

function createTestPlan(): Plan {
	return {
		schema_version: '1.0.0',
		title: 'Test Plan',
		swarm: 'test-swarm',
		current_phase: 1,
		phases: [
			{
				id: 1,
				name: 'Phase 1',
				status: 'in_progress',
				required_agents: undefined,
				tasks: [
					{
						id: '1.1',
						phase: 1,
						status: 'pending',
						size: 'small' as const,
						description: 'Task 1',
						depends: [],
						files_touched: [],
						evidence_path: undefined,
						blocked_reason: undefined,
					},
				],
			},
		],
	};
}

function createTestPlanWithTwoTasks(): Plan {
	return {
		schema_version: '1.0.0',
		title: 'Test Plan',
		swarm: 'test-swarm',
		current_phase: 1,
		phases: [
			{
				id: 1,
				name: 'Phase 1',
				status: 'in_progress',
				required_agents: undefined,
				tasks: [
					{
						id: '1.1',
						phase: 1,
						status: 'pending',
						size: 'small' as const,
						description: 'Task 1',
						depends: [],
						files_touched: [],
						evidence_path: undefined,
						blocked_reason: undefined,
					},
					{
						id: '1.2',
						phase: 1,
						status: 'pending',
						size: 'small' as const,
						description: 'Task 2',
						depends: [],
						files_touched: [],
						evidence_path: undefined,
						blocked_reason: undefined,
					},
				],
			},
		],
	};
}

describe('readLedgerEventsWithIntegrity', () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-integrity-'));
		// Create .swarm directory
		fs.mkdirSync(path.join(testDir, '.swarm'), { recursive: true });
	});

	afterEach(() => {
		// Clean up temp directory
		fs.rmSync(testDir, { force: true, recursive: true });
	});

	test('1. Clean ledger returns all events with truncated=false, badSuffix=null', async () => {
		const ledgerPath = path.join(testDir, '.swarm', 'plan-ledger.jsonl');
		const validEvent: LedgerEvent = {
			seq: 1,
			timestamp: new Date().toISOString(),
			plan_id: 'test-plan-1',
			event_type: 'plan_created',
			source: 'test',
			plan_hash_before: '',
			plan_hash_after: 'abc123',
			schema_version: '1.0.0',
		};
		const event2: LedgerEvent = {
			seq: 2,
			timestamp: new Date().toISOString(),
			plan_id: 'test-plan-1',
			event_type: 'task_added',
			task_id: '1.1',
			source: 'test',
			plan_hash_before: 'abc123',
			plan_hash_after: 'def456',
			schema_version: '1.0.0',
		};

		fs.writeFileSync(
			ledgerPath,
			`${JSON.stringify(validEvent)}\n${JSON.stringify(event2)}\n`,
			'utf8',
		);

		const result = await readLedgerEventsWithIntegrity(testDir);

		expect(result.truncated).toBe(false);
		expect(result.badSuffix).toBeNull();
		expect(result.events).toHaveLength(2);
		expect(result.events[0].seq).toBe(1);
		expect(result.events[1].seq).toBe(2);
	});

	test('2. Ledger with bad line mid-file stops at bad line, truncated=true', async () => {
		const ledgerPath = path.join(testDir, '.swarm', 'plan-ledger.jsonl');
		const validEvent: LedgerEvent = {
			seq: 1,
			timestamp: new Date().toISOString(),
			plan_id: 'test-plan-1',
			event_type: 'plan_created',
			source: 'test',
			plan_hash_before: '',
			plan_hash_after: 'abc123',
			schema_version: '1.0.0',
		};
		const event2: LedgerEvent = {
			seq: 2,
			timestamp: new Date().toISOString(),
			plan_id: 'test-plan-1',
			event_type: 'task_added',
			task_id: '1.1',
			source: 'test',
			plan_hash_before: 'abc123',
			plan_hash_after: 'def456',
			schema_version: '1.0.0',
		};
		const badLine = '{ invalid json }';
		const event4Line = JSON.stringify({
			seq: 4,
			timestamp: new Date().toISOString(),
			plan_id: 'test-plan-1',
			event_type: 'task_added',
			task_id: '1.2',
			source: 'test',
			plan_hash_before: 'def456',
			plan_hash_after: 'ghi789',
			schema_version: '1.0.0',
		});

		fs.writeFileSync(
			ledgerPath,
			JSON.stringify(validEvent) +
				'\n' +
				JSON.stringify(event2) +
				'\n' +
				badLine +
				'\n' +
				event4Line +
				'\n',
			'utf8',
		);

		const result = await readLedgerEventsWithIntegrity(testDir);

		expect(result.truncated).toBe(true);
		expect(result.badSuffix).not.toBeNull();
		expect(result.events).toHaveLength(2);
		expect(result.events[0].seq).toBe(1);
		expect(result.events[1].seq).toBe(2);
		// badSuffix should contain the bad line and everything after
		expect(result.badSuffix).toContain(badLine);
		expect(result.badSuffix).toContain('"seq":4');
	});

	test('3. Ledger with bad line at end — truncated=true, badSuffix is just the bad line', async () => {
		const ledgerPath = path.join(testDir, '.swarm', 'plan-ledger.jsonl');
		const validEvent: LedgerEvent = {
			seq: 1,
			timestamp: new Date().toISOString(),
			plan_id: 'test-plan-1',
			event_type: 'plan_created',
			source: 'test',
			plan_hash_before: '',
			plan_hash_after: 'abc123',
			schema_version: '1.0.0',
		};
		const badLine = '{ broken }';

		fs.writeFileSync(
			ledgerPath,
			`${JSON.stringify(validEvent)}\n${badLine}\n`,
			'utf8',
		);

		const result = await readLedgerEventsWithIntegrity(testDir);

		expect(result.truncated).toBe(true);
		// badSuffix includes trailing newline from split
		expect(result.badSuffix).toBe(`${badLine}\n`);
		expect(result.events).toHaveLength(1);
		expect(result.events[0].seq).toBe(1);
	});

	test('4. Empty ledger returns empty events, truncated=false', async () => {
		const ledgerPath = path.join(testDir, '.swarm', 'plan-ledger.jsonl');
		// Create empty ledger file
		fs.writeFileSync(ledgerPath, '', 'utf8');

		const result = await readLedgerEventsWithIntegrity(testDir);

		expect(result.truncated).toBe(false);
		expect(result.badSuffix).toBeNull();
		expect(result.events).toHaveLength(0);
	});

	test('5. Non-existent ledger returns empty events, truncated=false', async () => {
		const result = await readLedgerEventsWithIntegrity(testDir);

		expect(result.truncated).toBe(false);
		expect(result.badSuffix).toBeNull();
		expect(result.events).toHaveLength(0);
	});
});

describe('quarantineLedgerSuffix', () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-integrity-'));
		fs.mkdirSync(path.join(testDir, '.swarm'), { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(testDir, { force: true, recursive: true });
	});

	test('6. quarantineLedgerSuffix writes correct file content', async () => {
		const badContent = '{ broken: "json" }\nsecond line\nthird line';

		await quarantineLedgerSuffix(testDir, badContent);

		const quarantinePath = path.join(
			testDir,
			'.swarm',
			'plan-ledger.quarantine',
		);
		expect(fs.existsSync(quarantinePath)).toBe(true);

		const content = fs.readFileSync(quarantinePath, 'utf8');
		expect(content).toBe(badContent);
	});

	test('quarantineLedgerSuffix overwrites existing quarantine file', async () => {
		const quarantinePath = path.join(
			testDir,
			'.swarm',
			'plan-ledger.quarantine',
		);
		fs.writeFileSync(quarantinePath, 'old content', 'utf8');

		const newContent = '{ new: "content" }';
		await quarantineLedgerSuffix(testDir, newContent);

		const content = fs.readFileSync(quarantinePath, 'utf8');
		expect(content).toBe(newContent);
	});
});

describe('replayWithIntegrity', () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-integrity-'));
		fs.mkdirSync(path.join(testDir, '.swarm'), { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(testDir, { force: true, recursive: true });
	});

	test('7. replayWithIntegrity on clean ledger returns correct plan state', async () => {
		// Create plan.json with initial state
		const planPath = path.join(testDir, '.swarm', 'plan.json');
		const initialPlan = createTestPlan();
		fs.writeFileSync(planPath, JSON.stringify(initialPlan), 'utf8');

		// Initialize ledger with plan_created event
		await initLedger(testDir, 'test-plan-1');

		// Append a task_status_changed event
		await appendLedgerEvent(testDir, {
			plan_id: 'test-plan-1',
			event_type: 'task_status_changed',
			task_id: '1.1',
			from_status: 'pending',
			to_status: 'in_progress',
			source: 'test',
		});

		const result = await replayWithIntegrity(testDir);

		expect(result).not.toBeNull();
		expect(result!.phases[0].tasks[0].status).toBe('in_progress');
	});

	test('8. replayWithIntegrity on corrupted ledger returns plan state from valid events only', async () => {
		// Create plan.json with initial state
		const planPath = path.join(testDir, '.swarm', 'plan.json');
		const initialPlan = createTestPlanWithTwoTasks();
		fs.writeFileSync(planPath, JSON.stringify(initialPlan), 'utf8');

		// Initialize ledger
		await initLedger(testDir, 'test-plan-1');

		// Append valid event: task 1.1 -> in_progress
		await appendLedgerEvent(testDir, {
			plan_id: 'test-plan-1',
			event_type: 'task_status_changed',
			task_id: '1.1',
			from_status: 'pending',
			to_status: 'in_progress',
			source: 'test',
		});

		// Append valid event: task 1.2 -> in_progress
		await appendLedgerEvent(testDir, {
			plan_id: 'test-plan-1',
			event_type: 'task_status_changed',
			task_id: '1.2',
			from_status: 'pending',
			to_status: 'in_progress',
			source: 'test',
		});

		// Now corrupt the ledger by appending a bad line
		const ledgerPath = path.join(testDir, '.swarm', 'plan-ledger.jsonl');
		fs.appendFileSync(ledgerPath, '\n{ BROKEN JSON LINE }\n', 'utf8');

		const result = await replayWithIntegrity(testDir);

		// Should get plan state with only valid events applied
		expect(result).not.toBeNull();
		expect(result!.phases[0].tasks[0].status).toBe('in_progress');
		expect(result!.phases[0].tasks[1].status).toBe('in_progress');

		// Verify quarantine file was created
		const quarantinePath = path.join(
			testDir,
			'.swarm',
			'plan-ledger.quarantine',
		);
		expect(fs.existsSync(quarantinePath)).toBe(true);
	});

	test('9. replayWithIntegrity on corrupted ledger with snapshot uses snapshot+valid delta', async () => {
		// Create plan.json with initial state
		const planPath = path.join(testDir, '.swarm', 'plan.json');
		const initialPlan = createTestPlanWithTwoTasks();
		fs.writeFileSync(planPath, JSON.stringify(initialPlan), 'utf8');

		// Initialize ledger
		await initLedger(testDir, 'test-plan-1');

		// Append event for task 1.1 -> in_progress
		await appendLedgerEvent(testDir, {
			plan_id: 'test-plan-1',
			event_type: 'task_status_changed',
			task_id: '1.1',
			from_status: 'pending',
			to_status: 'in_progress',
			source: 'test',
		});

		// Take a snapshot after seq 1
		await takeSnapshotEvent(testDir, initialPlan);

		// Append another valid event: task 1.2 -> in_progress
		await appendLedgerEvent(testDir, {
			plan_id: 'test-plan-1',
			event_type: 'task_status_changed',
			task_id: '1.2',
			from_status: 'pending',
			to_status: 'in_progress',
			source: 'test',
		});

		// Now corrupt the ledger
		const ledgerPath = path.join(testDir, '.swarm', 'plan-ledger.jsonl');
		fs.appendFileSync(ledgerPath, '\n{ CORRUPTED LINE }\n', 'utf8');

		const result = await replayWithIntegrity(testDir);

		// Should use snapshot + delta replay and apply only valid events
		expect(result).not.toBeNull();
		expect(result!.phases[0].tasks[0].status).toBe('pending');
		expect(result!.phases[0].tasks[1].status).toBe('in_progress');

		// Verify quarantine file was created
		const quarantinePath = path.join(
			testDir,
			'.swarm',
			'plan-ledger.quarantine',
		);
		expect(fs.existsSync(quarantinePath)).toBe(true);
	});

	test('replayWithIntegrity returns null for empty ledger', async () => {
		const result = await replayWithIntegrity(testDir);
		expect(result).toBeNull();
	});

	test('replayWithIntegrity returns null when plan.json does not exist', async () => {
		// Create a ledger but no plan.json
		await initLedger(testDir, 'test-plan-1');

		const result = await replayWithIntegrity(testDir);
		expect(result).toBeNull();
	});
});

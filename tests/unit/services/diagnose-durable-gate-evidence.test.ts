import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDiagnoseData } from '../../../src/services/diagnose-service.js';

function writePlanWithCompletedTask(directory: string): void {
	mkdirSync(join(directory, '.swarm'), { recursive: true });
	writeFileSync(
		join(directory, '.swarm', 'plan.json'),
		JSON.stringify({
			schema_version: '1.0.0',
			title: 'Test Plan',
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
							status: 'completed',
							size: 'small',
							description: 'Task 1.1',
							depends: [],
							files_touched: [],
						},
					],
				},
			],
		}),
	);
}

function writeLegacyEvidenceBundleDirectory(
	directory: string,
	taskId: string,
): void {
	mkdirSync(join(directory, '.swarm', 'evidence', taskId), {
		recursive: true,
	});
}

function writeDurableGateEvidence(
	directory: string,
	taskId: string,
	requiredGates = ['reviewer', 'test_engineer'],
	gates: Record<
		string,
		{ sessionId: string; timestamp: string; agent: string }
	> = {
		reviewer: {
			sessionId: 'review-session',
			timestamp: '2026-01-01T00:00:00.000Z',
			agent: 'reviewer',
		},
		test_engineer: {
			sessionId: 'test-session',
			timestamp: '2026-01-01T00:01:00.000Z',
			agent: 'test_engineer',
		},
	},
): void {
	const evidenceDir = join(directory, '.swarm', 'evidence');
	mkdirSync(evidenceDir, { recursive: true });
	writeFileSync(
		join(evidenceDir, `${taskId}.json`),
		JSON.stringify({
			taskId,
			required_gates: requiredGates,
			gates,
		}),
	);
}

function writeInvalidDurableGateEvidence(
	directory: string,
	taskId: string,
): void {
	const evidenceDir = join(directory, '.swarm', 'evidence');
	mkdirSync(evidenceDir, { recursive: true });
	writeFileSync(
		join(evidenceDir, `${taskId}.json`),
		JSON.stringify({
			taskId,
			required_gates: ['critic'],
		}),
	);
}

function findCheck(
	checks: Awaited<ReturnType<typeof getDiagnoseData>>['checks'],
	name: string,
) {
	return checks.find((check) => check.name === name);
}

describe('diagnose durable gate evidence', () => {
	let testDir: string;
	let previousSwarmId: string | undefined;

	beforeEach(() => {
		testDir = realpathSync(
			mkdtempSync(join(tmpdir(), 'diagnose-durable-gate-')),
		);
		previousSwarmId = process.env.OPENCODE_SWARM_ID;
		process.env.OPENCODE_SWARM_ID = 'test-swarm';
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
		if (previousSwarmId === undefined) {
			delete process.env.OPENCODE_SWARM_ID;
		} else {
			process.env.OPENCODE_SWARM_ID = previousSwarmId;
		}
	});

	test('passes completed tasks with only complete durable gate evidence', async () => {
		writePlanWithCompletedTask(testDir);
		writeDurableGateEvidence(testDir, '1.1');

		const result = await getDiagnoseData(testDir);
		const check = findCheck(result.checks, 'Evidence');

		expect(check).toBeDefined();
		expect(check?.status).toBe('✅');
		expect(check?.detail).toContain('All 1 completed tasks have evidence');
	});

	test('fails completed tasks with legacy evidence but incomplete durable gates', async () => {
		writePlanWithCompletedTask(testDir);
		writeLegacyEvidenceBundleDirectory(testDir, '1.1');
		writeDurableGateEvidence(
			testDir,
			'1.1',
			['critic', 'reviewer', 'test_engineer'],
			{
				reviewer: {
					sessionId: 'review-session',
					timestamp: '2026-01-01T00:00:00.000Z',
					agent: 'reviewer',
				},
				test_engineer: {
					sessionId: 'test-session',
					timestamp: '2026-01-01T00:01:00.000Z',
					agent: 'test_engineer',
				},
			},
		);

		const result = await getDiagnoseData(testDir);
		const check = findCheck(result.checks, 'Evidence');

		expect(check).toBeDefined();
		expect(check?.status).toBe('❌');
		expect(check?.detail).toContain('1 completed task(s) missing evidence');
		expect(check?.detail).toContain('1.1');
	});

	test('fails completed tasks with legacy evidence but invalid durable gates', async () => {
		writePlanWithCompletedTask(testDir);
		writeLegacyEvidenceBundleDirectory(testDir, '1.1');
		writeInvalidDurableGateEvidence(testDir, '1.1');

		const result = await getDiagnoseData(testDir);
		const check = findCheck(result.checks, 'Evidence');

		expect(check).toBeDefined();
		expect(check?.status).toBe('❌');
		expect(check?.detail).toContain('1 completed task(s) missing evidence');
		expect(check?.detail).toContain('1.1');
	});
});

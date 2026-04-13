import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkCouncilGate } from '../../../src/tools/update-task-status';

type CouncilGate = {
	verdict?: 'APPROVE' | 'CONCERNS' | 'REJECT';
	sessionId?: string;
	timestamp?: string;
	agent?: string;
};

type CouncilEnabledValue = boolean | undefined;

interface FixtureOptions {
	councilEnabled: CouncilEnabledValue;
	councilGate?: CouncilGate | null;
}

let tempDir: string;

const TASK_ID = '1.1';

function writeFixture(opts: FixtureOptions): void {
	// .opencode/opencode-swarm.json
	mkdirSync(join(tempDir, '.opencode'), { recursive: true });
	const configBody: Record<string, unknown> = {};
	if (opts.councilEnabled !== undefined) {
		configBody.council = { enabled: opts.councilEnabled };
	}
	writeFileSync(
		join(tempDir, '.opencode', 'opencode-swarm.json'),
		JSON.stringify(configBody),
	);

	// .swarm/evidence/1.1.json
	mkdirSync(join(tempDir, '.swarm', 'evidence'), { recursive: true });
	const gates: Record<string, unknown> = {
		reviewer: {
			sessionId: 'swarm-1',
			timestamp: '2026-04-13T00:00:00.000Z',
			agent: 'reviewer',
		},
		test_engineer: {
			sessionId: 'swarm-1',
			timestamp: '2026-04-13T00:00:00.000Z',
			agent: 'test_engineer',
		},
	};
	if (opts.councilGate) {
		gates.council = {
			sessionId: 'swarm-1',
			timestamp: '2026-04-13T00:00:00.000Z',
			agent: 'architect',
			...opts.councilGate,
		};
	}
	writeFileSync(
		join(tempDir, '.swarm', 'evidence', `${TASK_ID}.json`),
		JSON.stringify({
			taskId: TASK_ID,
			required_gates: ['reviewer', 'test_engineer'],
			gates,
		}),
	);
}

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), 'update-task-status-council-'));
});

afterEach(() => {
	rmSync(tempDir, { recursive: true, force: true });
});

describe('checkCouncilGate — council.enabled=true', () => {
	test('gates.council absent → blocked with "council gate required" reason', () => {
		writeFixture({ councilEnabled: true, councilGate: null });
		const result = checkCouncilGate(tempDir, TASK_ID);
		expect(result.blocked).toBe(true);
		expect(result.reason).toMatch(/council gate required/);
	});

	test('gates.council.verdict=REJECT → blocked with "council gate blocked" reason', () => {
		writeFixture({ councilEnabled: true, councilGate: { verdict: 'REJECT' } });
		const result = checkCouncilGate(tempDir, TASK_ID);
		expect(result.blocked).toBe(true);
		expect(result.reason).toMatch(/council gate blocked/);
	});

	test('gates.council.verdict=APPROVE → allowed', () => {
		writeFixture({ councilEnabled: true, councilGate: { verdict: 'APPROVE' } });
		const result = checkCouncilGate(tempDir, TASK_ID);
		expect(result.blocked).toBe(false);
		expect(result.reason).toBe('');
	});

	test('gates.council.verdict=CONCERNS → allowed', () => {
		writeFixture({
			councilEnabled: true,
			councilGate: { verdict: 'CONCERNS' },
		});
		const result = checkCouncilGate(tempDir, TASK_ID);
		expect(result.blocked).toBe(false);
		expect(result.reason).toBe('');
	});
});

describe('checkCouncilGate — council.enabled=false (feature off, no regression)', () => {
	test('gates.council absent → allowed', () => {
		writeFixture({ councilEnabled: false, councilGate: null });
		const result = checkCouncilGate(tempDir, TASK_ID);
		expect(result.blocked).toBe(false);
		expect(result.reason).toBe('');
	});

	test('gates.council.verdict=REJECT → allowed (feature off, no regression)', () => {
		writeFixture({ councilEnabled: false, councilGate: { verdict: 'REJECT' } });
		const result = checkCouncilGate(tempDir, TASK_ID);
		expect(result.blocked).toBe(false);
		expect(result.reason).toBe('');
	});
});

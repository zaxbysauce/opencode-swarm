import { describe, expect, test } from 'bun:test';
import { AGENT_TOOL_MAP } from '../../../src/config/constants';
import { TOOL_NAMES, TOOL_NAME_SET } from '../../../src/tools/tool-names';

describe('convene_council — registration', () => {
	test('convene_council is in TOOL_NAMES', () => {
		expect(TOOL_NAMES).toContain('convene_council');
	});

	test('convene_council is in TOOL_NAME_SET (derived from TOOL_NAMES)', () => {
		expect(TOOL_NAME_SET.has('convene_council')).toBe(true);
	});

	test('convene_council is in AGENT_TOOL_MAP.architect', () => {
		expect(AGENT_TOOL_MAP.architect).toContain('convene_council');
	});

	test('convene_council is architect-only — no other agent has it', () => {
		const otherAgents = Object.keys(AGENT_TOOL_MAP).filter(
			(a) => a !== 'architect',
		) as Array<keyof typeof AGENT_TOOL_MAP>;
		for (const agent of otherAgents) {
			expect(AGENT_TOOL_MAP[agent]).not.toContain('convene_council');
		}
	});

	test('convene_council is exported from src/tools/index.ts', async () => {
		const tools = await import('../../../src/tools/index');
		expect('convene_council' in tools).toBe(true);
	});

	test('convene_council module exports a valid tool with description + execute', async () => {
		const { convene_council } = await import(
			'../../../src/tools/convene-council'
		);
		expect(convene_council).toBeDefined();
		expect(convene_council).toHaveProperty('description');
		expect(convene_council).toHaveProperty('execute');
		expect(typeof convene_council.execute).toBe('function');
	});

	test('convene_council declares required args surface', async () => {
		const { convene_council } = await import(
			'../../../src/tools/convene-council'
		);
		expect(convene_council.args).toBeDefined();
		expect(convene_council.args).toHaveProperty('taskId');
		expect(convene_council.args).toHaveProperty('swarmId');
		expect(convene_council.args).toHaveProperty('verdicts');
		expect(convene_council.args).toHaveProperty('working_directory');
	});
});

describe('convene_council — config gate', () => {
	test('returns disabled message when council.enabled is not set (default)', async () => {
		const { mkdtempSync, rmSync } = await import('node:fs');
		const { tmpdir } = await import('node:os');
		const { join } = await import('node:path');
		const tempDir = mkdtempSync(join(tmpdir(), 'convene-council-test-'));
		try {
			const { convene_council } = await import(
				'../../../src/tools/convene-council'
			);
			const result = await convene_council.execute(
				{
					taskId: '1.1',
					swarmId: 'swarm-1',
					roundNumber: 1,
					verdicts: [
						{
							agent: 'critic',
							verdict: 'APPROVE',
							confidence: 1,
							findings: [],
							criteriaAssessed: [],
							criteriaUnmet: [],
							durationMs: 0,
						},
					],
					working_directory: tempDir,
				},
				{ directory: tempDir },
			);
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.reason).toContain('disabled');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	test('invalid arguments return structured error without throwing', async () => {
		const { convene_council } = await import(
			'../../../src/tools/convene-council'
		);
		const result = await convene_council.execute(
			{
				// missing required fields
				taskId: 'not-a-valid-task-id',
			},
			{ directory: process.cwd() },
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.reason).toBe('invalid arguments');
		expect(Array.isArray(parsed.errors)).toBe(true);
	});
});

describe('convene_council — happy path with enabled config', () => {
	test('writes council evidence and returns APPROVE when enabled', async () => {
		const { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } =
			await import('node:fs');
		const { tmpdir } = await import('node:os');
		const { join } = await import('node:path');
		const tempDir = mkdtempSync(join(tmpdir(), 'convene-council-enabled-'));
		try {
			// Enable council in project config
			mkdirSync(join(tempDir, '.opencode'), { recursive: true });
			writeFileSync(
				join(tempDir, '.opencode', 'opencode-swarm.json'),
				JSON.stringify({ council: { enabled: true } }),
			);

			const { convene_council } = await import(
				'../../../src/tools/convene-council'
			);
			const result = await convene_council.execute(
				{
					taskId: '1.1',
					swarmId: 'swarm-1',
					roundNumber: 1,
					verdicts: [
						{
							agent: 'critic',
							verdict: 'APPROVE',
							confidence: 1,
							findings: [],
							criteriaAssessed: [],
							criteriaUnmet: [],
							durationMs: 10,
						},
						{
							agent: 'reviewer',
							verdict: 'APPROVE',
							confidence: 1,
							findings: [],
							criteriaAssessed: [],
							criteriaUnmet: [],
							durationMs: 10,
						},
						{
							agent: 'sme',
							verdict: 'APPROVE',
							confidence: 1,
							findings: [],
							criteriaAssessed: [],
							criteriaUnmet: [],
							durationMs: 10,
						},
						{
							agent: 'test_engineer',
							verdict: 'APPROVE',
							confidence: 1,
							findings: [],
							criteriaAssessed: [],
							criteriaUnmet: [],
							durationMs: 10,
						},
					],
					working_directory: tempDir,
				},
				{ directory: tempDir },
			);
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(true);
			expect(parsed.overallVerdict).toBe('APPROVE');
			expect(parsed.vetoedBy).toBeNull();

			// Evidence file should be written at the raw taskId path — same
			// location check_gate_status and update-task-status read from.
			const evidencePath = join(tempDir, '.swarm', 'evidence', '1.1.json');
			const evidenceJson = JSON.parse(readFileSync(evidencePath, 'utf-8'));
			expect(evidenceJson.council).toBeDefined();
			expect(evidenceJson.council.verdict).toBe('APPROVE');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});

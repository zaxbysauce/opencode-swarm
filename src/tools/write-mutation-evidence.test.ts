import { describe, test, expect, beforeEach, afterEach, vi } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

// Mock the hooks/utils module before importing the tool
vi.mock('../hooks/utils', () => ({
	validateSwarmPath: vi.fn((directory: string, relativePath: string) => {
		// Simulate successful validation
		return path.join(directory, relativePath);
	}),
}));

// We need to mock createSwarmTool since it imports from @opencode-ai/plugin
vi.mock('./create-tool', () => ({
	createSwarmTool: vi.fn((def) => def),
}));

vi.mock('@opencode-ai/plugin/tool', () => ({
	tool: {
		schema: {
			number: () => ({
				int: () => ({
					min: () => ({
						describe: () => ({}),
					}),
				}),
				optional: () => ({
					describe: () => ({}),
				}),
			}),
			string: () => ({
				optional: () => ({
					describe: () => ({}),
				}),
				describe: () => ({}),
			}),
			enum: () => ({
				describe: () => ({}),
			}),
		},
	},
}));

// Import the module AFTER mocking
const { executeWriteMutationEvidence } = await import('./write-mutation-evidence');

describe('write-mutation-evidence', () => {
	const testDir = path.join(process.env.TEMP ?? '/tmp', 'mutation-evidence-test', String(Date.now()));

	beforeEach(async () => {
		vi.clearAllMocks();
		// Create test directory
		await fs.promises.mkdir(testDir, { recursive: true });
	});

	afterEach(async () => {
		// Clean up test directory
		try {
			await fs.promises.rm(testDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
		vi.restoreAllMocks();
	});

	test('1: SKIP verdict WITHOUT killRate/adjustedKillRate — should succeed and write evidence with defaults (0)', async () => {
		const result = await executeWriteMutationEvidence(
			{
				phase: 1,
				verdict: 'SKIP',
				summary: 'Mutation testing skipped for this phase',
			},
			testDir,
		);

		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(true);
		expect(parsed.phase).toBe(1);
		expect(parsed.verdict).toBe('skip');

		// Verify the file was written with defaults
		const evidencePath = path.join(testDir, 'evidence', '1', 'mutation-gate.json');
		const content = JSON.parse(await fs.promises.readFile(evidencePath, 'utf-8'));
		expect(content.entries[0].type).toBe('mutation-gate');
		expect(content.entries[0].verdict).toBe('skip');
		expect(content.entries[0].killRate).toBe(0);
		expect(content.entries[0].adjustedKillRate).toBe(0);
		expect(content.entries[0].summary).toBe('Mutation testing skipped for this phase');
	});

	test('2: PASS verdict WITH killRate=0.85, adjustedKillRate=0.87 — should succeed', async () => {
		const result = await executeWriteMutationEvidence(
			{
				phase: 2,
				verdict: 'PASS',
				killRate: 0.85,
				adjustedKillRate: 0.87,
				summary: 'All mutants killed successfully',
			},
			testDir,
		);

		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(true);
		expect(parsed.phase).toBe(2);
		expect(parsed.verdict).toBe('pass');

		// Verify the file was written with correct rates
		const evidencePath = path.join(testDir, 'evidence', '2', 'mutation-gate.json');
		const content = JSON.parse(await fs.promises.readFile(evidencePath, 'utf-8'));
		expect(content.entries[0].type).toBe('mutation-gate');
		expect(content.entries[0].verdict).toBe('pass');
		expect(content.entries[0].killRate).toBe(0.85);
		expect(content.entries[0].adjustedKillRate).toBe(0.87);
		expect(content.entries[0].summary).toBe('All mutants killed successfully');
	});

	test('3: FAIL verdict WITH killRate=0.3, adjustedKillRate=0.35 — should succeed', async () => {
		const result = await executeWriteMutationEvidence(
			{
				phase: 3,
				verdict: 'FAIL',
				killRate: 0.3,
				adjustedKillRate: 0.35,
				summary: 'Too many mutants survived',
			},
			testDir,
		);

		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(true);
		expect(parsed.phase).toBe(3);
		expect(parsed.verdict).toBe('fail');

		// Verify the file was written with correct rates
		const evidencePath = path.join(testDir, 'evidence', '3', 'mutation-gate.json');
		const content = JSON.parse(await fs.promises.readFile(evidencePath, 'utf-8'));
		expect(content.entries[0].type).toBe('mutation-gate');
		expect(content.entries[0].verdict).toBe('fail');
		expect(content.entries[0].killRate).toBe(0.3);
		expect(content.entries[0].adjustedKillRate).toBe(0.35);
		expect(content.entries[0].summary).toBe('Too many mutants survived');
	});

	test('4: Invalid verdict INVALID WITH rates — should fail with validation error', async () => {
		const result = await executeWriteMutationEvidence(
			{
				phase: 4,
				verdict: 'INVALID',
				killRate: 0.85,
				adjustedKillRate: 0.87,
				summary: 'This should fail',
			} as any,
			testDir,
		);

		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.phase).toBe(4);
		expect(parsed.message).toContain("Invalid verdict: must be 'PASS', 'WARN', 'FAIL', or 'SKIP'");
	});

	test('5: WARN verdict — should succeed', async () => {
		const result = await executeWriteMutationEvidence(
			{
				phase: 5,
				verdict: 'WARN',
				killRate: 0.6,
				adjustedKillRate: 0.65,
				summary: 'Kill rate below threshold but within warning range',
			},
			testDir,
		);

		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(true);
		expect(parsed.verdict).toBe('warn');

		const evidencePath = path.join(testDir, 'evidence', '5', 'mutation-gate.json');
		const content = JSON.parse(await fs.promises.readFile(evidencePath, 'utf-8'));
		expect(content.entries[0].verdict).toBe('warn');
		expect(content.entries[0].killRate).toBe(0.6);
		expect(content.entries[0].adjustedKillRate).toBe(0.65);
	});

	test('6: Invalid phase 0 — should fail', async () => {
		const result = await executeWriteMutationEvidence(
			{
				phase: 0,
				verdict: 'PASS',
				summary: 'Invalid phase',
			},
			testDir,
		);

		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.message).toBe('Invalid phase: must be a positive integer');
	});

	test('7: Invalid phase -1 — should fail', async () => {
		const result = await executeWriteMutationEvidence(
			{
				phase: -1,
				verdict: 'PASS',
				summary: 'Invalid phase',
			},
			testDir,
		);

		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.message).toBe('Invalid phase: must be a positive integer');
	});

	test('8: NaN killRate — should fail validation', async () => {
		const result = await executeWriteMutationEvidence(
			{
				phase: 8,
				verdict: 'PASS',
				killRate: NaN,
				summary: 'NaN killRate',
			},
			testDir,
		);

		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.message).toBe('Invalid killRate: must be a number');
	});

	test('9: Empty summary — should fail validation', async () => {
		const result = await executeWriteMutationEvidence(
			{
				phase: 9,
				verdict: 'PASS',
				summary: '   ',
			},
			testDir,
		);

		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.message).toBe('Invalid summary: must be a non-empty string');
	});

	test('10: Survived mutants included when provided', async () => {
		const result = await executeWriteMutationEvidence(
			{
				phase: 10,
				verdict: 'FAIL',
				killRate: 0.5,
				adjustedKillRate: 0.55,
				summary: 'Some mutants survived',
				survivedMutants: '["mutant1", "mutant2"]',
			},
			testDir,
		);

		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(true);

		const evidencePath = path.join(testDir, 'evidence', '10', 'mutation-gate.json');
		const content = JSON.parse(await fs.promises.readFile(evidencePath, 'utf-8'));
		expect(content.entries[0].survivedMutants).toBe('["mutant1", "mutant2"]');
	});
});

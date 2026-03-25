import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ToolContext } from '@opencode-ai/plugin';
import { check_gate_status } from './check-gate-status';

// Helper to call tool execute with proper context
async function executeTool(
	args: Record<string, unknown>,
	directory: string,
): Promise<string> {
	return check_gate_status.execute(args, {
		directory,
	} as unknown as ToolContext);
}

// Helper to split output into prefix and JSON parts
function parseOutput(output: string): { prefix: string; json: unknown } {
	const firstNewlineIndex = output.indexOf('\n');
	if (firstNewlineIndex === -1) {
		throw new Error(`No newline found in output: ${output}`);
	}
	const prefix = output.slice(0, firstNewlineIndex);
	const jsonStr = output.slice(firstNewlineIndex + 1);
	return { prefix, json: JSON.parse(jsonStr) };
}

let tmpDir: string;

beforeEach(() => {
	tmpDir = mkdtempSync(path.join(os.tmpdir(), 'gate-prefix-test-'));
	// Create the .swarm/evidence directory structure
	mkdirSync(path.join(tmpDir, '.swarm', 'evidence'), { recursive: true });
});

afterEach(() => {
	try {
		rmSync(tmpDir, { recursive: true, force: true });
	} catch {
		/* best effort */
	}
});

describe('GATE prefix output format', () => {
	describe('Block cases', () => {
		it('1. Missing task_id → [GATE:BLOCK reason=Missing task_id parameter]', async () => {
			const result = await executeTool({}, tmpDir);
			const { prefix, json } = parseOutput(result);

			expect(prefix).toBe('[GATE:BLOCK reason=Missing task_id parameter]');
			expect(json).toMatchObject({
				status: 'no_evidence',
				taskId: '',
			});
		});

		it('2. Invalid task_id format → [GATE:BLOCK reason=No evidence found for task ...]', async () => {
			const result = await executeTool({ task_id: 'invalid' }, tmpDir);
			const { prefix, json } = parseOutput(result);

			expect(prefix).toBe(
				'[GATE:BLOCK reason=No evidence found for task invalid]',
			);
			expect(json).toMatchObject({
				status: 'no_evidence',
				taskId: 'invalid',
			});
		});

		it('2b. Task_id with path traversal attempt → same BLOCK prefix', async () => {
			const result = await executeTool({ task_id: '1.1/../../etc' }, tmpDir);
			const { prefix, json } = parseOutput(result);

			expect(prefix).toBe(
				'[GATE:BLOCK reason=No evidence found for task 1.1/../../etc]',
			);
			expect(json).toMatchObject({
				status: 'no_evidence',
			});
		});

		it('2c. Task_id with backslash → same BLOCK prefix', async () => {
			const result = await executeTool({ task_id: '1.1\\..\\..\\etc' }, tmpDir);
			const { prefix, json } = parseOutput(result);

			expect(prefix).toBe(
				'[GATE:BLOCK reason=No evidence found for task 1.1\\..\\..\\etc]',
			);
			expect(json).toMatchObject({
				status: 'no_evidence',
			});
		});

		it('3. No evidence found → [GATE:BLOCK reason=No evidence found for task ...]', async () => {
			// Valid format but file doesn't exist
			const result = await executeTool({ task_id: '1.1' }, tmpDir);
			const { prefix, json } = parseOutput(result);

			expect(prefix).toBe('[GATE:BLOCK reason=No evidence found for task 1.1]');
			expect(json).toMatchObject({
				status: 'no_evidence',
				taskId: '1.1',
				message: expect.stringContaining('No evidence file found'),
			});
		});

		it('3b. Invalid JSON evidence → same BLOCK prefix', async () => {
			writeFileSync(
				path.join(tmpDir, '.swarm', 'evidence', '2.3.json'),
				'invalid json',
			);

			const result = await executeTool({ task_id: '2.3' }, tmpDir);
			const { prefix, json } = parseOutput(result);

			expect(prefix).toBe('[GATE:BLOCK reason=No evidence found for task 2.3]');
			expect(json).toMatchObject({
				status: 'no_evidence',
			});
		});
	});

	describe('Pass/Warn cases', () => {
		it('5. All gates passed → [GATE:PASS] then JSON', async () => {
			const evidence = {
				taskId: '5.1',
				required_gates: ['reviewer'],
				gates: {
					reviewer: {
						sessionId: 'sess-1',
						timestamp: '2024-01-01T00:00:00Z',
						agent: 'reviewer',
					},
				},
			};
			writeFileSync(
				path.join(tmpDir, '.swarm', 'evidence', '5.1.json'),
				JSON.stringify(evidence),
			);

			const result = await executeTool({ task_id: '5.1' }, tmpDir);
			const { prefix, json } = parseOutput(result);

			expect(prefix).toBe('[GATE:PASS]');
			expect(json).toMatchObject({
				status: 'all_passed',
				taskId: '5.1',
				passed_gates: ['reviewer'],
				missing_gates: [],
			});
		});

		it('5b. Multiple gates all passed', async () => {
			const evidence = {
				taskId: '5.2',
				required_gates: ['reviewer', 'test_engineer'],
				gates: {
					reviewer: {
						sessionId: 'sess-1',
						timestamp: '2024-01-01T00:00:00Z',
						agent: 'reviewer',
					},
					test_engineer: {
						sessionId: 'sess-2',
						timestamp: '2024-01-01T00:01:00Z',
						agent: 'test_engineer',
					},
				},
			};
			writeFileSync(
				path.join(tmpDir, '.swarm', 'evidence', '5.2.json'),
				JSON.stringify(evidence),
			);

			const result = await executeTool({ task_id: '5.2' }, tmpDir);
			const { prefix, json } = parseOutput(result);

			expect(prefix).toBe('[GATE:PASS]');
			expect(json).toMatchObject({
				status: 'all_passed',
				passed_gates: ['reviewer', 'test_engineer'],
				missing_gates: [],
			});
		});

		it('6. Gates incomplete → [GATE:WARN reason=Missing gates: ...] then JSON', async () => {
			const evidence = {
				taskId: '6.1',
				required_gates: ['reviewer', 'test_engineer'],
				gates: {
					reviewer: {
						sessionId: 'sess-1',
						timestamp: '2024-01-01T00:00:00Z',
						agent: 'reviewer',
					},
				},
			};
			writeFileSync(
				path.join(tmpDir, '.swarm', 'evidence', '6.1.json'),
				JSON.stringify(evidence),
			);

			const result = await executeTool({ task_id: '6.1' }, tmpDir);
			const { prefix, json } = parseOutput(result);

			expect(prefix).toBe('[GATE:WARN reason=Missing gates: test_engineer]');
			expect(json).toMatchObject({
				status: 'incomplete',
				taskId: '6.1',
				passed_gates: ['reviewer'],
				missing_gates: ['test_engineer'],
			});
		});

		it('6b. Multiple missing gates', async () => {
			const evidence = {
				taskId: '6.2',
				required_gates: ['reviewer', 'test_engineer', 'docs'],
				gates: {},
			};
			writeFileSync(
				path.join(tmpDir, '.swarm', 'evidence', '6.2.json'),
				JSON.stringify(evidence),
			);

			const result = await executeTool({ task_id: '6.2' }, tmpDir);
			const { prefix, json } = parseOutput(result);

			expect(prefix).toBe(
				'[GATE:WARN reason=Missing gates: reviewer, test_engineer, docs]',
			);
			expect(json).toMatchObject({
				status: 'incomplete',
				missing_gates: ['reviewer', 'test_engineer', 'docs'],
			});
		});
	});

	describe('Prefix parsing edge cases', () => {
		it('output contains exactly one newline before JSON body', async () => {
			const evidence = {
				taskId: '7.1',
				required_gates: ['reviewer'],
				gates: {
					reviewer: {
						sessionId: 'sess-1',
						timestamp: '2024-01-01T00:00:00Z',
						agent: 'reviewer',
					},
				},
			};
			writeFileSync(
				path.join(tmpDir, '.swarm', 'evidence', '7.1.json'),
				JSON.stringify(evidence),
			);

			const result = await executeTool({ task_id: '7.1' }, tmpDir);
			const firstNewlineIndex = result.indexOf('\n');

			// Verify the prefix ends right before the first newline
			const prefix = result.slice(0, firstNewlineIndex);
			expect(prefix).toBe('[GATE:PASS]');

			// Verify the JSON starts right after the first newline
			expect(result[firstNewlineIndex + 1]).toBe('{');
		});

		it('JSON starts immediately after newline', async () => {
			const evidence = {
				taskId: '8.1',
				required_gates: ['reviewer'],
				gates: {
					reviewer: {
						sessionId: 'sess-1',
						timestamp: '2024-01-01T00:00:00Z',
						agent: 'reviewer',
					},
				},
			};
			writeFileSync(
				path.join(tmpDir, '.swarm', 'evidence', '8.1.json'),
				JSON.stringify(evidence),
			);

			const result = await executeTool({ task_id: '8.1' }, tmpDir);
			const firstNewlineIndex = result.indexOf('\n');

			// JSON should start right after the newline
			expect(result[firstNewlineIndex + 1]).toBe('{');
		});

		it('BLOCK prefix does not include trailing space before newline', async () => {
			const result = await executeTool({}, tmpDir);
			const firstNewlineIndex = result.indexOf('\n');
			const prefix = result.slice(0, firstNewlineIndex);

			// Should not end with space
			expect(prefix).not.toMatch(/ $/);
			expect(prefix).toBe('[GATE:BLOCK reason=Missing task_id parameter]');
		});
	});
});

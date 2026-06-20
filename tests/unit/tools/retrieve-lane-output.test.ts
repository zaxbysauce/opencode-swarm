import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { storeLaneOutput } from '../../../src/background/lane-output-store';
import { retrieve_lane_output } from '../../../src/tools/retrieve-lane-output';

function makeTempDir(): string {
	return fs.realpathSync(
		fs.mkdtempSync(path.join(os.tmpdir(), 'retrieve-lane-output-')),
	);
}

describe('retrieve_lane_output', () => {
	test('retrieves a bounded page of stored lane output', async () => {
		const directory = makeTempDir();
		const stored = storeLaneOutput(directory, {
			batchId: 'batch-1',
			laneId: 'lane-1',
			agent: 'explorer',
			role: 'explorer',
			source: 'collect_lane_results',
			text: ['line 1', 'line 2', 'line 3'].join('\n'),
		});

		const output = await retrieve_lane_output.execute(
			{ ref: stored.ref, offset: 1, limit: 1 },
			{ directory } as never,
		);

		expect(output).toContain(`Lane output ${stored.ref} lines 2-2 of 3`);
		expect(output).toContain('Batch: batch-1');
		expect(output).toContain('line 2');
		expect(output).not.toContain('line 1');
		expect(output).toContain('Use offset=2 to retrieve more');
	});

	test('returns structured not_found for invalid refs', async () => {
		const output = await retrieve_lane_output.execute({ ref: '../not-a-ref' }, {
			directory: makeTempDir(),
		} as never);

		const parsed = JSON.parse(output);
		expect(parsed.success).toBe(false);
		expect(parsed.failure_class).toBe('not_found');
	});
});

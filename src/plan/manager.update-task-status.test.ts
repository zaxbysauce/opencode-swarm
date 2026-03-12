import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Plan } from '../config/plan-schema';
import { loadPlan, savePlan, updateTaskStatus } from './manager';

function makePlan(): Plan {
	return {
		schema_version: '1.0.0',
		title: 'Status Derivation Test Plan',
		swarm: 'test-swarm',
		current_phase: 1,
		phases: [
			{
				id: 1,
				name: 'Phase 1',
				status: 'pending',
				tasks: [
					{
						id: '1.1',
						phase: 1,
						status: 'pending',
						size: 'small',
						description: 'First task',
						depends: [],
						files_touched: [],
					},
					{
						id: '1.2',
						phase: 1,
						status: 'pending',
						size: 'small',
						description: 'Second task',
						depends: [],
						files_touched: [],
					},
				],
			},
		],
		migration_status: 'native',
	};
}

describe('updateTaskStatus phase status derivation', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-status-test-'));
		fs.mkdirSync(path.join(tempDir, '.swarm'), { recursive: true });
		await savePlan(tempDir, makePlan());
	});

	afterEach(() => {
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('sets phase to in_progress when first task becomes in_progress', async () => {
		const updated = await updateTaskStatus(tempDir, '1.1', 'in_progress');

		expect(updated.phases[0].status).toBe('in_progress');
	});

	it('sets phase to complete when all tasks are completed', async () => {
		await updateTaskStatus(tempDir, '1.1', 'completed');
		const updated = await updateTaskStatus(tempDir, '1.2', 'completed');

		expect(updated.phases[0].status).toBe('complete');
	});

	it('returns phase to pending when no task is in_progress/blocked and not all are completed', async () => {
		await updateTaskStatus(tempDir, '1.1', 'in_progress');
		const updated = await updateTaskStatus(tempDir, '1.1', 'pending');

		expect(updated.phases[0].status).toBe('pending');

		const reloaded = await loadPlan(tempDir);
		expect(reloaded?.phases[0].status).toBe('pending');
	});
});

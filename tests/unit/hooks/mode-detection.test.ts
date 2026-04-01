import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Plan } from '../../../src/config/plan-schema';
import { detectArchitectMode } from '../../../src/hooks/system-enhancer';
import { savePlan } from '../../../src/plan/manager';

describe('detectArchitectMode', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'mode-detection-test-'));
	});

	afterEach(async () => {
		if (tempDir) {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it('returns DISCOVER when no plan exists', async () => {
		const mode = await detectArchitectMode(tempDir);
		expect(mode).toBe('DISCOVER');
	});

	it('returns EXECUTE when an in-progress task exists', async () => {
		const plan: Plan = {
			schema_version: '1.0.0',
			title: 'Test',
			swarm: 'test',
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
							status: 'in_progress',
							size: 'small',
							description: 'Task 1',
							depends: [],
							files_touched: [],
						},
					],
				},
			],
		};
		await savePlan(tempDir, plan);
		const mode = await detectArchitectMode(tempDir);
		expect(mode).toBe('EXECUTE');
	});

	it('returns PHASE-WRAP when all tasks are complete', async () => {
		const plan: Plan = {
			schema_version: '1.0.0',
			title: 'Test',
			swarm: 'test',
			current_phase: 1,
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'completed',
					tasks: [
						{
							id: '1.1',
							phase: 1,
							status: 'completed',
							size: 'small',
							description: 'Task 1',
							depends: [],
							files_touched: [],
						},
					],
				},
			],
		};
		await savePlan(tempDir, plan);
		const mode = await detectArchitectMode(tempDir);
		expect(mode).toBe('PHASE-WRAP');
	});

	it('returns PLAN when plan exists but no active task', async () => {
		const plan: Plan = {
			schema_version: '1.0.0',
			title: 'Test',
			swarm: 'test',
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
							description: 'Task 1',
							depends: [],
							files_touched: [],
						},
					],
				},
			],
		};
		await savePlan(tempDir, plan);
		const mode = await detectArchitectMode(tempDir);
		expect(mode).toBe('PLAN');
	});

	it('returns DISCOVER for invalid plan data', async () => {
		// Write invalid plan.json
		const { writeFile, mkdir } = await import('node:fs/promises');
		await mkdir(join(tempDir, '.swarm'), { recursive: true });
		await writeFile(join(tempDir, '.swarm', 'plan.json'), '{ invalid json }');

		const mode = await detectArchitectMode(tempDir);
		// Invalid JSON means plan can't be loaded → DISCOVER
		expect(mode).toBe('DISCOVER');
	});
});

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import * as fsSync from 'node:fs';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PlanSyncWorker } from '../../../src/background/plan-sync-worker';
import type { Plan } from '../../../src/config/plan-schema';
import {
	closePlanTerminalState,
	rebuildPlan,
	savePlan,
} from '../../../src/plan/manager';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function createTestPlan(overrides?: Partial<Plan>): Plan {
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
				tasks: [
					{
						id: '1.1',
						phase: 1,
						status: 'pending',
						size: 'small',
						description: 'Task one',
						depends: [],
						files_touched: [],
					},
					{
						id: '1.2',
						phase: 1,
						status: 'pending',
						size: 'medium',
						description: 'Task two',
						depends: [],
						files_touched: [],
					},
				],
			},
			{
				id: 2,
				name: 'Phase 2',
				status: 'pending',
				tasks: [
					{
						id: '2.1',
						phase: 2,
						status: 'pending',
						size: 'small',
						description: 'Task three',
						depends: [],
						files_touched: [],
					},
				],
			},
		],
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('write-marker in_progress flag', () => {
	describe('checkForUnauthorizedWrite skip behavior', () => {
		// Track log calls for testing
		const logCalls: Array<{ message: string; data?: unknown }> = [];

		// Helper to create temp directory structure
		function setupTempDir(): {
			tempDir: string;
			swarmDir: string;
			planJsonPath: string;
			markerPath: string;
		} {
			const tempDir = join(
				tmpdir(),
				`.test-inprogress-skip-${Date.now()}-${Math.random().toString(36).slice(2)}`,
			);
			const swarmDir = join(tempDir, '.swarm');
			const planJsonPath = join(swarmDir, 'plan.json');
			const markerPath = join(swarmDir, '.plan-write-marker');

			mkdirSync(swarmDir, { recursive: true });
			writeFileSync(join(tempDir, '.gitkeep'), '');
			writeFileSync(join(swarmDir, '.gitkeep'), '');

			return { tempDir, swarmDir, planJsonPath, markerPath };
		}

		function cleanupTempDir(tempDir: string): void {
			try {
				rmSync(tempDir, { recursive: true, force: true });
			} catch {
				// Ignore cleanup errors
			}
		}

		// Helper to create plan.json with current mtime
		function createPlanJson(planJsonPath: string): void {
			writeFileSync(
				planJsonPath,
				JSON.stringify({
					schema_version: '1.0.0',
					title: 'Test Plan',
					swarm: 'test-swarm',
					current_phase: 1,
					phases: [],
					migration_status: 'none',
				}),
			);
		}

		let tempDir: string;
		let swarmDir: string;
		let planJsonPath: string;
		let markerPath: string;

		beforeEach(() => {
			// Mock the utils module for log tracking
			mock.module('../../../src/utils', () => ({
				log: (message: string, data?: unknown) => {
					logCalls.push({ message, data });
				},
				warn: (message: string, data?: unknown) => {
					logCalls.push({ message, data });
				},
				error: () => {},
			}));

			const dirs = setupTempDir();
			tempDir = dirs.tempDir;
			swarmDir = dirs.swarmDir;
			planJsonPath = dirs.planJsonPath;
			markerPath = dirs.markerPath;
			logCalls.length = 0;
		});

		afterEach(() => {
			mock.restore();
			cleanupTempDir(tempDir);
		});

		test('1. checkForUnauthorizedWrite SKIPS mtime check when marker has in_progress: true', () => {
			// Create plan.json with current mtime
			createPlanJson(planJsonPath);

			// Create marker with in_progress: true AND a timestamp OLDER than plan.json
			// This would normally trigger a warning, but in_progress: true should skip it
			const planStats = fsSync.statSync(planJsonPath);
			const oldTimestamp = new Date(planStats.mtimeMs - 10000); // 10 seconds older

			writeFileSync(
				markerPath,
				JSON.stringify({
					source: 'plan_manager',
					timestamp: oldTimestamp.toISOString(),
					phases_count: 1,
					tasks_count: 1,
					in_progress: true, // This should cause skip
				}),
			);

			// Call checkForUnauthorizedWrite
			const worker = new PlanSyncWorker({ directory: tempDir });
			(worker as any).checkForUnauthorizedWrite();

			// Should NOT log any warning because in_progress: true skips the check
			const warningCalls = logCalls.filter((call) =>
				call.message.includes('WARNING'),
			);
			expect(warningCalls.length).toBe(0);

			// Should log the skip message instead
			const skipCalls = logCalls.filter((call) =>
				call.message.includes('Skipping unauthorized-write check'),
			);
			expect(skipCalls.length).toBe(1);

			worker.dispose();
		});

		test('2. checkForUnauthorizedWrite proceeds with mtime check when marker has in_progress: false', () => {
			// Create plan.json with current mtime
			createPlanJson(planJsonPath);

			// Create marker with in_progress: false AND a timestamp OLDER than plan.json
			// This SHOULD trigger a warning because in_progress: false means normal check
			const planStats = fsSync.statSync(planJsonPath);
			const oldTimestamp = new Date(planStats.mtimeMs - 10000); // 10 seconds older

			writeFileSync(
				markerPath,
				JSON.stringify({
					source: 'plan_manager',
					timestamp: oldTimestamp.toISOString(),
					phases_count: 1,
					tasks_count: 1,
					in_progress: false, // This should NOT skip the check
				}),
			);

			// Call checkForUnauthorizedWrite
			const worker = new PlanSyncWorker({ directory: tempDir });
			(worker as any).checkForUnauthorizedWrite();

			// Should log a warning because in_progress: false and plan is older than marker
			const warningCalls = logCalls.filter((call) =>
				call.message.includes('WARNING'),
			);
			expect(warningCalls.length).toBe(1);
			expect(warningCalls[0].message).toContain(
				'unauthorized direct write suspected',
			);

			worker.dispose();
		});

		test('3. checkForUnauthorizedWrite proceeds with mtime check when marker has NO in_progress field', () => {
			// Create plan.json with current mtime
			createPlanJson(planJsonPath);

			// Create marker with NO in_progress field AND a timestamp OLDER than plan.json
			// This SHOULD trigger a warning because missing in_progress means normal check
			const planStats = fsSync.statSync(planJsonPath);
			const oldTimestamp = new Date(planStats.mtimeMs - 10000); // 10 seconds older

			writeFileSync(
				markerPath,
				JSON.stringify({
					source: 'plan_manager',
					timestamp: oldTimestamp.toISOString(),
					phases_count: 1,
					tasks_count: 1,
					// No in_progress field
				}),
			);

			// Call checkForUnauthorizedWrite
			const worker = new PlanSyncWorker({ directory: tempDir });
			(worker as any).checkForUnauthorizedWrite();

			// Should log a warning because no in_progress field means normal check proceeds
			const warningCalls = logCalls.filter((call) =>
				call.message.includes('WARNING'),
			);
			expect(warningCalls.length).toBe(1);
			expect(warningCalls[0].message).toContain(
				'unauthorized direct write suspected',
			);

			worker.dispose();
		});

		test('4. checkForUnauthorizedWrite proceeds with mtime check when marker has in_progress: null', () => {
			// Create plan.json with current mtime
			createPlanJson(planJsonPath);

			// Create marker with in_progress: null (not strictly true)
			const planStats = fsSync.statSync(planJsonPath);
			const oldTimestamp = new Date(planStats.mtimeMs - 10000);

			writeFileSync(
				markerPath,
				JSON.stringify({
					source: 'plan_manager',
					timestamp: oldTimestamp.toISOString(),
					phases_count: 1,
					tasks_count: 1,
					in_progress: null, // null is not === true
				}),
			);

			// Call checkForUnauthorizedWrite
			const worker = new PlanSyncWorker({ directory: tempDir });
			(worker as any).checkForUnauthorizedWrite();

			// Should log a warning because in_progress: null is not strictly === true
			const warningCalls = logCalls.filter((call) =>
				call.message.includes('WARNING'),
			);
			expect(warningCalls.length).toBe(1);
			expect(warningCalls[0].message).toContain(
				'unauthorized direct write suspected',
			);

			worker.dispose();
		});
	});
});

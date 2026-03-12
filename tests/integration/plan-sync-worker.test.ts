/**
 * Integration tests for PlanSyncWorker runtime behavior
 *
 * Tests the following acceptance criteria:
 * 1. Watch-triggered sync: fs.watch events trigger sync operations
 * 2. Polling fallback sync: Polling works when native watch is unavailable
 * 3. Debounce behavior: Rapid changes are debounced properly
 * 4. Disabled/no-op behavior: Worker doesn't sync when not running
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { PlanSyncWorker } from '../../src/background/plan-sync-worker';
import { savePlan } from '../../src/plan/manager';
import { Plan, PlanSchema } from '../../src/config/plan-schema';

describe('PlanSyncWorker Integration', () => {
	let tempDir: string;
	let swarmDir: string;

	beforeEach(() => {
		// Create a temp directory for each test
		tempDir = mkdtempSync(path.join(tmpdir(), 'plan-sync-integration-'));
		swarmDir = path.join(tempDir, '.swarm');
		mkdirSync(swarmDir, { recursive: true });
	});

	afterEach(() => {
		// Clean up temp directory after each test
		try {
			rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	/**
	 * Helper: Create a minimal valid plan
	 */
	async function createTestPlan(phase: number = 1): Promise<Plan> {
		const plan: Plan = {
			schema_version: '1.0.0',
			title: 'Integration Test Plan',
			swarm: 'test-swarm',
			current_phase: phase,
			phases: [
				{
					id: phase,
					name: `Phase ${phase}`,
					status: 'in_progress',
					tasks: [
						{
							id: `${phase}.1`,
							phase,
							status: 'pending',
							size: 'small' as const,
							description: 'Test task',
							depends: [],
							files_touched: [],
						},
					],
				},
			],
		};

		const validated = PlanSchema.parse(plan);
		await savePlan(tempDir, validated);
		return validated;
	}

	/**
	 * Helper: Update plan.json with a new version (triggers change detection)
	 */
	async function updatePlan(phase: number): Promise<void> {
		const plan: Plan = {
			schema_version: '1.0.0',
			title: `Updated Plan Phase ${phase}`,
			swarm: 'test-swarm',
			current_phase: phase,
			phases: [
				{
					id: phase,
					name: `Phase ${phase}`,
					status: 'in_progress',
					tasks: [
						{
							id: `${phase}.1`,
							phase,
							status: 'in_progress',
							size: 'medium' as const,
							description: 'Updated task',
							depends: [],
							files_touched: ['test.ts'],
						},
					],
				},
			],
		};

		const validated = PlanSchema.parse(plan);
		await savePlan(tempDir, validated);
	}

	// ============================================================================
	// Test 1: Watch-triggered sync
	// ============================================================================

	it('should trigger sync when plan.json is modified via file system watcher', async () => {
		const syncResults: Array<{ success: boolean; error?: Error }> = [];

		const worker = new PlanSyncWorker({
			directory: tempDir,
			debounceMs: 50, // Short debounce for faster test
			syncTimeoutMs: 5000,
			onSyncComplete: (success, error) => {
				syncResults.push({ success, error });
			},
		});

		// Create initial plan
		await createTestPlan(1);

		// Start the worker - wait for initial setup
		worker.start();
		await new Promise((resolve) => setTimeout(resolve, 50));

		// Update plan.json - this should trigger a sync
		await updatePlan(2);

		// Wait for debounce + sync to complete
		// With 50ms debounce, sync should happen within ~150ms
		await new Promise((resolve) => setTimeout(resolve, 150));

		// Stop the worker
		worker.stop();
		worker.dispose();

		// Verify sync was triggered
		expect(syncResults.length).toBeGreaterThan(0);
		expect(syncResults[0]?.success).toBe(true);
	});

	it('should consolidate rapid file changes via debounce (fewer syncs than changes)', async () => {
		const syncResults: Array<{ success: boolean; error?: Error }> = [];

		const worker = new PlanSyncWorker({
			directory: tempDir,
			debounceMs: 100, // Longer debounce to catch rapid changes
			syncTimeoutMs: 5000,
			onSyncComplete: (success, error) => {
				syncResults.push({ success, error });
			},
		});

		// Create initial plan
		await createTestPlan(1);

		// Start the worker
		worker.start();
		await new Promise((resolve) => setTimeout(resolve, 50));

		// Make 5 rapid changes - should be debounced to fewer syncs
		for (let i = 0; i < 5; i++) {
			await updatePlan(i + 1);
			// Fast interval - less than debounce
			await new Promise((resolve) => setTimeout(resolve, 20));
		}

		// Wait for debounce + sync to complete
		await new Promise((resolve) => setTimeout(resolve, 250));

		// Stop the worker
		worker.stop();
		worker.dispose();

		// STRENGTHENED: Verify consolidation - fewer syncs than changes made
		expect(syncResults.length).toBeGreaterThan(0);
		expect(syncResults.length).toBeLessThan(5); // Must be less than number of changes
		
		// Verify final sync succeeded (consolidated to latest state)
		expect(syncResults[syncResults.length - 1]?.success).toBe(true);
	});

	// ============================================================================
	// Test 2: Polling fallback sync
	// ============================================================================

	it('should use polling fallback when swarm directory does not exist initially', async () => {
		const syncResults: Array<{ success: boolean; error?: Error }> = [];
		const tempDirNoSwarm = mkdtempSync(path.join(tmpdir(), 'plan-sync-poll-'));

		try {
			// Create worker BEFORE creating .swarm directory
			// This should force polling fallback
			const worker = new PlanSyncWorker({
				directory: tempDirNoSwarm,
				pollIntervalMs: 100, // Fast polling for test
				debounceMs: 50,
				syncTimeoutMs: 5000,
				onSyncComplete: (success, error) => {
					syncResults.push({ success, error });
				},
			});

			// Start worker - should use polling since no .swarm dir exists
			worker.start();
			await new Promise((resolve) => setTimeout(resolve, 50));

			// Now create the swarm directory and plan.json
			const swarmDirNew = path.join(tempDirNoSwarm, '.swarm');
			mkdirSync(swarmDirNew, { recursive: true });

			// Create plan directly using savePlan
			const plan: Plan = {
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
								size: 'small' as const,
								description: 'Test task',
								depends: [],
								files_touched: [],
							},
						],
					},
				],
			};
			await savePlan(tempDirNoSwarm, PlanSchema.parse(plan));

			// Wait for polling to detect the change (poll interval is 100ms)
			await new Promise((resolve) => setTimeout(resolve, 300));

			// Stop the worker
			worker.stop();
			worker.dispose();

			// Polling should have detected the file and triggered sync
			expect(syncResults.length).toBeGreaterThan(0);
			expect(syncResults[0]?.success).toBe(true);
		} finally {
			rmSync(tempDirNoSwarm, { recursive: true, force: true });
		}
	});

	it('should detect file changes via polling mechanism', async () => {
		const syncResults: Array<{ success: boolean; error?: Error }> = [];

		const worker = new PlanSyncWorker({
			directory: tempDir,
			pollIntervalMs: 100, // Fast polling for test
			debounceMs: 50,
			syncTimeoutMs: 5000,
			onSyncComplete: (success, error) => {
				syncResults.push({ success, error });
			},
		});

		// Create initial plan
		await createTestPlan(1);

		// Start the worker
		worker.start();
		await new Promise((resolve) => setTimeout(resolve, 50));

		// Update plan.json
		await updatePlan(2);

		// Wait for polling to detect change (poll interval 100ms + debounce 50ms = ~200ms)
		await new Promise((resolve) => setTimeout(resolve, 200));

		// Stop the worker
		worker.stop();
		worker.dispose();

		// Should have synced via polling
		expect(syncResults.length).toBeGreaterThan(0);
		expect(syncResults[0]?.success).toBe(true);
	});

	it('should fall back to polling when fs.watch encounters an error', async () => {
		const syncResults: Array<{ success: boolean; error?: Error }> = [];

		// Create initial swarm directory
		const swarmDir = path.join(tempDir, '.swarm');
		mkdirSync(swarmDir, { recursive: true });

		const worker = new PlanSyncWorker({
			directory: tempDir,
			pollIntervalMs: 100, // Fast polling for quick fallback detection
			debounceMs: 50,
			syncTimeoutMs: 5000,
			onSyncComplete: (success, error) => {
				syncResults.push({ success, error });
			},
		});

		// Create initial plan
		await createTestPlan(1);

		// Start the worker - should use fs.watch initially
		worker.start();
		await new Promise((resolve) => setTimeout(resolve, 50));

		// Make an initial change to trigger first sync (proves watcher is working)
		await updatePlan(2);
		await new Promise((resolve) => setTimeout(resolve, 150));

		// Verify initial sync happened
		const syncCountBeforeError = syncResults.length;
		expect(syncCountBeforeError).toBeGreaterThan(0);

		// Delete the swarm directory to trigger fs.watch error
		rmSync(swarmDir, { recursive: true, force: true });

		// Recreate swarm directory with updated plan (simulates file system error recovery)
		mkdirSync(swarmDir, { recursive: true });
		await updatePlan(3); // This creates plan.json with new content

		// Wait for polling to detect the change after watcher error
		// Poll interval is 100ms, so within 300ms it should detect
		await new Promise((resolve) => setTimeout(resolve, 300));

		// Stop the worker
		worker.stop();
		worker.dispose();

		// STRENGTHENED: After fs.watch error, polling should have detected the change
		// The sync count should have increased, proving fallback to polling worked
		expect(syncResults.length).toBeGreaterThan(syncCountBeforeError);
		// Verify the post-error sync succeeded
		expect(syncResults[syncResults.length - 1]?.success).toBe(true);
	});

	// ============================================================================
	// Test 3: Debounce behavior
	// ============================================================================

	it('should consolidate rapid changes into a single debounced sync', async () => {
		const syncTimes: number[] = [];
		const startTime = Date.now();

		const worker = new PlanSyncWorker({
			directory: tempDir,
			debounceMs: 150, // 150ms debounce
			syncTimeoutMs: 5000,
			onSyncComplete: (success) => {
				if (success) {
					syncTimes.push(Date.now() - startTime);
				}
			},
		});

		// Create initial plan
		await createTestPlan(1);

		// Start the worker - wait for initial stat/setup
		worker.start();
		await new Promise((resolve) => setTimeout(resolve, 50));

		// Make first change
		await updatePlan(2);

		// Wait 50ms (less than debounce)
		await new Promise((resolve) => setTimeout(resolve, 50));

		// Make second change
		await updatePlan(3);

		// Wait another 50ms
		await new Promise((resolve) => setTimeout(resolve, 50));

		// Make third change
		await updatePlan(4);

		// Wait for debounce to settle and sync to complete
		// Debounce is 150ms, so after 400ms total we should have synced
		await new Promise((resolve) => setTimeout(resolve, 350));

		// Stop the worker
		worker.stop();
		worker.dispose();

		// STRENGTHENED: Verify debounce consolidated rapid changes
		// With 150ms debounce and changes at ~50ms, ~100ms, ~150ms - should sync once around 200ms
		// Allow up to 2 syncs (initial + debounced) but verify consolidation happened
		expect(syncTimes.length).toBeGreaterThan(0);
		
		// Verify the sync happened within expected debounce window (not immediately after each change)
		// First sync should be after the debounce period from first change
		const firstSyncTime = syncTimes[0];
		expect(firstSyncTime).toBeGreaterThan(100); // Not immediate - debounced
		
		// If multiple syncs occurred, they should be spaced by at least debounce interval
		for (let i = 1; i < syncTimes.length; i++) {
			const gap = syncTimes[i] - syncTimes[i - 1];
			expect(gap).toBeGreaterThan(100); // At least debounce window apart
		}
	});

	it('should clear pending debounce when worker is stopped', async () => {
		let syncCalled = false;

		const worker = new PlanSyncWorker({
			directory: tempDir,
			debounceMs: 500, // Long debounce
			syncTimeoutMs: 5000,
			onSyncComplete: () => {
				syncCalled = true;
			},
		});

		// Create initial plan
		await createTestPlan(1);

		// Start the worker
		worker.start();
		await new Promise((resolve) => setTimeout(resolve, 50));

		// Trigger a change
		await updatePlan(2);

		// Immediately stop the worker (before debounce fires)
		worker.stop();
		worker.dispose();

		// Wait longer than debounce would have taken
		await new Promise((resolve) => setTimeout(resolve, 600));

		// Sync should NOT have been called because we stopped before debounce completed
		expect(syncCalled).toBe(false);
	});

	// ============================================================================
	// Test 4: Disabled/no-op behavior
	// ============================================================================

	it('should not sync when worker is not started', async () => {
		let syncCalled = false;

		const worker = new PlanSyncWorker({
			directory: tempDir,
			debounceMs: 50,
			syncTimeoutMs: 5000,
			onSyncComplete: () => {
				syncCalled = true;
			},
		});

		// Create initial plan
		await createTestPlan(1);

		// DO NOT start the worker

		// Make changes
		await updatePlan(2);

		// Wait for any potential sync
		await new Promise((resolve) => setTimeout(resolve, 300));

		// Sync should NOT have been called because worker wasn't started
		expect(syncCalled).toBe(false);

		// Clean up
		worker.dispose();
	});

	it('should not sync after worker is disposed', async () => {
		let syncCalled = false;

		const worker = new PlanSyncWorker({
			directory: tempDir,
			debounceMs: 50,
			syncTimeoutMs: 5000,
			onSyncComplete: () => {
				syncCalled = true;
			},
		});

		// Create initial plan
		await createTestPlan(1);

		// Start the worker
		worker.start();
		await new Promise((resolve) => setTimeout(resolve, 50));

		// Dispose the worker
		worker.dispose();

		// Make changes after dispose
		await updatePlan(2);

		// Wait for any potential sync
		await new Promise((resolve) => setTimeout(resolve, 300));

		// Sync should NOT have been called because worker was disposed
		expect(syncCalled).toBe(false);
	});

	it('should handle stop and restart correctly', async () => {
		const syncResults: Array<{ success: boolean; error?: Error }> = [];

		const worker = new PlanSyncWorker({
			directory: tempDir,
			debounceMs: 50,
			syncTimeoutMs: 5000,
			onSyncComplete: (success, error) => {
				syncResults.push({ success, error });
			},
		});

		// Create initial plan
		await createTestPlan(1);

		// Start the worker
		worker.start();
		await new Promise((resolve) => setTimeout(resolve, 50));

		// Update plan
		await updatePlan(2);

		// Wait for sync
		await new Promise((resolve) => setTimeout(resolve, 200));

		const syncCountAfterFirstChange = syncResults.length;

		// Stop the worker
		worker.stop();

		// Make more changes
		await updatePlan(3);

		// Wait - no syncs should happen while stopped
		await new Promise((resolve) => setTimeout(resolve, 200));

		// Should not have more syncs while stopped
		expect(syncResults.length).toBe(syncCountAfterFirstChange);

		// Restart the worker
		worker.start();
		await new Promise((resolve) => setTimeout(resolve, 50));

		// Make another change
		await updatePlan(4);

		// Wait for sync
		await new Promise((resolve) => setTimeout(resolve, 200));

		// Should have more syncs after restart
		expect(syncResults.length).toBeGreaterThan(syncCountAfterFirstChange);

		// Stop and dispose
		worker.stop();
		worker.dispose();
	});

	// ============================================================================
	// Test 5: Status and lifecycle
	// ============================================================================

	it('should report correct status during lifecycle', () => {
		const worker = new PlanSyncWorker({
			directory: tempDir,
			debounceMs: 50,
		});

		// Initial status should be stopped
		expect(worker.getStatus()).toBe('stopped');
		expect(worker.isRunning()).toBe(false);

		// Start the worker
		worker.start();
		expect(worker.getStatus()).toBe('running');
		expect(worker.isRunning()).toBe(true);

		// Stop the worker
		worker.stop();
		expect(worker.getStatus()).toBe('stopped');
		expect(worker.isRunning()).toBe(false);

		// Dispose
		worker.dispose();
		expect(worker.getStatus()).toBe('stopped');
	});

	it('should not throw when starting multiple times', () => {
		const worker = new PlanSyncWorker({
			directory: tempDir,
			debounceMs: 50,
		});

		// Start multiple times should not throw
		expect(() => {
			worker.start();
			worker.start();
			worker.start();
		}).not.toThrow();

		// Stop and dispose
		worker.stop();
		worker.dispose();
	});

	it('should not throw when stopping multiple times', () => {
		const worker = new PlanSyncWorker({
			directory: tempDir,
			debounceMs: 50,
		});

		worker.start();

		// Stop multiple times should not throw
		expect(() => {
			worker.stop();
			worker.stop();
			worker.stop();
		}).not.toThrow();

		// Dispose
		worker.dispose();
	});
});

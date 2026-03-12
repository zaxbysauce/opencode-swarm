/**
 * ADVERSARIAL INTEGRATION TESTS for Task 3.5
 *
 * Attack vectors tested (INTEGRATION - real file system, no mocks):
 * 1. FS EVENT STORMS - rapid file system events that could overwhelm the watcher
 * 2. MALFORMED PLAN WRITES - corrupted JSON, invalid schemas, binary data injection
 * 3. POLLING FALLBACK ABUSE - forcing polling mode and attempting to exploit timing
 * 4. DEBOUNCE BYPASS ATTEMPTS - trying to bypass debounce logic through edge cases
 *
 * These tests verify the worker remains stable under adversarial conditions.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { PlanSyncWorker } from '../../src/background/plan-sync-worker';
import { Plan, PlanSchema } from '../../src/config/plan-schema';

describe('ADVERSARIAL INTEGRATION: Plan Sync Worker Attack Vectors', () => {
	let tempDir: string;
	let swarmDir: string;
	let planJsonPath: string;
	let planMdPath: string;

	/**
	 * Helper: Create a minimal valid plan for setup
	 */
	function createValidPlan(): Plan {
		return PlanSchema.parse({
			schema_version: '1.0.0',
			title: 'Attack Test Plan',
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
							description: 'Test task',
							depends: [],
							files_touched: [],
						},
					],
				},
			],
		});
	}

	/**
	 * Helper: Write raw content to plan.json (for malformed data tests)
	 */
	function writeRawPlanJson(content: string | Buffer): void {
		writeFileSync(planJsonPath, content);
	}

	/**
	 * Helper: Wait for specified ms
	 */
	function wait(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	beforeEach(() => {
		// Create a fresh temp directory for each test
		tempDir = mkdtempSync(path.join(tmpdir(), 'plan-sync-adversarial-'));
		swarmDir = path.join(tempDir, '.swarm');
		mkdirSync(swarmDir, { recursive: true });
		planJsonPath = path.join(swarmDir, 'plan.json');
		planMdPath = path.join(swarmDir, 'plan.md');
	});

	afterEach(() => {
		// Clean up temp directory after each test
		try {
			rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	// ============================================================================
	// ATTACK VECTOR 1: FS EVENT STORMS
	// ============================================================================

	describe('ATTACK: FS Event Storms', () => {
		it('should survive 100 rapid file writes without crash (event storm)', async () => {
			const syncResults: Array<{ success: boolean }> = [];

			// Write initial valid plan
			writeRawPlanJson(JSON.stringify(createValidPlan(), null, 2));

			const worker = new PlanSyncWorker({
				directory: tempDir,
				debounceMs: 10, // Very short debounce to increase stress
				pollIntervalMs: 50,
				syncTimeoutMs: 5000,
				onSyncComplete: (success) => {
					syncResults.push({ success });
				},
			});

			worker.start();
			await wait(30);

			// ATTACK: Write 100 times in rapid succession (event storm)
			const writePromises: Promise<void>[] = [];
			for (let i = 0; i < 100; i++) {
				writePromises.push(
					(async () => {
						writeRawPlanJson(JSON.stringify({ attack: `storm-${i}` }));
					})()
				);
			}
			await Promise.all(writePromises);

			// Wait for debounce and any pending syncs
			await wait(500);

			// SAFEGUARD: Worker must still be running
			expect(worker.getStatus()).toBe('running');
			worker.stop();
			worker.dispose();

			// Should have processed at least one sync (debounced)
			expect(syncResults.length).toBeGreaterThan(0);
		});

		it('should survive create-delete-create cycles (file thrashing)', async () => {
			const syncResults: Array<{ success: boolean }> = [];

			// Write initial valid plan
			writeRawPlanJson(JSON.stringify(createValidPlan(), null, 2));

			const worker = new PlanSyncWorker({
				directory: tempDir,
				debounceMs: 20,
				pollIntervalMs: 50,
				syncTimeoutMs: 5000,
				onSyncComplete: (success) => {
					syncResults.push({ success });
				},
			});

			worker.start();
			await wait(30);

			// ATTACK: Create-delete-create cycles
			for (let i = 0; i < 20; i++) {
				try {
					unlinkSync(planJsonPath);
				} catch {
					// File may not exist
				}
				writeRawPlanJson(JSON.stringify({ attack: `thrash-${i}` }));
			}

			await wait(300);

			// SAFEGUARD: Worker must still be running
			expect(worker.getStatus()).toBe('running');
			worker.stop();
			worker.dispose();
		});

		it('should handle concurrent writes to both plan.json and plan.md', async () => {
			const syncResults: Array<{ success: boolean }> = [];

			// Write initial valid plan
			writeRawPlanJson(JSON.stringify(createValidPlan(), null, 2));

			const worker = new PlanSyncWorker({
				directory: tempDir,
				debounceMs: 20,
				pollIntervalMs: 50,
				syncTimeoutMs: 5000,
				onSyncComplete: (success) => {
					syncResults.push({ success });
				},
			});

			worker.start();
			await wait(30);

			// ATTACK: Write to both files concurrently
			const concurrentWrites = [];
			for (let i = 0; i < 10; i++) {
				concurrentWrites.push(
					(async () => {
						writeRawPlanJson(JSON.stringify({ attack: `json-${i}` }));
						await Bun.write(planMdPath, `# Attack ${i}\n`);
					})()
				);
			}
			await Promise.all(concurrentWrites);

			await wait(300);

			// SAFEGUARD: Worker must survive
			expect(worker.getStatus()).toBe('running');
			worker.stop();
			worker.dispose();
		});

		it('should handle writes faster than debounce interval', async () => {
			const syncCount = { value: 0 };

			writeRawPlanJson(JSON.stringify(createValidPlan(), null, 2));

			const worker = new PlanSyncWorker({
				directory: tempDir,
				debounceMs: 100, // 100ms debounce
				pollIntervalMs: 50,
				syncTimeoutMs: 5000,
				onSyncComplete: (success) => {
					if (success) syncCount.value++;
				},
			});

			worker.start();
			await wait(30);

			// ATTACK: Write 50 times with 5ms intervals (faster than debounce)
			for (let i = 0; i < 50; i++) {
				writeRawPlanJson(JSON.stringify({ attack: `fast-${i}` }));
				await wait(5); // 5ms < 100ms debounce
			}

			await wait(300);

			// SAFEGUARD: Sync count should be bounded (debounce working)
			expect(syncCount.value).toBeLessThan(20); // At most ~3 syncs per 100ms window
			expect(worker.getStatus()).toBe('running');
			worker.stop();
			worker.dispose();
		});
	});

	// ============================================================================
	// ATTACK VECTOR 2: MALFORMED PLAN WRITES
	// ============================================================================

	describe('ATTACK: Malformed Plan Writes', () => {
		it('should survive completely invalid JSON (syntax error)', async () => {
			const syncResults: Array<{ success: boolean; error?: Error }> = [];

			writeRawPlanJson(JSON.stringify(createValidPlan(), null, 2));

			const worker = new PlanSyncWorker({
				directory: tempDir,
				debounceMs: 20,
				syncTimeoutMs: 5000,
				onSyncComplete: (success, error) => {
					syncResults.push({ success, error });
				},
			});

			worker.start();
			await wait(30);

			// ATTACK: Write completely invalid JSON
			writeRawPlanJson('{ this is not valid json at all }}}');

			await wait(300);

			// SAFEGUARD: Worker must survive invalid JSON
			expect(worker.getStatus()).toBe('running');

			// Some sync should have been attempted (and failed gracefully)
			expect(syncResults.length).toBeGreaterThan(0);

			worker.stop();
			worker.dispose();
		});

		it('should survive empty file write', async () => {
			const syncResults: Array<{ success: boolean }> = [];

			writeRawPlanJson(JSON.stringify(createValidPlan(), null, 2));

			const worker = new PlanSyncWorker({
				directory: tempDir,
				debounceMs: 20,
				syncTimeoutMs: 5000,
				onSyncComplete: (success) => {
					syncResults.push({ success });
				},
			});

			worker.start();
			await wait(30);

			// ATTACK: Write empty file
			writeRawPlanJson('');

			await wait(300);

			// SAFEGUARD: Worker must survive empty file
			expect(worker.getStatus()).toBe('running');
			worker.stop();
			worker.dispose();
		});

		it('should survive null content', async () => {
			const syncResults: Array<{ success: boolean }> = [];

			writeRawPlanJson(JSON.stringify(createValidPlan(), null, 2));

			const worker = new PlanSyncWorker({
				directory: tempDir,
				debounceMs: 20,
				syncTimeoutMs: 5000,
				onSyncComplete: (success) => {
					syncResults.push({ success });
				},
			});

			worker.start();
			await wait(30);

			// ATTACK: Write JSON null
			writeRawPlanJson('null');

			await wait(300);

			expect(worker.getStatus()).toBe('running');
			worker.stop();
			worker.dispose();
		});

		it('should survive schema-invalid plan (missing required fields)', async () => {
			const syncResults: Array<{ success: boolean }> = [];

			writeRawPlanJson(JSON.stringify(createValidPlan(), null, 2));

			const worker = new PlanSyncWorker({
				directory: tempDir,
				debounceMs: 20,
				syncTimeoutMs: 5000,
				onSyncComplete: (success) => {
					syncResults.push({ success });
				},
			});

			worker.start();
			await wait(30);

			// ATTACK: Write plan missing required fields
			writeRawPlanJson(
				JSON.stringify({
					title: 'Missing required fields',
					// Missing schema_version, swarm, current_phase, phases
				})
			);

			await wait(300);

			expect(worker.getStatus()).toBe('running');
			worker.stop();
			worker.dispose();
		});

		it('should survive binary data injection', async () => {
			const syncResults: Array<{ success: boolean }> = [];

			writeRawPlanJson(JSON.stringify(createValidPlan(), null, 2));

			const worker = new PlanSyncWorker({
				directory: tempDir,
				debounceMs: 20,
				syncTimeoutMs: 5000,
				onSyncComplete: (success) => {
					syncResults.push({ success });
				},
			});

			worker.start();
			await wait(30);

			// ATTACK: Write binary data (null bytes, non-UTF8)
			const binaryData = Buffer.from([
				0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd, 0x7b, 0x22, 0x74, 0x65, 0x73, 0x74, 0x22,
			]);
			writeRawPlanJson(binaryData);

			await wait(300);

			expect(worker.getStatus()).toBe('running');
			worker.stop();
			worker.dispose();
		});

		it('should survive prototype pollution attempt in plan', async () => {
			const syncResults: Array<{ success: boolean }> = [];

			writeRawPlanJson(JSON.stringify(createValidPlan(), null, 2));

			const worker = new PlanSyncWorker({
				directory: tempDir,
				debounceMs: 20,
				syncTimeoutMs: 5000,
				onSyncComplete: (success) => {
					syncResults.push({ success });
				},
			});

			worker.start();
			await wait(30);

			// ATTACK: Attempt prototype pollution
			writeRawPlanJson(
				JSON.stringify({
					schema_version: '1.0.0',
					title: 'Prototype Pollution Attack',
					swarm: 'test',
					current_phase: 1,
					phases: [{ id: 1, name: 'P1', status: 'pending', tasks: [] }],
					__proto__: { polluted: true },
					constructor: { prototype: { polluted: true } },
				})
			);

			await wait(300);

			// SAFEGUARD: Worker survives, prototype not polluted
			expect(worker.getStatus()).toBe('running');
			expect({}.constructor.prototype.hasOwnProperty('polluted')).toBe(false);
			worker.stop();
			worker.dispose();
		});

		it('should survive deeply nested malformed structures', async () => {
			const syncResults: Array<{ success: boolean }> = [];

			writeRawPlanJson(JSON.stringify(createValidPlan(), null, 2));

			const worker = new PlanSyncWorker({
				directory: tempDir,
				debounceMs: 20,
				syncTimeoutMs: 5000,
				onSyncComplete: (success) => {
					syncResults.push({ success });
				},
			});

			worker.start();
			await wait(30);

			// ATTACK: Deeply nested structure that could cause stack overflow
			let deep: Record<string, unknown> = { value: 'deep' };
			for (let i = 0; i < 100; i++) {
				deep = { nested: deep };
			}
			writeRawPlanJson(JSON.stringify({ attack: deep }));

			await wait(300);

			expect(worker.getStatus()).toBe('running');
			worker.stop();
			worker.dispose();
		});

		it('should survive extremely long string values', async () => {
			const syncResults: Array<{ success: boolean }> = [];

			writeRawPlanJson(JSON.stringify(createValidPlan(), null, 2));

			const worker = new PlanSyncWorker({
				directory: tempDir,
				debounceMs: 20,
				syncTimeoutMs: 5000,
				onSyncComplete: (success) => {
					syncResults.push({ success });
				},
			});

			worker.start();
			await wait(30);

			// ATTACK: Extremely long string (1MB)
			const longString = 'A'.repeat(1024 * 1024);
			writeRawPlanJson(JSON.stringify({ attack: longString }));

			await wait(300);

			expect(worker.getStatus()).toBe('running');
			worker.stop();
			worker.dispose();
		});
	});

	// ============================================================================
	// ATTACK VECTOR 3: POLLING FALLBACK ABUSE
	// ============================================================================

	describe('ATTACK: Polling Fallback Abuse', () => {
		it('should survive when forced into polling mode (no .swarm dir initially)', async () => {
			const syncResults: Array<{ success: boolean }> = [];

			// Remove .swarm directory to force polling
			rmSync(swarmDir, { recursive: true, force: true });

			const worker = new PlanSyncWorker({
				directory: tempDir,
				pollIntervalMs: 50, // Fast polling
				debounceMs: 20,
				syncTimeoutMs: 5000,
				onSyncComplete: (success) => {
					syncResults.push({ success });
				},
			});

			// Start without .swarm directory - forces polling fallback
			worker.start();
			await wait(30);

			// Recreate .swarm directory during polling
			mkdirSync(swarmDir, { recursive: true });

			// Write malformed content during polling
			writeRawPlanJson('not json');

			await wait(200);

			// SAFEGUARD: Worker survives polling fallback with malformed data
			expect(worker.getStatus()).toBe('running');
			worker.stop();
			worker.dispose();
		});

		it('should handle rapid directory create/delete during polling', async () => {
			const syncResults: Array<{ success: boolean }> = [];

			writeRawPlanJson(JSON.stringify(createValidPlan(), null, 2));

			const worker = new PlanSyncWorker({
				directory: tempDir,
				pollIntervalMs: 30, // Very fast polling
				debounceMs: 10,
				syncTimeoutMs: 5000,
				onSyncComplete: (success) => {
					syncResults.push({ success });
				},
			});

			worker.start();
			await wait(30);

			// ATTACK: Rapidly create/delete .swarm directory during polling
			for (let i = 0; i < 10; i++) {
				try {
					rmSync(swarmDir, { recursive: true, force: true });
				} catch {
					// Ignore
				}
				mkdirSync(swarmDir, { recursive: true });
				writeRawPlanJson(JSON.stringify({ attack: `poll-${i}` }));
				await wait(20);
			}

			await wait(200);

			expect(worker.getStatus()).toBe('running');
			worker.stop();
			worker.dispose();
		});

		it('should handle file stat changes during polling (size/mtime races)', async () => {
			const syncResults: Array<{ success: boolean }> = [];

			writeRawPlanJson(JSON.stringify(createValidPlan(), null, 2));

			const worker = new PlanSyncWorker({
				directory: tempDir,
				pollIntervalMs: 20,
				debounceMs: 10,
				syncTimeoutMs: 5000,
				onSyncComplete: (success) => {
					syncResults.push({ success });
				},
			});

			worker.start();
			await wait(30);

			// ATTACK: Write during poll check window
			for (let i = 0; i < 20; i++) {
				// Write exactly when poll might be checking
				writeRawPlanJson(JSON.stringify({ attack: `race-${i}`, padding: 'x'.repeat(i * 100) }));
				await wait(15); // < poll interval
			}

			await wait(300);

			expect(worker.getStatus()).toBe('running');
			worker.stop();
			worker.dispose();
		});

		it('should not accumulate memory during extended polling with no changes', async () => {
			writeRawPlanJson(JSON.stringify(createValidPlan(), null, 2));

			const worker = new PlanSyncWorker({
				directory: tempDir,
				pollIntervalMs: 20,
				debounceMs: 10,
				syncTimeoutMs: 5000,
			});

			worker.start();
			await wait(30);

			// Simulate extended polling with no changes
			// Just wait and let polling happen
			await wait(500);

			// SAFEGUARD: Worker should still be running cleanly
			expect(worker.getStatus()).toBe('running');
			worker.stop();
			worker.dispose();
		});
	});

	// ============================================================================
	// ATTACK VECTOR 4: DEBOUNCE BYPASS ATTEMPTS
	// ============================================================================

	describe('ATTACK: Debounce Bypass Attempts', () => {
		it('should not bypass debounce with zero-delay writes', async () => {
			const syncTimestamps: number[] = [];
			const startTime = Date.now();

			writeRawPlanJson(JSON.stringify(createValidPlan(), null, 2));

			const worker = new PlanSyncWorker({
				directory: tempDir,
				debounceMs: 100,
				syncTimeoutMs: 5000,
				onSyncComplete: (success) => {
					if (success) {
						syncTimestamps.push(Date.now() - startTime);
					}
				},
			});

			worker.start();
			await wait(30);

			// ATTACK: Try to bypass debounce with zero-delay writes
			for (let i = 0; i < 20; i++) {
				writeRawPlanJson(JSON.stringify({ attack: `bypass-${i}` }));
				// No await - immediate writes
			}

			await wait(500);

			// SAFEGUARD: Syncs should be debounced (not 20 separate syncs)
			expect(syncTimestamps.length).toBeLessThan(5);

			worker.stop();
			worker.dispose();
		});

		it('should not bypass debounce by writing exactly at debounce interval', async () => {
			const syncCount = { value: 0 };

			writeRawPlanJson(JSON.stringify(createValidPlan(), null, 2));

			const worker = new PlanSyncWorker({
				directory: tempDir,
				debounceMs: 50,
				syncTimeoutMs: 5000,
				onSyncComplete: (success) => {
					if (success) syncCount.value++;
				},
			});

			worker.start();
			await wait(30);

			// ATTACK: Write exactly at debounce boundary
			for (let i = 0; i < 10; i++) {
				writeRawPlanJson(JSON.stringify({ attack: `boundary-${i}` }));
				await wait(55); // Just over debounce
			}

			await wait(200);

			// Each write after debounce should trigger a sync
			// But still bounded behavior
			expect(syncCount.value).toBeGreaterThan(0);
			expect(syncCount.value).toBeLessThanOrEqual(12); // Allow some variance

			worker.stop();
			worker.dispose();
		});

		it('should handle start-stop-start cycle without losing debounce', async () => {
			const syncCount = { value: 0 };

			writeRawPlanJson(JSON.stringify(createValidPlan(), null, 2));

			const worker = new PlanSyncWorker({
				directory: tempDir,
				debounceMs: 50,
				syncTimeoutMs: 5000,
				onSyncComplete: (success) => {
					if (success) syncCount.value++;
				},
			});

			// ATTACK: Rapid start-stop cycles
			for (let i = 0; i < 5; i++) {
				worker.start();
				await wait(20);
				writeRawPlanJson(JSON.stringify({ attack: `cycle-${i}` }));
				worker.stop();
				await wait(30);
			}

			// Final start to check state
			worker.start();
			await wait(200);

			// SAFEGUARD: Worker should be in clean state
			expect(worker.getStatus()).toBe('running');
			worker.stop();
			worker.dispose();
		});

		it('should not allow pending sync accumulation (memory leak prevention)', async () => {
			writeRawPlanJson(JSON.stringify(createValidPlan(), null, 2));

			const worker = new PlanSyncWorker({
				directory: tempDir,
				debounceMs: 20,
				syncTimeoutMs: 5000,
			});

			worker.start();
			await wait(30);

			// ATTACK: Trigger many debounce resets
			for (let i = 0; i < 100; i++) {
				writeRawPlanJson(JSON.stringify({ attack: `accumulate-${i}` }));
				await wait(5); // Less than debounce
			}

			await wait(300);

			// SAFEGUARD: Worker should still be responsive
			expect(worker.getStatus()).toBe('running');

			// Try one more write to ensure debounce still works
			writeRawPlanJson(JSON.stringify(createValidPlan(), null, 2));
			await wait(100);

			expect(worker.getStatus()).toBe('running');
			worker.stop();
			worker.dispose();
		});

		it('should clear debounce timer on dispose (no zombie callbacks)', async () => {
			let syncCalled = false;

			writeRawPlanJson(JSON.stringify(createValidPlan(), null, 2));

			const worker = new PlanSyncWorker({
				directory: tempDir,
				debounceMs: 200, // Long debounce
				syncTimeoutMs: 5000,
				onSyncComplete: () => {
					syncCalled = true;
				},
			});

			worker.start();
			await wait(30);

			// Trigger debounce
			writeRawPlanJson(JSON.stringify({ attack: 'zombie-test' }));

			// Immediately dispose (before debounce fires)
			worker.dispose();

			// Wait longer than debounce would have taken
			await wait(400);

			// SAFEGUARD: No zombie callback after dispose
			expect(syncCalled).toBe(false);
		});

		it('should handle overlapping debounce with sync in-flight', async () => {
			const syncResults: Array<{ success: boolean }> = [];

			writeRawPlanJson(JSON.stringify(createValidPlan(), null, 2));

			const worker = new PlanSyncWorker({
				directory: tempDir,
				debounceMs: 20,
				syncTimeoutMs: 5000,
				onSyncComplete: (success) => {
					syncResults.push({ success });
				},
			});

			worker.start();
			await wait(30);

			// ATTACK: Trigger sync, then immediately trigger more while in-flight
			for (let burst = 0; burst < 3; burst++) {
				for (let i = 0; i < 10; i++) {
					writeRawPlanJson(JSON.stringify({ attack: `overlap-${burst}-${i}` }));
				}
				await wait(100); // Let sync complete
			}

			await wait(300);

			// SAFEGUARD: Worker handles overlapping syncs via pending mechanism
			expect(worker.getStatus()).toBe('running');
			expect(syncResults.length).toBeGreaterThan(0);

			worker.stop();
			worker.dispose();
		});
	});

	// ============================================================================
	// CROSS-VECTOR ATTACKS (Combination attacks)
	// ============================================================================

	describe('ATTACK: Cross-Vector Combinations', () => {
		it('should survive malformed writes during event storm', async () => {
			const syncResults: Array<{ success: boolean }> = [];

			writeRawPlanJson(JSON.stringify(createValidPlan(), null, 2));

			const worker = new PlanSyncWorker({
				directory: tempDir,
				debounceMs: 15,
				syncTimeoutMs: 5000,
				onSyncComplete: (success) => {
					syncResults.push({ success });
				},
			});

			worker.start();
			await wait(30);

			// ATTACK: Combine event storm with malformed data
			for (let i = 0; i < 50; i++) {
				if (i % 3 === 0) {
					// Every 3rd write is malformed
					writeRawPlanJson('not json ' + i);
				} else {
					writeRawPlanJson(JSON.stringify({ attack: `combined-${i}` }));
				}
			}

			await wait(400);

			expect(worker.getStatus()).toBe('running');
			worker.stop();
			worker.dispose();
		});

		it('should survive polling mode with debounce bypass attempts', async () => {
			// Force polling mode
			rmSync(swarmDir, { recursive: true, force: true });

			const syncResults: Array<{ success: boolean }> = [];

			const worker = new PlanSyncWorker({
				directory: tempDir,
				pollIntervalMs: 30,
				debounceMs: 50,
				syncTimeoutMs: 5000,
				onSyncComplete: (success) => {
					syncResults.push({ success });
				},
			});

			worker.start();
			await wait(30);

			// Recreate dir and attack
			mkdirSync(swarmDir, { recursive: true });

			// ATTACK: Try debounce bypass during polling
			for (let i = 0; i < 30; i++) {
				writeRawPlanJson(JSON.stringify({ attack: `poll-debounce-${i}` }));
				await wait(10); // Less than debounce
			}

			await wait(300);

			expect(worker.getStatus()).toBe('running');
			worker.stop();
			worker.dispose();
		});

		it('should survive total chaos: all attack vectors simultaneously', async () => {
			const syncResults: Array<{ success: boolean }> = [];

			writeRawPlanJson(JSON.stringify(createValidPlan(), null, 2));

			const worker = new PlanSyncWorker({
				directory: tempDir,
				debounceMs: 15,
				pollIntervalMs: 30,
				syncTimeoutMs: 5000,
				onSyncComplete: (success) => {
					syncResults.push({ success });
				},
			});

			worker.start();
			await wait(30);

			// ATTACK: Chaos - all vectors at once
			const chaos = async () => {
				for (let i = 0; i < 30; i++) {
					// Random attack type
					const attackType = i % 5;
					switch (attackType) {
						case 0: // Valid write
							writeRawPlanJson(JSON.stringify({ attack: i }));
							break;
						case 1: // Malformed
							writeRawPlanJson('malformed ' + i);
							break;
						case 2: // Delete
							try {
								unlinkSync(planJsonPath);
							} catch {}
							break;
						case 3: // Empty
							writeRawPlanJson('');
							break;
						case 4: // Binary-ish
							writeRawPlanJson(Buffer.from([0x00, 0x01, i, 0xff]));
							break;
					}
					await wait(5);
				}
			};

			await chaos();
			await wait(400);

			// ULTIMATE SAFEGUARD: Worker must survive chaos
			expect(worker.getStatus()).toBe('running');
			// Restore valid plan and verify worker still functions
			writeRawPlanJson(JSON.stringify(createValidPlan(), null, 2));
			await wait(200);

			expect(worker.getStatus()).toBe('running');
			expect(syncResults.length).toBeGreaterThan(0);

			worker.stop();
			worker.dispose();
		});
	});
});

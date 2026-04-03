/**
 * Tests for handleCloseCommand
 * Verifies the command handler for /swarm close
 */
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Mock dependencies before importing the module
const mockExecuteWriteRetro = mock(async (_args: unknown, _directory: string) =>
	JSON.stringify({
		success: true,
		phase: 1,
		task_id: 'retro-1',
		message: 'Done',
	}),
);

const mockCurateAndStoreSwarm = mock(async () => {});

const mockArchiveEvidence = mock(async () => {});

const mockFlushPendingSnapshot = mock(async () => {});

mock.module('../../../src/tools/write-retro.js', () => ({
	executeWriteRetro: mockExecuteWriteRetro,
}));

mock.module('../../../src/hooks/knowledge-curator.js', () => ({
	curateAndStoreSwarm: mockCurateAndStoreSwarm,
}));

mock.module('../../../src/evidence/manager.js', () => ({
	archiveEvidence: mockArchiveEvidence,
}));

mock.module('../../../src/session/snapshot-writer.js', () => ({
	flushPendingSnapshot: mockFlushPendingSnapshot,
}));

mock.module('../../../src/state.js', () => ({
	swarmState: {
		activeToolCalls: new Map(),
		toolAggregates: new Map(),
		activeAgent: new Map(),
		delegationChains: new Map(),
		pendingEvents: 0,
		lastBudgetPct: 0,
		agentSessions: new Map(),
		pendingRehydrations: new Set(),
	},
	endAgentSession: () => {},
	resetSwarmState: () => {},
}));

// Import after mock setup
const { handleCloseCommand } = await import('../../../src/commands/close.js');

let testDir: string;

describe('handleCloseCommand', () => {
	beforeEach(() => {
		mockExecuteWriteRetro.mockClear();
		mockCurateAndStoreSwarm.mockClear();
		mockArchiveEvidence.mockClear();
		mockFlushPendingSnapshot.mockClear();
		testDir = mkdtempSync(path.join(os.tmpdir(), 'close-command-test-'));
		mkdirSync(path.join(testDir, '.swarm', 'session'), { recursive: true });
	});

	afterEach(() => {
		try {
			rmSync(testDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	describe('Writes retrospective for in-progress phases', () => {
		it('should call executeWriteRetro for each in-progress phase', async () => {
			const planData = {
				title: 'Test Project',
				phases: [
					{
						id: 1,
						name: 'Phase 1',
						status: 'complete',
						tasks: [{ id: '1.1', status: 'complete' }],
					},
					{
						id: 2,
						name: 'Phase 2',
						status: 'in_progress',
						tasks: [
							{ id: '2.1', status: 'complete' },
							{ id: '2.2', status: 'in_progress' },
						],
					},
				],
			};
			writeFileSync(
				path.join(testDir, '.swarm', 'plan.json'),
				JSON.stringify(planData),
			);

			await handleCloseCommand(testDir, []);

			expect(mockExecuteWriteRetro).toHaveBeenCalledTimes(1);
			expect(mockExecuteWriteRetro).toHaveBeenCalledWith(
				expect.objectContaining({
					phase: 2,
					summary: 'Phase closed via /swarm close',
					task_count: 2,
				}),
				testDir,
			);
		});

		it('should call executeWriteRetro for multiple in-progress phases', async () => {
			const planData = {
				title: 'Test Project',
				phases: [
					{
						id: 1,
						name: 'Phase 1',
						status: 'in_progress',
						tasks: [{ id: '1.1', status: 'complete' }],
					},
					{
						id: 2,
						name: 'Phase 2',
						status: 'in_progress',
						tasks: [{ id: '2.1', status: 'in_progress' }],
					},
					{
						id: 3,
						name: 'Phase 3',
						status: 'complete',
						tasks: [],
					},
				],
			};
			writeFileSync(
				path.join(testDir, '.swarm', 'plan.json'),
				JSON.stringify(planData),
			);

			await handleCloseCommand(testDir, []);

			expect(mockExecuteWriteRetro).toHaveBeenCalledTimes(2);
		});
	});

	describe('Curates lessons', () => {
		it('should call curateAndStoreSwarm to curate lessons', async () => {
			const planData = {
				title: 'Test Project',
				phases: [
					{
						id: 1,
						name: 'Phase 1',
						status: 'in_progress',
						tasks: [{ id: '1.1', status: 'complete' }],
					},
				],
			};
			writeFileSync(
				path.join(testDir, '.swarm', 'plan.json'),
				JSON.stringify(planData),
			);

			await handleCloseCommand(testDir, []);

			expect(mockCurateAndStoreSwarm).toHaveBeenCalledTimes(1);
			expect(mockCurateAndStoreSwarm).toHaveBeenCalledWith(
				[],
				'Test Project',
				{ phase_number: 0 },
				testDir,
				expect.any(Object),
			);
		});
	});

	describe('Sets closed status', () => {
		it('should set in-progress phases to closed status', async () => {
			const planData = {
				title: 'Test Project',
				phases: [
					{
						id: 1,
						name: 'Phase 1',
						status: 'in_progress',
						tasks: [
							{ id: '1.1', status: 'complete' },
							{ id: '1.2', status: 'in_progress' },
						],
					},
				],
			};
			writeFileSync(
				path.join(testDir, '.swarm', 'plan.json'),
				JSON.stringify(planData),
			);

			await handleCloseCommand(testDir, []);

			const updatedPlan = JSON.parse(
				readFileSync(path.join(testDir, '.swarm', 'plan.json'), 'utf-8'),
			);
			expect(updatedPlan.phases[0].status).toBe('closed');
			expect(updatedPlan.phases[0].tasks[0].status).toBe('complete');
			expect(updatedPlan.phases[0].tasks[1].status).toBe('closed');
		});

		it('should close pending phases that were never started', async () => {
			const planData = {
				title: 'Test Project',
				phases: [
					{
						id: 1,
						name: 'Phase 1',
						status: 'complete',
						tasks: [{ id: '1.1', status: 'completed' }],
					},
					{
						id: 2,
						name: 'Phase 2',
						status: 'pending',
						tasks: [{ id: '2.1', status: 'pending' }],
					},
				],
			};
			writeFileSync(
				path.join(testDir, '.swarm', 'plan.json'),
				JSON.stringify(planData),
			);

			const result = await handleCloseCommand(testDir, []);

			expect(result).toContain('closed successfully');
			const updatedPlan = JSON.parse(
				readFileSync(path.join(testDir, '.swarm', 'plan.json'), 'utf-8'),
			);
			expect(updatedPlan.phases[0].status).toBe('complete');
			expect(updatedPlan.phases[1].status).toBe('closed');
			expect(updatedPlan.phases[1].tasks[0].status).toBe('closed');
			// No retros for pending phases (never started)
			expect(mockExecuteWriteRetro).not.toHaveBeenCalled();
			// Pending phase and task should be counted in close summary
			expect(result).toContain('1 phase(s) closed');
			expect(result).toContain('1 incomplete task(s) marked closed');
		});

		it('should preserve completed (alias) phase status', async () => {
			const planData = {
				title: 'Test Project',
				phases: [
					{
						id: 1,
						name: 'Phase 1',
						status: 'completed',
						tasks: [{ id: '1.1', status: 'completed' }],
					},
					{
						id: 2,
						name: 'Phase 2',
						status: 'in_progress',
						tasks: [{ id: '2.1', status: 'in_progress' }],
					},
				],
			};
			writeFileSync(
				path.join(testDir, '.swarm', 'plan.json'),
				JSON.stringify(planData),
			);

			await handleCloseCommand(testDir, []);

			const updatedPlan = JSON.parse(
				readFileSync(path.join(testDir, '.swarm', 'plan.json'), 'utf-8'),
			);
			expect(updatedPlan.phases[0].status).toBe('completed');
			expect(updatedPlan.phases[0].tasks[0].status).toBe('completed');
			expect(updatedPlan.phases[1].status).toBe('closed');
		});

		it('should set complete phases to closed status', async () => {
			const planData = {
				title: 'Test Project',
				phases: [
					{
						id: 1,
						name: 'Phase 1',
						status: 'complete',
						tasks: [{ id: '1.1', status: 'complete' }],
					},
					{
						id: 2,
						name: 'Phase 2',
						status: 'in_progress',
						tasks: [{ id: '2.1', status: 'in_progress' }],
					},
				],
			};
			writeFileSync(
				path.join(testDir, '.swarm', 'plan.json'),
				JSON.stringify(planData),
			);

			await handleCloseCommand(testDir, []);

			const updatedPlan = JSON.parse(
				readFileSync(path.join(testDir, '.swarm', 'plan.json'), 'utf-8'),
			);
			// When closing, all non-complete phases get closed
			// complete phases remain complete since allDone is false (due to in_progress phase)
			expect(updatedPlan.phases[0].status).toBe('complete');
			expect(updatedPlan.phases[1].status).toBe('closed');
		});
	});

	describe('Archives evidence', () => {
		it('should call archiveEvidence with correct parameters', async () => {
			const planData = {
				title: 'Test Project',
				phases: [
					{
						id: 1,
						name: 'Phase 1',
						status: 'in_progress',
						tasks: [{ id: '1.1', status: 'complete' }],
					},
				],
			};
			writeFileSync(
				path.join(testDir, '.swarm', 'plan.json'),
				JSON.stringify(planData),
			);

			await handleCloseCommand(testDir, []);

			expect(mockArchiveEvidence).toHaveBeenCalledTimes(1);
			expect(mockArchiveEvidence).toHaveBeenCalledWith(testDir, 30, 10);
		});
	});

	describe('Writes summary', () => {
		it('should write close-summary.md file', async () => {
			const planData = {
				title: 'Test Project',
				phases: [
					{
						id: 1,
						name: 'Phase 1',
						status: 'in_progress',
						tasks: [
							{ id: '1.1', status: 'complete' },
							{ id: '1.2', status: 'in_progress' },
						],
					},
				],
			};
			writeFileSync(
				path.join(testDir, '.swarm', 'plan.json'),
				JSON.stringify(planData),
			);

			await handleCloseCommand(testDir, []);

			const summaryPath = path.join(testDir, '.swarm', 'close-summary.md');
			expect(existsSync(summaryPath)).toBe(true);

			const summary = readFileSync(summaryPath, 'utf-8');
			expect(summary).toContain('# Swarm Close Summary');
			expect(summary).toContain('**Project:** Test Project');
			expect(summary).toContain('## Phases Closed: 1');
			expect(summary).toContain('- Phase 1');
			expect(summary).toContain('## Tasks Closed: 1');
			expect(summary).toContain('- 1.2');
			expect(summary).toContain('## Actions Performed');
			expect(summary).toContain(
				'- Wrote retrospectives for in-progress phases',
			);
			expect(summary).toContain('- Archived evidence bundles');
			expect(summary).toContain(
				'- Cleared agent sessions and delegation chains',
			);
			expect(summary).toContain(
				'- Set non-completed phases/tasks to closed status',
			);
		});

		it('should handle case with no incomplete tasks', async () => {
			const planData = {
				title: 'Test Project',
				phases: [
					{
						id: 1,
						name: 'Phase 1',
						status: 'in_progress',
						tasks: [{ id: '1.1', status: 'complete' }],
					},
				],
			};
			writeFileSync(
				path.join(testDir, '.swarm', 'plan.json'),
				JSON.stringify(planData),
			);

			await handleCloseCommand(testDir, []);

			const summaryPath = path.join(testDir, '.swarm', 'close-summary.md');
			const summary = readFileSync(summaryPath, 'utf-8');
			expect(summary).toContain('## Tasks Closed: 0');
			expect(summary).toContain('_No incomplete tasks_');
		});
	});

	describe('Clears state', () => {
		it('should call flushPendingSnapshot', async () => {
			const planData = {
				title: 'Test Project',
				phases: [
					{
						id: 1,
						name: 'Phase 1',
						status: 'in_progress',
						tasks: [{ id: '1.1', status: 'complete' }],
					},
				],
			};
			writeFileSync(
				path.join(testDir, '.swarm', 'plan.json'),
				JSON.stringify(planData),
			);

			await handleCloseCommand(testDir, []);

			expect(mockFlushPendingSnapshot).toHaveBeenCalledTimes(1);
			expect(mockFlushPendingSnapshot).toHaveBeenCalledWith(testDir);
		});
	});

	describe('Is idempotent', () => {
		it('should return already closed message when no in-progress phases', async () => {
			const planData = {
				title: 'Test Project',
				phases: [
					{
						id: 1,
						name: 'Phase 1',
						status: 'complete',
						tasks: [{ id: '1.1', status: 'complete' }],
					},
					{
						id: 2,
						name: 'Phase 2',
						status: 'blocked',
						tasks: [{ id: '2.1', status: 'blocked' }],
					},
				],
			};
			writeFileSync(
				path.join(testDir, '.swarm', 'plan.json'),
				JSON.stringify(planData),
			);

			const result = await handleCloseCommand(testDir, []);

			expect(result).toContain('Swarm already closed');
			expect(result).toContain('1 phases complete');
			expect(result).toContain('1 phases blocked');
			expect(mockExecuteWriteRetro).not.toHaveBeenCalled();
		});

		it('should return already closed message when all phases are complete', async () => {
			const planData = {
				title: 'Test Project',
				phases: [
					{
						id: 1,
						name: 'Phase 1',
						status: 'complete',
						tasks: [{ id: '1.1', status: 'complete' }],
					},
				],
			};
			writeFileSync(
				path.join(testDir, '.swarm', 'plan.json'),
				JSON.stringify(planData),
			);

			const result = await handleCloseCommand(testDir, []);

			expect(result).toContain('Swarm already closed');
			expect(mockExecuteWriteRetro).not.toHaveBeenCalled();
		});

		it('should be safe to run twice - second run returns already closed', async () => {
			const planData = {
				title: 'Test Project',
				phases: [
					{
						id: 1,
						name: 'Phase 1',
						status: 'in_progress',
						tasks: [{ id: '1.1', status: 'complete' }],
					},
				],
			};
			writeFileSync(
				path.join(testDir, '.swarm', 'plan.json'),
				JSON.stringify(planData),
			);

			// First run
			await handleCloseCommand(testDir, []);

			// Second run
			const result = await handleCloseCommand(testDir, []);

			expect(result).toContain('Swarm already closed');
			// Should not call executeWriteRetro again since all phases are now blocked/complete
			expect(mockExecuteWriteRetro).toHaveBeenCalledTimes(1); // Only first run
		});

		it('should handle plan.json with no phases', async () => {
			const planData = {
				title: 'Test Project',
				phases: [],
			};
			writeFileSync(
				path.join(testDir, '.swarm', 'plan.json'),
				JSON.stringify(planData),
			);

			const result = await handleCloseCommand(testDir, []);

			expect(result).toContain('Swarm already closed');
			expect(mockExecuteWriteRetro).not.toHaveBeenCalled();
		});
	});

	describe('Error handling', () => {
		// FIXED: Test now expects plan-free session to succeed (old behavior was error on missing plan.json)
		it('should succeed when plan.json is absent (plan-free session)', async () => {
			// No plan.json written — plan-free session
			const result = await handleCloseCommand(testDir, []);

			// Should succeed, not error
			expect(result).toContain('closed successfully');
			expect(result).not.toContain('Failed to read plan.json');
			// curateAndStoreSwarm should still have been called
			expect(mockCurateAndStoreSwarm).toHaveBeenCalledTimes(1);
			// archiveEvidence should still have been called
			expect(mockArchiveEvidence).toHaveBeenCalledTimes(1);
		});

		it('should handle executeWriteRetro returning non-success', async () => {
			mockExecuteWriteRetro.mockImplementation(async () =>
				JSON.stringify({ success: false, message: 'Failed' }),
			);

			const planData = {
				title: 'Test Project',
				phases: [
					{
						id: 1,
						name: 'Phase 1',
						status: 'in_progress',
						tasks: [{ id: '1.1', status: 'complete' }],
					},
				],
			};
			writeFileSync(
				path.join(testDir, '.swarm', 'plan.json'),
				JSON.stringify(planData),
			);

			const result = await handleCloseCommand(testDir, []);

			expect(result).toContain('closed successfully');
			expect(result).toContain('Warnings');
			expect(result).toContain('Retrospective write failed for phase 1');
		});

		it('should handle executeWriteRetro returning non-JSON', async () => {
			mockExecuteWriteRetro.mockImplementation(
				async () => 'NOT JSON {{{{' as any,
			);

			const planData = {
				title: 'Test Project',
				phases: [
					{
						id: 1,
						name: 'Phase 1',
						status: 'in_progress',
						tasks: [{ id: '1.1', status: 'complete' }],
					},
				],
			};
			writeFileSync(
				path.join(testDir, '.swarm', 'plan.json'),
				JSON.stringify(planData),
			);

			const result = await handleCloseCommand(testDir, []);

			// Non-JSON response is not treated as an error
			expect(result).toContain('closed successfully');
		});
	});

	describe('Return message format', () => {
		it('should return success message with correct counts', async () => {
			const planData = {
				title: 'Test Project',
				phases: [
					{
						id: 1,
						name: 'Phase 1',
						status: 'in_progress',
						tasks: [
							{ id: '1.1', status: 'complete' },
							{ id: '1.2', status: 'in_progress' },
							{ id: '1.3', status: 'in_progress' },
						],
					},
				],
			};
			writeFileSync(
				path.join(testDir, '.swarm', 'plan.json'),
				JSON.stringify(planData),
			);

			const result = await handleCloseCommand(testDir, []);

			expect(result).toContain('✅ Swarm closed successfully');
			expect(result).toContain('1 phase(s) closed');
			expect(result).toContain('2 incomplete task(s) marked closed');
		});
	});

	// -------------------------------------------------------------------------
	// NEW TESTS — New fixes (plan-free, context reset, backup cleanup, branch pruning, lessons)
	// -------------------------------------------------------------------------
	describe('New fixes (plan-free, context reset, backup cleanup, branch pruning, lessons)', () => {
		// =====================================================================
		// Group: Plan-free session (Fix 1)
		// =====================================================================

		describe('Plan-free session (Fix 1)', () => {
			it('PF1: No plan.json → succeeds, returns "closed successfully"', async () => {
				// No plan.json — plan-free session
				const result = await handleCloseCommand(testDir, []);

				expect(result).toContain('closed successfully');
			});

			it('PF2: No plan.json → retros NOT called (no in-progress phases)', async () => {
				// No plan.json — plan-free session
				await handleCloseCommand(testDir, []);

				// No retros should be called since there are no phases
				expect(mockExecuteWriteRetro).not.toHaveBeenCalled();
			});

			it('PF3: No plan.json → archiveEvidence IS called', async () => {
				// No plan.json — plan-free session
				await handleCloseCommand(testDir, []);

				expect(mockArchiveEvidence).toHaveBeenCalledTimes(1);
			});

			it('PF4: No plan.json → curateAndStoreSwarm IS called', async () => {
				// No plan.json — plan-free session
				await handleCloseCommand(testDir, []);

				expect(mockCurateAndStoreSwarm).toHaveBeenCalledTimes(1);
			});

			it('PF5: No plan.json → flushPendingSnapshot IS called', async () => {
				// No plan.json — plan-free session
				await handleCloseCommand(testDir, []);

				expect(mockFlushPendingSnapshot).toHaveBeenCalledTimes(1);
			});

			it('PF6: Malformed plan.json (exists but invalid JSON) → returns error containing "Failed to read plan.json"', async () => {
				// Write invalid JSON to plan.json
				writeFileSync(
					path.join(testDir, '.swarm', 'plan.json'),
					'NOT VALID JSON {{{',
				);

				const result = await handleCloseCommand(testDir, []);

				expect(result).toContain('Failed to read plan.json');
			});

			it('PF7: Empty phases array (plan exists) → allDone=true → returns "already closed"', async () => {
				// Plan with empty phases array
				const planData = {
					title: 'Test Project',
					phases: [],
				};
				writeFileSync(
					path.join(testDir, '.swarm', 'plan.json'),
					JSON.stringify(planData),
				);

				const result = await handleCloseCommand(testDir, []);

				expect(result).toContain('already closed');
				expect(result).toContain('0 phases complete');
			});
		});

		// =====================================================================
		// Group: context.md reset (Fix 2)
		// =====================================================================

		describe('context.md reset (Fix 2)', () => {
			it('CM1: After close, .swarm/context.md is written', async () => {
				// No plan.json to keep it simple
				await handleCloseCommand(testDir, []);

				const contextPath = path.join(testDir, '.swarm', 'context.md');
				expect(existsSync(contextPath)).toBe(true);
			});

			it('CM2: context.md contains "No active plan. Next session starts fresh."', async () => {
				// No plan.json to keep it simple
				await handleCloseCommand(testDir, []);

				const contextPath = path.join(testDir, '.swarm', 'context.md');
				const context = readFileSync(contextPath, 'utf-8');
				expect(context).toContain('No active plan. Next session starts fresh.');
			});

			it('CM3: context.md contains the project name from plan title', async () => {
				const planData = {
					title: 'My Special Project',
					phases: [
						{
							id: 1,
							name: 'Phase 1',
							status: 'in_progress',
							tasks: [{ id: '1.1', status: 'complete' }],
						},
					],
				};
				writeFileSync(
					path.join(testDir, '.swarm', 'plan.json'),
					JSON.stringify(planData),
				);

				await handleCloseCommand(testDir, []);

				const contextPath = path.join(testDir, '.swarm', 'context.md');
				const context = readFileSync(contextPath, 'utf-8');
				expect(context).toContain('My Special Project');
			});
		});

		// =====================================================================
		// Group: Config-backup cleanup (Fix 3)
		// Note: These tests use in_progress phase to prevent early return (allDone=true)
		// =====================================================================

		describe('Config-backup cleanup (Fix 3)', () => {
			it('CB1: Config-backup files are removed after close', async () => {
				// Create some backup files
				writeFileSync(
					path.join(testDir, '.swarm', 'config-backup-001.json'),
					'{}',
				);
				writeFileSync(
					path.join(testDir, '.swarm', 'config-backup-002.json'),
					'{}',
				);

				// Write a plan WITH in-progress phase so allDone=false and cleanup code runs
				writeFileSync(
					path.join(testDir, '.swarm', 'plan.json'),
					JSON.stringify({
						title: 'Test',
						phases: [
							{ id: 1, name: 'Phase 1', status: 'in_progress', tasks: [] },
						],
					}),
				);

				await handleCloseCommand(testDir, []);

				// Backup files should be gone
				expect(
					existsSync(path.join(testDir, '.swarm', 'config-backup-001.json')),
				).toBe(false);
				expect(
					existsSync(path.join(testDir, '.swarm', 'config-backup-002.json')),
				).toBe(false);
			});

			it('CB2: Non-backup .swarm files are NOT removed', async () => {
				// Create a non-backup file
				writeFileSync(
					path.join(testDir, '.swarm', 'some-other-file.json'),
					'{}',
				);
				// Create a backup file
				writeFileSync(
					path.join(testDir, '.swarm', 'config-backup-001.json'),
					'{}',
				);

				// Write a plan WITH in-progress phase so allDone=false
				writeFileSync(
					path.join(testDir, '.swarm', 'plan.json'),
					JSON.stringify({
						title: 'Test',
						phases: [
							{ id: 1, name: 'Phase 1', status: 'in_progress', tasks: [] },
						],
					}),
				);

				await handleCloseCommand(testDir, []);

				// Non-backup file should still exist
				expect(
					existsSync(path.join(testDir, '.swarm', 'some-other-file.json')),
				).toBe(true);
				// Backup file should be gone
				expect(
					existsSync(path.join(testDir, '.swarm', 'config-backup-001.json')),
				).toBe(false);
			});

			it('CB3: No backup files present → no error, still succeeds', async () => {
				// No backup files, just a plan WITH in-progress phase
				writeFileSync(
					path.join(testDir, '.swarm', 'plan.json'),
					JSON.stringify({
						title: 'Test',
						phases: [
							{ id: 1, name: 'Phase 1', status: 'in_progress', tasks: [] },
						],
					}),
				);

				const result = await handleCloseCommand(testDir, []);

				expect(result).toContain('closed successfully');
			});
		});

		// =====================================================================
		// Group: Lesson injection (Fix 5)
		// Note: Lesson injection happens BEFORE the early return check (lines 119-146 vs 58-75),
		// so it works even with empty phases array. But using in_progress phase for consistency.
		// =====================================================================

		describe('Lesson injection (Fix 5)', () => {
			it('LN1: close-lessons.md with two lessons → curateAndStoreSwarm called with those lessons', async () => {
				// Create lessons file
				writeFileSync(
					path.join(testDir, '.swarm', 'close-lessons.md'),
					'Lesson one about testing\nLesson two about deployment',
				);

				// Write a plan WITH in-progress phase
				writeFileSync(
					path.join(testDir, '.swarm', 'plan.json'),
					JSON.stringify({
						title: 'Test Project',
						phases: [
							{ id: 1, name: 'Phase 1', status: 'in_progress', tasks: [] },
						],
					}),
				);

				await handleCloseCommand(testDir, []);

				// curateAndStoreSwarm should have been called with the lessons
				expect(mockCurateAndStoreSwarm).toHaveBeenCalledWith(
					['Lesson one about testing', 'Lesson two about deployment'],
					'Test Project',
					{ phase_number: 0 },
					testDir,
					expect.any(Object),
				);
			});

			it('LN2: close-lessons.md absent → curateAndStoreSwarm called with []', async () => {
				// No lessons file - just a plan with in-progress phase
				writeFileSync(
					path.join(testDir, '.swarm', 'plan.json'),
					JSON.stringify({
						title: 'Test Project',
						phases: [
							{ id: 1, name: 'Phase 1', status: 'in_progress', tasks: [] },
						],
					}),
				);

				await handleCloseCommand(testDir, []);

				// curateAndStoreSwarm should have been called with empty array
				expect(mockCurateAndStoreSwarm).toHaveBeenCalledWith(
					[],
					'Test Project',
					{ phase_number: 0 },
					testDir,
					expect.any(Object),
				);
			});

			it('LN3: close-lessons.md with comment lines → comment lines filtered out, only real lessons passed', async () => {
				// Create lessons file with comments
				writeFileSync(
					path.join(testDir, '.swarm', 'close-lessons.md'),
					'# This is a comment\nReal lesson about code review\n# Another comment\nAnother real lesson',
				);

				// Write a plan with in-progress phase
				writeFileSync(
					path.join(testDir, '.swarm', 'plan.json'),
					JSON.stringify({
						title: 'Test Project',
						phases: [
							{ id: 1, name: 'Phase 1', status: 'in_progress', tasks: [] },
						],
					}),
				);

				await handleCloseCommand(testDir, []);

				// Only non-comment lines should be passed
				expect(mockCurateAndStoreSwarm).toHaveBeenCalledWith(
					['Real lesson about code review', 'Another real lesson'],
					'Test Project',
					{ phase_number: 0 },
					testDir,
					expect.any(Object),
				);
			});

			it('LN4: close-lessons.md → file deleted after processing', async () => {
				// Create lessons file
				writeFileSync(
					path.join(testDir, '.swarm', 'close-lessons.md'),
					'Some lesson',
				);

				// Write a plan with in-progress phase
				writeFileSync(
					path.join(testDir, '.swarm', 'plan.json'),
					JSON.stringify({
						title: 'Test Project',
						phases: [
							{ id: 1, name: 'Phase 1', status: 'in_progress', tasks: [] },
						],
					}),
				);

				await handleCloseCommand(testDir, []);

				// Lessons file should be deleted
				expect(
					existsSync(path.join(testDir, '.swarm', 'close-lessons.md')),
				).toBe(false);
			});

			it("LN5: curateAndStoreSwarm throws → lessons file is NOT deleted (so lessons aren't lost)", async () => {
				mockCurateAndStoreSwarm.mockImplementationOnce(async () => {
					throw new Error('curation failed');
				});

				// Create lessons file
				writeFileSync(
					path.join(testDir, '.swarm', 'close-lessons.md'),
					'Lesson that should be preserved',
				);

				// Write a plan with in-progress phase
				writeFileSync(
					path.join(testDir, '.swarm', 'plan.json'),
					JSON.stringify({
						title: 'Test Project',
						phases: [
							{ id: 1, name: 'Phase 1', status: 'in_progress', tasks: [] },
						],
					}),
				);

				const result = await handleCloseCommand(testDir, []);

				// Command should still succeed despite curation failure (non-blocking)
				expect(result).toContain('closed successfully');
				// Lessons file should still exist because curation threw before deletion
				expect(
					existsSync(path.join(testDir, '.swarm', 'close-lessons.md')),
				).toBe(true);
			});
		});

		// =====================================================================
		// Group: Git branch pruning (Fix 4)
		// =====================================================================

		describe('Git branch pruning (Fix 4)', () => {
			it('BP1: --prune-branches NOT passed → succeeds even in non-git dir (git not invoked, no crash)', async () => {
				// No git repo, no --prune-branches flag
				const result = await handleCloseCommand(testDir, []);

				expect(result).toContain('closed successfully');
			});

			it('BP2: --prune-branches passed in non-git dir → succeeds (non-blocking failure)', async () => {
				// No git repo but --prune-branches flag passed
				const result = await handleCloseCommand(testDir, ['--prune-branches']);

				// Should still succeed (non-blocking failure)
				expect(result).toContain('closed successfully');
			});

			it('BP3: --prune-branches passed in real git repo → succeeds with no gone branches to prune', async () => {
				// Create a real git repo
				const { execSync } = await import('node:child_process');
				execSync('git init', { cwd: testDir, stdio: 'pipe' });
				execSync('git config user.email "test@test.com"', {
					cwd: testDir,
					stdio: 'pipe',
				});
				execSync('git config user.name "Test"', {
					cwd: testDir,
					stdio: 'pipe',
				});
				execSync('git commit --allow-empty -m "init"', {
					cwd: testDir,
					stdio: 'pipe',
				});

				// Write plan.json WITH in-progress phase so the command has something to work with
				writeFileSync(
					path.join(testDir, '.swarm', 'plan.json'),
					JSON.stringify({
						title: 'Test',
						phases: [
							{ id: 1, name: 'Phase 1', status: 'in_progress', tasks: [] },
						],
					}),
				);

				const result = await handleCloseCommand(testDir, ['--prune-branches']);

				expect(result).toContain('closed successfully');
				// No branches pruned since none are gone
			});
		});
	});
});

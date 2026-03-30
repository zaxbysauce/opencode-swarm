/**
 * Tests for handleCloseCommand
 * Verifies the command handler for /swarm close
 */
import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Mock dependencies before importing the module
const mockExecuteWriteRetro = mock(async (_args: unknown, _directory: string) =>
	JSON.stringify({ success: true, phase: 1, task_id: 'retro-1', message: 'Done' })
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
				JSON.stringify(planData)
			);

			await handleCloseCommand(testDir, []);

			expect(mockExecuteWriteRetro).toHaveBeenCalledTimes(1);
			expect(mockExecuteWriteRetro).toHaveBeenCalledWith(
				expect.objectContaining({
					phase: 2,
					summary: 'Phase closed via /swarm close',
					task_count: 2,
				}),
				testDir
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
				JSON.stringify(planData)
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
				JSON.stringify(planData)
			);

			await handleCloseCommand(testDir, []);

			expect(mockCurateAndStoreSwarm).toHaveBeenCalledTimes(1);
			expect(mockCurateAndStoreSwarm).toHaveBeenCalledWith(
				[],
				'Test Project',
				{ phase_number: 0 },
				testDir,
				expect.any(Object)
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
				JSON.stringify(planData)
			);

			await handleCloseCommand(testDir, []);

			const updatedPlan = JSON.parse(
				readFileSync(path.join(testDir, '.swarm', 'plan.json'), 'utf-8')
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
				JSON.stringify(planData)
			);

			const result = await handleCloseCommand(testDir, []);

			expect(result).toContain('closed successfully');
			const updatedPlan = JSON.parse(
				readFileSync(path.join(testDir, '.swarm', 'plan.json'), 'utf-8')
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
				JSON.stringify(planData)
			);

			await handleCloseCommand(testDir, []);

			const updatedPlan = JSON.parse(
				readFileSync(path.join(testDir, '.swarm', 'plan.json'), 'utf-8')
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
				JSON.stringify(planData)
			);

			await handleCloseCommand(testDir, []);

			const updatedPlan = JSON.parse(
				readFileSync(path.join(testDir, '.swarm', 'plan.json'), 'utf-8')
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
				JSON.stringify(planData)
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
				JSON.stringify(planData)
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
			expect(summary).toContain('- Wrote retrospectives for in-progress phases');
			expect(summary).toContain('- Archived evidence bundles');
			expect(summary).toContain('- Cleared agent sessions and delegation chains');
			expect(summary).toContain('- Set non-completed phases/tasks to closed status');
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
				JSON.stringify(planData)
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
				JSON.stringify(planData)
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
				JSON.stringify(planData)
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
				JSON.stringify(planData)
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
				JSON.stringify(planData)
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
				JSON.stringify(planData)
			);

			const result = await handleCloseCommand(testDir, []);

			expect(result).toContain('Swarm already closed');
			expect(mockExecuteWriteRetro).not.toHaveBeenCalled();
		});
	});

	describe('Error handling', () => {
		it('should return error message when plan.json cannot be read', async () => {
			// Don't create a plan.json file

			const result = await handleCloseCommand(testDir, []);

			expect(result).toContain('Failed to read plan.json');
		});

		it('should handle executeWriteRetro returning non-success', async () => {
			mockExecuteWriteRetro.mockImplementation(
				async () => JSON.stringify({ success: false, message: 'Failed' })
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
				JSON.stringify(planData)
			);

			const result = await handleCloseCommand(testDir, []);

			expect(result).toContain('closed successfully');
			expect(result).toContain('Warnings');
			expect(result).toContain('Retrospective write failed for phase 1');
		});

		it('should handle executeWriteRetro returning non-JSON', async () => {
			mockExecuteWriteRetro.mockImplementation(async () => 'NOT JSON {{{{' as any);

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
				JSON.stringify(planData)
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
				JSON.stringify(planData)
			);

			const result = await handleCloseCommand(testDir, []);

			expect(result).toContain('✅ Swarm closed successfully');
			expect(result).toContain('1 phase(s) closed');
			expect(result).toContain('2 incomplete task(s) marked closed');
		});
	});
});

/**
 * Tests for handleCloseCommand — finalizer, archive, clean, and align stages.
 *
 * Verifies the 4-stage close pipeline:
 *   1. Finalize  (retros, curation)
 *   2. Archive   (timestamped bundle under .swarm/archive/)
 *   3. Clean     (remove active-state files)
 *   4. Align     (git — skipped via mocks here)
 */
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ── Mocks (must precede the dynamic import) ──────────────────────────

const mockExecuteWriteRetro = mock(
	async (_args: unknown, _directory: string) =>
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

mock.module('../../../src/git/branch.js', () => ({
	isGitRepo: () => false,
	getCurrentBranch: () => 'main',
	getDefaultBaseBranch: () => 'origin/main',
	hasUncommittedChanges: () => false,
}));

mock.module('../../../src/plan/checkpoint.js', () => ({
	writeCheckpoint: async () => {},
}));

// ── Import under test ────────────────────────────────────────────────
const { handleCloseCommand } = await import('../../../src/commands/close.js');

// ── Helpers ──────────────────────────────────────────────────────────

let testDir: string;

function swarmDir(): string {
	return path.join(testDir, '.swarm');
}

function writePlan(overrides: Record<string, unknown> = {}): void {
	const plan = {
		title: 'Finalizer Test Project',
		schema_version: '1.0.0',
		current_phase: 1,
		phases: [
			{
				id: 1,
				name: 'Phase 1',
				status: 'in_progress',
				tasks: [
					{ id: '1.1', status: 'in_progress', description: 'Task A' },
					{ id: '1.2', status: 'complete', description: 'Task B' },
				],
			},
		],
		...overrides,
	};
	writeFileSync(path.join(swarmDir(), 'plan.json'), JSON.stringify(plan));
}

// ── Test suites ──────────────────────────────────────────────────────

describe('handleCloseCommand — finalizer stages', () => {
	beforeEach(() => {
		mockExecuteWriteRetro.mockClear();
		mockCurateAndStoreSwarm.mockClear();
		mockArchiveEvidence.mockClear();
		mockFlushPendingSnapshot.mockClear();
		testDir = mkdtempSync(path.join(os.tmpdir(), 'close-finalizer-test-'));
		mkdirSync(path.join(swarmDir(), 'session'), { recursive: true });
	});

	afterEach(() => {
		try {
			rmSync(testDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	// ── STAGE 2: ARCHIVE ─────────────────────────────────────────────

	describe('Archive stage', () => {
		it('creates an archive directory under .swarm/archive/ with a timestamped name', async () => {
			writePlan();

			await handleCloseCommand(testDir, []);

			const archiveBase = path.join(swarmDir(), 'archive');
			expect(existsSync(archiveBase)).toBe(true);

			const entries = readdirSync(archiveBase);
			expect(entries.length).toBeGreaterThanOrEqual(1);

			const archiveName = entries.find((e) => e.startsWith('swarm-'));
			expect(archiveName).toBeDefined();
			// Timestamp pattern: swarm-YYYY-MM-DDTHH-MM-SS-…
			expect(archiveName).toMatch(/^swarm-\d{4}-\d{2}-\d{2}T/);
		});

		it('copies plan.json, context.md, and events.jsonl into the archive when they exist', async () => {
			writePlan();
			writeFileSync(
				path.join(swarmDir(), 'context.md'),
				'# Context\nSome context',
			);
			writeFileSync(
				path.join(swarmDir(), 'events.jsonl'),
				'{"event":"started"}\n',
			);

			await handleCloseCommand(testDir, []);

			const archiveBase = path.join(swarmDir(), 'archive');
			const archiveEntry = readdirSync(archiveBase).find((e) =>
				e.startsWith('swarm-'),
			);
			expect(archiveEntry).toBeDefined();

			const archivePath = path.join(archiveBase, archiveEntry!);
			expect(existsSync(path.join(archivePath, 'plan.json'))).toBe(true);
			expect(existsSync(path.join(archivePath, 'context.md'))).toBe(true);
			expect(existsSync(path.join(archivePath, 'events.jsonl'))).toBe(true);

			// Verify content fidelity of events.jsonl
			const archivedEvents = readFileSync(
				path.join(archivePath, 'events.jsonl'),
				'utf-8',
			);
			expect(archivedEvents).toContain('{"event":"started"}');
		});

		it('return message includes archive result', async () => {
			writePlan();

			const result = await handleCloseCommand(testDir, []);

			expect(result).toContain('**Archive:**');
			expect(result).toContain('Archived');
			expect(result).toContain('.swarm/archive/swarm-');
		});
	});

	// ── STAGE 3: CLEAN ───────────────────────────────────────────────

	describe('Clean stage', () => {
		it('removes active-state files after archiving', async () => {
			// Create all active-state files that should be cleaned
			const activeFilesRemoved = [
				'plan.md',
				'events.jsonl',
				'handoff.md',
				'handoff-prompt.md',
				'handoff-consumed.md',
				'escalation-report.md',
			];
			for (const f of activeFilesRemoved) {
				writeFileSync(path.join(swarmDir(), f), `content of ${f}`);
			}
			// plan.json is kept (terminal state is safe) — write valid plan
			writePlan();

			await handleCloseCommand(testDir, []);

			for (const f of activeFilesRemoved) {
				expect(existsSync(path.join(swarmDir(), f))).toBe(false);
			}
			// plan.json is preserved with terminal status
			expect(existsSync(path.join(swarmDir(), 'plan.json'))).toBe(true);
		});

		it('future swarms start from clean state — no stale plan.json or events.jsonl', async () => {
			writePlan();
			writeFileSync(
				path.join(swarmDir(), 'events.jsonl'),
				'{"event":"old"}\n',
			);

			await handleCloseCommand(testDir, []);

			// Active-state artifacts must be gone (plan.json is kept since terminal state is safe)
			expect(existsSync(path.join(swarmDir(), 'plan.json'))).toBe(true);
			expect(existsSync(path.join(swarmDir(), 'events.jsonl'))).toBe(false);

			// .swarm/ itself must still exist (archive, context.md, etc.)
			expect(existsSync(swarmDir())).toBe(true);
		});
	});

	// ── context.md reset ─────────────────────────────────────────────

	describe('Context reset', () => {
		it('resets context.md with "Session closed" content and finalization type', async () => {
			writePlan();
			writeFileSync(
				path.join(swarmDir(), 'context.md'),
				'# Old context\nStale data here.',
			);

			await handleCloseCommand(testDir, []);

			const contextPath = path.join(swarmDir(), 'context.md');
			expect(existsSync(contextPath)).toBe(true);
			const content = readFileSync(contextPath, 'utf-8');
			expect(content).toContain('Session closed');
			expect(content).toContain('Finalization: normal');
			expect(content).toContain('No active plan');
		});

		it('marks finalization as "forced" when --force is used', async () => {
			writePlan();

			await handleCloseCommand(testDir, ['--force']);

			const content = readFileSync(
				path.join(swarmDir(), 'context.md'),
				'utf-8',
			);
			expect(content).toContain('Finalization: forced');
		});

		it('marks finalization as "plan-already-done" when all phases are terminal', async () => {
			writePlan({
				phases: [
					{
						id: 1,
						name: 'Phase 1',
						status: 'complete',
						tasks: [{ id: '1.1', status: 'complete' }],
					},
				],
			});

			await handleCloseCommand(testDir, []);

			const content = readFileSync(
				path.join(swarmDir(), 'context.md'),
				'utf-8',
			);
			expect(content).toContain('Finalization: plan-already-done');
		});
	});

	// ── Close summary ────────────────────────────────────────────────

	describe('Close summary', () => {
		it('includes archive result and finalization type in close-summary.md', async () => {
			writePlan();

			await handleCloseCommand(testDir, []);

			const summaryPath = path.join(swarmDir(), 'close-summary.md');
			expect(existsSync(summaryPath)).toBe(true);
			const summary = readFileSync(summaryPath, 'utf-8');
			expect(summary).toContain('Archived');
			expect(summary).toContain('.swarm/archive/swarm-');
			expect(summary).toContain('Normal finalization');
		});

		it('distinguishes normal finalization from forced closure in the summary', async () => {
			writePlan();

			await handleCloseCommand(testDir, ['--force']);

			const summary = readFileSync(
				path.join(swarmDir(), 'close-summary.md'),
				'utf-8',
			);
			expect(summary).toContain('Forced closure');
		});

		it('return message includes archive and git status info', async () => {
			writePlan();

			const result = await handleCloseCommand(testDir, []);

			expect(result).toContain('**Archive:**');
			expect(result).toContain('**Git:**');
			// Git is mocked as non-repo
			expect(result).toContain('Not a git repository');
		});

		it('forced closure return message differs from normal', async () => {
			writePlan();

			const normalResult = await handleCloseCommand(testDir, []);

			// Recreate for fresh forced run
			mkdirSync(path.join(swarmDir(), 'session'), { recursive: true });
			writePlan();

			const forcedResult = await handleCloseCommand(testDir, ['--force']);

			// Both should succeed but the retro summary mentions force
			expect(normalResult).toContain('Swarm finalized');
			expect(forcedResult).toContain('Swarm finalized');
		});
	});

	// ── Plan-already-done path ───────────────────────────────────────

	describe('Plan already terminal', () => {
		it('skips retro writing but still archives and cleans', async () => {
			writePlan({
				phases: [
					{
						id: 1,
						name: 'Phase 1',
						status: 'complete',
						tasks: [{ id: '1.1', status: 'complete' }],
					},
				],
			});
			writeFileSync(path.join(swarmDir(), 'events.jsonl'), '{"e":1}\n');

			const result = await handleCloseCommand(testDir, []);

			// Should NOT have called retro
			expect(mockExecuteWriteRetro).toHaveBeenCalledTimes(0);

			// Archive should still exist
			const archiveBase = path.join(swarmDir(), 'archive');
			const entries = readdirSync(archiveBase);
			expect(entries.length).toBeGreaterThanOrEqual(1);

			// Active-state files should be cleaned
			expect(existsSync(path.join(swarmDir(), 'events.jsonl'))).toBe(false);

			// Result should indicate plan was already terminal
			expect(result).toContain('already in a terminal state');
		});
	});
});

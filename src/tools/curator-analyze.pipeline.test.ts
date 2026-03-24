import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runCuratorPipelineOnRetros } from './curator-analyze';

// Test utilities
function createTempDir(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'curator-pipeline-test-'));
	return dir;
}

function cleanupDir(dir: string): void {
	if (fs.existsSync(dir)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

function createSwarmDir(dir: string): string {
	const swarmDir = path.join(dir, '.swarm');
	fs.mkdirSync(swarmDir, { recursive: true });
	return swarmDir;
}

// Module-level mock behavior state
interface MockCuratorPhaseResult {
	phase: number;
	digest: {
		phase: number;
		timestamp: string;
		summary: string;
		agents_used: string[];
		tasks_completed: number;
		tasks_total: number;
		key_decisions: string[];
		blockers_resolved: string[];
	};
	compliance: Array<{
		phase: number;
		timestamp: string;
		type: string;
		description: string;
		severity: string;
	}>;
	knowledge_recommendations: Array<{
		action: 'promote' | 'archive' | 'flag_contradiction';
		entry_id?: string;
		lesson: string;
		reason: string;
	}>;
	summary_updated: boolean;
}

interface MockApplyResult {
	applied: number;
	skipped: number;
}

let mockPhaseBehavior: 'normal' | 'throw' | 'no-recommendations' | 'partial' =
	'normal';
let mockPhaseCallCount = 0;
let mockApplyCallCount = 0;
let mockApplyBehavior: 'normal' | 'throw' = 'normal';
let mockConfigEnabled = true;

// Setup mocks before importing the module
mock.module('../hooks/curator.js', () => ({
	runCuratorPhase: mock(
		async (
			directory: string,
			phaseId: number,
		): Promise<MockCuratorPhaseResult> => {
			mockPhaseCallCount++;

			if (mockPhaseBehavior === 'throw') {
				throw new Error('Simulated curator phase failure');
			}

			const recommendations: MockCuratorPhaseResult['knowledge_recommendations'] =
				[];

			if (mockPhaseBehavior === 'normal') {
				recommendations.push({
					action: 'promote',
					entry_id: `entry-p${phaseId}`,
					lesson: `Lesson from phase ${phaseId}`,
					reason: `Reason from phase ${phaseId}`,
				});
			}

			if (mockPhaseBehavior === 'partial') {
				// Phase 2 throws to simulate error, others return recommendations if applicable
				if (phaseId === 2) {
					throw new Error('Simulated curator phase failure');
				}
				if (phaseId === 3) {
					recommendations.push({
						action: 'promote',
						entry_id: 'entry-3',
						lesson: 'Lesson from phase 3',
						reason: 'Reason from phase 3',
					});
				}
				// Phase 1 gets no recommendations
			}

			return {
				phase: phaseId,
				digest: {
					phase: phaseId,
					timestamp: '2026-01-01',
					summary: `Digest for phase ${phaseId}`,
					agents_used: ['reviewer'],
					tasks_completed: 3,
					tasks_total: 5,
					key_decisions: [],
					blockers_resolved: [],
				},
				compliance: [],
				knowledge_recommendations: recommendations,
				summary_updated: true,
			};
		},
	),
	applyCuratorKnowledgeUpdates: mock(
		async (
			directory: string,
			recommendations: Array<{
				action: string;
				entry_id?: string;
				lesson: string;
				reason: string;
			}>,
		): Promise<MockApplyResult> => {
			mockApplyCallCount++;

			if (mockApplyBehavior === 'throw') {
				throw new Error('Simulated apply failure');
			}

			return { applied: recommendations.length, skipped: 0 };
		},
	),
}));

mock.module('../config/index.js', () => ({
	loadPluginConfigWithMeta: mock(() => ({
		config: {
			curator: { enabled: mockConfigEnabled, phase_enabled: true },
			knowledge: { enabled: true },
		},
		meta: { path: '/tmp/test' },
	})),
}));

describe('runCuratorPipelineOnRetros', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir();
		createSwarmDir(tempDir);
		// Reset mock state before each test
		mockPhaseBehavior = 'normal';
		mockPhaseCallCount = 0;
		mockApplyCallCount = 0;
		mockApplyBehavior = 'normal';
		mockConfigEnabled = true;
	});

	afterEach(() => {
		cleanupDir(tempDir);
	});

	// Scenario 1: Empty phaseIds array → returns early with phases_processed=0, success=true
	describe('Empty phaseIds array', () => {
		it('returns early with phases_processed=0 and success=true', async () => {
			const result = await runCuratorPipelineOnRetros(tempDir, []);
			const parsed = JSON.parse(result);

			expect(parsed.success).toBe(true);
			expect(parsed.phases_processed).toBe(0);
			expect(parsed.recommendations_collected).toBe(0);
			expect(parsed.applied).toBe(0);
			expect(parsed.skipped).toBe(0);
			expect(parsed.details).toEqual(['No phases to process']);
		});

		it('does not call runCuratorPhase for empty array', async () => {
			await runCuratorPipelineOnRetros(tempDir, []);
			expect(mockPhaseCallCount).toBe(0);
		});
	});

	// Scenario 2: Single phase with recommendations → runs, applies, returns correct counts
	describe('Single phase with recommendations', () => {
		it('processes single phase and applies recommendations', async () => {
			const result = await runCuratorPipelineOnRetros(tempDir, [1]);
			const parsed = JSON.parse(result);

			expect(parsed.success).toBe(true);
			expect(parsed.phases_processed).toBe(1);
			expect(parsed.recommendations_collected).toBe(1);
			expect(parsed.applied).toBe(1);
			expect(parsed.skipped).toBe(0);
			expect(parsed.details).toContain('Phase 1: collected 1 recommendations');
			expect(mockPhaseCallCount).toBe(1);
			expect(mockApplyCallCount).toBe(1);
		});
	});

	// Scenario 3: Multiple phases → runs curator on each, batches recommendations, applies once
	describe('Multiple phases with recommendations', () => {
		it('processes multiple phases and batches recommendations into single apply call', async () => {
			const result = await runCuratorPipelineOnRetros(tempDir, [1, 2, 3]);
			const parsed = JSON.parse(result);

			expect(parsed.success).toBe(true);
			expect(parsed.phases_processed).toBe(3);
			expect(parsed.recommendations_collected).toBe(3);
			expect(parsed.applied).toBe(3);
			// applyCuratorKnowledgeUpdates should be called exactly ONCE with all 3 recommendations batched
			expect(mockApplyCallCount).toBe(1);
			expect(mockPhaseCallCount).toBe(3);
		});
	});

	// Scenario 4: All phases fail (runCuratorPhase throws) → returns gracefully with success details
	describe('All phases fail with errors', () => {
		it('returns gracefully with partial success when all phases throw', async () => {
			mockPhaseBehavior = 'throw';

			const result = await runCuratorPipelineOnRetros(tempDir, [1, 2, 3]);
			const parsed = JSON.parse(result);

			// Pipeline itself succeeds (non-blocking), but phases had errors
			expect(parsed.success).toBe(true);
			expect(parsed.phases_processed).toBe(0);
			expect(parsed.recommendations_collected).toBe(0);
			expect(parsed.applied).toBe(0);
			// Details should contain error messages for each phase
			expect(
				parsed.details.some((d: string) =>
					d.includes('Simulated curator phase failure'),
				),
			).toBe(true);
			expect(mockPhaseCallCount).toBe(3);
		});
	});

	// Scenario 5: No recommendations from any phase → success=true, applied=0, skipped=0
	describe('No recommendations from any phase', () => {
		it('returns success=true with applied=0 and skipped=0', async () => {
			mockPhaseBehavior = 'no-recommendations';

			const result = await runCuratorPipelineOnRetros(tempDir, [1, 2]);
			const parsed = JSON.parse(result);

			expect(parsed.success).toBe(true);
			expect(parsed.phases_processed).toBe(2);
			expect(parsed.recommendations_collected).toBe(0);
			expect(parsed.applied).toBe(0);
			expect(parsed.skipped).toBe(0);
			expect(parsed.details).toContain('No recommendations to apply');
			// applyCuratorKnowledgeUpdates should NOT be called when there are no recommendations
			expect(mockApplyCallCount).toBe(0);
		});
	});

	// Scenario 6: applyCuratorKnowledgeUpdates fails → partial success details returned
	describe('applyCuratorKnowledgeUpdates fails', () => {
		it('returns partial success with success=false when apply fails', async () => {
			mockApplyBehavior = 'throw';

			const result = await runCuratorPipelineOnRetros(tempDir, [1]);
			const parsed = JSON.parse(result);

			expect(parsed.success).toBe(false);
			expect(parsed.phases_processed).toBe(1);
			expect(parsed.recommendations_collected).toBe(1);
			expect(parsed.applied).toBe(0);
			expect(
				parsed.details.some((d: string) =>
					d.includes('Simulated apply failure'),
				),
			).toBe(true);
		});
	});

	// Scenario 7: Non-blocking - errors in one phase don't stop others
	describe('Non-blocking: errors in one phase do not stop others', () => {
		it('continues processing remaining phases when one fails', async () => {
			// Use 'partial' mode where phase 1 returns empty recs, phase 2 throws, phase 3 returns recs
			mockPhaseBehavior = 'partial';

			const result = await runCuratorPipelineOnRetros(tempDir, [1, 2, 3]);
			const parsed = JSON.parse(result);

			// Should have processed all 3 phases despite error in phase 2
			expect(parsed.phases_processed).toBe(2); // Only 2 succeeded (phase 2 errored)
			expect(mockPhaseCallCount).toBe(3);
			// Should have collected the recommendation from phase 3
			expect(parsed.recommendations_collected).toBe(1);
			expect(parsed.details).toContain(
				'Phase 2: error — Error: Simulated curator phase failure',
			);
			expect(parsed.details).toContain('Phase 1: no recommendations');
			expect(parsed.details).toContain('Phase 3: collected 1 recommendations');
		});
	});

	// Additional edge case: Invalid phase ID (non-positive)
	describe('Invalid phase ID handling', () => {
		it('skips non-positive phase IDs', async () => {
			mockPhaseBehavior = 'no-recommendations';

			const result = await runCuratorPipelineOnRetros(tempDir, [0, -1, 2]);
			const parsed = JSON.parse(result);

			expect(parsed.success).toBe(true);
			expect(parsed.phases_processed).toBe(1); // Only phase 2 was valid
			expect(mockPhaseCallCount).toBe(1); // Only phase 2 was actually processed
			expect(parsed.details).toContain(
				'Phase 0: skipped — must be positive integer >= 1',
			);
			expect(parsed.details).toContain(
				'Phase -1: skipped — must be positive integer >= 1',
			);
		});
	});

	// Edge case: null/undefined phaseIds
	describe('Null/undefined phaseIds handling', () => {
		it('treats null as empty array', async () => {
			const result = await runCuratorPipelineOnRetros(
				tempDir,
				null as unknown as number[],
			);
			const parsed = JSON.parse(result);

			expect(parsed.success).toBe(true);
			expect(parsed.phases_processed).toBe(0);
			expect(parsed.details).toEqual(['No phases to process']);
		});

		it('treats undefined as empty array', async () => {
			const result = await runCuratorPipelineOnRetros(
				tempDir,
				undefined as unknown as number[],
			);
			const parsed = JSON.parse(result);

			expect(parsed.success).toBe(true);
			expect(parsed.phases_processed).toBe(0);
			expect(parsed.details).toEqual(['No phases to process']);
		});
	});

	// Edge case: Curator disabled
	describe('Curator disabled via config', () => {
		it('returns early when curator is disabled', async () => {
			mockConfigEnabled = false;

			const result = await runCuratorPipelineOnRetros(tempDir, [1, 2, 3]);
			const parsed = JSON.parse(result);

			expect(parsed.success).toBe(true);
			expect(parsed.phases_processed).toBe(0);
			expect(parsed.details).toContain(
				'Curator disabled via config — skipping pipeline',
			);
			expect(mockPhaseCallCount).toBe(0);
		});
	});
});

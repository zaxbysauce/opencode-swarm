import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ToolContext } from '@opencode-ai/plugin';
import { curator_analyze } from './curator-analyze';

// Test utilities
function createTempDir(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'curator-analyze-test-'));
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

// Helper to call tool execute with proper context (bypasses strict type requirements for testing)
async function executeTool(
	args: Record<string, unknown>,
	directory: string,
): Promise<string> {
	return curator_analyze.execute(args, {
		directory,
	} as unknown as ToolContext);
}

// Mock modules before importing curator_analyze
mock.module('../hooks/curator.js', () => ({
	runCuratorPhase: mock(async () => ({
		phase: 1,
		digest: {
			phase: 1,
			timestamp: '2026-01-01',
			summary: 'Test digest',
			agents_used: ['coder'],
			tasks_completed: 2,
			tasks_total: 3,
			key_decisions: [],
			blockers_resolved: [],
		},
		compliance: [
			{
				phase: 1,
				timestamp: '2026-01-01',
				type: 'missing_reviewer',
				description: 'No reviewer dispatched',
				severity: 'warning',
			},
		],
		knowledge_recommendations: [],
		summary_updated: true,
	})),
	applyCuratorKnowledgeUpdates: mock(async () => ({ applied: 2, skipped: 0 })),
}));

mock.module('../config/index.js', () => ({
	loadPluginConfigWithMeta: mock(() => ({
		config: { curator: { enabled: true, phase_enabled: true } },
		meta: { path: '/tmp/test' },
	})),
}));

describe('curator_analyze tool', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir();
		createSwarmDir(tempDir);
	});

	afterEach(() => {
		cleanupDir(tempDir);
	});

	describe('Without recommendations', () => {
		it('returns phase_digest and compliance_count', async () => {
			const result = await executeTool({ phase: 1 }, tempDir);

			const parsed = JSON.parse(result);

			expect(parsed.phase_digest).toBeDefined();
			expect(parsed.phase_digest.phase).toBe(1);
			expect(parsed.phase_digest.summary).toBe('Test digest');
			expect(parsed.compliance_count).toBe(1);
			expect(parsed.applied).toBe(0);
			expect(parsed.skipped).toBe(0);
		});

		it('returns applied=0 and skipped=0 when no recommendations provided', async () => {
			const result = await executeTool({ phase: 1 }, tempDir);

			const parsed = JSON.parse(result);

			expect(parsed.applied).toBe(0);
			expect(parsed.skipped).toBe(0);
		});
	});

	describe('With recommendations', () => {
		it('calls applyCuratorKnowledgeUpdates and returns applied/skipped', async () => {
			const recommendations = [
				{
					action: 'promote' as const,
					lesson: 'Test lesson',
					reason: 'Test reason',
				},
			];

			const result = await executeTool({ phase: 1, recommendations }, tempDir);

			const parsed = JSON.parse(result);

			expect(parsed.applied).toBe(2);
			expect(parsed.skipped).toBe(0);
			expect(parsed.phase_digest).toBeDefined();
			expect(parsed.compliance_count).toBe(1);
		});
	});

	describe('Error handling', () => {
		it('returns error JSON format (verified via validation path) for invalid phase', async () => {
			// Error JSON format is verified by the validation path — phase < 1 triggers error return
			const result = await executeTool({ phase: -1 }, tempDir);
			const parsed = JSON.parse(result);
			// Error path returns {error: string} not {phase_digest, compliance_count}
			expect(parsed.error).toBeDefined();
			expect(parsed.phase_digest).toBeUndefined();
		});
	});

	describe('Arg schema validation', () => {
		it('phase must be >= 1', async () => {
			// phase=0 should be rejected by schema
			const result = await executeTool({ phase: 0 }, tempDir);

			// Schema validation should fail - result should indicate error
			const parsed = JSON.parse(result);
			expect(parsed.error || parsed.message).toBeDefined();
		});

		it('recommendations array must have valid action values', async () => {
			// Invalid action value should be rejected by schema
			const result = await executeTool(
				{
					phase: 1,
					recommendations: [
						{
							action: 'invalid_action' as unknown as 'promote',
							lesson: 'Test',
							reason: 'Test',
						},
					],
				},
				tempDir,
			);

			// Schema validation should fail
			const parsed = JSON.parse(result);
			expect(parsed.error || parsed.message).toBeDefined();
		});

		it('accepts valid phase number', async () => {
			const result = await executeTool({ phase: 5 }, tempDir);

			const parsed = JSON.parse(result);

			expect(parsed.phase_digest).toBeDefined();
			expect(parsed.error).toBeUndefined();
		});

		it('accepts valid recommendations with all action types', async () => {
			const recommendations = [
				{ action: 'promote', lesson: 'L1', reason: 'R1' },
				{ action: 'archive', entry_id: 'e1', lesson: 'L2', reason: 'R2' },
				{ action: 'flag_contradiction', lesson: 'L3', reason: 'R3' },
			];

			const result = await executeTool({ phase: 1, recommendations }, tempDir);

			const parsed = JSON.parse(result);

			expect(parsed.applied).toBe(2);
			expect(parsed.skipped).toBe(0);
		});
	});
});

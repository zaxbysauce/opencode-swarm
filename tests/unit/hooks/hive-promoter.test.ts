/**
 * Verification tests for hive-promoter.ts
 * Tests all three promotion routes and confirmation advancement logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock knowledge-store module
const mockResolveHiveKnowledgePath = vi.fn().mockReturnValue('/hive/shared-learnings.jsonl');
const mockResolveHiveRejectedPath = vi.fn().mockReturnValue('/hive/shared-learnings-rejected.jsonl');
const mockResolveSwarmKnowledgePath = vi.fn().mockReturnValue('/swarm/.swarm/knowledge.jsonl');
const mockReadKnowledge = vi.fn().mockResolvedValue([]);
const mockAppendKnowledge = vi.fn().mockResolvedValue(undefined);
const mockRewriteKnowledge = vi.fn().mockResolvedValue(undefined);
const mockFindNearDuplicate = vi.fn().mockReturnValue(undefined);

vi.mock('../../../src/hooks/knowledge-store.js', () => ({
	resolveHiveKnowledgePath: () => mockResolveHiveKnowledgePath(),
	resolveHiveRejectedPath: () => mockResolveHiveRejectedPath(),
	resolveSwarmKnowledgePath: (dir?: string) => mockResolveSwarmKnowledgePath(dir),
	readKnowledge: (path: string) => mockReadKnowledge(path),
	appendKnowledge: (path: string, data: unknown) => mockAppendKnowledge(path, data),
	rewriteKnowledge: (path: string, data: unknown) => mockRewriteKnowledge(path, data),
	findNearDuplicate: (lesson: string, entries: unknown[], threshold: number) => mockFindNearDuplicate(lesson, entries, threshold),
	computeConfidence: vi.fn().mockReturnValue(0.6),
}));

// Mock knowledge-validator module
const mockValidateLesson = vi.fn().mockReturnValue({
	valid: true,
	layer: 0,
	reason: '',
	severity: undefined,
});

vi.mock('../../../src/hooks/knowledge-validator.js', () => ({
	validateLesson: (lesson: string, existingLessons: string[], meta: unknown) => mockValidateLesson(lesson, existingLessons, meta),
}));

import {
	checkHivePromotions,
	createHivePromoterHook,
} from '../../../src/hooks/hive-promoter.js';
import type {
	HiveKnowledgeEntry,
	KnowledgeConfig,
	SwarmKnowledgeEntry,
} from '../../../src/hooks/knowledge-types.js';

describe('hive-promoter', () => {
	let mockConfig: KnowledgeConfig;
	let baseSwarmEntry: SwarmKnowledgeEntry;

	beforeEach(() => {
		vi.clearAllMocks();

		mockConfig = {
			hive_enabled: true,
			auto_promote_days: 90,
			dedup_threshold: 0.8,
			schema_version: 1,
			validation_enabled: true,
			rejected_max_entries: 20,
			enabled: true,
			swarm_max_entries: 100,
			hive_max_entries: 200,
			max_inject_count: 5,
			scope_filter: ['global'],
			evergreen_confidence: 0.9,
			evergreen_utility: 0.8,
			low_utility_threshold: 0.3,
			min_retrievals_for_utility: 3,
		};

		baseSwarmEntry = {
			id: 'swarm-1',
			tier: 'swarm',
			lesson: 'Use bun for fast test execution',
			category: 'process',
			tags: ['testing', 'performance'],
			scope: 'global',
			confidence: 0.7,
			status: 'promoted',
			confirmed_by: [
				{ phase_number: 1, confirmed_at: '2026-01-01T00:00:00Z', project_name: 'projectA' },
				{ phase_number: 2, confirmed_at: '2026-01-02T00:00:00Z', project_name: 'projectA' },
				{ phase_number: 3, confirmed_at: '2026-01-03T00:00:00Z', project_name: 'projectA' },
			],
			retrieval_outcomes: { applied_count: 5, succeeded_after_count: 4, failed_after_count: 0 },
			schema_version: 1,
			created_at: new Date(Date.now() - 50 * 86400000).toISOString(),
			updated_at: new Date().toISOString(),
			hive_eligible: true,
			project_name: 'projectA',
		};

		// Default mocks
		mockReadKnowledge.mockResolvedValue([]);
		mockFindNearDuplicate.mockReturnValue(undefined);
		mockValidateLesson.mockReturnValue({
			valid: true,
			layer: 0,
			reason: '',
			severity: undefined,
		});
	});

	it('Route 1: confirmed-by-3-phases promotes to hive as candidate', async () => {
		// Arrange
		const swarmEntries: SwarmKnowledgeEntry[] = [
			{
				...baseSwarmEntry,
				id: 'swarm-1',
				hive_eligible: true,
				confirmed_by: [
					{ phase_number: 1, confirmed_at: '2026-01-01T00:00:00Z', project_name: 'projectA' },
					{ phase_number: 2, confirmed_at: '2026-01-02T00:00:00Z', project_name: 'projectA' },
					{ phase_number: 3, confirmed_at: '2026-01-03T00:00:00Z', project_name: 'projectA' },
				],
			},
		];

		mockReadKnowledge.mockResolvedValue([]);

		// Act
		await checkHivePromotions(swarmEntries, mockConfig);

		// Assert
		expect(mockAppendKnowledge).toHaveBeenCalledTimes(1);
		const hivePath = mockResolveHiveKnowledgePath();
		expect(mockAppendKnowledge).toHaveBeenCalledWith(hivePath, expect.any(Object));

		const hiveEntry = mockAppendKnowledge.mock.calls[0][1] as HiveKnowledgeEntry;
		expect(hiveEntry.tier).toBe('hive');
		expect(hiveEntry.status).toBe('candidate');
		expect(hiveEntry.confidence).toBe(0.5);
		expect(hiveEntry.confirmed_by).toEqual([]);
		expect(hiveEntry.source_project).toBe('projectA');
	});

	it('Route 1: hive_eligible but only 2 distinct phases does NOT promote', async () => {
		// Arrange
		const swarmEntries: SwarmKnowledgeEntry[] = [
			{
				...baseSwarmEntry,
				hive_eligible: true,
				confirmed_by: [
					{ phase_number: 1, confirmed_at: '2026-01-01T00:00:00Z', project_name: 'projectA' },
					{ phase_number: 2, confirmed_at: '2026-01-02T00:00:00Z', project_name: 'projectA' },
				],
			},
		];

		// Act
		await checkHivePromotions(swarmEntries, mockConfig);

		// Assert
		expect(mockAppendKnowledge).not.toHaveBeenCalled();
	});

	it('Route 2: fast-track tag promotes regardless of phase count', async () => {
		// Arrange
		const swarmEntries: SwarmKnowledgeEntry[] = [
			{
				...baseSwarmEntry,
				hive_eligible: undefined,
				tags: ['hive-fast-track', 'testing'],
				confirmed_by: [
					{ phase_number: 1, confirmed_at: '2026-01-01T00:00:00Z', project_name: 'projectA' },
				],
			},
		];

		// Act
		await checkHivePromotions(swarmEntries, mockConfig);

		// Assert
		expect(mockAppendKnowledge).toHaveBeenCalledTimes(1);
		const hiveEntry = mockAppendKnowledge.mock.calls[0][1] as HiveKnowledgeEntry;
		expect(hiveEntry.tier).toBe('hive');
		expect(hiveEntry.status).toBe('candidate');
	});

	it('Route 3: age-based promotes after auto_promote_days', async () => {
		// Arrange
		const swarmEntries: SwarmKnowledgeEntry[] = [
			{
				...baseSwarmEntry,
				hive_eligible: undefined,
				tags: ['testing'],
				confirmed_by: [
					{ phase_number: 1, confirmed_at: '2026-01-01T00:00:00Z', project_name: 'projectA' },
				],
				created_at: new Date(Date.now() - 100 * 86400000).toISOString(),
			},
		];

		mockConfig.auto_promote_days = 90;

		// Act
		await checkHivePromotions(swarmEntries, mockConfig);

		// Assert
		expect(mockAppendKnowledge).toHaveBeenCalledTimes(1);
		const hiveEntry = mockAppendKnowledge.mock.calls[0][1] as HiveKnowledgeEntry;
		expect(hiveEntry.tier).toBe('hive');
		expect(hiveEntry.status).toBe('candidate');
	});

	it('Route 3: entry NOT old enough is not age-promoted', async () => {
		// Arrange
		const swarmEntries: SwarmKnowledgeEntry[] = [
			{
				...baseSwarmEntry,
				hive_eligible: undefined,
				tags: ['testing'],
				confirmed_by: [
					{ phase_number: 1, confirmed_at: '2026-01-01T00:00:00Z', project_name: 'projectA' },
				],
				created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
			},
		];

		mockConfig.auto_promote_days = 90;

		// Act
		await checkHivePromotions(swarmEntries, mockConfig);

		// Assert
		expect(mockAppendKnowledge).not.toHaveBeenCalled();
	});

	it('Contradiction with high-confidence hive entry blocks promotion', async () => {
		// Arrange
		const existingHiveEntry: HiveKnowledgeEntry = {
			id: 'hive-1',
			tier: 'hive',
			lesson: 'Always use TypeScript strict mode',
			category: 'process',
			tags: ['typescript'],
			scope: 'global',
			confidence: 0.9,
			status: 'established',
			confirmed_by: [],
			retrieval_outcomes: { applied_count: 10, succeeded_after_count: 8, failed_after_count: 1 },
			schema_version: 1,
			created_at: '2026-01-01T00:00:00Z',
			updated_at: '2026-01-01T00:00:00Z',
			source_project: 'projectA',
		};

		const swarmEntries: SwarmKnowledgeEntry[] = [
			{
				...baseSwarmEntry,
				id: 'swarm-1',
				lesson: 'Never use TypeScript strict mode',
				hive_eligible: true,
				confirmed_by: [
					{ phase_number: 1, confirmed_at: '2026-01-01T00:00:00Z', project_name: 'projectA' },
					{ phase_number: 2, confirmed_at: '2026-01-02T00:00:00Z', project_name: 'projectA' },
					{ phase_number: 3, confirmed_at: '2026-01-03T00:00:00Z', project_name: 'projectA' },
				],
			},
		];

		mockReadKnowledge.mockResolvedValue([existingHiveEntry]);
		mockFindNearDuplicate.mockReturnValue(undefined); // Not a duplicate

		// Mock validateLesson to detect contradiction
		mockValidateLesson.mockReturnValue({
			valid: false,
			layer: 3,
			reason: 'Contradicts high-confidence hive entry',
			severity: 'error',
		});

		// Act
		await checkHivePromotions(swarmEntries, mockConfig);

		// Assert - should be rejected, not promoted
		const hiveRejectedPath = mockResolveHiveRejectedPath();
		expect(mockAppendKnowledge).toHaveBeenCalledWith(hiveRejectedPath, expect.objectContaining({
			lesson: 'Never use TypeScript strict mode',
			rejection_layer: 3,
		}));

		// Assert - NOT promoted to hive knowledge
		const hiveKnowledgePath = mockResolveHiveKnowledgePath();
		const appendCalls = mockAppendKnowledge.mock.calls.filter(
			(call) => call[0] === hiveKnowledgePath
		);
		expect(appendCalls).toHaveLength(0);
	});

	it('hive_enabled: false — no operations performed', async () => {
		// Arrange
		mockConfig.hive_enabled = false;
		const swarmEntries: SwarmKnowledgeEntry[] = [baseSwarmEntry];

		// Act
		await checkHivePromotions(swarmEntries, mockConfig);

		// Assert
		expect(mockReadKnowledge).not.toHaveBeenCalled();
		expect(mockAppendKnowledge).not.toHaveBeenCalled();
		expect(mockRewriteKnowledge).not.toHaveBeenCalled();
	});

	it('Project confirmation advancement: candidate to established after 3 distinct project names', async () => {
		// Arrange
		const existingHiveEntry: HiveKnowledgeEntry = {
			id: 'hive-1',
			tier: 'hive',
			lesson: 'Use bun for testing',
			category: 'process',
			tags: ['testing', 'performance'],
			scope: 'global',
			confidence: 0.5,
			status: 'candidate',
			confirmed_by: [
				{ project_name: 'projectA', confirmed_at: '2026-01-01T00:00:00Z' },
				{ project_name: 'projectB', confirmed_at: '2026-01-02T00:00:00Z' },
			],
			retrieval_outcomes: { applied_count: 5, succeeded_after_count: 4, failed_after_count: 0 },
			schema_version: 1,
			created_at: '2026-01-01T00:00:00Z',
			updated_at: '2026-01-01T00:00:00Z',
			source_project: 'projectA',
		};

		const swarmEntries: SwarmKnowledgeEntry[] = [
			{
				...baseSwarmEntry,
				id: 'swarm-1',
				project_name: 'projectC',
				lesson: 'Use bun for testing', // Near-duplicate
			},
		];

		mockReadKnowledge.mockResolvedValue([existingHiveEntry]);

		// Mock findNearDuplicate behavior:
		// First call (isAlreadyInHive): returns undefined (not in hive)
		// Second call (confirmation pass): returns the swarm entry from projectC
		mockFindNearDuplicate
			.mockReturnValueOnce(undefined) // isAlreadyInHive - swarm not in hive yet
			.mockReturnValueOnce(swarmEntries[0]); // confirmation pass - near-duplicate found

		// Act
		await checkHivePromotions(swarmEntries, mockConfig);

		// Assert
		expect(mockRewriteKnowledge).toHaveBeenCalledTimes(1);
		const hivePath = mockResolveHiveKnowledgePath();
		expect(mockRewriteKnowledge).toHaveBeenCalledWith(hivePath, expect.any(Array));

		const updatedHive = mockRewriteKnowledge.mock.calls[0][1] as HiveKnowledgeEntry[];
		const updatedEntry = updatedHive.find((e) => e.id === 'hive-1');
		expect(updatedEntry).toBeDefined();
		expect(updatedEntry!.status).toBe('established');
		expect(updatedEntry!.confirmed_by).toHaveLength(3);
		expect(updatedEntry!.confirmed_by).toContainEqual({ project_name: 'projectC', confirmed_at: expect.any(String) });
	});

	it('No double-count: same project in hive entry confirmed_by is not added again', async () => {
		// Arrange
		const existingHiveEntry: HiveKnowledgeEntry = {
			id: 'hive-1',
			tier: 'hive',
			lesson: 'Use bun for testing',
			category: 'process',
			tags: ['testing', 'performance'],
			scope: 'global',
			confidence: 0.5,
			status: 'candidate',
			confirmed_by: [
				{ project_name: 'projectB', confirmed_at: '2026-01-02T00:00:00Z' },
			],
			retrieval_outcomes: { applied_count: 5, succeeded_after_count: 4, failed_after_count: 0 },
			schema_version: 1,
			created_at: '2026-01-01T00:00:00Z',
			updated_at: '2026-01-01T00:00:00Z',
			source_project: 'projectA',
		};

		const swarmEntries: SwarmKnowledgeEntry[] = [
			{
				...baseSwarmEntry,
				id: 'swarm-1',
				project_name: 'projectB', // Same as existing confirmation
				lesson: 'Use bun for testing', // Near-duplicate
			},
		];

		mockReadKnowledge.mockResolvedValue([existingHiveEntry]);

		// Mock findNearDuplicate:
		// First call: undefined (not in hive)
		// Second call: swarm entry from projectB (same project)
		mockFindNearDuplicate
			.mockReturnValueOnce(undefined)
			.mockReturnValueOnce(swarmEntries[0]);

		// Act
		await checkHivePromotions(swarmEntries, mockConfig);

		// Assert - should NOT rewrite since no modification
		expect(mockRewriteKnowledge).not.toHaveBeenCalled();
	});

	it('Already-in-hive entry is skipped (dedup)', async () => {
		// Arrange
		const existingHiveEntry: HiveKnowledgeEntry = {
			id: 'hive-1',
			tier: 'hive',
			lesson: 'Use bun for testing',
			category: 'process',
			tags: ['testing', 'performance'],
			scope: 'global',
			confidence: 0.5,
			status: 'candidate',
			confirmed_by: [],
			retrieval_outcomes: { applied_count: 5, succeeded_after_count: 4, failed_after_count: 0 },
			schema_version: 1,
			created_at: '2026-01-01T00:00:00Z',
			updated_at: '2026-01-01T00:00:00Z',
			source_project: 'projectA',
		};

		const swarmEntries: SwarmKnowledgeEntry[] = [
			{
				...baseSwarmEntry,
				hive_eligible: true,
				confirmed_by: [
					{ phase_number: 1, confirmed_at: '2026-01-01T00:00:00Z', project_name: 'projectB' },
					{ phase_number: 2, confirmed_at: '2026-01-02T00:00:00Z', project_name: 'projectB' },
					{ phase_number: 3, confirmed_at: '2026-01-03T00:00:00Z', project_name: 'projectB' },
				],
			},
		];

		mockReadKnowledge.mockResolvedValue([existingHiveEntry]);

		// findNearDuplicate returns the hive entry (already in hive)
		mockFindNearDuplicate.mockReturnValue(existingHiveEntry);

		// Act
		await checkHivePromotions(swarmEntries, mockConfig);

		// Assert - should NOT append (skipped as duplicate)
		const hivePath = mockResolveHiveKnowledgePath();
		const appendCalls = mockAppendKnowledge.mock.calls.filter(
			(call) => call[0] === hivePath
		);
		expect(appendCalls).toHaveLength(0);
	});

	it('createHivePromoterHook: reads swarm entries and calls checkHivePromotions', async () => {
		// Arrange
		const mockSwarmEntries: SwarmKnowledgeEntry[] = [baseSwarmEntry];
		const hiveEntries: HiveKnowledgeEntry[] = [];

		mockReadKnowledge
			.mockResolvedValueOnce(mockSwarmEntries) // For swarm entries
			.mockResolvedValueOnce(hiveEntries); // For hive entries

		// Mock resolveSwarmKnowledgePath to return proper path
		mockResolveSwarmKnowledgePath.mockReturnValue('/project/.swarm/knowledge.jsonl');

		// Act
		const hook = createHivePromoterHook('/project', mockConfig);
		await hook({}, {});

		// Assert
		expect(mockReadKnowledge).toHaveBeenCalled();
		const swarmPath = '/project/.swarm/knowledge.jsonl';
		const swarmReadCalls = mockReadKnowledge.mock.calls.filter(
			(call) => call[0] === swarmPath
		);
		expect(swarmReadCalls.length).toBeGreaterThan(0);
	});
});

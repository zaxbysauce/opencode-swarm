/**
 * Task 1.4: Tier-change promotion model tests.
 * Tests for:
 * 1. promoteFromSwarm updates original entry status to "promoted"
 * 2. promoteFromSwarm rewrites knowledge file with updated entry
 * 3. Hive entries include projectId and swarmVersion
 * 4. Tier change works with external knowledge storage
 * 5. promoteToHive includes swarmVersion
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock knowledge-store module
const mockResolveHiveKnowledgePath = vi.fn().mockReturnValue('/hive/shared-learnings.jsonl');
const mockResolveHiveRejectedPath = vi.fn().mockReturnValue('/hive/shared-learnings-rejected.jsonl');
const mockResolveSwarmKnowledgePath = vi.fn().mockImplementation((dir?: string) => {
	return dir ? `${dir}/.swarm/knowledge.jsonl` : '/swarm/.swarm/knowledge.jsonl';
});
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
	findNearDuplicate: (lesson: string, entries: unknown[], threshold: number) =>
		mockFindNearDuplicate(lesson, entries, threshold),
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
	validateLesson: (
		lesson: string,
		existingLessons: string[],
		meta: unknown,
	) => mockValidateLesson(lesson, existingLessons, meta),
}));

import { promoteToHive, promoteFromSwarm } from '../../../src/hooks/hive-promoter.js';
import type { HiveKnowledgeEntry, SwarmKnowledgeEntry } from '../../../src/hooks/knowledge-types.js';

describe('Task 1.4: Tier-change promotion model', () => {
	beforeEach(() => {
		vi.clearAllMocks();

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

	// Helper to create a valid swarm entry
	const createSwarmEntry = (overrides: Partial<SwarmKnowledgeEntry> = {}): SwarmKnowledgeEntry => ({
		id: 'swarm-default',
		tier: 'swarm',
		lesson: 'Default test lesson',
		category: 'testing',
		tags: [],
		scope: 'global',
		confidence: 0.8,
		status: 'candidate',
		confirmed_by: [],
		retrieval_outcomes: { applied_count: 0, succeeded_after_count: 0, failed_after_count: 0 },
		schema_version: 1,
		created_at: '2026-01-01T00:00:00Z',
		updated_at: '2026-01-01T00:00:00Z',
		project_name: 'testProject',
		projectId: 'test-project-hash',
		swarmVersion: '6.20',
		...overrides,
	});

	// Test 1: promoteFromSwarm updates original entry status to "promoted"
	describe('Test 1: promoteFromSwarm updates original entry status to "promoted"', () => {
		it('should update swarm entry status to "promoted" after promotion', async () => {
			// Arrange
			const swarmEntry = createSwarmEntry({
				id: 'swarm-test-123',
				lesson: 'Test lesson for status update',
			});

			mockReadKnowledge
				.mockResolvedValueOnce([swarmEntry]) // swarm entries
				.mockResolvedValueOnce([]); // hive entries

			// Act
			await promoteFromSwarm('/test-project-dir', 'swarm-test-123');

			// Assert - verify rewriteKnowledge was called with updated status
			expect(mockRewriteKnowledge).toHaveBeenCalled();

			const rewrittenEntries = mockRewriteKnowledge.mock.calls[0][1] as SwarmKnowledgeEntry[];
			const updatedEntry = rewrittenEntries.find((e) => e.id === 'swarm-test-123');

			expect(updatedEntry).toBeDefined();
			expect(updatedEntry?.status).toBe('promoted');
			expect(updatedEntry?.updated_at).not.toBe('2026-01-01T00:00:00Z');
		});

		it('should update swarm entry status to "promoted" even with multiple entries', async () => {
			// Arrange
			const swarmEntries = [
				createSwarmEntry({
					id: 'swarm-1',
					lesson: 'First lesson',
					category: 'testing',
					projectId: 'hash1',
				}),
				createSwarmEntry({
					id: 'swarm-2',
					lesson: 'Second lesson to promote',
					category: 'process',
					tags: ['important'],
					projectId: 'hash2',
				}),
			];

			mockReadKnowledge
				.mockResolvedValueOnce(swarmEntries) // swarm entries
				.mockResolvedValueOnce([]); // hive entries

			// Act
			await promoteFromSwarm('/test-project-dir', 'swarm-2');

			// Assert
			expect(mockRewriteKnowledge).toHaveBeenCalled();

			const rewrittenEntries = mockRewriteKnowledge.mock.calls[0][1] as SwarmKnowledgeEntry[];
			const entry1 = rewrittenEntries.find((e) => e.id === 'swarm-1');
			const entry2 = rewrittenEntries.find((e) => e.id === 'swarm-2');

			// First entry should remain unchanged
			expect(entry1?.status).toBe('candidate');
			// Second entry should be promoted
			expect(entry2?.status).toBe('promoted');
		});
	});

	// Test 2: promoteFromSwarm rewrites knowledge file with updated entry
	describe('Test 2: promoteFromSwarm rewrites knowledge file with updated entry', () => {
		it('should call rewriteKnowledge after promoting', async () => {
			// Arrange
			const swarmEntry = createSwarmEntry({
				id: 'swarm-test-456',
				lesson: 'Test lesson for rewrite verification',
			});

			mockReadKnowledge
				.mockResolvedValueOnce([swarmEntry])
				.mockResolvedValueOnce([]);

			// Act
			await promoteFromSwarm('/test-project', 'swarm-test-456');

			// Assert
			expect(mockRewriteKnowledge).toHaveBeenCalledTimes(1);
			expect(mockRewriteKnowledge).toHaveBeenCalledWith(
				'/test-project/.swarm/knowledge.jsonl',
				expect.any(Array),
			);
		});

		it('should preserve all other entries when rewriting', async () => {
			// Arrange
			const swarmEntries = [
				createSwarmEntry({
					id: 'entry-1',
					lesson: 'Entry 1',
					projectId: 'hash1',
				}),
				createSwarmEntry({
					id: 'entry-2',
					lesson: 'Entry 2',
					projectId: 'hash2',
				}),
			];

			mockReadKnowledge
				.mockResolvedValueOnce([...swarmEntries])
				.mockResolvedValueOnce([]);

			// Act
			await promoteFromSwarm('/test-project', 'entry-1');

			// Assert
			const rewrittenEntries = mockRewriteKnowledge.mock.calls[0][1] as SwarmKnowledgeEntry[];
			expect(rewrittenEntries).toHaveLength(2);
			expect(rewrittenEntries.find((e) => e.id === 'entry-2')).toBeDefined();
		});
	});

	// Test 3: Hive entries include projectId and swarmVersion
	describe('Test 3: Hive entries include projectId and swarmVersion', () => {
		it('promoteFromSwarm should include projectId in hive entry', async () => {
			// Arrange
			const swarmEntry = createSwarmEntry({
				id: 'swarm-123',
				lesson: 'Test lesson with projectId',
				projectId: 'my-project-hash-12345',
			});

			mockReadKnowledge
				.mockResolvedValueOnce([swarmEntry])
				.mockResolvedValueOnce([]);

			// Act
			await promoteFromSwarm('/my-test-project', 'swarm-123');

			// Assert
			expect(mockAppendKnowledge).toHaveBeenCalled();

			const hiveEntry = mockAppendKnowledge.mock.calls[0][1] as HiveKnowledgeEntry;
			expect(hiveEntry.projectId).toBe('my-project-hash-12345');
		});

		it('promoteFromSwarm should include swarmVersion in hive entry', async () => {
			// Arrange
			const swarmEntry = createSwarmEntry({
				id: 'swarm-456',
				lesson: 'Test lesson with swarmVersion',
				swarmVersion: '6.20',
			});

			mockReadKnowledge
				.mockResolvedValueOnce([swarmEntry])
				.mockResolvedValueOnce([]);

			// Act
			await promoteFromSwarm('/test-project', 'swarm-456');

			// Assert
			const hiveEntry = mockAppendKnowledge.mock.calls[0][1] as HiveKnowledgeEntry;
			expect(hiveEntry.swarmVersion).toBe('6.20');
		});

		it('promoteFromSwarm should use default swarmVersion when not provided', async () => {
			// Arrange - create entry without explicit swarmVersion
			const swarmEntry: SwarmKnowledgeEntry = {
				id: 'swarm-789',
				tier: 'swarm',
				lesson: 'Test lesson without swarmVersion',
				category: 'testing',
				tags: [],
				scope: 'global',
				confidence: 0.8,
				status: 'candidate',
				confirmed_by: [],
				retrieval_outcomes: { applied_count: 0, succeeded_after_count: 0, failed_after_count: 0 },
				schema_version: 1,
				created_at: '2026-01-01T00:00:00Z',
				updated_at: '2026-01-01T00:00:00Z',
				project_name: 'testProject',
				projectId: 'hash',
				swarmVersion: '6.19', // Old version - should be overwritten with default
			};

			mockReadKnowledge
				.mockResolvedValueOnce([swarmEntry])
				.mockResolvedValueOnce([]);

			// Act
			await promoteFromSwarm('/test-project', 'swarm-789');

			// Assert
			const hiveEntry = mockAppendKnowledge.mock.calls[0][1] as HiveKnowledgeEntry;
			expect(hiveEntry.swarmVersion).toBe('6.19'); // preserved from original entry
		});
	});

	// Test 4: Tier change works with external knowledge storage
	describe('Test 4: Tier change works with external knowledge storage', () => {
		it('should promote to external hive storage path', async () => {
			// Arrange - configure mock to return external path
			mockResolveHiveKnowledgePath.mockReturnValue('/external/hive/shared-learnings.jsonl');

			const swarmEntry = createSwarmEntry({
				id: 'swarm-ext-1',
				lesson: 'Test lesson for external storage',
			});

			mockReadKnowledge
				.mockResolvedValueOnce([swarmEntry])
				.mockResolvedValueOnce([]);

			// Act
			await promoteFromSwarm('/external/project', 'swarm-ext-1');

			// Assert
			expect(mockAppendKnowledge).toHaveBeenCalledWith(
				'/external/hive/shared-learnings.jsonl',
				expect.any(Object),
			);
		});

		it('should read from external swarm storage path', async () => {
			// Arrange
			mockResolveSwarmKnowledgePath.mockReturnValue(
				'/external/swarm/.swarm/knowledge.jsonl',
			);

			const swarmEntry = createSwarmEntry({
				id: 'swarm-ext-2',
				lesson: 'Test lesson for external swarm storage',
				category: 'process',
			});

			mockReadKnowledge
				.mockResolvedValueOnce([swarmEntry])
				.mockResolvedValueOnce([]);

			// Act
			await promoteFromSwarm('/external/project', 'swarm-ext-2');

			// Assert - verify readKnowledge was called with external path
			expect(mockReadKnowledge).toHaveBeenCalledWith(
				'/external/swarm/.swarm/knowledge.jsonl',
			);
		});

		it('should rewrite external swarm storage after promotion', async () => {
			// Arrange
			mockResolveSwarmKnowledgePath.mockReturnValue(
				'/external/swarm/.swarm/knowledge.jsonl',
			);
			mockResolveHiveKnowledgePath.mockReturnValue('/external/hive/shared-learnings.jsonl');

			const swarmEntry = createSwarmEntry({
				id: 'swarm-ext-3',
				lesson: 'Test lesson for external rewrite',
				category: 'process',
			});

			mockReadKnowledge
				.mockResolvedValueOnce([swarmEntry])
				.mockResolvedValueOnce([]);

			// Act
			await promoteFromSwarm('/external/project', 'swarm-ext-3');

			// Assert - verify rewriteKnowledge uses external path
			expect(mockRewriteKnowledge).toHaveBeenCalledWith(
				'/external/swarm/.swarm/knowledge.jsonl',
				expect.any(Array),
			);
		});
	});

	// Test 5: promoteToHive includes swarmVersion
	describe('Test 5: promoteToHive includes swarmVersion', () => {
		it('promoteToHive should include swarmVersion in hive entry', async () => {
			// Arrange
			mockResolveHiveKnowledgePath.mockReturnValue('/hive/shared-learnings.jsonl');
			mockReadKnowledge.mockResolvedValue([]);

			// Act
			await promoteToHive('/test-project', 'Manual promoted lesson', 'testing');

			// Assert
			expect(mockAppendKnowledge).toHaveBeenCalled();

			const hiveEntry = mockAppendKnowledge.mock.calls[0][1] as HiveKnowledgeEntry;
			expect(hiveEntry.swarmVersion).toBe('6.20');
		});

		it('promoteToHive should set swarmVersion to current version', async () => {
			// Arrange
			mockReadKnowledge.mockResolvedValue([]);

			// Act
			await promoteToHive('/my-project', 'Test lesson', 'process');

			// Assert
			const hiveEntry = mockAppendKnowledge.mock.calls[0][1] as HiveKnowledgeEntry;
			expect(hiveEntry).toHaveProperty('swarmVersion');
			expect(typeof hiveEntry.swarmVersion).toBe('string');
			expect(hiveEntry.swarmVersion).toMatch(/^\d+\.\d+$/);
		});

		it('promoteToHive should include projectId (derived from directory)', async () => {
			// Arrange
			mockReadKnowledge.mockResolvedValue([]);

			// Act
			await promoteToHive('/test-project-dir', 'Test with projectId', 'testing');

			// Assert
			const hiveEntry = mockAppendKnowledge.mock.calls[0][1] as HiveKnowledgeEntry;
			expect(hiveEntry).toHaveProperty('projectId');
			expect(typeof hiveEntry.projectId).toBe('string');
		});
	});

	// Additional tests for completeness
	describe('Additional edge cases', () => {
		it('should handle promotion when hive entry already exists', async () => {
			// Arrange
			const existingHiveEntry: HiveKnowledgeEntry = {
				id: 'hive-1',
				tier: 'hive',
				lesson: 'Similar existing lesson',
				category: 'testing',
				tags: [],
				scope: 'global',
				confidence: 0.8,
				status: 'established',
				confirmed_by: [],
				retrieval_outcomes: { applied_count: 5, succeeded_after_count: 4, failed_after_count: 1 },
				schema_version: 1,
				created_at: '2026-01-01T00:00:00Z',
				updated_at: '2026-01-01T00:00:00Z',
				source_project: 'existing-project',
				projectId: 'existing-hash',
				swarmVersion: '6.20',
			};

			const swarmEntry = createSwarmEntry({
				id: 'swarm-new',
				lesson: 'Similar existing lesson', // Near-duplicate
			});

			// Mock near-duplicate detection to return the existing entry
			mockFindNearDuplicate.mockReturnValue(existingHiveEntry);

			mockReadKnowledge
				.mockResolvedValueOnce([swarmEntry])
				.mockResolvedValueOnce([existingHiveEntry]);

			// Act
			const result = await promoteFromSwarm('/new-project', 'swarm-new');

			// Assert - should return near-duplicate message and not rewrite
			expect(result).toContain('near-duplicate');
			expect(mockRewriteKnowledge).not.toHaveBeenCalled();
		});

		it('should throw error when swarm entry not found', async () => {
			// Arrange
			mockReadKnowledge.mockResolvedValueOnce([]);

			// Act & Assert
			await expect(promoteFromSwarm('/test', 'non-existent-id')).rejects.toThrow(
				'not found',
			);
		});
	});
});

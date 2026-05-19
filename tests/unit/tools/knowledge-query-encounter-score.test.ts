/**
 * Verification tests for formatHiveEntry() optional chaining fix (Task 1.2)
 *
 * Tests that formatHiveEntry handles missing/invalid encounter_score values gracefully
 * instead of crashing with TypeError when calling .toFixed() on undefined/null.
 *
 * Bug: entry.encounter_score.toFixed(2) crashes with TypeError when encounter_score
 * is undefined/null. Fix: entry.encounter_score?.toFixed(2) ?? 'N/A'
 *
 * Since formatHiveEntry is module-private, we test it indirectly by calling
 * knowledge_query.execute({ tier: 'hive' }) and mocking readKnowledge to return
 * our test entries.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { rmSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { HiveKnowledgeEntry } from '../../../src/hooks/knowledge-types';
import { knowledge_query } from '../../../src/tools/knowledge-query';

// Store original readKnowledge for spreading
let originalReadKnowledge: typeof import('../../../src/hooks/knowledge-store.js').readKnowledge;

describe('formatHiveEntry optional chaining fix — encounter_score null-safety (Task 1.2)', () => {
	let tmpDir: string;
	let originalCwd: string;

	beforeEach(async () => {
		tmpDir = await fs.realpath(
			await fs.mkdtemp(
				path.join(os.tmpdir(), 'knowledge-query-encounter-score-'),
			),
		);
		originalCwd = process.cwd();
		process.chdir(tmpDir);

		// Mock readKnowledge to return our test entries directly.
		// This bypasses the file-system path resolution which has a known isolation issue
		// with mock.module when tmpDir is undefined in beforeAll.
		// We store and spread the original so other exports (existsSync, etc.) still work.
		const realModule = await import('../../../src/hooks/knowledge-store.js');
		originalReadKnowledge = realModule.readKnowledge;

		const testEntries: HiveKnowledgeEntry[] = [];
		mock.module('../../../src/hooks/knowledge-store.js', () => ({
			...realModule,
			readKnowledge: async (filePath: string) => {
				// For the hive path (contains shared-learnings), return our test entries
				if (String(filePath).includes('shared-learnings')) {
					return testEntries;
				}
				// For all other paths (swarm knowledge), use real readKnowledge
				return originalReadKnowledge(filePath);
			},
		}));

		// Return testEntries via closure so tests can push to it
		(globalThis as Record<string, unknown>).__testHiveEntries = testEntries;
	});

	afterEach(async () => {
		process.chdir(originalCwd);
		try {
			await fs.rm(tmpDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
		mock.restore();
		delete (globalThis as Record<string, unknown>).__testHiveEntries;
	});

	function getTestEntries(): HiveKnowledgeEntry[] {
		return (globalThis as Record<string, unknown>)
			.__testHiveEntries as HiveKnowledgeEntry[];
	}

	// -------------------------------------------------------------------------
	// Test cases for encounter_score formatting
	// -------------------------------------------------------------------------

	describe('Encounter Score display — all variants', () => {
		it('encounter_score: 1.5 → displays "Encounter Score: 1.50"', async () => {
			const entry: HiveKnowledgeEntry = {
				id: 'hive-score-1',
				tier: 'hive',
				lesson: 'Lesson with score 1.5',
				category: 'process',
				tags: [],
				scope: 'global',
				confidence: 0.8,
				status: 'candidate',
				confirmed_by: [],
				retrieval_outcomes: {
					applied_count: 0,
					succeeded_after_count: 0,
					failed_after_count: 0,
				},
				schema_version: 2,
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T00:00:00Z',
				source_project: 'test-project',
				encounter_score: 1.5,
			};
			getTestEntries().push(entry);

			const result = await knowledge_query.execute({ tier: 'hive' });

			expect(result).toContain('Encounter Score: 1.50');
			expect(result).toContain('hive-score-1');
		});

		it('encounter_score: 0 → displays "Encounter Score: 0.00"', async () => {
			const entry: HiveKnowledgeEntry = {
				id: 'hive-score-zero',
				tier: 'hive',
				lesson: 'Lesson with score 0',
				category: 'testing',
				tags: [],
				scope: 'global',
				confidence: 0.5,
				status: 'candidate',
				confirmed_by: [],
				retrieval_outcomes: {
					applied_count: 0,
					succeeded_after_count: 0,
					failed_after_count: 0,
				},
				schema_version: 2,
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T00:00:00Z',
				source_project: 'test-project',
				encounter_score: 0,
			};
			getTestEntries().push(entry);

			const result = await knowledge_query.execute({ tier: 'hive' });

			expect(result).toContain('Encounter Score: 0.00');
		});

		it('encounter_score: null → displays "Encounter Score: N/A" (null-safety)', async () => {
			// Simulate an older JSONL entry where encounter_score is stored as null
			// (before the field was mandatory). JSON.parse('null') returns null.
			const entryWithNullScore: HiveKnowledgeEntry = {
				id: 'hive-score-null',
				tier: 'hive',
				lesson: 'Lesson with null score',
				category: 'process',
				tags: [],
				scope: 'global',
				confidence: 0.7,
				status: 'candidate',
				confirmed_by: [],
				retrieval_outcomes: {
					applied_count: 0,
					succeeded_after_count: 0,
					failed_after_count: 0,
				},
				schema_version: 1, // older schema version
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T00:00:00Z',
				source_project: 'legacy-project',
				encounter_score: null as unknown as number, // intentionally null at runtime
			};
			getTestEntries().push(entryWithNullScore);

			const result = await knowledge_query.execute({ tier: 'hive' });

			// Should NOT throw TypeError; should display N/A
			expect(result).toContain('Encounter Score: N/A');
			expect(result).toContain('hive-score-null');
		});

		it('encounter_score: NaN → displays "Encounter Score: NaN" (NaN.toFixed returns "NaN")', async () => {
			const entry: HiveKnowledgeEntry = {
				id: 'hive-score-nan',
				tier: 'hive',
				lesson: 'Lesson with NaN score',
				category: 'process',
				tags: [],
				scope: 'global',
				confidence: 0.6,
				status: 'candidate',
				confirmed_by: [],
				retrieval_outcomes: {
					applied_count: 0,
					succeeded_after_count: 0,
					failed_after_count: 0,
				},
				schema_version: 2,
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T00:00:00Z',
				source_project: 'test-project',
				encounter_score: NaN,
			};
			getTestEntries().push(entry);

			const result = await knowledge_query.execute({ tier: 'hive' });

			// NaN.toFixed(2) returns "NaN" — this is expected behavior
			expect(result).toContain('Encounter Score: NaN');
			expect(result).toContain('hive-score-nan');
		});

		it('encounter_score: 10.999 → displays "Encounter Score: 11.00" (toFixed rounds)', async () => {
			const entry: HiveKnowledgeEntry = {
				id: 'hive-score-rounds',
				tier: 'hive',
				lesson: 'Lesson with rounding score',
				category: 'process',
				tags: [],
				scope: 'global',
				confidence: 0.9,
				status: 'established',
				confirmed_by: [],
				retrieval_outcomes: {
					applied_count: 0,
					succeeded_after_count: 0,
					failed_after_count: 0,
				},
				schema_version: 2,
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T00:00:00Z',
				source_project: 'test-project',
				encounter_score: 10.999,
			};
			getTestEntries().push(entry);

			const result = await knowledge_query.execute({ tier: 'hive' });

			// 10.999.toFixed(2) rounds to "11.00"
			expect(result).toContain('Encounter Score: 11.00');
		});

		it('encounter_score: omitted (undefined via JSON missing field) → displays "Encounter Score: N/A"', async () => {
			// When a JSONL entry omits the encounter_score field, JSON.parse produces undefined.
			// We simulate this by constructing an object without the field.
			// TypeScript will complain, so we use a raw object cast.
			const rawEntry = {
				id: 'hive-score-missing',
				tier: 'hive' as const,
				lesson: 'Lesson with missing score field',
				category: 'process' as const,
				tags: [] as string[],
				scope: 'global' as const,
				confidence: 0.75,
				status: 'candidate' as const,
				confirmed_by: [] as unknown[],
				retrieval_outcomes: {
					applied_count: 0,
					succeeded_after_count: 0,
					failed_after_count: 0,
				},
				schema_version: 1, // older schema that may not have had encounter_score
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T00:00:00Z',
				source_project: 'legacy-project',
				// NOTE: encounter_score is intentionally omitted here
			};
			// Push as HiveKnowledgeEntry — TypeScript allows this because we cast
			getTestEntries().push(rawEntry as unknown as HiveKnowledgeEntry);

			const result = await knowledge_query.execute({ tier: 'hive' });

			// Should NOT throw; should display N/A for missing field
			expect(result).toContain('Encounter Score: N/A');
			expect(result).toContain('hive-score-missing');
		});
	});

	describe('Multiple entries — mixed encounter_score values', () => {
		it('handles a mix of valid and null/undefined scores in the same query', async () => {
			// Entry 1: valid score
			getTestEntries().push({
				id: 'hive-valid',
				tier: 'hive',
				lesson: 'Valid score lesson',
				category: 'process',
				tags: [],
				scope: 'global',
				confidence: 0.8,
				status: 'candidate',
				confirmed_by: [],
				retrieval_outcomes: {
					applied_count: 0,
					succeeded_after_count: 0,
					failed_after_count: 0,
				},
				schema_version: 2,
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T00:00:00Z',
				source_project: 'test-project',
				encounter_score: 2.5,
			});

			// Entry 2: null score (legacy entry)
			getTestEntries().push({
				id: 'hive-null-score',
				tier: 'hive',
				lesson: 'Null score lesson',
				category: 'process',
				tags: [],
				scope: 'global',
				confidence: 0.7,
				status: 'candidate',
				confirmed_by: [],
				retrieval_outcomes: {
					applied_count: 0,
					succeeded_after_count: 0,
					failed_after_count: 0,
				},
				schema_version: 1,
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T00:00:00Z',
				source_project: 'legacy-project',
				encounter_score: null as unknown as number,
			});

			// Entry 3: missing score field (old entry)
			getTestEntries().push({
				id: 'hive-missing-score',
				tier: 'hive',
				lesson: 'Missing score lesson',
				category: 'process',
				tags: [],
				scope: 'global',
				confidence: 0.6,
				status: 'candidate',
				confirmed_by: [],
				retrieval_outcomes: {
					applied_count: 0,
					succeeded_after_count: 0,
					failed_after_count: 0,
				},
				schema_version: 1,
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T00:00:00Z',
				source_project: 'legacy-project',
				// encounter_score intentionally missing
			} as unknown as HiveKnowledgeEntry);

			const result = await knowledge_query.execute({ tier: 'hive' });

			// All three entries should appear without crashing
			expect(result).toContain('hive-valid');
			expect(result).toContain('hive-null-score');
			expect(result).toContain('hive-missing-score');

			// Valid score shows formatted number
			expect(result).toContain('Encounter Score: 2.50');
			// Null/missing show N/A
			expect(result).toContain('Encounter Score: N/A');
		});
	});
});

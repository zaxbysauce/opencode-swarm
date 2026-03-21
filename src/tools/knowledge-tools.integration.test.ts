import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	appendKnowledge,
	jaccardBigram,
	normalize,
	readKnowledge,
	resolveSwarmKnowledgePath,
	rewriteKnowledge,
	wordBigrams,
} from '../hooks/knowledge-store';
import type { SwarmKnowledgeEntry } from '../hooks/knowledge-types';

function makeEntry(
	overrides: Partial<SwarmKnowledgeEntry> & { id: string; lesson: string },
): SwarmKnowledgeEntry {
	return {
		tier: 'swarm',
		category: 'process',
		tags: [],
		scope: 'global',
		confidence: 0.5,
		status: 'candidate',
		confirmed_by: [],
		project_name: 'test-project',
		retrieval_outcomes: {
			applied_count: 0,
			succeeded_after_count: 0,
			failed_after_count: 0,
		},
		schema_version: 1,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		auto_generated: true,
		hive_eligible: false,
		...overrides,
	};
}

describe('Knowledge tools integration', () => {
	let tmpDir: string;
	let knowledgePath: string;

	beforeEach(() => {
		tmpDir = join(
			tmpdir(),
			'swarm-knowledge-test-' +
				Date.now() +
				'-' +
				Math.random().toString(36).slice(2),
		);
		mkdirSync(tmpDir, { recursive: true });
		knowledgePath = resolveSwarmKnowledgePath(tmpDir);
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it('add → recall → remove lifecycle', async () => {
		const entry: SwarmKnowledgeEntry = makeEntry({
			id: 'test-id-001',
			lesson: 'Always validate user input before processing requests',
			category: 'security',
			tags: ['security', 'validation'],
		});

		await appendKnowledge(knowledgePath, entry);

		const entries = await readKnowledge<SwarmKnowledgeEntry>(knowledgePath);
		expect(entries).toHaveLength(1);
		expect(entries[0].id).toBe(entry.id);
		expect(entries[0].lesson).toBe(entry.lesson);

		const remaining = entries.filter((e) => e.id !== entry.id);
		await rewriteKnowledge(knowledgePath, remaining);

		const afterRemove = await readKnowledge<SwarmKnowledgeEntry>(knowledgePath);
		expect(afterRemove).toHaveLength(0);
	});

	it('recall scoring ranks relevant entry highest', async () => {
		const entries: SwarmKnowledgeEntry[] = [
			makeEntry({
				id: '1',
				lesson: 'Always perform input validation on user submitted data',
				category: 'process',
				tags: ['security', 'validation'],
			}),
			makeEntry({
				id: '2',
				lesson: 'Use CSS grid for complex layouts instead of flexbox',
				category: 'tooling',
				tags: ['css', 'layout'],
			}),
			makeEntry({
				id: '3',
				lesson: 'Never hardcode API keys in source code repositories',
				category: 'security',
				tags: ['security', 'api'],
			}),
			makeEntry({
				id: '2',
				lesson: 'Use CSS grid for complex layouts instead of flexbox',
				category: 'tooling',
				tags: ['css', 'layout'],
			}),
			makeEntry({
				id: '3',
				lesson: 'Never hardcode API keys in source code',
				category: 'security',
				tags: ['security', 'api'],
			}),
		];

		for (const e of entries) {
			await appendKnowledge(knowledgePath, e);
		}

		const query = normalize('input validation');
		const queryBigrams = wordBigrams(query);

		const scores = entries.map((e) => {
			const text = `${e.lesson} ${e.tags.join(' ')} ${e.category}`;
			return {
				id: e.id,
				score: jaccardBigram(queryBigrams, wordBigrams(text)),
			};
		});

		expect(scores[0].score).toBeGreaterThan(scores[1].score);
		expect(scores[0].score).toBeGreaterThan(scores[2].score);
	});

	it('empty knowledge store returns empty recall results', async () => {
		const entries = await readKnowledge<SwarmKnowledgeEntry>(knowledgePath);
		expect(entries).toHaveLength(0);
	});

	it('double deletion is idempotent', async () => {
		const entry: SwarmKnowledgeEntry = makeEntry({
			id: 'test-id-002',
			lesson: 'Test lesson for idempotent deletion',
			category: 'process',
		});

		await appendKnowledge(knowledgePath, entry);

		let entries = await readKnowledge<SwarmKnowledgeEntry>(knowledgePath);
		expect(entries).toHaveLength(1);

		await rewriteKnowledge(
			knowledgePath,
			entries.filter((e) => e.id !== entry.id),
		);

		entries = await readKnowledge<SwarmKnowledgeEntry>(knowledgePath);
		expect(entries).toHaveLength(0);

		await rewriteKnowledge(
			knowledgePath,
			entries.filter((e) => e.id !== entry.id),
		);

		entries = await readKnowledge<SwarmKnowledgeEntry>(knowledgePath);
		expect(entries).toHaveLength(0);
	});

	it('add multiple entries preserves order and content', async () => {
		const entries: SwarmKnowledgeEntry[] = [
			makeEntry({ id: 'multi-1', lesson: 'First lesson', category: 'process' }),
			makeEntry({
				id: 'multi-2',
				lesson: 'Second lesson',
				category: 'tooling',
			}),
			makeEntry({
				id: 'multi-3',
				lesson: 'Third lesson',
				category: 'security',
			}),
		];

		for (const e of entries) {
			await appendKnowledge(knowledgePath, e);
		}

		const read = await readKnowledge<SwarmKnowledgeEntry>(knowledgePath);
		expect(read).toHaveLength(3);
		expect(read.map((e) => e.id)).toEqual(['multi-1', 'multi-2', 'multi-3']);
		expect(read.map((e) => e.lesson)).toEqual([
			'First lesson',
			'Second lesson',
			'Third lesson',
		]);
	});
});

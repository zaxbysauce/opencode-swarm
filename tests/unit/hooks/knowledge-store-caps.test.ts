/**
 * Tests for enforceKnowledgeCap in src/hooks/knowledge-store.ts
 *
 * Verifies that swarm_max_entries and hive_max_entries caps are enforced
 * via FIFO truncation. Previously this function did not exist and caps
 * were silently ignored.
 *
 * Covers:
 * 1. No-op when entries are under the cap
 * 2. No-op at exactly the cap
 * 3. FIFO truncation when over the cap
 * 4. Preserves newest N entries (tail kept, head dropped)
 * 5. Large over-limit case (200 entries, cap 100 → 100 newest kept)
 * 6. Cap of 1 keeps only the last entry
 * 7. Non-existent file returns without error
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	appendKnowledge,
	enforceKnowledgeCap,
	readKnowledge,
} from '../../../src/hooks/knowledge-store.js';

// ============================================================================
// Helpers
// ============================================================================

interface TestEntry {
	id: number;
	lesson: string;
}

let tmpDir: string;
let testFile: string;

beforeEach(() => {
	tmpDir = path.join(
		os.tmpdir(),
		`caps-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	fs.mkdirSync(tmpDir, { recursive: true });
	testFile = path.join(tmpDir, 'knowledge.jsonl');
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function writeEntries(count: number): Promise<TestEntry[]> {
	const entries: TestEntry[] = [];
	for (let i = 0; i < count; i++) {
		const entry: TestEntry = { id: i, lesson: `lesson-${i}` };
		entries.push(entry);
		await appendKnowledge(testFile, entry);
	}
	return entries;
}

// ============================================================================
// Tests
// ============================================================================

describe('enforceKnowledgeCap', () => {
	it('is a no-op when entry count is under the cap', async () => {
		await writeEntries(5);
		await enforceKnowledgeCap<TestEntry>(testFile, 10);

		const entries = await readKnowledge<TestEntry>(testFile);
		expect(entries).toHaveLength(5);
		expect(entries.map((e) => e.id)).toEqual([0, 1, 2, 3, 4]);
	});

	it('is a no-op when entry count equals the cap exactly', async () => {
		await writeEntries(10);
		await enforceKnowledgeCap<TestEntry>(testFile, 10);

		const entries = await readKnowledge<TestEntry>(testFile);
		expect(entries).toHaveLength(10);
	});

	it('truncates to cap when over-limit (FIFO: oldest dropped)', async () => {
		await writeEntries(15);
		await enforceKnowledgeCap<TestEntry>(testFile, 10);

		const entries = await readKnowledge<TestEntry>(testFile);
		expect(entries).toHaveLength(10);
		// Newest 10 entries (ids 5-14) should be kept
		expect(entries[0].id).toBe(5);
		expect(entries[9].id).toBe(14);
	});

	it('preserves the newest N entries when truncating', async () => {
		await writeEntries(20);
		await enforceKnowledgeCap<TestEntry>(testFile, 5);

		const entries = await readKnowledge<TestEntry>(testFile);
		expect(entries).toHaveLength(5);
		// Last 5 entries (ids 15-19) must survive
		const ids = entries.map((e) => e.id);
		expect(ids).toEqual([15, 16, 17, 18, 19]);
	});

	it('handles large over-limit: 200 entries with cap 100 → 100 newest kept', async () => {
		await writeEntries(200);
		await enforceKnowledgeCap<TestEntry>(testFile, 100);

		const entries = await readKnowledge<TestEntry>(testFile);
		expect(entries).toHaveLength(100);
		expect(entries[0].id).toBe(100);
		expect(entries[99].id).toBe(199);
	});

	it('cap of 1 retains only the most recent entry', async () => {
		await writeEntries(10);
		await enforceKnowledgeCap<TestEntry>(testFile, 1);

		const entries = await readKnowledge<TestEntry>(testFile);
		expect(entries).toHaveLength(1);
		expect(entries[0].id).toBe(9); // last appended
	});

	it('does not error when file does not exist', async () => {
		const nonExistent = path.join(tmpDir, 'ghost.jsonl');
		await expect(
			enforceKnowledgeCap<TestEntry>(nonExistent, 10),
		).resolves.toBeUndefined();
	});

	it('cap enforcement is idempotent — running twice does not over-truncate', async () => {
		await writeEntries(25);
		await enforceKnowledgeCap<TestEntry>(testFile, 10);
		await enforceKnowledgeCap<TestEntry>(testFile, 10); // second run

		const entries = await readKnowledge<TestEntry>(testFile);
		expect(entries).toHaveLength(10);
		expect(entries[0].id).toBe(15);
		expect(entries[9].id).toBe(24);
	});
});

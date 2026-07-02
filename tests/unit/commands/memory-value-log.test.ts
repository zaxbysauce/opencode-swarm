/**
 * A.8 — /swarm memory value-log functional coverage (SC-009).
 *
 * Mirrors the temp-dir + provider setup used by tests/unit/commands/memory.test.ts:
 * a fresh mkdtemp-backed `.swarm` project directory per test, real
 * SQLiteMemoryProvider/LocalJsonlMemoryProvider instances (no module mocking),
 * and explicit provider.close() before the directory is removed so Windows
 * does not hit EBUSY while a SQLite handle is still open.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { handleMemoryValueLogCommand } from '../../../src/commands/memory';
import {
	computeMemoryContentHash,
	createMemoryId,
	LocalJsonlMemoryProvider,
	type MemoryRecord,
	SQLiteMemoryProvider,
} from '../../../src/memory';
// `handleMemoryValueLogCommand` resolves its own SQLite provider through the
// process-level pool (src/memory/provider-pool.ts). Pooled providers are NOT
// really closed by provider.close() — it only decrements a refcount so the
// connection can be reused — so the underlying DB file handle stays open
// after the command returns. On Windows this holds a lock that makes
// `fs.rm(tmpDir, { recursive: true })` fail with EBUSY. clearPool() forces a
// real close of every pooled connection; call it before removing the temp
// dir (mirrors src/memory/provider-pool.test.ts's afterEach usage).
import { clearPool } from '../../../src/memory/provider-pool';

let tmpDir: string;
let originalXdgConfigHome: string | undefined;

beforeEach(async () => {
	originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
	tmpDir = await fs.realpath(
		await fs.mkdtemp(path.join(os.tmpdir(), 'swarm-memory-value-log-')),
	);
	process.env.XDG_CONFIG_HOME = path.join(tmpDir, 'xdg-config');
});

afterEach(async () => {
	if (originalXdgConfigHome === undefined) {
		delete process.env.XDG_CONFIG_HOME;
	} else {
		process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
	}
	clearPool();
	await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeRecord(
	text: string,
	overrides: Partial<MemoryRecord> = {},
): MemoryRecord {
	const base = {
		scope: {
			type: 'repository' as const,
			repoId: 'repo-a',
			repoRoot: path.join(tmpDir, 'repo-a'),
		},
		kind: 'repo_convention' as const,
		text,
	};
	return {
		id: createMemoryId(base),
		...base,
		tags: ['memory'],
		confidence: 0.9,
		stability: 'durable',
		source: { type: 'file', filePath: 'README.md' },
		createdAt: '2026-05-25T12:00:00.000Z',
		updatedAt: '2026-05-25T12:00:00.000Z',
		contentHash: computeMemoryContentHash(base),
		metadata: {},
		...overrides,
	};
}

describe('/swarm memory value-log', () => {
	test('renders per-memory q-value and recent reward history', async () => {
		const provider = new SQLiteMemoryProvider(tmpDir, {
			enabled: true,
			provider: 'sqlite',
		});
		const record = makeRecord('Value-log renders this memory q + rewards.', {
			metadata: { qValue: 0.62 },
		});
		try {
			await provider.upsert(record);
			await provider.appendRewardEvent({
				memoryId: record.id,
				runId: 'session-a',
				verdict: 'APPROVE',
				reward: 1,
				qBefore: 0.5,
				qAfter: 0.62,
				timestamp: '2026-05-25T12:00:00.000Z',
			});
		} finally {
			provider.close();
		}

		const output = await handleMemoryValueLogCommand(tmpDir, []);

		expect(output).toContain('## Swarm Memory Value Log');
		expect(output).toContain('- Reward events scanned: `1`');
		expect(output).toContain('- Memories with reward history shown: `1`');
		expect(output).toContain(record.id);
		// currentQ is read from the STORED record (metadata.qValue=0.62), not the
		// reward event's qAfter — proves the handler re-reads live record state
		// rather than only echoing the event payload.
		expect(output).toContain(`\`${record.id}\` q=0.620 [neutral]`);
		expect(output).toContain(
			'2026-05-25T12:00:00.000Z APPROVE reward=1.00 (q 0.50→0.62)',
		);
	});

	test('labels candidacy as suppressed / promotion candidate / neutral against config thresholds', async () => {
		const provider = new SQLiteMemoryProvider(tmpDir, {
			enabled: true,
			provider: 'sqlite',
		});
		// Default qLearning thresholds: suppressionThreshold=0.15, promotionThreshold=0.85.
		const suppressed = makeRecord('Suppressed low-utility memory.', {
			metadata: { qValue: 0.05 },
		});
		const promotion = makeRecord('High-utility promotion candidate memory.', {
			metadata: { qValue: 0.95 },
		});
		const neutral = makeRecord('Mid-utility neutral memory.', {
			metadata: { qValue: 0.5 },
		});
		try {
			await provider.upsert(suppressed);
			await provider.upsert(promotion);
			await provider.upsert(neutral);
			for (const rec of [suppressed, promotion, neutral]) {
				await provider.appendRewardEvent({
					memoryId: rec.id,
					verdict: 'APPROVE',
					reward: 1,
					timestamp: '2026-05-25T12:00:00.000Z',
				});
			}
		} finally {
			provider.close();
		}

		const output = await handleMemoryValueLogCommand(tmpDir, []);

		expect(output).toContain(
			`\`${suppressed.id}\` q=0.050 [suppressed (low learned-utility)]`,
		);
		expect(output).toContain(
			`\`${promotion.id}\` q=0.950 [promotion candidate]`,
		);
		expect(output).toContain(`\`${neutral.id}\` q=0.500 [neutral]`);
	});

	test('--limit caps the number of memories shown to the most recent N by reward timestamp', async () => {
		const provider = new SQLiteMemoryProvider(tmpDir, {
			enabled: true,
			provider: 'sqlite',
		});
		const records = Array.from({ length: 5 }, (_, i) =>
			makeRecord(`Limit-test memory number ${i}.`),
		);
		try {
			for (const [i, rec] of records.entries()) {
				await provider.upsert(rec);
				await provider.appendRewardEvent({
					memoryId: rec.id,
					verdict: 'APPROVE',
					reward: 0.5,
					timestamp: `2026-06-01T0${i}:00:00.000Z`,
				});
			}
		} finally {
			provider.close();
		}

		const output = await handleMemoryValueLogCommand(tmpDir, ['--limit', '2']);

		expect(output).toContain('- Memories with reward history shown: `2`');
		// Reward events are read most-recent-first, so the 2 shown must be the
		// two with the latest timestamps (index 4 and 3).
		expect(output).toContain(records[4].id);
		expect(output).toContain(records[3].id);
		expect(output).not.toContain(records[2].id);
		expect(output).not.toContain(records[1].id);
		expect(output).not.toContain(records[0].id);
	});

	test('degrades gracefully with no thrown error when no reward history exists yet', async () => {
		// No provider seeded at all — handler lazily creates its own sqlite
		// provider against a fresh, empty database file.
		const output = await handleMemoryValueLogCommand(tmpDir, []);

		expect(output).toContain('## Swarm Memory Value Log');
		expect(output).toContain('- Reward events scanned: `0`');
		expect(output).toContain('- No reward history recorded yet.');
	});

	test('usage error on non-numeric --limit', async () => {
		const output = await handleMemoryValueLogCommand(tmpDir, [
			'--limit',
			'not-a-number',
		]);

		expect(output).toBe('Usage: /swarm memory value-log [--limit <n>]');
	});

	test('jsonl provider: q-value and reward history render via the reward-events sidecar file', async () => {
		await fs.mkdir(path.join(tmpDir, '.opencode'), { recursive: true });
		await fs.writeFile(
			path.join(tmpDir, '.opencode', 'opencode-swarm.json'),
			JSON.stringify({ memory: { provider: 'local-jsonl', enabled: true } }),
			'utf-8',
		);

		const provider = new LocalJsonlMemoryProvider(tmpDir, {
			enabled: true,
			provider: 'local-jsonl',
		});
		const record = makeRecord('JSONL-backed value-log memory.', {
			metadata: { qValue: 0.9 },
		});
		await provider.initialize();
		await provider.upsert(record);
		await provider.appendRewardEvent({
			memoryId: record.id,
			verdict: 'APPROVE',
			reward: 1,
			qBefore: 0.8,
			qAfter: 0.9,
			timestamp: '2026-05-25T15:00:00.000Z',
		});

		const output = await handleMemoryValueLogCommand(tmpDir, []);

		expect(output).toContain(`\`${record.id}\` q=0.900 [promotion candidate]`);
		expect(output).toContain(
			'2026-05-25T15:00:00.000Z APPROVE reward=1.00 (q 0.80→0.90)',
		);

		// Confirm this actually exercised the jsonl sidecar file, not sqlite.
		const sidecarPath = path.join(
			tmpDir,
			'.swarm',
			'memory',
			'reward-events.jsonl',
		);
		expect(await fs.readFile(sidecarPath, 'utf-8')).toContain(record.id);
	});
});

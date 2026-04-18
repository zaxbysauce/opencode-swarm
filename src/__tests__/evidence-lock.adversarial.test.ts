/**
 * Adversarial tests for evidence write locking — 16 concurrent writers.
 *
 * Proves that no writes are lost when concurrent callers race on the same
 * evidence file.  Each writer appends a unique marker; after all settle we
 * assert every marker is present exactly once.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Evidence } from '../../src/config/evidence-schema';
import { saveEvidence } from '../../src/evidence/manager';

mock.module('../../src/telemetry.js', () => ({
	emit: () => {},
}));

let tempDir: string;

beforeEach(() => {
	tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-adversarial-'));
	// Create .swarm directory
	fs.mkdirSync(path.join(tempDir, '.swarm'), { recursive: true });
});

afterEach(() => {
	fs.rmSync(tempDir, { recursive: true, force: true });
	mock.restore();
});

describe('evidence lock — 16 concurrent writers', () => {
	test('zero lost writes: all 16 entries present after concurrent append', async () => {
		const WRITER_COUNT = 16;
		const taskId = '1.1';

		const writers = Array.from({ length: WRITER_COUNT }, (_, i) => {
			const evidence: Evidence = {
				type: 'note',
				task_id: taskId,
				agent: `writer-${i}`,
				timestamp: new Date().toISOString(),
				verdict: 'pass',
				summary: `evidence-marker-${i}`,
			};
			return saveEvidence(tempDir, taskId, evidence);
		});

		const results = await Promise.allSettled(writers);

		// All writers must succeed
		const failures = results.filter((r) => r.status === 'rejected');
		expect(failures.length).toBe(0);

		// Read final bundle and verify all 16 entries are present
		const bundlePath = path.join(
			tempDir,
			'.swarm',
			'evidence',
			taskId,
			'evidence.json',
		);
		const raw = fs.readFileSync(bundlePath, 'utf-8');
		const bundle = JSON.parse(raw);

		expect(bundle.entries).toHaveLength(WRITER_COUNT);

		// Each writer's marker must appear exactly once
		for (let i = 0; i < WRITER_COUNT; i++) {
			const marker = `evidence-marker-${i}`;
			const found = bundle.entries.filter(
				(e: { summary?: string }) => e.summary === marker,
			);
			expect(found.length).toBe(1);
		}
	});

	test('no orphaned lock files after 16 concurrent writers complete', async () => {
		const WRITER_COUNT = 16;
		const taskId = '2.1';

		const writers = Array.from({ length: WRITER_COUNT }, (_, i) => {
			const evidence: Evidence = {
				type: 'note',
				task_id: taskId,
				agent: `w-${i}`,
				timestamp: new Date().toISOString(),
				verdict: 'pass',
				summary: `marker-${i}`,
			};
			return saveEvidence(tempDir, taskId, evidence);
		});

		await Promise.all(writers);

		// No .lock directories should remain (proper-lockfile lock dirs)
		const locksDir = path.join(tempDir, '.swarm', 'locks');
		if (fs.existsSync(locksDir)) {
			const entries = fs.readdirSync(locksDir);
			const activeLockDirs = entries.filter((f) => {
				const p = path.join(locksDir, f);
				try {
					return fs.statSync(p).isDirectory() && f.endsWith('.lock');
				} catch {
					return false;
				}
			});
			expect(activeLockDirs).toHaveLength(0);
		}
	});
});

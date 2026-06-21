/**
 * Tests for the divergence-recorder JSONL writer.
 * File: tests/unit/turbo/epic/divergence-recorder.test.ts
 *
 * Covers:
 *  - computeDivergence is a pure function and handles all edge cases.
 *  - Append creates .swarm/epic/divergence.jsonl on first call.
 *  - Multiple appends produce one record per line, in order.
 *  - readDivergenceHistory tolerates malformed trailing lines.
 *  - Returns null (never throws) when .swarm/epic cannot be created.
 *  - sessionID and limit filters on readDivergenceHistory.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	computeDivergence,
	readDivergenceHistory,
	recordTaskDivergence,
} from '../../../../src/turbo/epic/divergence-recorder';

let dir: string;

beforeEach(() => {
	dir = fs.realpathSync(
		fs.mkdtempSync(path.join(os.tmpdir(), 'epic-divergence-')),
	);
});

afterEach(() => {
	try {
		fs.rmSync(dir, { recursive: true, force: true });
	} catch {
		// best-effort cleanup
	}
});

describe('computeDivergence', () => {
	test('all-declared task is clean (ratio 0)', () => {
		const result = computeDivergence(
			['src/a.ts', 'src/b.ts'],
			['src/a.ts', 'src/b.ts'],
		);
		expect(result.undeclared).toEqual([]);
		expect(result.unused).toEqual([]);
		expect(result.divergenceRatio).toBe(0);
	});

	test('undeclared writes raise the ratio', () => {
		const result = computeDivergence(
			['src/a.ts'],
			['src/a.ts', 'src/b.ts', 'src/c.ts'],
		);
		expect(result.undeclared.sort()).toEqual(['src/b.ts', 'src/c.ts']);
		expect(result.unused).toEqual([]);
		// 2 undeclared / 3 actual = 0.666...
		expect(result.divergenceRatio).toBeCloseTo(2 / 3, 6);
	});

	test('unused declarations do not affect the ratio', () => {
		const result = computeDivergence(
			['src/a.ts', 'src/b.ts', 'src/c.ts'],
			['src/a.ts'],
		);
		expect(result.unused.sort()).toEqual(['src/b.ts', 'src/c.ts']);
		expect(result.undeclared).toEqual([]);
		expect(result.divergenceRatio).toBe(0);
	});

	test('empty actual files produces ratio 0 (no writes ⇒ no divergence)', () => {
		const result = computeDivergence(['src/a.ts'], []);
		expect(result.divergenceRatio).toBe(0);
		expect(result.undeclared).toEqual([]);
		expect(result.unused).toEqual(['src/a.ts']);
	});

	test('duplicate paths in inputs are deduplicated', () => {
		const result = computeDivergence(
			['src/a.ts', 'src/a.ts'],
			['src/a.ts', 'src/a.ts'],
		);
		expect(result.declared).toEqual(['src/a.ts']);
		expect(result.actual).toEqual(['src/a.ts']);
		expect(result.divergenceRatio).toBe(0);
	});

	test('normalises paths so backslash and forward-slash compare equal', () => {
		const result = computeDivergence(
			['src/a.ts'],
			// normalizePath converts backslashes to forward slashes
			['src\\a.ts'],
		);
		expect(result.undeclared).toEqual([]);
		expect(result.divergenceRatio).toBe(0);
	});
});

describe('recordTaskDivergence', () => {
	test('creates the directory and writes a single record', () => {
		const result = recordTaskDivergence({
			directory: dir,
			sessionID: 'sess-1',
			taskId: 'T-1',
			phaseNumber: 2,
			declaredScope: ['src/a.ts'],
			actualFiles: ['src/a.ts', 'src/b.ts'],
		});
		expect(result).not.toBeNull();
		expect(result?.record.taskId).toBe('T-1');
		expect(result?.record.phaseNumber).toBe(2);
		expect(result?.record.undeclared).toEqual(['src/b.ts']);
		expect(result?.record.isClean).toBe(false);

		const filePath = path.join(dir, '.swarm', 'epic', 'divergence.jsonl');
		expect(fs.existsSync(filePath)).toBe(true);
		expect(
			fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean),
		).toHaveLength(1);
	});

	test('appends multiple records in chronological order', () => {
		recordTaskDivergence({
			directory: dir,
			sessionID: 'sess-1',
			taskId: 'T-1',
			declaredScope: ['src/a.ts'],
			actualFiles: ['src/a.ts'],
		});
		recordTaskDivergence({
			directory: dir,
			sessionID: 'sess-1',
			taskId: 'T-2',
			declaredScope: ['src/b.ts'],
			actualFiles: ['src/b.ts', 'src/x.ts'],
		});
		const history = readDivergenceHistory(dir);
		expect(history).toHaveLength(2);
		expect(history[0].taskId).toBe('T-1');
		expect(history[0].isClean).toBe(true);
		expect(history[1].taskId).toBe('T-2');
		expect(history[1].isClean).toBe(false);
	});

	test('returns null when .swarm cannot be created (parent is a file)', () => {
		fs.writeFileSync(path.join(dir, '.swarm'), 'not a dir', 'utf-8');
		const result = recordTaskDivergence({
			directory: dir,
			sessionID: 'sess-1',
			taskId: 'T-1',
			declaredScope: [],
			actualFiles: [],
		});
		expect(result).toBeNull();
	});
});

describe('readDivergenceHistory', () => {
	test('returns empty array when no file exists', () => {
		expect(readDivergenceHistory(dir)).toEqual([]);
	});

	test('skips malformed trailing line (partial-write tolerance)', () => {
		const filePath = path.join(dir, '.swarm', 'epic', 'divergence.jsonl');
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		const good = `${JSON.stringify({
			timestamp: 't',
			sessionID: 's',
			taskId: 'T-1',
			declaredScope: [],
			actualFiles: [],
			undeclared: [],
			unused: [],
			divergenceRatio: 0,
			isClean: true,
		})}\n`;
		const bad = '{ broken';
		fs.writeFileSync(filePath, good + bad, 'utf-8');
		const records = readDivergenceHistory(dir);
		expect(records).toHaveLength(1);
		expect(records[0].taskId).toBe('T-1');
	});

	test('filters by sessionID when provided', () => {
		recordTaskDivergence({
			directory: dir,
			sessionID: 'sess-A',
			taskId: 'T-1',
			declaredScope: [],
			actualFiles: [],
		});
		recordTaskDivergence({
			directory: dir,
			sessionID: 'sess-B',
			taskId: 'T-2',
			declaredScope: [],
			actualFiles: [],
		});
		const onlyA = readDivergenceHistory(dir, { sessionID: 'sess-A' });
		expect(onlyA).toHaveLength(1);
		expect(onlyA[0].taskId).toBe('T-1');
	});

	test('limit returns the most recent N records', () => {
		for (let i = 0; i < 5; i++) {
			recordTaskDivergence({
				directory: dir,
				sessionID: 'sess-1',
				taskId: `T-${i}`,
				declaredScope: [],
				actualFiles: [],
			});
		}
		const last2 = readDivergenceHistory(dir, { limit: 2 });
		expect(last2).toHaveLength(2);
		expect(last2[0].taskId).toBe('T-3');
		expect(last2[1].taskId).toBe('T-4');
	});

	test('tail-bounded read returns only records that fit and drops the partial-line fragment (adversarial H3)', () => {
		// Write 5 records, each padded enough that ~3 fit in our small window.
		for (let i = 0; i < 5; i++) {
			recordTaskDivergence({
				directory: dir,
				sessionID: 'sess-1',
				taskId: `T-${i}`,
				declaredScope: [`src/declared-${i}-${'x'.repeat(80)}.ts`],
				actualFiles: [`src/actual-${i}-${'x'.repeat(80)}.ts`],
			});
		}
		const filePath = path.join(dir, '.swarm', 'epic', 'divergence.jsonl');
		const totalSize = fs.statSync(filePath).size;
		// Pick a maxBytes so the file is larger than the window — triggers tail-read.
		const tail = readDivergenceHistory(dir, {
			maxBytes: Math.floor(totalSize / 2),
		});
		// Must return SOME records (the latest ones) and never throw.
		expect(tail.length).toBeGreaterThan(0);
		// And those records must be a TAIL slice — last record always present.
		expect(tail[tail.length - 1]?.taskId).toBe('T-4');
		// Records present must form a contiguous tail (no gaps).
		const taskIds = tail.map((r) => r.taskId);
		const ascending = [...taskIds].sort(
			(a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]),
		);
		expect(taskIds).toEqual(ascending);
	});

	test('Infinity bound reads the full file', () => {
		for (let i = 0; i < 5; i++) {
			recordTaskDivergence({
				directory: dir,
				sessionID: 'sess-1',
				taskId: `T-${i}`,
				declaredScope: [],
				actualFiles: [],
			});
		}
		const all = readDivergenceHistory(dir, {
			maxBytes: Number.POSITIVE_INFINITY,
		});
		expect(all).toHaveLength(5);
		expect(all[0].taskId).toBe('T-0');
	});
});

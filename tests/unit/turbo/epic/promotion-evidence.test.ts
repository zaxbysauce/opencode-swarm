/**
 * Tests for the promotion-evidence JSONL writer.
 * File: tests/unit/turbo/epic/promotion-evidence.test.ts
 *
 * Covers:
 *  - Append creates .swarm/evidence/epic-promotions.jsonl on first call.
 *  - Multiple appends produce one JSON document per line, in order.
 *  - Read tolerates a malformed trailing line (partial-write resilience).
 *  - Returns null when the .swarm/evidence directory cannot be created.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	appendPromotionEvidence,
	readPromotionEvidence,
} from '../../../../src/turbo/epic/promotion-evidence';

let dir: string;

beforeEach(() => {
	dir = fs.realpathSync(
		fs.mkdtempSync(path.join(os.tmpdir(), 'epic-evidence-')),
	);
});

afterEach(() => {
	try {
		fs.rmSync(dir, { recursive: true, force: true });
	} catch {
		// best-effort cleanup
	}
});

function fakeVerdict(decision: 'promote' | 'demote', p: number) {
	return {
		decision,
		p,
		rationale: {
			pCheck: { passed: decision === 'promote', p, threshold: 0.3 },
			hotModuleCheck: { passed: true, touchedHotModules: [] as string[] },
			greenfieldCheck: {
				passed: true,
				commitsObserved: 50,
				minCommits: 20,
			},
		},
		blockingReasons: decision === 'demote' ? ['simulated demotion'] : [],
	};
}

describe('appendPromotionEvidence', () => {
	test('creates the evidence directory and writes one line', () => {
		const result = appendPromotionEvidence(dir, {
			timestamp: '2025-01-01T00:00:00Z',
			sessionID: 'sess-1',
			phase: 1,
			verdict: fakeVerdict('promote', 0.1),
		});
		expect(result).not.toBeNull();
		const filePath = path.join(
			dir,
			'.swarm',
			'evidence',
			'epic-promotions.jsonl',
		);
		expect(fs.existsSync(filePath)).toBe(true);
		const raw = fs.readFileSync(filePath, 'utf-8');
		expect(raw.split('\n').filter((l) => l.length > 0)).toHaveLength(1);
		const parsed = JSON.parse(raw.split('\n')[0]);
		expect(parsed.sessionID).toBe('sess-1');
		expect(parsed.phase).toBe(1);
		expect(parsed.verdict.decision).toBe('promote');
	});

	test('appends multiple records in order', () => {
		appendPromotionEvidence(dir, {
			timestamp: '2025-01-01T00:00:00Z',
			sessionID: 'sess-1',
			phase: 1,
			verdict: fakeVerdict('promote', 0.1),
		});
		appendPromotionEvidence(dir, {
			timestamp: '2025-01-01T00:01:00Z',
			sessionID: 'sess-1',
			phase: 2,
			verdict: fakeVerdict('demote', 0.5),
		});
		const records = readPromotionEvidence(dir);
		expect(records).toHaveLength(2);
		expect(records[0].verdict.decision).toBe('promote');
		expect(records[1].verdict.decision).toBe('demote');
	});

	test('written content is newline-terminated JSON', () => {
		appendPromotionEvidence(dir, {
			timestamp: '2025-01-01T00:00:00Z',
			sessionID: 'sess-1',
			verdict: fakeVerdict('promote', 0.1),
		});
		const raw = fs.readFileSync(
			path.join(dir, '.swarm', 'evidence', 'epic-promotions.jsonl'),
			'utf-8',
		);
		expect(raw.endsWith('\n')).toBe(true);
	});
});

describe('readPromotionEvidence', () => {
	test('returns empty array when no file exists', () => {
		expect(readPromotionEvidence(dir)).toEqual([]);
	});

	test('skips malformed trailing line (partial-write tolerance)', () => {
		const filePath = path.join(
			dir,
			'.swarm',
			'evidence',
			'epic-promotions.jsonl',
		);
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		// First a well-formed line, then a half-written one.
		const good = `${JSON.stringify({
			timestamp: 't',
			sessionID: 's',
			verdict: fakeVerdict('promote', 0.1),
		})}\n`;
		const bad = '{ this is broken';
		fs.writeFileSync(filePath, good + bad, 'utf-8');
		const records = readPromotionEvidence(dir);
		expect(records).toHaveLength(1);
		expect(records[0].sessionID).toBe('s');
	});
});

describe('appendPromotionEvidence — error path', () => {
	test('returns null when .swarm/evidence cannot be created (parent is a file)', () => {
		// Sabotage: create `.swarm` as a regular file so the recursive mkdir fails.
		fs.writeFileSync(path.join(dir, '.swarm'), 'not a directory', 'utf-8');
		const result = appendPromotionEvidence(dir, {
			timestamp: '2025-01-01T00:00:00Z',
			sessionID: 'sess-1',
			verdict: fakeVerdict('promote', 0.1),
		});
		expect(result).toBeNull();
	});
});

describe('Phase 16 (C3.M1) — Phase 13 phantomDeps round-trip persistence', () => {
	test('a verdict carrying phantomDeps survives JSON round-trip via append + read', () => {
		const verdictWithPhantoms = {
			decision: 'demote' as const,
			p: 0.05,
			rationale: {
				pCheck: { passed: true, p: 0.05, threshold: 0.3 },
				hotModuleCheck: { passed: true, touchedHotModules: [] },
				greenfieldCheck: {
					passed: false,
					commitsObserved: 4,
					minCommits: 20,
					crossPhaseUpstreams: ['1.1'],
					missingUpstreams: ['1.1'],
					phantomDeps: ['1.7', '2.99'],
				},
			},
			blockingReasons: [
				'phantom dep id(s) declared but not present in plan (probable typo, fix the dep id) — 1.7, 2.99',
				'predecessor evidence missing: cross-phase upstream task(s) not yet committed — 1.1',
			],
		};
		appendPromotionEvidence(dir, {
			timestamp: '2026-06-03T17:00:00Z',
			sessionID: 'sess-phase16',
			phase: 2,
			verdict: verdictWithPhantoms,
		});

		const records = readPromotionEvidence(dir);
		expect(records).toHaveLength(1);
		const r = records[0];
		expect(r.sessionID).toBe('sess-phase16');
		const g = r.verdict.rationale.greenfieldCheck;
		expect(g.phantomDeps).toEqual(['1.7', '2.99']);
		expect(g.crossPhaseUpstreams).toEqual(['1.1']);
		expect(g.missingUpstreams).toEqual(['1.1']);
		expect(r.verdict.blockingReasons).toHaveLength(2);
		expect(r.verdict.blockingReasons[0]).toContain('phantom dep id');
	});

	test('a legacy verdict WITHOUT the new fields still parses (Phase 13 B19 contract)', () => {
		const legacyVerdict = {
			decision: 'promote' as const,
			p: 0.1,
			rationale: {
				pCheck: { passed: true, p: 0.1, threshold: 0.3 },
				hotModuleCheck: { passed: true, touchedHotModules: [] },
				greenfieldCheck: {
					passed: true,
					commitsObserved: 50,
					minCommits: 20,
					// no crossPhaseUpstreams / missingUpstreams / phantomDeps
				},
			},
			blockingReasons: [],
		};
		appendPromotionEvidence(dir, {
			timestamp: '2026-05-01T10:00:00Z',
			sessionID: 'sess-legacy',
			verdict: legacyVerdict,
		});

		const records = readPromotionEvidence(dir);
		expect(records).toHaveLength(1);
		// Parser doesn't add the new fields; reader / renderer must
		// default them at consumption time (Phase 13 B19 / B18 / B26
		// guards). Verifying the parser doesn't throw here.
		const g = records[0].verdict.rationale.greenfieldCheck;
		expect(g.passed).toBe(true);
		expect(g.crossPhaseUpstreams).toBeUndefined();
	});

	test('a non-git bypass verdict has neither crossPhaseUpstreams nor missingUpstreams in the persisted JSONL (Phase 16 C5.L1)', () => {
		// Architecture promise: when bypassedNoGit=true, the gate didn't
		// actually consult the predicate, so those arrays should be
		// suppressed in the rationale to avoid contradicting `passed:true`.
		const bypassVerdict = {
			decision: 'promote' as const,
			p: 0.05,
			rationale: {
				pCheck: { passed: true, p: 0.05, threshold: 0.3 },
				hotModuleCheck: { passed: true, touchedHotModules: [] },
				greenfieldCheck: {
					passed: true,
					commitsObserved: 0,
					minCommits: 20,
					bypassedNoGit: true,
					// crossPhaseUpstreams / missingUpstreams intentionally
					// omitted by the producer (decideEpicActivation, Phase 16)
				},
			},
			blockingReasons: [],
		};
		appendPromotionEvidence(dir, {
			timestamp: '2026-06-03T18:00:00Z',
			sessionID: 'sess-nogit',
			verdict: bypassVerdict,
		});

		const records = readPromotionEvidence(dir);
		expect(records).toHaveLength(1);
		const g = records[0].verdict.rationale.greenfieldCheck;
		expect(g.bypassedNoGit).toBe(true);
		expect(g.crossPhaseUpstreams).toBeUndefined();
		expect(g.missingUpstreams).toBeUndefined();
	});
});

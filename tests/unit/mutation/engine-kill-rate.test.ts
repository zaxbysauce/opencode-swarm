import { describe, expect, test } from 'bun:test';
import {
	computeReport,
	type MutationResult,
} from '../../../src/mutation/engine.js';

// Extended perFunction entry type that matches actual runtime behavior
// (interface in engine.ts hasn't been updated to include equivalent/skipped yet)
interface PerFunctionEntry {
	killed: number;
	survived: number;
	total: number;
	equivalent: number;
	skipped: number;
	killRate: number;
}

function getPerFunctionEntry(
	report: ReturnType<typeof computeReport>,
): PerFunctionEntry {
	// This cast is safe at runtime since the implementation populates these fields
	return report.perFunction.values().next()
		.value as unknown as PerFunctionEntry;
}

function getPerFunctionEntryForKey(
	report: ReturnType<typeof computeReport>,
	key: string,
): PerFunctionEntry {
	return report.perFunction.get(key) as unknown as PerFunctionEntry;
}

function makeResult(
	outcome: MutationResult['outcome'],
	functionName = 'testFn',
	filePath = '/src/test.ts',
): MutationResult {
	return {
		patchId: `patch-${Math.random().toString(36).slice(2)}`,
		filePath,
		functionName,
		mutationType: 'test',
		outcome,
		durationMs: 100,
	};
}

describe('computeReport - per-function kill rate denominator', () => {
	// Scenario 1: killed=2, survived=1, equivalent=1, skipped=1, total=5
	// killRate = 2/(5-1-1) = 2/3 ≈ 0.667
	test('killRate excludes equivalent and skipped from denominator', () => {
		const results: MutationResult[] = [
			makeResult('killed'),
			makeResult('killed'),
			makeResult('survived'),
			makeResult('equivalent'),
			makeResult('skipped'),
		];

		const report = computeReport(results, 1000);

		expect(report.totalMutants).toBe(5);
		expect(report.killed).toBe(2);
		expect(report.survived).toBe(1);
		expect(report.equivalent).toBe(1);
		expect(report.skipped).toBe(1);
		expect(report.errors).toBe(0);

		// Global killRate: 2/(5-1-1) = 2/3 ≈ 0.667
		expect(report.killRate).toBeCloseTo(2 / 3, 5);

		// Per-function killRate: 2/(5-1-1) = 2/3 ≈ 0.667
		const key = '/src/test.ts:testFn';
		const fnEntry = getPerFunctionEntryForKey(report, key);
		expect(fnEntry).toBeDefined();
		expect(fnEntry.killed).toBe(2);
		expect(fnEntry.survived).toBe(1);
		expect(fnEntry.equivalent).toBe(1);
		expect(fnEntry.skipped).toBe(1);
		expect(fnEntry.total).toBe(5);
		expect(fnEntry.killRate).toBeCloseTo(2 / 3, 5);
	});

	// Scenario 2: Function with all equivalent mutants → killRate = 0 (denominator = 0, clamped to 0)
	test('killRate is 0 when denominator is 0 (all equivalent)', () => {
		const results: MutationResult[] = [
			makeResult('equivalent'),
			makeResult('equivalent'),
			makeResult('equivalent'),
		];

		const report = computeReport(results, 1000);

		expect(report.killed).toBe(0);
		expect(report.equivalent).toBe(3);
		expect(report.survived).toBe(0);
		// Global: denominator = 3-3 = 0, killRate clamped to 0
		expect(report.killRate).toBe(0);

		const key = '/src/test.ts:testFn';
		const fnEntry = getPerFunctionEntryForKey(report, key);
		expect(fnEntry.killRate).toBe(0);
		expect(fnEntry.total).toBe(3);
		expect(fnEntry.equivalent).toBe(3);
	});

	// Scenario 3: Function with mixed outcomes including error/timeout
	// Those count in total but not in equivalent/skipped
	test('error and timeout count in total but not in equivalent/skipped', () => {
		const results: MutationResult[] = [
			makeResult('killed'),
			makeResult('survived'),
			makeResult('timeout'),
			makeResult('error'),
			makeResult('equivalent'),
			makeResult('skipped'),
		];

		const report = computeReport(results, 1000);

		expect(report.totalMutants).toBe(6);
		expect(report.killed).toBe(1);
		expect(report.survived).toBe(1);
		expect(report.timeout).toBe(1);
		expect(report.errors).toBe(1);
		expect(report.equivalent).toBe(1);
		expect(report.skipped).toBe(1);

		// Global: denominator = 6-1-1 = 4, killRate = 1/4 = 0.25
		expect(report.killRate).toBe(0.25);

		const key = '/src/test.ts:testFn';
		const fnEntry = getPerFunctionEntryForKey(report, key);
		// Per-function: denominator = 6-1-1 = 4, killRate = 1/4 = 0.25
		expect(fnEntry.killRate).toBe(0.25);
		expect(fnEntry.total).toBe(6);
		expect(fnEntry.killed).toBe(1);
		expect(fnEntry.survived).toBe(1);
		// error and timeout are NOT counted in equivalent/skipped
		expect(fnEntry.equivalent).toBe(1);
		expect(fnEntry.skipped).toBe(1);
	});

	// Scenario 4: Multiple functions with different outcome mixes
	test('each function gets its own correct killRate', () => {
		const results: MutationResult[] = [
			// fnA: killed=2, survived=0, equivalent=0, skipped=0, total=2 → killRate = 1.0
			makeResult('killed', 'fnA', '/src/a.ts'),
			makeResult('killed', 'fnA', '/src/a.ts'),
			// fnB: killed=0, survived=2, equivalent=0, skipped=0, total=2 → killRate = 0.0
			makeResult('survived', 'fnB', '/src/b.ts'),
			makeResult('survived', 'fnB', '/src/b.ts'),
			// fnC: killed=1, survived=1, equivalent=1, skipped=1, total=4 → killRate = 1/(4-1-1) = 0.5
			makeResult('killed', 'fnC', '/src/c.ts'),
			makeResult('survived', 'fnC', '/src/c.ts'),
			makeResult('equivalent', 'fnC', '/src/c.ts'),
			makeResult('skipped', 'fnC', '/src/c.ts'),
		];

		const report = computeReport(results, 1000);

		const fnA = report.perFunction.get('/src/a.ts:fnA');
		expect(fnA!.killRate).toBe(1.0);
		expect(fnA!.total).toBe(2);
		expect(fnA!.killed).toBe(2);

		const fnB = report.perFunction.get('/src/b.ts:fnB');
		expect(fnB!.killRate).toBe(0.0);
		expect(fnB!.total).toBe(2);
		expect(fnB!.survived).toBe(2);

		const fnC = getPerFunctionEntryForKey(report, '/src/c.ts:fnC');
		expect(fnC.killRate).toBe(0.5); // 1/(4-1-1) = 0.5
		expect(fnC.total).toBe(4);
		expect(fnC.killed).toBe(1);
		expect(fnC.survived).toBe(1);
		expect(fnC.equivalent).toBe(1);
		expect(fnC.skipped).toBe(1);

		// Global: killed=3, total=8, equivalent=1, skipped=1
		// Global killRate = 3/(8-1-1) = 3/6 = 0.5
		expect(report.killRate).toBeCloseTo(0.5, 5);
	});

	// Scenario 5: Backward compat - results without equivalent/skipped still work
	test('backward compatible: results without equivalent/skipped still work', () => {
		const results: MutationResult[] = [
			makeResult('killed'),
			makeResult('killed'),
			makeResult('survived'),
			makeResult('timeout'),
			makeResult('error'),
		];

		const report = computeReport(results, 1000);

		expect(report.totalMutants).toBe(5);
		expect(report.killed).toBe(2);
		expect(report.survived).toBe(1);
		expect(report.timeout).toBe(1);
		expect(report.errors).toBe(1);
		expect(report.equivalent).toBe(0);
		expect(report.skipped).toBe(0);

		// Global: denominator = 5-0-0 = 5, killRate = 2/5 = 0.4
		expect(report.killRate).toBe(0.4);

		const key = '/src/test.ts:testFn';
		const fnEntry = getPerFunctionEntryForKey(report, key);
		// Per-function: denominator = 5-0-0 = 5, killRate = 2/5 = 0.4
		expect(fnEntry.killRate).toBe(0.4);
		expect(fnEntry.total).toBe(5);
		expect(fnEntry.killed).toBe(2);
		expect(fnEntry.survived).toBe(1);
		expect(fnEntry.equivalent).toBe(0);
		expect(fnEntry.skipped).toBe(0);
	});

	// Edge case: empty results
	test('handles empty results', () => {
		const report = computeReport([], 0);

		expect(report.totalMutants).toBe(0);
		expect(report.killRate).toBe(0);
		expect(report.perFunction.size).toBe(0);
	});

	// Edge case: all skipped - denominator = 0
	test('killRate is 0 when all mutants are skipped', () => {
		const results: MutationResult[] = [
			makeResult('skipped'),
			makeResult('skipped'),
			makeResult('skipped'),
		];

		const report = computeReport(results, 1000);

		expect(report.killRate).toBe(0);

		const key = '/src/test.ts:testFn';
		const fnEntry = report.perFunction.get(key);
		expect(fnEntry!.killRate).toBe(0);
	});

	// Edge case: single function with partial kill
	test('partial kill scenario: killed=1, survived=2, equivalent=0, skipped=0', () => {
		const results: MutationResult[] = [
			makeResult('killed'),
			makeResult('survived'),
			makeResult('survived'),
		];

		const report = computeReport(results, 1000);

		const key = '/src/test.ts:testFn';
		const fnEntry = report.perFunction.get(key);
		// killRate = 1/(3-0-0) = 1/3 ≈ 0.333
		expect(fnEntry!.killRate).toBeCloseTo(1 / 3, 5);
		expect(fnEntry!.killRate).toBeCloseTo(0.333, 2);
	});
});

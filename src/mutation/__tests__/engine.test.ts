import { describe, expect, test } from 'bun:test';
import type {
	MutationOutcome,
	MutationPatch,
	MutationResult,
} from '../engine.js';
import { computeReport, MAX_MUTATIONS_PER_FUNCTION } from '../engine.js';

// Helper to create a minimal MutationResult
function makeResult(
	patchId: string,
	outcome: MutationOutcome,
	filePath = 'src/foo.ts',
	functionName = 'foo',
): MutationResult {
	return {
		patchId,
		filePath,
		functionName,
		mutationType: 'logical',
		outcome,
		durationMs: 10,
	};
}

// Helper to create a MutationPatch
function makePatch(
	id: string,
	filePath = 'src/foo.ts',
	functionName = 'foo',
): MutationPatch {
	return {
		id,
		filePath,
		functionName,
		mutationType: 'logical',
		patch: `--- a/src/foo.ts\n+++ b/src/foo.ts\n@@ -1 +1 @@\n-foo\n+bar\n`,
	};
}

describe('computeReport', () => {
	test('counts all outcome types correctly', () => {
		const results: MutationResult[] = [
			makeResult('1', 'killed'),
			makeResult('2', 'killed'),
			makeResult('3', 'survived'),
			makeResult('4', 'timeout'),
			makeResult('5', 'error'),
			makeResult('6', 'equivalent'),
			makeResult('7', 'skipped'),
		];

		const report = computeReport(results, 1000);

		expect(report.totalMutants).toBe(7);
		expect(report.killed).toBe(2);
		expect(report.survived).toBe(1);
		expect(report.timeout).toBe(1);
		expect(report.equivalent).toBe(1);
		expect(report.skipped).toBe(1);
		expect(report.errors).toBe(1);
	});

	test('computes killRate correctly', () => {
		// 5 total, 1 equivalent, 1 skipped = 3 denominator
		// 2 killed / 3 = 0.666...
		const results: MutationResult[] = [
			makeResult('1', 'killed'),
			makeResult('2', 'killed'),
			makeResult('3', 'survived'),
			makeResult('4', 'equivalent'),
			makeResult('5', 'skipped'),
		];

		const report = computeReport(results, 500);

		expect(report.killRate).toBeCloseTo(2 / 3, 5);
		// adjusted: 5 - 1 equivalent - 1 skipped = 3, 2 killed / 3 = 0.666...
		expect(report.adjustedKillRate).toBeCloseTo(2 / 3, 5);
	});

	test('handles empty results without division by zero', () => {
		const report = computeReport([], 0);

		expect(report.totalMutants).toBe(0);
		expect(report.killed).toBe(0);
		expect(report.survived).toBe(0);
		expect(report.timeout).toBe(0);
		expect(report.equivalent).toBe(0);
		expect(report.skipped).toBe(0);
		expect(report.errors).toBe(0);
		expect(report.killRate).toBe(0);
		expect(report.adjustedKillRate).toBe(0);
		expect(report.perFunction.size).toBe(0);
	});

	test('groups per-function statistics correctly', () => {
		const results: MutationResult[] = [
			makeResult('1', 'killed', 'src/foo.ts', 'foo'),
			makeResult('2', 'killed', 'src/foo.ts', 'foo'),
			makeResult('3', 'survived', 'src/foo.ts', 'foo'),
			makeResult('4', 'killed', 'src/bar.ts', 'bar'),
			makeResult('5', 'survived', 'src/bar.ts', 'bar'),
			makeResult('6', 'survived', 'src/bar.ts', 'bar'),
		];

		const report = computeReport(results, 200);

		expect(report.perFunction.size).toBe(2);

		const fooEntry = report.perFunction.get('src/foo.ts:foo');
		expect(fooEntry).toBeDefined();
		expect(fooEntry!.total).toBe(3);
		expect(fooEntry!.killed).toBe(2);
		expect(fooEntry!.survived).toBe(1);
		expect(fooEntry!.killRate).toBeCloseTo(2 / 3, 5);

		const barEntry = report.perFunction.get('src/bar.ts:bar');
		expect(barEntry).toBeDefined();
		expect(barEntry!.total).toBe(3);
		expect(barEntry!.killed).toBe(1);
		expect(barEntry!.survived).toBe(2);
		expect(barEntry!.killRate).toBeCloseTo(1 / 3, 5);
	});

	test('sets budgetExceeded false when under budget', () => {
		const report = computeReport([], 500, 1000);
		expect(report.budgetExceeded).toBe(false);
	});

	test('sets budgetExceeded true when over budget', () => {
		const report = computeReport([], 1500, 1000);
		expect(report.budgetExceeded).toBe(true);
	});

	test('uses TOTAL_BUDGET_MS when budgetMs not provided', () => {
		const report = computeReport([], 300_001);
		expect(report.budgetExceeded).toBe(true);
		expect(report.budgetMs).toBe(300_000);
	});

	test('includes results and timestamp in report', () => {
		const results = [makeResult('1', 'killed')];
		const report = computeReport(results, 100);

		expect(report.results).toBe(results);
		expect(report.timestamp).toBeDefined();
		expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
	});
});

describe('MAX_MUTATIONS_PER_FUNCTION', () => {
	test('is exported and equals 10', () => {
		expect(MAX_MUTATIONS_PER_FUNCTION).toBe(10);
	});
});

describe('MutationOutcome type coverage', () => {
	test('all outcome types are valid', () => {
		const outcomes: MutationOutcome[] = [
			'killed',
			'survived',
			'timeout',
			'error',
			'equivalent',
			'skipped',
		];

		expect(outcomes).toHaveLength(6);

		// Verify each outcome can be used in a result
		for (const outcome of outcomes) {
			const result = makeResult('test-id', outcome);
			expect(result.outcome).toBe(outcome);
		}
	});
});

describe('computeReport edge cases', () => {
	test('all killed gives 100% killRate', () => {
		const results: MutationResult[] = [
			makeResult('1', 'killed'),
			makeResult('2', 'killed'),
			makeResult('3', 'killed'),
		];
		const report = computeReport(results, 100);
		expect(report.killRate).toBe(1);
		expect(report.adjustedKillRate).toBe(1);
	});

	test('all survived gives 0% killRate', () => {
		const results: MutationResult[] = [
			makeResult('1', 'survived'),
			makeResult('2', 'survived'),
			makeResult('3', 'survived'),
		];
		const report = computeReport(results, 100);
		expect(report.killRate).toBe(0);
		expect(report.adjustedKillRate).toBe(0);
	});

	test('only equivalent results gives 0 killRate', () => {
		const results: MutationResult[] = [
			makeResult('1', 'equivalent'),
			makeResult('2', 'equivalent'),
		];
		const report = computeReport(results, 100);
		expect(report.killRate).toBe(0);
		expect(report.adjustedKillRate).toBe(0);
	});

	test('only skipped results gives 0 killRate', () => {
		const results: MutationResult[] = [
			makeResult('1', 'skipped'),
			makeResult('2', 'skipped'),
		];
		const report = computeReport(results, 100);
		expect(report.killRate).toBe(0);
		expect(report.adjustedKillRate).toBe(0);
	});

	test('single function with mixed outcomes computes killRate correctly', () => {
		const results: MutationResult[] = [
			makeResult('1', 'killed', 'src/utils.ts', 'helper'),
			makeResult('2', 'survived', 'src/utils.ts', 'helper'),
			makeResult('3', 'timeout', 'src/utils.ts', 'helper'),
			makeResult('4', 'error', 'src/utils.ts', 'helper'),
		];
		const report = computeReport(results, 200);
		// killRate = killed / (total - equivalent - skipped) = 1 / (4 - 0 - 0) = 0.25
		expect(report.killRate).toBe(0.25);
		// adjustedKillRate = killed / (total - equivalent - skipped) = 1 / (4 - 0 - 0) = 0.25
		expect(report.adjustedKillRate).toBe(0.25);
	});

	test('handles timeout in killRate calculation', () => {
		// Timeouts should not count in denominator for killRate
		// 4 total, 0 equivalent, 0 skipped = 4 denominator
		// 1 killed / 4 = 0.25
		const results: MutationResult[] = [
			makeResult('1', 'killed'),
			makeResult('2', 'survived'),
			makeResult('3', 'timeout'),
			makeResult('4', 'error'),
		];
		const report = computeReport(results, 100);
		expect(report.killRate).toBe(0.25);
	});
});

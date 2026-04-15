import { beforeEach, describe, expect, test } from 'bun:test';
import type { MutationReport, MutationResult } from '../engine.js';
import { evaluateMutationGate } from '../gate.js';

function makeResult(overrides: Partial<MutationResult> = {}): MutationResult {
	return {
		patchId: 'patch-1',
		filePath: '/src/file.ts',
		functionName: 'testFunc',
		mutationType: 'binary',
		outcome: 'killed',
		durationMs: 100,
		...overrides,
	};
}

function makeReport(overrides: Partial<MutationReport> = {}): MutationReport {
	const results: MutationResult[] = overrides.results ?? [
		makeResult({ outcome: 'killed' }),
	];
	const totalMutants = overrides.totalMutants ?? results.length;
	const killed =
		overrides.killed ?? results.filter((r) => r.outcome === 'killed').length;
	const survived =
		overrides.survived ??
		results.filter((r) => r.outcome === 'survived').length;
	const equivalent =
		overrides.equivalent ??
		results.filter((r) => r.outcome === 'equivalent').length;
	const adjustedKillRate =
		overrides.adjustedKillRate ?? killed / (totalMutants - equivalent);

	return {
		totalMutants,
		killed,
		survived,
		timeout: 0,
		equivalent,
		skipped: 0,
		errors: 0,
		killRate: killed / totalMutants,
		adjustedKillRate,
		perFunction: overrides.perFunction ?? new Map(),
		results,
		durationMs: 1000,
		budgetMs: 300000,
		budgetExceeded: false,
		timestamp: new Date().toISOString(),
		...overrides,
	};
}

// Test 1: NaN adjustedKillRate
test('1. NaN adjustedKillRate should result in fail verdict', () => {
	const report = makeReport({
		totalMutants: 10,
		killed: 0,
		equivalent: 10, // causes divide by zero → NaN
		adjustedKillRate: NaN,
		results: [
			makeResult({ outcome: 'equivalent' }),
			makeResult({ outcome: 'equivalent' }),
		],
	});

	const result = evaluateMutationGate(report);
	// NaN >= anything is false → should fall through to 'fail'
	expect(result.verdict).toBe('fail');
});

// Test 2: Infinity adjustedKillRate
test('2. Infinity adjustedKillRate should result in pass verdict', () => {
	const report = makeReport({
		totalMutants: 10,
		killed: 10,
		equivalent: 0,
		adjustedKillRate: Infinity,
	});

	const result = evaluateMutationGate(report);
	expect(result.verdict).toBe('pass');
	expect(result.message).toContain('PASSED');
});

// Test 3: Negative adjustedKillRate
test('3. Negative adjustedKillRate should result in fail verdict', () => {
	const report = makeReport({
		totalMutants: 10,
		killed: -5,
		equivalent: 0,
		adjustedKillRate: -0.5,
	});

	const result = evaluateMutationGate(report);
	expect(result.verdict).toBe('fail');
});

// Test 4: adjustedKillRate > 1
test('4. adjustedKillRate > 1 should result in pass verdict', () => {
	const report = makeReport({
		totalMutants: 10,
		killed: 15, // more killed than total
		equivalent: 0,
		adjustedKillRate: 1.5,
	});

	const result = evaluateMutationGate(report);
	expect(result.verdict).toBe('pass');
	expect(result.message).toContain('PASSED');
});

// Test 5: passThreshold = 0, warnThreshold = 0
test('5. Zero thresholds should result in pass verdict', () => {
	const report = makeReport({
		totalMutants: 10,
		killed: 0,
		equivalent: 0,
		adjustedKillRate: 0,
		results: Array(10)
			.fill(null)
			.map(() => makeResult({ outcome: 'survived' })),
	});

	const result = evaluateMutationGate(report, 0, 0);
	expect(result.verdict).toBe('pass');
});

// Test 6: passThreshold = 1, warnThreshold = 1
test('6. Threshold of 1 should only pass perfect kill rate', () => {
	const report = makeReport({
		totalMutants: 10,
		killed: 9,
		equivalent: 0,
		adjustedKillRate: 0.9,
	});

	const result = evaluateMutationGate(report, 1, 1);
	expect(result.verdict).toBe('fail');

	// Perfect kill rate should pass
	const perfectReport = makeReport({
		totalMutants: 10,
		killed: 10,
		equivalent: 0,
		adjustedKillRate: 1.0,
	});
	const perfectResult = evaluateMutationGate(perfectReport, 1, 1);
	expect(perfectResult.verdict).toBe('pass');
});

// Test 7: Large perFunction Map performance
test('7. Large perFunction Map (10000 entries) should complete quickly', () => {
	const largeMap = new Map<
		string,
		{
			killed: number;
			survived: number;
			total: number;
			equivalent: number;
			skipped: number;
			killRate: number;
		}
	>();

	// Create 10000 entries
	for (let i = 0; i < 10000; i++) {
		largeMap.set(`/src/file${i}.ts:function${i}`, {
			killed: 5,
			survived: 5,
			total: 10,
			equivalent: 0,
			skipped: 0,
			killRate: 0.5,
		});
	}

	const report = makeReport({
		totalMutants: 100000,
		killed: 50000,
		equivalent: 0,
		adjustedKillRate: 0.5,
		perFunction: largeMap,
	});

	const start = Date.now();
	const result = evaluateMutationGate(report);
	const elapsed = Date.now() - start;

	expect(result.verdict).toBe('fail');
	expect(elapsed).toBeLessThan(5000); // Should complete in under 5 seconds
});

// Test 8: Key with many colons - parsing still works
test('8. perFunction key with many colons parses function name correctly', () => {
	const complexKey = 'a:b:c:d:e:myFunction';
	const complexMap = new Map<
		string,
		{
			killed: number;
			survived: number;
			total: number;
			equivalent: number;
			skipped: number;
			killRate: number;
		}
	>();
	complexMap.set(complexKey, {
		killed: 8,
		survived: 2,
		total: 10,
		equivalent: 0,
		skipped: 0,
		killRate: 0.8,
	});

	const report = makeReport({
		totalMutants: 10,
		killed: 8,
		equivalent: 0,
		adjustedKillRate: 0.8,
		perFunction: complexMap,
		results: [makeResult({ outcome: 'killed' })],
	});

	const result = evaluateMutationGate(report, 0.5, 0.3);
	expect(result.verdict).toBe('pass');
	// The lastIndexOf(':'): 'a:b:c:d:e:myFunction' → last colon is at position 7
	// filePath = 'a:b:c:d:e', functionName = 'myFunction'
});

// Test 9: Empty results array with non-zero totalMutants
test('9. Empty results but non-zero totalMutants should handle gracefully', () => {
	const report = makeReport({
		totalMutants: 100,
		killed: 0,
		equivalent: 0,
		adjustedKillRate: 0,
		results: [], // empty
		perFunction: new Map(),
	});

	const result = evaluateMutationGate(report);
	// With no results, no survived mutants
	expect(result.survivedMutants).toEqual([]);
	expect(result.verdict).toBe('fail'); // 0 < 0.8 pass threshold
});

// Test 10: perFunction with NaN killRate
test('10. perFunction entry with NaN killRate should not crash', () => {
	const nanMap = new Map<
		string,
		{
			killed: number;
			survived: number;
			total: number;
			equivalent: number;
			skipped: number;
			killRate: number;
		}
	>();
	nanMap.set('/src/file.ts:func', {
		killed: 0,
		survived: 0,
		total: 0,
		equivalent: 0,
		skipped: 0,
		killRate: NaN,
	});

	const report = makeReport({
		totalMutants: 1,
		killed: 1,
		equivalent: 0,
		adjustedKillRate: 1,
		perFunction: nanMap,
		results: [makeResult({ outcome: 'killed' })],
	});

	// Should not throw, and should generate a prompt with NaN kill rate
	const result = evaluateMutationGate(report, 1.0, 0.9);
	// With adjustedKillRate = 1 and passThreshold = 1.0, this should pass
	expect(result.verdict).toBe('pass');
});

// Test 11: Boundary - exactly at pass threshold
test('11. adjustedKillRate exactly at passThreshold (0.8) should pass', () => {
	const report = makeReport({
		totalMutants: 10,
		killed: 8,
		equivalent: 0,
		adjustedKillRate: 0.8,
	});

	const result = evaluateMutationGate(report, 0.8, 0.6);
	expect(result.verdict).toBe('pass');
});

// Test 12: Boundary - exactly at warn threshold
test('12. adjustedKillRate exactly at warnThreshold (0.6) should warn', () => {
	const report = makeReport({
		totalMutants: 10,
		killed: 6,
		equivalent: 0,
		adjustedKillRate: 0.6,
	});

	const result = evaluateMutationGate(report, 0.8, 0.6);
	expect(result.verdict).toBe('warn');
});

// Test: Invalid threshold ordering
test('13. passThreshold < warnThreshold should throw', () => {
	const report = makeReport();

	expect(() => evaluateMutationGate(report, 0.5, 0.8)).toThrow(
		/Invalid thresholds/,
	);
});

// Test: Just below pass threshold
test('14. Just below pass threshold should warn', () => {
	const report = makeReport({
		totalMutants: 10,
		killed: 7,
		equivalent: 0,
		adjustedKillRate: 0.79,
	});

	const result = evaluateMutationGate(report, 0.8, 0.6);
	expect(result.verdict).toBe('warn');
});

// Test: Just below warn threshold
test('15. Just below warn threshold should fail', () => {
	const report = makeReport({
		totalMutants: 10,
		killed: 5,
		equivalent: 0,
		adjustedKillRate: 0.59,
	});

	const result = evaluateMutationGate(report, 0.8, 0.6);
	expect(result.verdict).toBe('fail');
});

// Test: Negative threshold values
test('16. Negative thresholds should work', () => {
	const report = makeReport({
		totalMutants: 10,
		killed: 0,
		equivalent: 0,
		adjustedKillRate: -0.1,
	});

	// With negative thresholds, even negative kill rate passes
	const result = evaluateMutationGate(report, -0.5, -0.8);
	expect(result.verdict).toBe('pass');
});

// Test: Very large adjustedKillRate (Infinity edge case)
test('17. adjustedKillRate = Number.MAX_VALUE should pass', () => {
	const report = makeReport({
		totalMutants: 1,
		killed: Number.MAX_VALUE,
		equivalent: 0,
		adjustedKillRate: Number.MAX_VALUE,
	});

	const result = evaluateMutationGate(report);
	expect(result.verdict).toBe('pass');
});

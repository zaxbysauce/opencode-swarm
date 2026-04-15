import { describe, expect, test } from 'bun:test';
import {
	computeFlakyScore,
	detectFlakyTests,
	isTestQuarantined,
} from '../flaky-detector.js';
import type { TestRunRecord } from '../history-store.js';

function makeRecord(
	overrides: Partial<TestRunRecord> & {
		testFile: string;
		testName: string;
		result: 'pass' | 'fail' | 'skip';
	},
): TestRunRecord {
	return {
		timestamp: '2024-01-01T00:00:00.000Z',
		taskId: '1.1',
		durationMs: 100,
		changedFiles: [],
		...overrides,
	};
}

describe('computeFlakyScore', () => {
	test('returns 0 for empty history', () => {
		const result = computeFlakyScore([]);
		expect(result).toBe(0);
	});

	test('returns 0 for single run', () => {
		const history = [
			makeRecord({ testFile: 'a.test.ts', testName: 'test1', result: 'pass' }),
		];
		const result = computeFlakyScore(history);
		expect(result).toBe(0);
	});

	test('perfect alternation (P,F,P,F) = 3/4 = 0.75', () => {
		const history = [
			makeRecord({ testFile: 'a.test.ts', testName: 'test1', result: 'pass' }),
			makeRecord({ testFile: 'a.test.ts', testName: 'test1', result: 'fail' }),
			makeRecord({ testFile: 'a.test.ts', testName: 'test1', result: 'pass' }),
			makeRecord({ testFile: 'a.test.ts', testName: 'test1', result: 'fail' }),
		];
		const result = computeFlakyScore(history);
		expect(result).toBe(0.75);
	});

	test('no alternation (P,P,P,P) = 0/4 = 0', () => {
		const history = [
			makeRecord({ testFile: 'a.test.ts', testName: 'test1', result: 'pass' }),
			makeRecord({ testFile: 'a.test.ts', testName: 'test1', result: 'pass' }),
			makeRecord({ testFile: 'a.test.ts', testName: 'test1', result: 'pass' }),
			makeRecord({ testFile: 'a.test.ts', testName: 'test1', result: 'pass' }),
		];
		const result = computeFlakyScore(history);
		expect(result).toBe(0);
	});

	test('limits to last 20 runs', () => {
		// 25 runs: first 5 are pass, last 20 alternate (F,P,F,P,...)
		const history: TestRunRecord[] = [];
		for (let i = 0; i < 5; i++) {
			history.push(
				makeRecord({
					testFile: 'a.test.ts',
					testName: 'test1',
					result: 'pass',
				}),
			);
		}
		for (let i = 0; i < 20; i++) {
			history.push(
				makeRecord({
					testFile: 'a.test.ts',
					testName: 'test1',
					result: i % 2 === 0 ? 'fail' : 'pass',
				}),
			);
		}
		// Alternation in last 20: 19 alternations out of 20 = 0.95
		const result = computeFlakyScore(history);
		expect(result).toBe(0.95);
	});
});

describe('detectFlakyTests', () => {
	test('groups by (testFile, testName)', () => {
		const history = [
			makeRecord({ testFile: 'a.test.ts', testName: 'test1', result: 'pass' }),
			makeRecord({ testFile: 'a.test.ts', testName: 'test1', result: 'fail' }),
			makeRecord({ testFile: 'a.test.ts', testName: 'test2', result: 'pass' }),
			makeRecord({ testFile: 'a.test.ts', testName: 'test2', result: 'pass' }),
		];
		const results = detectFlakyTests(history);
		expect(results.length).toBe(2);
		const entry1 = results.find((r) => r.testName === 'test1');
		const entry2 = results.find((r) => r.testName === 'test2');
		expect(entry1?.totalRuns).toBe(2);
		expect(entry2?.totalRuns).toBe(2);
	});

	test('quarantines tests with score > 0.3 AND runs >= 5', () => {
		// 5 runs with 4 alternations: P,F,P,F,P = 4/5 = 0.8 > 0.3
		const history = [
			makeRecord({ testFile: 'a.test.ts', testName: 'flaky', result: 'pass' }),
			makeRecord({ testFile: 'a.test.ts', testName: 'flaky', result: 'fail' }),
			makeRecord({ testFile: 'a.test.ts', testName: 'flaky', result: 'pass' }),
			makeRecord({ testFile: 'a.test.ts', testName: 'flaky', result: 'fail' }),
			makeRecord({ testFile: 'a.test.ts', testName: 'flaky', result: 'pass' }),
		];
		const results = detectFlakyTests(history);
		expect(results.length).toBe(1);
		expect(results[0].isQuarantined).toBe(true);
		expect(results[0].flakyScore).toBe(0.8);
	});

	test('does NOT quarantine with < 5 runs even if score > 0.3', () => {
		// 4 runs with 3 alternations: score = 3/4 = 0.75 > 0.3, but only 4 runs
		const history = [
			makeRecord({ testFile: 'a.test.ts', testName: 'flaky', result: 'pass' }),
			makeRecord({ testFile: 'a.test.ts', testName: 'flaky', result: 'fail' }),
			makeRecord({ testFile: 'a.test.ts', testName: 'flaky', result: 'pass' }),
			makeRecord({ testFile: 'a.test.ts', testName: 'flaky', result: 'fail' }),
		];
		const results = detectFlakyTests(history);
		expect(results.length).toBe(1);
		expect(results[0].isQuarantined).toBe(false);
	});

	test('recommendation for highly unstable (alternationCount === totalRuns - 1)', () => {
		// 5 runs: P,F,P,F,P — alternationCount = 4 = totalRuns - 1
		const history = [
			makeRecord({
				testFile: 'a.test.ts',
				testName: 'highly-unstable',
				result: 'pass',
			}),
			makeRecord({
				testFile: 'a.test.ts',
				testName: 'highly-unstable',
				result: 'fail',
			}),
			makeRecord({
				testFile: 'a.test.ts',
				testName: 'highly-unstable',
				result: 'pass',
			}),
			makeRecord({
				testFile: 'a.test.ts',
				testName: 'highly-unstable',
				result: 'fail',
			}),
			makeRecord({
				testFile: 'a.test.ts',
				testName: 'highly-unstable',
				result: 'pass',
			}),
		];
		const results = detectFlakyTests(history);
		expect(results[0].recommendation).toContain('Highly unstable');
	});

	test('recommendation for severely flaky (score > 0.5)', () => {
		// 10 runs with 6 alternations: score = 0.6 > 0.5 but not perfect alternation
		const history: TestRunRecord[] = [];
		for (let i = 0; i < 10; i++) {
			history.push(
				makeRecord({
					testFile: 'a.test.ts',
					testName: 'severely-flaky',
					result: i === 0 || i === 3 || i === 6 || i === 9 ? 'pass' : 'fail',
				}),
			);
		}
		const results = detectFlakyTests(history);
		expect(results[0].recommendation).toContain('Severely flaky');
	});

	test('recommendation for moderately flaky (score > 0.3, <= 0.5)', () => {
		// 10 runs with 4 alternations: P,F,P,F,P,P,P,P,P,P = 4/10 = 0.4
		const history: TestRunRecord[] = [];
		for (let i = 0; i < 10; i++) {
			history.push(
				makeRecord({
					testFile: 'a.test.ts',
					testName: 'moderately-flaky',
					result: i === 1 || i === 3 ? 'fail' : 'pass',
				}),
			);
		}
		const results = detectFlakyTests(history);
		expect(results.length).toBe(1);
		expect(results[0].flakyScore).toBe(0.4);
		expect(results[0].recommendation).toContain('Moderately flaky');
	});

	test('no recommendation for non-quarantined tests', () => {
		// 4 runs with alternation: score = 0.75 > 0.3 but only 4 runs (not quarantined)
		const history = [
			makeRecord({ testFile: 'a.test.ts', testName: 'flaky', result: 'pass' }),
			makeRecord({ testFile: 'a.test.ts', testName: 'flaky', result: 'fail' }),
			makeRecord({ testFile: 'a.test.ts', testName: 'flaky', result: 'pass' }),
			makeRecord({ testFile: 'a.test.ts', testName: 'flaky', result: 'fail' }),
		];
		const results = detectFlakyTests(history);
		expect(results[0].recommendation).toBeUndefined();
	});

	test('handles test names containing | character', () => {
		const history = [
			makeRecord({
				testFile: 'a.test.ts',
				testName: 'test | with | pipes',
				result: 'pass',
			}),
			makeRecord({
				testFile: 'a.test.ts',
				testName: 'test | with | pipes',
				result: 'fail',
			}),
			makeRecord({
				testFile: 'a.test.ts',
				testName: 'test | with | pipes',
				result: 'pass',
			}),
			makeRecord({
				testFile: 'a.test.ts',
				testName: 'test | with | pipes',
				result: 'fail',
			}),
			makeRecord({
				testFile: 'a.test.ts',
				testName: 'test | with | pipes',
				result: 'pass',
			}),
		];
		const results = detectFlakyTests(history);
		expect(results.length).toBe(1);
		expect(results[0].testName).toBe('test | with | pipes');
		expect(results[0].isQuarantined).toBe(true);
	});
});

describe('isTestQuarantined', () => {
	test('returns false for empty history', () => {
		const result = isTestQuarantined('a.test.ts', 'test1', []);
		expect(result).toBe(false);
	});

	test('returns true for quarantined test', () => {
		const history = [
			makeRecord({ testFile: 'a.test.ts', testName: 'flaky', result: 'pass' }),
			makeRecord({ testFile: 'a.test.ts', testName: 'flaky', result: 'fail' }),
			makeRecord({ testFile: 'a.test.ts', testName: 'flaky', result: 'pass' }),
			makeRecord({ testFile: 'a.test.ts', testName: 'flaky', result: 'fail' }),
			makeRecord({ testFile: 'a.test.ts', testName: 'flaky', result: 'pass' }),
		];
		const result = isTestQuarantined('a.test.ts', 'flaky', history);
		expect(result).toBe(true);
	});

	test('returns false for non-quarantined test', () => {
		const history = [
			makeRecord({ testFile: 'a.test.ts', testName: 'flaky', result: 'pass' }),
			makeRecord({ testFile: 'a.test.ts', testName: 'flaky', result: 'pass' }),
			makeRecord({ testFile: 'a.test.ts', testName: 'flaky', result: 'pass' }),
			makeRecord({ testFile: 'a.test.ts', testName: 'flaky', result: 'pass' }),
			makeRecord({ testFile: 'a.test.ts', testName: 'flaky', result: 'pass' }),
		];
		const result = isTestQuarantined('a.test.ts', 'flaky', history);
		expect(result).toBe(false);
	});
});

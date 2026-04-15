import { describe, expect, test } from 'bun:test';
import type { MutationReport, MutationResult } from '../engine.js';
import {
	evaluateMutationGate,
	PASS_THRESHOLD,
	WARN_THRESHOLD,
} from '../gate.js';

function createMutationReport(
	overrides: Partial<MutationReport> = {},
): MutationReport {
	const defaultReport: MutationReport = {
		totalMutants: 10,
		killed: 8,
		survived: 2,
		timeout: 0,
		equivalent: 0,
		skipped: 0,
		errors: 0,
		killRate: 0.8,
		adjustedKillRate: 0.8,
		perFunction: new Map(),
		results: [],
		durationMs: 1000,
		budgetMs: 300000,
		budgetExceeded: false,
		timestamp: new Date().toISOString(),
		...overrides,
	};
	return defaultReport;
}

function createMutationResult(
	outcome: MutationResult['outcome'],
): MutationResult {
	return {
		patchId: `patch-${Math.random().toString(36).slice(2)}`,
		filePath: '/path/to/file.ts',
		functionName: 'testFunction',
		mutationType: 'arithmetic',
		outcome,
		durationMs: 100,
	};
}

describe('evaluateMutationGate', () => {
	describe('verdicts', () => {
		test('PASS verdict when adjustedKillRate >= 0.80', () => {
			const report = createMutationReport({
				adjustedKillRate: 0.85,
				killed: 85,
				totalMutants: 100,
			});
			const result = evaluateMutationGate(report);
			expect(result.verdict).toBe('pass');
			expect(result.adjustedKillRate).toBe(0.85);
		});

		test('PASS verdict when adjustedKillRate equals pass threshold exactly (0.80)', () => {
			const report = createMutationReport({
				adjustedKillRate: PASS_THRESHOLD,
				killed: 80,
				totalMutants: 100,
			});
			const result = evaluateMutationGate(report);
			expect(result.verdict).toBe('pass');
		});

		test('WARN verdict when adjustedKillRate between 0.60 and 0.79', () => {
			const report = createMutationReport({
				adjustedKillRate: 0.65,
				killed: 65,
				totalMutants: 100,
			});
			const result = evaluateMutationGate(report);
			expect(result.verdict).toBe('warn');
			expect(result.adjustedKillRate).toBe(0.65);
		});

		test('WARN verdict when adjustedKillRate equals warn threshold exactly (0.60)', () => {
			const report = createMutationReport({
				adjustedKillRate: WARN_THRESHOLD,
				killed: 60,
				totalMutants: 100,
			});
			const result = evaluateMutationGate(report);
			expect(result.verdict).toBe('warn');
		});

		test('FAIL verdict when adjustedKillRate < 0.60', () => {
			const report = createMutationReport({
				adjustedKillRate: 0.45,
				killed: 45,
				totalMutants: 100,
			});
			const result = evaluateMutationGate(report);
			expect(result.verdict).toBe('fail');
			expect(result.adjustedKillRate).toBe(0.45);
		});

		test('FAIL verdict when adjustedKillRate = 0 (zero mutants)', () => {
			const report = createMutationReport({
				adjustedKillRate: 0,
				killed: 0,
				totalMutants: 0,
				survived: 0,
			});
			const result = evaluateMutationGate(report);
			expect(result.verdict).toBe('fail');
			expect(result.adjustedKillRate).toBe(0);
		});

		test('PASS verdict when adjustedKillRate = 1.0 (perfect kill rate)', () => {
			const report = createMutationReport({
				adjustedKillRate: 1.0,
				killed: 100,
				totalMutants: 100,
				survived: 0,
			});
			const result = evaluateMutationGate(report);
			expect(result.verdict).toBe('pass');
			expect(result.adjustedKillRate).toBe(1.0);
		});
	});

	describe('custom thresholds', () => {
		test('uses custom passThreshold=0.9 and warnThreshold=0.7', () => {
			const report = createMutationReport({
				adjustedKillRate: 0.85,
				killed: 85,
				totalMutants: 100,
			});
			const result = evaluateMutationGate(report, 0.9, 0.7);
			expect(result.verdict).toBe('warn');
			expect(result.threshold).toBe(0.9);
			expect(result.warnThreshold).toBe(0.7);
		});

		test('PASS with 0.9 threshold when kill rate is 0.95', () => {
			const report = createMutationReport({
				adjustedKillRate: 0.95,
				killed: 95,
				totalMutants: 100,
			});
			const result = evaluateMutationGate(report, 0.9, 0.7);
			expect(result.verdict).toBe('pass');
		});

		test('FAIL with 0.9 threshold when kill rate is 0.5', () => {
			const report = createMutationReport({
				adjustedKillRate: 0.5,
				killed: 50,
				totalMutants: 100,
			});
			const result = evaluateMutationGate(report, 0.9, 0.7);
			expect(result.verdict).toBe('fail');
		});
	});

	describe('threshold validation', () => {
		test('throws Error when passThreshold < warnThreshold', () => {
			const report = createMutationReport({
				adjustedKillRate: 0.75,
			});
			expect(() => evaluateMutationGate(report, 0.5, 0.7)).toThrow(
				'Invalid thresholds: passThreshold (0.5) must be >= warnThreshold (0.7)',
			);
		});

		test('throws Error when passThreshold equals warnThreshold (edge case)', () => {
			const report = createMutationReport({
				adjustedKillRate: 0.75,
			});
			expect(() => evaluateMutationGate(report, 0.7, 0.7)).not.toThrow();
		});

		test('does not throw when passThreshold > warnThreshold', () => {
			const report = createMutationReport({
				adjustedKillRate: 0.75,
			});
			expect(() => evaluateMutationGate(report, 0.8, 0.6)).not.toThrow();
		});
	});

	describe('survivedMutants extraction', () => {
		test('extracts survived mutants correctly', () => {
			const results: MutationResult[] = [
				{ ...createMutationResult('killed'), patchId: '1' },
				{ ...createMutationResult('survived'), patchId: '2' },
				{ ...createMutationResult('killed'), patchId: '3' },
				{ ...createMutationResult('survived'), patchId: '4' },
				{ ...createMutationResult('equivalent'), patchId: '5' },
			];
			const report = createMutationReport({
				results,
				survived: 2,
			});
			const result = evaluateMutationGate(report);
			expect(result.survivedMutants).toHaveLength(2);
			expect(
				result.survivedMutants.every((m) => m.outcome === 'survived'),
			).toBe(true);
		});

		test('survivedMutants is empty when all mutants killed', () => {
			const results: MutationResult[] = [
				{ ...createMutationResult('killed'), patchId: '1' },
				{ ...createMutationResult('killed'), patchId: '2' },
			];
			const report = createMutationReport({
				results,
				survived: 0,
			});
			const result = evaluateMutationGate(report);
			expect(result.survivedMutants).toHaveLength(0);
		});
	});

	describe('testImprovementPrompt', () => {
		test('testImprovementPrompt is empty for PASS verdict', () => {
			const results: MutationResult[] = [
				{
					...createMutationResult('killed'),
					patchId: '1',
					functionName: 'func1',
					filePath: '/path/f1.ts',
				},
				{
					...createMutationResult('killed'),
					patchId: '2',
					functionName: 'func2',
					filePath: '/path/f2.ts',
				},
			];
			const perFunction = new Map<
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
			perFunction.set('/path/f1.ts:func1', {
				killed: 1,
				survived: 0,
				total: 1,
				equivalent: 0,
				skipped: 0,
				killRate: 1.0,
			});
			perFunction.set('/path/f2.ts:func2', {
				killed: 1,
				survived: 0,
				total: 1,
				equivalent: 0,
				skipped: 0,
				killRate: 1.0,
			});

			const report = createMutationReport({
				results,
				adjustedKillRate: 1.0,
				perFunction,
			});
			const result = evaluateMutationGate(report);
			expect(result.testImprovementPrompt).toBe('');
		});

		test('testImprovementPrompt is non-empty for WARN verdict', () => {
			const results: MutationResult[] = [
				{
					...createMutationResult('survived'),
					patchId: '1',
					functionName: 'badFunc',
					filePath: '/path/bad.ts',
				},
				{
					...createMutationResult('killed'),
					patchId: '2',
					functionName: 'goodFunc',
					filePath: '/path/good.ts',
				},
			];
			const perFunction = new Map<
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
			perFunction.set('/path/bad.ts:badFunc', {
				killed: 0,
				survived: 1,
				total: 1,
				equivalent: 0,
				skipped: 0,
				killRate: 0.0,
			});
			perFunction.set('/path/good.ts:goodFunc', {
				killed: 1,
				survived: 0,
				total: 1,
				equivalent: 0,
				skipped: 0,
				killRate: 1.0,
			});

			const report = createMutationReport({
				results,
				adjustedKillRate: 0.65,
				perFunction,
			});
			const result = evaluateMutationGate(report);
			expect(result.verdict).toBe('warn');
			expect(result.testImprovementPrompt.length).toBeGreaterThan(0);
			expect(result.testImprovementPrompt).toContain('badFunc');
			expect(result.testImprovementPrompt).toContain('0% kill rate');
		});

		test('testImprovementPrompt is non-empty for FAIL verdict', () => {
			const results: MutationResult[] = [
				{
					...createMutationResult('survived'),
					patchId: '1',
					functionName: 'badFunc',
					filePath: '/path/bad.ts',
				},
				{
					...createMutationResult('survived'),
					patchId: '2',
					functionName: 'worseFunc',
					filePath: '/path/bad.ts',
				},
			];
			const perFunction = new Map<
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
			perFunction.set('/path/bad.ts:badFunc', {
				killed: 0,
				survived: 1,
				total: 1,
				equivalent: 0,
				skipped: 0,
				killRate: 0.0,
			});
			perFunction.set('/path/bad.ts:worseFunc', {
				killed: 0,
				survived: 1,
				total: 1,
				equivalent: 0,
				skipped: 0,
				killRate: 0.0,
			});

			const report = createMutationReport({
				results,
				adjustedKillRate: 0.0,
				perFunction,
			});
			const result = evaluateMutationGate(report);
			expect(result.verdict).toBe('fail');
			expect(result.testImprovementPrompt.length).toBeGreaterThan(0);
		});

		test('testImprovementPrompt includes per-function breakdown with correct format', () => {
			const results: MutationResult[] = [
				{
					...createMutationResult('survived'),
					patchId: '1',
					functionName: 'myFunc',
					filePath: '/src/util.ts',
				},
			];
			const perFunction = new Map<
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
			perFunction.set('/src/util.ts:myFunc', {
				killed: 0,
				survived: 1,
				total: 1,
				equivalent: 0,
				skipped: 0,
				killRate: 0.0,
			});

			const report = createMutationReport({
				results,
				adjustedKillRate: 0.0,
				perFunction,
			});
			const result = evaluateMutationGate(report);
			expect(result.testImprovementPrompt).toContain('myFunc');
			expect(result.testImprovementPrompt).toContain('/src/util.ts');
			expect(result.testImprovementPrompt).toContain('0% kill rate');
			expect(result.testImprovementPrompt).toContain('(0/1 killed)');
		});
	});

	describe('perFunction key parsing', () => {
		test('handles Windows-style path with backslashes', () => {
			const results: MutationResult[] = [
				{
					...createMutationResult('survived'),
					patchId: '1',
					functionName: 'testFn',
					filePath: 'C:\\path\\to\\file.ts',
				},
			];
			const perFunction = new Map<
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
			perFunction.set('C:\\path\\to\\file.ts:testFn', {
				killed: 0,
				survived: 1,
				total: 1,
				equivalent: 0,
				skipped: 0,
				killRate: 0.0,
			});

			const report = createMutationReport({
				results,
				adjustedKillRate: 0.0,
				perFunction,
			});
			const result = evaluateMutationGate(report);
			expect(result.testImprovementPrompt).toContain('testFn');
			expect(result.testImprovementPrompt).toContain('C:\\path\\to\\file.ts');
		});

		test('handles path with no colon (skips safely)', () => {
			const results: MutationResult[] = [
				{
					...createMutationResult('survived'),
					patchId: '1',
					functionName: 'func',
					filePath: '/path.ts',
				},
				{
					...createMutationResult('survived'),
					patchId: '2',
					functionName: 'func2',
					filePath: '/path.ts',
				},
			];
			const perFunction = new Map<
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
			perFunction.set('noColonKey', {
				killed: 0,
				survived: 1,
				total: 1,
				equivalent: 0,
				skipped: 0,
				killRate: 0.0,
			});
			perFunction.set('/path.ts:func', {
				killed: 1,
				survived: 1,
				total: 2,
				equivalent: 0,
				skipped: 0,
				killRate: 0.5,
			});
			perFunction.set('/path.ts:func2', {
				killed: 0,
				survived: 1,
				total: 1,
				equivalent: 0,
				skipped: 0,
				killRate: 0.0,
			});

			const report = createMutationReport({
				results,
				adjustedKillRate: 0.33,
				perFunction,
			});
			expect(() => evaluateMutationGate(report)).not.toThrow();
			const result = evaluateMutationGate(report);
			expect(result.testImprovementPrompt).not.toContain('noColonKey');
			expect(result.testImprovementPrompt).toContain('func');
			expect(result.testImprovementPrompt).toContain('func2');
		});

		test('correctly splits key with multiple colons in path', () => {
			const results: MutationResult[] = [
				{
					...createMutationResult('survived'),
					patchId: '1',
					functionName: 'myFunc',
					filePath: '/path/to:weird/file.ts',
				},
			];
			const perFunction = new Map<
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
			perFunction.set('/path/to:weird/file.ts:myFunc', {
				killed: 0,
				survived: 1,
				total: 1,
				equivalent: 0,
				skipped: 0,
				killRate: 0.0,
			});

			const report = createMutationReport({
				results,
				adjustedKillRate: 0.0,
				perFunction,
			});
			const result = evaluateMutationGate(report);
			expect(result.testImprovementPrompt).toContain('myFunc');
			expect(result.testImprovementPrompt).toContain('/path/to:weird/file.ts');
		});
	});

	describe('message formatting', () => {
		test('pass message includes kill rate and counts', () => {
			const report = createMutationReport({
				adjustedKillRate: 0.85,
				killed: 85,
				totalMutants: 100,
				equivalent: 0,
			});
			const result = evaluateMutationGate(report);
			expect(result.message).toContain('PASSED');
			expect(result.message).toContain('85%');
			expect(result.message).toContain('85/100');
		});

		test('warn message includes "WARNING" and "Test improvement recommended"', () => {
			const report = createMutationReport({
				adjustedKillRate: 0.65,
				killed: 65,
				totalMutants: 100,
				equivalent: 0,
			});
			const result = evaluateMutationGate(report);
			expect(result.message).toContain('WARNING');
			expect(result.message).toContain('Test improvement recommended');
		});

		test('fail message includes "FAILED" and threshold info', () => {
			const report = createMutationReport({
				adjustedKillRate: 0.45,
				killed: 45,
				totalMutants: 100,
				equivalent: 0,
			});
			const result = evaluateMutationGate(report);
			expect(result.message).toContain('FAILED');
			expect(result.message).toContain('Below minimum threshold');
		});

		test('message accounts for equivalent mutants in denominator', () => {
			const report = createMutationReport({
				adjustedKillRate: 0.75,
				killed: 75,
				totalMutants: 110,
				equivalent: 10,
			});
			const result = evaluateMutationGate(report);
			expect(result.message).toContain('75/100');
		});
	});

	describe('result object completeness', () => {
		test('returns all required fields in MutationGateResult', () => {
			const report = createMutationReport({
				adjustedKillRate: 0.8,
				killRate: 0.75,
				killed: 80,
				survived: 20,
				totalMutants: 100,
			});
			const result = evaluateMutationGate(report);
			expect(result.verdict).toBeDefined();
			expect(result.killRate).toBe(0.75);
			expect(result.adjustedKillRate).toBe(0.8);
			expect(result.totalMutants).toBe(100);
			expect(result.killed).toBe(80);
			expect(result.survived).toBe(20);
			expect(result.threshold).toBe(PASS_THRESHOLD);
			expect(result.warnThreshold).toBe(WARN_THRESHOLD);
			expect(result.message).toBeDefined();
			expect(result.survivedMutants).toBeDefined();
			expect(result.testImprovementPrompt).toBeDefined();
		});
	});

	describe('default threshold constants', () => {
		test('PASS_THRESHOLD is 0.8', () => {
			expect(PASS_THRESHOLD).toBe(0.8);
		});

		test('WARN_THRESHOLD is 0.6', () => {
			expect(WARN_THRESHOLD).toBe(0.6);
		});
	});
});

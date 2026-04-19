/**
 * Unit tests for PR 2 stageB config schema.
 *
 * Verifies:
 * - stageB.parallel.enabled defaults to false (safe gate)
 * - Explicit true is preserved after parse
 * - Missing stageB field produces correct defaults
 * - ParallelizationConfigSchema round-trips cleanly
 */

import { describe, expect, test } from 'bun:test';
import { ParallelizationConfigSchema } from '../../../src/config/schema';

describe('ParallelizationConfigSchema — stageB defaults', () => {
	test('empty config → stageB.parallel.enabled defaults to false', () => {
		const parsed = ParallelizationConfigSchema.parse({});
		expect(parsed.stageB.parallel.enabled).toBe(false);
	});

	test('explicit enabled:false → stageB.parallel.enabled is false', () => {
		const parsed = ParallelizationConfigSchema.parse({
			stageB: { parallel: { enabled: false } },
		});
		expect(parsed.stageB.parallel.enabled).toBe(false);
	});

	test('explicit enabled:true → stageB.parallel.enabled is true', () => {
		const parsed = ParallelizationConfigSchema.parse({
			stageB: { parallel: { enabled: true } },
		});
		expect(parsed.stageB.parallel.enabled).toBe(true);
	});

	test('stageB omitted → defaults fill in', () => {
		const parsed = ParallelizationConfigSchema.parse({
			enabled: false,
			maxConcurrentTasks: 1,
		});
		expect(parsed.stageB).toBeDefined();
		expect(parsed.stageB.parallel.enabled).toBe(false);
	});

	test('master enabled flag is independent of stageB flag', () => {
		const parsed = ParallelizationConfigSchema.parse({
			enabled: true,
			maxConcurrentTasks: 4,
			stageB: { parallel: { enabled: false } },
		});
		expect(parsed.enabled).toBe(true);
		expect(parsed.stageB.parallel.enabled).toBe(false);
	});

	test('existing fields not broken by stageB addition', () => {
		const parsed = ParallelizationConfigSchema.parse({
			enabled: true,
			maxConcurrentTasks: 8,
			evidenceLockTimeoutMs: 30000,
		});
		expect(parsed.enabled).toBe(true);
		expect(parsed.maxConcurrentTasks).toBe(8);
		expect(parsed.evidenceLockTimeoutMs).toBe(30000);
		expect(parsed.stageB.parallel.enabled).toBe(false);
	});
});

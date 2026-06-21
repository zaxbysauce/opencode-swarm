/**
 * Tests for the calibration engine (Capability D pure rules).
 * File: tests/unit/turbo/epic/calibration-engine.test.ts
 *
 * Covers:
 *  - Single-record behaviours: divergent tightens + records hot module;
 *    clean increments counter; loosen only after window.
 *  - Bounds: threshold never goes below floor; never above static.
 *  - Hot-module list is monotonically growing — loosening never shrinks it.
 *  - SIMULATION INVARIANTS:
 *      a. Convergence: a long sequence of clean tasks brings the threshold
 *         back to static (and no further).
 *      b. Monotonic-tighten: any number of divergent tasks moves the
 *         threshold monotonically toward floor (and never past it).
 *      c. No-oscillation: a divergent record between two clean streaks
 *         resets the clean counter, so we cannot oscillate quickly between
 *         tighten and loosen on noisy data.
 *  - effectiveActivationThreshold / effectiveHotModules helpers.
 */
import { describe, expect, test } from 'bun:test';
import { emptyCalibrationState } from '../../../../src/turbo/epic/calibration';
import {
	applyCalibration,
	effectiveActivationThreshold,
	effectiveHotModules,
} from '../../../../src/turbo/epic/calibration-engine';
import type { DivergenceRecord } from '../../../../src/turbo/epic/divergence-recorder';

function makeRecord(
	overrides: Partial<DivergenceRecord> = {},
): DivergenceRecord {
	const declaredScope = overrides.declaredScope ?? [];
	const actualFiles = overrides.actualFiles ?? [];
	const undeclared = overrides.undeclared ?? [];
	const divergenceRatio = overrides.divergenceRatio ?? 0;
	return {
		timestamp: overrides.timestamp ?? '2025-01-01T00:00:00Z',
		sessionID: overrides.sessionID ?? 'sess-1',
		taskId: overrides.taskId ?? 'T-1',
		phaseNumber: overrides.phaseNumber,
		declaredScope,
		actualFiles,
		undeclared,
		unused: overrides.unused ?? [],
		divergenceRatio,
		isClean: overrides.isClean ?? divergenceRatio === 0,
	};
}

const baseOptions = { staticThreshold: 0.3 };

describe('applyCalibration — single-record behaviour', () => {
	test('clean record increments counter, does NOT loosen below window', () => {
		const state = emptyCalibrationState();
		const next = applyCalibration(state, [makeRecord({ isClean: true })], {
			...baseOptions,
			loosenWindow: 10,
		});
		expect(next.consecutiveCleanCount).toBe(1);
		expect(next.activationThresholdOverride).toBeUndefined();
		expect(next.processedRecords).toBe(1);
	});

	test('divergent record tightens + records the undeclared module', () => {
		const state = emptyCalibrationState();
		const record = makeRecord({
			isClean: false,
			divergenceRatio: 0.5,
			undeclared: ['src/global.ts'],
		});
		const next = applyCalibration(state, [record], baseOptions);
		expect(next.consecutiveCleanCount).toBe(0);
		expect(next.activationThresholdOverride).toBeCloseTo(0.28, 6);
		expect(next.hotModuleAdditions).toEqual(['src/global.ts']);
	});

	test('divergent record after clean streak resets the counter', () => {
		const state = { ...emptyCalibrationState(), consecutiveCleanCount: 5 };
		const next = applyCalibration(
			state,
			[
				makeRecord({
					isClean: false,
					divergenceRatio: 0.5,
					undeclared: ['x.ts'],
				}),
			],
			baseOptions,
		);
		expect(next.consecutiveCleanCount).toBe(0);
	});

	test('loosen fires at exactly loosenWindow consecutive cleans', () => {
		let state = {
			...emptyCalibrationState(),
			activationThresholdOverride: 0.1,
		};
		// 9 cleans → no loosening yet, counter at 9.
		state = applyCalibration(
			state,
			Array.from({ length: 9 }, () => makeRecord({ isClean: true })),
			{ ...baseOptions, loosenWindow: 10, loosenStep: 0.01 },
		);
		expect(state.activationThresholdOverride).toBeCloseTo(0.1, 6);
		expect(state.consecutiveCleanCount).toBe(9);

		// 10th clean → loosen by 0.01, counter resets to 0.
		state = applyCalibration(state, [makeRecord({ isClean: true })], {
			...baseOptions,
			loosenWindow: 10,
			loosenStep: 0.01,
		});
		expect(state.activationThresholdOverride).toBeCloseTo(0.11, 6);
		expect(state.consecutiveCleanCount).toBe(0);
	});
});

describe('applyCalibration — bounds', () => {
	test('threshold never goes below the floor', () => {
		let state = emptyCalibrationState();
		const lotsOfDivergent = Array.from({ length: 50 }, (_, i) =>
			makeRecord({
				isClean: false,
				divergenceRatio: 0.5,
				undeclared: [`src/m${i}.ts`],
				taskId: `T-${i}`,
			}),
		);
		state = applyCalibration(state, lotsOfDivergent, {
			...baseOptions,
			floorThreshold: 0.05,
			tightenStep: 0.05,
		});
		// (0.3 - 50*0.05) would be -2.2; clamped at 0.05.
		expect(state.activationThresholdOverride).toBeCloseTo(0.05, 6);
	});

	test('loosening never exceeds the static ceiling', () => {
		let state = {
			...emptyCalibrationState(),
			activationThresholdOverride: 0.29,
		};
		const lotsOfClean = Array.from({ length: 100 }, () =>
			makeRecord({ isClean: true }),
		);
		state = applyCalibration(state, lotsOfClean, {
			...baseOptions,
			loosenWindow: 1,
			loosenStep: 1,
		});
		// Could not exceed staticThreshold (0.3). And once equal to static the
		// engine drops the override entirely.
		expect(state.activationThresholdOverride).toBeUndefined();
	});

	test('override is dropped when calibration value equals static', () => {
		let state = {
			...emptyCalibrationState(),
			activationThresholdOverride: 0.29,
		};
		state = applyCalibration(
			state,
			Array.from({ length: 1 }, () => makeRecord({ isClean: true })),
			{ ...baseOptions, loosenWindow: 1, loosenStep: 0.01 },
		);
		expect(state.activationThresholdOverride).toBeUndefined();
	});
});

describe('applyCalibration — hot-module monotonic growth', () => {
	test('loosening does NOT shrink the hot-module list', () => {
		let state = emptyCalibrationState();
		state = applyCalibration(
			state,
			[
				makeRecord({
					isClean: false,
					divergenceRatio: 0.5,
					undeclared: ['src/hot.ts'],
				}),
			],
			baseOptions,
		);
		expect(state.hotModuleAdditions).toEqual(['src/hot.ts']);

		state = applyCalibration(
			state,
			Array.from({ length: 50 }, () => makeRecord({ isClean: true })),
			{ ...baseOptions, loosenWindow: 1, loosenStep: 0.05 },
		);
		// Hot module persists across many loosening events.
		expect(state.hotModuleAdditions).toEqual(['src/hot.ts']);
	});

	test('duplicate undeclared paths are de-duplicated across records', () => {
		let state = emptyCalibrationState();
		state = applyCalibration(
			state,
			[
				makeRecord({
					isClean: false,
					divergenceRatio: 1,
					undeclared: ['src/a.ts', 'src/b.ts'],
				}),
				makeRecord({
					isClean: false,
					divergenceRatio: 1,
					undeclared: ['src/a.ts', 'src/c.ts'],
				}),
			],
			baseOptions,
		);
		expect(state.hotModuleAdditions).toEqual([
			'src/a.ts',
			'src/b.ts',
			'src/c.ts',
		]);
	});
});

describe('Simulation invariants', () => {
	test('CONVERGENCE: a long clean streak returns threshold to static', () => {
		let state = {
			...emptyCalibrationState(),
			activationThresholdOverride: 0.05,
		};
		// 500 clean records with a small loosen step.
		state = applyCalibration(
			state,
			Array.from({ length: 500 }, () => makeRecord({ isClean: true })),
			{ ...baseOptions, loosenWindow: 5, loosenStep: 0.01 },
		);
		const final = effectiveActivationThreshold(0.3, state);
		expect(final).toBe(0.3);
	});

	test('MONOTONIC-TIGHTEN: divergent stream only moves toward floor', () => {
		let state = emptyCalibrationState();
		let previous = baseOptions.staticThreshold;
		for (let i = 0; i < 20; i++) {
			state = applyCalibration(
				state,
				[
					makeRecord({
						isClean: false,
						divergenceRatio: 0.5,
						undeclared: [`src/m${i}.ts`],
						taskId: `T-${i}`,
					}),
				],
				{ ...baseOptions, floorThreshold: 0.05, tightenStep: 0.02 },
			);
			const current = effectiveActivationThreshold(0.3, state);
			expect(current).toBeLessThanOrEqual(previous);
			previous = current;
		}
		// And it must respect the floor.
		expect(previous).toBeGreaterThanOrEqual(0.05);
	});

	test('NO-OSCILLATION: a divergent record between clean streaks resets the counter', () => {
		let state = emptyCalibrationState();
		// 9 cleans — one short of the window.
		state = applyCalibration(
			state,
			Array.from({ length: 9 }, () => makeRecord({ isClean: true })),
			{ ...baseOptions, loosenWindow: 10, loosenStep: 0.01 },
		);
		const beforeBlip = state.activationThresholdOverride; // undefined (still static)

		// One divergent task in the middle.
		state = applyCalibration(
			state,
			[
				makeRecord({
					isClean: false,
					divergenceRatio: 0.5,
					undeclared: ['src/blip.ts'],
				}),
			],
			{ ...baseOptions, tightenStep: 0.02, loosenWindow: 10 },
		);
		expect(state.consecutiveCleanCount).toBe(0);
		// Threshold tightened — proof we didn't keep accreting clean credit.
		expect(state.activationThresholdOverride).toBeLessThan(0.3);
		expect(state.activationThresholdOverride).not.toBe(beforeBlip);

		// 9 more cleans — still NOT enough to loosen back.
		state = applyCalibration(
			state,
			Array.from({ length: 9 }, () => makeRecord({ isClean: true })),
			{ ...baseOptions, loosenWindow: 10, loosenStep: 0.01 },
		);
		expect(state.consecutiveCleanCount).toBe(9);
		// Still under static — loosen has not fired yet.
		expect(effectiveActivationThreshold(0.3, state)).toBeLessThan(0.3);
	});

	test('determinism — the same input twice yields the same output', () => {
		const records = Array.from({ length: 100 }, (_, i) =>
			makeRecord({
				isClean: i % 3 !== 0,
				divergenceRatio: i % 3 === 0 ? 0.4 : 0,
				undeclared: i % 3 === 0 ? [`src/file${i}.ts`] : [],
				taskId: `T-${i}`,
				// keep the timestamp identical so updatedAt is reproducible
				timestamp: '2025-01-01T00:00:00Z',
			}),
		);
		const a = applyCalibration(emptyCalibrationState(), records, {
			...baseOptions,
			loosenWindow: 5,
		});
		const b = applyCalibration(emptyCalibrationState(), records, {
			...baseOptions,
			loosenWindow: 5,
		});
		// lastCalibrationAt is wall-clock — strip it before comparing.
		const { lastCalibrationAt: _a, updatedAt: _ua, ...aShape } = a;
		const { lastCalibrationAt: _b, updatedAt: _ub, ...bShape } = b;
		expect(aShape).toEqual(bShape);
	});
});

describe('effectiveActivationThreshold / effectiveHotModules', () => {
	test('falls back to static when calibration state is null', () => {
		expect(effectiveActivationThreshold(0.3, null)).toBe(0.3);
		expect(effectiveHotModules(['a'], null)).toEqual(['a']);
	});

	test('respects the static ceiling even on a corrupt override', () => {
		const state = {
			...emptyCalibrationState(),
			activationThresholdOverride: 0.9,
		};
		expect(effectiveActivationThreshold(0.3, state)).toBe(0.3);
	});

	test('clamps to zero on a corrupt negative override (adversarial M3)', () => {
		const state = {
			...emptyCalibrationState(),
			activationThresholdOverride: -0.5,
		};
		expect(effectiveActivationThreshold(0.3, state)).toBe(0);
	});

	test('merges static hot modules with calibration additions, dedups', () => {
		const state = {
			...emptyCalibrationState(),
			hotModuleAdditions: ['src/a.ts', 'src/b.ts'],
		};
		const merged = effectiveHotModules(['src/a.ts', 'src/c.ts'], state);
		expect(merged.sort()).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
	});
});

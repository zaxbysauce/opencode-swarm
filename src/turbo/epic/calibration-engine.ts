/**
 * Calibration engine for Epic Mode Capability D.
 *
 * `applyCalibration(state, newRecords, options) → newState` is a pure
 * function that walks fresh divergence records (those not yet processed)
 * and produces an updated calibration state. The wiring code is responsible
 * for: (a) reading the prior state, (b) filtering history to the
 * unprocessed tail, (c) writing the new state.
 *
 * Hard design rules (brief §4.5-D + the user's ratified §20.3 defaults):
 *
 *   1. **Auto-tighten only on threshold.** A divergent task tightens
 *      `activationThresholdOverride` toward zero by `tightenStep`,
 *      bounded by `floorThreshold` (we never tighten below the floor —
 *      a value too small makes Epic Mode never promote anything).
 *
 *   2. **Hot-module list monotonically grows.** Files in a divergent
 *      task's `undeclared` set are added to `hotModuleAdditions`. The
 *      list is NEVER auto-shrunk; loosening a hot-module promotion
 *      requires manual intervention. This is a one-way ratchet.
 *
 *   3. **Loosen only after `loosenWindow` consecutive clean tasks.**
 *      Every clean (divergenceRatio === 0) task increments
 *      `consecutiveCleanCount`; every divergent task resets it to zero.
 *      When the counter reaches `loosenWindow`, the threshold is loosened
 *      by `loosenStep` toward the static config value (never past it) and
 *      the counter resets to zero. The hot-module list is NOT shrunk by
 *      loosening — only the threshold relaxes.
 *
 *   4. **No oscillation.** A clean-then-divergent-then-clean sequence
 *      cannot swing the threshold back and forth: every divergent task
 *      resets the clean-counter and tightens by `tightenStep`, so the
 *      threshold only moves toward zero in the divergent direction and
 *      toward the static value (with the clean-window gate) in the
 *      clean direction. Tests assert this invariant.
 */

import { normalizePath } from '../lean/conflicts.js';
import type { CalibrationState } from './calibration.js';
import type { DivergenceRecord } from './divergence-recorder.js';

export interface ApplyCalibrationOptions {
	/** Static config value — the absolute ceiling for the threshold. */
	staticThreshold: number;
	/**
	 * Floor for the threshold — calibration never tightens past this.
	 * Default 0.05 — below that, Epic Mode effectively never promotes
	 * even on highly-decoupled plans.
	 */
	floorThreshold?: number;
	/** Per-divergent-task tightening step. Default 0.02. */
	tightenStep?: number;
	/** Per-loosening-event step (toward static). Default 0.01. */
	loosenStep?: number;
	/** Consecutive-clean-tasks required before any loosening. Default 10. */
	loosenWindow?: number;
}

const DEFAULT_FLOOR = 0.05;
const DEFAULT_TIGHTEN_STEP = 0.02;
const DEFAULT_LOOSEN_STEP = 0.01;
const DEFAULT_LOOSEN_WINDOW = 10;

/**
 * Apply the calibration rules to a chronological list of NEW divergence
 * records. Pure — no I/O, no side effects, deterministic for a given
 * (state, newRecords, options) triple.
 *
 * The caller is responsible for tracking which records are "new" (typically
 * by reading the full divergence history and slicing past the
 * `processedRecords` count from the current state). This function does
 * not deduplicate — feeding the same record twice will double-count its
 * effect.
 */
export function applyCalibration(
	state: CalibrationState,
	newRecords: readonly DivergenceRecord[],
	options: ApplyCalibrationOptions,
): CalibrationState {
	const floor = options.floorThreshold ?? DEFAULT_FLOOR;
	const tightenStep = options.tightenStep ?? DEFAULT_TIGHTEN_STEP;
	const loosenStep = options.loosenStep ?? DEFAULT_LOOSEN_STEP;
	const loosenWindow = options.loosenWindow ?? DEFAULT_LOOSEN_WINDOW;

	// Start from a clone so the input is never mutated.
	let effectiveThreshold =
		state.activationThresholdOverride ?? options.staticThreshold;
	let consecutiveCleanCount = state.consecutiveCleanCount;
	const hotSet = new Set(state.hotModuleAdditions);

	for (const record of newRecords) {
		if (record.isClean) {
			consecutiveCleanCount += 1;
			if (consecutiveCleanCount >= loosenWindow) {
				// Loosen the threshold toward static, capped at static.
				effectiveThreshold = Math.min(
					options.staticThreshold,
					effectiveThreshold + loosenStep,
				);
				// Reset the counter — require another full window before
				// loosening again. (Prevents runaway loosening on a long
				// clean streak.)
				consecutiveCleanCount = 0;
			}
		} else {
			// Divergent task: tighten + promote undeclared modules + reset counter.
			consecutiveCleanCount = 0;
			effectiveThreshold = Math.max(floor, effectiveThreshold - tightenStep);
			for (const undeclaredFile of record.undeclared) {
				hotSet.add(normalizePath(undeclaredFile));
			}
		}
	}

	// Materialise the override: only persist a threshold override when it
	// actually differs from the static value. Storing the static value as
	// an override would be noise and would prevent future static config
	// changes from taking effect.
	const newOverride =
		effectiveThreshold === options.staticThreshold
			? undefined
			: effectiveThreshold;

	return {
		version: 1,
		updatedAt: state.updatedAt, // saveCalibrationState refreshes this.
		activationThresholdOverride: newOverride,
		hotModuleAdditions: Array.from(hotSet).sort(),
		consecutiveCleanCount,
		lastCalibrationAt:
			newRecords.length > 0
				? new Date().toISOString()
				: state.lastCalibrationAt,
		processedRecords: state.processedRecords + newRecords.length,
	};
}

/**
 * Resolve the effective activation threshold by combining the static config
 * value with the calibration override (if any). The override is always a
 * tighter or equal value to the static — calibration can never relax past
 * static. Returns the static value when calibration state is null
 * (fail-closed mode) or when no override is set.
 *
 * Belt-and-braces clamps:
 *  - upper bound: static ceiling (calibration never relaxes past it)
 *  - lower bound: 0 (a negative or absurdly small override — e.g. from a
 *    hand-edited calibration.json — would make Epic Mode never promote
 *    anything; treat 0 as the absolute floor here; callers that pass a
 *    higher `floor_threshold` to the engine get that bound at WRITE time,
 *    so this clamp only matters for corrupt on-disk values)
 */
export function effectiveActivationThreshold(
	staticThreshold: number,
	state: CalibrationState | null,
): number {
	if (!state || state.activationThresholdOverride === undefined) {
		return staticThreshold;
	}
	return Math.max(
		0,
		Math.min(staticThreshold, state.activationThresholdOverride),
	);
}

/**
 * Union the static hot-module list (Lean Turbo's globals + protected) with
 * the calibration's learned additions. Returns a fresh array; callers can
 * pass this to `decideEpicActivation`'s effective-hot-module check.
 */
export function effectiveHotModules(
	staticHotModules: readonly string[],
	state: CalibrationState | null,
): string[] {
	if (!state || state.hotModuleAdditions.length === 0) {
		return Array.from(staticHotModules);
	}
	return Array.from(
		new Set([...staticHotModules, ...state.hotModuleAdditions]),
	);
}

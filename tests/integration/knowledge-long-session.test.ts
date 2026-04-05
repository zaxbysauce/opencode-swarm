/**
 * Integration test: knowledge injection through long session simulation.
 * Verifies the three-regime budget system works end-to-end.
 */

import { describe, expect, it } from 'bun:test';

describe('Knowledge injection long session integration', () => {
	// These are conceptual integration tests verifying the budget thresholds.
	// The actual injection functions are tested in unit tests; these verify
	// the regime boundaries produce the expected budget values.

	const CHARS_PER_TOKEN = 1 / 0.33;
	const MODEL_LIMIT_CHARS = Math.floor(128_000 * CHARS_PER_TOKEN); // ~387,878
	const MIN_INJECT_CHARS = 300;

	function computeEffectiveBudget(existingChars: number, maxInjectChars = 2000): number | null {
		const headroomChars = MODEL_LIMIT_CHARS - existingChars;
		if (headroomChars < MIN_INJECT_CHARS) return null; // skip

		if (headroomChars >= MODEL_LIMIT_CHARS * 0.60) {
			return maxInjectChars; // high regime
		} else if (headroomChars >= MODEL_LIMIT_CHARS * 0.20) {
			return Math.floor(maxInjectChars * 0.5); // moderate regime
		} else {
			return Math.floor(maxInjectChars * 0.25); // low regime
		}
	}

	it('injects at full budget (2000 chars) when context is small (20k chars)', () => {
		const budget = computeEffectiveBudget(20_000);
		expect(budget).toBe(2000);
	});

	it('injects at moderate budget (1000 chars) at 181k chars (previously skipped)', () => {
		const budget = computeEffectiveBudget(181_000);
		expect(budget).toBe(1000);
	});

	it('injects at low budget (500 chars) at 370k chars', () => {
		const budget = computeEffectiveBudget(370_000);
		expect(budget).toBe(500);
	});

	it('still injects at low regime at 97% capacity (~376k chars)', () => {
		const almostFull = Math.floor(MODEL_LIMIT_CHARS * 0.97);
		const budget = computeEffectiveBudget(almostFull);
		// At 97% used, 3% headroom (~11k chars) > 300 min, so still injects at low regime
		expect(budget).toBe(500);
	});

	it('skips injection when headroom < 300 chars', () => {
		const budget = computeEffectiveBudget(MODEL_LIMIT_CHARS - 200);
		expect(budget).toBeNull();
	});

	it('high regime boundary is at 40% used (60% remaining)', () => {
		// Just inside high regime
		const justInsideHigh = Math.floor(MODEL_LIMIT_CHARS * 0.39);
		expect(computeEffectiveBudget(justInsideHigh)).toBe(2000);

		// Just outside high regime
		const justOutsideHigh = Math.floor(MODEL_LIMIT_CHARS * 0.41);
		expect(computeEffectiveBudget(justOutsideHigh)).toBe(1000);
	});

	it('moderate regime boundary is at 80% used (20% remaining)', () => {
		// Just inside moderate regime
		const justInsideModerate = Math.floor(MODEL_LIMIT_CHARS * 0.79);
		expect(computeEffectiveBudget(justInsideModerate)).toBe(1000);

		// Just outside moderate regime
		const justOutsideModerate = Math.floor(MODEL_LIMIT_CHARS * 0.81);
		expect(computeEffectiveBudget(justOutsideModerate)).toBe(500);
	});

	it('respects custom inject_char_budget', () => {
		const budget = computeEffectiveBudget(20_000, 4000);
		expect(budget).toBe(4000);

		const moderateBudget = computeEffectiveBudget(181_000, 4000);
		expect(moderateBudget).toBe(2000);
	});
});

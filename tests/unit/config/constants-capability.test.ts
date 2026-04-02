import { describe, expect, it } from 'bun:test';
import {
	isLowCapabilityModel,
	LOW_CAPABILITY_MODELS,
} from '../../../src/config/constants';

describe('isLowCapabilityModel — verification', () => {
	it('Returns true for model containing "mini" (e.g. "gpt-4o-mini")', () => {
		expect(isLowCapabilityModel('gpt-4o-mini')).toBe(true);
	});

	it('Returns true for model containing "nano" (e.g. "gpt-5-nano")', () => {
		expect(isLowCapabilityModel('gpt-5-nano')).toBe(true);
	});

	it('Returns true for model containing "small" (e.g. "claude-small")', () => {
		expect(isLowCapabilityModel('claude-small')).toBe(true);
	});

	it('Returns true for model containing "free" (e.g. "opencode/minimax-free")', () => {
		expect(isLowCapabilityModel('opencode/minimax-free')).toBe(true);
	});

	it('Returns false for model with none of the substrings (e.g. "gpt-4o", "claude-opus-3")', () => {
		expect(isLowCapabilityModel('gpt-4o')).toBe(false);
		expect(isLowCapabilityModel('claude-opus-3')).toBe(false);
	});

	it('Case insensitive — "GPT-4O-MINI" → true', () => {
		expect(isLowCapabilityModel('GPT-4O-MINI')).toBe(true);
	});

	it('Case insensitive — "NANO-MODEL" → true', () => {
		expect(isLowCapabilityModel('NANO-MODEL')).toBe(true);
	});

	it('LOW_CAPABILITY_MODELS is readonly (as const) — contains exactly the 4 values', () => {
		expect(LOW_CAPABILITY_MODELS).toEqual([
			'mini',
			'nano',
			'small',
			'free',
		] as const);
		// Verify it's a tuple with exactly 4 elements
		expect(LOW_CAPABILITY_MODELS.length).toBe(4);
	});
});

describe('isLowCapabilityModel — adversarial', () => {
	it('null input → false (no throw)', () => {
		// @ts-expect-error - testing runtime behavior with invalid input
		expect(isLowCapabilityModel(null)).toBe(false);
	});

	it('undefined input → false (no throw)', () => {
		// @ts-expect-error - testing runtime behavior with invalid input
		expect(isLowCapabilityModel(undefined)).toBe(false);
	});

	it('empty string → false', () => {
		expect(isLowCapabilityModel('')).toBe(false);
	});

	it('String "freemium" → true (contains "free" as substring)', () => {
		expect(isLowCapabilityModel('freemium')).toBe(true);
	});

	it('String "miniature" → true (contains "mini" as substring)', () => {
		expect(isLowCapabilityModel('miniature')).toBe(true);
	});

	it('Very long string (10000 chars) → completes without crash, returns false', () => {
		const longString = 'a'.repeat(10000);
		expect(isLowCapabilityModel(longString)).toBe(false);
	});

	it('String with only whitespace → false', () => {
		expect(isLowCapabilityModel('   ')).toBe(false);
	});

	it('Model ID with unicode characters — should not crash', () => {
		// Unicode 'и' (Cyrillic) is not the same as 'i', so 'мини' won't match 'mini'
		expect(() => isLowCapabilityModel('gpt-4-мини')).not.toThrow();
		// Returns false because Cyrillic 'м' != 'm', 'и' != 'i'
		expect(isLowCapabilityModel('gpt-4-мини')).toBe(false);
	});
});

/**
 * Verification tests for AdversarialDetectionConfigSchema
 * Tests the four required cases specified in the verification task
 */
import { describe, expect, it } from 'bun:test';
import {
	AdversarialDetectionConfigSchema,
	PluginConfigSchema,
} from '../../../src/config/schema';

describe('VERIFICATION: AdversarialDetectionConfigSchema - Task Requirements', () => {
	it('Test 1: AdversarialDetectionConfigSchema.parse({}) returns { enabled: true, policy: warn, pairs: [[coder,reviewer]] }', () => {
		const result = AdversarialDetectionConfigSchema.parse({});

		expect(result).toEqual({
			enabled: true,
			policy: 'warn',
			pairs: [['coder', 'reviewer']],
		});
	});

	it('Test 2: PluginConfigSchema.parse({}) succeeds (no throw) and .adversarial_detection is undefined', () => {
		// Should not throw
		const result = PluginConfigSchema.parse({});

		// adversarial_detection should be undefined since it's optional
		expect(result.adversarial_detection).toBeUndefined();
	});

	it('Test 3: AdversarialDetectionConfigSchema.parse({ enabled: false, policy: gate, pairs: [[a,b],[c,d]] }) succeeds with expected values', () => {
		const input = {
			enabled: false,
			policy: 'gate',
			pairs: [
				['a', 'b'],
				['c', 'd'],
			],
		};

		const result = AdversarialDetectionConfigSchema.parse(input);

		expect(result).toEqual({
			enabled: false,
			policy: 'gate',
			pairs: [
				['a', 'b'],
				['c', 'd'],
			],
		});
	});

	it('Test 4: AdversarialDetectionConfigSchema.parse({ policy: invalid }) throws a ZodError', () => {
		expect(() => {
			AdversarialDetectionConfigSchema.parse({ policy: 'invalid' });
		}).toThrow();
	});
});

describe('ADDITIONAL COVERAGE: AdversarialDetectionConfigSchema', () => {
	describe('Policy enum values', () => {
		it('Accepts policy: warn (default)', () => {
			const result = AdversarialDetectionConfigSchema.parse({ policy: 'warn' });
			expect(result.policy).toBe('warn');
		});

		it('Accepts policy: gate', () => {
			const result = AdversarialDetectionConfigSchema.parse({ policy: 'gate' });
			expect(result.policy).toBe('gate');
		});

		it('Accepts policy: ignore', () => {
			const result = AdversarialDetectionConfigSchema.parse({
				policy: 'ignore',
			});
			expect(result.policy).toBe('ignore');
		});
	});

	describe('Type coercion rejection', () => {
		it('Rejects enabled as number', () => {
			const result = AdversarialDetectionConfigSchema.safeParse({
				enabled: 1,
			});
			expect(result.success).toBe(false);
		});

		it('Rejects enabled as string', () => {
			const result = AdversarialDetectionConfigSchema.safeParse({
				enabled: 'true',
			});
			expect(result.success).toBe(false);
		});

		it('Rejects policy as boolean', () => {
			const result = AdversarialDetectionConfigSchema.safeParse({
				policy: true,
			});
			expect(result.success).toBe(false);
		});

		it('Rejects policy as number', () => {
			const result = AdversarialDetectionConfigSchema.safeParse({
				policy: 1,
			});
			expect(result.success).toBe(false);
		});

		it('Rejects pairs as non-array', () => {
			const result = AdversarialDetectionConfigSchema.safeParse({
				pairs: 'coder,reviewer',
			});
			expect(result.success).toBe(false);
		});

		it('Rejects pairs as object', () => {
			const result = AdversarialDetectionConfigSchema.safeParse({
				pairs: { coder: 'reviewer' },
			});
			expect(result.success).toBe(false);
		});
	});

	describe('Pairs array structure', () => {
		it('Rejects pair elements with non-tuple structure (too many elements)', () => {
			const result = AdversarialDetectionConfigSchema.safeParse({
				pairs: [['coder', 'reviewer', 'extra']],
			});
			expect(result.success).toBe(false);
		});

		it('Rejects pair elements with non-tuple structure (too few elements)', () => {
			const result = AdversarialDetectionConfigSchema.safeParse({
				pairs: [['coder']],
			});
			expect(result.success).toBe(false);
		});

		it('Rejects pair elements with non-string values', () => {
			const result = AdversarialDetectionConfigSchema.safeParse({
				pairs: [[123, 456]],
			});
			expect(result.success).toBe(false);
		});

		it('Accepts empty pairs array', () => {
			const result = AdversarialDetectionConfigSchema.parse({ pairs: [] });
			expect(result.pairs).toEqual([]);
		});

		it('Accepts multiple adversarial pairs', () => {
			const result = AdversarialDetectionConfigSchema.parse({
				pairs: [
					['coder', 'reviewer'],
					['architect', 'critic'],
					['designer', 'docs'],
				],
			});
			expect(result.pairs.length).toBe(3);
			expect(result.pairs[0]).toEqual(['coder', 'reviewer']);
			expect(result.pairs[1]).toEqual(['architect', 'critic']);
			expect(result.pairs[2]).toEqual(['designer', 'docs']);
		});
	});

	describe('PluginConfigSchema integration', () => {
		it('PluginConfigSchema accepts adversarial_detection field with full config', () => {
			const result = PluginConfigSchema.parse({
				adversarial_detection: {
					enabled: false,
					policy: 'gate',
					pairs: [['coder', 'reviewer']],
				},
			});

			expect(result.adversarial_detection).toBeDefined();
			expect(result.adversarial_detection?.enabled).toBe(false);
			expect(result.adversarial_detection?.policy).toBe('gate');
		});

		it('PluginConfigSchema accepts adversarial_detection with default values', () => {
			const result = PluginConfigSchema.parse({
				adversarial_detection: {},
			});

			expect(result.adversarial_detection).toBeDefined();
			expect(result.adversarial_detection?.enabled).toBe(true);
			expect(result.adversarial_detection?.policy).toBe('warn');
			expect(result.adversarial_detection?.pairs).toEqual([
				['coder', 'reviewer'],
			]);
		});
	});
});

import { describe, test, expect } from 'bun:test';
import {
	EvidenceConfigSchema,
	PluginConfigSchema,
} from '../../../src/config/schema';

describe('EvidenceConfigSchema', () => {
	test('Valid config with all fields parses correctly', () => {
		const config = {
			enabled: false,
			max_age_days: 30,
			max_bundles: 500,
			auto_archive: true,
		};
		const result = EvidenceConfigSchema.parse(config);
		expect(result).toEqual(config);
	});

	test('Defaults are applied when fields omitted', () => {
		const config = {};
		const result = EvidenceConfigSchema.parse(config);
		expect(result).toEqual({
			enabled: true,
			max_age_days: 90,
			max_bundles: 1000,
			auto_archive: false,
		});
	});

	test('Invalid max_age_days (0) rejects', () => {
		const config = { max_age_days: 0 };
		const result = EvidenceConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});

	test('Invalid max_age_days (366) rejects', () => {
		const config = { max_age_days: 366 };
		const result = EvidenceConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});

	test('Invalid max_bundles (9) rejects', () => {
		const config = { max_bundles: 9 };
		const result = EvidenceConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});

	test('Invalid max_bundles (10001) rejects', () => {
		const config = { max_bundles: 10001 };
		const result = EvidenceConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});
});

describe('PluginConfigSchema with evidence field', () => {
	test('PluginConfigSchema with evidence field parses correctly', () => {
		const config = {
			evidence: {
				enabled: true,
				max_age_days: 60,
				max_bundles: 2000,
				auto_archive: false,
			},
		};
		const result = PluginConfigSchema.parse(config);
		expect(result.evidence).toEqual(config.evidence);
	});

	test('PluginConfigSchema without evidence field parses (optional)', () => {
		const config = {
			max_iterations: 3,
			qa_retry_limit: 2,
		};
		const result = PluginConfigSchema.parse(config);
		expect(result.evidence).toBeUndefined();
	});
});

import { describe, expect, it } from 'bun:test';
import {
	IntegrationAnalysisConfigSchema,
	PluginConfigSchema,
	ReviewPassesConfigSchema,
} from '../../../src/config/schema';

describe('ReviewPassesConfigSchema', () => {
	describe('valid configurations', () => {
		it('parses valid full config with both fields', () => {
			const config = {
				always_security_review: true,
				security_globs: ['**/custom/**', '**/special/**'],
			};
			const result = ReviewPassesConfigSchema.parse(config);
			expect(result.always_security_review).toBe(true);
			expect(result.security_globs).toEqual(['**/custom/**', '**/special/**']);
		});

		it('always_security_review=true is accepted', () => {
			const config = {
				always_security_review: true,
			};
			const result = ReviewPassesConfigSchema.parse(config);
			expect(result.always_security_review).toBe(true);
		});
	});

	describe('defaults', () => {
		it('applies defaults when empty object provided', () => {
			const result = ReviewPassesConfigSchema.parse({});
			expect(result.always_security_review).toBe(false);
			expect(result.security_globs).toHaveLength(7);
		});

		it('default security_globs contains expected patterns', () => {
			const result = ReviewPassesConfigSchema.parse({});
			expect(result.security_globs).toContain('**/auth/**');
			expect(result.security_globs).toContain('**/api/**');
			expect(result.security_globs).toContain('**/crypto/**');
			expect(result.security_globs).toContain('**/security/**');
			expect(result.security_globs).toContain('**/middleware/**');
			expect(result.security_globs).toContain('**/session/**');
			expect(result.security_globs).toContain('**/token/**');
		});
	});

	describe('custom security_globs', () => {
		it('accepts custom security_globs array', () => {
			const customGlobs = ['**/custom/**', '**/my-security/**', '**/protected/**'];
			const result = ReviewPassesConfigSchema.parse({
				security_globs: customGlobs,
			});
			expect(result.security_globs).toEqual(customGlobs);
			expect(result.always_security_review).toBe(false); // default
		});

		it('accepts empty security_globs array', () => {
			const result = ReviewPassesConfigSchema.parse({
				security_globs: [],
			});
			expect(result.security_globs).toEqual([]);
		});
	});
});

describe('IntegrationAnalysisConfigSchema', () => {
	describe('valid configurations', () => {
		it('parses valid config with enabled=true', () => {
			const result = IntegrationAnalysisConfigSchema.parse({ enabled: true });
			expect(result.enabled).toBe(true);
		});

		it('parses valid config with enabled=false', () => {
			const result = IntegrationAnalysisConfigSchema.parse({ enabled: false });
			expect(result.enabled).toBe(false);
		});
	});

	describe('defaults', () => {
		it('applies default (enabled=true) when empty object provided', () => {
			const result = IntegrationAnalysisConfigSchema.parse({});
			expect(result.enabled).toBe(true);
		});
	});

	describe('validation', () => {
		it('rejects non-boolean enabled value', () => {
			expect(() => {
				IntegrationAnalysisConfigSchema.parse({ enabled: 'true' });
			}).toThrow();
		});

		it('rejects numeric enabled value', () => {
			expect(() => {
				IntegrationAnalysisConfigSchema.parse({ enabled: 1 });
			}).toThrow();
		});

		it('rejects null enabled value', () => {
			expect(() => {
				IntegrationAnalysisConfigSchema.parse({ enabled: null });
			}).toThrow();
		});
	});
});

describe('PluginConfigSchema integration tests', () => {
	describe('optional fields', () => {
		it('both schemas are optional (parse with neither present)', () => {
			const result = PluginConfigSchema.parse({});
			expect(result.review_passes).toBeUndefined();
			expect(result.integration_analysis).toBeUndefined();
		});

		it('accepts review_passes field', () => {
			const result = PluginConfigSchema.parse({
				review_passes: {
					always_security_review: true,
					security_globs: ['**/auth/**'],
				},
			});
			expect(result.review_passes).toBeDefined();
			expect(result.review_passes?.always_security_review).toBe(true);
			expect(result.review_passes?.security_globs).toEqual(['**/auth/**']);
		});

		it('accepts integration_analysis field', () => {
			const result = PluginConfigSchema.parse({
				integration_analysis: {
					enabled: false,
				},
			});
			expect(result.integration_analysis).toBeDefined();
			expect(result.integration_analysis?.enabled).toBe(false);
		});

		it('accepts both review_passes and integration_analysis together', () => {
			const result = PluginConfigSchema.parse({
				review_passes: {
					always_security_review: true,
				},
				integration_analysis: {
					enabled: false,
				},
			});
			expect(result.review_passes?.always_security_review).toBe(true);
			expect(result.integration_analysis?.enabled).toBe(false);
		});

		it('review_passes uses defaults when empty object', () => {
			const result = PluginConfigSchema.parse({
				review_passes: {},
			});
			expect(result.review_passes?.always_security_review).toBe(false);
			expect(result.review_passes?.security_globs).toHaveLength(7);
		});

		it('integration_analysis uses defaults when empty object', () => {
			const result = PluginConfigSchema.parse({
				integration_analysis: {},
			});
			expect(result.integration_analysis?.enabled).toBe(true);
		});
	});
});

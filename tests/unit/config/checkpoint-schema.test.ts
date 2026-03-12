import { describe, it, expect } from 'bun:test';
import {
	CheckpointConfigSchema,
	PluginConfigSchema,
} from '../../../src/config/schema';

describe('CheckpointConfigSchema', () => {
	describe('parsing', () => {
		it('accepts empty object {} with defaults', () => {
			const result = CheckpointConfigSchema.safeParse({});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toEqual({
					enabled: true,
					auto_checkpoint_threshold: 3,
				});
			}
		});

		it('accepts valid full config', () => {
			const config = {
				enabled: false,
				auto_checkpoint_threshold: 5,
			};
			const result = CheckpointConfigSchema.safeParse(config);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toEqual(config);
			}
		});

		it('accepts enabled: true', () => {
			const result = CheckpointConfigSchema.safeParse({ enabled: true });
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.enabled).toBe(true);
			}
		});

		it('accepts enabled: false', () => {
			const result = CheckpointConfigSchema.safeParse({ enabled: false });
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.enabled).toBe(false);
			}
		});
	});

	describe('defaults', () => {
		it('applies default enabled: true', () => {
			const result = CheckpointConfigSchema.safeParse({});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.enabled).toBe(true);
			}
		});

		it('applies default auto_checkpoint_threshold: 3', () => {
			const result = CheckpointConfigSchema.safeParse({});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.auto_checkpoint_threshold).toBe(3);
			}
		});
	});

	describe('bounds - auto_checkpoint_threshold', () => {
		it('accepts minimum boundary: 1', () => {
			const result = CheckpointConfigSchema.safeParse({
				auto_checkpoint_threshold: 1,
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.auto_checkpoint_threshold).toBe(1);
			}
		});

		it('accepts maximum boundary: 20', () => {
			const result = CheckpointConfigSchema.safeParse({
				auto_checkpoint_threshold: 20,
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.auto_checkpoint_threshold).toBe(20);
			}
		});

		it('accepts mid-range value: 10', () => {
			const result = CheckpointConfigSchema.safeParse({
				auto_checkpoint_threshold: 10,
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.auto_checkpoint_threshold).toBe(10);
			}
		});

		it('rejects below minimum: 0', () => {
			const result = CheckpointConfigSchema.safeParse({
				auto_checkpoint_threshold: 0,
			});
			expect(result.success).toBe(false);
		});

		it('rejects above maximum: 21', () => {
			const result = CheckpointConfigSchema.safeParse({
				auto_checkpoint_threshold: 21,
			});
			expect(result.success).toBe(false);
		});

		it('rejects negative value: -1', () => {
			const result = CheckpointConfigSchema.safeParse({
				auto_checkpoint_threshold: -1,
			});
			expect(result.success).toBe(false);
		});

		it('accepts non-integer: 3.5 (schema allows floats)', () => {
			const result = CheckpointConfigSchema.safeParse({
				auto_checkpoint_threshold: 3.5,
			});
			// Schema uses z.number() without .int(), so floats are accepted
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.auto_checkpoint_threshold).toBe(3.5);
			}
		});

		it('rejects non-number: "5"', () => {
			const result = CheckpointConfigSchema.safeParse({
				auto_checkpoint_threshold: '5',
			});
			expect(result.success).toBe(false);
		});
	});

	describe('edge cases', () => {
		it('rejects non-boolean enabled: "true"', () => {
			const result = CheckpointConfigSchema.safeParse({ enabled: 'true' });
			expect(result.success).toBe(false);
		});

		it('rejects non-boolean enabled: 1', () => {
			const result = CheckpointConfigSchema.safeParse({ enabled: 1 });
			expect(result.success).toBe(false);
		});

		it('accepts unknown field (schema not strict)', () => {
			const result = CheckpointConfigSchema.safeParse({
				unknown_field: 'value',
			});
			// Schema does not use .strict(), so unknown fields are ignored
			expect(result.success).toBe(true);
		});

		it('accepts all valid combinations', () => {
			// enabled: true, threshold: min
			let result = CheckpointConfigSchema.safeParse({
				enabled: true,
				auto_checkpoint_threshold: 1,
			});
			expect(result.success).toBe(true);

			// enabled: false, threshold: max
			result = CheckpointConfigSchema.safeParse({
				enabled: false,
				auto_checkpoint_threshold: 20,
			});
			expect(result.success).toBe(true);

			// enabled: true, threshold: max
			result = CheckpointConfigSchema.safeParse({
				enabled: true,
				auto_checkpoint_threshold: 20,
			});
			expect(result.success).toBe(true);
		});
	});
});

describe('CheckpointConfigSchema in PluginConfigSchema', () => {
	it('accepts checkpoint config in plugin', () => {
		const config = {
			checkpoint: {
				enabled: false,
				auto_checkpoint_threshold: 7,
			},
		};
		const result = PluginConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.checkpoint).toEqual({
				enabled: false,
				auto_checkpoint_threshold: 7,
			});
		}
	});

	it('applies defaults when checkpoint omitted', () => {
		const config = {};
		const result = PluginConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
		if (result.success) {
			// checkpoint is optional, so it may be undefined
			expect(result.data.checkpoint).toBeUndefined();
		}
	});

	it('accepts empty checkpoint object with defaults', () => {
		const config = { checkpoint: {} };
		const result = PluginConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.checkpoint).toEqual({
				enabled: true,
				auto_checkpoint_threshold: 3,
			});
		}
	});

	it('rejects invalid checkpoint config', () => {
		const config = {
			checkpoint: {
				auto_checkpoint_threshold: 100,
			},
		};
		const result = PluginConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});
});

import { describe, expect, it } from 'bun:test';
import { CuratorConfigSchema } from '../../../src/config/schema';

describe('CuratorConfigSchema defaults', () => {
	it('curator.enabled defaults to true', () => {
		const config = CuratorConfigSchema.parse({});
		expect(config.enabled).toBe(true);
	});

	it('curator.init_enabled defaults to true', () => {
		const config = CuratorConfigSchema.parse({});
		expect(config.init_enabled).toBe(true);
	});

	it('curator.phase_enabled defaults to true', () => {
		const config = CuratorConfigSchema.parse({});
		expect(config.phase_enabled).toBe(true);
	});
});

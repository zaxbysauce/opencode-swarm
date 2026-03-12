import { describe, it, expect } from 'bun:test';
import {
	LintConfigSchema,
	SecretscanConfigSchema,
	PluginConfigSchema,
} from '../../../src/config/schema';

describe('LintConfigSchema', () => {
	it('accepts empty object {} and applies defaults', () => {
		const result = LintConfigSchema.safeParse({});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual({
				enabled: true,
				mode: 'check',
				linter: 'auto',
				patterns: [
					'**/*.{ts,tsx,js,jsx,mjs,cjs}',
					'**/biome.json',
					'**/biome.jsonc',
				],
				exclude: [
					'**/node_modules/**',
					'**/dist/**',
					'**/.git/**',
					'**/coverage/**',
					'**/*.min.js',
				],
			});
		}
	});

	it('accepts valid full lint config', () => {
		const config = {
			enabled: false,
			mode: 'fix',
			linter: 'biome',
			patterns: ['src/**/*.ts', 'lib/**/*.js'],
			exclude: ['**/node_modules/**', '**/dist/**'],
		};
		const result = LintConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual(config);
		}
	});

	it('accepts mode: check', () => {
		const result = LintConfigSchema.safeParse({ mode: 'check' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.mode).toBe('check');
		}
	});

	it('accepts mode: fix', () => {
		const result = LintConfigSchema.safeParse({ mode: 'fix' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.mode).toBe('fix');
		}
	});

	it('rejects invalid mode value', () => {
		const result = LintConfigSchema.safeParse({ mode: 'invalid' });
		expect(result.success).toBe(false);
	});

	it('rejects mode as number', () => {
		const result = LintConfigSchema.safeParse({ mode: 1 });
		expect(result.success).toBe(false);
	});

	it('accepts linter: biome', () => {
		const result = LintConfigSchema.safeParse({ linter: 'biome' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.linter).toBe('biome');
		}
	});

	it('accepts linter: eslint', () => {
		const result = LintConfigSchema.safeParse({ linter: 'eslint' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.linter).toBe('eslint');
		}
	});

	it('accepts linter: auto', () => {
		const result = LintConfigSchema.safeParse({ linter: 'auto' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.linter).toBe('auto');
		}
	});

	it('rejects invalid linter value', () => {
		const result = LintConfigSchema.safeParse({ linter: 'prettier' });
		expect(result.success).toBe(false);
	});

	it('accepts enabled: true', () => {
		const result = LintConfigSchema.safeParse({ enabled: true });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.enabled).toBe(true);
		}
	});

	it('accepts enabled: false', () => {
		const result = LintConfigSchema.safeParse({ enabled: false });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.enabled).toBe(false);
		}
	});

	it('rejects enabled as string', () => {
		const result = LintConfigSchema.safeParse({ enabled: 'yes' });
		expect(result.success).toBe(false);
	});

	it('accepts custom patterns array', () => {
		const patterns = ['src/**/*.ts', 'lib/**/*.js', '**/*.tsx'];
		const result = LintConfigSchema.safeParse({ patterns });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.patterns).toEqual(patterns);
		}
	});

	it('rejects patterns as string', () => {
		const result = LintConfigSchema.safeParse({ patterns: '**/*.ts' });
		expect(result.success).toBe(false);
	});

	it('accepts custom exclude array', () => {
		const exclude = ['**/build/**', '**/.next/**', '**/temp/**'];
		const result = LintConfigSchema.safeParse({ exclude });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.exclude).toEqual(exclude);
		}
	});

	it('rejects exclude as string', () => {
		const result = LintConfigSchema.safeParse({ exclude: '**/node_modules/**' });
		expect(result.success).toBe(false);
	});

	it('accepts empty array for patterns (no default applied for explicit empty)', () => {
		const result = LintConfigSchema.safeParse({ patterns: [] });
		expect(result.success).toBe(true);
		if (result.success) {
			// Zod .default() only applies when key is omitted, not when explicitly empty
			expect(result.data.patterns).toEqual([]);
		}
	});

	it('accepts empty array for exclude (no default applied for explicit empty)', () => {
		const result = LintConfigSchema.safeParse({ exclude: [] });
		expect(result.success).toBe(true);
		if (result.success) {
			// Zod .default() only applies when key is omitted, not when explicitly empty
			expect(result.data.exclude).toEqual([]);
		}
	});
});

describe('SecretscanConfigSchema', () => {
	it('accepts empty object {} and applies defaults', () => {
		const result = SecretscanConfigSchema.safeParse({});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual({
				enabled: true,
				patterns: [
					'**/*.{env,properties,yml,yaml,json,js,ts}',
					'**/.env*',
					'**/secrets/**',
					'**/credentials/**',
					'**/config/**/*.ts',
					'**/config/**/*.js',
				],
				exclude: [
					'**/node_modules/**',
					'**/dist/**',
					'**/.git/**',
					'**/coverage/**',
					'**/test/**',
					'**/tests/**',
					'**/__tests__/**',
					'**/*.test.ts',
					'**/*.test.js',
					'**/*.spec.ts',
					'**/*.spec.js',
				],
				extensions: [
					'.env',
					'.properties',
					'.yml',
					'.yaml',
					'.json',
					'.js',
					'.ts',
					'.py',
					'.rb',
					'.go',
					'.java',
					'.cs',
					'.php',
				],
			});
		}
	});

	it('accepts valid full secretscan config', () => {
		const config = {
			enabled: false,
			patterns: ['src/**/*.env', 'config/**'],
			exclude: ['**/test/**'],
			extensions: ['.env', '.yaml', '.json'],
		};
		const result = SecretscanConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual(config);
		}
	});

	it('accepts enabled: true', () => {
		const result = SecretscanConfigSchema.safeParse({ enabled: true });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.enabled).toBe(true);
		}
	});

	it('accepts enabled: false', () => {
		const result = SecretscanConfigSchema.safeParse({ enabled: false });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.enabled).toBe(false);
		}
	});

	it('rejects enabled as string', () => {
		const result = SecretscanConfigSchema.safeParse({ enabled: 'yes' });
		expect(result.success).toBe(false);
	});

	it('accepts custom patterns array', () => {
		const patterns = ['**/*.env', '**/secrets/**', '**/keys/**'];
		const result = SecretscanConfigSchema.safeParse({ patterns });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.patterns).toEqual(patterns);
		}
	});

	it('rejects patterns as string', () => {
		const result = SecretscanConfigSchema.safeParse({ patterns: '**/*.env' });
		expect(result.success).toBe(false);
	});

	it('accepts custom exclude array', () => {
		const exclude = ['**/mocks/**', '**/fixtures/**', '**/examples/**'];
		const result = SecretscanConfigSchema.safeParse({ exclude });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.exclude).toEqual(exclude);
		}
	});

	it('rejects exclude as string', () => {
		const result = SecretscanConfigSchema.safeParse({ exclude: '**/node_modules/**' });
		expect(result.success).toBe(false);
	});

	it('accepts custom extensions array', () => {
		const extensions = ['.env', '.key', '.pem', '.cert'];
		const result = SecretscanConfigSchema.safeParse({ extensions });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.extensions).toEqual(extensions);
		}
	});

	it('rejects extensions as string', () => {
		const result = SecretscanConfigSchema.safeParse({ extensions: '.env' });
		expect(result.success).toBe(false);
	});

	it('accepts extensions without leading dot (schema does not validate dot prefix)', () => {
		const result = SecretscanConfigSchema.safeParse({ extensions: ['env', 'yaml'] });
		expect(result.success).toBe(true);
	});

	it('accepts empty array for patterns (no default applied for explicit empty)', () => {
		const result = SecretscanConfigSchema.safeParse({ patterns: [] });
		expect(result.success).toBe(true);
		if (result.success) {
			// Zod .default() only applies when key is omitted, not when explicitly empty
			expect(result.data.patterns).toEqual([]);
		}
	});

	it('accepts empty array for exclude (no default applied for explicit empty)', () => {
		const result = SecretscanConfigSchema.safeParse({ exclude: [] });
		expect(result.success).toBe(true);
		if (result.success) {
			// Zod .default() only applies when key is omitted, not when explicitly empty
			expect(result.data.exclude).toEqual([]);
		}
	});

	it('accepts empty array for extensions (no default applied for explicit empty)', () => {
		const result = SecretscanConfigSchema.safeParse({ extensions: [] });
		expect(result.success).toBe(true);
		if (result.success) {
			// Zod .default() only applies when key is omitted, not when explicitly empty
			expect(result.data.extensions).toEqual([]);
		}
	});

	it('accepts all optional fields combined', () => {
		const config = {
			enabled: true,
			patterns: ['**/*.env*'],
			exclude: ['**/test/**', '**/__mocks__/**'],
			extensions: ['.env', '.yaml', '.json', '.js'],
		};
		const result = SecretscanConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual(config);
		}
	});
});

describe('PluginConfigSchema - lint and secretscan wiring', () => {
	it('accepts empty config with lint and secretscan using defaults', () => {
		const result = PluginConfigSchema.safeParse({});
		expect(result.success).toBe(true);
		if (result.success) {
			// Both lint and secretscan should use their defaults when not specified
			expect(result.data.lint).toBeUndefined();
			expect(result.data.secretscan).toBeUndefined();
		}
	});

	it('accepts lint config in plugin config (defaults applied)', () => {
		const config = {
			lint: {
				enabled: false,
				mode: 'fix',
				linter: 'eslint',
			},
		};
		const result = PluginConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
		if (result.success) {
			// Zod applies defaults when nested - expect full config with defaults
			expect(result.data.lint?.enabled).toBe(false);
			expect(result.data.lint?.mode).toBe('fix');
			expect(result.data.lint?.linter).toBe('eslint');
			// patterns and exclude should have defaults applied
			expect(result.data.lint?.patterns).toBeDefined();
			expect(result.data.lint?.exclude).toBeDefined();
		}
	});

	it('accepts secretscan config in plugin config (defaults applied)', () => {
		const config = {
			secretscan: {
				enabled: false,
				patterns: ['**/*.env'],
			},
		};
		const result = PluginConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
		if (result.success) {
			// Zod applies defaults when nested - expect full config with defaults
			expect(result.data.secretscan?.enabled).toBe(false);
			expect(result.data.secretscan?.patterns).toEqual(['**/*.env']);
			// exclude and extensions should have defaults applied
			expect(result.data.secretscan?.exclude).toBeDefined();
			expect(result.data.secretscan?.extensions).toBeDefined();
		}
	});

	it('accepts both lint and secretscan in plugin config (defaults applied)', () => {
		const config = {
			lint: {
				enabled: true,
				mode: 'check',
				linter: 'biome',
			},
			secretscan: {
				enabled: true,
				patterns: ['**/*.env*'],
				extensions: ['.env', '.key'],
			},
		};
		const result = PluginConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.lint?.enabled).toBe(true);
			expect(result.data.lint?.mode).toBe('check');
			expect(result.data.lint?.linter).toBe('biome');
			expect(result.data.lint?.patterns).toBeDefined();
			expect(result.data.secretscan?.enabled).toBe(true);
			expect(result.data.secretscan?.patterns).toEqual(['**/*.env*']);
			expect(result.data.secretscan?.extensions).toEqual(['.env', '.key']);
		}
	});

	it('accepts full plugin config with all config sections (defaults applied)', () => {
		const config = {
			max_iterations: 3,
			qa_retry_limit: 2,
			inject_phase_reminders: false,
			lint: {
				enabled: true,
				mode: 'fix',
				linter: 'auto',
				patterns: ['src/**/*.ts'],
				exclude: ['**/node_modules/**'],
			},
			secretscan: {
				enabled: true,
				patterns: ['**/*.env'],
				exclude: ['**/test/**'],
				extensions: ['.env', '.key'],
			},
		};
		const result = PluginConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.max_iterations).toBe(3);
			expect(result.data.qa_retry_limit).toBe(2);
			expect(result.data.inject_phase_reminders).toBe(false);
			// lint has explicit patterns/exclude, should keep them
			expect(result.data.lint?.enabled).toBe(true);
			expect(result.data.lint?.mode).toBe('fix');
			expect(result.data.lint?.linter).toBe('auto');
			expect(result.data.lint?.patterns).toEqual(['src/**/*.ts']);
			expect(result.data.lint?.exclude).toEqual(['**/node_modules/**']);
			// secretscan has explicit values
			expect(result.data.secretscan?.enabled).toBe(true);
			expect(result.data.secretscan?.patterns).toEqual(['**/*.env']);
			expect(result.data.secretscan?.exclude).toEqual(['**/test/**']);
			expect(result.data.secretscan?.extensions).toEqual(['.env', '.key']);
		}
	});

	it('rejects invalid lint config within plugin', () => {
		const config = {
			lint: {
				mode: 'invalid-mode',
			},
		};
		const result = PluginConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});

	it('rejects invalid secretscan config within plugin', () => {
		const config = {
			secretscan: {
				enabled: 'yes',
			},
		};
		const result = PluginConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});

	it('lint config is optional (not required)', () => {
		const result = PluginConfigSchema.safeParse({});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.lint).toBeUndefined();
		}
	});

	it('secretscan config is optional (not required)', () => {
		const result = PluginConfigSchema.safeParse({});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.secretscan).toBeUndefined();
		}
	});
});

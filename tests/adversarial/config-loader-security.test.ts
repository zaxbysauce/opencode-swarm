/**
 * ADVERSARIAL SECURITY TESTS for config loader security fix
 *
 * These tests target the security fix that removed `_loadedFromFile` from the
 * Zod schema. Previously, a config file could set `"_loadedFromFile": true` to
 * bypass guardrails disable logic. Now the field is computed internally from
 * filesystem checks and is STRIPPED by Zod schema validation.
 *
 * CONSTRAINT: Only attack vectors - no happy path tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
	loadPluginConfig,
	loadPluginConfigWithMeta,
	deepMerge,
	MAX_MERGE_DEPTH,
	MAX_CONFIG_FILE_BYTES,
} from '../../src/config/loader';
import { PluginConfigSchema } from '../../src/config/schema';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('ADVERSARIAL: config loader security', () => {
	let tempDir: string;
	let originalXDG: string | undefined;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adversarial-test-'));
		originalXDG = process.env.XDG_CONFIG_HOME;
		process.env.XDG_CONFIG_HOME = tempDir;
	});

	afterEach(() => {
		if (originalXDG === undefined) {
			delete process.env.XDG_CONFIG_HOME;
		} else {
			process.env.XDG_CONFIG_HOME = originalXDG;
		}
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	describe('ATTACK VECTOR 1: Schema injection via config file', () => {
		it('Zod strips _loadedFromFile field from config file content', () => {
			// Attack: Malicious config file tries to inject internal field
			const maliciousConfig = {
				_loadedFromFile: true,
				guardrails: { enabled: false },
			};

			// Zod should strip unknown fields
			const result = PluginConfigSchema.safeParse(maliciousConfig);

			expect(result.success).toBe(true);
			if (result.success) {
				// CRITICAL: _loadedFromFile must NOT appear in parsed config
				expect('_loadedFromFile' in result.data).toBe(false);
			}
		});

		it('loadPluginConfig returns config WITHOUT _loadedFromFile when malicious config exists', () => {
			// Create malicious user config
			const userConfigDir = path.join(tempDir, 'opencode');
			const userConfigFile = path.join(userConfigDir, 'opencode-swarm.json');
			fs.mkdirSync(userConfigDir, { recursive: true });
			fs.writeFileSync(
				userConfigFile,
				JSON.stringify({
					_loadedFromFile: true, // ATTACK: Try to inject internal field
					guardrails: { enabled: false },
				})
			);

			const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-adv-'));
			const config = loadPluginConfig(projectDir);

			// Security assertion: _loadedFromFile must NOT be in returned config
			expect('_loadedFromFile' in config).toBe(false);

			fs.rmSync(projectDir, { recursive: true, force: true });
		});

		it('attacker cannot inject arbitrary fields into config via file', () => {
			const userConfigDir = path.join(tempDir, 'opencode');
			const userConfigFile = path.join(userConfigDir, 'opencode-swarm.json');
			fs.mkdirSync(userConfigDir, { recursive: true });
			fs.writeFileSync(
				userConfigFile,
				JSON.stringify({
					_maliciousField: 'pwned',
					__proto__: { polluted: true },
					constructor: { prototype: { polluted: true } },
					admin: true,
					superuser: true,
				})
			);

			const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-adv-'));
			const config = loadPluginConfig(projectDir);

			// All unknown fields should be stripped
			expect('_maliciousField' in config).toBe(false);
			expect('admin' in config).toBe(false);
			expect('superuser' in config).toBe(false);

			fs.rmSync(projectDir, { recursive: true, force: true });
		});
	});

	describe('ATTACK VECTOR 2: Guardrails bypass via _loadedFromFile injection', () => {
		it('loadPluginConfigWithMeta correctly computes loadedFromFile (not from config)', () => {
			// Create config WITH malicious _loadedFromFile: true
			const userConfigDir = path.join(tempDir, 'opencode');
			const userConfigFile = path.join(userConfigDir, 'opencode-swarm.json');
			fs.mkdirSync(userConfigDir, { recursive: true });
			fs.writeFileSync(
				userConfigFile,
				JSON.stringify({
					_loadedFromFile: true, // Attack attempt
					guardrails: { enabled: false },
				})
			);

			const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-adv-'));
			const { config, loadedFromFile } = loadPluginConfigWithMeta(projectDir);

			// loadedFromFile should be TRUE (file exists) but computed internally
			expect(loadedFromFile).toBe(true);

			// Config should NOT contain _loadedFromFile (stripped by Zod)
			expect('_loadedFromFile' in config).toBe(false);

			// Guardrails should still be controllable (the attack didn't bypass)
			expect(config.guardrails?.enabled).toBe(false);

			fs.rmSync(projectDir, { recursive: true, force: true });
		});

		it('guardrails cannot be bypassed by setting _loadedFromFile: false in project config', () => {
			// User config has guardrails enabled
			const userConfigDir = path.join(tempDir, 'opencode');
			const userConfigFile = path.join(userConfigDir, 'opencode-swarm.json');
			fs.mkdirSync(userConfigDir, { recursive: true });
			fs.writeFileSync(
				userConfigFile,
				JSON.stringify({
					guardrails: { enabled: true },
				})
			);

			// Project config tries to bypass via _loadedFromFile
			const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-adv-'));
			const configDir = path.join(projectDir, '.opencode');
			const configFile = path.join(configDir, 'opencode-swarm.json');
			fs.mkdirSync(configDir, { recursive: true });
			fs.writeFileSync(
				configFile,
				JSON.stringify({
					_loadedFromFile: false, // Attack: try to fool loader
					guardrails: { enabled: false },
				})
			);

			const { config, loadedFromFile } = loadPluginConfigWithMeta(projectDir);

			// loadedFromFile should be TRUE (project config exists)
			expect(loadedFromFile).toBe(true);

			// Config should NOT have _loadedFromFile
			expect('_loadedFromFile' in config).toBe(false);

			// Guardrails should be disabled (from project config, not bypassed)
			expect(config.guardrails?.enabled).toBe(false);

			fs.rmSync(projectDir, { recursive: true, force: true });
		});
	});

	describe('ATTACK VECTOR 3: Oversized config file (resource exhaustion)', () => {
		it('config file exceeding 102400 bytes is rejected', () => {
			const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-adv-'));
			const configDir = path.join(projectDir, '.opencode');
			const configFile = path.join(configDir, 'opencode-swarm.json');
			fs.mkdirSync(configDir, { recursive: true });

			// Create oversized config (> 100KB)
			const hugeValue = 'A'.repeat(110_000);
			fs.writeFileSync(configFile, JSON.stringify({ agents: { coder: { model: hugeValue } } }));

			const config = loadPluginConfig(projectDir);

			// Should return safe defaults, not the huge content
			expect(config.max_iterations).toBe(5); // Default
			expect(config.agents?.coder?.model).toBeUndefined(); // Not loaded

			fs.rmSync(projectDir, { recursive: true, force: true });
		});

		it('config file at exactly size limit is accepted', () => {
			const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-adv-'));
			const configDir = path.join(projectDir, '.opencode');
			const configFile = path.join(configDir, 'opencode-swarm.json');
			fs.mkdirSync(configDir, { recursive: true });

			// Create config at exactly the limit
			const config = { max_iterations: 7 };
			const jsonStr = JSON.stringify(config);
			const padding = ' '.repeat(MAX_CONFIG_FILE_BYTES - jsonStr.length);
			fs.writeFileSync(configFile, jsonStr + padding);

			const result = loadPluginConfig(projectDir);

			// Should be accepted (at limit, not over)
			expect(result.max_iterations).toBe(7);

			fs.rmSync(projectDir, { recursive: true, force: true });
		});

		it('config file one byte over limit is rejected', () => {
			const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-adv-'));
			const configDir = path.join(projectDir, '.opencode');
			const configFile = path.join(configDir, 'opencode-swarm.json');
			fs.mkdirSync(configDir, { recursive: true });

			// Create config one byte over limit
			const config = { max_iterations: 7 };
			const jsonStr = JSON.stringify(config);
			const padding = ' '.repeat(MAX_CONFIG_FILE_BYTES - jsonStr.length + 1);
			fs.writeFileSync(configFile, jsonStr + padding);

			const result = loadPluginConfig(projectDir);

			// Should be rejected and return defaults
			expect(result.max_iterations).toBe(5); // Default

			fs.rmSync(projectDir, { recursive: true, force: true });
		});
	});

	describe('ATTACK VECTOR 4: Malformed JSON', () => {
		it('malformed JSON returns safe defaults without crashing', () => {
			const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-adv-'));
			const configDir = path.join(projectDir, '.opencode');
			const configFile = path.join(configDir, 'opencode-swarm.json');
			fs.mkdirSync(configDir, { recursive: true });

			// Various malformed JSON payloads
			const malformedPayloads = [
				'{ "broken": }',
				'{ broken: "json" }', // Unquoted key
				'{"unclosed": "string',
				'{"trailing": "comma",}',
				'not json at all',
				'',
				'null',
				'[]', // Array instead of object
				'"string"', // String instead of object
				'123', // Number instead of object
			];

			for (const payload of malformedPayloads) {
				fs.writeFileSync(configFile, payload);
				const config = loadPluginConfig(projectDir);

				// Should return safe defaults without throwing
				expect(config.max_iterations).toBe(5);
				expect(config.qa_retry_limit).toBe(3);
			}

			fs.rmSync(projectDir, { recursive: true, force: true });
		});

		it('JSON with syntax errors returns safe defaults', () => {
			const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-adv-'));
			const configDir = path.join(projectDir, '.opencode');
			const configFile = path.join(configDir, 'opencode-swarm.json');
			fs.mkdirSync(configDir, { recursive: true });

			fs.writeFileSync(configFile, '{"max_iterations": FALSE}'); // FALSE instead of false
			const config = loadPluginConfig(projectDir);

			// Should return defaults (guardrails is optional, so we check required defaults)
			expect(config.max_iterations).toBe(5); // Default
			expect(config.qa_retry_limit).toBe(3); // Default
			expect(config.inject_phase_reminders).toBe(true); // Default

			fs.rmSync(projectDir, { recursive: true, force: true });
		});
	});

	describe('ATTACK VECTOR 5: Deeply nested config (DoS)', () => {
		it('deeply nested config (15 levels) throws or handles gracefully', () => {
			// Create 15-level deep nesting
			function createDeeplyNested(depth: number): Record<string, unknown> {
				if (depth === 0) return { leaf: 'value' };
				return { nested: createDeeplyNested(depth - 1) };
			}

			const deep15 = createDeeplyNested(15);

			// Deep merge should throw at MAX_MERGE_DEPTH (10)
			expect(() => deepMerge(deep15, deep15)).toThrow(
				'deepMerge exceeded maximum depth'
			);
		});

		it('config with 12 levels of nesting causes deepMerge to throw', () => {
			// Create 12-level deep nesting (exceeds MAX_MERGE_DEPTH of 10)
			function createDeeplyNested(depth: number): Record<string, unknown> {
				if (depth === 0) return { leaf: 'value' };
				return { nested: createDeeplyNested(depth - 1) };
			}

			const deep12 = createDeeplyNested(12);

			expect(() => deepMerge(deep12, deep12)).toThrow(
				`deepMerge exceeded maximum depth of ${MAX_MERGE_DEPTH}`
			);
		});

		it('config at exactly MAX_MERGE_DEPTH (10) is handled correctly', () => {
			function createDeeplyNested(depth: number): Record<string, unknown> {
				if (depth === 0) return { leaf: 'value' };
				return { nested: createDeeplyNested(depth - 1) };
			}

			// At exactly the limit (9 levels of nesting + 1 for merge = 10)
			const atLimit = createDeeplyNested(9);

			// Should NOT throw
			expect(() => deepMerge(atLimit, atLimit)).not.toThrow();
		});

		it('loadPluginConfig handles deeply nested merged config without crashing', () => {
			// Create deep user config
			function createDeeplyNested(depth: number): Record<string, unknown> {
				if (depth === 0) return { value: 'deep' };
				return { level: createDeeplyNested(depth - 1) };
			}

			// User config: 6 levels deep
			const userConfigDir = path.join(tempDir, 'opencode');
			const userConfigFile = path.join(userConfigDir, 'opencode-swarm.json');
			fs.mkdirSync(userConfigDir, { recursive: true });
			fs.writeFileSync(userConfigFile, JSON.stringify({ deep: createDeeplyNested(6) }));

			// Project config: 6 levels deep (merged = 6 levels, still under 10)
			const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-adv-'));
			const configDir = path.join(projectDir, '.opencode');
			const configFile = path.join(configDir, 'opencode-swarm.json');
			fs.mkdirSync(configDir, { recursive: true });
			fs.writeFileSync(configFile, JSON.stringify({ deep2: createDeeplyNested(6) }));

			// Should not crash
			const config = loadPluginConfig(projectDir);
			expect(config).toBeDefined();

			fs.rmSync(projectDir, { recursive: true, force: true });
		});
	});

	describe('ATTACK VECTOR 6: Null byte in config values', () => {
		it('null byte in string value parses or rejects without crashing', () => {
			const maliciousConfig = {
				model: 'test\u0000injected', // Null byte attack
			};

			// Zod should handle this without crashing
			const result = PluginConfigSchema.safeParse({
				agents: { coder: maliciousConfig },
			});

			// Should either parse (string allowed) or reject gracefully
			// The key is: no crash
			expect(typeof result.success).toBe('boolean');
		});

		it('null byte in config file is handled without crash', () => {
			const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-adv-'));
			const configDir = path.join(projectDir, '.opencode');
			const configFile = path.join(configDir, 'opencode-swarm.json');
			fs.mkdirSync(configDir, { recursive: true });

			// Write config with null byte
			fs.writeFileSync(configFile, '{"agents": {"coder": {"model": "test\u0000evil"}}}');

			// Should not crash
			const config = loadPluginConfig(projectDir);
			expect(config).toBeDefined();

			fs.rmSync(projectDir, { recursive: true, force: true });
		});

		it('control characters in config values are handled', () => {
			const controlChars = ['\t', '\n', '\r', '\x01', '\x1f'];

			for (const char of controlChars) {
				const config = {
					agents: { coder: { model: `test${char}value` } },
				};

				// Should not crash
				const result = PluginConfigSchema.safeParse(config);
				expect(typeof result.success).toBe('boolean');
			}
		});
	});

	describe('ATTACK VECTOR 7: Additional adversarial patterns', () => {
		it('prototype pollution attempt via config does not affect runtime behavior', () => {
			// NOTE: Zod DOES include __proto__ as a string key in the parsed object
			// However, the actual prototype pollution attack requires the object to be
			// used in specific ways (Object.assign, spread, etc). The security here
			// is that the config loader doesn't use these patterns on user input.
			const maliciousConfig = {
				__proto__: { isAdmin: true },
				constructor: { prototype: { isRoot: true } },
			};

			const result = PluginConfigSchema.safeParse(maliciousConfig);

			// Zod parses successfully (these are just unknown string keys)
			expect(result.success).toBe(true);

			// CRITICAL: Verify that Object.prototype was NOT actually polluted
			// This is the real security test - even if __proto__ key exists,
			// it should not pollute the global Object.prototype
			const testObj: Record<string, unknown> = {};
			expect(testObj.isAdmin).toBeUndefined();
			expect(testObj.isRoot).toBeUndefined();

			// Also verify that JSON.stringify/parse doesn't cause pollution
			const str = JSON.stringify(result.success ? result.data : {});
			const reparsed = JSON.parse(str) as Record<string, unknown>;
			expect(reparsed.isAdmin).toBeUndefined();
			expect(reparsed.isRoot).toBeUndefined();
		});

		it('config with circular reference pattern (JSON) cannot be created', () => {
			// JSON cannot represent circular refs, but verify we handle
			// deeply self-referencing key patterns
			const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-adv-'));
			const configDir = path.join(projectDir, '.opencode');
			const configFile = path.join(configDir, 'opencode-swarm.json');
			fs.mkdirSync(configDir, { recursive: true });

			// Valid JSON but with self-referencing keys pattern
			fs.writeFileSync(
				configFile,
				JSON.stringify({
					config: { config: { config: { config: { config: {} } } } },
				})
			);

			// Should parse without issues
			const config = loadPluginConfig(projectDir);
			expect(config).toBeDefined();

			fs.rmSync(projectDir, { recursive: true, force: true });
		});

		it('unicode homograph attack in keys is handled', () => {
			// Using Cyrillic 'а' (U+0430) instead of Latin 'a' (U+0061)
			const maliciousConfig = {
				аgents: { coder: { model: 'evil' } }, // Cyrillic 'а'
			};

			const result = PluginConfigSchema.safeParse(maliciousConfig);

			// Zod should handle this - it's just an unknown key
			expect(result.success).toBe(true);
			if (result.success) {
				// The Cyrillic key should be stripped as unknown
				expect('аgents' in result.data).toBe(false);
				// agents (with Latin 'a') should not be set
				expect(result.data.agents).toBeUndefined();
			}
		});

		it('extremely long string values exceed file size limit and are rejected', () => {
			// Use a string that will definitely exceed 102400 bytes
			// JSON overhead: {"agents":{"coder":{"model":"..."}}} ~40 bytes
			// So we need > 102360 characters to exceed the limit
			const longString = 'A'.repeat(110_000);
			const config = {
				agents: { coder: { model: longString } },
			};

			// Zod parsing should succeed (no string length limit in schema)
			const result = PluginConfigSchema.safeParse(config);
			expect(result.success).toBe(true);

			// But file size limit should prevent loading from disk
			const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-adv-'));
			const configDir = path.join(projectDir, '.opencode');
			const configFile = path.join(configDir, 'opencode-swarm.json');
			fs.mkdirSync(configDir, { recursive: true });
			fs.writeFileSync(configFile, JSON.stringify(config));

			// Verify file is over the size limit
			const fileStats = fs.statSync(configFile);
			expect(fileStats.size).toBeGreaterThan(MAX_CONFIG_FILE_BYTES);

			const loaded = loadPluginConfig(projectDir);
			// File should be rejected due to size - should get defaults
			expect(loaded.agents?.coder?.model).toBeUndefined();
			expect(loaded.max_iterations).toBe(5); // Default

			fs.rmSync(projectDir, { recursive: true, force: true });
		});

		it('empty string config values are handled', () => {
			const config = {
				agents: { coder: { model: '' } },
			};

			const result = PluginConfigSchema.safeParse(config);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.agents?.coder?.model).toBe('');
			}
		});

		it('config with only whitespace parses to defaults', () => {
			const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-adv-'));
			const configDir = path.join(projectDir, '.opencode');
			const configFile = path.join(configDir, 'opencode-swarm.json');
			fs.mkdirSync(configDir, { recursive: true });

			// File with only whitespace
			fs.writeFileSync(configFile, '   \n\t  \n  ');

			// Should handle as invalid JSON and return defaults
			const config = loadPluginConfig(projectDir);
			expect(config.max_iterations).toBe(5);

			fs.rmSync(projectDir, { recursive: true, force: true });
		});
	});
});

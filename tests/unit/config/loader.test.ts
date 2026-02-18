import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { deepMerge, loadPluginConfig, loadAgentPrompt, MAX_MERGE_DEPTH, MAX_CONFIG_FILE_BYTES } from '../../../src/config/loader';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('config/loader', () => {
	describe('deepMerge', () => {
		it('should return override when base is undefined', () => {
			const override = { key: 'value' };
			const result = deepMerge(undefined, override);
			expect(result).toBe(override);
		});

		it('should return base when override is undefined', () => {
			const base = { key: 'value' };
			const result = deepMerge(base, undefined);
			expect(result).toBe(base);
		});

		it('should return undefined when both are undefined', () => {
			const result = deepMerge(undefined, undefined);
			expect(result).toBeUndefined();
		});

		it('should merge flat objects with override winning', () => {
			const base: Record<string, unknown> = { a: 1, b: 'base', c: true };
			const override: Record<string, unknown> = { b: 'override', c: false, d: 'new' };
			const result = deepMerge(base, override);

			expect(result).toEqual({
				a: 1,
				b: 'override',
				c: false,
				d: 'new',
			});
		});

		it('should deep merge nested objects', () => {
			const base: Record<string, unknown> = {
				user: {
					name: 'John',
					settings: {
						theme: 'dark',
						notifications: true,
					},
				},
				role: 'user',
			};
			const override: Record<string, unknown> = {
				user: {
					age: 30,
					settings: {
						theme: 'light',
					},
				},
			};

			const result = deepMerge(base, override);

			expect(result).toEqual({
				user: {
					name: 'John',
					age: 30,
					settings: {
						theme: 'light',
						notifications: true,
					},
				},
				role: 'user',
			});
		});

		it('should replace arrays entirely (not deep merge)', () => {
			const base: Record<string, unknown> = {
				tags: ['red', 'blue'],
				items: [{ id: 1, name: 'first' }],
			};
			const override: Record<string, unknown> = {
				tags: ['green'],
				items: [{ id: 2, name: 'second' }],
			};

			const result = deepMerge(base, override);

			expect(result).toEqual({
				tags: ['green'], // Array completely replaced
				items: [{ id: 2, name: 'second' }], // Array completely replaced
			});
		});

		it('should replace null values', () => {
			const base: Record<string, unknown> = {
				optional: null,
				required: 'value',
			};
			const override: Record<string, unknown> = {
				optional: 'now has value',
			};

			const result = deepMerge(base, override);

			expect(result).toEqual({
				optional: 'now has value',
				required: 'value',
			});
		});

		it('should throw when depth exceeds MAX_MERGE_DEPTH', () => {
			function createDeeplyNested(depth: number): Record<string, unknown> {
				let obj: Record<string, unknown> = { leaf: 'value' };
				for (let i = 0; i < depth; i++) {
					obj = { nested: obj };
				}
				return obj;
			}
			const deep = createDeeplyNested(12);
			expect(() => deepMerge(deep, deep)).toThrow('deepMerge exceeded maximum depth');
		});

		it('should handle objects at exactly MAX_MERGE_DEPTH', () => {
			function createDeeplyNested(depth: number): Record<string, unknown> {
				let obj: Record<string, unknown> = { leaf: 'value' };
				for (let i = 0; i < depth; i++) {
					obj = { nested: obj };
				}
				return obj;
			}
			const atLimit = createDeeplyNested(9);
			expect(() => deepMerge(atLimit, atLimit)).not.toThrow();
		});

		it('should export MAX_MERGE_DEPTH as 10', () => {
			expect(MAX_MERGE_DEPTH).toBe(10);
		});

		it('should handle new keys in override not present in base', () => {
			const base: Record<string, unknown> = {
				existing: 'value',
			};
			const override: Record<string, unknown> = {
				existing: 'updated',
				newKey: 'newValue',
				nested: {
					newNested: 'deepValue',
				},
			};

			const result = deepMerge(base, override);

			expect(result).toEqual({
				existing: 'updated',
				newKey: 'newValue',
				nested: {
					newNested: 'deepValue',
				},
			});
		});
	});

	describe('loadPluginConfig', () => {
		let tempDir: string;
		let originalXDG: string | undefined;

		beforeEach(() => {
			tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-test-'));
			// Override XDG_CONFIG_HOME to isolate from real user config
			originalXDG = process.env.XDG_CONFIG_HOME;
			process.env.XDG_CONFIG_HOME = tempDir;
		});

		afterEach(() => {
			// Restore original XDG_CONFIG_HOME
			if (originalXDG === undefined) {
				delete process.env.XDG_CONFIG_HOME;
			} else {
				process.env.XDG_CONFIG_HOME = originalXDG;
			}
			fs.rmSync(tempDir, { recursive: true, force: true });
		});

		it('returns defaults when no config files exist', () => {
			const result = loadPluginConfig(tempDir);
			
			// Should return defaults when no user config and no project config exist
			expect(result).toEqual({
				max_iterations: 5,
				qa_retry_limit: 3,
				inject_phase_reminders: true,
				_loadedFromFile: false,
			});
		});

		it('loads user config', () => {
			// Create user config in the isolated temp directory
			const userConfigDir = path.join(tempDir, 'opencode');
			const userConfigFile = path.join(userConfigDir, 'opencode-swarm.json');
			
			fs.mkdirSync(userConfigDir, { recursive: true });
			fs.writeFileSync(userConfigFile, JSON.stringify({ max_iterations: 7 }));

			// Create a separate project directory with no config
			const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-test-'));
			
			const result = loadPluginConfig(projectDir);
			
			// Verify user config is loaded
			expect(result.max_iterations).toBe(7); // From user config
			expect(result.qa_retry_limit).toBe(3); // Default value
			expect(result.inject_phase_reminders).toBe(true); // Default value
			
			// Clean up project directory
			fs.rmSync(projectDir, { recursive: true, force: true });
		});

		it('loads project config', () => {
			// Create a project directory with config
			const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-test-'));
			const configDir = path.join(projectDir, '.opencode');
			const configFile = path.join(configDir, 'opencode-swarm.json');
			
			fs.mkdirSync(configDir, { recursive: true });
			fs.writeFileSync(configFile, JSON.stringify({ qa_retry_limit: 8 }));

			const result = loadPluginConfig(projectDir);
			
			// Verify project config is loaded
			expect(result.max_iterations).toBe(5); // Default value
			expect(result.qa_retry_limit).toBe(8); // From project config
			expect(result.inject_phase_reminders).toBe(true); // Default value
			
			// Clean up project directory
			fs.rmSync(projectDir, { recursive: true, force: true });
		});

		it('project config overrides user config', () => {
			// Create user config
			const userConfigDir = path.join(tempDir, 'opencode');
			const userConfigFile = path.join(userConfigDir, 'opencode-swarm.json');
			
			fs.mkdirSync(userConfigDir, { recursive: true });
			fs.writeFileSync(userConfigFile, JSON.stringify({ max_iterations: 7 }));

			// Create project config
			const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-test-'));
			const configDir = path.join(projectDir, '.opencode');
			const configFile = path.join(configDir, 'opencode-swarm.json');
			
			fs.mkdirSync(configDir, { recursive: true });
			fs.writeFileSync(configFile, JSON.stringify({ max_iterations: 9 }));

			const result = loadPluginConfig(projectDir);
			
			// Verify project config overrides user config
			expect(result.max_iterations).toBe(9); // Project config overrides user config
			expect(result.qa_retry_limit).toBe(3); // Default value (not in project config)
			expect(result.inject_phase_reminders).toBe(true); // Default value
			
			// Clean up project directory
			fs.rmSync(projectDir, { recursive: true, force: true });
		});

		it('deep merges agents from user and project config', () => {
			// Create user config with agents
			const userConfigDir = path.join(tempDir, 'opencode');
			const userConfigFile = path.join(userConfigDir, 'opencode-swarm.json');
			
			fs.mkdirSync(userConfigDir, { recursive: true });
			fs.writeFileSync(userConfigFile, JSON.stringify({
				agents: {
					coder: { model: "model-a" }
				}
			}));

			// Create project config with different agents
			const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-test-'));
			const configDir = path.join(projectDir, '.opencode');
			const configFile = path.join(configDir, 'opencode-swarm.json');
			
			fs.mkdirSync(configDir, { recursive: true });
			fs.writeFileSync(configFile, JSON.stringify({
				agents: {
					explorer: { model: "model-b" }
				}
			}));

			const result = loadPluginConfig(projectDir);
			
			// Verify both agent configs are present (deep merge)
			expect(result.agents?.coder?.model).toBe("model-a"); // From user config
			expect(result.agents?.explorer?.model).toBe("model-b"); // From project config
			
			// Clean up project directory
			fs.rmSync(projectDir, { recursive: true, force: true });
		});

		it('handles invalid JSON gracefully', () => {
			// Create user config
			const userConfigDir = path.join(tempDir, 'opencode');
			const userConfigFile = path.join(userConfigDir, 'opencode-swarm.json');
			
			fs.mkdirSync(userConfigDir, { recursive: true });
			fs.writeFileSync(userConfigFile, JSON.stringify({ max_iterations: 7 }));

			// Create project config with invalid JSON
			const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-test-'));
			const configDir = path.join(projectDir, '.opencode');
			const configFile = path.join(configDir, 'opencode-swarm.json');
			
			fs.mkdirSync(configDir, { recursive: true });
			fs.writeFileSync(configFile, '{ invalid }');

			// Should not crash, return user config or defaults
			const result = loadPluginConfig(projectDir);
			
			expect(result.max_iterations).toBe(7); // From user config
			expect(result.qa_retry_limit).toBe(3); // Default value
			expect(result.inject_phase_reminders).toBe(true); // Default value
			
			// Clean up project directory
			fs.rmSync(projectDir, { recursive: true, force: true });
		});

		it('should export MAX_CONFIG_FILE_BYTES as 102400', () => {
			expect(MAX_CONFIG_FILE_BYTES).toBe(102_400);
		});

		it('returns defaults when config file is too large', () => {
			const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-test-'));
			const configDir = path.join(projectDir, '.opencode');
			const configFile = path.join(configDir, 'opencode-swarm.json');
			fs.mkdirSync(configDir, { recursive: true });
			// Write a file larger than 100KB
			const largeContent = JSON.stringify({ max_iterations: 3 }) + ' '.repeat(110_000);
			fs.writeFileSync(configFile, largeContent);
			
			const result = loadPluginConfig(projectDir);
			// Should return defaults since the oversized file is ignored
			expect(result.max_iterations).toBe(5); // default
			
			fs.rmSync(projectDir, { recursive: true, force: true });
		});

		it('loads config when file is under size limit', () => {
			const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-test-'));
			const configDir = path.join(projectDir, '.opencode');
			const configFile = path.join(configDir, 'opencode-swarm.json');
			fs.mkdirSync(configDir, { recursive: true });
			fs.writeFileSync(configFile, JSON.stringify({ max_iterations: 4 }));
			
			const result = loadPluginConfig(projectDir);
			expect(result.max_iterations).toBe(4);
			
			fs.rmSync(projectDir, { recursive: true, force: true });
		});

		it('handles invalid schema gracefully', () => {
			// Create user config
			const userConfigDir = path.join(tempDir, 'opencode');
			const userConfigFile = path.join(userConfigDir, 'opencode-swarm.json');
			
			fs.mkdirSync(userConfigDir, { recursive: true });
			fs.writeFileSync(userConfigFile, JSON.stringify({ max_iterations: 7 }));

			// Create project config with invalid schema (max_iterations too high)
			const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-test-'));
			const configDir = path.join(projectDir, '.opencode');
			const configFile = path.join(configDir, 'opencode-swarm.json');
			
			fs.mkdirSync(configDir, { recursive: true });
			fs.writeFileSync(configFile, JSON.stringify({ max_iterations: 999 }));

			// Should not crash, return user config or defaults
			const result = loadPluginConfig(projectDir);
			
			expect(result.max_iterations).toBe(7); // From user config, invalid project config ignored
			expect(result.qa_retry_limit).toBe(3); // Default value
			expect(result.inject_phase_reminders).toBe(true); // Default value
			
			// Clean up project directory
			fs.rmSync(projectDir, { recursive: true, force: true });
		});

		// Fix 1: _loadedFromFile tracking tests
		it('_loadedFromFile is false when no config files exist', () => {
			const result = loadPluginConfig(tempDir);
			expect(result._loadedFromFile).toBe(false);
		});

		it('_loadedFromFile is true when user config loads successfully', () => {
			const userConfigDir = path.join(tempDir, 'opencode');
			const userConfigFile = path.join(userConfigDir, 'opencode-swarm.json');
			fs.mkdirSync(userConfigDir, { recursive: true });
			fs.writeFileSync(userConfigFile, JSON.stringify({ max_iterations: 7 }));

			const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-test-'));
			const result = loadPluginConfig(projectDir);
			expect(result._loadedFromFile).toBe(true);
			fs.rmSync(projectDir, { recursive: true, force: true });
		});

		it('_loadedFromFile is false when config file has invalid JSON', () => {
			const userConfigDir = path.join(tempDir, 'opencode');
			const userConfigFile = path.join(userConfigDir, 'opencode-swarm.json');
			fs.mkdirSync(userConfigDir, { recursive: true });
			fs.writeFileSync(userConfigFile, '{ invalid }');

			const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-test-'));
			const result = loadPluginConfig(projectDir);
			expect(result._loadedFromFile).toBe(false);
			fs.rmSync(projectDir, { recursive: true, force: true });
		});

		it('_loadedFromFile is false when config file is too large', () => {
			const userConfigDir = path.join(tempDir, 'opencode');
			const userConfigFile = path.join(userConfigDir, 'opencode-swarm.json');
			fs.mkdirSync(userConfigDir, { recursive: true });
			fs.writeFileSync(userConfigFile, JSON.stringify({ max_iterations: 3 }) + ' '.repeat(110_000));

			const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-test-'));
			const result = loadPluginConfig(projectDir);
			expect(result._loadedFromFile).toBe(false);
			fs.rmSync(projectDir, { recursive: true, force: true });
		});

		// Fix 3: Deep merge tests
		it('deep merges guardrails config between user and project', () => {
			// User config has guardrails.enabled: false
			const userConfigDir = path.join(tempDir, 'opencode');
			const userConfigFile = path.join(userConfigDir, 'opencode-swarm.json');
			fs.mkdirSync(userConfigDir, { recursive: true });
			fs.writeFileSync(userConfigFile, JSON.stringify({
				guardrails: { enabled: false }
			}));

			// Project config has guardrails.max_tool_calls: 500
			const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-test-'));
			const configDir = path.join(projectDir, '.opencode');
			const configFile = path.join(configDir, 'opencode-swarm.json');
			fs.mkdirSync(configDir, { recursive: true });
			fs.writeFileSync(configFile, JSON.stringify({
				guardrails: { max_tool_calls: 500 }
			}));

			const result = loadPluginConfig(projectDir);

			// Both fields should be present (deep merge, not shallow replace)
			expect(result.guardrails?.enabled).toBe(false);
			expect(result.guardrails?.max_tool_calls).toBe(500);

			fs.rmSync(projectDir, { recursive: true, force: true });
		});

		it('deep merges context_budget config between user and project', () => {
			const userConfigDir = path.join(tempDir, 'opencode');
			const userConfigFile = path.join(userConfigDir, 'opencode-swarm.json');
			fs.mkdirSync(userConfigDir, { recursive: true });
			fs.writeFileSync(userConfigFile, JSON.stringify({
				context_budget: { enabled: true, warn_threshold: 0.5 }
			}));

			const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-test-'));
			const configDir = path.join(projectDir, '.opencode');
			const configFile = path.join(configDir, 'opencode-swarm.json');
			fs.mkdirSync(configDir, { recursive: true });
			fs.writeFileSync(configFile, JSON.stringify({
				context_budget: { critical_threshold: 0.8 }
			}));

			const result = loadPluginConfig(projectDir);

			// Both fields should be present
			expect(result.context_budget?.enabled).toBe(true);
			expect(result.context_budget?.warn_threshold).toBe(0.5);
			expect(result.context_budget?.critical_threshold).toBe(0.8);

			fs.rmSync(projectDir, { recursive: true, force: true });
		});

		it('deep merges hooks config between user and project', () => {
			const userConfigDir = path.join(tempDir, 'opencode');
			const userConfigFile = path.join(userConfigDir, 'opencode-swarm.json');
			fs.mkdirSync(userConfigDir, { recursive: true });
			fs.writeFileSync(userConfigFile, JSON.stringify({
				hooks: { system_enhancer: false }
			}));

			const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-test-'));
			const configDir = path.join(projectDir, '.opencode');
			const configFile = path.join(configDir, 'opencode-swarm.json');
			fs.mkdirSync(configDir, { recursive: true });
			fs.writeFileSync(configFile, JSON.stringify({
				hooks: { delegation_tracker: true }
			}));

			const result = loadPluginConfig(projectDir);

			// Both fields should be present
			expect(result.hooks?.system_enhancer).toBe(false);
			expect(result.hooks?.delegation_tracker).toBe(true);

			fs.rmSync(projectDir, { recursive: true, force: true });
		});
	});

	describe('loadAgentPrompt', () => {
		it('should return empty object when no files exist', () => {
			const result = loadAgentPrompt('test-agent');
			expect(result).toEqual({});
		});

		it('should handle all standard agent names without error', () => {
			const agents = ['architect', 'coder', 'explorer', 'security-reviewer', 'test_engineer', 'critic'];
			const results = agents.map(agent => loadAgentPrompt(agent));

			// All should return valid objects without errors
			results.forEach(result => {
				expect(typeof result).toBe('object');
			});
		});
	});
});
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { deepMerge, loadPluginConfig, loadAgentPrompt } from '../../../src/config/loader';
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
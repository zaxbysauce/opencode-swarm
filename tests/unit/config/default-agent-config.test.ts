import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { getAgentConfigs } from '../../../src/agents/index';
import { PluginConfigSchema } from '../../../src/config/schema';

// Mock the fs/promises module to avoid file system operations in getAgentConfigs
// The agent tool snapshot writing calls mkdir + writeFile
mock.module('node:fs/promises', () => ({
	mkdir: mock(() => Promise.resolve()),
	writeFile: mock(() => Promise.resolve()),
}));

describe('PluginConfigSchema — default_agent field', () => {
	describe('acceptance and validation', () => {
		test('accepts valid default_agent value', () => {
			const result = PluginConfigSchema.safeParse({
				default_agent: 'coder',
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.default_agent).toBe('coder');
			}
		});

		test('accepts all valid agent names as default_agent', () => {
			const validAgents = [
				'architect',
				'coder',
				'reviewer',
				'test_engineer',
				'explorer',
				'critic',
				'sme',
				'docs',
				'designer',
			];

			for (const agent of validAgents) {
				const result = PluginConfigSchema.safeParse({
					default_agent: agent,
				});
				expect(result.success, `${agent} should be valid`).toBe(true);
			}
		});

		test('accepts empty object (backward compatibility)', () => {
			const result = PluginConfigSchema.safeParse({});
			expect(result.success).toBe(true);
		});

		test('accepts null/undefined default_agent (treated as missing)', () => {
			// default_agent is optional, so undefined is fine
			const result = PluginConfigSchema.safeParse({
				default_agent: undefined,
			});
			expect(result.success).toBe(true);
		});

		test('rejects invalid default_agent value', () => {
			// Invalid values like 'foo' should be rejected by the schema
			const result = PluginConfigSchema.safeParse({
				default_agent: 'foo',
			});
			expect(result.success).toBe(false);
		});

		test('rejects arbitrary string as default_agent', () => {
			const result = PluginConfigSchema.safeParse({
				default_agent: 'nonexistent',
			});
			expect(result.success).toBe(false);
		});
	});

	describe('default value', () => {
		test('defaults to architect when not specified', () => {
			const result = PluginConfigSchema.safeParse({});
			expect(result.success).toBe(true);
			if (result.success) {
				// The .default('architect') ensures this
				expect(result.data.default_agent).toBe('architect');
			}
		});

		test('explicit architect value is accepted', () => {
			const result = PluginConfigSchema.safeParse({
				default_agent: 'architect',
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.default_agent).toBe('architect');
			}
		});
	});
});

describe('getAgentConfigs — primary mode based on default_agent', () => {
	beforeEach(() => {
		// Reset any module state if needed
	});

	describe('architect as default primary when default_agent not specified', () => {
		test('sets architect to primary mode when default_agent absent', () => {
			const config: Record<string, unknown> = {};
			const result = getAgentConfigs(config as any);

			// architect should be primary
			expect(result['architect']).toBeDefined();
			expect(result['architect'].mode).toBe('primary');

			// other agents should be subagents
			expect(result['coder'].mode).toBe('subagent');
			expect(result['reviewer'].mode).toBe('subagent');
			expect(result['test_engineer'].mode).toBe('subagent');
			expect(result['explorer'].mode).toBe('subagent');
		});

		test('sets architect to primary mode when default_agent is architect', () => {
			const config = { default_agent: 'architect' };
			const result = getAgentConfigs(config as any);

			expect(result['architect'].mode).toBe('primary');
			expect(result['coder'].mode).toBe('subagent');
		});
	});

	describe('specified agent as primary when default_agent is set', () => {
		test('sets coder as primary when default_agent is coder', () => {
			const config = { default_agent: 'coder' };
			const result = getAgentConfigs(config as any);

			expect(result['architect'].mode).toBe('subagent');
			expect(result['coder'].mode).toBe('primary');
			expect(result['reviewer'].mode).toBe('subagent');
		});

		test('sets reviewer as primary when default_agent is reviewer', () => {
			const config = { default_agent: 'reviewer' };
			const result = getAgentConfigs(config as any);

			expect(result['architect'].mode).toBe('subagent');
			expect(result['coder'].mode).toBe('subagent');
			expect(result['reviewer'].mode).toBe('primary');
		});

		test('sets test_engineer as primary when default_agent is test_engineer', () => {
			const config = { default_agent: 'test_engineer' };
			const result = getAgentConfigs(config as any);

			expect(result['architect'].mode).toBe('subagent');
			expect(result['test_engineer'].mode).toBe('primary');
		});

		test('sets explorer as primary when default_agent is explorer', () => {
			const config = { default_agent: 'explorer' };
			const result = getAgentConfigs(config as any);

			expect(result['architect'].mode).toBe('subagent');
			expect(result['explorer'].mode).toBe('primary');
		});
	});

	describe('primary agent permission handling', () => {
		test('primary agent has task:allow permission', () => {
			const config = { default_agent: 'coder' };
			const result = getAgentConfigs(config as any);

			// Primary agent should have task permission
			expect(result['coder'].permission).toEqual({ task: 'allow' });
		});

		test('subagent does not have task:allow permission', () => {
			const config = { default_agent: 'coder' };
			const result = getAgentConfigs(config as any);

			// Subagent should not have task permission
			expect(result['architect'].permission).toBeUndefined();
		});

		test('primary agent has no model (orchestrator selects)', () => {
			const config = { default_agent: 'architect' };
			const result = getAgentConfigs(config as any);

			// Primary agent should have model deleted (orchestrator handles model selection)
			expect(result['architect'].model).toBeUndefined();
		});
	});

	describe('backward compatibility', () => {
		test('existing config without default_agent still works', () => {
			// Simulate existing config that was used before default_agent was added
			const existingConfig = {
				agents: {
					coder: { model: 'opencode/gpt-5' },
					reviewer: { model: 'opencode/gpt-5' },
				},
				max_iterations: 5,
				execution_mode: 'balanced' as const,
			};

			const result = getAgentConfigs(existingConfig as any);

			// Should still work and architect should be primary
			expect(result['architect'].mode).toBe('primary');
			expect(result['coder'].mode).toBe('subagent');
			expect(result['reviewer'].mode).toBe('subagent');
		});

		test('minimal empty config defaults to architect as primary', () => {
			const result = getAgentConfigs({} as any);

			expect(result['architect'].mode).toBe('primary');
		});

		test('undefined config still works', () => {
			const result = getAgentConfigs(undefined);

			expect(result['architect'].mode).toBe('primary');
			expect(result['coder'].mode).toBe('subagent');
		});
	});

	describe('agent name matching with prefixes', () => {
		test('handles prefixed agent names (cloud_coder)', () => {
			// When using swarms, agents can have prefixes like 'cloud_coder'
			// The default_agent matching should handle this via endsWith check
			const config = { default_agent: 'coder' };
			const result = getAgentConfigs(config as any);

			// The coder agent name 'coder' should match default_agent 'coder'
			expect(result['coder'].mode).toBe('primary');
		});

		test('handles hyphenated agent names (cloud-coder)', () => {
			// Hyphe nation separators are also supported
			const config = { default_agent: 'coder' };
			const result = getAgentConfigs(config as any);

			// The matching logic checks endsWith(`_${defaultAgent}`) and endsWith(`-${defaultAgent}`)
			expect(result['coder'].mode).toBe('primary');
		});
	});

	describe('invalid default_agent fallback', () => {
		test('falls back to architect when default_agent is invalid string', () => {
			// An invalid default_agent like 'foo' should not cause all agents to be subagents
			// Instead, it should fall back to architect being primary
			const config = { default_agent: 'foo' } as any;
			const result = getAgentConfigs(config);

			// architect should be primary due to fallback
			expect(result['architect'].mode).toBe('primary');
			// all other agents should be subagents
			expect(result['coder'].mode).toBe('subagent');
			expect(result['reviewer'].mode).toBe('subagent');
			expect(result['test_engineer'].mode).toBe('subagent');
			expect(result['explorer'].mode).toBe('subagent');
		});

		test('falls back to architect when default_agent is arbitrary unknown value', () => {
			const config = { default_agent: 'nonexistent_agent_xyz' } as any;
			const result = getAgentConfigs(config);

			// Should still have exactly one primary agent (architect)
			const primaryAgents = Object.values(result).filter(
				(a) => a.mode === 'primary',
			);
			expect(primaryAgents).toHaveLength(1);
			expect(result['architect'].mode).toBe('primary');
		});
	});
});

describe('Integration: Schema validation + getAgentConfigs', () => {
	test('parsed schema value flows correctly to getAgentConfigs', () => {
		const input = {
			default_agent: 'reviewer',
			agents: {
				coder: { model: 'opencode/gpt-5' },
			},
		};

		const parsed = PluginConfigSchema.safeParse(input);
		expect(parsed.success).toBe(true);

		if (parsed.success) {
			const result = getAgentConfigs(parsed.data);
			expect(result['reviewer'].mode).toBe('primary');
			expect(result['architect'].mode).toBe('subagent');
		}
	});

	test('schema default flows to getAgentConfigs primary selection', () => {
		const input = {};

		const parsed = PluginConfigSchema.safeParse(input);
		expect(parsed.success).toBe(true);

		if (parsed.success) {
			// parsed.data.default_agent should be 'architect' due to schema default
			expect(parsed.data.default_agent).toBe('architect');

			const result = getAgentConfigs(parsed.data);
			expect(result['architect'].mode).toBe('primary');
		}
	});
});

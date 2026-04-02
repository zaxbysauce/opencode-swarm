import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getAgentConfigs } from '../../../src/agents';
import type { PluginConfig } from '../../../src/config';

let originalXDG: string | undefined;
let tempDir: string | undefined;

beforeEach(() => {
	originalXDG = process.env.XDG_CONFIG_HOME;
	tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-strip-test-'));
	process.env.XDG_CONFIG_HOME = tempDir;
});

afterEach(() => {
	if (originalXDG === undefined) delete process.env.XDG_CONFIG_HOME;
	else process.env.XDG_CONFIG_HOME = originalXDG;
	if (tempDir) {
		fs.rmSync(tempDir, { recursive: true, force: true });
		tempDir = undefined;
	}
});

describe('getAgentConfigs model stripping for primary agents', () => {
	describe('default swarm (no prefix)', () => {
		it('architect (primary) loses model property', () => {
			const configs = getAgentConfigs();
			const architect = configs.architect;

			expect(architect.mode).toBe('primary');
			expect(architect.model).toBeUndefined();
		});

		it('subagents keep model property', () => {
			const configs = getAgentConfigs();

			const subagentNames = [
				'coder',
				'reviewer',
				'explorer',
				'sme',
				'critic',
				'test_engineer',
				'docs',
			];

			for (const name of subagentNames) {
				const agent = configs[name];
				expect(agent.mode).toBe('subagent');
				expect(agent.model).toBeDefined();
				expect(typeof agent.model).toBe('string');
				expect(agent.model?.length).toBeGreaterThan(0);
			}
		});
	});

	describe('prefixed swarms', () => {
		it('local_architect (primary) loses model property', () => {
			const config = {
				swarms: {
					local: { name: 'Local' },
				},
			} as unknown as PluginConfig;

			const configs = getAgentConfigs(config);
			const localArchitect = configs.local_architect;

			expect(localArchitect.mode).toBe('primary');
			expect(localArchitect.model).toBeUndefined();
		});

		it('cloud_architect (primary) loses model property', () => {
			const config = {
				swarms: {
					cloud: { name: 'Cloud' },
				},
			} as unknown as PluginConfig;

			const configs = getAgentConfigs(config);
			const cloudArchitect = configs.cloud_architect;

			expect(cloudArchitect.mode).toBe('primary');
			expect(cloudArchitect.model).toBeUndefined();
		});

		it('prefixed subagents keep model property', () => {
			const config = {
				swarms: {
					local: { name: 'Local' },
				},
			} as unknown as PluginConfig;

			const configs = getAgentConfigs(config);

			const subagentNames = [
				'local_coder',
				'local_reviewer',
				'local_explorer',
				'local_sme',
				'local_critic',
				'local_test_engineer',
				'local_docs',
			];

			for (const name of subagentNames) {
				const agent = configs[name];
				expect(agent.mode).toBe('subagent');
				expect(agent.model).toBeDefined();
				expect(typeof agent.model).toBe('string');
			}
		});
	});

	describe('edge cases', () => {
		it('multiple swarms: each architect loses model, all subagents keep model', () => {
			const config = {
				swarms: {
					default: {},
					cloud: { name: 'Cloud' },
					local: { name: 'Local' },
				},
			} as unknown as PluginConfig;

			const configs = getAgentConfigs(config);

			// All architects should be primary with no model
			const architectNames = [
				'architect',
				'cloud_architect',
				'local_architect',
			];
			for (const name of architectNames) {
				const agent = configs[name];
				expect(agent.mode).toBe('primary');
				expect(agent.model).toBeUndefined();
			}

			// All other agents should be subagent with model
			const subagentNames = [
				'coder',
				'reviewer',
				'explorer',
				'sme',
				'critic',
				'test_engineer',
				'docs',
				'cloud_coder',
				'cloud_reviewer',
				'cloud_explorer',
				'cloud_sme',
				'cloud_critic',
				'cloud_test_engineer',
				'cloud_docs',
				'local_coder',
				'local_reviewer',
				'local_explorer',
				'local_sme',
				'local_critic',
				'local_test_engineer',
				'local_docs',
			];
			for (const name of subagentNames) {
				const agent = configs[name];
				expect(agent.mode).toBe('subagent');
				expect(agent.model).toBeDefined();
			}
		});

		it('subagent model override is preserved', () => {
			const config = {
				agents: {
					coder: {
						model: 'custom/coder-model',
					},
				},
			} as unknown as PluginConfig;

			const configs = getAgentConfigs(config);

			// Subagent should keep its model override
			expect(configs.coder.mode).toBe('subagent');
			expect(configs.coder.model).toBe('custom/coder-model');
		});

		it('architect model override is still stripped (orchestrator handles model selection)', () => {
			const config = {
				agents: {
					architect: {
						model: 'custom/architect-model',
					},
				},
			} as unknown as PluginConfig;

			const configs = getAgentConfigs(config);

			// Primary agent should still have model stripped despite override
			expect(configs.architect.mode).toBe('primary');
			expect(configs.architect.model).toBeUndefined();
		});

		it('hybrid swarm with default and custom: only custom swarm prefixed agents get stripped', () => {
			const config = {
				swarms: {
					default: {},
					local: { name: 'Local' },
				},
			} as unknown as PluginConfig;

			const configs = getAgentConfigs(config);

			// Default architect - should be stripped (primary)
			expect(configs.architect.mode).toBe('primary');
			expect(configs.architect.model).toBeUndefined();

			// Local architect - should be stripped (primary)
			expect(configs.local_architect.mode).toBe('primary');
			expect(configs.local_architect.model).toBeUndefined();

			// Default subagents - should keep model
			expect(configs.coder.mode).toBe('subagent');
			expect(configs.coder.model).toBeDefined();

			// Local subagents - should keep model
			expect(configs.local_coder.mode).toBe('subagent');
			expect(configs.local_coder.model).toBeDefined();
		});
	});

	describe('boundary: architect-like names', () => {
		it('name ending with _architect is treated as primary', () => {
			const config = {
				swarms: {
					default: {},
					test: { name: 'Test' },
				},
			} as unknown as PluginConfig;

			const configs = getAgentConfigs(config);

			// These should all be primary with model stripped
			expect(configs.architect?.mode).toBe('primary');
			expect(configs.architect?.model).toBeUndefined();

			expect(configs.test_architect?.mode).toBe('primary');
			expect(configs.test_architect?.model).toBeUndefined();
		});

		it('name NOT ending with _architect is treated as subagent', () => {
			const config = {
				swarms: {
					architecture: { name: 'Architecture' }, // Note: NOT architect
				},
			} as unknown as PluginConfig;

			const configs = getAgentConfigs(config);

			// architecture_reviewer should be subagent (does not end with _architect)
			expect(configs.architecture_reviewer?.mode).toBe('subagent');
			expect(configs.architecture_reviewer?.model).toBeDefined();
		});
	});
});

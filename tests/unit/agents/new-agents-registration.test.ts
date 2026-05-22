/**
 * Verifies that skill_improver and spec_writer agents are wired into the
 * canonical agent registries (constants + factories) and that their tool
 * permission maps exist.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getAgentConfigs } from '../../../src/agents';
import { createSkillImproverAgent } from '../../../src/agents/skill-improver';
import { createSpecWriterAgent } from '../../../src/agents/spec-writer';
import type { PluginConfig } from '../../../src/config';
import {
	AGENT_TOOL_MAP,
	ALL_AGENT_NAMES,
	ALL_SUBAGENT_NAMES,
	DEFAULT_AGENT_CONFIGS,
	DEFAULT_MODELS,
} from '../../../src/config/constants';

describe('skill_improver registration', () => {
	it('is in ALL_AGENT_NAMES and ALL_SUBAGENT_NAMES', () => {
		expect(ALL_AGENT_NAMES).toContain('skill_improver');
		expect(ALL_SUBAGENT_NAMES).toContain('skill_improver');
	});

	it('has default model entry in DEFAULT_MODELS and DEFAULT_AGENT_CONFIGS', () => {
		expect(DEFAULT_MODELS.skill_improver).toBeDefined();
		expect(DEFAULT_AGENT_CONFIGS.skill_improver).toBeDefined();
		expect(
			DEFAULT_AGENT_CONFIGS.skill_improver.fallback_models.length,
		).toBeGreaterThan(0);
	});

	it('has tool permissions including skill tools and read-only access', () => {
		const tools = AGENT_TOOL_MAP.skill_improver;
		expect(tools).toContain('skill_generate');
		expect(tools).toContain('skill_list');
		expect(tools).toContain('skill_inspect');
		expect(tools).toContain('skill_improve');
		expect(tools).toContain('knowledge_recall');
		// Must not have write/destructive tools
		expect(tools).not.toContain('save_plan');
		expect(tools).not.toContain('phase_complete');
	});

	it('agent factory produces a definition with the expected shape', () => {
		const def = createSkillImproverAgent('opencode/big-pickle');
		expect(def.name).toBe('skill_improver');
		expect(def.config.model).toBe('opencode/big-pickle');
		expect(typeof def.config.prompt).toBe('string');
		expect(def.config.prompt!.length).toBeGreaterThan(50);
		expect(def.config.prompt).toMatch(/quota/i);
	});
});

describe('spec_writer registration', () => {
	it('is in ALL_AGENT_NAMES and ALL_SUBAGENT_NAMES', () => {
		expect(ALL_AGENT_NAMES).toContain('spec_writer');
		expect(ALL_SUBAGENT_NAMES).toContain('spec_writer');
	});

	it('has default model entry independent of architect', () => {
		expect(DEFAULT_MODELS.spec_writer).toBeDefined();
		expect(DEFAULT_AGENT_CONFIGS.spec_writer).toBeDefined();
	});

	it('has tool permissions including spec_write but not coder/delegation tools', () => {
		const tools = AGENT_TOOL_MAP.spec_writer;
		expect(tools).toContain('spec_write');
		expect(tools).toContain('search');
		expect(tools).toContain('lint_spec');
		expect(tools).toContain('req_coverage');
		expect(tools).not.toContain('phase_complete');
		expect(tools).not.toContain('save_plan');
	});

	it('agent factory produces a definition that mentions spec_write contract', () => {
		const def = createSpecWriterAgent('opencode/gpt-5-nano');
		expect(def.name).toBe('spec_writer');
		expect(def.config.model).toBe('opencode/gpt-5-nano');
		expect(def.config.prompt).toMatch(/spec_write/);
		expect(def.config.prompt).toMatch(/Acceptance\s+Criteria/);
	});

	it('skill_improver and spec_writer can run on independent models', () => {
		const a = createSkillImproverAgent('opencode/expensive-model');
		const b = createSpecWriterAgent('opencode/cheap-model');
		expect(a.config.model).toBe('opencode/expensive-model');
		expect(b.config.model).toBe('opencode/cheap-model');
		expect(a.config.model).not.toBe(b.config.model);
	});
});

// AGENTS.md invariant #11: any change to agent registration must verify both
// legacy unprefixed AND multi-swarm prefixed agents resolve correctly. The v7.3.x
// regression demoted every `*_architect` to subagent under multi-swarm configs.
// New subagents (skill_improver, spec_writer) must register correctly under all
// prefixes and not break the primary-selection invariant for architects.
describe('multi-swarm prefix registration for new agents', () => {
	let originalXDG: string | undefined;
	let tempDir: string | undefined;

	function sectionBetween(
		text: string,
		startMarker: string,
		endMarker: string,
	): string {
		const start = text.indexOf(startMarker);
		expect(start).toBeGreaterThan(-1);
		const end = text.indexOf(endMarker, start + startMarker.length);
		return text.slice(start, end === -1 ? text.length : end);
	}

	function countOccurrences(text: string, needle: string): number {
		return text.split(needle).length - 1;
	}

	beforeEach(() => {
		originalXDG = process.env.XDG_CONFIG_HOME;
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-swarm-new-agents-'));
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

	it('creates prefixed skill_improver / spec_writer in each swarm and at least one architect is mode primary', () => {
		const config = {
			swarms: {
				local: { name: 'Local' },
				mega: { name: 'Mega' },
			},
		} as unknown as PluginConfig;

		const configs = getAgentConfigs(config);

		// New agents exist with both prefixes and are subagents (not primary)
		for (const prefix of ['local', 'mega']) {
			const skillName = `${prefix}_skill_improver`;
			const specName = `${prefix}_spec_writer`;
			expect(configs[skillName]).toBeDefined();
			expect(configs[specName]).toBeDefined();
			expect(configs[skillName].mode).toBe('subagent');
			expect(configs[specName].mode).toBe('subagent');
			// Subagents must keep their model
			expect(configs[skillName].model).toBeDefined();
			expect(configs[specName].model).toBeDefined();
		}

		// Invariant #11: at least one prefixed architect is primary and has model stripped
		const architectNames = Object.keys(configs).filter((n) =>
			n.endsWith('_architect'),
		);
		expect(architectNames.length).toBeGreaterThan(0);
		const primaryArchitects = architectNames.filter(
			(n) => configs[n].mode === 'primary',
		);
		expect(primaryArchitects.length).toBeGreaterThan(0);
		for (const name of primaryArchitects) {
			expect(configs[name].model).toBeUndefined();
		}
	});

	it('resolves modelrelay spec_writer prompt and model through the prefixed registered agent', () => {
		const config = {
			swarms: {
				modelrelay: {
					name: 'Modelrelay',
					agents: {
						spec_writer: { model: 'modelrelay/high-spec' },
					},
				},
			},
		} as unknown as PluginConfig;

		const configs = getAgentConfigs(config);
		const architectPrompt = configs.modelrelay_architect.prompt ?? '';
		const specWriterSection = sectionBetween(
			architectPrompt,
			'## SPEC WRITER',
			'### ANTI-RATIONALIZATION',
		);
		const agentsSection = sectionBetween(
			architectPrompt,
			'## AGENTS',
			'## SKILLS PROPAGATION',
		);
		const specifySection = sectionBetween(
			architectPrompt,
			'### MODE: SPECIFY',
			'### MODE:',
		);
		const brainstormSection = sectionBetween(
			architectPrompt,
			'### MODE: BRAINSTORM',
			'### MODE: SPECIFY',
		);

		expect(configs.modelrelay_spec_writer).toBeDefined();
		expect(configs.modelrelay_spec_writer.mode).toBe('subagent');
		expect(configs.modelrelay_spec_writer.model).toBe('modelrelay/high-spec');
		expect(architectPrompt).toContain(
			'Your agents: modelrelay_explorer, modelrelay_sme, modelrelay_coder, modelrelay_reviewer, modelrelay_test_engineer, modelrelay_critic, modelrelay_critic_sounding_board, modelrelay_skill_improver, modelrelay_spec_writer',
		);
		expect(agentsSection).toContain('modelrelay_spec_writer');
		expect(specWriterSection).toContain('prefer `modelrelay_spec_writer`');
		expect(specifySection).toContain(
			'Delegate substantial spec drafting to `modelrelay_spec_writer`',
		);
		expect(brainstormSection).toContain(
			'Delegate substantial spec drafting to `modelrelay_spec_writer`',
		);
		expect(architectPrompt).not.toContain('prefer `spec_writer`');
	});

	it('documents spec_writer default model fallback without inheriting architect model', () => {
		const configs = getAgentConfigs({
			swarms: {
				modelrelay: {
					name: 'Modelrelay',
					agents: {
						architect: { model: 'modelrelay/deepseek-v4-flash' },
					},
				},
			},
		} as unknown as PluginConfig);

		expect(configs.modelrelay_spec_writer).toBeDefined();
		expect(configs.modelrelay_spec_writer.model).toBe(
			DEFAULT_MODELS.spec_writer,
		);
		expect(configs.modelrelay_spec_writer.model).not.toBe(
			'modelrelay/deepseek-v4-flash',
		);
	});

	it('does not advertise modelrelay spec_writer when the role is disabled', () => {
		const configs = getAgentConfigs({
			swarms: {
				modelrelay: {
					name: 'Modelrelay',
					agents: {
						spec_writer: { disabled: true },
					},
				},
			},
		} as unknown as PluginConfig);

		const architectPrompt = configs.modelrelay_architect.prompt ?? '';
		const agentsSection = sectionBetween(
			architectPrompt,
			'## AGENTS',
			'## SKILLS PROPAGATION',
		);
		const specifySection = sectionBetween(
			architectPrompt,
			'### MODE: SPECIFY',
			'### MODE:',
		);
		const brainstormSection = sectionBetween(
			architectPrompt,
			'### MODE: BRAINSTORM',
			'### MODE: SPECIFY',
		);

		expect(configs.modelrelay_spec_writer).toBeUndefined();
		expect(architectPrompt).not.toContain('modelrelay_spec_writer');
		expect(architectPrompt).not.toContain('@modelrelay_spec_writer');
		expect(architectPrompt).not.toContain('## SPEC WRITER');
		expect(agentsSection).not.toContain('spec_writer');
		expect(specifySection).toContain('spec_writer is disabled');
		expect(specifySection).toContain(
			'Do not continue SPECIFY until spec_writer is available.',
		);
		expect(specifySection).not.toContain('Delegate substantial spec drafting');
		expect(specifySection).not.toContain('Require `modelrelay_spec_writer`');
		expect(brainstormSection).toContain('spec_writer is disabled');
		expect(brainstormSection).toContain(
			'Do not continue BRAINSTORM spec writing until spec_writer is available.',
		);
		expect(brainstormSection).not.toContain(
			'Delegate substantial spec drafting',
		);
		expect(brainstormSection).not.toContain('modelrelay_spec_writer');
		expect(countOccurrences(architectPrompt, 'spec_writer is disabled')).toBe(
			2,
		);
	});

	it('does not advertise modelrelay skill_improver as an agent when the role is disabled', () => {
		const configs = getAgentConfigs({
			swarms: {
				modelrelay: {
					name: 'Modelrelay',
					agents: {
						skill_improver: { disabled: true },
					},
				},
			},
		} as unknown as PluginConfig);

		const architectPrompt = configs.modelrelay_architect.prompt ?? '';
		const agentsSection = sectionBetween(
			architectPrompt,
			'## AGENTS',
			'## SKILLS PROPAGATION',
		);

		expect(configs.modelrelay_skill_improver).toBeUndefined();
		// Disabled optional agents may still be mentioned as config/tool concepts,
		// but they must not be advertised as callable swarm agents.
		expect(architectPrompt).not.toContain('modelrelay_skill_improver');
		expect(architectPrompt).not.toContain('@modelrelay_skill_improver');
		expect(architectPrompt).not.toContain('## SKILL IMPROVER');
		expect(agentsSection).not.toContain('skill_improver');
	});

	it('does not advertise disabled optional agents when both optional roles are disabled', () => {
		const configs = getAgentConfigs({
			swarms: {
				modelrelay: {
					name: 'Modelrelay',
					agents: {
						skill_improver: { disabled: true },
						spec_writer: { disabled: true },
					},
				},
			},
		} as unknown as PluginConfig);

		const architectPrompt = configs.modelrelay_architect.prompt ?? '';
		const agentsSection = sectionBetween(
			architectPrompt,
			'## AGENTS',
			'## SKILLS PROPAGATION',
		);

		expect(configs.modelrelay_skill_improver).toBeUndefined();
		expect(configs.modelrelay_spec_writer).toBeUndefined();
		expect(architectPrompt).not.toContain('modelrelay_skill_improver');
		expect(architectPrompt).not.toContain('modelrelay_spec_writer');
		expect(architectPrompt).not.toContain('@modelrelay_skill_improver');
		expect(architectPrompt).not.toContain('@modelrelay_spec_writer');
		expect(architectPrompt).not.toContain('## SKILL IMPROVER');
		expect(architectPrompt).not.toContain('## SPEC WRITER');
		expect(agentsSection).not.toContain('skill_improver');
		expect(agentsSection).not.toContain('spec_writer');
		expect(countOccurrences(architectPrompt, 'spec_writer is disabled')).toBe(
			2,
		);
	});

	it('default (unprefixed) registration still produces skill_improver and spec_writer as subagents', () => {
		const configs = getAgentConfigs();
		expect(configs.skill_improver).toBeDefined();
		expect(configs.spec_writer).toBeDefined();
		expect(configs.skill_improver.mode).toBe('subagent');
		expect(configs.spec_writer.mode).toBe('subagent');
	});
});

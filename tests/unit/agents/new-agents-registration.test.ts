/**
 * Verifies that skill_improver and spec_writer agents are wired into the
 * canonical agent registries (constants + factories) and that their tool
 * permission maps exist.
 */

import { describe, expect, it } from 'bun:test';
import { createSkillImproverAgent } from '../../../src/agents/skill-improver';
import { createSpecWriterAgent } from '../../../src/agents/spec-writer';
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

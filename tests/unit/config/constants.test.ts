import { describe, expect, it } from 'bun:test';
import {
	AGENT_TOOL_MAP,
	ALL_AGENT_NAMES,
	ALL_SUBAGENT_NAMES,
	DEFAULT_MODELS,
	isQAAgent,
	isSubagent,
	ORCHESTRATOR_NAME,
	PIPELINE_AGENTS,
	QA_AGENTS,
} from '../../../src/config/constants';
import { TOOL_NAMES } from '../../../src/tools/tool-names';

describe('constants.ts', () => {
	describe('QA_AGENTS', () => {
		it('contains reviewer, critic, and critic_oversight (3 total)', () => {
			expect(QA_AGENTS).toContain('reviewer');
			expect(QA_AGENTS).toContain('critic');
			expect(QA_AGENTS).toContain('critic_oversight');
			expect(QA_AGENTS).toHaveLength(3);
		});
	});

	describe('PIPELINE_AGENTS', () => {
		it('contains exactly explorer, coder, and test_engineer', () => {
			expect(PIPELINE_AGENTS).toEqual(['explorer', 'coder', 'test_engineer']);
			expect(PIPELINE_AGENTS).toHaveLength(3);
		});
	});

	describe('ALL_SUBAGENT_NAMES', () => {
		it('contains all 13 subagents (sme + docs + designer + critic variants + curator variants + QA + pipeline)', () => {
			// v6.1: added docs (default enabled) and designer (opt-in); v6.34: added critic_sounding_board; v6.36.0: added critic_drift_verifier; v6.42.1: added curator_init + curator_phase; v6.x.x: added critic_oversight
			expect(ALL_SUBAGENT_NAMES).toContain('sme');
			expect(ALL_SUBAGENT_NAMES).toContain('docs');
			expect(ALL_SUBAGENT_NAMES).toContain('designer');
			expect(ALL_SUBAGENT_NAMES).toContain('critic_sounding_board');
			expect(ALL_SUBAGENT_NAMES).toContain('critic_drift_verifier');
			expect(ALL_SUBAGENT_NAMES).toContain('curator_init');
			expect(ALL_SUBAGENT_NAMES).toContain('curator_phase');
			expect(ALL_SUBAGENT_NAMES).toContain('reviewer');
			expect(ALL_SUBAGENT_NAMES).toContain('critic');
			expect(ALL_SUBAGENT_NAMES).toContain('critic_oversight');
			expect(ALL_SUBAGENT_NAMES).toContain('explorer');
			expect(ALL_SUBAGENT_NAMES).toContain('coder');
			expect(ALL_SUBAGENT_NAMES).toContain('test_engineer');
			expect(ALL_SUBAGENT_NAMES).toHaveLength(13);
		});
	});

	describe('ALL_AGENT_NAMES', () => {
		it('contains architect + all 13 subagents = 14 total', () => {
			// v6.1: added docs and designer; v6.34: added critic_sounding_board; v6.36.0: added critic_drift_verifier; v6.42.1: added curator_init + curator_phase; v6.x.x: added critic_oversight
			// architect must be first — it is the orchestrator and must be listed before all subagents
			expect(ALL_AGENT_NAMES[0]).toBe('architect');
			// All subagents must be present
			for (const name of ALL_SUBAGENT_NAMES) {
				expect(ALL_AGENT_NAMES).toContain(name);
			}
			expect(ALL_AGENT_NAMES).toHaveLength(14);
		});
	});

	describe('ORCHESTRATOR_NAME', () => {
		it("is 'architect'", () => {
			expect(ORCHESTRATOR_NAME).toBe('architect');
		});
	});

	describe('isQAAgent()', () => {
		it('returns true for reviewer and critic', () => {
			expect(isQAAgent('reviewer')).toBe(true);
			expect(isQAAgent('critic')).toBe(true);
		});

		it('returns false for non-QA agents', () => {
			expect(isQAAgent('coder')).toBe(false);
			expect(isQAAgent('explorer')).toBe(false);
			expect(isQAAgent('architect')).toBe(false);
			expect(isQAAgent('sme')).toBe(false);
			expect(isQAAgent('test_engineer')).toBe(false);
		});
	});

	describe('isSubagent()', () => {
		it('returns true for all 12 subagent names', () => {
			expect(isSubagent('sme')).toBe(true);
			expect(isSubagent('docs')).toBe(true);
			expect(isSubagent('designer')).toBe(true);
			expect(isSubagent('critic_sounding_board')).toBe(true);
			expect(isSubagent('critic_drift_verifier')).toBe(true);
			expect(isSubagent('curator_init')).toBe(true);
			expect(isSubagent('curator_phase')).toBe(true);
			expect(isSubagent('reviewer')).toBe(true);
			expect(isSubagent('critic')).toBe(true);
			expect(isSubagent('explorer')).toBe(true);
			expect(isSubagent('coder')).toBe(true);
			expect(isSubagent('test_engineer')).toBe(true);
		});

		it('returns false for architect', () => {
			expect(isSubagent('architect')).toBe(false);
		});

		it('returns false for arbitrary strings', () => {
			expect(isSubagent('unknown')).toBe(false);
			expect(isSubagent('')).toBe(false);
			expect(isSubagent('fake_agent')).toBe(false);
		});
	});

	describe('DEFAULT_MODELS', () => {
		it('has entries for all agents in ALL_AGENT_NAMES', () => {
			// v6.14: architect intentionally omitted from DEFAULT_MODELS (inherits OpenCode UI selection)
			for (const agent of ALL_AGENT_NAMES) {
				if (agent === 'architect') continue; // architect is not in DEFAULT_MODELS
				expect(DEFAULT_MODELS).toHaveProperty(agent);
				expect(typeof DEFAULT_MODELS[agent]).toBe('string');
			}
		});

		it('has a default fallback entry', () => {
			expect(DEFAULT_MODELS).toHaveProperty('default');
			expect(typeof DEFAULT_MODELS.default).toBe('string');
		});

		it('all values are non-empty strings', () => {
			for (const [agent, model] of Object.entries(DEFAULT_MODELS)) {
				expect(typeof model).toBe('string');
				expect(model.length).toBeGreaterThan(0);
			}
		});

		it('has exactly 14 entries (13 subagents + default, no architect)', () => {
			// v6.14: architect removed - inherits OpenCode UI selection instead; v6.36.0: added critic_drift_verifier; v6.42.1: added curator_init + curator_phase; v6.x.x: added critic_oversight
			expect(Object.keys(DEFAULT_MODELS)).toHaveLength(14);
		});
	});

	describe('AGENT_TOOL_MAP registry coherence', () => {
		it('every tool in TOOL_NAMES is assigned to at least one agent in AGENT_TOOL_MAP', () => {
			const assignedTools = new Set<string>();
			for (const tools of Object.values(AGENT_TOOL_MAP)) {
				for (const tool of tools) assignedTools.add(tool);
			}
			for (const tool of TOOL_NAMES) {
				expect(assignedTools.has(tool)).toBe(true);
			}
		});
	});
});

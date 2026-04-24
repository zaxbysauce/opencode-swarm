/**
 * Tests for src/agents/council-member.ts and src/agents/council-moderator.ts.
 *
 * Covers prompt template content (NSED protocol markers), AGENT_TOOL_MAP
 * enforcement (web_search-only for member, empty for moderator), and the
 * persona-block insertion path.
 */

import { describe, expect, test } from 'bun:test';
import { AGENT_TOOL_MAP } from '../config/constants';
import {
	COUNCIL_MEMBER_PROMPT,
	createCouncilMemberAgent,
} from './council-member';
import {
	COUNCIL_MODERATOR_PROMPT,
	createCouncilModeratorAgent,
} from './council-moderator';

describe('createCouncilMemberAgent', () => {
	test('returns valid AgentDefinition', () => {
		const agent = createCouncilMemberAgent('test-model');
		expect(agent.name).toBe('council_member');
		expect(agent.config.model).toBe('test-model');
		expect(typeof agent.description).toBe('string');
		expect(typeof agent.config.prompt).toBe('string');
	});

	test('disables write/edit/patch tools', () => {
		const agent = createCouncilMemberAgent('test-model');
		expect(agent.config.tools?.write).toBe(false);
		expect(agent.config.tools?.edit).toBe(false);
		expect(agent.config.tools?.patch).toBe(false);
	});

	test('customPrompt overrides default', () => {
		const agent = createCouncilMemberAgent('m', 'CUSTOM PROMPT');
		expect(agent.config.prompt).toBe('CUSTOM PROMPT');
	});

	test('customAppendPrompt appends to default', () => {
		const agent = createCouncilMemberAgent('m', undefined, 'EXTRA');
		expect(agent.config.prompt).toContain('EXTRA');
		expect(agent.config.prompt).toContain('Council Member');
	});
});

describe('COUNCIL_MEMBER_PROMPT content', () => {
	test('contains template variables', () => {
		expect(COUNCIL_MEMBER_PROMPT).toContain('{{MEMBER_ID}}');
		expect(COUNCIL_MEMBER_PROMPT).toContain('{{ROLE}}');
		expect(COUNCIL_MEMBER_PROMPT).toContain('{{PERSONA_BLOCK}}');
		expect(COUNCIL_MEMBER_PROMPT).toContain('{{ROUND}}');
		expect(COUNCIL_MEMBER_PROMPT).toContain('{{DISAGREEMENT_BLOCK}}');
	});

	test('Round 1 protocol forbids coordination', () => {
		expect(COUNCIL_MEMBER_PROMPT).toContain('Do NOT coordinate');
	});

	test('Round 2 protocol declares MAINTAIN/CONCEDE/NUANCE keywords', () => {
		expect(COUNCIL_MEMBER_PROMPT).toContain('MAINTAIN');
		expect(COUNCIL_MEMBER_PROMPT).toContain('CONCEDE');
		expect(COUNCIL_MEMBER_PROMPT).toContain('NUANCE');
	});

	test('JSON response format documented', () => {
		expect(COUNCIL_MEMBER_PROMPT).toContain('"memberId"');
		expect(COUNCIL_MEMBER_PROMPT).toContain('"confidence"');
		expect(COUNCIL_MEMBER_PROMPT).toContain('"sources"');
		expect(COUNCIL_MEMBER_PROMPT).toContain('"areasOfUncertainty"');
	});

	test('hard rule: web_search is the only tool', () => {
		expect(COUNCIL_MEMBER_PROMPT).toContain('web_search is your ONLY tool');
	});
});

describe('createCouncilModeratorAgent', () => {
	test('returns valid AgentDefinition', () => {
		const agent = createCouncilModeratorAgent('test-model');
		expect(agent.name).toBe('council_moderator');
		expect(agent.config.model).toBe('test-model');
	});

	test('disables write/edit/patch tools', () => {
		const agent = createCouncilModeratorAgent('test-model');
		expect(agent.config.tools?.write).toBe(false);
		expect(agent.config.tools?.edit).toBe(false);
		expect(agent.config.tools?.patch).toBe(false);
	});

	test('customPrompt overrides default', () => {
		const agent = createCouncilModeratorAgent('m', 'OVERRIDE');
		expect(agent.config.prompt).toBe('OVERRIDE');
	});
});

describe('COUNCIL_MODERATOR_PROMPT content', () => {
	test('describes Quadratic Voting / confidence-weighted consensus', () => {
		expect(COUNCIL_MODERATOR_PROMPT).toContain('Quadratic Voting');
	});

	test('forbids inventing claims', () => {
		expect(COUNCIL_MODERATOR_PROMPT).toContain('MUST NOT invent');
	});

	test('forbids running new searches', () => {
		expect(COUNCIL_MODERATOR_PROMPT).toContain('MUST NOT add new web research');
	});

	test('mandates honest acknowledgement of disagreement', () => {
		expect(COUNCIL_MODERATOR_PROMPT).toContain('experts disagree');
	});
});

describe('AGENT_TOOL_MAP enforcement (Phase 4)', () => {
	test('council_member has only web_search', () => {
		expect(AGENT_TOOL_MAP.council_member).toEqual(['web_search']);
	});

	test('council_member is not in any other agent', () => {
		const others = Object.keys(AGENT_TOOL_MAP).filter(
			(a) => a !== 'council_member',
		);
		for (const a of others) {
			expect(AGENT_TOOL_MAP[a as keyof typeof AGENT_TOOL_MAP]).not.toContain(
				'web_search',
			);
		}
	});

	test('council_moderator has empty tool list', () => {
		expect(AGENT_TOOL_MAP.council_moderator).toEqual([]);
	});

	test('convene_general_council is in architect', () => {
		expect(AGENT_TOOL_MAP.architect).toContain('convene_general_council');
	});

	test('convene_general_council is NOT in any other agent', () => {
		const others = Object.keys(AGENT_TOOL_MAP).filter((a) => a !== 'architect');
		for (const a of others) {
			expect(AGENT_TOOL_MAP[a as keyof typeof AGENT_TOOL_MAP]).not.toContain(
				'convene_general_council',
			);
		}
	});
});

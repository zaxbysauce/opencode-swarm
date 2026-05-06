/**
 * Tests for skills propagation to subagents.
 *
 * Verifies that:
 * 1. Architect prompt includes a SKILLS PROPAGATION section
 * 2. Architect's DELEGATION FORMAT includes a SKILLS field
 * 3. Subagent prompts (coder, reviewer, test_engineer, sme) include SKILLS
 *    field in their INPUT FORMAT and SKILLS HANDLING instructions
 */

import { describe, expect, it } from 'bun:test';
import { createArchitectAgent } from '../../../src/agents/architect';
import { createCoderAgent } from '../../../src/agents/coder';
import { createDesignerAgent } from '../../../src/agents/designer';
import { createDocsAgent } from '../../../src/agents/docs';
import { createReviewerAgent } from '../../../src/agents/reviewer';
import { createSMEAgent } from '../../../src/agents/sme';
import { createTestEngineerAgent } from '../../../src/agents/test-engineer';
import { AGENT_TOOL_MAP } from '../../../src/config/constants';

describe('Skills Propagation to Subagents', () => {
	describe('Architect Prompt — SKILLS PROPAGATION section', () => {
		const prompt = createArchitectAgent('test-model').config.prompt!;

		it('contains SKILLS PROPAGATION section header', () => {
			expect(prompt).toContain('SKILLS PROPAGATION');
		});

		it('instructs architect to scan .opencode/skills and .claude/skills directories', () => {
			expect(prompt).toContain('.opencode/skills');
			expect(prompt).toContain('.claude/skills');
		});

		it('uses the search tool instead of a nonexistent glob tool for skill discovery', () => {
			const skillsSection = prompt.slice(prompt.indexOf('SKILLS PROPAGATION'));
			expect(skillsSection).toContain('search');
			expect(skillsSection).not.toContain('Use `glob`');
		});

		it('instructs architect to cache skill index in .swarm/context.md', () => {
			const skillsSection = prompt.slice(prompt.indexOf('SKILLS PROPAGATION'));
			expect(skillsSection).toContain('.swarm/context.md');
			expect(skillsSection).toContain('Available Skills');
		});

		it('provides skill-to-agent routing table', () => {
			const skillsSection = prompt.slice(prompt.indexOf('SKILLS PROPAGATION'));
			expect(skillsSection).toContain('test_engineer');
			expect(skillsSection).toContain('reviewer');
			expect(skillsSection).toContain('coder');
		});

		it('explains that file references reduce context bloat', () => {
			const skillsSection = prompt.slice(prompt.indexOf('SKILLS PROPAGATION'));
			expect(skillsSection).toContain('context');
			expect(skillsSection).toContain('bloat');
			expect(skillsSection).toContain('file:');
		});

		it('prefers file references by default and keeps inline fallback for load failures', () => {
			const skillsSection = prompt.slice(prompt.indexOf('SKILLS PROPAGATION'));
			expect(skillsSection).toContain('Default to repo-relative `file:` references');
			expect(skillsSection).toContain('SKILL_LOAD_FAILED');
			expect(skillsSection).toContain('Use inline skill bodies only');
		});

		it('includes anti-rationalization rules against skipping skills', () => {
			const skillsSection = prompt.slice(prompt.indexOf('SKILLS PROPAGATION'));
			expect(skillsSection).toContain('ANTI-RATIONALIZATION');
			expect(skillsSection).toContain(
				'Skills do NOT persist across Task boundaries',
			);
		});

		it('explains that subagents run in isolated contexts without inherited skills', () => {
			const skillsSection = prompt.slice(prompt.indexOf('SKILLS PROPAGATION'));
			expect(skillsSection).toContain('isolated contexts');
			expect(skillsSection).toContain('NOT automatically visible');
		});
	});

	describe('Architect Prompt — DELEGATION FORMAT includes SKILLS field', () => {
		const prompt = createArchitectAgent('test-model').config.prompt!;

		it('delegation format template includes SKILLS field', () => {
			const delegationSection = prompt.slice(
				prompt.indexOf('## DELEGATION FORMAT'),
			);
			expect(delegationSection).toContain('SKILLS:');
		});

		it('delegation format defers to each receiving agent input schema', () => {
			const delegationSection = prompt.slice(
				prompt.indexOf('## DELEGATION FORMAT'),
			);
			expect(delegationSection).toContain(
				"follow the receiving agent's INPUT FORMAT exactly",
			);
			expect(delegationSection).toContain(
				'[agent-specific fields required by that agent',
			);
		});

		it('coder delegation example includes file-based SKILLS reference', () => {
			const coderExample = prompt.slice(
				prompt.indexOf('TASK: Add input validation to login'),
				prompt.indexOf('TASK: Review login validation'),
			);
			expect(coderExample).toContain(
				'SKILLS: file:.claude/skills/engineering-conventions/SKILL.md',
			);
		});

		it('reviewer delegation example includes file-based SKILLS reference', () => {
			const reviewerExample = prompt.slice(
				prompt.indexOf('TASK: Review login validation'),
				prompt.indexOf('TASK: Generate and run login validation tests'),
			);
			expect(reviewerExample).toContain(
				'SKILLS: file:.claude/skills/engineering-conventions/SKILL.md',
			);
		});

		it('test_engineer delegation example includes file-based SKILLS reference', () => {
			const testEngineerExample = prompt.slice(
				prompt.indexOf('TASK: Generate and run login validation tests'),
				prompt.indexOf('TASK: Review plan for user authentication'),
			);
			expect(testEngineerExample).toContain(
				'SKILLS: file:.claude/skills/writing-tests/SKILL.md',
			);
		});

		it('explorer delegation example uses SKILLS: none', () => {
			const explorerExample = prompt.slice(
				prompt.indexOf('TASK: Analyze codebase for auth'),
				prompt.indexOf('TASK: Review auth token patterns'),
			);
			expect(explorerExample).toContain('SKILLS: none');
		});

		it('SME delegation examples may use SKILLS: none when no repo skill applies', () => {
			const smeExample = prompt.slice(
				prompt.indexOf('TASK: Review auth token patterns'),
				prompt.indexOf('PRE-STEP (required):'),
			);
			expect(smeExample).toContain('SKILLS: none');
		});

		it('critic delegation example uses SKILLS: none', () => {
			const criticExample = prompt.slice(
				prompt.indexOf('TASK: Review plan for user authentication'),
				prompt.indexOf('TASK: Security-only review'),
			);
			expect(criticExample).toContain('SKILLS: none');
		});
	});

	describe('Coder Prompt — SKILLS field in INPUT FORMAT', () => {
		const prompt = createCoderAgent('test-model').config.prompt!;

		it('INPUT FORMAT contains SKILLS field', () => {
			const inputSection = prompt.slice(prompt.indexOf('INPUT FORMAT'));
			expect(inputSection).toContain('SKILLS:');
			expect(inputSection).toContain('file: references');
		});

		it('contains SKILLS HANDLING instructions', () => {
			expect(prompt).toContain('SKILLS HANDLING');
		});

		it('SKILLS HANDLING instructs to load file-based skills before writing code', () => {
			const skillsHandling = prompt.slice(prompt.indexOf('SKILLS HANDLING'));
			expect(skillsHandling).toContain('load EVERY referenced skill');
			expect(skillsHandling).toContain('use the search tool');
			expect(skillsHandling).toContain('before writing any code');
		});

		it('SKILLS HANDLING explains that skills OVERRIDE default behavior', () => {
			const skillsHandling = prompt.slice(prompt.indexOf('SKILLS HANDLING'));
			expect(skillsHandling).toContain('OVERRIDE');
		});

		it('SKILLS HANDLING fails loudly when a referenced skill cannot be loaded', () => {
			const skillsHandling = prompt.slice(prompt.indexOf('SKILLS HANDLING'));
			expect(skillsHandling).toContain('SKILL_LOAD_FAILED');
		});
	});

	describe('Reviewer Prompt — SKILLS field in INPUT FORMAT', () => {
		const prompt = createReviewerAgent('test-model').config.prompt!;

		it('INPUT FORMAT contains SKILLS field', () => {
			const inputSection = prompt.slice(prompt.indexOf('## INPUT FORMAT'));
			expect(inputSection).toContain('SKILLS:');
			expect(inputSection).toContain('file: references');
		});

		it('contains SKILLS HANDLING instructions', () => {
			expect(prompt).toContain('SKILLS HANDLING');
		});

		it('SKILLS HANDLING instructs to load file-based skills before review', () => {
			const skillsHandling = prompt.slice(prompt.indexOf('SKILLS HANDLING'));
			expect(skillsHandling).toContain('load EVERY referenced skill');
			expect(skillsHandling).toContain('use the search tool');
			expect(skillsHandling).toContain('before beginning');
		});

		it('SKILLS HANDLING states violations should be flagged', () => {
			const skillsHandling = prompt.slice(prompt.indexOf('SKILLS HANDLING'));
			expect(skillsHandling).toContain('Flag any violation');
		});

		it('SKILLS HANDLING fails loudly when a referenced skill cannot be loaded', () => {
			const skillsHandling = prompt.slice(prompt.indexOf('SKILLS HANDLING'));
			expect(skillsHandling).toContain('SKILL_LOAD_FAILED');
		});

		it('PROCESSING line is preserved after SKILLS HANDLING', () => {
			// PROCESSING was there before; must remain
			expect(prompt).toContain('PROCESSING: If GATES is provided');
		});

		it('OUTPUT FORMAT section is preserved', () => {
			expect(prompt).toContain('## OUTPUT FORMAT');
			expect(prompt).toContain('VERDICT: APPROVED | REJECTED');
		});
	});

	describe('Test Engineer Prompt — SKILLS field in INPUT FORMAT', () => {
		const prompt = createTestEngineerAgent('test-model').config.prompt!;

		it('INPUT FORMAT contains SKILLS field', () => {
			const inputSection = prompt.slice(prompt.indexOf('INPUT FORMAT'));
			expect(inputSection).toContain('SKILLS:');
			expect(inputSection).toContain('file: references');
		});

		it('contains SKILLS HANDLING instructions', () => {
			expect(prompt).toContain('SKILLS HANDLING');
		});

		it('SKILLS HANDLING instructs to load file-based skills before writing tests', () => {
			const skillsHandling = prompt.slice(prompt.indexOf('SKILLS HANDLING'));
			expect(skillsHandling).toContain('load EVERY referenced skill');
			expect(skillsHandling).toContain('use the search tool');
			expect(skillsHandling).toContain('before writing any test code');
		});

		it('SKILLS HANDLING explains skills override default framework choices', () => {
			const skillsHandling = prompt.slice(prompt.indexOf('SKILLS HANDLING'));
			expect(skillsHandling).toContain(
				'override your default framework choices',
			);
		});

		it('SKILLS HANDLING fails loudly when a referenced skill cannot be loaded', () => {
			const skillsHandling = prompt.slice(prompt.indexOf('SKILLS HANDLING'));
			expect(skillsHandling).toContain('SKILL_LOAD_FAILED');
		});
	});

	describe('SME Prompt — SKILLS field in INPUT FORMAT', () => {
		const prompt = createSMEAgent('test-model').config.prompt!;

		it('INPUT FORMAT contains SKILLS field', () => {
			const inputSection = prompt.slice(prompt.indexOf('## INPUT FORMAT'));
			expect(inputSection).toContain('SKILLS:');
			expect(inputSection).toContain('file: references');
		});

		it('contains SKILLS HANDLING instructions', () => {
			expect(prompt).toContain('SKILLS HANDLING');
		});

		it('SKILLS HANDLING instructs to load file-based skills before recommendation', () => {
			const skillsHandling = prompt.slice(prompt.indexOf('SKILLS HANDLING'));
			expect(skillsHandling).toContain('load EVERY referenced skill');
			expect(skillsHandling).toContain('use the search tool');
			expect(skillsHandling).toContain('before formulating');
		});

		it('SKILLS HANDLING fails loudly when a referenced skill cannot be loaded', () => {
			const skillsHandling = prompt.slice(prompt.indexOf('SKILLS HANDLING'));
			expect(skillsHandling).toContain('SKILL_LOAD_FAILED');
		});
	});

	describe('Docs Prompt — SKILLS field in INPUT FORMAT', () => {
		const prompt = createDocsAgent('test-model').config.prompt!;

		it('INPUT FORMAT contains SKILLS field', () => {
			const inputSection = prompt.slice(prompt.indexOf('INPUT FORMAT'));
			expect(inputSection).toContain('SKILLS:');
			expect(inputSection).toContain('file: references');
		});

		it('contains SKILLS HANDLING instructions', () => {
			expect(prompt).toContain('SKILLS HANDLING');
			expect(prompt).toContain('use the search tool');
			expect(prompt).toContain('SKILL_LOAD_FAILED');
		});
	});

	describe('Designer Prompt — SKILLS field in INPUT FORMAT', () => {
		const prompt = createDesignerAgent('test-model').config.prompt!;

		it('INPUT FORMAT contains SKILLS field', () => {
			const inputSection = prompt.slice(prompt.indexOf('INPUT FORMAT'));
			expect(inputSection).toContain('SKILLS:');
			expect(inputSection).toContain('file: references');
		});

		it('contains SKILLS HANDLING instructions', () => {
			expect(prompt).toContain('SKILLS HANDLING');
			expect(prompt).toContain('use the search tool');
			expect(prompt).toContain('SKILL_LOAD_FAILED');
		});
	});

	describe('Skill-loading agents have a tool capable of reading file-based skills', () => {
		it('architect and every skill-loading agent include search', () => {
			expect(AGENT_TOOL_MAP.architect).toContain('search');
			expect(AGENT_TOOL_MAP.coder).toContain('search');
			expect(AGENT_TOOL_MAP.reviewer).toContain('search');
			expect(AGENT_TOOL_MAP.test_engineer).toContain('search');
			expect(AGENT_TOOL_MAP.sme).toContain('search');
			expect(AGENT_TOOL_MAP.docs).toContain('search');
			expect(AGENT_TOOL_MAP.designer).toContain('search');
		});
	});
});

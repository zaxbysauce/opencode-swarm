/**
 * Verification tests for src/skills/index.ts
 * Task 6.2 - SKILL_VERSION
 */

import { describe, expect, it } from 'bun:test';
import {
	AgentOverlay,
	getAgentOverlay,
	getSkill,
	resolveAgentPrompt,
	type SkillDefinition,
	skills,
} from '../../../src/skills/index';

describe('src/skills/index.ts - Task 6.2 SKILL_VERSION', () => {
	describe('1. SkillDefinition has SKILL_VERSION', () => {
		it('SkillDefinition interface includes SKILL_VERSION property', () => {
			const skill: SkillDefinition = {
				id: 'test',
				name: 'Test Skill',
				description: 'A test skill',
				SKILL_VERSION: 1,
			};
			expect(skill).toHaveProperty('SKILL_VERSION');
			expect(skill.SKILL_VERSION).toBe(1);
		});

		it('Built-in default skill has SKILL_VERSION', () => {
			const defaultSkill = skills.find((s) => s.id === 'default');
			expect(defaultSkill).toBeDefined();
			expect(defaultSkill).toHaveProperty('SKILL_VERSION');
			expect(typeof defaultSkill!.SKILL_VERSION).toBe('number');
		});

		it('SKILL_VERSION is required number in SkillDefinition', () => {
			const skill: SkillDefinition = {
				id: 'versioned',
				name: 'Versioned',
				description: 'Has version',
				SKILL_VERSION: 42,
			};
			expect(skill.SKILL_VERSION).toBe(42);
		});
	});

	describe('2. getSkill returns skill by ID', () => {
		it('returns skill when ID exists', () => {
			const skill = getSkill('default');
			expect(skill).toBeDefined();
			expect(skill?.id).toBe('default');
			expect(skill?.name).toBe('Default');
		});

		it('returns undefined for non-existent ID', () => {
			const skill = getSkill('non-existent');
			expect(skill).toBeUndefined();
		});

		it('returns undefined for empty ID', () => {
			const skill = getSkill('');
			expect(skill).toBeUndefined();
		});

		it('finds skill by exact ID match', () => {
			const skill = getSkill('default');
			expect(skill?.id).toBe('default');
		});
	});

	describe('3. getAgentOverlay returns overlay for agent', () => {
		it('returns overlay when skill has agents with matching agent', () => {
			const testSkill: SkillDefinition = {
				id: 'test-skill',
				name: 'Test',
				description: 'Test skill',
				SKILL_VERSION: 1,
				agents: [
					{
						agent: 'coder',
						prompt: 'Custom coder prompt',
						model: 'gpt-4',
					},
				],
			};

			// Temporarily add test skill
			skills.push(testSkill);
			try {
				const overlay = getAgentOverlay('test-skill', 'coder');
				expect(overlay).toBeDefined();
				expect(overlay?.agent).toBe('coder');
				expect(overlay?.prompt).toBe('Custom coder prompt');
				expect(overlay?.model).toBe('gpt-4');
			} finally {
				// Cleanup
				const idx = skills.findIndex((s) => s.id === 'test-skill');
				if (idx !== -1) skills.splice(idx, 1);
			}
		});

		it('returns undefined when agent not found', () => {
			const testSkill: SkillDefinition = {
				id: 'test-skill-2',
				name: 'Test 2',
				description: 'Test skill 2',
				SKILL_VERSION: 1,
				agents: [{ agent: 'coder', prompt: 'Coder prompt' }],
			};

			skills.push(testSkill);
			try {
				const overlay = getAgentOverlay('test-skill-2', 'reviewer');
				expect(overlay).toBeUndefined();
			} finally {
				const idx = skills.findIndex((s) => s.id === 'test-skill-2');
				if (idx !== -1) skills.splice(idx, 1);
			}
		});

		it('returns undefined when skill has no agents', () => {
			const overlay = getAgentOverlay('default', 'coder');
			expect(overlay).toBeUndefined();
		});

		it('returns undefined for non-existent skill', () => {
			const overlay = getAgentOverlay('non-existent', 'coder');
			expect(overlay).toBeUndefined();
		});
	});

	describe('4. resolveAgentPrompt uses overlay or default', () => {
		it('returns overlay prompt when available', () => {
			const testSkill: SkillDefinition = {
				id: 'test-skill-3',
				name: 'Test 3',
				description: 'Test skill 3',
				SKILL_VERSION: 1,
				agents: [{ agent: 'coder', prompt: 'Overlay prompt' }],
			};

			skills.push(testSkill);
			try {
				const prompt = resolveAgentPrompt(
					'test-skill-3',
					'coder',
					'Default prompt',
				);
				expect(prompt).toBe('Overlay prompt');
			} finally {
				const idx = skills.findIndex((s) => s.id === 'test-skill-3');
				if (idx !== -1) skills.splice(idx, 1);
			}
		});

		it('returns default prompt when no overlay exists', () => {
			const defaultPrompt = 'Default prompt text';
			const prompt = resolveAgentPrompt(
				'default',
				'non-existent-agent',
				defaultPrompt,
			);
			expect(prompt).toBe(defaultPrompt);
		});

		it('returns default prompt for non-existent skill', () => {
			const prompt = resolveAgentPrompt(
				'non-existent',
				'coder',
				'Fallback prompt',
			);
			expect(prompt).toBe('Fallback prompt');
		});

		it('returns default prompt when agent has no prompt in overlay', () => {
			const testSkill: SkillDefinition = {
				id: 'test-skill-4',
				name: 'Test 4',
				description: 'Test skill 4',
				SKILL_VERSION: 1,
				agents: [{ agent: 'coder', model: 'gpt-4' }], // No prompt
			};

			skills.push(testSkill);
			try {
				const prompt = resolveAgentPrompt(
					'test-skill-4',
					'coder',
					'Default prompt',
				);
				expect(prompt).toBe('Default prompt');
			} finally {
				const idx = skills.findIndex((s) => s.id === 'test-skill-4');
				if (idx !== -1) skills.splice(idx, 1);
			}
		});
	});
});

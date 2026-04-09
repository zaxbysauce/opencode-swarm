import { describe, expect, test } from 'bun:test';
import { createExplorerAgent } from '../../../src/agents/explorer';

describe('EXPLORER_PROMPT usefulness for architect planning', () => {
	describe('STRUCTURE section coverage', () => {
		test('includes entry points and their call chains', () => {
			const agent = createExplorerAgent('gpt-4');
			const prompt = agent.config.prompt;

			expect(prompt).toContain('Entry points and their call chains');
		});

		test('includes public API surface', () => {
			const agent = createExplorerAgent('gpt-4');
			const prompt = agent.config.prompt;

			expect(prompt).toContain('Public API surface');
		});

		test('includes internal dependencies', () => {
			const agent = createExplorerAgent('gpt-4');
			const prompt = agent.config.prompt;

			expect(prompt).toContain('Internal dependencies');
		});

		test('includes external dependencies', () => {
			const agent = createExplorerAgent('gpt-4');
			const prompt = agent.config.prompt;

			expect(prompt).toContain('External dependencies');
		});
	});

	describe('KEY FILES section coverage', () => {
		test('has KEY FILES section with "- [path]: [purpose]" format', () => {
			const agent = createExplorerAgent('gpt-4');
			const prompt = agent.config.prompt;

			// Verify KEY FILES section exists
			expect(prompt).toContain('KEY FILES:');
			// Verify the format example: "- [path]: [purpose]"
			expect(prompt).toContain('- [path]: [purpose]');
		});
	});

	describe('INTEGRATION IMPACT MODE coverage', () => {
		test('has INTEGRATION IMPACT ANALYSIS MODE section', () => {
			const agent = createExplorerAgent('gpt-4');
			const prompt = agent.config.prompt;

			expect(prompt).toContain('INTEGRATION IMPACT ANALYSIS MODE');
		});

		test('includes steps to find imports and usages of changed symbols', () => {
			const agent = createExplorerAgent('gpt-4');
			const prompt = agent.config.prompt;

			// Should have steps that mention finding imports/usages
			expect(prompt).toContain('use search to find imports and usages');
			expect(prompt).toContain('For each changed export');
		});
	});

	describe('PATTERNS section coverage', () => {
		test('includes state management approach', () => {
			const agent = createExplorerAgent('gpt-4');
			const prompt = agent.config.prompt;

			expect(prompt).toContain('State management approach');
		});

		test('includes configuration pattern', () => {
			const agent = createExplorerAgent('gpt-4');
			const prompt = agent.config.prompt;

			expect(prompt).toContain('Configuration pattern');
		});
	});

	describe('COMPLEXITY INDICATORS section coverage', () => {
		test('covers structural complexity concerns', () => {
			const agent = createExplorerAgent('gpt-4');
			const prompt = agent.config.prompt;

			expect(prompt).toContain('COMPLEXITY INDICATORS');
			expect(prompt).toContain('cyclomatic complexity');
			expect(prompt).toContain('deep nesting');
			expect(prompt).toContain('complex control flow');
		});

		test('mentions large files as complexity indicator', () => {
			const agent = createExplorerAgent('gpt-4');
			const prompt = agent.config.prompt;

			expect(prompt).toContain('Large files');
		});

		test('mentions deep inheritance hierarchies as complexity indicator', () => {
			const agent = createExplorerAgent('gpt-4');
			const prompt = agent.config.prompt;

			expect(prompt).toContain('Deep inheritance hierarchies');
		});
	});

	describe('observable facts requirement', () => {
		test('COMPLEXITY INDICATORS section instructs to describe OBSERVED facts', () => {
			const agent = createExplorerAgent('gpt-4');
			const prompt = agent.config.prompt;

			// Should instruct to describe what is OBSERVED, not judgments
			expect(prompt).toContain('describe what is OBSERVED');
		});

		test('COMPLEXITY INDICATORS output format requires factual description', () => {
			const agent = createExplorerAgent('gpt-4');
			const prompt = agent.config.prompt;

			// The output format should frame complexity as "concerns" not judgments
			expect(prompt).toContain('describe what is OBSERVED');
		});
	});

	describe('DOMAINS section coverage', () => {
		test('has DOMAINS section for SME domain hints', () => {
			const agent = createExplorerAgent('gpt-4');
			const prompt = agent.config.prompt;

			expect(prompt).toContain('DOMAINS:');
			expect(prompt).toContain('relevant SME domains');
		});
	});

	describe('FOLLOW-UP CANDIDATE AREAS coverage', () => {
		test('has FOLLOW-UP CANDIDATE AREAS section', () => {
			const agent = createExplorerAgent('gpt-4');
			const prompt = agent.config.prompt;

			expect(prompt).toContain('FOLLOW-UP CANDIDATE AREAS:');
		});

		test('follow-up format includes path and observable condition', () => {
			const agent = createExplorerAgent('gpt-4');
			const prompt = agent.config.prompt;

			expect(prompt).toContain('- [path]: [observable condition');
		});
	});

	describe('agent factory behavior', () => {
		test('createExplorerAgent returns valid AgentDefinition', () => {
			const agent = createExplorerAgent('gpt-4');

			expect(agent).toHaveProperty('name', 'explorer');
			expect(agent).toHaveProperty('description');
			expect(agent).toHaveProperty('config');
			expect(agent.config).toHaveProperty('model', 'gpt-4');
			expect(agent.config).toHaveProperty('prompt');
		});

		test('createExplorerAgent with customAppendPrompt appends to base prompt', () => {
			const agent = createExplorerAgent('gpt-4', undefined, 'EXTRA CONTENT');
			const prompt = agent.config.prompt;

			expect(prompt).toContain('EXTRA CONTENT');
			// Should still contain base content
			expect(prompt).toContain('INTEGRATION IMPACT ANALYSIS MODE');
		});

		test('createExplorerAgent with customPrompt replaces base prompt', () => {
			const agent = createExplorerAgent('gpt-4', 'CUSTOM PROMPT');

			expect(agent.config.prompt).toBe('CUSTOM PROMPT');
		});

		test('explorer is read-only (no write/edit/patch tools)', () => {
			const agent = createExplorerAgent('gpt-4');

			expect(agent.config.tools).toEqual({
				write: false,
				edit: false,
				patch: false,
			});
		});
	});

	describe('output format requirements', () => {
		test('mandatory output format section exists', () => {
			const agent = createExplorerAgent('gpt-4');
			const prompt = agent.config.prompt;

			expect(prompt).toContain('OUTPUT FORMAT (MANDATORY');
		});

		test('STUCTURE output section exists', () => {
			const agent = createExplorerAgent('gpt-4');
			const prompt = agent.config.prompt;

			expect(prompt).toContain('STRUCTURE:');
		});

		test('PATTERNS output section exists', () => {
			const agent = createExplorerAgent('gpt-4');
			const prompt = agent.config.prompt;

			expect(prompt).toContain('PATTERNS:');
		});
	});

	describe('integration impact output format', () => {
		test('INTEGRATION IMPACT MODE has mandatory output format', () => {
			const agent = createExplorerAgent('gpt-4');
			const prompt = agent.config.prompt;

			expect(prompt).toContain(
				'OUTPUT FORMAT (MANDATORY — deviations will be rejected):',
			);
			expect(prompt).toContain('Begin directly with BREAKING_CHANGES');
		});

		test('INTEGRATION IMPACT MODE lists required output fields', () => {
			const agent = createExplorerAgent('gpt-4');
			const prompt = agent.config.prompt;

			expect(prompt).toContain('BREAKING_CHANGES:');
			expect(prompt).toContain('COMPATIBLE_CHANGES:');
			expect(prompt).toContain('CONSUMERS_AFFECTED:');
			expect(prompt).toContain('COMPATIBILITY SIGNALS:');
			expect(prompt).toContain('MIGRATION_SURFACE:');
		});
	});
});

import { describe, expect, it } from 'bun:test';
import { createExplorerAgent } from '../../../src/agents/explorer';

describe('explorer.ts', () => {
	describe('EXPLORER_PROMPT content', () => {
		it('contains "DOCUMENTATION DISCOVERY MODE" section header', () => {
			// Create agent and check that the prompt contains the section
			const agent = createExplorerAgent('gpt-4');
			expect(agent.config.prompt).toContain('DOCUMENTATION DISCOVERY MODE');
		});

		it('contains "Score by keyword overlap:" text', () => {
			const agent = createExplorerAgent('gpt-4');
			expect(agent.config.prompt).toContain('Score by keyword overlap:');
		});

		it('contains "doc-manifest.json" reference', () => {
			const agent = createExplorerAgent('gpt-4');
			expect(agent.config.prompt).toContain('doc-manifest.json');
		});

		it('contains full DOCUMENTATION DISCOVERY MODE section with all steps', () => {
			const agent = createExplorerAgent('gpt-4');
			const prompt = agent.config.prompt;

			// Verify key elements of the section
			expect(prompt).toContain('## DOCUMENTATION DISCOVERY MODE');
			expect(prompt).toContain(
				'Activates automatically during codebase reality check',
			);
			expect(prompt).toContain('glob for documentation files');
			expect(prompt).toContain('.swarm/doc-manifest.json');
			expect(prompt).toContain('Score by keyword overlap:');
			expect(prompt).toContain('.swarm/knowledge/doc-constraints.jsonl');
			expect(prompt).toContain('Invalidation: Only re-scan if any doc file');
		});
	});

	describe('createExplorerAgent', () => {
		it('returns proper agent definition with correct name', () => {
			const agent = createExplorerAgent('gpt-4');
			expect(agent.name).toBe('explorer');
		});

		it('returns proper agent definition with description', () => {
			const agent = createExplorerAgent('gpt-4');
			expect(agent.description).toContain('codebase discovery and analysis');
		});

		it('uses the specified model', () => {
			const agent = createExplorerAgent('gpt-4o');
			expect(agent.config.model).toBe('gpt-4o');
		});

		it('has read-only tools configuration (no write/edit/patch)', () => {
			const agent = createExplorerAgent('gpt-4');
			expect(agent.config.tools?.write).toBe(false);
			expect(agent.config.tools?.edit).toBe(false);
			expect(agent.config.tools?.patch).toBe(false);
		});

		it('accepts customPrompt and uses it instead of default', () => {
			const customPrompt = 'Custom exploration prompt';
			const agent = createExplorerAgent('gpt-4', customPrompt);
			expect(agent.config.prompt).toBe(customPrompt);
		});

		it('accepts customAppendPrompt and appends it to default prompt', () => {
			const customAppend = 'Additional guidance for this task';
			const agent = createExplorerAgent('gpt-4', undefined, customAppend);
			expect(agent.config.prompt).toContain('## DOCUMENTATION DISCOVERY MODE');
			expect(agent.config.prompt).toContain(customAppend);
		});
	});
});

import { describe, expect, it } from 'bun:test';
import {
	createExplorerAgent,
	createExplorerCuratorAgent,
} from '../../../src/agents/explorer';

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
			expect(prompt).toContain('Glob for documentation files');
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

	describe('createExplorerCuratorAgent', () => {
		it('returns proper agent definition for CURATOR_INIT mode', () => {
			const agent = createExplorerCuratorAgent('gpt-4', 'CURATOR_INIT');
			expect(agent.name).toBe('explorer');
			expect(agent.description).toContain('CURATOR_INIT');
		});

		it('returns proper agent definition for CURATOR_PHASE mode', () => {
			const agent = createExplorerCuratorAgent('gpt-4', 'CURATOR_PHASE');
			expect(agent.name).toBe('explorer');
			expect(agent.description).toContain('CURATOR_PHASE');
		});

		it('uses the specified model', () => {
			const agent = createExplorerCuratorAgent('gpt-4o', 'CURATOR_INIT');
			expect(agent.config.model).toBe('gpt-4o');
		});

		it('has read-only tools configuration', () => {
			const agent = createExplorerCuratorAgent('gpt-4', 'CURATOR_INIT');
			expect(agent.config.tools?.write).toBe(false);
			expect(agent.config.tools?.edit).toBe(false);
			expect(agent.config.tools?.patch).toBe(false);
		});

		it('CURATOR_INIT prompt contains CURATOR_INIT identity', () => {
			const agent = createExplorerCuratorAgent('gpt-4', 'CURATOR_INIT');
			expect(agent.config.prompt).toContain('CURATOR_INIT');
		});

		it('CURATOR_PHASE prompt contains CURATOR_PHASE identity', () => {
			const agent = createExplorerCuratorAgent('gpt-4', 'CURATOR_PHASE');
			expect(agent.config.prompt).toContain('CURATOR_PHASE');
		});

		it('accepts customAppendPrompt and appends it', () => {
			const customAppend = 'Additional curator guidance';
			const agent = createExplorerCuratorAgent(
				'gpt-4',
				'CURATOR_INIT',
				customAppend,
			);
			expect(agent.config.prompt).toContain(customAppend);
		});
	});

	describe('CURATOR_INIT_PROMPT and CURATOR_PHASE_PROMPT definitions', () => {
		it('CURATOR_INIT mode produces a prompt with IDENTITY section', () => {
			const agent = createExplorerCuratorAgent('gpt-4', 'CURATOR_INIT');
			expect(agent.config.prompt).toContain('## IDENTITY');
			expect(agent.config.prompt).toContain('CURATOR_INIT mode');
		});

		it('CURATOR_PHASE mode produces a prompt with IDENTITY section', () => {
			const agent = createExplorerCuratorAgent('gpt-4', 'CURATOR_PHASE');
			expect(agent.config.prompt).toContain('## IDENTITY');
			expect(agent.config.prompt).toContain('CURATOR_PHASE mode');
		});

		it('CURATOR_INIT prompt contains INPUT FORMAT for PRIOR_SUMMARY and KNOWLEDGE_ENTRIES', () => {
			const agent = createExplorerCuratorAgent('gpt-4', 'CURATOR_INIT');
			expect(agent.config.prompt).toContain('PRIOR_SUMMARY');
			expect(agent.config.prompt).toContain('KNOWLEDGE_ENTRIES');
		});

		it('CURATOR_PHASE prompt contains INPUT FORMAT for PHASE_EVENTS and PHASE_EVIDENCE', () => {
			const agent = createExplorerCuratorAgent('gpt-4', 'CURATOR_PHASE');
			expect(agent.config.prompt).toContain('PHASE_EVENTS');
			expect(agent.config.prompt).toContain('PHASE_EVIDENCE');
		});

		it('CURATOR prompts contain OUTPUT FORMAT sections', () => {
			const initAgent = createExplorerCuratorAgent('gpt-4', 'CURATOR_INIT');
			const phaseAgent = createExplorerCuratorAgent('gpt-4', 'CURATOR_PHASE');

			expect(initAgent.config.prompt).toContain('OUTPUT FORMAT');
			expect(phaseAgent.config.prompt).toContain('OUTPUT FORMAT');
		});
	});
});

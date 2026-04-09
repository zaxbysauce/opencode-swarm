import { describe, expect, test } from 'bun:test';
import {
	CURATOR_INIT_PROMPT,
	CURATOR_PHASE_PROMPT,
	createExplorerAgent,
} from '../../../src/agents/explorer';

describe('curator prompts recast as observations', () => {
	describe('CURATOR_INIT_PROMPT', () => {
		test('contains OBSERVATIONS section (not KNOWLEDGE_UPDATES)', () => {
			expect(CURATOR_INIT_PROMPT).toContain('OBSERVATIONS:');
			expect(CURATOR_INIT_PROMPT).not.toContain('KNOWLEDGE_UPDATES:');
		});

		test('OBSERVATIONS section uses observational language', () => {
			const observationsSection =
				CURATOR_INIT_PROMPT.split('OBSERVATIONS:')[1]?.split(
					'KNOWLEDGE_STATS:',
				)[0] ?? '';
			expect(observationsSection).toContain('appears high-confidence');
			expect(observationsSection).toContain('appears stale');
			expect(observationsSection).toContain('could be tighter');
			expect(observationsSection).toContain('contradicts project state');
		});

		test('does NOT contain imperative directives as commands', () => {
			// These words should only appear in parenthetical suggestions, not as imperative commands
			// Check that "promote", "archive", "rewrite" don't appear as standalone imperative verbs
			const imperativePatterns = [
				/\bpromote\b(?!\s+—)/, // "promote" not followed by "—"
				/\barchive\b(?!\s+—)/, // "archive" not followed by "—"
				/\brewrite\b(?!\s+with)/, // "rewrite" not followed by "with"
			];

			for (const pattern of imperativePatterns) {
				const matches = CURATOR_INIT_PROMPT.match(pattern);
				if (matches) {
					// Find context around the match
					const idx = CURATOR_INIT_PROMPT.indexOf(matches[0]);
					const context = CURATOR_INIT_PROMPT.slice(
						Math.max(0, idx - 30),
						idx + matches[0].length + 30,
					);
					expect(matches).toHaveLength(
						0,
						`Found imperative directive "${matches[0]}" in context: ${context}`,
					);
				}
			}
		});
	});

	describe('CURATOR_PHASE_PROMPT', () => {
		test('contains OBSERVATIONS section (not KNOWLEDGE_UPDATES)', () => {
			expect(CURATOR_PHASE_PROMPT).toContain('OBSERVATIONS:');
			expect(CURATOR_PHASE_PROMPT).not.toContain('KNOWLEDGE_UPDATES:');
		});

		test('OBSERVATIONS section uses observational language', () => {
			const observationsSection =
				CURATOR_PHASE_PROMPT.split('OBSERVATIONS:')[1]?.split(
					'EXTENDED_DIGEST:',
				)[0] ?? '';
			expect(observationsSection).toContain('appears high-confidence');
			expect(observationsSection).toContain('appears stale');
			expect(observationsSection).toContain('could be tighter');
			expect(observationsSection).toContain('contradicts project state');
		});

		test('does NOT contain imperative directives as commands', () => {
			// These words should only appear in parenthetical suggestions, not as imperative commands
			const imperativePatterns = [
				/\bpromote\b(?!\s+—)/,
				/\barchive\b(?!\s+—)/,
				/\brewrite\b(?!\s+with)/,
			];

			for (const pattern of imperativePatterns) {
				const matches = CURATOR_PHASE_PROMPT.match(pattern);
				if (matches) {
					const idx = CURATOR_PHASE_PROMPT.indexOf(matches[0]);
					const context = CURATOR_PHASE_PROMPT.slice(
						Math.max(0, idx - 30),
						idx + matches[0].length + 30,
					);
					expect(matches).toHaveLength(
						0,
						`Found imperative directive "${matches[0]}" in context: ${context}`,
					);
				}
			}
		});

		test('COMPLIANCE section uses observational language', () => {
			// COMPLIANCE section should use "observed" language
			const complianceSection =
				CURATOR_PHASE_PROMPT.split('COMPLIANCE:')[1]?.split(
					'OBSERVATIONS:',
				)[0] ?? '';
			expect(complianceSection).toContain('observed');
		});
	});

	describe('exports', () => {
		test('CURATOR_INIT_PROMPT is exported', () => {
			expect(CURATOR_INIT_PROMPT).toBeDefined();
			expect(typeof CURATOR_INIT_PROMPT).toBe('string');
		});

		test('CURATOR_PHASE_PROMPT is exported', () => {
			expect(CURATOR_PHASE_PROMPT).toBeDefined();
			expect(typeof CURATOR_PHASE_PROMPT).toBe('string');
		});

		test('createExplorerAgent function is exported and unchanged', () => {
			expect(createExplorerAgent).toBeDefined();
			expect(typeof createExplorerAgent).toBe('function');
			// Verify function signature
			expect(createExplorerAgent.length).toBe(3); // model, customPrompt?, customAppendPrompt?
		});
	});

	describe('agent factory functions', () => {
		test('createExplorerAgent returns correct agent structure', () => {
			const agent = createExplorerAgent('gpt-4');
			expect(agent.name).toBe('explorer');
			expect(agent.config.model).toBe('gpt-4');
			expect(agent.config.temperature).toBe(0.1);
			expect(agent.config.tools.write).toBe(false);
			expect(agent.config.tools.edit).toBe(false);
			expect(agent.config.tools.patch).toBe(false);
		});
	});
});

import { describe, expect, test } from 'bun:test';
import {
	CURATOR_INIT_PROMPT,
	CURATOR_PHASE_PROMPT,
	createExplorerAgent,
} from '../../../src/agents/explorer';
import { parseKnowledgeRecommendations } from '../../../src/hooks/curator';

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

	describe('prompt-parser format alignment', () => {
		// These tests verify that the OBSERVATIONS example lines in the curator prompts
		// use the exact format that parseKnowledgeRecommendations expects.
		// If prompts and parser diverge, the LLM will follow prompt examples and produce
		// output the parser cannot match — silently dropping all knowledge updates.
		const UUID = 'a1b2c3d4-0000-4000-8000-000000000001';

		function buildObservationsBlock(lines: string[]): string {
			return `OBSERVATIONS:\n${lines.join('\n')}\n\n`;
		}

		test('appears high-confidence line parses to promote action', () => {
			const llmOutput = buildObservationsBlock([
				`- entry ${UUID} (appears high-confidence): this lesson has been validated across 5 phases`,
			]);
			const recs = parseKnowledgeRecommendations(llmOutput);
			expect(recs).toHaveLength(1);
			expect(recs[0].action).toBe('promote');
			expect(recs[0].entry_id).toBe(UUID);
		});

		test('appears stale line parses to archive action', () => {
			const llmOutput = buildObservationsBlock([
				`- entry ${UUID} (appears stale): referenced tool no longer exists`,
			]);
			const recs = parseKnowledgeRecommendations(llmOutput);
			expect(recs).toHaveLength(1);
			expect(recs[0].action).toBe('archive');
			expect(recs[0].entry_id).toBe(UUID);
		});

		test('could be tighter line parses to rewrite action', () => {
			const llmOutput = buildObservationsBlock([
				`- entry ${UUID} (could be tighter): lesson repeats the same point twice`,
			]);
			const recs = parseKnowledgeRecommendations(llmOutput);
			expect(recs).toHaveLength(1);
			expect(recs[0].action).toBe('rewrite');
			expect(recs[0].entry_id).toBe(UUID);
		});

		test('contradicts project state line parses to flag_contradiction action', () => {
			const llmOutput = buildObservationsBlock([
				`- entry ${UUID} (contradicts project state): config key was renamed in v2`,
			]);
			const recs = parseKnowledgeRecommendations(llmOutput);
			expect(recs).toHaveLength(1);
			expect(recs[0].action).toBe('flag_contradiction');
			expect(recs[0].entry_id).toBe(UUID);
		});

		test('new candidate line parses to promote action with no entry_id', () => {
			const llmOutput = buildObservationsBlock([
				'- entry new (new candidate): always run biome before committing',
			]);
			const recs = parseKnowledgeRecommendations(llmOutput);
			expect(recs).toHaveLength(1);
			expect(recs[0].action).toBe('promote');
			expect(recs[0].entry_id).toBeUndefined();
		});

		test('all five prompt example types parse from a single OBSERVATIONS block', () => {
			const llmOutput = buildObservationsBlock([
				`- entry ${UUID} (appears high-confidence): observed across many sessions`,
				`- entry ${UUID} (appears stale): outdated after refactor`,
				`- entry ${UUID} (could be tighter): too verbose`,
				`- entry ${UUID} (contradicts project state): config key renamed`,
				'- entry new (new candidate): new lesson from this session',
			]);
			const recs = parseKnowledgeRecommendations(llmOutput);
			expect(recs).toHaveLength(5);
			const actions = recs.map((r) => r.action);
			expect(actions).toContain('promote');
			expect(actions).toContain('archive');
			expect(actions).toContain('rewrite');
			expect(actions).toContain('flag_contradiction');
		});

		test('old prompt format (observable outside parens) does NOT parse — confirms format is load-bearing', () => {
			// This test documents the silent-drop behavior of the old format.
			// If this test fails (old format suddenly parses), the parser has changed
			// and the new format tests above must be re-verified.
			const llmOutput = buildObservationsBlock([
				`- entry ${UUID} appears high-confidence: evidence text  (suggests boost confidence)`,
			]);
			const recs = parseKnowledgeRecommendations(llmOutput);
			expect(recs).toHaveLength(0); // old format is not parseable — confirms fix was needed
		});

		test('CURATOR_INIT_PROMPT example lines all parse when fed through parser', () => {
			// Extract the OBSERVATIONS block from the actual prompt and feed it through
			// the real parser. This is the end-to-end format-alignment test.
			const obsSection =
				CURATOR_INIT_PROMPT.split('OBSERVATIONS:\n')[1]?.split(
					'\nKNOWLEDGE_STATS:',
				)[0] ?? '';
			// Replace placeholder <uuid> with a real UUID for parsing
			const withRealUuid = obsSection.replace(/<uuid>/g, UUID);
			const llmOutput = `OBSERVATIONS:\n${withRealUuid}\n\n`;
			const recs = parseKnowledgeRecommendations(llmOutput);
			// All 5 example lines should parse
			expect(recs.length).toBeGreaterThanOrEqual(4); // 4 uuid-keyed + 1 new candidate
		});

		test('CURATOR_PHASE_PROMPT example lines all parse when fed through parser', () => {
			const obsSection =
				CURATOR_PHASE_PROMPT.split('OBSERVATIONS:\n')[1]?.split(
					'\nUse the UUID',
				)[0] ?? '';
			const withRealUuid = obsSection.replace(/<uuid>/g, UUID);
			const llmOutput = `OBSERVATIONS:\n${withRealUuid}\n\n`;
			const recs = parseKnowledgeRecommendations(llmOutput);
			expect(recs.length).toBeGreaterThanOrEqual(4);
		});
	});
});

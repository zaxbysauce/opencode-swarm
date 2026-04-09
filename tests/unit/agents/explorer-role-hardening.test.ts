import { describe, expect, test } from 'bun:test';
import {
	CURATOR_INIT_PROMPT,
	CURATOR_PHASE_PROMPT,
	createExplorerAgent,
} from '../../../src/agents/explorer';

describe('explorer.ts judgment language removal', () => {
	describe('EXPLORER_PROMPT content verification', () => {
		test('contains "FOLLOW-UP CANDIDATE AREAS" instead of "REVIEW NEEDED"', () => {
			const agent = createExplorerAgent('gpt-4');
			expect(agent.config.prompt).toContain('FOLLOW-UP CANDIDATE AREAS');
			expect(agent.config.prompt).not.toContain('REVIEW NEEDED');
		});

		test('contains "COMPATIBILITY SIGNALS" instead of "VERDICT"', () => {
			const agent = createExplorerAgent('gpt-4');
			expect(agent.config.prompt).toContain('COMPATIBILITY SIGNALS');
			expect(agent.config.prompt).not.toContain('VERDICT');
		});

		test('contains "MIGRATION_SURFACE" instead of "MIGRATION_NEEDED"', () => {
			const agent = createExplorerAgent('gpt-4');
			expect(agent.config.prompt).toContain('MIGRATION_SURFACE');
			expect(agent.config.prompt).not.toContain('MIGRATION_NEEDED');
		});

		test('contains "complex control flow" instead of "Dead code"', () => {
			const agent = createExplorerAgent('gpt-4');
			expect(agent.config.prompt).toContain('complex control flow');
			expect(agent.config.prompt).not.toContain('Dead code');
		});

		test('contains "Missing error handling paths" instead of "Missing error handling"', () => {
			const agent = createExplorerAgent('gpt-4');
			expect(agent.config.prompt).toContain('Missing error handling paths');
		});
	});

	describe('agent description verification', () => {
		test('contains new factual language for domain knowledge description', () => {
			const agent = createExplorerAgent('gpt-4');
			expect(agent.description).toContain(
				'identifies areas where specialized domain knowledge may be beneficial',
			);
			expect(agent.description).not.toContain('flags areas needing SME review');
		});
	});

	describe('export verification', () => {
		test('CURATOR_INIT_PROMPT is still exported', () => {
			expect(CURATOR_INIT_PROMPT).toBeDefined();
			expect(typeof CURATOR_INIT_PROMPT).toBe('string');
			expect(CURATOR_INIT_PROMPT.length).toBeGreaterThan(0);
		});

		test('CURATOR_PHASE_PROMPT is still exported', () => {
			expect(CURATOR_PHASE_PROMPT).toBeDefined();
			expect(typeof CURATOR_PHASE_PROMPT).toBe('string');
			expect(CURATOR_PHASE_PROMPT.length).toBeGreaterThan(0);
		});
	});
});

import { describe, expect, it } from 'bun:test';
import {
	type CouncilWorkflowConfig,
	createArchitectAgent,
} from '../../../src/agents/architect';

/**
 * Part 3 — Architect prompt wiring for the Work Complete Council.
 *
 * Asserts that:
 *  - When council.enabled=true, the four-phase workflow block renders into
 *    the architect prompt with the expected headings, phase labels, tool
 *    names, all five member roles, and REJECT/maxRounds escalation text.
 *  - When council.enabled=false OR the council key is absent, none of the
 *    council-specific strings appear.
 *  - The rendered prompt is byte-for-byte identical between the
 *    council-absent path and the council.enabled=false path (non-regression).
 */
describe('Architect prompt — Work Complete Council workflow block', () => {
	// Sentinel phrases that are UNIQUE to the council workflow block. These
	// were chosen to NOT overlap with the auto-generated tool-description list
	// (which mentions "convene_council" and "Work Complete Council" even when
	// the workflow block is absent), so they truly identify the block itself.
	const COUNCIL_SENTINELS = [
		'## Work Complete Council (when enabled)',
		'Phase 0 — Pre-declare criteria',
		'Phase 1 — Parallel dispatch',
		'Phase 2 — Synthesize',
		'Phase 3 — Act on the result',
		'Retry protocol',
		'hallucinated APIs',
	];

	describe('council.enabled === true', () => {
		const agent = createArchitectAgent(
			'test-model',
			undefined,
			undefined,
			undefined,
			{ enabled: true },
		);
		const prompt = agent.config.prompt!;

		it('includes a Council section heading (case-insensitive match)', () => {
			expect(prompt.toLowerCase()).toContain('council');
			// And specifically the dedicated section header
			expect(prompt).toContain('## Work Complete Council');
		});

		it('includes all four phase labels', () => {
			expect(prompt).toContain('Phase 0');
			expect(prompt).toContain('Phase 1');
			expect(prompt).toContain('Phase 2');
			expect(prompt).toContain('Phase 3');
		});

		it('includes both council tool names', () => {
			expect(prompt).toContain('declare_council_criteria');
			expect(prompt).toContain('convene_council');
		});

		it('mentions the explorer member (5th member)', () => {
			// "explorer" should appear in the council Phase 1 member bullet list.
			// Use a token specific to the council block to avoid matching
			// unrelated mentions of explorer elsewhere in the prompt.
			expect(prompt).toContain('explorer');
			// Tighter — explorer appears in the five-member dispatch list next
			// to slop-hunting responsibilities.
			expect(prompt).toMatch(
				/explorer[\s\S]{0,200}slop|lazy implementations|hallucinated APIs/i,
			);
		});

		it('describes REJECT as blocking and escalating via maxRounds', () => {
			expect(prompt).toContain('REJECT');
			expect(prompt).toContain('Block advancement');
			expect(prompt).toContain('maxRounds');
			expect(prompt).toMatch(/surface.*unifiedFeedbackMd.*HALT/is);
		});
	});

	describe('council.enabled === false', () => {
		const agent = createArchitectAgent(
			'test-model',
			undefined,
			undefined,
			undefined,
			{ enabled: false },
		);
		const prompt = agent.config.prompt!;

		it('does not contain any council-specific sentinel strings', () => {
			for (const s of COUNCIL_SENTINELS) {
				expect(prompt).not.toContain(s);
			}
		});

		it('does not leave the {{COUNCIL_WORKFLOW}} placeholder unexpanded', () => {
			expect(prompt).not.toContain('{{COUNCIL_WORKFLOW}}');
		});
	});

	describe('council config key absent entirely', () => {
		const agent = createArchitectAgent(
			'test-model',
			undefined,
			undefined,
			undefined,
			undefined,
		);
		const prompt = agent.config.prompt!;

		it('does not contain any council-specific sentinel strings', () => {
			for (const s of COUNCIL_SENTINELS) {
				expect(prompt).not.toContain(s);
			}
		});

		it('does not leave the {{COUNCIL_WORKFLOW}} placeholder unexpanded', () => {
			expect(prompt).not.toContain('{{COUNCIL_WORKFLOW}}');
		});
	});

	describe('non-regression byte-equivalence', () => {
		it('council=false and council=absent produce byte-identical prompts', () => {
			const disabled = createArchitectAgent(
				'test-model',
				undefined,
				undefined,
				undefined,
				{ enabled: false } satisfies CouncilWorkflowConfig,
			).config.prompt!;

			const absent = createArchitectAgent(
				'test-model',
				undefined,
				undefined,
				undefined,
				undefined,
			).config.prompt!;

			expect(disabled).toBe(absent);
		});

		it('council=absent is byte-identical to pre-council no-arg call', () => {
			// No-arg call should match absent-council call — proves that adding
			// the council parameter introduced zero observable change when the
			// feature is off.
			const noArg = createArchitectAgent('test-model').config.prompt!;
			const absent = createArchitectAgent(
				'test-model',
				undefined,
				undefined,
				undefined,
				undefined,
			).config.prompt!;

			expect(noArg).toBe(absent);
		});
	});
});

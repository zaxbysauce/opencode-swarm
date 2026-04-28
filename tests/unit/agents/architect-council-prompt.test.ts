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
	// (which mentions "submit_council_verdicts" even when the workflow block is
	// absent), so they truly identify the block itself.
	const COUNCIL_SENTINELS = [
		'## COUNCIL WORKFLOW (submit_council_verdicts)',
		'Phase 0 — Pre-declare criteria',
		'STEP 1 — DISPATCH',
		'STEP 3 — CALL submit_council_verdicts',
		'STEP 5 — ACT on the verdict',
		'ANTI-PATTERNS',
		'ROUND 2 DELIBERATION',
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
			expect(prompt).toContain('## COUNCIL WORKFLOW');
		});

		it('includes all five workflow steps (Phase 0 + STEP 1..STEP 5)', () => {
			expect(prompt).toContain('Phase 0');
			expect(prompt).toContain('STEP 1');
			expect(prompt).toContain('STEP 2');
			expect(prompt).toContain('STEP 3');
			expect(prompt).toContain('STEP 4');
			expect(prompt).toContain('STEP 5');
		});

		it('includes both council tool names', () => {
			expect(prompt).toContain('declare_council_criteria');
			expect(prompt).toContain('submit_council_verdicts');
		});

		it('does NOT contain the old tool name (pre-rename "convene" + underscore + "council")', () => {
			// Constructed string so the literal old identifier never appears in
			// source — keeps the zero-tolerance grep clean.
			const oldToolName = ['convene', 'council'].join('_');
			expect(prompt).not.toContain(oldToolName);
		});

		it('contains the anti-bypass critical guardrail', () => {
			expect(prompt).toContain('does NOT run council members');
		});

		it('references membersAbsent as the anti-hallucination signal', () => {
			expect(prompt).toContain('membersAbsent');
		});

		it('mentions the explorer member (5th member)', () => {
			// "explorer" should appear in the council STEP 1 member bullet list.
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

		it('does not contain the old "supplements — does NOT replace" wording', () => {
			expect(prompt).not.toContain('supplements — does NOT replace');
		});

		it('contains the REPLACES Stage B wording inside the council block', () => {
			expect(prompt).toContain('REPLACES Stage B');
			expect(prompt).toContain('Stage A');
			expect(prompt).toContain('pre_check_batch');
		});

		it('contains the ANTI-PATTERNS section listing 5 council bypass violations', () => {
			expect(prompt).toContain('ANTI-PATTERNS');
			// Five bullet violations.
			const antiPatternMatches = prompt.match(/✗/g) ?? [];
			expect(antiPatternMatches.length).toBeGreaterThanOrEqual(5);
		});

		it('contains the ROUND 2 DELIBERATION rule', () => {
			expect(prompt).toContain('ROUND 2 DELIBERATION');
		});

		describe('critic dispatch includes approved-plan baseline and drift analysis', () => {
			it('contains get_approved_plan in the critic dispatch text', () => {
				expect(prompt).toContain('get_approved_plan');
			});

			it('contains baseline or approved-plan in the critic dispatch', () => {
				// At least one of these approved-plan baseline terms should appear
				// near the critic dispatch line
				expect(prompt).toMatch(
					/critic[\s\S]{0,300}(?:baseline|approved-plan)/i,
				);
			});

			it('contains spec-intent drift language in the critic dispatch', () => {
				// The critic line should reference spec-intent drift analysis
				expect(prompt).toMatch(
					/critic[\s\S]{0,300}spec.?intent.*drift|drift.*spec.?intent/i,
				);
			});
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

		it('YOUR TOOLS does not contain submit_council_verdicts or declare_council_criteria', () => {
			const yourToolsLine = prompt.match(/YOUR TOOLS:\s*(.+?)(?:\n|$)/)?.[1];
			expect(yourToolsLine).toBeDefined();
			expect(yourToolsLine).not.toContain('submit_council_verdicts');
			expect(yourToolsLine).not.toContain('declare_council_criteria');
		});

		it('Available Tools does not contain submit_council_verdicts or declare_council_criteria', () => {
			const availableToolsLine = prompt.match(
				/Available Tools:\s*([\s\S]*?)(?:\n##|$)/,
			)?.[1];
			expect(availableToolsLine).toBeDefined();
			expect(availableToolsLine).not.toContain('submit_council_verdicts');
			expect(availableToolsLine).not.toContain('declare_council_criteria');
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

	describe('critic_oversight is outside council scope', () => {
		const agent = createArchitectAgent(
			'test-model',
			undefined,
			undefined,
			undefined,
			{ enabled: true },
		);
		const prompt = agent.config.prompt!;

		it('council workflow block does not reference critic_oversight', () => {
			// The council workflow dispatches a plan_critic (council critic) for
			// live plan-review. The full-auto intercept uses a separate
			// critic_oversight agent that operates outside council scope.
			// Verifying the council block does not mention critic_oversight
			// confirms these are separate dispatch paths.
			expect(prompt).not.toContain('critic_oversight');
		});

		it('council workflow block does not reference AUTONOMOUS_OVERSIGHT', () => {
			// The autonomous oversight path is a distinct full-auto intercept,
			// not part of the council workflow. The council block should be
			// silent about autonomous oversight.
			expect(prompt).not.toContain('AUTONOMOUS_OVERSIGHT');
		});

		it('critic dispatch in council block refers to council critic (not critic_oversight)', () => {
			// The council dispatches a single "critic" member for live plan-review
			// with approved-baseline comparison (get_approved_plan). This is distinct
			// from critic_oversight which is used by full-auto intercept.
			// Confirms council and autonomous oversight are separate critic paths.
			expect(prompt).toMatch(/- `critic`\s*—/);
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

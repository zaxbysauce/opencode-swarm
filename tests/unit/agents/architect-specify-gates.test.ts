import { describe, expect, test } from 'bun:test';
import { createArchitectAgent } from '../../../src/agents/architect';

/**
 * MODE: SPECIFY step 5b — QA gate selection dialogue.
 *
 * SPECIFY runs BEFORE plan.json exists, so it must conduct the dialogue
 * with the user and stash the elections in `.swarm/context.md` rather than
 * persisting via `set_qa_gates` (which requires plan.json). MODE: PLAN
 * applies the elections after `save_plan` succeeds.
 */
describe('architect prompt — MODE: SPECIFY step 5b QA gate selection', () => {
	const prompt = createArchitectAgent('test-model').config.prompt!;

	function getSpecifySection(): string {
		// SPECIFY runs from "### MODE: SPECIFY" header through the next "### MODE:" header
		const start = prompt.indexOf('### MODE: SPECIFY');
		expect(start).toBeGreaterThan(-1);
		const after = prompt.indexOf('### MODE:', start + 1);
		return prompt.substring(start, after === -1 ? prompt.length : after);
	}

	test('SPECIFY block contains a step labeled "5b"', () => {
		const block = getSpecifySection();
		expect(block).toMatch(/5b\.\s+\*\*QA GATE SELECTION/);
	});

	test('SPECIFY block references the "## Pending QA Gate Selection" section', () => {
		const block = getSpecifySection();
		expect(block).toContain('## Pending QA Gate Selection');
	});

	test('SPECIFY block explicitly says "Do NOT call `set_qa_gates` yet"', () => {
		const block = getSpecifySection();
		expect(block).toContain('Do NOT call `set_qa_gates` yet');
	});

	test('SPECIFY block lists all seven QA gate names in the dialogue text', () => {
		const block = getSpecifySection();
		expect(block).toContain('reviewer');
		expect(block).toContain('test_engineer');
		expect(block).toContain('sme_enabled');
		expect(block).toContain('critic_pre_plan');
		expect(block).toContain('sast_enabled');
		expect(block).toContain('council_mode');
		expect(block).toContain('hallucination_guard');
	});

	test('SPECIFY block instructs writing to .swarm/context.md', () => {
		const block = getSpecifySection();
		expect(block).toContain('.swarm/context.md');
	});

	test('SPECIFY block mentions persistence happens in MODE: PLAN', () => {
		const block = getSpecifySection();
		expect(block).toMatch(/MODE: PLAN.*set_qa_gates/s);
	});

	test('SPECIFY block does not leave {{QA_GATE_DIALOGUE_SPECIFY}} placeholder unexpanded', () => {
		const block = getSpecifySection();
		expect(block).not.toContain('{{QA_GATE_DIALOGUE_SPECIFY}}');
	});

	test('renumbered final step 7 (formerly step 6) reports a summary to the user', () => {
		const block = getSpecifySection();
		expect(block).toMatch(/7\.\s+Report a summary to the user/);
	});

	test('MODE: PLAN block contains POST-SAVE_PLAN gate application instructions', () => {
		const planStart = prompt.indexOf('### MODE: PLAN');
		expect(planStart).toBeGreaterThan(-1);
		const after = prompt.indexOf('### MODE:', planStart + 1);
		const planBlock = prompt.substring(
			planStart,
			after === -1 ? prompt.length : after,
		);
		expect(planBlock).toContain('POST-SAVE_PLAN');
		expect(planBlock).toContain('## Pending QA Gate Selection');
		expect(planBlock).toContain('set_qa_gates');
	});

	test('MODE: PLAN inline path does not leave {{QA_GATE_DIALOGUE_PLAN}} placeholder unexpanded', () => {
		const planStart = prompt.indexOf('### MODE: PLAN');
		const after = prompt.indexOf('### MODE:', planStart + 1);
		const planBlock = prompt.substring(
			planStart,
			after === -1 ? prompt.length : after,
		);
		expect(planBlock).not.toContain('{{QA_GATE_DIALOGUE_PLAN}}');
	});
});

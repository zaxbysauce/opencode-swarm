import { describe, expect, test } from 'bun:test';
import { createArchitectAgent } from '../../../src/agents/architect';

/**
 * MODE: BRAINSTORM Phase 6 — QA gate selection dialogue.
 *
 * Phase 6 used to autonomously select QA gates. Now it must ask the user
 * (one question per message, defaults pre-stated) and stash the elections
 * in `.swarm/context.md` rather than calling `set_qa_gates` directly
 * (plan.json does not exist at this point — `set_qa_gates` would fail).
 * MODE: PLAN persists the elections after `save_plan` succeeds.
 */
describe('architect prompt — MODE: BRAINSTORM Phase 6 QA gate selection', () => {
	const prompt = createArchitectAgent('test-model').config.prompt!;

	function getPhase6Section(): string {
		const start = prompt.indexOf('**Phase 6:');
		expect(start).toBeGreaterThan(-1);
		const after = prompt.indexOf('**Phase 7:', start + 1);
		return prompt.substring(start, after === -1 ? prompt.length : after);
	}

	test('Phase 6 contains the user-facing dialogue lead-in', () => {
		const block = getPhase6Section();
		expect(block).toContain(
			'ask the user which QA gates to enable for this plan',
		);
		expect(block).toContain('do not select on their behalf');
	});

	test('Phase 6 lists all seven gate names as defaults', () => {
		const block = getPhase6Section();
		expect(block).toContain('reviewer');
		expect(block).toContain('test_engineer');
		expect(block).toContain('sme_enabled');
		expect(block).toContain('critic_pre_plan');
		expect(block).toContain('sast_enabled');
		expect(block).toContain('council_mode');
		expect(block).toContain('hallucination_guard');
	});

	test('Phase 6 says "One question, one message, defaults pre-stated"', () => {
		const block = getPhase6Section();
		expect(block).toContain('One question, one message, defaults pre-stated');
	});

	test('Phase 6 does NOT instruct calling set_qa_gates directly (defers to MODE: PLAN)', () => {
		const block = getPhase6Section();
		expect(block).toContain('Do NOT call `set_qa_gates` yet');
	});

	test('Phase 6 instructs writing to "## Pending QA Gate Selection" in context.md', () => {
		const block = getPhase6Section();
		expect(block).toContain('## Pending QA Gate Selection');
		expect(block).toContain('.swarm/context.md');
	});

	test('Phase 6 references MODE: PLAN for persistence after save_plan', () => {
		const block = getPhase6Section();
		expect(block).toMatch(/MODE: PLAN applies these after.*save_plan/);
	});

	test('Phase 6 does not leave the {{QA_GATE_DIALOGUE_BRAINSTORM}} placeholder unexpanded', () => {
		const block = getPhase6Section();
		expect(block).not.toContain('{{QA_GATE_DIALOGUE_BRAINSTORM}}');
	});

	test('BRAINSTORM RULES updated: gates persisted during MODE: PLAN are ratchet-tighter from that point', () => {
		// The line replaced the original "QA gates set in Phase 6 are ratchet-tighter — you cannot undo them later in the session."
		expect(prompt).toContain(
			'QA gates elected in Phase 6 are persisted during MODE: PLAN',
		);
		expect(prompt).toContain('ratchet-tighter from that point');
		expect(prompt).not.toContain(
			'QA gates set in Phase 6 are ratchet-tighter — you cannot undo them later in the session.',
		);
	});
});

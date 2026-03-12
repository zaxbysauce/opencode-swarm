import { describe, expect, test } from 'bun:test';
import { createArchitectAgent } from '../../../src/agents/architect';

/**
 * RETROSPECTIVE GATE VERIFICATION TESTS (Task 1.2)
 *
 * Tests for the RETROSPECTIVE GATE section added to ARCHITECT_PROMPT:
 * - Section exists and contains expected content
 * - Positioned BEFORE MODE: PHASE-WRAP
 * - Contains warning strings and path instructions
 * - Contains retro bundle example with required fields
 * - No regressions on single-brace templates
 * - createArchitectAgent returns correct structure
 */

describe('RETROSPECTIVE GATE Verification (Task 1.2)', () => {
	const prompt = createArchitectAgent('test-model').config.prompt;

	test('1. ARCHITECT_PROMPT contains "## ⛔ RETROSPECTIVE GATE"', () => {
		expect(prompt).toContain('## ⛔ RETROSPECTIVE GATE');
	});

	test('2. "## ⛔ RETROSPECTIVE GATE" appears BEFORE "### MODE: PHASE-WRAP"', () => {
		const retroGateIndex = prompt!.indexOf('## ⛔ RETROSPECTIVE GATE');
		const phaseWrapIndex = prompt!.indexOf('### MODE: PHASE-WRAP');

		expect(retroGateIndex).not.toBe(-1);
		expect(phaseWrapIndex).not.toBe(-1);
		expect(retroGateIndex).toBeLessThan(phaseWrapIndex);
	});

	test('3. ARCHITECT_PROMPT contains the warning string "RETROSPECTIVE_MISSING"', () => {
		expect(prompt).toContain('RETROSPECTIVE_MISSING');
	});

	test('4. ARCHITECT_PROMPT contains retro-{N} path instruction', () => {
		expect(prompt).toContain('retro-{N}');
	});

	test('5. ARCHITECT_PROMPT contains "verdict": "pass" in the retro bundle example', () => {
		expect(prompt).toContain('"verdict": "pass"');
	});

	test('6. ARCHITECT_PROMPT contains "type": "retrospective" in the retro bundle example', () => {
		expect(prompt).toContain('"type": "retrospective"');
	});

	test('7. ARCHITECT_PROMPT contains "phase_number" field reference', () => {
		expect(prompt).toContain('"phase_number"');
	});

	test('8. ARCHITECT_PROMPT does NOT contain single-brace {AGENT_PREFIX} (no regression)', () => {
		// The correct form is double-brace {{AGENT_PREFIX}}
		// Single-brace {AGENT_PREFIX} is a regression bug
		expect(prompt).not.toMatch(/(?<!\{)\{AGENT_PREFIX\}(?!\})/);
	});

	test('9. ARCHITECT_PROMPT does NOT contain single-brace {SWARM_ID} (no regression)', () => {
		// The correct form is double-brace {{SWARM_ID}}
		// Single-brace {SWARM_ID} is a regression bug
		expect(prompt).not.toMatch(/(?<!\{)\{SWARM_ID\}(?!\})/);
	});

	test('10. createArchitectAgent("gpt-4") returns an object with name: "architect"', () => {
		const agent = createArchitectAgent('gpt-4');
		expect(agent).toBeDefined();
		expect(agent.name).toBe('architect');
		expect(agent.config).toBeDefined();
		expect(agent.config.prompt).toBeDefined();
	});
});

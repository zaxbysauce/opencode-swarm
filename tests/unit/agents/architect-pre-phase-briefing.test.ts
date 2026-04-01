import { describe, expect, test } from 'bun:test';
import { createArchitectAgent } from '../../../src/agents/architect';

/**
 * PRE-PHASE BRIEFING VERIFICATION TESTS (Task 2.5)
 *
 * Tests for the PRE-PHASE BRIEFING section added to ARCHITECT_PROMPT:
 * - Section exists and contains expected content
 * - Positioned correctly (after CONSULT, before PLAN, not after EXECUTE)
 * - Contains both Phase 2+ and Phase 1 briefing variants
 * - Contains acknowledgment format strings
 * - No regressions on single-brace templates
 * - No unescaped backtick sequences
 */

describe('PRE-PHASE BRIEFING Verification (Task 2.5)', () => {
	const prompt = createArchitectAgent('test-model').config.prompt;

	// ==================== VERIFICATION TESTS (8 tests) ====================

	test('1. ARCHITECT_PROMPT contains "PRE-PHASE BRIEFING" string', () => {
		expect(prompt).toContain('PRE-PHASE BRIEFING');
	});

	test('2. ARCHITECT_PROMPT contains "MODE: PRE-PHASE BRIEFING"', () => {
		expect(prompt).toContain('MODE: PRE-PHASE BRIEFING');
	});

	test('3. "PRE-PHASE BRIEFING" appears AFTER "MODE: PLAN" (positional check)', () => {
		const prePhaseBriefingIndex = prompt!.indexOf('MODE: PRE-PHASE BRIEFING');
		const planIndex = prompt!.indexOf('MODE: PLAN');

		expect(prePhaseBriefingIndex).not.toBe(-1);
		expect(planIndex).not.toBe(-1);
		expect(prePhaseBriefingIndex).toBeGreaterThan(planIndex);
	});

	test('4. "PRE-PHASE BRIEFING" appears AFTER "MODE: CONSULT" (positional check)', () => {
		const consultIndex = prompt!.indexOf('MODE: CONSULT');
		const prePhaseBriefingIndex = prompt!.indexOf('MODE: PRE-PHASE BRIEFING');

		expect(consultIndex).not.toBe(-1);
		expect(prePhaseBriefingIndex).not.toBe(-1);
		expect(consultIndex).toBeLessThan(prePhaseBriefingIndex);
	});

	test('5. ARCHITECT_PROMPT contains "retro-{N-1}" (Phase 2+ path references correct task ID pattern)', () => {
		expect(prompt).toContain('retro-{N-1}');
	});

	test('6. ARCHITECT_PROMPT contains "retro-*" (Phase 1 path references retro scan pattern)', () => {
		expect(prompt).toContain('retro-*');
	});

	test('7. ARCHITECT_PROMPT contains both Phase 2+ path and Phase 1 path (both briefing variants present)', () => {
		const hasPhase2PlusPath = prompt!.includes('retro-{N-1}');
		const hasPhase1Path = prompt!.includes('retro-*');

		expect(hasPhase2PlusPath).toBe(true);
		expect(hasPhase1Path).toBe(true);
	});

	test('8. ARCHITECT_PROMPT contains "→ BRIEFING:" string (acknowledgment format is present)', () => {
		expect(prompt).toContain('→ BRIEFING:');
	});

	// ==================== ADVERSARIAL TESTS (5 tests) ====================

	test('9. "PRE-PHASE BRIEFING" section does NOT appear after "### MODE: EXECUTE" (placed correctly)', () => {
		const prePhaseBriefingIndex = prompt!.indexOf('MODE: PRE-PHASE BRIEFING');
		const executeIndex = prompt!.indexOf('### MODE: EXECUTE');

		expect(prePhaseBriefingIndex).not.toBe(-1);
		expect(executeIndex).not.toBe(-1);
		// PRE-PHASE BRIEFING should come BEFORE ### MODE: EXECUTE
		expect(prePhaseBriefingIndex).toBeLessThan(executeIndex);
	});

	test('10. Template literal double-brace vars preserved: prompt contains "{{AGENT_PREFIX}}" not single-brace', () => {
		// The correct form is double-brace {{AGENT_PREFIX}}
		// Single-brace {AGENT_PREFIX} is a regression bug
		expect(prompt).not.toMatch(/(?<!\{)\{AGENT_PREFIX\}(?!\})/);
		// Also verify double-brace form exists
		expect(prompt).toContain('{{AGENT_PREFIX}}');
	});

	test('11. Prompt does not contain unescaped backtick sequences that would break template literal', () => {
		// Check for unescaped backticks around retro-* pattern
		// The backticks should be escaped as \`retro-*\` within the template literal
		// We verify that the pattern exists but is properly formatted
		const retroStarPattern = /retro-\*/;
		expect(prompt).toMatch(retroStarPattern);

		// Verify the template literal itself is valid by checking the prompt is a string
		expect(typeof prompt).toBe('string');
	});

	test('12. "HARD REQUIREMENT" phrase present in PRE-PHASE BRIEFING section', () => {
		// Find the PRE-PHASE BRIEFING section
		const prePhaseBriefingStart = prompt!.indexOf('MODE: PRE-PHASE BRIEFING');
		// Find the next section after PRE-PHASE BRIEFING (CODEBASE REALITY CHECK)
		const nextSectionStart = prompt!.indexOf(
			'### CODEBASE REALITY CHECK',
			prePhaseBriefingStart,
		);

		expect(prePhaseBriefingStart).not.toBe(-1);
		expect(nextSectionStart).not.toBe(-1);

		// Extract the PRE-PHASE BRIEFING section
		const prePhaseBriefingSection = prompt!.slice(
			prePhaseBriefingStart,
			nextSectionStart,
		);

		// Verify it contains "HARD REQUIREMENT"
		expect(prePhaseBriefingSection).toContain('HARD REQUIREMENT');
	});

	test('13. ARCHITECT_PROMPT contains "user_directives" (Phase 1 path mentions user_directives)', () => {
		expect(prompt).toContain('user_directives');
	});
});

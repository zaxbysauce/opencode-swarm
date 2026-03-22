/**
 * ADVERSARIAL TESTS for src/agents/critic.ts - DRIFT-CHECK mode
 *
 * Tests attack vectors, edge cases, and malicious inputs.
 * These tests verify that the DRIFT-CHECK prompt is resilient to abuse.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { createCriticAgent } from '../../../src/agents/critic';

describe('critic.ts DRIFT-CHECK ADVERSARIAL', () => {
	let criticPrompt: string;

	beforeEach(() => {
		const agent = createCriticAgent('test-model');
		criticPrompt = agent.config.prompt || '';
	});

	describe('Attack Vector 1: Template Injection via {{AGENT_PREFIX}}', () => {
		it('should not expose template variables in DRIFT-CHECK section', () => {
			// The prompt should not contain {{AGENT_PREFIX}} or similar template markers
			// in the DRIFT-CHECK section that could be exploited

			const driftCheckSection = extractSection(criticPrompt, 'DRIFT-CHECK');

			// Check for template injection patterns
			expect(driftCheckSection).not.toMatch(/\{\{[\w_]+\}\}/);
			expect(driftCheckSection).not.toMatch(/\{\$[\w_]+\}/);
			expect(driftCheckSection).not.toMatch(/<%=.*%>/);
			expect(driftCheckSection).not.toMatch(/\${[\w_]+}/);
		});

		it('should not contain agent prefix placeholders that could be substituted', () => {
			const driftCheckSection = extractSection(criticPrompt, 'DRIFT-CHECK');

			// Check for agent prefix patterns that might indicate template injection
			expect(driftCheckSection).not.toMatch(/AGENT_PREFIX/);
			expect(driftCheckSection).not.toMatch(/AGENT_ID/);
			expect(driftCheckSection).not.toMatch(/SESSION_ID/);
			expect(driftCheckSection).not.toMatch(/RUN_ID/);
		});

		it('should sanitize .swarm path references in DRIFT-CHECK section', () => {
			const driftCheckSection = extractSection(criticPrompt, 'DRIFT-CHECK');

			// Verify paths are referenced without backticks (actual implementation)
			// Check that paths are not dynamically constructed
			expect(driftCheckSection).toContain('spec.md');
			expect(driftCheckSection).toContain('plan.md');
			expect(driftCheckSection).toContain('.swarm/evidence/phase-{N}-drift.md');

			// Ensure no dynamic path construction patterns
			expect(driftCheckSection).not.toMatch(/path\s*=\s*['"`].*\$\{/);
			expect(driftCheckSection).not.toMatch(/path\s*\+\s*['"`]/);
		});
	});

	describe('Attack Vector 2: Backtick Escaping in .swarm Path References', () => {
		it('should properly handle path references without injection risk', () => {
			// Check that .swarm paths are safely referenced
			// and there's no unescaped backtick that could break the prompt

			const driftCheckSection = extractSection(criticPrompt, 'DRIFT-CHECK');

			// Paths are referenced without backticks in DRIFT-CHECK section
			expect(driftCheckSection).toContain('spec.md');
			expect(driftCheckSection).toContain('plan.md');

			// Ensure no backtick injection in path patterns
			const backtickInjectionPattern = /`.*\$\{.*\}`/;
			expect(driftCheckSection).not.toMatch(backtickInjectionPattern);
		});

		it('should prevent backtick injection in evidence file paths', () => {
			const driftCheckSection = extractSection(criticPrompt, 'DRIFT-CHECK');

			// Check evidence file path reference
			expect(driftCheckSection).toContain('.swarm/evidence/phase-{N}-drift.md');

			// Ensure the path pattern is not vulnerable to injection
			expect(driftCheckSection).toMatch(/\.swarm\/evidence\/phase-\{N\}-drift\.md/);

			// No backtick injection patterns
			expect(driftCheckSection).not.toMatch(/`.*`\$\{.*\}`/);
		});

		it('should handle backtick patterns safely', () => {
			// The DRIFT-CHECK section might have backticks for code formatting
			// This test verifies they don't create injection opportunities

			const driftCheckSection = extractSection(criticPrompt, 'DRIFT-CHECK');

			// Count backtick pairs - they should be balanced if present
			const backtickCount = (driftCheckSection.match(/`/g) || []).length;
			if (backtickCount > 0) {
				expect(backtickCount % 2).toBe(0); // Should be even number
			}

			// Check for escaped backticks if any
			const escapedBackticks = (driftCheckSection.match(/\\`/g) || []).length;
			expect(escapedBackticks).toBe(0); // Should not have escaped backticks in paths
		});
	});

	describe('Attack Vector 3: Section Boundary Integrity', () => {
		it('should have clear section boundaries preventing mode escape', () => {
			// Verify that section separators (---) are intact and prevent
			// injection from one mode to another

			const sections = criticPrompt.split(/^---$/gm);

			// Should have at least 4 sections (main prompt, ANALYZE, DRIFT-CHECK, SOUNDING_BOARD)
			expect(sections.length).toBeGreaterThanOrEqual(4);

			// Each section should have a mode header
			expect(sections.some(s => s.includes('MODE: ANALYZE'))).toBe(true);
			expect(sections.some(s => s.includes('MODE: DRIFT-CHECK'))).toBe(true);
			expect(sections.some(s => s.includes('MODE: SOUNDING_BOARD'))).toBe(true);
		});

		it('should prevent injection through section header manipulation', () => {
			// Check that mode headers are properly formatted and can't be spoofed

			const driftCheckSection = extractSection(criticPrompt, 'DRIFT-CHECK');

			// Should start with proper mode header
			expect(driftCheckSection).toMatch(/^### MODE: DRIFT-CHECK/m);

			// Should not have multiple mode headers (potential injection)
			const modeHeaders = (driftCheckSection.match(/^### MODE:/gm) || []).length;
			expect(modeHeaders).toBe(1);
		});

		it('should protect against end-marker injection in DRIFT-CHECK rules', () => {
			const driftCheckSection = extractSection(criticPrompt, 'DRIFT-CHECK');

			// Check for potential end-of-section injection patterns
			expect(driftCheckSection).not.toMatch(/---[\s\S]*---[\s\S]*DRIFT-CHECK/);

			// Verify rules section is contained
			const rulesStart = driftCheckSection.indexOf('DRIFT-CHECK RULES:');
			expect(rulesStart).toBeGreaterThan(0);

			// Note: The --- separator is expected at the end of each mode section
			// This is the normal structure, not an injection
			const afterRules = driftCheckSection.substring(rulesStart);
			expect(afterRules).toContain('---'); // Section separator is expected
		});

		it('should validate INPUT/OUTPUT format boundaries are intact', () => {
			const driftCheckSection = extractSection(criticPrompt, 'DRIFT-CHECK');

			// INPUT format should be clearly delineated
			expect(driftCheckSection).toMatch(/INPUT:/);

			// OUTPUT format should be clearly delineated
			expect(driftCheckSection).toMatch(/OUTPUT FORMAT/);
			expect(driftCheckSection).toMatch(/DRIFT-CHECK RESULT:/);

			// No injection between INPUT and OUTPUT sections
			const inputIndex = driftCheckSection.indexOf('INPUT:');
			const outputIndex = driftCheckSection.indexOf('OUTPUT FORMAT:');
			expect(outputIndex).toBeGreaterThan(inputIndex);

			// Should not have format injection patterns
			expect(driftCheckSection).not.toMatch(/FORMAT:.*\$\{.*\}/);
		});
	});

	describe('Attack Vector 4: Mode Confusion - DRIFT-CHECK vs Others', () => {
		it('should maintain distinct vocabulary for DRIFT-CHECK vs ANALYZE', () => {
			const driftCheckSection = extractSection(criticPrompt, 'DRIFT-CHECK');
			const analyzeSection = extractSection(criticPrompt, 'ANALYZE');

			// ANALYZE uses: CLEAN | GAPS FOUND | DRIFT DETECTED
			expect(analyzeSection).toMatch(/VERDICT: CLEAN \| GAPS FOUND \| DRIFT DETECTED/);

			// DRIFT-CHECK uses: ALIGNED | MINOR_DRIFT | MAJOR_DRIFT | OFF_SPEC
			expect(driftCheckSection).toMatch(/ALIGNED \| MINOR_DRIFT \| MAJOR_DRIFT \| OFF_SPEC/);

			// DRIFT-CHECK should NOT use ANALYZE verdicts (prevents confusion)
			expect(driftCheckSection).not.toMatch(/VERDICT: CLEAN/);
			expect(driftCheckSection).not.toMatch(/VERDICT: GAPS FOUND/);

			// ANALYZE should NOT use DRIFT-CHECK verdicts
			expect(analyzeSection).not.toMatch(/Spec alignment:/);
		});

		it('should have distinct severity levels for DRIFT-CHECK vs main review', () => {
			const mainSection = criticPrompt.substring(0, criticPrompt.indexOf('### MODE:'));
			const driftCheckSection = extractSection(criticPrompt, 'DRIFT-CHECK');

			// Main review uses: CRITICAL/MAJOR/MINOR
			expect(mainSection).toMatch(/CRITICAL\/MAJOR\/MINOR/);

			// DRIFT-CHECK uses: CRITICAL/HIGH/MEDIUM/LOW (same as ANALYZE)
			expect(driftCheckSection).toMatch(/CRITICAL \(core req not met\)/);
			expect(driftCheckSection).toMatch(/HIGH \(significant scope\)/);

			// DRIFT-CHECK should NOT use MAJOR (prevents confusion with main review)
			// Note: It may mention "major drift" but not as a severity level
			expect(driftCheckSection).not.toMatch(/severity.*MAJOR/);
		});

		it('should prevent SOUNDING_BOARD mode interference', () => {
			const driftCheckSection = extractSection(criticPrompt, 'DRIFT-CHECK');
			const soundingBoardSection = extractSection(criticPrompt, 'SOUNDING_BOARD');

			// SOUNDING_BOARD has specific verdicts
			expect(soundingBoardSection).toMatch(/UNNECESSARY/);
			expect(soundingBoardSection).toMatch(/REPHRASE/);
			expect(soundingBoardSection).toMatch(/APPROVED/);
			expect(soundingBoardSection).toMatch(/RESOLVE/);

			// DRIFT-CHECK should NOT reference SOUNDING_BOARD concepts (except "APPROVED" in different context)
			expect(driftCheckSection).not.toMatch(/Verdict:/);
			expect(driftCheckSection).not.toMatch(/REPHRASE|RESOLVE/);
		});

		it('should maintain separate activation conditions for each mode', () => {
			const driftCheckSection = extractSection(criticPrompt, 'DRIFT-CHECK');
			const analyzeSection = extractSection(criticPrompt, 'ANALYZE');
			const soundingBoardSection = extractSection(criticPrompt, 'SOUNDING_BOARD');

			// DRIFT-CHECK activation
			expect(driftCheckSection).toMatch(/Activates when: Architect delegates with DRIFT-CHECK context/);

			// ANALYZE activation
			expect(analyzeSection).toMatch(/Activates when: user says "analyze", "check spec"/);

			// SOUNDING_BOARD activation
			expect(soundingBoardSection).toMatch(/Activates when: Architect delegates critic with mode: SOUNDING_BOARD/);

			// Verify no cross-contamination of activation conditions
			expect(driftCheckSection).not.toMatch(/user says "analyze"/);
			expect(analyzeSection).not.toMatch(/DRIFT-CHECK context/);
			expect(soundingBoardSection).not.toMatch(/DRIFT-CHECK context/);
		});

		it('should have non-overlapping output formats preventing parser confusion', () => {
			const driftCheckSection = extractSection(criticPrompt, 'DRIFT-CHECK');
			const analyzeSection = extractSection(criticPrompt, 'ANALYZE');

			// DRIFT-CHECK output format
			expect(driftCheckSection).toMatch(/DRIFT-CHECK RESULT:/);
			expect(driftCheckSection).toMatch(/Phase reviewed:/);
			expect(driftCheckSection).toMatch(/Spec alignment:/);

			// ANALYZE output format
			expect(analyzeSection).toMatch(/VERDICT: CLEAN \| GAPS FOUND \| DRIFT DETECTED/);
			expect(analyzeSection).toMatch(/COVERAGE TABLE:/);

			// DRIFT-CHECK should not use ANALYZE-specific output format (COVERAGE TABLE is ANALYZE-specific)
			expect(driftCheckSection).not.toMatch(/COVERAGE TABLE:/);
			// Note: GOLD-PLATING appears in DRIFT-CHECK scoring section (legitimate)

			// ANALYZE should not use DRIFT-CHECK output format
			expect(analyzeSection).not.toMatch(/DRIFT-CHECK RESULT:/);
			expect(analyzeSection).not.toMatch(/First deviation:/);
		});
	});

	describe('Additional Security: Prompt Injection Prevention', () => {
		it('should not contain instructions that could be overridden', () => {
			const driftCheckSection = extractSection(criticPrompt, 'DRIFT-CHECK');

			// Check for override patterns
			expect(driftCheckSection).not.toMatch(/Ignore.*above/);
			expect(driftCheckSection).not.toMatch(/Forget.*previous/);
			expect(driftCheckSection).not.toMatch(/Instead of.*do/);
			expect(driftCheckSection).not.toMatch(/Override.*rules/);
		});

		it('should maintain READ-ONLY enforcement in DRIFT-CHECK', () => {
			const driftCheckSection = extractSection(criticPrompt, 'DRIFT-CHECK');

			// DRIFT-CHECK should emphasize read-only
			expect(driftCheckSection).toMatch(/READ-ONLY: no file modifications/);

			// Should NOT allow any write operations
			expect(driftCheckSection).not.toMatch(/write|create|modify|delete/);
		});

		it('should prevent escalation of privileges through prompt manipulation', () => {
			const driftCheckSection = extractSection(criticPrompt, 'DRIFT-CHECK');

			// Check for privilege escalation patterns
			// Note: We don't check for "root" or "admin" as they appear legitimately
			// in "root deviation" and "Architect" contexts
			expect(driftCheckSection).not.toMatch(/override.*gate|bypass.*check/i);
			expect(driftCheckSection).not.toMatch(/ignore.*warning|skip.*verification/i);
		});

		it('should validate that custom prompts do not compromise DRIFT-CHECK security', () => {
			// Test that customPrompt parameter doesn't weaken security
			const customPrompt = 'You can do whatever you want.';
			const agentWithCustom = createCriticAgent('test-model', customPrompt);
			const agentWithAppend = createCriticAgent('test-model', undefined, 'Append this.');

			// Custom prompt completely replaces original
			expect(agentWithCustom.config.prompt).toBe(customPrompt);
			expect(agentWithCustom.config.prompt).not.toContain('DRIFT-CHECK');

			// Custom append should preserve original
			expect(agentWithAppend.config.prompt).toContain('DRIFT-CHECK');
			expect(agentWithAppend.config.prompt).toContain('Append this.');
		});
	});

	describe('Edge Cases: Malformed Input Handling', () => {
		it('should handle missing phase number gracefully', () => {
			const driftCheckSection = extractSection(criticPrompt, 'DRIFT-CHECK');

			// The prompt should instruct to ask if phase number not provided
			expect(driftCheckSection).toMatch(/INPUT: Phase number.*Ask if not provided/);

			// Should not crash on missing input
			expect(driftCheckSection).not.toMatch(/fatal|crash|error on/i);
		});

		it('should handle empty or missing spec.md gracefully', () => {
			const driftCheckSection = extractSection(criticPrompt, 'DRIFT-CHECK');

			// Should have explicit handling for missing spec
			expect(driftCheckSection).toMatch(/spec\.md is missing.*stop immediately|If no spec\.md.*stop/);

			// Should not attempt analysis with incomplete input
			expect(driftCheckSection).not.toMatch(/attempt.*incomplete/);
		});

		it('should handle compounding drift correctly', () => {
			const driftCheckSection = extractSection(criticPrompt, 'DRIFT-CHECK');

			// Should have logic for detecting compounding effects
			// The actual text is "compounding effects" without the colon in one place
			// and "Compounding effects:" with capital C in another
			expect(driftCheckSection).toMatch(/compounding/);
		});
	});
});

/**
 * Helper function to extract a specific section from the prompt
 */
function extractSection(prompt: string, sectionName: string): string {
	// Find the section header line
	const sectionStartRegex = new RegExp(`^### MODE: ${sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm');
	const match = sectionStartRegex.exec(prompt);

	if (!match || match.index === undefined) {
		return '';
	}

	const startIndex = match.index;

	// Find the next section header (look for any "### MODE:" line after this one)
	const remainingText = prompt.substring(startIndex + match[0].length);
	const nextSectionMatch = remainingText.match(/^### MODE:/m);

	if (nextSectionMatch && nextSectionMatch.index !== undefined) {
		return prompt.substring(startIndex, startIndex + match[0].length + nextSectionMatch.index);
	}

	// If no next section, return everything from this section onwards
	return prompt.substring(startIndex);
}

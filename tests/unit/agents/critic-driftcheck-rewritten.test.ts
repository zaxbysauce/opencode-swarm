import { describe, expect, it } from 'bun:test';
import { createCriticAgent } from '../../../src/agents/critic';

describe('MODE: DRIFT-CHECK — rewritten verification (Task 1.3)', () => {
	const agent = createCriticAgent('test-model');
	const prompt = agent.config.prompt!;
	const driftCheckSection = prompt.split('### MODE: DRIFT-CHECK')[1] ?? '';
	const driftCheckOutputSection = driftCheckSection.slice(
		driftCheckSection.indexOf('OUTPUT FORMAT (MANDATORY'),
		driftCheckSection.indexOf('VERBOSITY CONTROL:'),
	);

	it('1. Trajectory-level evaluation present', () => {
		// Check for TRAJECTORY-LEVEL EVALUATION section
		expect(driftCheckSection).toContain('TRAJECTORY-LEVEL EVALUATION');

		// Verify it mentions reviewing sequence from Phase 1 through current phase
		expect(driftCheckSection).toContain('Phase 1 through the current phase');
		expect(driftCheckSection).toContain('compounding drift');
	});

	it('2. First-error focus present', () => {
		// Check for FIRST-ERROR FOCUS section
		expect(driftCheckSection).toContain('FIRST-ERROR FOCUS');

		// Verify it mentions identifying the EARLIEST point where deviation began
		expect(driftCheckSection).toContain('EARLIEST point');
		expect(driftCheckSection).toContain('deviation began');
		expect(driftCheckSection).toContain('root deviation');
	});

	it('3. DEFAULT POSTURE: SKEPTICAL present', () => {
		// Check for DEFAULT POSTURE: SKEPTICAL
		expect(driftCheckSection).toContain('DEFAULT POSTURE: SKEPTICAL');

		// Verify it explains finding drift, not confirming alignment
		expect(driftCheckSection).toContain('find drift, not to confirm alignment');
		expect(driftCheckSection).toContain('absence of drift ≠ evidence of alignment');
	});

	it('4. Structured output with first-deviation field', () => {
		// Check for DRIFT-CHECK RESULT header
		expect(driftCheckOutputSection).toContain('DRIFT-CHECK RESULT:');

		// Check for verdict options
		expect(driftCheckOutputSection).toContain('ALIGNED | MINOR_DRIFT | MAJOR_DRIFT | OFF_SPEC');

		// Check for First deviation field
		expect(driftCheckOutputSection).toContain('First deviation:');

		// Verify First deviation includes Phase, Task, and description format
		expect(driftCheckOutputSection).toContain('Phase [N], Task [N.M]');
		expect(driftCheckOutputSection).toContain('[description]');

		// Check for Compounding effects field
		expect(driftCheckOutputSection).toContain('Compounding effects:');

		// Check for Recommended correction field
		expect(driftCheckOutputSection).toContain('Recommended correction:');

		// Check for Evidence of alignment field (when aligned)
		expect(driftCheckOutputSection).toContain('Evidence of alignment:');
	});

	it('5. Verbosity control present', () => {
		// Check for VERBOSITY CONTROL section
		expect(driftCheckSection).toContain('VERBOSITY CONTROL:');

		// Verify it specifies 3-4 lines for ALIGNED
		expect(driftCheckSection).toContain('ALIGNED = 3-4 lines');

		// Verify it specifies full structured output for MAJOR_DRIFT
		expect(driftCheckSection).toContain('MAJOR_DRIFT = full output');

		// Check for concise language instruction
		expect(driftCheckSection).toContain('No padding');
	});

	it('6. Token budget ≤1300', () => {
		// Count tokens (rough approximation: ~4 characters per token for English text)
		const characterCount = driftCheckSection.length;
		const estimatedTokens = Math.ceil(characterCount / 4);

		console.log(`DRIFT-CHECK mode character count: ${characterCount}`);
		console.log(`DRIFT-CHECK mode estimated token count: ${estimatedTokens}`);

		// Verify token budget is ≤1300
		expect(estimatedTokens).toBeLessThanOrEqual(1300);
	});

	it('7. References to evidence files for all phases 1→N', () => {
		// Check for evidence file reading
		expect(driftCheckSection).toContain('Read evidence files');
		expect(driftCheckSection).toContain('all phases 1→N');
	});

	it('8. Edge case: Evidence files missing handled', () => {
		// Check for handling missing evidence files
		expect(driftCheckSection).toContain('evidence files are missing');
		expect(driftCheckSection).toContain('proceed with available data');
	});

	it('9. Advisory only rule present', () => {
		// Check for advisory only statement
		expect(driftCheckSection).toContain('Advisory only');
		expect(driftCheckSection).toContain('does NOT block phase transitions');
	});

	it('10. READ-ONLY constraint present', () => {
		// Check for READ-ONLY rule
		expect(driftCheckSection).toContain('READ-ONLY');
		expect(driftCheckSection).toContain('do not create, modify, or delete any file');
	});

	it('11. Spec.md missing edge case handled', () => {
		// Check for spec.md missing handling
		expect(driftCheckSection).toContain('spec.md is missing');
		expect(driftCheckSection).toContain('report missing and stop');
	});

	it('12. Invalid phase number edge case handled', () => {
		// Check for invalid phase number handling
		expect(driftCheckSection).toContain('no tasks found for phase N');
	});

	it('13. Steps include extracting completed tasks for phases 1→N', () => {
		// Check Step 2 for trajectory-level task extraction
		expect(driftCheckSection).toContain('Read plan.md — extract tasks marked complete');
		expect(driftCheckSection).toContain('Phases 1→N');
	});

	it('14. Drift types classified correctly', () => {
		// Check for scope additions, omissions, and assumption changes
		expect(driftCheckSection).toContain('scope additions');
		expect(driftCheckSection).toContain('omissions');
		expect(driftCheckSection).toContain('assumption changes');
	});
});

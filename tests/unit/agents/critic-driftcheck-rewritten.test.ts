import { describe, expect, it } from 'bun:test';
import { createCriticAgent } from '../../../src/agents/critic';

describe('MODE: DRIFT-CHECK — rewritten verification (Task 1.3)', () => {
	const agent = createCriticAgent('test-model');
	const prompt = agent.config.prompt!;

	it('1. Trajectory-level evaluation present', () => {
		const driftCheckStart = prompt.indexOf('### MODE: DRIFT-CHECK');
		const driftCheckSection = prompt.substring(driftCheckStart);

		// Check for TRAJECTORY-LEVEL EVALUATION section
		expect(driftCheckSection).toContain('TRAJECTORY-LEVEL EVALUATION');

		// Verify it mentions reviewing sequence from Phase 1 through current phase
		expect(driftCheckSection).toContain('Phase 1 through the current phase');
		expect(driftCheckSection).toContain('compounding drift');
	});

	it('2. First-error focus present', () => {
		const driftCheckStart = prompt.indexOf('### MODE: DRIFT-CHECK');
		const driftCheckSection = prompt.substring(driftCheckStart);

		// Check for FIRST-ERROR FOCUS section
		expect(driftCheckSection).toContain('FIRST-ERROR FOCUS');

		// Verify it mentions identifying the EARLIEST point where deviation began
		expect(driftCheckSection).toContain('EARLIEST point');
		expect(driftCheckSection).toContain('deviation began');
		expect(driftCheckSection).toContain('root deviation');
	});

	it('3. DEFAULT POSTURE: SKEPTICAL present', () => {
		const driftCheckStart = prompt.indexOf('### MODE: DRIFT-CHECK');
		const driftCheckSection = prompt.substring(driftCheckStart);

		// Check for DEFAULT POSTURE: SKEPTICAL
		expect(driftCheckSection).toContain('DEFAULT POSTURE: SKEPTICAL');

		// Verify it explains finding drift, not confirming alignment
		expect(driftCheckSection).toContain('find drift, not to confirm alignment');
		expect(driftCheckSection).toMatch(/absence of detected drift is NOT evidence of alignment/i);
	});

	it('4. Structured output with first-deviation field', () => {
		const driftCheckStart = prompt.indexOf('### MODE: DRIFT-CHECK');
		const driftCheckOutputStart = prompt.indexOf('OUTPUT FORMAT:', driftCheckStart);
		const driftCheckOutputEnd = prompt.indexOf('VERBOSITY CONTROL:', driftCheckOutputStart);
		const driftCheckOutputSection = prompt.substring(driftCheckOutputStart, driftCheckOutputEnd);

		// Check for DRIFT-CHECK RESULT header
		expect(driftCheckOutputSection).toContain('DRIFT-CHECK RESULT:');

		// Check for verdict options
		expect(driftCheckOutputSection).toContain('ALIGNED | MINOR_DRIFT | MAJOR_DRIFT | OFF_SPEC');

		// Check for First deviation field
		expect(driftCheckOutputSection).toContain('First deviation:');

		// Verify First deviation includes Phase, Task, and description format
		expect(driftCheckOutputSection).toContain('Phase [N], Task [N.M]');
		expect(driftCheckOutputSection).toContain('specific deviation description');

		// Check for Compounding effects field
		expect(driftCheckOutputSection).toContain('Compounding effects:');

		// Check for Recommended correction field
		expect(driftCheckOutputSection).toContain('Recommended correction:');

		// Check for Evidence of alignment field (when aligned)
		expect(driftCheckOutputSection).toContain('Evidence of alignment:');
	});

	it('5. Verbosity control present', () => {
		const driftCheckStart = prompt.indexOf('### MODE: DRIFT-CHECK');
		const driftCheckSection = prompt.substring(driftCheckStart);

		// Check for VERBOSITY CONTROL section
		expect(driftCheckSection).toContain('VERBOSITY CONTROL:');

		// Verify it specifies 3-4 lines for ALIGNED with clear evidence
		expect(driftCheckSection).toContain('ALIGNED with clear evidence = 3-4 lines');

		// Verify it specifies full structured output for MAJOR_DRIFT
		expect(driftCheckSection).toContain('MAJOR_DRIFT = full structured output');

		// Check for concise language instruction
		expect(driftCheckSection).toContain('Do not write a paragraph when a sentence will do');
	});

	it('6. Token budget ≤600', () => {
		// Extract just the DRIFT-CHECK mode section
		const driftCheckStart = prompt.indexOf('### MODE: DRIFT-CHECK');
		const driftCheckEnd = prompt.indexOf('---', driftCheckStart + 1); // Find next section marker
		const driftCheckSection = prompt.substring(driftCheckStart, driftCheckEnd);

		// Count tokens (rough approximation: ~4 characters per token for English text)
		const characterCount = driftCheckSection.length;
		const estimatedTokens = Math.ceil(characterCount / 4);

		console.log(`DRIFT-CHECK mode character count: ${characterCount}`);
		console.log(`DRIFT-CHECK mode estimated token count: ${estimatedTokens}`);

		// Verify token budget is ≤600
		expect(estimatedTokens).toBeLessThanOrEqual(600);
	});

	it('7. References to evidence files for all phases 1→N', () => {
		const driftCheckStart = prompt.indexOf('### MODE: DRIFT-CHECK');
		const driftCheckSection = prompt.substring(driftCheckStart);

		// Check for evidence file reading
		expect(driftCheckSection).toContain('Read evidence files');
		expect(driftCheckSection).toContain('all phases 1→N');
	});

	it('8. Edge case: Evidence files missing handled', () => {
		const driftCheckStart = prompt.indexOf('### MODE: DRIFT-CHECK');
		const driftCheckSection = prompt.substring(driftCheckStart);

		// Check for handling missing evidence files
		expect(driftCheckSection).toContain('Evidence files missing');
		expect(driftCheckSection).toContain('proceed with available data');
	});

	it('9. Advisory only rule present', () => {
		const driftCheckStart = prompt.indexOf('### MODE: DRIFT-CHECK');
		const driftCheckSection = prompt.substring(driftCheckStart);

		// Check for advisory only statement
		expect(driftCheckSection).toContain('Advisory only');
		expect(driftCheckSection).toContain('does NOT block phase transitions');
	});

	it('10. READ-ONLY constraint present', () => {
		const driftCheckStart = prompt.indexOf('### MODE: DRIFT-CHECK');
		const driftCheckSection = prompt.substring(driftCheckStart);

		// Check for READ-ONLY rule
		expect(driftCheckSection).toContain('READ-ONLY');
		expect(driftCheckSection).toContain('do not create, modify, or delete any file');
	});

	it('11. Spec.md missing edge case handled', () => {
		const driftCheckStart = prompt.indexOf('### MODE: DRIFT-CHECK');
		const driftCheckSection = prompt.substring(driftCheckStart);

		// Check for spec.md missing handling
		expect(driftCheckSection).toContain('spec.md missing');
		expect(driftCheckSection).toContain('report missing and stop');
	});

	it('12. Invalid phase number edge case handled', () => {
		const driftCheckStart = prompt.indexOf('### MODE: DRIFT-CHECK');
		const driftCheckSection = prompt.substring(driftCheckStart);

		// Check for invalid phase number handling
		expect(driftCheckSection).toContain('Invalid phase number');
		expect(driftCheckSection).toContain('no tasks found for phase N');
	});

	it('13. Steps include extracting completed tasks for phases 1→N', () => {
		const driftCheckStart = prompt.indexOf('### MODE: DRIFT-CHECK');
		const driftCheckEnd = prompt.indexOf('OUTPUT FORMAT:', driftCheckStart);
		const driftCheckSection = prompt.substring(driftCheckStart, driftCheckEnd);

		// Check Step 2 for trajectory-level task extraction
		expect(driftCheckSection).toContain('Read plan.md. Extract all tasks marked complete');
		expect(driftCheckSection).toContain('Phases 1→N');
	});

	it('14. Drift types classified correctly', () => {
		const driftCheckStart = prompt.indexOf('### MODE: DRIFT-CHECK');
		const driftCheckEnd = prompt.indexOf('OUTPUT FORMAT:', driftCheckStart);
		const driftCheckSection = prompt.substring(driftCheckStart, driftCheckEnd);

		// Check for scope additions, omissions, and assumption changes
		expect(driftCheckSection).toContain('Scope additions');
		expect(driftCheckSection).toContain('Scope omissions');
		expect(driftCheckSection).toContain('Assumption changes');
	});
});

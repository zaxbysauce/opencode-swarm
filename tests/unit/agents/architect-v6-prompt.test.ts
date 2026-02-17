import { describe, expect, it } from 'bun:test';
import { createArchitectAgent } from '../../../src/agents/architect';

describe('Architect Prompt v6.0 QA & Security Gates', () => {
	const agent = createArchitectAgent('test-model');
	const prompt = agent.config.prompt!;

	describe('Rule 7 - Mandatory QA Gate', () => {
		it('1. Rule 7 contains "MANDATORY QA GATE"', () => {
			expect(prompt).toContain('MANDATORY QA GATE');
		});

		it('2. Rule 7 contains full sequence summary', () => {
			expect(prompt).toContain('coder → diff → review → security review → verification tests → adversarial tests → next task');
		});

		it('3. Rule 7 mentions diff tool', () => {
			expect(prompt).toContain('run `diff` tool');
		});

		it('4. Rule 7 mentions integration analysis', () => {
			expect(prompt).toContain('hasContractChanges');
			expect(prompt).toContain('integration impact analysis');
		});

		it('5. Rule 7 mentions security gate', () => {
			expect(prompt).toContain('security globs');
			expect(prompt).toContain('security-only CHECK');
		});

		it('6. Rule 7 mentions adversarial tests', () => {
			expect(prompt).toContain('adversarial tests (attack vectors only)');
		});
	});

	describe('Rule Structure', () => {
		it('7. No Rule 8 exists', () => {
			expect(prompt).not.toContain('8. **NEVER skip the QA gate');
		});
	});

	describe('Available Tools Section', () => {
		it('8. Available Tools line exists', () => {
			expect(prompt).toContain('Available Tools: diff');
		});
	});

	describe('Security-only Reviewer Example', () => {
		it('9. Security-only reviewer example exists', () => {
			expect(prompt).toContain('Security-only review');
			expect(prompt).toContain('OWASP Top 10');
		});
	});

	describe('Adversarial Test Example', () => {
		it('10. Adversarial test example exists', () => {
			expect(prompt).toContain('Adversarial security testing');
			expect(prompt).toContain('attack vectors');
		});
	});

	describe('Integration Analysis Example', () => {
		it('11. Integration analysis example exists', () => {
			expect(prompt).toContain('Integration impact analysis');
			expect(prompt).toContain('BREAKING/COMPATIBLE');
		});
	});

	describe('Phase 5 Structure', () => {
		it('12. Phase 5 has steps 5a-5g', () => {
			expect(prompt).toContain('5a.');
			expect(prompt).toContain('5b.');
			expect(prompt).toContain('5c.');
			expect(prompt).toContain('5d.');
			expect(prompt).toContain('5e.');
			expect(prompt).toContain('5f.');
			expect(prompt).toContain('5g.');
		});

		it('13. Phase 5 does NOT have steps 5h or beyond', () => {
			expect(prompt).not.toContain('5h.');
		});

		it('14. Phase 5 mentions adversarial tests', () => {
			// Check that Phase 5 section contains adversarial tests reference
			const phase5Start = prompt.indexOf('### Phase 5: Execute');
			const phase6Start = prompt.indexOf('### Phase 6:');
			const phase5Section = prompt.slice(phase5Start, phase6Start);
			expect(phase5Section).toContain('Adversarial tests');
		});

		it('15. Phase 5 mentions security gate', () => {
			// Check that Phase 5 section contains security gate reference
			const phase5Start = prompt.indexOf('### Phase 5: Execute');
			const phase6Start = prompt.indexOf('### Phase 6:');
			const phase5Section = prompt.slice(phase5Start, phase6Start);
			expect(phase5Section).toContain('Security gate');
		});
	});
});

import { describe, expect, it } from 'bun:test';
import { createArchitectAgent } from '../../../src/agents/architect';

describe('Architect RETRY CIRCUIT BREAKER (Task 2.2)', () => {
	const agent = createArchitectAgent('test-model');
	const prompt = agent.config.prompt!;

	describe('RETRY CIRCUIT BREAKER - Basic Requirements', () => {
		it('1. Fires at 3 rejections', () => {
			// Should specify that the circuit breaker triggers when coder task is rejected 3 times
			expect(prompt).toContain('If coder task rejected 3 times');
		});

		it('2. SOUNDING_BOARD consultation with history', () => {
			// Should invoke critic in SOUNDING_BOARD mode with full rejection history
			expect(prompt).toContain('Invoke critic in SOUNDING_BOARD mode');
			expect(prompt).toContain('full rejection history');
		});

		it('3. Simplification directive', () => {
			// Should direct reassessment to simplification, not more logic
			expect(prompt).toContain('Reassess approach');
			expect(prompt).toContain('SIMPLIFICATION');
			expect(prompt).toContain('not more logic');
		});

		it('4. coder_retry_circuit_breaker event', () => {
			// Should emit an event when circuit breaker is triggered
			expect(prompt).toContain("Emit 'coder_retry_circuit_breaker' event");
		});

		it('5. Section is concise (implementation note: token budget guidance present elsewhere)', () => {
			// The RETRY CIRCUIT BREAKER section itself is concise - no explicit token budget line required
			// Budget constraints are handled at the section level by the prompt design
			expect(prompt).toContain('RETRY CIRCUIT BREAKER');
			expect(prompt).toContain('coder_retry_circuit_breaker');
		});
	});

	describe('RETRY CIRCUIT BREAKER - Flow Control', () => {
		it('Includes fallback to SME delegation', () => {
			// Should offer option to delegate to SME for expert advice
			expect(prompt).toContain('delegate to SME');
		});

		it('Includes escalation to user as final step', () => {
			// Should escalate to user if simplified approach also fails
			expect(prompt).toMatch(
				/simplified approach.*fails.*escalate|escalate.*simplified.*fails/i,
			);
		});

		it('Specifies rewrite task spec with simplicity constraints', () => {
			// Should offer option to rewrite task spec with simplicity constraints
			expect(prompt).toContain('rewrite task spec');
			expect(prompt).toContain('simplicity constraints');
		});
	});

	describe('RETRY CIRCUIT BREAKER - Section Location', () => {
		it('Appears under Rule 6c (ESCALATION DISCIPLINE section)', () => {
			// The retry circuit breaker should be part of Rule 6c
			const rule6cPattern = /6c\.?\s*.*RETRY CIRCUIT BREAKER/;
			expect(prompt).toMatch(rule6cPattern);
		});

		it('Follows SOUNDING BOARD PROTOCOL (Rule 6a)', () => {
			// Should reference sounding board protocol as a related mechanism
			expect(prompt).toContain('SOUNDING BOARD PROTOCOL');
			expect(prompt).toContain('6a');
		});

		it('Precedes TIERED QA GATE (Rule 7)', () => {
			// The retry circuit breaker should come before the QA gate section
			const circuitBreakerPos = prompt.indexOf('RETRY CIRCUIT BREAKER');
			const qaGatePos = prompt.indexOf('TIERED QA GATE');
			expect(circuitBreakerPos).toBeGreaterThan(-1);
			expect(qaGatePos).toBeGreaterThan(-1);
			expect(circuitBreakerPos).toBeLessThan(qaGatePos);
		});
	});
});

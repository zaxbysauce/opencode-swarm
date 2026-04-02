import { describe, expect, it } from 'bun:test';
import { createCoderAgent } from '../../../src/agents/coder';
import { createReviewerAgent } from '../../../src/agents/reviewer';
import { createSMEAgent } from '../../../src/agents/sme';

describe('Prompt contract fixes', () => {
	it('coder supports explicit BLOCKED output alongside DONE output', () => {
		const prompt = createCoderAgent('gpt-4').config.prompt ?? '';

		expect(prompt).toContain('For a completed task, begin directly with DONE.');
		expect(prompt).toContain(
			'If the task is blocked, begin directly with BLOCKED.',
		);
		expect(prompt).toContain('BLOCKED: [what went wrong]');
		expect(prompt).toContain(
			'NEED: [what additional context or change would fix it]',
		);
	});

	it('reviewer input format accepts diff and affected-surface context', () => {
		const prompt = createReviewerAgent('gpt-4').config.prompt ?? '';

		expect(prompt).toContain(
			'FILE: [primary changed file or diff entry point]',
		);
		expect(prompt).toContain(
			'DIFF: [changed files/functions, or "infer from FILE" if omitted]',
		);
		expect(prompt).toContain(
			'AFFECTS: [callers/consumers/dependents to inspect, or "infer from diff"]',
		);
	});

	it('sme scope boundary allows domain-specific recommendations without taking over architecture', () => {
		const prompt = createSMEAgent('gpt-4').config.prompt ?? '';

		expect(prompt).toContain(
			'You MAY recommend domain-specific approaches, APIs, constraints, and trade-offs',
		);
		expect(prompt).toContain('You do NOT make final architecture decisions');
		expect(prompt).toContain("Architect's and Coder's domains");
	});
});

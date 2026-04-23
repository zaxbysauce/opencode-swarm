import { describe, expect, it } from 'bun:test';
import { createArchitectAgent } from '../../../src/agents/architect';

describe('architect.ts PLAN STATE PROTECTION contract (issue #574)', () => {
	const prompt = createArchitectAgent('test-model').config.prompt;

	it('MUST NOT claim direct structural writes to plan files are allowed', () => {
		expect(prompt).not.toContain(
			'You may write to plan.md/plan.json for STRUCTURAL changes',
		);
	});

	it('MUST route structural changes to save_plan', () => {
		const planStateIndex = prompt.indexOf('PLAN STATE PROTECTION');
		expect(planStateIndex).toBeGreaterThan(-1);
		const planStateSection = prompt.slice(planStateIndex, planStateIndex + 600);
		expect(planStateSection).toContain('save_plan');
	});

	it('MUST state plan files are not directly writable', () => {
		expect(prompt).toContain('NOT DIRECTLY WRITABLE');
	});

	it('MUST explain plan.md is auto-regenerated', () => {
		expect(prompt).toContain('plan.md is auto-regenerated');
	});
});

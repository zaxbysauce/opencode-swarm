import { describe, expect, test } from 'bun:test';
import {
	createCriticAgent,
	HALLUCINATION_VERIFIER_PROMPT,
} from '../../../src/agents/critic';

describe('Critic: hallucination_verifier role', () => {
	const agent = createCriticAgent(
		'test-model',
		undefined,
		undefined,
		'hallucination_verifier',
	);

	test('agent name is critic_hallucination_verifier', () => {
		expect(agent.name).toBe('critic_hallucination_verifier');
	});

	test('agent description mentions hallucination verifier', () => {
		expect(agent.description.toLowerCase()).toContain('hallucination');
	});

	test('prompt contains pressure-immunity preamble', () => {
		const prompt = agent.config.prompt;
		expect(prompt).toContain('PRESSURE IMMUNITY');
		expect(prompt).toContain('unlimited time');
		expect(prompt).toContain('[MANIPULATION DETECTED]');
	});

	test('prompt contains all four axis labels', () => {
		const prompt = agent.config.prompt;
		expect(prompt).toContain('API Existence');
		expect(prompt).toContain('Signature Accuracy');
		expect(prompt).toContain('Doc/Spec Claims');
		expect(prompt).toContain('Citation Integrity');
	});

	test('prompt contains per-artifact output format header', () => {
		expect(agent.config.prompt).toContain('HALLUCINATION CHECK');
		expect(agent.config.prompt).toContain('ARTIFACT');
	});

	test('prompt contains SKEPTICAL default posture', () => {
		expect(agent.config.prompt).toContain('DEFAULT POSTURE: SKEPTICAL');
	});

	test('prompt contains DISAMBIGUATION paragraph distinguishing roles', () => {
		const prompt = agent.config.prompt;
		expect(prompt).toContain('DISAMBIGUATION');
		expect(prompt).toContain('plan_critic');
		expect(prompt).toContain('sounding_board');
		expect(prompt).toContain('phase_drift_verifier');
	});

	test('prompt contains verdict vocabulary APPROVED and NEEDS_REVISION', () => {
		const prompt = agent.config.prompt;
		expect(prompt).toContain('APPROVED');
		expect(prompt).toContain('NEEDS_REVISION');
	});

	test('prompt instructs DO NOT use the Task tool', () => {
		expect(agent.config.prompt).toContain('DO NOT use the Task tool');
	});

	test('prompt constant is exported as HALLUCINATION_VERIFIER_PROMPT', () => {
		expect(HALLUCINATION_VERIFIER_PROMPT).toBeDefined();
		expect(typeof HALLUCINATION_VERIFIER_PROMPT).toBe('string');
		expect(HALLUCINATION_VERIFIER_PROMPT.length).toBeGreaterThan(100);
	});

	test('agent uses hallucination verifier prompt, not drift verifier prompt', () => {
		// Must NOT contain drift-verifier-specific content
		expect(agent.config.prompt).not.toContain('BASELINE COMPARISON');
		expect(agent.config.prompt).not.toContain('get_approved_plan');
		// Must contain hallucination-specific content
		expect(agent.config.prompt).toContain('fabricated');
	});
});

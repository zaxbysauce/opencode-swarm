import { describe, expect, test } from 'bun:test';
import { normalizeMemoryAgentRole } from '../../../src/memory/role-profiles';

describe('normalizeMemoryAgentRole', () => {
	describe('curator variants', () => {
		test('curator_postmortem maps to curator', () => {
			expect(normalizeMemoryAgentRole('curator_postmortem')).toBe('curator');
		});

		test('curator_init maps to curator', () => {
			expect(normalizeMemoryAgentRole('curator_init')).toBe('curator');
		});

		test('curator_phase maps to curator', () => {
			expect(normalizeMemoryAgentRole('curator_phase')).toBe('curator');
		});
	});

	describe('base role passthrough', () => {
		test('curator maps to curator', () => {
			expect(normalizeMemoryAgentRole('curator')).toBe('curator');
		});

		test('coder maps to coder', () => {
			expect(normalizeMemoryAgentRole('coder')).toBe('coder');
		});

		test('architect maps to architect', () => {
			expect(normalizeMemoryAgentRole('architect')).toBe('architect');
		});

		test('sme maps to sme', () => {
			expect(normalizeMemoryAgentRole('sme')).toBe('sme');
		});

		test('security maps to security', () => {
			expect(normalizeMemoryAgentRole('security')).toBe('security');
		});

		test('docs maps to sme', () => {
			expect(normalizeMemoryAgentRole('docs')).toBe('sme');
		});
	});

	describe('qa mapping', () => {
		test('reviewer maps to qa', () => {
			expect(normalizeMemoryAgentRole('reviewer')).toBe('qa');
		});

		test('test_engineer maps to qa', () => {
			expect(normalizeMemoryAgentRole('test_engineer')).toBe('qa');
		});
	});

	describe('security mapping', () => {
		test('critic maps to security', () => {
			expect(normalizeMemoryAgentRole('critic')).toBe('security');
		});

		test('critic_sounding_board maps to security', () => {
			expect(normalizeMemoryAgentRole('critic_sounding_board')).toBe(
				'security',
			);
		});

		test('critic_drift_verifier maps to security', () => {
			expect(normalizeMemoryAgentRole('critic_drift_verifier')).toBe(
				'security',
			);
		});

		test('critic_hallucination_verifier maps to security', () => {
			expect(normalizeMemoryAgentRole('critic_hallucination_verifier')).toBe(
				'security',
			);
		});

		test('critic_architecture_supervisor maps to security', () => {
			expect(normalizeMemoryAgentRole('critic_architecture_supervisor')).toBe(
				'security',
			);
		});
	});

	describe('swarm-prefixed variants', () => {
		test('swarm_coder maps to coder', () => {
			expect(normalizeMemoryAgentRole('swarm_coder')).toBe('coder');
		});

		test('swarm_architect maps to architect', () => {
			expect(normalizeMemoryAgentRole('swarm_architect')).toBe('architect');
		});

		test('swarm_reviewer maps to qa', () => {
			expect(normalizeMemoryAgentRole('swarm_reviewer')).toBe('qa');
		});

		test('swarm_critic maps to security', () => {
			expect(normalizeMemoryAgentRole('swarm_critic')).toBe('security');
		});

		test('swarm_curator_postmortem maps to curator', () => {
			expect(normalizeMemoryAgentRole('swarm_curator_postmortem')).toBe(
				'curator',
			);
		});
	});

	describe('default fallback', () => {
		test('unknown role falls back to coder', () => {
			expect(normalizeMemoryAgentRole('unknown_agent')).toBe('coder');
		});

		test('undefined defaults to architect', () => {
			expect(normalizeMemoryAgentRole(undefined)).toBe('architect');
		});
	});
});

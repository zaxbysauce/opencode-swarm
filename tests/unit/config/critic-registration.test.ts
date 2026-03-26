import { describe, expect, test } from 'bun:test';
import {
	AGENT_TOOL_MAP,
	ALL_AGENT_NAMES,
	ALL_SUBAGENT_NAMES,
	DEFAULT_MODELS,
	QA_AGENTS,
} from '../../../src/config/constants';
import type { CriticRole } from '../../../src/agents/critic';

describe('Three Critic Agent Registration', () => {
	describe('QA_AGENTS includes critic_drift_verifier', () => {
		test('critic_drift_verifier is in QA_AGENTS', () => {
			expect(QA_AGENTS).toContain('critic_drift_verifier');
		});

		test('critic is also in QA_AGENTS', () => {
			expect(QA_AGENTS).toContain('critic');
		});

		test('QA_AGENTS has exactly 3 members', () => {
			expect(QA_AGENTS).toHaveLength(3);
		});
	});

	describe('ALL_SUBAGENT_NAMES includes critic_sounding_board', () => {
		test('critic_sounding_board is in ALL_SUBAGENT_NAMES', () => {
			expect(ALL_SUBAGENT_NAMES).toContain('critic_sounding_board');
		});

		test('critic_sounding_board appears before QA_AGENTS spread', () => {
			const index = ALL_SUBAGENT_NAMES.indexOf('critic_sounding_board');
			const reviewerIndex = ALL_SUBAGENT_NAMES.indexOf('reviewer');
			expect(index).toBeLessThan(reviewerIndex);
		});
	});

	describe('ALL_AGENT_NAMES includes both new critic variants', () => {
		test('critic_sounding_board is in ALL_AGENT_NAMES', () => {
			expect(ALL_AGENT_NAMES).toContain('critic_sounding_board');
		});

		test('critic_drift_verifier is in ALL_AGENT_NAMES', () => {
			expect(ALL_AGENT_NAMES).toContain('critic_drift_verifier');
		});

		test('critic is in ALL_AGENT_NAMES', () => {
			expect(ALL_AGENT_NAMES).toContain('critic');
		});

		test('architect is first in ALL_AGENT_NAMES', () => {
			expect(ALL_AGENT_NAMES[0]).toBe('architect');
		});
	});

	describe('AGENT_TOOL_MAP has entries for all three critics', () => {
		test('critic has AGENT_TOOL_MAP entry', () => {
			expect(AGENT_TOOL_MAP).toHaveProperty('critic');
		});

		test('critic_sounding_board has AGENT_TOOL_MAP entry', () => {
			expect(AGENT_TOOL_MAP).toHaveProperty('critic_sounding_board');
		});

		test('critic_drift_verifier has AGENT_TOOL_MAP entry', () => {
			expect(AGENT_TOOL_MAP).toHaveProperty('critic_drift_verifier');
		});
	});

	describe('Tool lists for critic_sounding_board and critic_drift_verifier match critic', () => {
		const criticTools = AGENT_TOOL_MAP.critic;
		const criticSoundingBoardTools = AGENT_TOOL_MAP.critic_sounding_board;
		const criticDriftVerifierTools = AGENT_TOOL_MAP.critic_drift_verifier;

		test('critic_sounding_board has same tool count as critic', () => {
			expect(criticSoundingBoardTools).toHaveLength(criticTools.length);
		});

		test('critic_drift_verifier has one extra tool compared to critic', () => {
			expect(criticDriftVerifierTools).toHaveLength(criticTools.length + 1);
		});

		test('critic_drift_verifier has all critic tools plus completion_verify', () => {
			for (const tool of criticTools) {
				expect(criticDriftVerifierTools).toContain(tool);
			}
			expect(criticDriftVerifierTools).toContain('completion_verify');
		});

		test('only critic_drift_verifier has completion_verify', () => {
			expect(criticTools).not.toContain('completion_verify');
			expect(criticSoundingBoardTools).not.toContain('completion_verify');
			expect(criticDriftVerifierTools).toContain('completion_verify');
		});

		test('all critic variants have complexity_hotspots', () => {
			expect(criticTools).toContain('complexity_hotspots');
			expect(criticSoundingBoardTools).toContain('complexity_hotspots');
			expect(criticDriftVerifierTools).toContain('complexity_hotspots');
		});

		test('all critic variants have detect_domains', () => {
			expect(criticTools).toContain('detect_domains');
			expect(criticSoundingBoardTools).toContain('detect_domains');
			expect(criticDriftVerifierTools).toContain('detect_domains');
		});

		test('all critic variants have imports', () => {
			expect(criticTools).toContain('imports');
			expect(criticSoundingBoardTools).toContain('imports');
			expect(criticDriftVerifierTools).toContain('imports');
		});

		test('all critic variants have retrieve_summary', () => {
			expect(criticTools).toContain('retrieve_summary');
			expect(criticSoundingBoardTools).toContain('retrieve_summary');
			expect(criticDriftVerifierTools).toContain('retrieve_summary');
		});

		test('all critic variants have symbols', () => {
			expect(criticTools).toContain('symbols');
			expect(criticSoundingBoardTools).toContain('symbols');
			expect(criticDriftVerifierTools).toContain('symbols');
		});
	});

	describe('DEFAULT_MODELS has entries for new critic variants', () => {
		test('critic_sounding_board has DEFAULT_MODELS entry', () => {
			expect(DEFAULT_MODELS).toHaveProperty('critic_sounding_board');
		});

		test('critic_drift_verifier has DEFAULT_MODELS entry', () => {
			expect(DEFAULT_MODELS).toHaveProperty('critic_drift_verifier');
		});

		test('critic_sounding_board uses trinity-large-preview-free model', () => {
			expect(DEFAULT_MODELS.critic_sounding_board).toBe(
				'opencode/trinity-large-preview-free',
			);
		});

		test('critic_drift_verifier uses trinity-large-preview-free model', () => {
			expect(DEFAULT_MODELS.critic_drift_verifier).toBe(
				'opencode/trinity-large-preview-free',
			);
		});

		test('critic_sounding_board and critic_drift_verifier have same model', () => {
			expect(DEFAULT_MODELS.critic_sounding_board).toBe(
				DEFAULT_MODELS.critic_drift_verifier,
			);
		});
	});

	describe('CriticRole type is properly exported from critic module', () => {
		test('CriticRole type can be imported', () => {
			// This test verifies the import works - if it compiles, the type exists
			const role: CriticRole = 'plan_critic';
			expect(role).toBe('plan_critic');
		});

		test('CriticRole supports all three critic roles', () => {
			const planCritic: CriticRole = 'plan_critic';
			const soundingBoard: CriticRole = 'sounding_board';
			const phaseDriftVerifier: CriticRole = 'phase_drift_verifier';

			expect(planCritic).toBe('plan_critic');
			expect(soundingBoard).toBe('sounding_board');
			expect(phaseDriftVerifier).toBe('phase_drift_verifier');
		});
	});
});

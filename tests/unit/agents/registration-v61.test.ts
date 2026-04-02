/**
 * Tests for v6.1 agent registration constants
 * Verifies that docs and designer agents are properly registered
 */
import { describe, expect, test } from 'bun:test';
import {
	ALL_AGENT_NAMES,
	ALL_SUBAGENT_NAMES,
	DEFAULT_MODELS,
	PIPELINE_AGENTS,
} from '../../../src/config/constants';

describe('v6.1 Agent Registration Constants', () => {
	describe('ALL_SUBAGENT_NAMES', () => {
		test('"docs" is in ALL_SUBAGENT_NAMES', () => {
			expect(ALL_SUBAGENT_NAMES).toContain('docs');
		});

		test('"designer" is in ALL_SUBAGENT_NAMES', () => {
			expect(ALL_SUBAGENT_NAMES).toContain('designer');
		});
	});

	describe('ALL_AGENT_NAMES', () => {
		test('"docs" is in ALL_AGENT_NAMES', () => {
			expect(ALL_AGENT_NAMES).toContain('docs');
		});

		test('"designer" is in ALL_AGENT_NAMES', () => {
			expect(ALL_AGENT_NAMES).toContain('designer');
		});

		test('"architect" is in ALL_AGENT_NAMES', () => {
			expect(ALL_AGENT_NAMES).toContain('architect');
		});
	});

	describe('PIPELINE_AGENTS', () => {
		test('PIPELINE_AGENTS does NOT contain "docs"', () => {
			expect(PIPELINE_AGENTS).not.toContain('docs');
		});

		test('PIPELINE_AGENTS does NOT contain "designer"', () => {
			expect(PIPELINE_AGENTS).not.toContain('designer');
		});

		test('PIPELINE_AGENTS contains expected pipeline agents', () => {
			expect(PIPELINE_AGENTS).toContain('explorer');
			expect(PIPELINE_AGENTS).toContain('coder');
			expect(PIPELINE_AGENTS).toContain('test_engineer');
		});
	});

	describe('DEFAULT_MODELS', () => {
		test('DEFAULT_MODELS has "docs" key with "opencode/trinity-large-preview-free"', () => {
			expect(DEFAULT_MODELS.docs).toBe('opencode/trinity-large-preview-free');
		});

		test('DEFAULT_MODELS has "designer" key with "opencode/trinity-large-preview-free"', () => {
			expect(DEFAULT_MODELS.designer).toBe(
				'opencode/trinity-large-preview-free',
			);
		});

		test('DEFAULT_MODELS does NOT have "architect" key (inherits OpenCode UI selection)', () => {
			expect(DEFAULT_MODELS).not.toHaveProperty('architect');
		});

		test('DEFAULT_MODELS has "default" fallback key', () => {
			expect(DEFAULT_MODELS.default).toBeDefined();
		});
	});
});

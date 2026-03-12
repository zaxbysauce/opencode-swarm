import { describe, expect, it } from 'bun:test';
import { createArchitectAgent } from '../../../src/agents/architect';

/**
 * Task 6.3: Focused tests for adversarial testing checklist output
 * 
 * Verifies:
 * - disabled: checklist shows SKIPPED — disabled by config
 * - security-only: checklist allows PASS / FAIL / SKIP — not security-sensitive
 * - all/default: checklist allows PASS / FAIL
 */

describe('Task 6.3: Adversarial testing checklist behavior', () => {
	
	describe('Checklist output for disabled adversarial testing', () => {
		it('enabled=false shows SKIPPED — disabled by config in checklist', () => {
			const agent = createArchitectAgent(
				'test-model',
				undefined,
				undefined,
				{ enabled: false, scope: 'all' }
			);
			const prompt = agent.config.prompt!;
			
			// Checklist should show SKIPPED — disabled by config
			expect(prompt).toContain('test_engineer-adversarial: SKIPPED — disabled by config — value: ___');
		});

		it('enabled=false removes step 5m entirely', () => {
			const agent = createArchitectAgent(
				'test-model',
				undefined,
				undefined,
				{ enabled: false, scope: 'all' }
			);
			const prompt = agent.config.prompt!;
			
			// Step 5m should be removed
			expect(prompt).not.toContain('{{ADVERSARIAL_TEST_STEP}}');
			expect(prompt).not.toContain('5m. {{AGENT_PREFIX}}test_engineer');
		});
	});

	describe('Checklist output for security-only scope', () => {
		it('scope=security-only shows PASS / FAIL / SKIP — not security-sensitive', () => {
			const agent = createArchitectAgent(
				'test-model',
				undefined,
				undefined,
				{ enabled: true, scope: 'security-only' }
			);
			const prompt = agent.config.prompt!;
			
			// Checklist should show all three options with security-sensitive qualifier
			expect(prompt).toContain('test_engineer-adversarial: PASS / FAIL / SKIP — not security-sensitive — value: ___');
		});

		it('scope=security-only includes conditional step 5m', () => {
			const agent = createArchitectAgent(
				'test-model',
				undefined,
				undefined,
				{ enabled: true, scope: 'security-only' }
			);
			const prompt = agent.config.prompt!;
			
			// Step should be present with conditional language
			expect(prompt).toContain('5m. {{AGENT_PREFIX}}test_engineer - Adversarial tests (conditional: security-sensitive only)');
			expect(prompt).toContain('If NOT security-sensitive → SKIP this step');
		});
	});

	describe('Checklist output for default (all) scope', () => {
		it('scope=all shows PASS / FAIL without security qualifiers', () => {
			const agent = createArchitectAgent(
				'test-model',
				undefined,
				undefined,
				{ enabled: true, scope: 'all' }
			);
			const prompt = agent.config.prompt!;
			
			// Checklist should show PASS / FAIL (no SKIP option for default)
			expect(prompt).toContain('test_engineer-adversarial: PASS / FAIL — value: ___');
			// Should NOT contain security-sensitive qualifier
			expect(prompt).not.toContain('SKIP — not security-sensitive');
		});

		it('scope=all includes unconditional step 5m', () => {
			const agent = createArchitectAgent(
				'test-model',
				undefined,
				undefined,
				{ enabled: true, scope: 'all' }
			);
			const prompt = agent.config.prompt!;
			
			// Step should be present as unconditional
			expect(prompt).toContain('5m. {{AGENT_PREFIX}}test_engineer - Adversarial tests. FAIL');
			expect(prompt).not.toContain('(conditional: security-sensitive only)');
		});
	});

	describe('Default behavior when no config provided', () => {
		it('defaults to enabled=true, scope=all', () => {
			const agent = createArchitectAgent('test-model');
			const prompt = agent.config.prompt!;
			
			// Should behave like enabled=true, scope='all'
			expect(prompt).toContain('test_engineer-adversarial: PASS / FAIL — value: ___');
			expect(prompt).not.toContain('SKIPPED — disabled by config');
			expect(prompt).not.toContain('SKIP — not security-sensitive');
		});
	});

	describe('Stale expectation corrections', () => {
		// These test cases verify the CORRECT implementation matches task 6.2 spec
		// and correct previously stale expectations in other test files

		it('security-only checklist format matches spec: PASS / FAIL / SKIP — not security-sensitive', () => {
			const agent = createArchitectAgent(
				'test-model',
				undefined,
				undefined,
				{ enabled: true, scope: 'security-only' }
			);
			const prompt = agent.config.prompt!;
			
			// Correct format: includes FAIL, not just PASS/SKIP
			expect(prompt).toMatch(/test_engineer-adversarial: PASS \/ FAIL \/ SKIP — not security-sensitive/);
		});

		it('default/all checklist format matches spec: PASS / FAIL', () => {
			const agent = createArchitectAgent(
				'test-model',
				undefined,
				undefined,
				{ enabled: true, scope: 'all' }
			);
			const prompt = agent.config.prompt!;
			
			// Correct format: only PASS / FAIL, no SKIP option
			expect(prompt).toMatch(/test_engineer-adversarial: PASS \/ FAIL — value: ___/);
		});

		it('disabled checklist format matches spec: SKIPPED — disabled by config', () => {
			const agent = createArchitectAgent(
				'test-model',
				undefined,
				undefined,
				{ enabled: false, scope: 'all' }
			);
			const prompt = agent.config.prompt!;
			
			// Correct format: includes "disabled by config"
			expect(prompt).toMatch(/test_engineer-adversarial: SKIPPED — disabled by config/);
		});
	});
});

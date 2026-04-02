import { describe, expect, it } from 'bun:test';
import { createArchitectAgent } from '../../../src/agents/architect';

describe('Task 6.2: Conditional adversarial-step changes', () => {
	// Acceptance Criteria 1: enabled=false omits step 5m and marks checklist SKIPPED by config
	it('enabled=false omits step 5m and marks checklist SKIPPED', () => {
		const agent = createArchitectAgent('test-model', undefined, undefined, {
			enabled: false,
			scope: 'all',
		});
		const prompt = agent.config.prompt!;

		// Step 5m should be removed entirely
		expect(prompt).not.toContain('{{ADVERSARIAL_TEST_STEP}}');
		expect(prompt).not.toContain('5m. {{AGENT_PREFIX}}test_engineer');

		// Checklist should show SKIPPED
		expect(prompt).toContain(
			'test_engineer-adversarial: SKIPPED — disabled by config',
		);
	});

	// Acceptance Criteria 2: scope='security-only' conditionally includes step 5m
	it('scope=security-only makes step 5m conditional for security-sensitive work', () => {
		const agent = createArchitectAgent('test-model', undefined, undefined, {
			enabled: true,
			scope: 'security-only',
		});
		const prompt = agent.config.prompt!;

		// Step should be present with conditional language
		expect(prompt).toContain(
			'5m. {{AGENT_PREFIX}}test_engineer - Adversarial tests (conditional: security-sensitive only)',
		);
		expect(prompt).toContain('If change matches TIER 3 criteria');
		expect(prompt).toContain('If NOT security-sensitive → SKIP this step');

		// Checklist should show conditional PASS/FAIL/SKIP with explanation
		expect(prompt).toContain(
			'test_engineer-adversarial: PASS / FAIL / SKIP — not security-sensitive',
		);
	});

	// Acceptance Criteria 3: enabled=true, scope='all' preserves current behavior (default)
	it('enabled=true, scope=all preserves current behavior (default)', () => {
		const agent = createArchitectAgent('test-model', undefined, undefined, {
			enabled: true,
			scope: 'all',
		});
		const prompt = agent.config.prompt!;

		// Step should be present as unconditional
		expect(prompt).toContain(
			'5m. {{AGENT_PREFIX}}test_engineer - Adversarial tests. FAIL',
		);
		expect(prompt).not.toContain('(conditional: security-sensitive only)');

		// Checklist should show unconditional PASS/FAIL
		expect(prompt).toContain(
			'test_engineer-adversarial: PASS / FAIL — value: ___',
		);
	});

	// Default behavior: no config provided should default to enabled=true, scope='all'
	it('defaults to enabled=true, scope=all when no config provided', () => {
		const agent = createArchitectAgent('test-model');
		const prompt = agent.config.prompt!;

		// Should behave like enabled=true, scope='all'
		expect(prompt).toContain(
			'5m. {{AGENT_PREFIX}}test_engineer - Adversarial tests. FAIL',
		);
		expect(prompt).not.toContain('(conditional: security-sensitive only)');
		expect(prompt).not.toContain('SKIPPED — disabled by config');
	});

	// Verify interface is exported correctly
	it('AdversarialTestingConfig interface is exported', () => {
		// This is a compile-time check - if the interface wasn't exported,
		// the import at the top would fail
		const config: import('../../../src/agents/architect').AdversarialTestingConfig =
			{
				enabled: true,
				scope: 'security-only',
			};
		expect(config.enabled).toBe(true);
		expect(config.scope).toBe('security-only');
	});
});

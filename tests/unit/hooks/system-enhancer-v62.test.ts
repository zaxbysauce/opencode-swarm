/**
 * Tests for v6.2 system-enhancer hint injection features:
 * - Lint gate opt-out hint injection (lint.enabled = false)
 * - Secretscan gate opt-out hint injection (secretscan.enabled = false)
 * Tests BOTH legacy path (scoring disabled) and scoring path (scoring enabled)
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createSystemEnhancerHook } from '../../../src/hooks/system-enhancer';
import { resetSwarmState } from '../../../src/state';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('v6.2 System Enhancer Hint Injection (lint + secretscan)', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'swarm-v62-test-'));
		resetSwarmState();
	});

	afterEach(async () => {
		try {
			await rm(tempDir, { recursive: true, force: true });
		} catch (error) {
			// Ignore cleanup errors
		}
	});

	/**
	 * Helper to create minimal .swarm directory with plan.md and context.md
	 */
	async function createSwarmFiles(): Promise<void> {
		const swarmDir = join(tempDir, '.swarm');
		await mkdir(swarmDir, { recursive: true });

		// Create minimal plan.md
		await writeFile(join(swarmDir, 'plan.md'), '# Plan\n');

		// Create minimal context.md
		await writeFile(join(swarmDir, 'context.md'), '# Context\n');
	}

	/**
	 * Helper to invoke the transform hook and return the output
	 */
	async function invokeHook(config: Parameters<typeof createSystemEnhancerHook>[0]): Promise<string[]> {
		const hooks = createSystemEnhancerHook(config, tempDir);
		const transform = hooks['experimental.chat.system.transform'] as (
			input: { sessionID?: string },
			output: { system: string[] },
		) => Promise<void>;

		const input = { sessionID: 'test-session' };
		const output = { system: ['Initial system prompt'] };

		await transform(input, output);

		return output.system;
	}

	const defaultConfig = {
		max_iterations: 5,
		qa_retry_limit: 3,
		inject_phase_reminders: true,
	};

	// ============================================
	// LEGACY PATH TESTS (scoring disabled)
	// ============================================

	describe('Legacy Path: lint gate opt-out hint injection', () => {
		it('lint.enabled=false → system output includes "[SWARM CONFIG] Lint gate is DISABLED" (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: {
					enabled: false,
					mode: 'check' as const,
					linter: 'auto' as const,
					patterns: ['**/*.ts'],
					exclude: [],
				},
			} as Parameters<typeof createSystemEnhancerHook>[0];

			const systemOutput = await invokeHook(config);

			// Should contain lint disabled hint
			const hasLintHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] Lint gate is DISABLED'),
			);
			expect(hasLintHint).toBe(true);
		});

		it('lint.enabled=true (explicit) → system output does NOT include lint-disabled hint (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: {
					enabled: true,
					mode: 'check' as const,
					linter: 'auto' as const,
					patterns: ['**/*.ts'],
					exclude: [],
				},
			} as Parameters<typeof createSystemEnhancerHook>[0];

			const systemOutput = await invokeHook(config);

			// Should NOT contain lint disabled hint
			const hasLintHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] Lint gate is DISABLED'),
			);
			expect(hasLintHint).toBe(false);
		});

		it('no lint config → system output does NOT include lint-disabled hint (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
			} as Parameters<typeof createSystemEnhancerHook>[0];

			const systemOutput = await invokeHook(config);

			// Should NOT contain lint disabled hint
			const hasLintHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] Lint gate is DISABLED'),
			);
			expect(hasLintHint).toBe(false);
		});

		it('injects correct lint disabled hint text with QA sequence reference (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: {
					enabled: false,
					mode: 'check' as const,
					linter: 'auto' as const,
					patterns: ['**/*.ts'],
					exclude: [],
				},
			} as Parameters<typeof createSystemEnhancerHook>[0];

			const systemOutput = await invokeHook(config);

			const expectedText =
				'[SWARM CONFIG] Lint gate is DISABLED. Skip lint check/fix in QA sequence.';
			const hasExactText = systemOutput.includes(expectedText);
			expect(hasExactText).toBe(true);
		});
	});

	describe('Legacy Path: secretscan gate opt-out hint injection', () => {
		it('secretscan.enabled=false → system output includes "[SWARM CONFIG] Secretscan gate is DISABLED" (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				secretscan: {
					enabled: false,
					patterns: [],
					exclude: [],
					extensions: [],
				},
			} as Parameters<typeof createSystemEnhancerHook>[0];

			const systemOutput = await invokeHook(config);

			// Should contain secretscan disabled hint
			const hasSecretscanHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] Secretscan gate is DISABLED'),
			);
			expect(hasSecretscanHint).toBe(true);
		});

		it('secretscan.enabled=true (explicit) → system output does NOT include secretscan-disabled hint (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				secretscan: {
					enabled: true,
					patterns: [],
					exclude: [],
					extensions: [],
				},
			} as Parameters<typeof createSystemEnhancerHook>[0];

			const systemOutput = await invokeHook(config);

			// Should NOT contain secretscan disabled hint
			const hasSecretscanHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] Secretscan gate is DISABLED'),
			);
			expect(hasSecretscanHint).toBe(false);
		});

		it('no secretscan config → system output does NOT include secretscan-disabled hint (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
			} as Parameters<typeof createSystemEnhancerHook>[0];

			const systemOutput = await invokeHook(config);

			// Should NOT contain secretscan disabled hint
			const hasSecretscanHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] Secretscan gate is DISABLED'),
			);
			expect(hasSecretscanHint).toBe(false);
		});

		it('injects correct secretscan disabled hint text with QA sequence reference (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				secretscan: {
					enabled: false,
					patterns: [],
					exclude: [],
					extensions: [],
				},
			} as Parameters<typeof createSystemEnhancerHook>[0];

			const systemOutput = await invokeHook(config);

			const expectedText =
				'[SWARM CONFIG] Secretscan gate is DISABLED. Skip secretscan in QA sequence.';
			const hasExactText = systemOutput.includes(expectedText);
			expect(hasExactText).toBe(true);
		});
	});

	// ============================================
	// SCORING PATH TESTS (scoring enabled)
	// ============================================

	describe('Scoring Path: lint gate opt-out hint injection', () => {
		it('lint.enabled=false + scoring enabled → system output includes lint disabled hint (scoring)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: {
					enabled: false,
					mode: 'check' as const,
					linter: 'auto' as const,
					patterns: ['**/*.ts'],
					exclude: [],
				},
				context_budget: {
					enabled: true,
					warn_threshold: 0.7,
					critical_threshold: 0.9,
					model_limits: { default: 128000 },
					max_injection_tokens: 4000,
					scoring: {
						enabled: true,
						max_candidates: 10,
					},
				},
			} as Parameters<typeof createSystemEnhancerHook>[0];

			const systemOutput = await invokeHook(config);

			// Should contain lint disabled hint
			const hasLintHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] Lint gate is DISABLED'),
			);
			expect(hasLintHint).toBe(true);
		});

		it('lint.enabled=true + scoring enabled → system output does NOT include lint-disabled hint (scoring)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: {
					enabled: true,
					mode: 'check' as const,
					linter: 'auto' as const,
					patterns: ['**/*.ts'],
					exclude: [],
				},
				context_budget: {
					enabled: true,
					warn_threshold: 0.7,
					critical_threshold: 0.9,
					model_limits: { default: 128000 },
					max_injection_tokens: 4000,
					scoring: {
						enabled: true,
						max_candidates: 10,
					},
				},
			} as Parameters<typeof createSystemEnhancerHook>[0];

			const systemOutput = await invokeHook(config);

			// Should NOT contain lint disabled hint
			const hasLintHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] Lint gate is DISABLED'),
			);
			expect(hasLintHint).toBe(false);
		});

		it('no lint config + scoring enabled → system output does NOT include lint-disabled hint (scoring)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				context_budget: {
					enabled: true,
					warn_threshold: 0.7,
					critical_threshold: 0.9,
					model_limits: { default: 128000 },
					max_injection_tokens: 4000,
					scoring: {
						enabled: true,
						max_candidates: 10,
					},
				},
			} as Parameters<typeof createSystemEnhancerHook>[0];

			const systemOutput = await invokeHook(config);

			// Should NOT contain lint disabled hint
			const hasLintHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] Lint gate is DISABLED'),
			);
			expect(hasLintHint).toBe(false);
		});
	});

	describe('Scoring Path: secretscan gate opt-out hint injection', () => {
		it('secretscan.enabled=false + scoring enabled → system output includes secretscan disabled hint (scoring)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				secretscan: {
					enabled: false,
					patterns: [],
					exclude: [],
					extensions: [],
				},
				context_budget: {
					enabled: true,
					warn_threshold: 0.7,
					critical_threshold: 0.9,
					model_limits: { default: 128000 },
					max_injection_tokens: 4000,
					scoring: {
						enabled: true,
						max_candidates: 10,
					},
				},
			} as Parameters<typeof createSystemEnhancerHook>[0];

			const systemOutput = await invokeHook(config);

			// Should contain secretscan disabled hint
			const hasSecretscanHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] Secretscan gate is DISABLED'),
			);
			expect(hasSecretscanHint).toBe(true);
		});

		it('secretscan.enabled=true + scoring enabled → system output does NOT include secretscan-disabled hint (scoring)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				secretscan: {
					enabled: true,
					patterns: [],
					exclude: [],
					extensions: [],
				},
				context_budget: {
					enabled: true,
					warn_threshold: 0.7,
					critical_threshold: 0.9,
					model_limits: { default: 128000 },
					max_injection_tokens: 4000,
					scoring: {
						enabled: true,
						max_candidates: 10,
					},
				},
			} as Parameters<typeof createSystemEnhancerHook>[0];

			const systemOutput = await invokeHook(config);

			// Should NOT contain secretscan disabled hint
			const hasSecretscanHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] Secretscan gate is DISABLED'),
			);
			expect(hasSecretscanHint).toBe(false);
		});

		it('no secretscan config + scoring enabled → system output does NOT include secretscan-disabled hint (scoring)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				context_budget: {
					enabled: true,
					warn_threshold: 0.7,
					critical_threshold: 0.9,
					model_limits: { default: 128000 },
					max_injection_tokens: 4000,
					scoring: {
						enabled: true,
						max_candidates: 10,
					},
				},
			} as Parameters<typeof createSystemEnhancerHook>[0];

			const systemOutput = await invokeHook(config);

			// Should NOT contain secretscan disabled hint
			const hasSecretscanHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] Secretscan gate is DISABLED'),
			);
			expect(hasSecretscanHint).toBe(false);
		});
	});

	// ============================================
	// COMBINED TESTS (both lint + secretscan disabled)
	// ============================================

	describe('Combined lint + secretscan disabled hints', () => {
		it('BOTH lint and secretscan disabled → system output includes both hints (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: {
					enabled: false,
					mode: 'check' as const,
					linter: 'auto' as const,
					patterns: ['**/*.ts'],
					exclude: [],
				},
				secretscan: {
					enabled: false,
					patterns: [],
					exclude: [],
					extensions: [],
				},
			} as Parameters<typeof createSystemEnhancerHook>[0];

			const systemOutput = await invokeHook(config);

			// Should contain lint disabled hint
			const hasLintHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] Lint gate is DISABLED'),
			);
			expect(hasLintHint).toBe(true);

			// Should contain secretscan disabled hint
			const hasSecretscanHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] Secretscan gate is DISABLED'),
			);
			expect(hasSecretscanHint).toBe(true);
		});

		it('BOTH lint and secretscan disabled + scoring enabled → system output includes both hints (scoring)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: {
					enabled: false,
					mode: 'check' as const,
					linter: 'auto' as const,
					patterns: ['**/*.ts'],
					exclude: [],
				},
				secretscan: {
					enabled: false,
					patterns: [],
					exclude: [],
					extensions: [],
				},
				context_budget: {
					enabled: true,
					warn_threshold: 0.7,
					critical_threshold: 0.9,
					model_limits: { default: 128000 },
					max_injection_tokens: 4000,
					scoring: {
						enabled: true,
						max_candidates: 10,
					},
				},
			} as Parameters<typeof createSystemEnhancerHook>[0];

			const systemOutput = await invokeHook(config);

			// Should contain lint disabled hint
			const hasLintHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] Lint gate is DISABLED'),
			);
			expect(hasLintHint).toBe(true);

			// Should contain secretscan disabled hint
			const hasSecretscanHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] Secretscan gate is DISABLED'),
			);
			expect(hasSecretscanHint).toBe(true);
		});

		it('Default config (both enabled) → system output includes NEITHER hint (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
			} as Parameters<typeof createSystemEnhancerHook>[0];

			const systemOutput = await invokeHook(config);

			// Should NOT contain lint disabled hint
			const hasLintHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] Lint gate is DISABLED'),
			);
			expect(hasLintHint).toBe(false);

			// Should NOT contain secretscan disabled hint
			const hasSecretscanHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] Secretscan gate is DISABLED'),
			);
			expect(hasSecretscanHint).toBe(false);
		});

		it('Default config + scoring enabled → system output includes NEITHER hint (scoring)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				context_budget: {
					enabled: true,
					warn_threshold: 0.7,
					critical_threshold: 0.9,
					model_limits: { default: 128000 },
					max_injection_tokens: 4000,
					scoring: {
						enabled: true,
						max_candidates: 10,
					},
				},
			} as Parameters<typeof createSystemEnhancerHook>[0];

			const systemOutput = await invokeHook(config);

			// Should NOT contain lint disabled hint
			const hasLintHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] Lint gate is DISABLED'),
			);
			expect(hasLintHint).toBe(false);

			// Should NOT contain secretscan disabled hint
			const hasSecretscanHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] Secretscan gate is DISABLED'),
			);
			expect(hasSecretscanHint).toBe(false);
		});
	});

	// ============================================
	// CROSS-PATH COMPATIBILITY TESTS
	// ============================================

	describe('Cross-path compatibility with other v6.x hints', () => {
		it('lint disabled + docs disabled → both hints present (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: {
					enabled: false,
					mode: 'check' as const,
					linter: 'auto' as const,
					patterns: ['**/*.ts'],
					exclude: [],
				},
				docs: {
					enabled: false,
					doc_patterns: [],
				},
			} as Parameters<typeof createSystemEnhancerHook>[0];

			const systemOutput = await invokeHook(config);

			// Should contain lint disabled hint
			const hasLintHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] Lint gate is DISABLED'),
			);
			expect(hasLintHint).toBe(true);

			// Should contain docs disabled hint
			const hasDocsHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] Docs agent is DISABLED'),
			);
			expect(hasDocsHint).toBe(true);
		});

		it('lint disabled + docs disabled + scoring enabled → both hints present (scoring)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: {
					enabled: false,
					mode: 'check' as const,
					linter: 'auto' as const,
					patterns: ['**/*.ts'],
					exclude: [],
				},
				docs: {
					enabled: false,
					doc_patterns: [],
				},
				context_budget: {
					enabled: true,
					warn_threshold: 0.7,
					critical_threshold: 0.9,
					model_limits: { default: 128000 },
					max_injection_tokens: 4000,
					scoring: {
						enabled: true,
						max_candidates: 10,
					},
				},
			} as Parameters<typeof createSystemEnhancerHook>[0];

			const systemOutput = await invokeHook(config);

			// Should contain lint disabled hint
			const hasLintHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] Lint gate is DISABLED'),
			);
			expect(hasLintHint).toBe(true);

			// Should contain docs disabled hint
			const hasDocsHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] Docs agent is DISABLED'),
			);
			expect(hasDocsHint).toBe(true);
		});
	});
});

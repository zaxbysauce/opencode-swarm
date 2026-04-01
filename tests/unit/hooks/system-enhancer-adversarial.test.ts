/**
 * Verification tests for adversarial detection wiring in system-enhancer.ts
 *
 * Tests the same-model adversarial detection that checks if an agent and its checker
 * use the same model, which could compromise review independence.
 *
 * Scenarios covered:
 * 1. Active agent is 'reviewer' and coder+reviewer share same model → warning injected
 * 2. Active agent is 'coder' → no warning (coder is not the checker)
 * 3. Policy is 'ignore' → no warning injected even if same model
 * 4. Policy is 'gate' → warning includes "GATE POLICY:" prefix
 * 5. enabled: false → no warning even if matching pair found
 * 6. Custom pairs [['explorer','reviewer']] with active 'reviewer' → uses custom pairs
 *
 * Tests both Path A (legacy - scoring disabled) and Path B (scoring enabled)
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSystemEnhancerHook } from '../../../src/hooks/system-enhancer';
import { resetSwarmState, swarmState } from '../../../src/state';

describe('system-enhancer: Same-Model Adversarial Detection', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'swarm-adversarial-test-'));
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
	async function invokeHook(
		config: any,
		sessionID = 'test-session',
	): Promise<{ output: string[]; error?: unknown }> {
		try {
			const hooks = createSystemEnhancerHook(config, tempDir);
			const transform = hooks['experimental.chat.system.transform'] as (
				input: { sessionID?: string },
				output: { system: string[] },
			) => Promise<void>;

			const input = { sessionID };
			const output = { system: ['Initial system prompt'] };

			await transform(input, output);

			return { output: output.system };
		} catch (error) {
			return { output: [], error };
		}
	}

	const defaultConfig = {
		max_iterations: 5,
		qa_retry_limit: 3,
		inject_phase_reminders: true,
		hooks: {
			system_enhancer: true,
			compaction: false,
			agent_activity: false,
			delegation_tracker: false,
			agent_awareness_max_chars: 300,
			delegation_gate: true,
			delegation_max_chars: 4000,
		},
	};

	describe('Scenario 1: Active agent is reviewer and coder+reviewer share same model', () => {
		it('injects warning when both use gemini-2.5-flash (default config) - legacy path', async () => {
			await createSwarmFiles();

			// Default models: coder uses claude-sonnet, reviewer uses gemini-2.5-flash
			// We need to override to make them match
			const config = {
				...defaultConfig,
				agents: {
					coder: { model: 'google/gemini-2.5-flash' },
					reviewer: { model: 'google/gemini-2.5-flash' },
				},
			};

			// Set active agent to reviewer (the checker in default pair ['coder', 'reviewer'])
			swarmState.activeAgent.set('test-session', 'reviewer');

			const result = await invokeHook(config);

			expect(result.error).toBeUndefined();

			// Should contain adversarial warning
			const warning = result.output.find((s) =>
				s.includes('Same-model adversarial pair detected'),
			);
			expect(warning).toBeDefined();
			expect(warning).toContain('coder and checker reviewer');
			expect(warning).toContain('google/gemini-2.5-flash');
		});

		it('injects warning when both use claude-sonnet - legacy path', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				agents: {
					coder: { model: 'anthropic/claude-sonnet-4-20250514' },
					reviewer: { model: 'anthropic/claude-sonnet-4-20250514' },
				},
			};

			swarmState.activeAgent.set('test-session', 'reviewer');

			const result = await invokeHook(config);

			expect(result.error).toBeUndefined();

			const warning = result.output.find((s) =>
				s.includes('Same-model adversarial pair detected'),
			);
			expect(warning).toBeDefined();
			expect(warning).toContain('anthropic/claude-sonnet-4-20250514');
		});

		it('injects warning in scoring path when both use same model', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				agents: {
					coder: { model: 'google/gemini-2.5-flash' },
					reviewer: { model: 'google/gemini-2.5-flash' },
				},
				scoring: {
					enabled: true, // Enable scoring path
					max_candidates: 100,
					weights: {
						phase: 1.0,
						current_task: 2.0,
						blocked_task: 1.5,
						recent_failure: 2.5,
						recent_success: 0.5,
						evidence_presence: 1.0,
						decision_recency: 1.5,
						dependency_proximity: 1.0,
					},
				},
			};

			swarmState.activeAgent.set('test-session', 'reviewer');

			const result = await invokeHook(config);

			expect(result.error).toBeUndefined();

			const warning = result.output.find((s) =>
				s.includes('Same-model adversarial pair detected'),
			);
			expect(warning).toBeDefined();
			expect(warning).toContain('google/gemini-2.5-flash');
		});

		it('handles prefixed agent name (local_reviewer)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				agents: {
					coder: { model: 'google/gemini-2.5-flash' },
					reviewer: { model: 'google/gemini-2.5-flash' },
				},
			};

			// Use prefixed name
			swarmState.activeAgent.set('test-session', 'local_reviewer');

			const result = await invokeHook(config);

			expect(result.error).toBeUndefined();

			const warning = result.output.find((s) =>
				s.includes('Same-model adversarial pair detected'),
			);
			expect(warning).toBeDefined();
		});
	});

	describe('Scenario 2: Active agent is coder (not the checker)', () => {
		it('does NOT inject warning when active agent is coder - legacy path', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				agents: {
					coder: { model: 'google/gemini-2.5-flash' },
					reviewer: { model: 'google/gemini-2.5-flash' },
				},
			};

			// Set active agent to coder (NOT the checker in default pair ['coder', 'reviewer'])
			swarmState.activeAgent.set('test-session', 'coder');

			const result = await invokeHook(config);

			expect(result.error).toBeUndefined();

			// Should NOT contain adversarial warning
			const warning = result.output.find((s) =>
				s.includes('Same-model adversarial pair detected'),
			);
			expect(warning).toBeUndefined();
		});

		it('does NOT inject warning when active agent is coder - scoring path', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				agents: {
					coder: { model: 'google/gemini-2.5-flash' },
					reviewer: { model: 'google/gemini-2.5-flash' },
				},
				scoring: {
					enabled: true,
					max_candidates: 100,
					weights: {
						phase: 1.0,
						current_task: 2.0,
						blocked_task: 1.5,
						recent_failure: 2.5,
						recent_success: 0.5,
						evidence_presence: 1.0,
						decision_recency: 1.5,
						dependency_proximity: 1.0,
					},
				},
			};

			swarmState.activeAgent.set('test-session', 'coder');

			const result = await invokeHook(config);

			expect(result.error).toBeUndefined();

			const warning = result.output.find((s) =>
				s.includes('Same-model adversarial pair detected'),
			);
			expect(warning).toBeUndefined();
		});
	});

	describe('Scenario 3: Policy is ignore - no warning even if same model', () => {
		it('does NOT inject warning when policy is ignore - legacy path', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				agents: {
					coder: { model: 'google/gemini-2.5-flash' },
					reviewer: { model: 'google/gemini-2.5-flash' },
				},
				adversarial_detection: {
					enabled: true,
					policy: 'ignore',
					pairs: [['coder', 'reviewer']],
				},
			};

			swarmState.activeAgent.set('test-session', 'reviewer');

			const result = await invokeHook(config);

			expect(result.error).toBeUndefined();

			const warning = result.output.find((s) =>
				s.includes('Same-model adversarial pair detected'),
			);
			expect(warning).toBeUndefined();
		});

		it('does NOT inject warning when policy is ignore - scoring path', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				agents: {
					coder: { model: 'google/gemini-2.5-flash' },
					reviewer: { model: 'google/gemini-2.5-flash' },
				},
				adversarial_detection: {
					enabled: true,
					policy: 'ignore',
					pairs: [['coder', 'reviewer']],
				},
				scoring: {
					enabled: true,
					max_candidates: 100,
					weights: {
						phase: 1.0,
						current_task: 2.0,
						blocked_task: 1.5,
						recent_failure: 2.5,
						recent_success: 0.5,
						evidence_presence: 1.0,
						decision_recency: 1.5,
						dependency_proximity: 1.0,
					},
				},
			};

			swarmState.activeAgent.set('test-session', 'reviewer');

			const result = await invokeHook(config);

			expect(result.error).toBeUndefined();

			const warning = result.output.find((s) =>
				s.includes('Same-model adversarial pair detected'),
			);
			expect(warning).toBeUndefined();
		});
	});

	describe('Scenario 4: Policy is gate - warning includes GATE POLICY prefix', () => {
		it('injects GATE POLICY warning when policy is gate - legacy path', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				agents: {
					coder: { model: 'google/gemini-2.5-flash' },
					reviewer: { model: 'google/gemini-2.5-flash' },
				},
				adversarial_detection: {
					enabled: true,
					policy: 'gate',
					pairs: [['coder', 'reviewer']],
				},
			};

			swarmState.activeAgent.set('test-session', 'reviewer');

			const result = await invokeHook(config);

			expect(result.error).toBeUndefined();

			const warning = result.output.find((s) => s.includes('GATE POLICY'));
			expect(warning).toBeDefined();
			expect(warning).toContain('Same-model adversarial pair detected');
			expect(warning).toContain('escalate if issues are found');
		});

		it('injects GATE POLICY warning when policy is gate - scoring path', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				agents: {
					coder: { model: 'google/gemini-2.5-flash' },
					reviewer: { model: 'google/gemini-2.5-flash' },
				},
				adversarial_detection: {
					enabled: true,
					policy: 'gate',
					pairs: [['coder', 'reviewer']],
				},
				scoring: {
					enabled: true,
					max_candidates: 100,
					weights: {
						phase: 1.0,
						current_task: 2.0,
						blocked_task: 1.5,
						recent_failure: 2.5,
						recent_success: 0.5,
						evidence_presence: 1.0,
						decision_recency: 1.5,
						dependency_proximity: 1.0,
					},
				},
			};

			swarmState.activeAgent.set('test-session', 'reviewer');

			const result = await invokeHook(config);

			expect(result.error).toBeUndefined();

			const warning = result.output.find((s) => s.includes('GATE POLICY'));
			expect(warning).toBeDefined();
			expect(warning).toContain('Same-model adversarial pair detected');
			expect(warning).toContain('escalate if issues are found');
		});

		it('warn policy does NOT include GATE POLICY prefix', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				agents: {
					coder: { model: 'google/gemini-2.5-flash' },
					reviewer: { model: 'google/gemini-2.5-flash' },
				},
				adversarial_detection: {
					enabled: true,
					policy: 'warn',
					pairs: [['coder', 'reviewer']],
				},
			};

			swarmState.activeAgent.set('test-session', 'reviewer');

			const result = await invokeHook(config);

			expect(result.error).toBeUndefined();

			const gateWarning = result.output.find((s) => s.includes('GATE POLICY'));
			expect(gateWarning).toBeUndefined();

			const normalWarning = result.output.find((s) =>
				s.includes('Same-model adversarial pair detected'),
			);
			expect(normalWarning).toBeDefined();
			expect(normalWarning).toContain('Review may lack independence');
		});
	});

	describe('Scenario 5: enabled: false - no warning even if matching pair', () => {
		it('does NOT inject warning when enabled is false - legacy path', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				agents: {
					coder: { model: 'google/gemini-2.5-flash' },
					reviewer: { model: 'google/gemini-2.5-flash' },
				},
				adversarial_detection: {
					enabled: false,
					policy: 'warn',
					pairs: [['coder', 'reviewer']],
				},
			};

			swarmState.activeAgent.set('test-session', 'reviewer');

			const result = await invokeHook(config);

			expect(result.error).toBeUndefined();

			const warning = result.output.find((s) =>
				s.includes('Same-model adversarial pair detected'),
			);
			expect(warning).toBeUndefined();
		});

		it('does NOT inject warning when enabled is false - scoring path', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				agents: {
					coder: { model: 'google/gemini-2.5-flash' },
					reviewer: { model: 'google/gemini-2.5-flash' },
				},
				adversarial_detection: {
					enabled: false,
					policy: 'warn',
					pairs: [['coder', 'reviewer']],
				},
				scoring: {
					enabled: true,
					max_candidates: 100,
					weights: {
						phase: 1.0,
						current_task: 2.0,
						blocked_task: 1.5,
						recent_failure: 2.5,
						recent_success: 0.5,
						evidence_presence: 1.0,
						decision_recency: 1.5,
						dependency_proximity: 1.0,
					},
				},
			};

			swarmState.activeAgent.set('test-session', 'reviewer');

			const result = await invokeHook(config);

			expect(result.error).toBeUndefined();

			const warning = result.output.find((s) =>
				s.includes('Same-model adversarial pair detected'),
			);
			expect(warning).toBeUndefined();
		});

		it('warns when enabled is undefined (defaults to true)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				agents: {
					coder: { model: 'google/gemini-2.5-flash' },
					reviewer: { model: 'google/gemini-2.5-flash' },
				},
				adversarial_detection: {}, // enabled is undefined, should default to enabled
			};

			swarmState.activeAgent.set('test-session', 'reviewer');

			const result = await invokeHook(config);

			expect(result.error).toBeUndefined();

			const warning = result.output.find((s) =>
				s.includes('Same-model adversarial pair detected'),
			);
			expect(warning).toBeDefined();
		});
	});

	describe('Scenario 6: Custom pairs - uses custom pair configuration', () => {
		it('uses custom pairs [["explorer","reviewer"]] when active is reviewer - legacy path', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				agents: {
					explorer: { model: 'google/gemini-2.5-flash' },
					reviewer: { model: 'google/gemini-2.5-flash' },
					coder: { model: 'anthropic/claude-sonnet-4-20250514' }, // Different model, shouldn't match
				},
				adversarial_detection: {
					enabled: true,
					policy: 'warn',
					pairs: [['explorer', 'reviewer']],
				},
			};

			swarmState.activeAgent.set('test-session', 'reviewer');

			const result = await invokeHook(config);

			expect(result.error).toBeUndefined();

			const warning = result.output.find((s) =>
				s.includes('Same-model adversarial pair detected'),
			);
			expect(warning).toBeDefined();
			expect(warning).toContain('explorer and checker reviewer');
			expect(warning).toContain('google/gemini-2.5-flash');
		});

		it('uses custom pairs [["explorer","reviewer"]] when active is reviewer - scoring path', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				agents: {
					explorer: { model: 'google/gemini-2.5-flash' },
					reviewer: { model: 'google/gemini-2.5-flash' },
					coder: { model: 'anthropic/claude-sonnet-4-20250514' },
				},
				adversarial_detection: {
					enabled: true,
					policy: 'warn',
					pairs: [['explorer', 'reviewer']],
				},
				scoring: {
					enabled: true,
					max_candidates: 100,
					weights: {
						phase: 1.0,
						current_task: 2.0,
						blocked_task: 1.5,
						recent_failure: 2.5,
						recent_success: 0.5,
						evidence_presence: 1.0,
						decision_recency: 1.5,
						dependency_proximity: 1.0,
					},
				},
			};

			swarmState.activeAgent.set('test-session', 'reviewer');

			const result = await invokeHook(config);

			expect(result.error).toBeUndefined();

			const warning = result.output.find((s) =>
				s.includes('Same-model adversarial pair detected'),
			);
			expect(warning).toBeDefined();
			expect(warning).toContain('explorer and checker reviewer');
		});

		it('handles multiple custom pairs', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				agents: {
					explorer: { model: 'google/gemini-2.5-flash' },
					reviewer: { model: 'google/gemini-2.5-flash' },
					coder: { model: 'google/gemini-2.5-flash' },
				},
				adversarial_detection: {
					enabled: true,
					policy: 'warn',
					pairs: [
						['explorer', 'reviewer'],
						['coder', 'reviewer'],
					],
				},
			};

			swarmState.activeAgent.set('test-session', 'reviewer');

			const result = await invokeHook(config);

			expect(result.error).toBeUndefined();

			// Should have at least one warning (both pairs match since all use same model)
			const warnings = result.output.filter((s) =>
				s.includes('Same-model adversarial pair detected'),
			);
			expect(warnings.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe('Edge cases and additional scenarios', () => {
		it('no warning when models are different', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				agents: {
					coder: { model: 'anthropic/claude-sonnet-4-20250514' },
					reviewer: { model: 'google/gemini-2.5-flash' },
				},
			};

			swarmState.activeAgent.set('test-session', 'reviewer');

			const result = await invokeHook(config);

			expect(result.error).toBeUndefined();

			const warning = result.output.find((s) =>
				s.includes('Same-model adversarial pair detected'),
			);
			expect(warning).toBeUndefined();
		});

		it('handles case-insensitive model matching', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				agents: {
					coder: { model: 'GOOGLE/GEMINI-2.5-FLASH' }, // Uppercase
					reviewer: { model: 'google/gemini-2.5-flash' }, // Lowercase
				},
			};

			swarmState.activeAgent.set('test-session', 'reviewer');

			const result = await invokeHook(config);

			expect(result.error).toBeUndefined();

			const warning = result.output.find((s) =>
				s.includes('Same-model adversarial pair detected'),
			);
			expect(warning).toBeDefined();
		});

		it('no warning when active agent is not set', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				agents: {
					coder: { model: 'google/gemini-2.5-flash' },
					reviewer: { model: 'google/gemini-2.5-flash' },
				},
			};

			// Don't set active agent - should be undefined

			const result = await invokeHook(config);

			expect(result.error).toBeUndefined();

			const warning = result.output.find((s) =>
				s.includes('Same-model adversarial pair detected'),
			);
			expect(warning).toBeUndefined();
		});

		it('warning is prefixed with [SWARM CONFIG]', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				agents: {
					coder: { model: 'google/gemini-2.5-flash' },
					reviewer: { model: 'google/gemini-2.5-flash' },
				},
			};

			swarmState.activeAgent.set('test-session', 'reviewer');

			const result = await invokeHook(config);

			expect(result.error).toBeUndefined();

			const warning = result.output.find((s) => s.includes('[SWARM CONFIG]'));
			expect(warning).toBeDefined();
			expect(warning).toContain('Same-model adversarial pair detected');
		});

		it('uses swarm config agent models when set', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				swarms: {
					default: {
						agents: {
							coder: { model: 'google/gemini-2.5-flash' },
							reviewer: { model: 'google/gemini-2.5-flash' },
						},
					},
				},
			};

			swarmState.activeAgent.set('test-session', 'reviewer');

			const result = await invokeHook(config);

			expect(result.error).toBeUndefined();

			const warning = result.output.find((s) =>
				s.includes('Same-model adversarial pair detected'),
			);
			expect(warning).toBeDefined();
		});
	});
});

/**
 * Tests for v6.1 system-enhancer hint injection features:
 * - UI/UX Designer agent opt-in hint injection (ui_review.enabled)
 * - Docs agent opt-out hint injection (docs.enabled = false)
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createSystemEnhancerHook } from '../../../src/hooks/system-enhancer';
import type { PluginConfig } from '../../../src/config';
import { resetSwarmState } from '../../../src/state';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('v6.1 System Enhancer Hint Injection', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'swarm-v61-test-'));
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
	async function invokeHook(config: PluginConfig): Promise<string[]> {
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

	const defaultConfig: PluginConfig = {
		max_iterations: 5,
		qa_retry_limit: 3,
		inject_phase_reminders: true,
	};

	describe('UI/UX Designer agent opt-in hint injection', () => {
		it('ui_review.enabled=true → system output includes "[SWARM CONFIG] UI/UX Designer agent is ENABLED"', async () => {
			await createSwarmFiles();

			const config: PluginConfig = {
				...defaultConfig,
				ui_review: {
					enabled: true,
				},
			};

			const systemOutput = await invokeHook(config);

			// Should contain designer enabled hint
			const hasDesignerHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] UI/UX Designer agent is ENABLED'),
			);
			expect(hasDesignerHint).toBe(true);
		});

		it('ui_review.enabled=false → system output does NOT include designer hint', async () => {
			await createSwarmFiles();

			const config: PluginConfig = {
				...defaultConfig,
				ui_review: {
					enabled: false,
				},
			};

			const systemOutput = await invokeHook(config);

			// Should NOT contain designer hint
			const hasDesignerHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] UI/UX Designer agent is ENABLED'),
			);
			expect(hasDesignerHint).toBe(false);
		});

		it('no ui_review config → system output does NOT include designer hint', async () => {
			await createSwarmFiles();

			const config: PluginConfig = {
				...defaultConfig,
				// No ui_review key
			};

			const systemOutput = await invokeHook(config);

			// Should NOT contain designer hint
			const hasDesignerHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] UI/UX Designer agent is ENABLED'),
			);
			expect(hasDesignerHint).toBe(false);
		});

		it('injects correct designer hint text with Rule 9 reference', async () => {
			await createSwarmFiles();

			const config: PluginConfig = {
				...defaultConfig,
				ui_review: {
					enabled: true,
				},
			};

			const systemOutput = await invokeHook(config);

			const expectedText =
				'[SWARM CONFIG] UI/UX Designer agent is ENABLED. For tasks matching UI trigger keywords or file paths, delegate to designer BEFORE coder (Rule 9).';
			const hasExactText = systemOutput.includes(expectedText);
			expect(hasExactText).toBe(true);
		});
	});

	describe('Docs agent opt-out hint injection', () => {
		it('docs.enabled=false → system output includes "[SWARM CONFIG] Docs agent is DISABLED"', async () => {
			await createSwarmFiles();

			const config: PluginConfig = {
				...defaultConfig,
				docs: {
					enabled: false,
				},
			};

			const systemOutput = await invokeHook(config);

			// Should contain docs disabled hint
			const hasDocsHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] Docs agent is DISABLED'),
			);
			expect(hasDocsHint).toBe(true);
		});

		it('docs.enabled=true (explicitly) → system output does NOT include docs-disabled hint', async () => {
			await createSwarmFiles();

			const config: PluginConfig = {
				...defaultConfig,
				docs: {
					enabled: true,
				},
			};

			const systemOutput = await invokeHook(config);

			// Should NOT contain docs disabled hint
			const hasDocsHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] Docs agent is DISABLED'),
			);
			expect(hasDocsHint).toBe(false);
		});

		it('no docs config → system output does NOT include docs-disabled hint', async () => {
			await createSwarmFiles();

			const config: PluginConfig = {
				...defaultConfig,
				// No docs key
			};

			const systemOutput = await invokeHook(config);

			// Should NOT contain docs disabled hint
			const hasDocsHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] Docs agent is DISABLED'),
			);
			expect(hasDocsHint).toBe(false);
		});

		it('injects correct docs disabled hint text with Phase 6 reference', async () => {
			await createSwarmFiles();

			const config: PluginConfig = {
				...defaultConfig,
				docs: {
					enabled: false,
				},
			};

			const systemOutput = await invokeHook(config);

			const expectedText =
				'[SWARM CONFIG] Docs agent is DISABLED. Skip docs delegation in Phase 6.';
			const hasExactText = systemOutput.includes(expectedText);
			expect(hasExactText).toBe(true);
		});
	});

	describe('Combined v6.1 hint injection', () => {
		it('can inject BOTH v6.1 hints when conditions are met', async () => {
			await createSwarmFiles();

			const config: PluginConfig = {
				...defaultConfig,
				ui_review: {
					enabled: true,
				},
				docs: {
					enabled: false,
				},
			};

			const systemOutput = await invokeHook(config);

			// Should contain designer enabled hint
			const hasDesignerHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] UI/UX Designer agent is ENABLED'),
			);
			expect(hasDesignerHint).toBe(true);

			// Should contain docs disabled hint
			const hasDocsHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] Docs agent is DISABLED'),
			);
			expect(hasDocsHint).toBe(true);
		});

		it('injects NEITHER v6.1 hint with default config', async () => {
			await createSwarmFiles();

			const config: PluginConfig = {
				...defaultConfig,
				// No ui_review, no docs
			};

			const systemOutput = await invokeHook(config);

			// Should NOT contain designer hint
			const hasDesignerHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] UI/UX Designer agent is ENABLED'),
			);
			expect(hasDesignerHint).toBe(false);

			// Should NOT contain docs disabled hint
			const hasDocsHint = systemOutput.some((s) =>
				s.includes('[SWARM CONFIG] Docs agent is DISABLED'),
			);
			expect(hasDocsHint).toBe(false);
		});
	});
});

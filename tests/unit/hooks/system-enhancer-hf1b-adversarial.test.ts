/**
 * Adversarial/Attack-Vector Tests for v6.13.1-hotfix HF-1b in system-enhancer.ts
 *
 * Tests security and robustness against malicious inputs targeting the
 * agent execution guardrails (HF-1: coder/test_engineer self-verification guard,
 * HF-1b: architect/null full test suite guard).
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PluginConfig } from '../../../src/config';
import { createSystemEnhancerHook } from '../../../src/hooks/system-enhancer';
import { resetSwarmState, swarmState } from '../../../src/state';

describe('system-enhancer HF-1b - Adversarial Attack Vector Testing', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'swarm-hf1b-adversarial-'));
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
	async function invokeHook(sessionID?: string): Promise<string[]> {
		const config: PluginConfig = {
			max_iterations: 5,
			qa_retry_limit: 3,
			inject_phase_reminders: true,
		};

		const hooks = createSystemEnhancerHook(config, tempDir);
		const transform = hooks['experimental.chat.system.transform'] as (
			input: { sessionID?: string },
			output: { system: string[] },
		) => Promise<void>;

		const input = sessionID ? { sessionID } : {};
		const output = { system: ['Initial system prompt'] };

		await transform(input, output);

		return output.system;
	}

	/**
	 * Check if system output contains HF-1 injection (coder/test_engineer guard)
	 */
	function hasHF1Injection(systemOutput: string[]): boolean {
		return systemOutput.some((s) =>
			s.includes(
				'[SWARM CONFIG] You must NOT run build, test, lint, or type-check commands',
			),
		);
	}

	/**
	 * Check if system output contains HF-1b injection (architect/null guard)
	 */
	function hasHF1bInjection(systemOutput: string[]): boolean {
		return systemOutput.some((s) =>
			s.includes('[SWARM CONFIG] You must NEVER run the full test suite'),
		);
	}

	describe('ATTACK 1: Empty string agent name', () => {
		it('empty string agent → falsy → baseRole = null → HF-1b fires', async () => {
			await createSwarmFiles();

			// Set active agent to empty string
			swarmState.activeAgent.set('test-session', '');

			const systemOutput = await invokeHook('test-session');

			// Empty string doesn't match 'coder' or 'test_engineer'
			expect(hasHF1Injection(systemOutput)).toBe(false);

			// Empty string is falsy in JavaScript, so baseRole = null
			// HF-1b only fires when baseRole === 'architect' || baseRole === null
			// Since baseRole is null, HF-1b SHOULD fire
			expect(hasHF1bInjection(systemOutput)).toBe(true);
		});
	});

	describe('ATTACK 2: Whitespace-only agent name', () => {
		it('whitespace-only agent → baseRole = whitespace string → NEITHER injection fires', async () => {
			await createSwarmFiles();

			// Set active agent to whitespace-only string
			swarmState.activeAgent.set('test-session', '   ');

			const systemOutput = await invokeHook('test-session');

			// Whitespace-only doesn't match 'coder' or 'test_engineer'
			expect(hasHF1Injection(systemOutput)).toBe(false);

			// Whitespace is truthy and not 'architect', so HF-1b should NOT fire
			expect(hasHF1bInjection(systemOutput)).toBe(false);
		});

		it('mixed whitespace agent → baseRole = whitespace string → NEITHER injection fires', async () => {
			await createSwarmFiles();

			// Set active agent to mixed whitespace string
			swarmState.activeAgent.set('test-session', '\t\n \r');

			const systemOutput = await invokeHook('test-session');

			// Mixed whitespace doesn't match 'coder' or 'test_engineer'
			expect(hasHF1Injection(systemOutput)).toBe(false);

			// Mixed whitespace is truthy and not 'architect', so HF-1b should NOT fire
			expect(hasHF1bInjection(systemOutput)).toBe(false);
		});
	});

	describe('ATTACK 3: Case variation bypass', () => {
		it('uppercase CODER → case-sensitive check → neither block fires (stripKnownSwarmPrefix normalizes to lowercase)', async () => {
			await createSwarmFiles();

			// Set active agent to uppercase 'CODER'
			swarmState.activeAgent.set('test-session', 'CODER');

			const systemOutput = await invokeHook('test-session');

			// stripKnownSwarmPrefix normalizes to lowercase, so 'CODER' → 'coder'
			// This actually MATCHES 'coder', so HF-1 SHOULD fire
			// This is expected behavior, not a bypass
			expect(hasHF1Injection(systemOutput)).toBe(true);
			expect(hasHF1bInjection(systemOutput)).toBe(false);
		});

		it('mixed case CoDeR → normalized to lowercase → HF-1 fires', async () => {
			await createSwarmFiles();

			// Set active agent to mixed case 'CoDeR'
			swarmState.activeAgent.set('test-session', 'CoDeR');

			const systemOutput = await invokeHook('test-session');

			// stripKnownSwarmPrefix normalizes to lowercase, so 'CoDeR' → 'coder'
			expect(hasHF1Injection(systemOutput)).toBe(true);
			expect(hasHF1bInjection(systemOutput)).toBe(false);
		});

		it('mixed case ARCHITECT → normalized to lowercase → HF-1b fires', async () => {
			await createSwarmFiles();

			// Set active agent to mixed case 'ARCHITECT'
			swarmState.activeAgent.set('test-session', 'ARCHITECT');

			const systemOutput = await invokeHook('test-session');

			// stripKnownSwarmPrefix normalizes to lowercase, so 'ARCHITECT' → 'architect'
			expect(hasHF1Injection(systemOutput)).toBe(false);
			expect(hasHF1bInjection(systemOutput)).toBe(true);
		});
	});

	describe('ATTACK 4: Mixed prefix attack', () => {
		it('double prefix mega_mega_coder → iterative stripping → coder → HF-1 fires', async () => {
			await createSwarmFiles();

			// Set active agent with double prefix
			swarmState.activeAgent.set('test-session', 'mega_mega_coder');

			const systemOutput = await invokeHook('test-session');

			// stripKnownSwarmPrefix iteratively strips prefixes, so 'mega_mega_coder' → 'coder'
			expect(hasHF1Injection(systemOutput)).toBe(true);
			expect(hasHF1bInjection(systemOutput)).toBe(false);
		});

		it('triple prefix mega_mega_mega_architect → iterative stripping → architect → HF-1b fires', async () => {
			await createSwarmFiles();

			// Set active agent with triple prefix
			swarmState.activeAgent.set('test-session', 'mega_mega_mega_architect');

			const systemOutput = await invokeHook('test-session');

			// stripKnownSwarmPrefix iteratively strips prefixes, so 'mega_mega_mega_architect' → 'architect'
			expect(hasHF1Injection(systemOutput)).toBe(false);
			expect(hasHF1bInjection(systemOutput)).toBe(true);
		});

		it('mixed prefix cloud_mega_coder → iterative stripping → coder → HF-1 fires', async () => {
			await createSwarmFiles();

			// Set active agent with mixed prefixes
			swarmState.activeAgent.set('test-session', 'cloud_mega_coder');

			const systemOutput = await invokeHook('test-session');

			// stripKnownSwarmPrefix iteratively strips prefixes, so 'cloud_mega_coder' → 'coder'
			expect(hasHF1Injection(systemOutput)).toBe(true);
			expect(hasHF1bInjection(systemOutput)).toBe(false);
		});

		it('prefix with known suffix but unknown agent mega_tester → no match → NEITHER injection fires', async () => {
			await createSwarmFiles();

			// Set active agent with prefix and unknown base agent
			swarmState.activeAgent.set('test-session', 'mega_tester');

			const systemOutput = await invokeHook('test-session');

			// 'tester' is not a known agent name, so no match
			expect(hasHF1Injection(systemOutput)).toBe(false);
			// Unknown agent is truthy and not 'architect', so HF-1b should NOT fire
			expect(hasHF1bInjection(systemOutput)).toBe(false);
		});
	});

	describe('ATTACK 5: Unknown agent type', () => {
		it('unknown_agent_xyz → no match → NEITHER injection fires', async () => {
			await createSwarmFiles();

			// Set active agent to unknown type
			swarmState.activeAgent.set('test-session', 'unknown_agent_xyz');

			const systemOutput = await invokeHook('test-session');

			// Unknown agent doesn't match 'coder' or 'test_engineer'
			expect(hasHF1Injection(systemOutput)).toBe(false);

			// Unknown agent is truthy and not 'architect', so HF-1b should NOT fire
			expect(hasHF1bInjection(systemOutput)).toBe(false);
		});

		it('random_agent_name_12345 → no match → NEITHER injection fires', async () => {
			await createSwarmFiles();

			// Set active agent to random unknown name
			swarmState.activeAgent.set('test-session', 'random_agent_name_12345');

			const systemOutput = await invokeHook('test-session');

			// Unknown agent doesn't match
			expect(hasHF1Injection(systemOutput)).toBe(false);
			expect(hasHF1bInjection(systemOutput)).toBe(false);
		});
	});

	describe('ATTACK 6: Very long agent name', () => {
		it('1000-char agent name → no crash → NEITHER injection fires', async () => {
			await createSwarmFiles();

			// Set active agent to very long string
			const longName = 'a'.repeat(1000);
			swarmState.activeAgent.set('test-session', longName);

			const systemOutput = await invokeHook('test-session');

			// Should not crash
			expect(systemOutput).toBeDefined();
			expect(Array.isArray(systemOutput)).toBe(true);

			// Long name doesn't match known agents
			expect(hasHF1Injection(systemOutput)).toBe(false);
			expect(hasHF1bInjection(systemOutput)).toBe(false);
		});

		it('10000-char agent name → no crash → NEITHER injection fires', async () => {
			await createSwarmFiles();

			// Set active agent to extremely long string
			const longName = 'b'.repeat(10000);
			swarmState.activeAgent.set('test-session', longName);

			const systemOutput = await invokeHook('test-session');

			// Should not crash
			expect(systemOutput).toBeDefined();
			expect(Array.isArray(systemOutput)).toBe(true);

			// Long name doesn't match known agents
			expect(hasHF1Injection(systemOutput)).toBe(false);
			expect(hasHF1bInjection(systemOutput)).toBe(false);
		});
	});

	describe('ATTACK 7: Null sessionID', () => {
		it("null sessionID → get('') → undefined → baseRole null → HF-1b fires", async () => {
			await createSwarmFiles();

			// Don't set any active agent, and use empty sessionID (equivalent to null)
			const systemOutput = await invokeHook('');

			// No active agent, so baseRole is null
			expect(hasHF1Injection(systemOutput)).toBe(false);
			expect(hasHF1bInjection(systemOutput)).toBe(true);
		});

		it("undefined sessionID → get('') → undefined → baseRole null → HF-1b fires", async () => {
			await createSwarmFiles();

			// Invoke hook without sessionID (undefined)
			const systemOutput = await invokeHook(undefined);

			// No active agent, so baseRole is null
			expect(hasHF1Injection(systemOutput)).toBe(false);
			expect(hasHF1bInjection(systemOutput)).toBe(true);
		});
	});

	describe('ATTACK 8: Prototype pollution attempt', () => {
		it('__proto__ as agent name → does not crash → NEITHER injection fires', async () => {
			await createSwarmFiles();

			// Set active agent to '__proto__'
			swarmState.activeAgent.set('test-session', '__proto__');

			const systemOutput = await invokeHook('test-session');

			// Should not crash
			expect(systemOutput).toBeDefined();
			expect(Array.isArray(systemOutput)).toBe(true);

			// '__proto__' is not a known agent name
			expect(hasHF1Injection(systemOutput)).toBe(false);
			expect(hasHF1bInjection(systemOutput)).toBe(false);
		});

		it('constructor as agent name → does not crash → NEITHER injection fires', async () => {
			await createSwarmFiles();

			// Set active agent to 'constructor'
			swarmState.activeAgent.set('test-session', 'constructor');

			const systemOutput = await invokeHook('test-session');

			// Should not crash
			expect(systemOutput).toBeDefined();
			expect(Array.isArray(systemOutput)).toBe(true);

			// 'constructor' is not a known agent name
			expect(hasHF1Injection(systemOutput)).toBe(false);
			expect(hasHF1bInjection(systemOutput)).toBe(false);
		});

		it('prototype as agent name → does not crash → NEITHER injection fires', async () => {
			await createSwarmFiles();

			// Set active agent to 'prototype'
			swarmState.activeAgent.set('test-session', 'prototype');

			const systemOutput = await invokeHook('test-session');

			// Should not crash
			expect(systemOutput).toBeDefined();
			expect(Array.isArray(systemOutput)).toBe(true);

			// 'prototype' is not a known agent name
			expect(hasHF1Injection(systemOutput)).toBe(false);
			expect(hasHF1bInjection(systemOutput)).toBe(false);
		});
	});

	describe('ATTACK 9: Special characters in agent name', () => {
		it('agent with null bytes → does not crash → NEITHER injection fires', async () => {
			await createSwarmFiles();

			// Set active agent to string with null bytes
			swarmState.activeAgent.set('test-session', 'coder\x00null');

			const systemOutput = await invokeHook('test-session');

			// Should not crash
			expect(systemOutput).toBeDefined();
			expect(Array.isArray(systemOutput)).toBe(true);

			// 'coder\x00null' is not 'coder' exactly
			expect(hasHF1Injection(systemOutput)).toBe(false);
			expect(hasHF1bInjection(systemOutput)).toBe(false);
		});

		it('agent with newline characters → does not crash → NEITHER injection fires', async () => {
			await createSwarmFiles();

			// Set active agent to string with newlines
			swarmState.activeAgent.set('test-session', 'coder\narchitect');

			const systemOutput = await invokeHook('test-session');

			// Should not crash
			expect(systemOutput).toBeDefined();
			expect(Array.isArray(systemOutput)).toBe(true);

			// 'coder\narchitect' is not 'coder' exactly
			expect(hasHF1Injection(systemOutput)).toBe(false);
			expect(hasHF1bInjection(systemOutput)).toBe(false);
		});

		it('agent with control characters → does not crash → NEITHER injection fires', async () => {
			await createSwarmFiles();

			// Set active agent to string with control characters
			swarmState.activeAgent.set('test-session', '\x1b[31mcoder\x1b[0m');

			const systemOutput = await invokeHook('test-session');

			// Should not crash
			expect(systemOutput).toBeDefined();
			expect(Array.isArray(systemOutput)).toBe(true);

			// String with ANSI codes is not 'coder' exactly
			expect(hasHF1Injection(systemOutput)).toBe(false);
			expect(hasHF1bInjection(systemOutput)).toBe(false);
		});
	});

	describe('ATTACK 10: Unicode and emoji in agent name', () => {
		it('emoji agent name → does not crash → NEITHER injection fires', async () => {
			await createSwarmFiles();

			// Set active agent to emoji
			swarmState.activeAgent.set('test-session', '😀');

			const systemOutput = await invokeHook('test-session');

			// Should not crash
			expect(systemOutput).toBeDefined();
			expect(Array.isArray(systemOutput)).toBe(true);

			// Emoji is not a known agent name
			expect(hasHF1Injection(systemOutput)).toBe(false);
			expect(hasHF1bInjection(systemOutput)).toBe(false);
		});

		it('mixed Unicode and ASCII → does not crash → NEITHER injection fires', async () => {
			await createSwarmFiles();

			// Set active agent to mixed Unicode and ASCII
			swarmState.activeAgent.set('test-session', 'coder-😀-test');

			const systemOutput = await invokeHook('test-session');

			// Should not crash
			expect(systemOutput).toBeDefined();
			expect(Array.isArray(systemOutput)).toBe(true);

			// Mixed string is not 'coder' exactly
			expect(hasHF1Injection(systemOutput)).toBe(false);
			expect(hasHF1bInjection(systemOutput)).toBe(false);
		});

		it('right-to-left override characters → does not crash → NEITHER injection fires', async () => {
			await createSwarmFiles();

			// Set active agent to RTL override character
			swarmState.activeAgent.set('test-session', '\u202e');

			const systemOutput = await invokeHook('test-session');

			// Should not crash
			expect(systemOutput).toBeDefined();
			expect(Array.isArray(systemOutput)).toBe(true);

			// RTL char is not a known agent name
			expect(hasHF1Injection(systemOutput)).toBe(false);
			expect(hasHF1bInjection(systemOutput)).toBe(false);
		});
	});

	describe('ATTACK 11: SQL injection-style agent names', () => {
		it('SQL injection attempt → does not crash → NEITHER injection fires', async () => {
			await createSwarmFiles();

			// Set active agent to SQL injection string
			swarmState.activeAgent.set(
				'test-session',
				"coder'; DROP TABLE agents; --",
			);

			const systemOutput = await invokeHook('test-session');

			// Should not crash (no SQL execution)
			expect(systemOutput).toBeDefined();
			expect(Array.isArray(systemOutput)).toBe(true);

			// SQL injection string is not 'coder' exactly
			expect(hasHF1Injection(systemOutput)).toBe(false);
			expect(hasHF1bInjection(systemOutput)).toBe(false);
		});

		it('SQL injection with UNION → does not crash → NEITHER injection fires', async () => {
			await createSwarmFiles();

			// Set active agent to SQL injection with UNION
			swarmState.activeAgent.set(
				'test-session',
				"coder' UNION SELECT 'architect' --",
			);

			const systemOutput = await invokeHook('test-session');

			// Should not crash
			expect(systemOutput).toBeDefined();
			expect(Array.isArray(systemOutput)).toBe(true);

			// SQL injection string is not 'coder' exactly
			expect(hasHF1Injection(systemOutput)).toBe(false);
			expect(hasHF1bInjection(systemOutput)).toBe(false);
		});
	});

	describe('ATTACK 12: Path traversal-style agent names', () => {
		it('path traversal attempt → does not crash → NEITHER injection fires', async () => {
			await createSwarmFiles();

			// Set active agent to path traversal string
			swarmState.activeAgent.set('test-session', '../../../etc/passwd');

			const systemOutput = await invokeHook('test-session');

			// Should not crash (no file access)
			expect(systemOutput).toBeDefined();
			expect(Array.isArray(systemOutput)).toBe(true);

			// Path traversal string is not a known agent
			expect(hasHF1Injection(systemOutput)).toBe(false);
			expect(hasHF1bInjection(systemOutput)).toBe(false);
		});

		it('path traversal with null bytes → does not crash → NEITHER injection fires', async () => {
			await createSwarmFiles();

			// Set active agent to path traversal with null byte
			swarmState.activeAgent.set('test-session', '../../../etc/passwd\x00');

			const systemOutput = await invokeHook('test-session');

			// Should not crash
			expect(systemOutput).toBeDefined();
			expect(Array.isArray(systemOutput)).toBe(true);

			// Path traversal string is not a known agent
			expect(hasHF1Injection(systemOutput)).toBe(false);
			expect(hasHF1bInjection(systemOutput)).toBe(false);
		});
	});

	describe('ATTACK 13: XSS-style agent names', () => {
		it('XSS script injection → does not crash → NEITHER injection fires', async () => {
			await createSwarmFiles();

			// Set active agent to XSS script
			swarmState.activeAgent.set(
				'test-session',
				'<script>alert("XSS")</script>',
			);

			const systemOutput = await invokeHook('test-session');

			// Should not crash (no script execution)
			expect(systemOutput).toBeDefined();
			expect(Array.isArray(systemOutput)).toBe(true);

			// XSS string is not a known agent
			expect(hasHF1Injection(systemOutput)).toBe(false);
			expect(hasHF1bInjection(systemOutput)).toBe(false);
		});

		it('XSS img onerror → does not crash → NEITHER injection fires', async () => {
			await createSwarmFiles();

			// Set active agent to XSS img tag
			swarmState.activeAgent.set(
				'test-session',
				'<img src=x onerror=alert(1)>',
			);

			const systemOutput = await invokeHook('test-session');

			// Should not crash
			expect(systemOutput).toBeDefined();
			expect(Array.isArray(systemOutput)).toBe(true);

			// XSS string is not a known agent
			expect(hasHF1Injection(systemOutput)).toBe(false);
			expect(hasHF1bInjection(systemOutput)).toBe(false);
		});
	});

	describe('ATTACK 14: Nested prototype pollution', () => {
		it('__proto__.__proto__ → does not crash → NEITHER injection fires', async () => {
			await createSwarmFiles();

			// Set active agent to nested prototype chain
			swarmState.activeAgent.set('test-session', '__proto__.__proto__');

			const systemOutput = await invokeHook('test-session');

			// Should not crash
			expect(systemOutput).toBeDefined();
			expect(Array.isArray(systemOutput)).toBe(true);

			// Nested proto string is not a known agent
			expect(hasHF1Injection(systemOutput)).toBe(false);
			expect(hasHF1bInjection(systemOutput)).toBe(false);
		});

		it('constructor.prototype → does not crash → NEITHER injection fires', async () => {
			await createSwarmFiles();

			// Set active agent to constructor.prototype
			swarmState.activeAgent.set('test-session', 'constructor.prototype');

			const systemOutput = await invokeHook('test-session');

			// Should not crash
			expect(systemOutput).toBeDefined();
			expect(Array.isArray(systemOutput)).toBe(true);

			// Constructor.prototype string is not a known agent
			expect(hasHF1Injection(systemOutput)).toBe(false);
			expect(hasHF1bInjection(systemOutput)).toBe(false);
		});
	});

	describe('ATTACK 15: Combined attacks', () => {
		it('long name with null-like components and Unicode → does not crash → NEITHER injection fires', async () => {
			await createSwarmFiles();

			// Combine multiple attack vectors
			const combinedName = '__proto__-'.repeat(50) + '😀';
			swarmState.activeAgent.set('test-session', combinedName);

			const systemOutput = await invokeHook('test-session');

			// Should not crash
			expect(systemOutput).toBeDefined();
			expect(Array.isArray(systemOutput)).toBe(true);

			// Combined attack string is not a known agent
			expect(hasHF1Injection(systemOutput)).toBe(false);
			expect(hasHF1bInjection(systemOutput)).toBe(false);
		});

		it('XSS with prototype pollution → does not crash → NEITHER injection fires', async () => {
			await createSwarmFiles();

			// Combine XSS and prototype pollution
			swarmState.activeAgent.set('test-session', '<script>__proto__</script>');

			const systemOutput = await invokeHook('test-session');

			// Should not crash
			expect(systemOutput).toBeDefined();
			expect(Array.isArray(systemOutput)).toBe(true);

			// Combined string is not a known agent
			expect(hasHF1Injection(systemOutput)).toBe(false);
			expect(hasHF1bInjection(systemOutput)).toBe(false);
		});
	});
});

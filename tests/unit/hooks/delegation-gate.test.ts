import { describe, it, expect, afterEach, beforeEach } from 'bun:test';
import { createDelegationGateHook } from '../../../src/hooks/delegation-gate';
import { swarmState, resetSwarmState, ensureAgentSession } from '../../../src/state';
import type { PluginConfig } from '../../../src/config';

function makeConfig(overrides?: Record<string, unknown>): PluginConfig {
	return {
		max_iterations: 5,
		qa_retry_limit: 3,
		inject_phase_reminders: true,
		hooks: {
			system_enhancer: true,
			compaction: true,
			agent_activity: true,
			delegation_tracker: false,
			agent_awareness_max_chars: 300,
			delegation_gate: true,
			delegation_max_chars: 4000,
			...(overrides?.hooks as Record<string, unknown>),
		},
	} as PluginConfig;
}

function makeMessages(text: string, agent?: string, sessionID = 'test-session') {
	return {
		messages: [{
			info: { role: 'user' as const, agent, sessionID },
			parts: [{ type: 'text', text }],
		}],
	};
}

describe('delegation gate hook', () => {
	beforeEach(() => {
		// Reset all swarm state before each test
		resetSwarmState();
	});

	afterEach(() => {
		// Clean up after each test
		resetSwarmState();
	});

	it('no-op when disabled', async () => {
		const config = makeConfig({ hooks: { delegation_gate: false } });
		const hook = createDelegationGateHook(config);

		const messages = makeMessages('coder\nTASK: Add validation\nFILE: src/test.ts', 'architect');
		const originalText = messages.messages[0].parts[0].text;

		await hook({}, messages);

		expect(messages.messages[0].parts[0].text).toBe(originalText);
	});

	it('ignores non-coder delegations', async () => {
		const config = makeConfig();
		const hook = createDelegationGateHook(config);

		// Long message without coder TASK: pattern
		const longText = 'TASK: Review this very long task description ' + 'a'.repeat(5000);
		const messages = makeMessages(longText, 'architect');
		const originalText = messages.messages[0].parts[0].text;

		await hook({}, messages);

		expect(messages.messages[0].parts[0].text).toBe(originalText);
	});

	it('ignores non-architect agents', async () => {
		const config = makeConfig();
		const hook = createDelegationGateHook(config);

		// Coder delegation from non-architect agent
		const longText = 'coder\nTASK: ' + 'a'.repeat(5000);
		const messages = makeMessages(longText, 'coder');
		const originalText = messages.messages[0].parts[0].text;

		await hook({}, messages);

		expect(messages.messages[0].parts[0].text).toBe(originalText);
	});

	it('detects oversized delegation', async () => {
		const config = makeConfig();
		const hook = createDelegationGateHook(config);

		// Coder delegation > 4000 chars
		const longText = 'coder\nTASK: Add validation\nINPUT: ' + 'a'.repeat(4000) + '\nFILE: src/test.ts';
		const messages = makeMessages(longText, 'architect');

		await hook({}, messages);

		expect(messages.messages[0].parts[0].text).toContain('⚠️ BATCH DETECTED');
		expect(messages.messages[0].parts[0].text).toContain('exceeds recommended size');
	});

	it('detects multiple FILE: directives', async () => {
		const config = makeConfig();
		const hook = createDelegationGateHook(config);

		const longText = 'coder\nTASK: Add validation\nFILE: src/auth.ts\nFILE: src/login.ts';
		const messages = makeMessages(longText, 'architect');

		await hook({}, messages);

		expect(messages.messages[0].parts[0].text).toContain('⚠️ BATCH DETECTED');
		expect(messages.messages[0].parts[0].text).toContain('Multiple FILE: directives detected');
	});

	it('detects multiple TASK: sections', async () => {
		const config = makeConfig();
		const hook = createDelegationGateHook(config);

		const longText = 'coder\nTASK: Add validation\nFILE: src/test.ts\n\nTASK: Add tests';
		const messages = makeMessages(longText, 'architect');

		await hook({}, messages);

		expect(messages.messages[0].parts[0].text).toContain('⚠️ BATCH DETECTED');
		expect(messages.messages[0].parts[0].text).toContain('Multiple TASK: sections detected');
	});

	it('detects batching language', async () => {
		const config = makeConfig();
		const hook = createDelegationGateHook(config);

		const longText = 'coder\nTASK: Add validation and also add tests\nFILE: src/test.ts';
		const messages = makeMessages(longText, 'architect');

		await hook({}, messages);

		expect(messages.messages[0].parts[0].text).toContain('⚠️ BATCH DETECTED');
		expect(messages.messages[0].parts[0].text).toContain('Batching language detected');
	});

	it('no warning when delegation is small and clean', async () => {
		const config = makeConfig();
		const hook = createDelegationGateHook(config);

		const cleanText = 'coder\nTASK: Add validation\nFILE: src/test.ts\nINPUT: Validate email format';
		const messages = makeMessages(cleanText, 'architect');
		const originalText = messages.messages[0].parts[0].text;

		await hook({}, messages);

		expect(messages.messages[0].parts[0].text).toBe(originalText);
	});

	it('works when agent is undefined (main session)', async () => {
		const config = makeConfig();
		const hook = createDelegationGateHook(config);

		// Agent undefined (main session = architect)
		const longText = 'coder\nTASK: ' + 'a'.repeat(5000);
		const messages = makeMessages(longText, undefined);

		await hook({}, messages);

		expect(messages.messages[0].parts[0].text).toContain('⚠️ BATCH DETECTED');
	});

	it('custom delegation_max_chars respected', async () => {
		const config = makeConfig({ hooks: { delegation_max_chars: 100 } });
		const hook = createDelegationGateHook(config);

		// 150+ char delegation exceeds custom limit of 100
		const longText = 'coder\nTASK: ' + 'a'.repeat(150) + '\nFILE: src/test.ts';
		const messages = makeMessages(longText, 'architect');

		await hook({}, messages);

		expect(messages.messages[0].parts[0].text).toContain('⚠️ BATCH DETECTED');
		expect(messages.messages[0].parts[0].text).toContain('limit 100');
	});

	it('should warn when coder delegates to coder without reviewer', async () => {
		const config = makeConfig();
		const hook = createDelegationGateHook(config);

		// Simulate delegation chain: architect → coder → architect → (now delegating to coder again)
		swarmState.delegationChains.set('test-session', [
			{ from: 'architect', to: 'mega_coder', timestamp: Date.now() - 5000 },
			{ from: 'mega_coder', to: 'architect', timestamp: Date.now() - 3000 },
			{ from: 'architect', to: 'mega_coder', timestamp: Date.now() - 1000 },
		]);

		const messages = makeMessages('coder\nTASK: Implement feature B\nFILE: src/b.ts', 'architect');

		await hook({}, messages);

		expect(messages.messages[0].parts[0].text).toContain('PROTOCOL VIOLATION');
		expect(messages.messages[0].parts[0].text).toContain('reviewer');
		expect(messages.messages[0].parts[0].text).toContain('test_engineer');
	});

	it('should NOT warn when proper QA sequence is followed', async () => {
		const config = makeConfig();
		const hook = createDelegationGateHook(config);

		// Proper sequence: coder → architect → reviewer → architect → test_engineer → architect → coder
		swarmState.delegationChains.set('test-session', [
			{ from: 'architect', to: 'mega_coder', timestamp: Date.now() - 10000 },
			{ from: 'mega_coder', to: 'architect', timestamp: Date.now() - 8000 },
			{ from: 'architect', to: 'mega_reviewer', timestamp: Date.now() - 6000 },
			{ from: 'mega_reviewer', to: 'architect', timestamp: Date.now() - 4000 },
			{ from: 'architect', to: 'mega_test_engineer', timestamp: Date.now() - 2000 },
			{ from: 'mega_test_engineer', to: 'architect', timestamp: Date.now() - 1000 },
			{ from: 'architect', to: 'mega_coder', timestamp: Date.now() },
		]);

		const cleanText = 'coder\nTASK: Next task\nFILE: src/next.ts';
		const messages = makeMessages(cleanText, 'architect');
		const originalText = messages.messages[0].parts[0].text;

		await hook({}, messages);

		// No PROTOCOL VIOLATION warning should be added
		expect(messages.messages[0].parts[0].text).not.toContain('PROTOCOL VIOLATION');
	});

	it('should warn when reviewer present but test_engineer missing', async () => {
		const config = makeConfig();
		const hook = createDelegationGateHook(config);

		// Chain: coder → arch → reviewer → arch → coder (no test_engineer)
		swarmState.delegationChains.set('test-session', [
			{ from: 'architect', to: 'mega_coder', timestamp: Date.now() - 5000 },
			{ from: 'mega_coder', to: 'architect', timestamp: Date.now() - 4000 },
			{ from: 'architect', to: 'mega_reviewer', timestamp: Date.now() - 3000 },
			{ from: 'mega_reviewer', to: 'architect', timestamp: Date.now() - 2000 },
			{ from: 'architect', to: 'mega_coder', timestamp: Date.now() - 1000 },
		]);

		const messages = makeMessages('coder\nTASK: Another task\nFILE: src/another.ts', 'architect');

		await hook({}, messages);

		expect(messages.messages[0].parts[0].text).toContain('PROTOCOL VIOLATION');
	});

	// ============================================
	// Zero-Coder-Delegation Detection Tests (v6.12)
	// ============================================

	describe('zero-coder-delegation detection', () => {
		it('should warn when architect writes code without delegating to coder', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config);

			// Simulate session where architect has written files
			const session = ensureAgentSession('test-session');
			session.architectWriteCount = 3;

			// Architect sends a non-coder message with a task
			const messages = makeMessages('TASK: Fix the validation logic', 'architect');

			await hook({}, messages);

			expect(messages.messages[0].parts[0].text).toContain('DELEGATION VIOLATION');
			expect(messages.messages[0].parts[0].text).toContain('zero coder delegations');
		});

		it('should NOT warn when task ID matches last coder delegation', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config);

			// Simulate session where architect wrote files BUT also delegated to coder for same task
			const session = ensureAgentSession('test-session');
			session.architectWriteCount = 3;
			session.lastCoderDelegationTaskId = 'Fix the validation logic';

			// Same task ID as last coder delegation
			const messages = makeMessages('TASK: Fix the validation logic', 'architect');
			const originalText = messages.messages[0].parts[0].text;

			await hook({}, messages);

			// No warning because task matches coder delegation
			expect(messages.messages[0].parts[0].text).toBe(originalText);
		});

		it('should NOT warn when architect has not written any files', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config);

			// Session exists but no writes
			const session = ensureAgentSession('test-session');
			session.architectWriteCount = 0;

			const messages = makeMessages('TASK: Check the logs', 'architect');
			const originalText = messages.messages[0].parts[0].text;

			await hook({}, messages);

			expect(messages.messages[0].parts[0].text).toBe(originalText);
		});

		it('should NOT warn on coder delegation messages', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config);

			// Architect has written files
			const session = ensureAgentSession('test-session');
			session.architectWriteCount = 5;

			// This IS a coder delegation
			const messages = makeMessages('coder\nTASK: Implement feature\nFILE: src/feature.ts', 'architect');
			const originalText = messages.messages[0].parts[0].text;

			await hook({}, messages);

			// No DELEGATION VIOLATION warning (just clean coder delegation)
			expect(messages.messages[0].parts[0].text).not.toContain('DELEGATION VIOLATION');
			expect(messages.messages[0].parts[0].text).toBe(originalText);
		});

		it('should track coder delegation task IDs', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config);

			// Send a coder delegation
			const messages1 = makeMessages('coder\nTASK: Task Alpha\nFILE: src/alpha.ts', 'architect');
			await hook({}, messages1);

			// Verify task ID was tracked
			const session = ensureAgentSession('test-session');
			expect(session.lastCoderDelegationTaskId).toBe('Task Alpha');
		});

		it('should NOT track task ID from non-coder messages', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config);

			// Send a non-coder message
			const messages = makeMessages('TASK: Review this please', 'architect');
			await hook({}, messages);

			const session = ensureAgentSession('test-session');
			// Task ID should not be tracked (it's not a coder delegation)
			expect(session.lastCoderDelegationTaskId).toBeNull();
		});

		it('should warn on subsequent different tasks after writing files', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config);

			// First: architect delegates to coder for Task A
			const messages1 = makeMessages('coder\nTASK: Task A\nFILE: src/a.ts', 'architect');
			await hook({}, messages1);

			// Architect writes some files (simulated)
			const session = ensureAgentSession('test-session');
			session.architectWriteCount = 2;

			// Now architect sends non-coder message with different task
			const messages2 = makeMessages('TASK: Task B - fix the bug', 'architect');
			await hook({}, messages2);

			// Should warn because Task B differs from last coder delegation (Task A)
			expect(messages2.messages[0].parts[0].text).toContain('DELEGATION VIOLATION');
			expect(messages2.messages[0].parts[0].text).toContain('Task B - fix the bug');
		});

		it('should NOT warn for messages without TASK line', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config);

			const session = ensureAgentSession('test-session');
			session.architectWriteCount = 5;

			// No TASK: prefix
			const messages = makeMessages('Just checking the status of the build', 'architect');
			const originalText = messages.messages[0].parts[0].text;

			await hook({}, messages);

			expect(messages.messages[0].parts[0].text).toBe(originalText);
		});

		it('should not warn when sessionID is missing', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config);

			// No sessionID
			const messages = {
				messages: [{
					info: { role: 'user' as const, agent: 'architect' },
					parts: [{ type: 'text', text: 'TASK: Do something' }],
				}],
			};
			const originalText = messages.messages[0].parts[0].text;

			await hook({}, messages);

			expect(messages.messages[0].parts[0].text).toBe(originalText);
		});
	});
});

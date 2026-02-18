import { describe, it, expect, beforeEach } from 'bun:test';
import { createGuardrailsHooks, hashArgs } from '../../../src/hooks/guardrails';
import { resetSwarmState, swarmState, startAgentSession, getAgentSession, ensureAgentSession, getActiveWindow, beginInvocation } from '../../../src/state';
import type { GuardrailsConfig } from '../../../src/config/schema';

	function defaultConfig(overrides?: Partial<GuardrailsConfig>): GuardrailsConfig {
		return {
			enabled: true,
			max_tool_calls: 200,
			max_duration_minutes: 30,
			idle_timeout_minutes: 60,
			max_repetitions: 10,
			max_consecutive_errors: 5,
			warning_threshold: 0.75,
			profiles: undefined,
			...overrides,
		};
	}

function makeInput(sessionID = 'test-session', tool = 'read', callID = 'call-1') {
	return { tool, sessionID, callID };
}

function makeOutput(args: unknown = { filePath: '/test.ts' }) {
	return { args };
}

function makeAfterOutput(output: string = 'success') {
	return { title: 'Result', output, metadata: {} };
}

describe('guardrails circuit breaker', () => {
	beforeEach(() => {
		resetSwarmState();
	});

	describe('disabled guardrails', () => {
		it('toolBefore does not throw when disabled', async () => {
			const config = defaultConfig({ enabled: false });
			const hooks = createGuardrailsHooks(config);

			const input = makeInput();
			const output = makeOutput();

			await hooks.toolBefore(input, output);
		});

		it('messagesTransform does not inject when disabled', async () => {
			const config = defaultConfig({ enabled: false });
			const hooks = createGuardrailsHooks(config);

			const messages = [{
				info: { role: 'assistant', sessionID: 'test-session' },
				parts: [{ type: 'text', text: 'Hello world' }],
			}];

			await hooks.messagesTransform({}, { messages });
			expect(messages[0].parts[0].text).toBe('Hello world');
		});
	});

	describe('toolBefore - tool call counting', () => {
		it('increments tool call count', async () => {
			const config = defaultConfig({ max_tool_calls: 100 });
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			for (let i = 0; i < 5; i++) {
				await hooks.toolBefore(makeInput('test-session'), makeOutput());
			}

			const window = getActiveWindow('test-session');
			expect(window?.toolCalls).toBe(5);
		});

		it('warning issued at threshold', async () => {
			const config = defaultConfig({
				max_tool_calls: 10,
				warning_threshold: 0.5,
				profiles: { explorer: { max_tool_calls: 10, warning_threshold: 0.5 } },
			});
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'explorer');

			// Use different args to avoid repetition detection
			for (let i = 0; i < 5; i++) {
				await hooks.toolBefore(
					makeInput('test-session', 'read', `call-${i}`),
					makeOutput({ filePath: `/test${i}.ts` }),
				);
			}

			const window = getActiveWindow('test-session');
			expect(window?.warningIssued).toBe(true);
		});

		it('throws at hard limit', async () => {
			const config = defaultConfig({
				max_tool_calls: 5,
				profiles: { coder: { max_tool_calls: 5 } },
			});
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			// First 4 should not throw (0-4 increments, but limit is 5)
			for (let i = 0; i < 4; i++) {
				await hooks.toolBefore(makeInput('test-session'), makeOutput());
			}

		// 5th call should throw
		await expect(hooks.toolBefore(makeInput('test-session'), makeOutput()))
			.rejects.toThrow('Tool calls exhausted');
		});

		it('blocks all subsequent calls after hard limit', async () => {
			const config = defaultConfig({
				max_tool_calls: 3,
				profiles: { coder: { max_tool_calls: 3 } },
			});
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			// First 2 should not throw
			for (let i = 0; i < 2; i++) {
				await hooks.toolBefore(makeInput('test-session'), makeOutput());
			}

		// 3rd call should throw and set hardLimitHit
		await expect(hooks.toolBefore(makeInput('test-session'), makeOutput()))
			.rejects.toThrow('Tool calls exhausted');

			// 4th call should also throw with different message
			await expect(hooks.toolBefore(makeInput('test-session'), makeOutput()))
				.rejects.toThrow('previously triggered');
		});
	});

	describe('toolBefore - duration', () => {
		it('throws at duration limit', async () => {
			const config = defaultConfig({
				max_duration_minutes: 30,
				profiles: { coder: { max_duration_minutes: 30 } },
			});
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			// First call creates the window via fallback beginInvocation
			await hooks.toolBefore(makeInput('test-session'), makeOutput());
			const window = getActiveWindow('test-session');
			if (window) {
				window.startedAtMs = Date.now() - 31 * 60000;
			}

			await expect(hooks.toolBefore(makeInput('test-session'), makeOutput()))
				.rejects.toThrow('Duration exhausted');
		});

		it('warning at duration threshold', async () => {
			const config = defaultConfig({
				max_duration_minutes: 30,
				warning_threshold: 0.5,
				profiles: { coder: { max_duration_minutes: 30, warning_threshold: 0.5 } },
			});
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			// First call creates the window
			await hooks.toolBefore(makeInput('test-session'), makeOutput());
			const window = getActiveWindow('test-session');
			if (window) {
				window.startedAtMs = Date.now() - 16 * 60000;
			}

			await hooks.toolBefore(makeInput('test-session'), makeOutput());

			const updatedWindow = getActiveWindow('test-session');
			expect(updatedWindow?.warningIssued).toBe(true);
		});
	});

	describe('toolBefore - repetition detection', () => {
		it('detects repeated identical tool calls', async () => {
			const config = defaultConfig({ max_repetitions: 3 });
			const hooks = createGuardrailsHooks(config);
			const args = { filePath: '/test.ts' };

			// First 2 calls should be fine (0, 1, 2 - third triggers)
			for (let i = 0; i < 2; i++) {
				await hooks.toolBefore(makeInput('test-session'), makeOutput(args));
			}

		// 3rd identical call should throw
		await expect(hooks.toolBefore(makeInput('test-session'), makeOutput(args)))
			.rejects.toThrow('Repeated the same tool call');
		});

		it('does not flag different tools', async () => {
			const config = defaultConfig({ max_repetitions: 3 });
			const hooks = createGuardrailsHooks(config);
			const args = { filePath: '/test.ts' };

			// Call with different tools but same args
			await hooks.toolBefore(makeInput('test-session', 'read'), makeOutput(args));
			await hooks.toolBefore(makeInput('test-session', 'grep'), makeOutput(args));
			await hooks.toolBefore(makeInput('test-session', 'edit'), makeOutput(args));

			// Should not throw
			await hooks.toolBefore(makeInput('test-session', 'glob'), makeOutput(args));
		});

		it('does not flag different args', async () => {
			const config = defaultConfig({ max_repetitions: 3 });
			const hooks = createGuardrailsHooks(config);

			// Call with same tool but different args
			await hooks.toolBefore(makeInput('test-session'), makeOutput({ filePath: '/test1.ts' }));
			await hooks.toolBefore(makeInput('test-session'), makeOutput({ filePath: '/test2.ts' }));
			await hooks.toolBefore(makeInput('test-session'), makeOutput({ filePath: '/test3.ts' }));

			// Should not throw
			await hooks.toolBefore(makeInput('test-session'), makeOutput({ filePath: '/test4.ts' }));
		});

		it('warning at repetition threshold', async () => {
			const config = defaultConfig({
				max_repetitions: 10,
				warning_threshold: 0.5,
				profiles: { coder: { max_repetitions: 10, warning_threshold: 0.5 } },
			});
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');
			const args = { filePath: '/test.ts' };

			// Make 5 identical calls (threshold is 5)
			for (let i = 0; i < 5; i++) {
				await hooks.toolBefore(makeInput('test-session'), makeOutput(args));
			}

			const window = getActiveWindow('test-session');
			expect(window?.warningIssued).toBe(true);

			// Should not throw yet
			await hooks.toolBefore(makeInput('test-session'), makeOutput(args));
		});
	});

	describe('toolBefore - consecutive errors', () => {
		it('throws at consecutive error limit', async () => {
			const config = defaultConfig({ max_consecutive_errors: 5 });
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			// First call creates the window
			await hooks.toolBefore(makeInput('test-session'), makeOutput());
			const window = getActiveWindow('test-session');
			if (window) {
				window.consecutiveErrors = 5;
			}

			await expect(hooks.toolBefore(makeInput('test-session'), makeOutput()))
				.rejects.toThrow('consecutive tool errors detected');
		});

		it('does not throw when errors under limit', async () => {
			const config = defaultConfig({ max_consecutive_errors: 5 });
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			// First call creates the window
			await hooks.toolBefore(makeInput('test-session'), makeOutput());
			const window = getActiveWindow('test-session');
			if (window) {
				window.consecutiveErrors = 4;
			}

			await hooks.toolBefore(makeInput('test-session'), makeOutput());
		});
	});

	describe('toolBefore - auto session creation', () => {
		it('auto-creates session if none exists', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			// Session should not exist initially
			expect(getAgentSession('new-session')).toBeUndefined();

			// Call toolBefore with non-existent session
			await hooks.toolBefore(makeInput('new-session'), makeOutput());

			// Session should now exist
			const session = getAgentSession('new-session');
			expect(session).toBeDefined();
			expect(session?.agentName).toBe('unknown');

			// Check window for tool call count
			const window = getActiveWindow('new-session');
			expect(window?.toolCalls).toBe(1);
		});
	});

	describe('toolAfter - error tracking', () => {
		it('increments consecutive errors on null output', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			// First call creates the window
			await hooks.toolBefore(makeInput('test-session'), makeOutput());
			const output = { title: 'Result', output: null as unknown as string, metadata: {} };
			await hooks.toolAfter(makeInput('test-session'), output);

			const window = getActiveWindow('test-session');
			expect(window?.consecutiveErrors).toBe(1);
		});

		it('increments consecutive errors on undefined output', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			// First call creates the window
			await hooks.toolBefore(makeInput('test-session'), makeOutput());
			const output = { title: 'Result', output: undefined as unknown as string, metadata: {} };
			await hooks.toolAfter(makeInput('test-session'), output);

			const window = getActiveWindow('test-session');
			expect(window?.consecutiveErrors).toBe(1);
		});

		it('resets consecutive errors on success', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			// First call creates the window
			await hooks.toolBefore(makeInput('test-session'), makeOutput());
			const window = getActiveWindow('test-session');
			if (window) {
				window.consecutiveErrors = 3;
			}

			// Success should reset
			const output = { title: 'Result', output: 'success', metadata: {} };
			await hooks.toolAfter(makeInput('test-session'), output);

			expect(window?.consecutiveErrors).toBe(0);
		});

		it('returns early with no session', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			// Should not throw even with no session
			const output = { title: 'Result', output: 'success', metadata: {} };
			await hooks.toolAfter(makeInput('nonexistent'), output);
		});
	});

	describe('messagesTransform', () => {
		it('injects warning when warningIssued', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			// First call creates the window
			await hooks.toolBefore(makeInput('test-session'), makeOutput());
			const window = getActiveWindow('test-session');
			if (window) {
				window.warningIssued = true;
			}

			const messages = [{
				info: { role: 'assistant', sessionID: 'test-session' },
				parts: [{ type: 'text', text: 'Hello world' }],
			}];

			await hooks.messagesTransform({}, { messages });

			expect(messages[0].parts[0].text).toContain('⚠️ APPROACHING LIMITS');
		});

		it('injects hard stop when hardLimitHit', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			// First call creates the window
			await hooks.toolBefore(makeInput('test-session'), makeOutput());
			const window = getActiveWindow('test-session');
			if (window) {
				window.hardLimitHit = true;
			}

			const messages = [{
				info: { role: 'assistant', sessionID: 'test-session' },
				parts: [{ type: 'text', text: 'Hello world' }],
			}];

			await hooks.messagesTransform({}, { messages });

			expect(messages[0].parts[0].text).toContain('🛑 LIMIT REACHED');
		});

		it('hard limit message takes precedence over warning', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			// Create window via beginInvocation
			beginInvocation('test-session', 'coder');
			const window = getActiveWindow('test-session');
			if (window) {
				window.warningIssued = true;
				window.hardLimitHit = true;
			}

			const messages = [{
				info: { role: 'assistant', sessionID: 'test-session' },
				parts: [{ type: 'text', text: 'Hello world' }],
			}];

			await hooks.messagesTransform({}, { messages });

			expect(messages[0].parts[0].text).toContain('🛑 LIMIT REACHED');
			expect(messages[0].parts[0].text).not.toContain('⚠️ APPROACHING LIMITS');
		});

		it('does nothing with no messages', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			await hooks.messagesTransform({}, { messages: [] });
		});

		it('does nothing with no active sessions', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			const messages = [{
				info: { role: 'assistant', sessionID: 'test-session' },
				parts: [{ type: 'text', text: 'Hello world' }],
			}];

			const originalText = messages[0].parts[0].text;

			await hooks.messagesTransform({}, { messages });

			expect(messages[0].parts[0].text).toBe(originalText);
		});

		// Fix 2: Session isolation tests - warnings from one session should not leak to another
		it('session A warning does NOT leak into session B', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			// Session A: coder hits warning
			startAgentSession('session-a', 'coder');
			await hooks.toolBefore(makeInput('session-a'), makeOutput());
			const windowA = getActiveWindow('session-a');
			if (windowA) {
				windowA.warningIssued = true;
			}

			// Session B: architect (no warning)
			startAgentSession('session-b', 'explorer');

			// Messages from session B should NOT get session A's warning
			const messages = [{
				info: { role: 'assistant', sessionID: 'session-b' },
				parts: [{ type: 'text', text: 'Explorer output' }],
			}];

			await hooks.messagesTransform({}, { messages });
			expect(messages[0].parts[0].text).toBe('Explorer output');
		});

		it('session A hard limit does NOT inject into session B', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			// Session A: coder hits hard limit
			startAgentSession('session-a', 'coder');
			await hooks.toolBefore(makeInput('session-a'), makeOutput());
			const windowA = getActiveWindow('session-a');
			if (windowA) {
				windowA.hardLimitHit = true;
			}

			// Session B messages should not get the hard limit
			const messages = [{
				info: { role: 'assistant', sessionID: 'session-b' },
				parts: [{ type: 'text', text: 'Other session output' }],
			}];

			await hooks.messagesTransform({}, { messages });
			expect(messages[0].parts[0].text).toBe('Other session output');
		});

		it('messages with no sessionID are not injected', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			// Create a session with a warning
			startAgentSession('session-a', 'coder');
			await hooks.toolBefore(makeInput('session-a'), makeOutput());
			const windowA = getActiveWindow('session-a');
			if (windowA) {
				windowA.hardLimitHit = true;
			}

			// Messages without sessionID should not get injection
			const messages = [{
				info: { role: 'assistant' },
				parts: [{ type: 'text', text: 'No session ID here' }],
			}];

			await hooks.messagesTransform({}, { messages });
			expect(messages[0].parts[0].text).toBe('No session ID here');
		});

		it('warning injection works for correct session', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			// Set up two sessions
			startAgentSession('session-a', 'coder');
			await hooks.toolBefore(makeInput('session-a'), makeOutput());
			const windowA = getActiveWindow('session-a');
			if (windowA) {
				windowA.warningIssued = true;
				windowA.warningReason = 'tool calls 150/200';
			}

			startAgentSession('session-b', 'explorer');

			// Session A messages SHOULD get the warning
			const messagesA = [{
				info: { role: 'assistant', sessionID: 'session-a' },
				parts: [{ type: 'text', text: 'Session A output' }],
			}];

			await hooks.messagesTransform({}, { messages: messagesA });
			expect(messagesA[0].parts[0].text).toContain('⚠️ APPROACHING LIMITS');
			expect(messagesA[0].parts[0].text).toContain('tool calls 150/200');

			// Session B messages should NOT get the warning
			const messagesB = [{
				info: { role: 'assistant', sessionID: 'session-b' },
				parts: [{ type: 'text', text: 'Session B output' }],
			}];

			await hooks.messagesTransform({}, { messages: messagesB });
			expect(messagesB[0].parts[0].text).toBe('Session B output');
		});
	});

	describe('hashArgs', () => {
		it('same args produce same hash', () => {
			const hash1 = hashArgs({ a: 1, b: 2 });
			const hash2 = hashArgs({ a: 1, b: 2 });
			expect(hash1).toBe(hash2);
		});

		it('different key order produces same hash', () => {
			const hash1 = hashArgs({ a: 1, b: 2 });
			const hash2 = hashArgs({ b: 2, a: 1 });
			expect(hash1).toBe(hash2);
		});

		it('different args produce different hash', () => {
			const hash1 = hashArgs({ a: 1 });
			const hash2 = hashArgs({ a: 2 });
			expect(hash1).not.toBe(hash2);
		});

		it('null returns 0', () => {
			expect(hashArgs(null)).toBe(0);
		});

		it('non-object returns 0', () => {
			expect(hashArgs('string')).toBe(0);
			expect(hashArgs(123)).toBe(0);
			expect(hashArgs(true)).toBe(0);
		});

		it('empty object returns a hash', () => {
			const hash = hashArgs({});
			expect(typeof hash).toBe('number');
			// It could be 0 or non-zero, both are valid
		});
	});

	describe('circular buffer', () => {
		it('limits recentToolCalls to 20 entries', async () => {
			const config = defaultConfig({ max_tool_calls: 1000 }); // High limit to avoid throwing
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			// Make 25 tool calls
			for (let i = 0; i < 25; i++) {
				await hooks.toolBefore(makeInput('test-session'), makeOutput({ index: i }));
			}

			const window = getActiveWindow('test-session');
			expect(window?.recentToolCalls.length).toBe(20);
		});
	});

		describe('per-agent profiles', () => {
	it('agent with profile gets higher tool call limit', async () => {
		const config = defaultConfig({
			max_tool_calls: 10,
			profiles: {
				coder: { max_tool_calls: 20 },
			},
		});
		const hooks = createGuardrailsHooks(config);

		// Create session with 'coder' agent - user profile override gives limit of 20
		startAgentSession('coder-session', 'coder');

		// Make 10 calls - should NOT throw (coder limit is 20 from user profile)
		for (let i = 0; i < 10; i++) {
			await hooks.toolBefore(
				makeInput('coder-session', `tool-${i}`, `call-${i}`),
				makeOutput({ arg: i }),
			);
		}
		// No error thrown - coder's limit of 20 not reached

		// Unknown agents now get base config limits (NOT architect unlimited)
		// Use unique session ID to avoid hardLimitHit flag pollution
		startAgentSession('default-session-unique', 'custom_agent');
		// Make 9 calls - should NOT throw (base config limit is 10, but implementation uses >= so only 9 succeed)
		// Use explicit loop counter to debug
		let callCount = 0;
		for (let i = 0; i < 9; i++) {
			callCount++;
			await hooks.toolBefore(
				makeInput('default-session-unique', `tool-${i}`, `call-d-${i}`),
				makeOutput({ arg: i }),
			);
		}
		// After 9 successful calls, the 10th call should throw - base config limit reached
		// Note: Once hard limit is hit, subsequent calls throw a different error
		await expect(
			hooks.toolBefore(
				makeInput('default-session-unique', 'tool-9', 'call-d-9'),
				makeOutput({ arg: 9 }),
			),
		).rejects.toThrow();
	});

		it('agent with user profile override uses custom limits', async () => {
			const config = defaultConfig({
				max_tool_calls: 5,
				profiles: {
					coder: { max_tool_calls: 100 }, // Coder gets high limit
					explorer: { max_tool_calls: 10 }, // Explorer gets custom limit
				},
			});
			const hooks = createGuardrailsHooks(config);

			// Create session with 'explorer' agent (has built-in profile + user override)
			startAgentSession('explorer-session', 'explorer');

			// Make 9 calls - should be fine (built-in is 150, user override is 10)
			for (let i = 0; i < 9; i++) {
				await hooks.toolBefore(
					makeInput('explorer-session', `tool-${i}`, `call-${i}`),
					makeOutput({ arg: i }),
				);
			}

			// 10th call should throw (user override limit is 10)
			await expect(
				hooks.toolBefore(
					makeInput('explorer-session', 'tool-10', 'call-10'),
					makeOutput({ arg: 10 }),
				),
			).rejects.toThrow('LIMIT REACHED');
		});

	it('custom agent (auto-created session) uses base config limits (not architect exempt)', async () => {
		const config = defaultConfig({
			max_tool_calls: 5,
			profiles: {
				coder: { max_tool_calls: 100 },
				explorer: { max_tool_calls: 50 },
			},
		});
		const hooks = createGuardrailsHooks(config);

		// Create a session with a custom agent name (not a built-in profile)
		// Unknown agents now get base config limits (not architect defaults)
		startAgentSession('unknown-session', 'custom_agent');

		// Make 4 calls - should NOT throw (base config limit is 5, but implementation uses >= so only 4 succeed)
		// Unknown agents should NOT be exempt from guardrails
		for (let i = 0; i < 4; i++) {
			await hooks.toolBefore(
				makeInput('unknown-session', `tool-${i}`, `call-${i}`),
				makeOutput({ arg: i }),
			);
		}
		// 5th call should throw - base config limit reached
		await expect(
			hooks.toolBefore(
				makeInput('unknown-session', 'tool-6', 'call-6'),
				makeOutput({ arg: 6 }),
			),
		).rejects.toThrow('LIMIT REACHED');
	});

		it('agent with profile gets different warning threshold', async () => {
			const config = defaultConfig({
				max_tool_calls: 100,
				warning_threshold: 0.5, // Base: warn at 50 calls
				profiles: {
					coder: { warning_threshold: 0.8 }, // Coder: warn at 80 calls (built-in is 400*0.85=340)
				},
			});
			const hooks = createGuardrailsHooks(config);

			// Coder session - should NOT warn at 50 calls (built-in threshold is 0.85, user override is 0.8)
			startAgentSession('coder-session', 'coder');
			for (let i = 0; i < 50; i++) {
				await hooks.toolBefore(
					makeInput('coder-session', `tool-${i}`, `call-c-${i}`),
					makeOutput({ arg: i }),
				);
			}
			const coderWindow = getActiveWindow('coder-session');
			expect(coderWindow?.warningIssued).toBe(false);

			// Explorer session - has built-in threshold of 0.75, max_tool_calls of 150
			// Warning at: 150 * 0.75 = 112.5 calls, so we need 113+ calls to trigger warning
			startAgentSession('explorer-session', 'explorer');
			for (let i = 0; i < 113; i++) {
				await hooks.toolBefore(
					makeInput('explorer-session', `tool-${i}`, `call-e-${i}`),
					makeOutput({ arg: i }),
				);
			}
			const explorerWindow = getActiveWindow('explorer-session');
			expect(explorerWindow?.warningIssued).toBe(true);
		});

		it('profile with max_consecutive_errors override works', async () => {
			const config = defaultConfig({
				max_consecutive_errors: 5,
				profiles: {
					tester: { max_consecutive_errors: 2 }, // Tester fails faster
				},
			});
			const hooks = createGuardrailsHooks(config);

			// Create tester session with 2 consecutive errors
			startAgentSession('tester-session', 'tester');
			// First call creates the window
			await hooks.toolBefore(makeInput('tester-session', 'tool-0', 'call-0'), makeOutput({ arg: 0 }));
			const testerWindow = getActiveWindow('tester-session');
			if (testerWindow) {
				testerWindow.consecutiveErrors = 2;
			}

			// Next tool call should throw (tester limit is 2)
			await expect(
				hooks.toolBefore(
					makeInput('tester-session', 'tool-1', 'call-1'),
					makeOutput({ arg: 1 }),
				),
			).rejects.toThrow('consecutive tool errors detected');

			// But explorer session with 2 errors should be fine
			startAgentSession('explorer-session', 'explorer');
			// First call creates the window
			await hooks.toolBefore(makeInput('explorer-session', 'tool-0', 'call-0'), makeOutput({ arg: 0 }));
			const explorerWindow = getActiveWindow('explorer-session');
			if (explorerWindow) {
				explorerWindow.consecutiveErrors = 2;
			}

			// Next tool call should NOT throw (explorer limit is 5, uses base config)
			await hooks.toolBefore(
				makeInput('explorer-session', 'tool-2', 'call-2'),
				makeOutput({ arg: 2 }),
			);
		});

		it('profile with max_repetitions override works', async () => {
			const config = defaultConfig({
				max_repetitions: 10,
				profiles: {
					coder: { max_repetitions: 3 }, // Coder blocks repetitions faster
				},
			});
			const args = { filePath: '/test.ts' };

			// Coder session - should throw at 3rd call (repetitionCount >= 3)
			let hooks = createGuardrailsHooks(config);
			startAgentSession('coder-session', 'coder');
			// First 2 calls should be fine
			await hooks.toolBefore(
				makeInput('coder-session', 'read', 'call-1'),
				makeOutput(args),
			);
			await hooks.toolBefore(
				makeInput('coder-session', 'read', 'call-2'),
				makeOutput(args),
			);

			// 3rd identical call should throw for coder (repetitionCount = 3, limit is 3)
			await expect(
				hooks.toolBefore(
					makeInput('coder-session', 'read', 'call-3'),
					makeOutput(args),
				),
			).rejects.toThrow('Repeated the same tool call');

			// Reset state and create new hooks for sme session (uses base limit)
			resetSwarmState();
			hooks = createGuardrailsHooks(config);

			// sme session can have more repetitions (uses base limit of 10, since no user profile)
			startAgentSession('sme-session', 'sme');
			for (let i = 0; i < 9; i++) {
				await hooks.toolBefore(
					makeInput('sme-session', 'read', `call-s-${i}`),
					makeOutput(args),
				);
			}
			// 9th call is fine (repetitionCount = 9 < 10)
			// 10th call should throw (repetitionCount = 10 >= 10)
			await expect(
				hooks.toolBefore(
					makeInput('sme-session', 'read', 'call-s-9'),
					makeOutput(args),
				),
			).rejects.toThrow('Repeated the same tool call');
		});
	});

	describe('toolBefore - unlimited duration (0)', () => {
		it('does not throw when max_duration_minutes is 0 even after long time', async () => {
			const config = defaultConfig({ max_duration_minutes: 0 });
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'unknown');

			// First call creates the window
			await hooks.toolBefore(makeInput('test-session'), makeOutput());
			const window = getActiveWindow('test-session');
			if (window) {
				window.startedAtMs = Date.now() - 500 * 60000;
				// Keep lastSuccessTimeMs recent to avoid idle timeout
				window.lastSuccessTimeMs = Date.now();
			}

			// Should NOT throw — duration is unlimited
			await hooks.toolBefore(makeInput('test-session'), makeOutput());
		});

		it('does not issue duration warning when max_duration_minutes is 0', async () => {
			const config = defaultConfig({ max_duration_minutes: 0, warning_threshold: 0.5 });
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'unknown');

			// First call creates the window
			await hooks.toolBefore(makeInput('test-session'), makeOutput());
			const window = getActiveWindow('test-session');
			if (window) {
				window.startedAtMs = Date.now() - 100 * 60000;
				window.lastSuccessTimeMs = Date.now();
			}

			await hooks.toolBefore(makeInput('test-session'), makeOutput());

			const updatedWindow = getActiveWindow('test-session');
			// Warning should NOT be issued for duration (other limits may warn)
			expect(updatedWindow?.warningIssued).toBe(false);
		});

		it('architect profile has unlimited duration by default', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			// Set up architect session
			swarmState.activeAgent.set('arch-session', 'architect');
			startAgentSession('arch-session', 'architect');

			// First call creates the window
			await hooks.toolBefore(makeInput('arch-session'), makeOutput());
			const window = getActiveWindow('arch-session');
			if (window) {
				window.startedAtMs = Date.now() - 200 * 60000;
				window.lastSuccessTimeMs = Date.now();
			}

			// Should NOT throw — architect has max_duration_minutes: 0 (unlimited)
			await hooks.toolBefore(makeInput('arch-session'), makeOutput());
		});
	});

	describe('toolBefore - agent switching regression', () => {
		it('switches guardrail profile when active agent changes in same session', async () => {
			const config = defaultConfig({ max_duration_minutes: 30 });
			const hooks = createGuardrailsHooks(config);

			// Step 1: Start as critic with tight duration limit
			swarmState.activeAgent.set('shared-session', 'critic');
			startAgentSession('shared-session', 'critic');

			// First call creates the window
			await hooks.toolBefore(makeInput('shared-session'), makeOutput());
			const window = getActiveWindow('shared-session');
			if (window) {
				window.startedAtMs = Date.now() - 35 * 60000; // 35 min ago
				window.lastSuccessTimeMs = Date.now();
			}

			// Step 2: Verify critic session throws due to duration
			await expect(
				hooks.toolBefore(makeInput('shared-session'), makeOutput()),
			).rejects.toThrow('Duration exhausted');

			// Step 3: Clear hard limit and switch active agent to architect
			if (window) {
				window.hardLimitHit = false;
			}
			swarmState.activeAgent.set('shared-session', 'architect');

			// Step 4: Call ensureAgentSession to trigger the agent switch
			const { ensureAgentSession: localEnsureAgentSession } = await import('../../../src/state');
			localEnsureAgentSession('shared-session', 'architect');

			// Verify session agent is now architect
			expect(getAgentSession('shared-session')?.agentName).toBe('architect');

			// Step 5: Verify architect has unlimited duration (max_duration_minutes = 0)
			// Since architect's duration is unlimited (0), it should not throw
			// even though the session is old
			await hooks.toolBefore(makeInput('shared-session'), makeOutput());
		});
	});

	describe('toolBefore - unlimited tool calls (0)', () => {
		it('does not throw when max_tool_calls is 0 even after many calls', async () => {
			const config = defaultConfig({ max_tool_calls: 0 });
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'unknown');

			// Make 1000 tool calls
			for (let i = 0; i < 1000; i++) {
				await hooks.toolBefore(
					makeInput('test-session', 'tool', `call-${i}`),
					makeOutput({ index: i }),
				);
			}

			const window = getActiveWindow('test-session');
			// Unknown agent is tracked but max_tool_calls=0 means unlimited
			expect(window?.toolCalls).toBe(1000);
			expect(window?.hardLimitHit).toBe(false);
		});

		it('does not issue tool call warning when max_tool_calls is 0', async () => {
			const config = defaultConfig({
				max_tool_calls: 0,
				warning_threshold: 0.1,
				max_duration_minutes: 30, // Use normal duration limit (not 0, which would exempt the agent)
				idle_timeout_minutes: 1000, // High to avoid idle warning
				max_repetitions: 1000, // High to avoid repetition warning
			});
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'unknown');

			// Make one call to create the window
			await hooks.toolBefore(
				makeInput('test-session', 'tool-0', 'call-0'),
				makeOutput({ index: 0 }),
			);
			await hooks.toolAfter(
				makeInput('test-session', 'tool-0', 'call-0'),
				makeAfterOutput('success'),
			);

			const window = getActiveWindow('test-session');
			// Unknown agent is tracked but max_tool_calls=0 means unlimited (no warning)
			expect(window?.warningIssued).toBe(false);
		});

		it('architect profile has unlimited tool calls by default', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			// Set up architect session
			swarmState.activeAgent.set('arch-session', 'architect');
			startAgentSession('arch-session', 'architect');

			// Make many calls - should not throw
			for (let i = 0; i < 500; i++) {
				await hooks.toolBefore(
					makeInput('arch-session', 'tool', `call-${i}`),
					makeOutput({ index: i }),
				);
			}

			// Verify no error was thrown (architect exemption early returns before counting)
			expect(true).toBe(true);
		});
	});

	describe('toolBefore - idle timeout', () => {
		it('throws when idle timeout exceeded', async () => {
			const config = defaultConfig({ idle_timeout_minutes: 30 });
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'unknown');

			// First call creates the window
			await hooks.toolBefore(makeInput('test-session'), makeOutput());
			const window = getActiveWindow('test-session');
			if (window) {
				window.lastSuccessTimeMs = Date.now() - 31 * 60000;
			}

			await expect(hooks.toolBefore(makeInput('test-session'), makeOutput()))
				.rejects.toThrow('No successful tool call for');
		});

		it('does not throw when idle timeout not exceeded', async () => {
			const config = defaultConfig({ idle_timeout_minutes: 30 });
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'unknown');

			// lastSuccessTimeMs is set to now by startAgentSession, so should be fine
			await hooks.toolBefore(makeInput('test-session'), makeOutput());
		});

		it('idle timeout resets on successful tool call', async () => {
			const config = defaultConfig({ idle_timeout_minutes: 30 });
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'unknown');

			// First call creates the window
			await hooks.toolBefore(makeInput('test-session'), makeOutput());
			const window = getActiveWindow('test-session');
			if (window) {
				window.lastSuccessTimeMs = Date.now() - 29 * 60000;
			}

			// Should not throw
			await hooks.toolBefore(makeInput('test-session'), makeOutput());

			// Simulate successful tool call via toolAfter
			await hooks.toolAfter(makeInput('test-session'), { title: 'Result', output: 'success', metadata: {} });

			// Now set the time again — it should have been reset by toolAfter
			const updatedWindow = getActiveWindow('test-session');
			expect(updatedWindow?.lastSuccessTimeMs).toBeGreaterThan(Date.now() - 1000);
		});
	});

	describe('toolAfter - lastSuccessTimeMs tracking', () => {
		it('updates lastSuccessTimeMs on success', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			// First call creates the window
			await hooks.toolBefore(makeInput('test-session'), makeOutput());
			const window = getActiveWindow('test-session');
			if (window) {
				window.lastSuccessTimeMs = Date.now() - 60000;
			}

			const beforeTime = Date.now();
			await hooks.toolAfter(makeInput('test-session'), { title: 'Result', output: 'success', metadata: {} });

			expect(window?.lastSuccessTimeMs).toBeGreaterThanOrEqual(beforeTime);
		});

		it('does not update lastSuccessTimeMs on null output', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			// First call creates the window
			await hooks.toolBefore(makeInput('test-session'), makeOutput());
			const window = getActiveWindow('test-session');
			const oldTime = Date.now() - 60000;
			if (window) {
				window.lastSuccessTimeMs = oldTime;
			}

			await hooks.toolAfter(makeInput('test-session'), { title: 'Result', output: null as unknown as string, metadata: {} });

			expect(window?.lastSuccessTimeMs).toBe(oldTime);
		});

		it('does not update lastSuccessTimeMs on undefined output', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			// First call creates the window
			await hooks.toolBefore(makeInput('test-session'), makeOutput());
			const window = getActiveWindow('test-session');
			const oldTime = Date.now() - 60000;
			if (window) {
				window.lastSuccessTimeMs = oldTime;
			}

			await hooks.toolAfter(makeInput('test-session'), { title: 'Result', output: undefined as unknown as string, metadata: {} });

			expect(window?.lastSuccessTimeMs).toBe(oldTime);
		});
	});

	describe('architect exemption', () => {
		it('architect bypasses tool call limit', async () => {
			const config = defaultConfig({ max_tool_calls: 10 });
			const hooks = createGuardrailsHooks(config);

			// Set activeAgent to architect
			swarmState.activeAgent.set('architect-session', 'architect');

			// Make 500+ tool calls - should NOT throw
			for (let i = 0; i < 500; i++) {
				await hooks.toolBefore(
					makeInput('architect-session', `tool-${i}`, `call-${i}`),
					makeOutput({ index: i }),
				);
			}

			const session = getAgentSession('architect-session');
			// Session should not exist or have toolCallCount because toolBefore returned early
			// Actually, with architect exemption, toolBefore returns early so session may not exist
			// Let's verify no error was thrown
			expect(true).toBe(true);
		});

		it('architect bypasses duration limit', async () => {
			const config = defaultConfig({ max_duration_minutes: 30 });
			const hooks = createGuardrailsHooks(config);

			// Set activeAgent to architect and start session
			swarmState.activeAgent.set('architect-session', 'architect');
			startAgentSession('architect-session', 'architect');

			// First call creates the window
			await hooks.toolBefore(makeInput('architect-session'), makeOutput());
			const window = getActiveWindow('architect-session');
			if (window) {
				window.startedAtMs = Date.now() - 60 * 60000;
				window.lastSuccessTimeMs = Date.now();
			}

			// Should NOT throw despite being 60 minutes old
			await hooks.toolBefore(makeInput('architect-session'), makeOutput());
		});

		it('prefixed architect bypasses guardrails', async () => {
			const config = defaultConfig({ max_tool_calls: 5 });
			const hooks = createGuardrailsHooks(config);

			// Set activeAgent to prefixed architect (e.g., mega_architect)
			swarmState.activeAgent.set('mega-session', 'mega_architect');

			// Make 10 calls - should NOT throw because prefix is stripped
			for (let i = 0; i < 10; i++) {
				await hooks.toolBefore(
					makeInput('mega-session', `tool-${i}`, `call-${i}`),
					makeOutput({ index: i }),
				);
			}

			// Verify no error thrown
			expect(true).toBe(true);
		});

		it('non-architect still gets blocked', async () => {
			const config = defaultConfig({
				max_tool_calls: 5,
				profiles: { coder: { max_tool_calls: 5 } },
			});
			const hooks = createGuardrailsHooks(config);

			// Set activeAgent to coder (not exempt)
			swarmState.activeAgent.set('coder-session', 'coder');
			startAgentSession('coder-session', 'coder');

			// Make 4 calls - should not throw
			for (let i = 0; i < 4; i++) {
				await hooks.toolBefore(makeInput('coder-session', `tool-${i}`, `call-${i}`), makeOutput({ index: i }));
			}

			// 5th call should throw
			await expect(
				hooks.toolBefore(makeInput('coder-session', 'tool-5', 'call-5'), makeOutput({ index: 5 })),
			).rejects.toThrow('LIMIT REACHED');
		});

		it('undefined activeAgent (no mapping) does NOT bypass', async () => {
			const config = defaultConfig({ max_repetitions: 3 });
			const hooks = createGuardrailsHooks(config);

			// Do NOT set activeAgent mapping
			// Tool call will create a session with agentName from ensureAgentSession which defaults to 'unknown'
			// Unknown agents get architect defaults (unlimited tool/duration limits), but repetition still applies

			const args = { filePath: '/test.ts' };

			// Make 2 identical calls - should not throw
			await hooks.toolBefore(makeInput('no-agent-session', 'read', 'call-1'), makeOutput(args));
			await hooks.toolBefore(makeInput('no-agent-session', 'read', 'call-2'), makeOutput(args));

			// 3rd identical call should throw because guardrails still apply (not architect)
			await expect(
				hooks.toolBefore(makeInput('no-agent-session', 'read', 'call-3'), makeOutput(args)),
			).rejects.toThrow('Repeated the same tool call');
		});
	});

	describe('architect exemption bug fix - stale delegation', () => {
		it('exempts when activeAgent is subagent but session.agentName resolved to architect', async () => {
			// This tests the SECOND exemption check in guardrails.ts after session resolution
			const config = defaultConfig({ max_tool_calls: 5 });
			const hooks = createGuardrailsHooks(config);

			// Set activeAgent to a subagent (simulating stale state)
			swarmState.activeAgent.set('stale-session', 'mega_coder');

			// Create a session with architect (simulating stale delegation revert from index.ts)
			startAgentSession('stale-session', 'architect');

			// Make many calls - should NOT throw because session.agentName is architect
			for (let i = 0; i < 10; i++) {
				await hooks.toolBefore(
					makeInput('stale-session', `tool-${i}`, `call-${i}`),
					makeOutput({ index: i }),
				);
			}

			// Verify no error thrown - second exemption check caught this
			expect(true).toBe(true);
		});

		it('exempts when activeAgent is prefixed architect (mega_architect)', async () => {
			// This tests the FIRST exemption check with stripKnownSwarmPrefix
			const config = defaultConfig({ max_tool_calls: 5 });
			const hooks = createGuardrailsHooks(config);

			// Set activeAgent to prefixed architect
			swarmState.activeAgent.set('mega-arch-session', 'mega_architect');

			// Make many calls - should NOT throw because stripped name is 'architect'
			for (let i = 0; i < 10; i++) {
				await hooks.toolBefore(
					makeInput('mega-arch-session', `tool-${i}`, `call-${i}`),
					makeOutput({ index: i }),
				);
			}

			// Verify no error thrown
			expect(true).toBe(true);
		});

		it('exempts when activeAgent is bare "architect"', async () => {
			// This tests the FIRST exemption check with exact architect match
			const config = defaultConfig({ max_tool_calls: 5 });
			const hooks = createGuardrailsHooks(config);

			// Set activeAgent to bare architect
			swarmState.activeAgent.set('arch-bare-session', 'architect');

			// Make many calls - should NOT throw
			for (let i = 0; i < 10; i++) {
				await hooks.toolBefore(
					makeInput('arch-bare-session', `tool-${i}`, `call-${i}`),
					makeOutput({ index: i }),
				);
			}

			// Verify no error thrown
			expect(true).toBe(true);
		});

		it('subagent with fresh delegation is NOT exempt', async () => {
			// This tests that subagents with fresh delegation still get guardrails applied
			const config = defaultConfig({
				max_tool_calls: 5,
				profiles: { coder: { max_tool_calls: 5 } },
			});
			const hooks = createGuardrailsHooks(config);

			// Set activeAgent to subagent with prefixed name
			swarmState.activeAgent.set('fresh-subagent', 'mega_coder');

			// Create session with coder (fresh delegation)
			startAgentSession('fresh-subagent', 'mega_coder');
			const session = getAgentSession('fresh-subagent');
			if (session) {
				session.delegationActive = true;
				session.lastToolCallTime = Date.now(); // Fresh
			}

			// Make 4 calls - should not throw
			for (let i = 0; i < 4; i++) {
				await hooks.toolBefore(
					makeInput('fresh-subagent', `tool-${i}`, `call-${i}`),
					makeOutput({ index: i }),
				);
			}

			// 5th call should throw - subagent is NOT exempt
			await expect(
				hooks.toolBefore(makeInput('fresh-subagent', 'tool-5', 'call-5'), makeOutput({ index: 5 })),
			).rejects.toThrow('LIMIT REACHED');
		});

		it('prefixed subagent name (mega_coder) gets guardrails applied', async () => {
			// This tests that prefixed subagent names are properly stripped and checked
			const config = defaultConfig({
				max_tool_calls: 3,
				profiles: { coder: { max_tool_calls: 3 } },
			});
			const hooks = createGuardrailsHooks(config);

			// Set activeAgent to prefixed coder
			swarmState.activeAgent.set('prefixed-coder', 'mega_coder');

			// Make 2 calls - should not throw
			for (let i = 0; i < 2; i++) {
				await hooks.toolBefore(
					makeInput('prefixed-coder', `tool-${i}`, `call-${i}`),
					makeOutput({ index: i }),
				);
			}

			// 3rd call should throw - coder is NOT exempt
			await expect(
				hooks.toolBefore(makeInput('prefixed-coder', 'tool-3', 'call-3'), makeOutput({ index: 3 })),
			).rejects.toThrow('LIMIT REACHED');
		});

		it('session agentName change to architect exempts from guardrails', async () => {
			// This simulates the scenario where ensureAgentSession updates agentName to architect
			const config = defaultConfig({ max_tool_calls: 5 });
			const hooks = createGuardrailsHooks(config);

			// Start with subagent in activeAgent map
			swarmState.activeAgent.set('switched-session', 'mega_coder');

			// But session was already updated to architect (by stale delegation revert)
			startAgentSession('switched-session', 'architect');

			// Make many calls - should NOT throw
			for (let i = 0; i < 10; i++) {
				await hooks.toolBefore(
					makeInput('switched-session', `tool-${i}`, `call-${i}`),
					makeOutput({ index: i }),
				);
			}

			// Verify no error thrown
			expect(true).toBe(true);
		});

		it('subagent duration >30m then delegation ends should not block architect tool call', async () => {
			// Regression test: when subagent session exceeds 30 minutes, then delegation ends
			// (input.agent missing), architect tool call should NOT be blocked
			const config = defaultConfig({
				max_duration_minutes: 30,
				profiles: { coder: { max_duration_minutes: 30 } },
			});
			const hooks = createGuardrailsHooks(config);

			// Step 1: Start as subagent (coder) - simulates a subagent running for >30 minutes
			swarmState.activeAgent.set('delegation-ended-session', 'coder');
			startAgentSession('delegation-ended-session', 'coder');

			// First call creates the window
			await hooks.toolBefore(makeInput('delegation-ended-session', 'read', 'call-1'), makeOutput());
			const window = getActiveWindow('delegation-ended-session');
			if (window) {
				window.startedAtMs = Date.now() - 31 * 60000;
				window.lastSuccessTimeMs = Date.now() - 31 * 60000;
			}

			// Verify coder session would throw due to duration limit
			await expect(
				hooks.toolBefore(makeInput('delegation-ended-session', 'read', 'call-2'), makeOutput()),
			).rejects.toThrow('Duration exhausted');

			// Step 2: Delegation ends - simulate input.agent missing/empty
			// This is what happens in delegation-tracker.ts when input.agent is empty
			// It calls ensureAgentSession with 'architect', which resets startTime to now
			ensureAgentSession('delegation-ended-session', 'architect');

			// Step 3: Verify architect tool call does NOT throw (should be exempt)
			// This should NOT throw because:
			// 1. ensureAgentSession reset startTime to now (duration tracking starts fresh)
			// 2. Architect has unlimited duration (max_duration_minutes: 0 from defaults)
			await hooks.toolBefore(
				makeInput('delegation-ended-session', 'read', 'call-2'),
				makeOutput(),
			);

			// Verify no error was thrown - architect is exempt
			const session = getAgentSession('delegation-ended-session');
			expect(session?.agentName).toBe('architect');
		});
	});
});

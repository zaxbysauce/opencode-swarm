import { describe, it, expect, beforeEach, vi } from 'bun:test';
import { createGuardrailsHooks, hashArgs } from '../../src/hooks/guardrails';
import { resetSwarmState, swarmState, startAgentSession, getAgentSession, ensureAgentSession, getActiveWindow, beginInvocation } from '../../src/state';
import type { GuardrailsConfig } from '../../src/config/schema';
import * as utilsModule from '../../src/utils';

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

			for (let i = 0; i < 4; i++) {
				await hooks.toolBefore(makeInput('test-session'), makeOutput());
			}

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

			for (let i = 0; i < 2; i++) {
				await hooks.toolBefore(makeInput('test-session'), makeOutput());
			}

			await expect(hooks.toolBefore(makeInput('test-session'), makeOutput()))
				.rejects.toThrow('Tool calls exhausted');

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
			startAgentSession('test-session', 'coder');
			const args = { filePath: '/test.ts' };

			for (let i = 0; i < 2; i++) {
				await hooks.toolBefore(makeInput('test-session'), makeOutput(args));
			}

			await expect(hooks.toolBefore(makeInput('test-session'), makeOutput(args)))
				.rejects.toThrow('Repeated the same tool call');
		});

		it('does not flag different tools', async () => {
			const config = defaultConfig({ max_repetitions: 3 });
			const hooks = createGuardrailsHooks(config);
			const args = { filePath: '/test.ts' };

			await hooks.toolBefore(makeInput('test-session', 'read'), makeOutput(args));
			await hooks.toolBefore(makeInput('test-session', 'grep'), makeOutput(args));
			await hooks.toolBefore(makeInput('test-session', 'edit'), makeOutput(args));

			await hooks.toolBefore(makeInput('test-session', 'glob'), makeOutput(args));
		});

		it('does not flag different args', async () => {
			const config = defaultConfig({ max_repetitions: 3 });
			const hooks = createGuardrailsHooks(config);

			await hooks.toolBefore(makeInput('test-session'), makeOutput({ filePath: '/test1.ts' }));
			await hooks.toolBefore(makeInput('test-session'), makeOutput({ filePath: '/test2.ts' }));
			await hooks.toolBefore(makeInput('test-session'), makeOutput({ filePath: '/test3.ts' }));

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

			for (let i = 0; i < 5; i++) {
				await hooks.toolBefore(makeInput('test-session'), makeOutput(args));
			}

			const window = getActiveWindow('test-session');
			expect(window?.warningIssued).toBe(true);

			await hooks.toolBefore(makeInput('test-session'), makeOutput(args));
		});
	});

	describe('toolBefore - consecutive errors', () => {
		it('throws at consecutive error limit', async () => {
			const config = defaultConfig({ max_consecutive_errors: 5 });
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

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

			expect(getAgentSession('new-session')).toBeUndefined();

			await hooks.toolBefore(makeInput('new-session'), makeOutput());

			const session = getAgentSession('new-session');
			expect(session).toBeDefined();
			expect(session?.agentName).toBe('architect');

			const window = getActiveWindow('new-session');
			expect(window).toBeUndefined();
		});
	});

	describe('toolAfter - error tracking', () => {
		it('increments consecutive errors on null output', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

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

			await hooks.toolBefore(makeInput('test-session'), makeOutput());
			const window = getActiveWindow('test-session');
			if (window) {
				window.consecutiveErrors = 3;
			}

			const output = { title: 'Result', output: 'success', metadata: {} };
			await hooks.toolAfter(makeInput('test-session'), output);

			expect(window?.consecutiveErrors).toBe(0);
		});

		it('returns early with no session', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			const output = { title: 'Result', output: 'success', metadata: {} };
			await hooks.toolAfter(makeInput('nonexistent'), output);
		});
	});

	describe('messagesTransform', () => {
		it('injects warning when warningIssued', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

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

		it('session A warning does NOT leak into session B', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			startAgentSession('session-a', 'coder');
			await hooks.toolBefore(makeInput('session-a'), makeOutput());
			const windowA = getActiveWindow('session-a');
			if (windowA) {
				windowA.warningIssued = true;
			}

			startAgentSession('session-b', 'explorer');

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

			startAgentSession('session-a', 'coder');
			await hooks.toolBefore(makeInput('session-a'), makeOutput());
			const windowA = getActiveWindow('session-a');
			if (windowA) {
				windowA.hardLimitHit = true;
			}

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

			startAgentSession('session-a', 'coder');
			await hooks.toolBefore(makeInput('session-a'), makeOutput());
			const windowA = getActiveWindow('session-a');
			if (windowA) {
				windowA.hardLimitHit = true;
			}

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

			startAgentSession('session-a', 'coder');
			await hooks.toolBefore(makeInput('session-a'), makeOutput());
			const windowA = getActiveWindow('session-a');
			if (windowA) {
				windowA.warningIssued = true;
				windowA.warningReason = 'tool calls 150/200';
			}

			startAgentSession('session-b', 'explorer');

			const messagesA = [{
				info: { role: 'assistant', sessionID: 'session-a' },
				parts: [{ type: 'text', text: 'Session A output' }],
			}];

			await hooks.messagesTransform({}, { messages: messagesA });
			expect(messagesA[0].parts[0].text).toContain('⚠️ APPROACHING LIMITS');
			expect(messagesA[0].parts[0].text).toContain('tool calls 150/200');

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
		});
	});

	describe('circular buffer', () => {
		it('limits recentToolCalls to 20 entries', async () => {
			const config = defaultConfig({ max_tool_calls: 1000 });
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

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

			startAgentSession('coder-session', 'coder');

			for (let i = 0; i < 10; i++) {
				await hooks.toolBefore(
					makeInput('coder-session', `tool-${i}`, `call-${i}`),
					makeOutput({ arg: i }),
				);
			}

			startAgentSession('default-session-unique', 'custom_agent');
			let callCount = 0;
			for (let i = 0; i < 9; i++) {
				callCount++;
				await hooks.toolBefore(
					makeInput('default-session-unique', `tool-${i}`, `call-d-${i}`),
					makeOutput({ arg: i }),
				);
			}

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
					coder: { max_tool_calls: 100 },
					explorer: { max_tool_calls: 10 },
				},
			});
			const hooks = createGuardrailsHooks(config);

			startAgentSession('explorer-session', 'explorer');

			for (let i = 0; i < 9; i++) {
				await hooks.toolBefore(
					makeInput('explorer-session', `tool-${i}`, `call-${i}`),
					makeOutput({ arg: i }),
				);
			}

			await expect(
				hooks.toolBefore(
					makeInput('explorer-session', 'tool-10', 'call-10'),
					makeOutput({ arg: 10 }),
				),
			).rejects.toThrow('LIMIT REACHED');
		});

		it('custom agent uses base config limits', async () => {
			const config = defaultConfig({
				max_tool_calls: 5,
				profiles: {
					coder: { max_tool_calls: 100 },
					explorer: { max_tool_calls: 50 },
				},
			});
			const hooks = createGuardrailsHooks(config);

			startAgentSession('unknown-session', 'custom_agent');

			for (let i = 0; i < 4; i++) {
				await hooks.toolBefore(
					makeInput('unknown-session', `tool-${i}`, `call-${i}`),
					makeOutput({ arg: i }),
				);
			}

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
				warning_threshold: 0.5,
				profiles: {
					coder: { warning_threshold: 0.8 },
				},
			});
			const hooks = createGuardrailsHooks(config);

			startAgentSession('coder-session', 'coder');
			for (let i = 0; i < 50; i++) {
				await hooks.toolBefore(
					makeInput('coder-session', `tool-${i}`, `call-c-${i}`),
					makeOutput({ arg: i }),
				);
			}
			const coderWindow = getActiveWindow('coder-session');
			expect(coderWindow?.warningIssued).toBe(false);

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
					tester: { max_consecutive_errors: 2 },
				},
			});
			const hooks = createGuardrailsHooks(config);

			startAgentSession('tester-session', 'tester');
			await hooks.toolBefore(makeInput('tester-session', 'tool-0', 'call-0'), makeOutput({ arg: 0 }));
			const testerWindow = getActiveWindow('tester-session');
			if (testerWindow) {
				testerWindow.consecutiveErrors = 2;
			}

			await expect(
				hooks.toolBefore(
					makeInput('tester-session', 'tool-1', 'call-1'),
					makeOutput({ arg: 1 }),
				),
			).rejects.toThrow('consecutive tool errors detected');

			startAgentSession('explorer-session', 'explorer');
			await hooks.toolBefore(makeInput('explorer-session', 'tool-0', 'call-0'), makeOutput({ arg: 0 }));
			const explorerWindow = getActiveWindow('explorer-session');
			if (explorerWindow) {
				explorerWindow.consecutiveErrors = 2;
			}

			await hooks.toolBefore(
				makeInput('explorer-session', 'tool-2', 'call-2'),
				makeOutput({ arg: 2 }),
			);
		});

		it('profile with max_repetitions override works', async () => {
			const config = defaultConfig({
				max_repetitions: 10,
				profiles: {
					coder: { max_repetitions: 3 },
				},
			});
			const args = { filePath: '/test.ts' };

			let hooks = createGuardrailsHooks(config);
			startAgentSession('coder-session', 'coder');
			await hooks.toolBefore(
				makeInput('coder-session', 'read', 'call-1'),
				makeOutput(args),
			);
			await hooks.toolBefore(
				makeInput('coder-session', 'read', 'call-2'),
				makeOutput(args),
			);

			await expect(
				hooks.toolBefore(
					makeInput('coder-session', 'read', 'call-3'),
					makeOutput(args),
				),
			).rejects.toThrow('Repeated the same tool call');

			resetSwarmState();
			hooks = createGuardrailsHooks(config);

			startAgentSession('sme-session', 'sme');
			for (let i = 0; i < 9; i++) {
				await hooks.toolBefore(
					makeInput('sme-session', 'read', `call-s-${i}`),
					makeOutput(args),
				);
			}

			await expect(
				hooks.toolBefore(
					makeInput('sme-session', 'read', 'call-s-9'),
					makeOutput(args),
				),
			).rejects.toThrow('Repeated the same tool call');
		});
	});

	describe('toolBefore - unlimited duration (0)', () => {
		it('does not throw when max_duration_minutes is 0', async () => {
			const config = defaultConfig({ max_duration_minutes: 0 });
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'unknown');

			await hooks.toolBefore(makeInput('test-session'), makeOutput());
			const window = getActiveWindow('test-session');
			if (window) {
				window.startedAtMs = Date.now() - 500 * 60000;
				window.lastSuccessTimeMs = Date.now();
			}

			await hooks.toolBefore(makeInput('test-session'), makeOutput());
		});

		it('architect profile has unlimited duration by default', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			swarmState.activeAgent.set('arch-session', 'architect');
			startAgentSession('arch-session', 'architect');

			await hooks.toolBefore(makeInput('arch-session'), makeOutput());
			const window = getActiveWindow('arch-session');
			if (window) {
				window.startedAtMs = Date.now() - 200 * 60000;
				window.lastSuccessTimeMs = Date.now();
			}

			await hooks.toolBefore(makeInput('arch-session'), makeOutput());
		});
	});

	describe('toolBefore - agent switching regression', () => {
		it('switches guardrail profile when active agent changes', async () => {
			const config = defaultConfig({ max_duration_minutes: 30 });
			const hooks = createGuardrailsHooks(config);

			swarmState.activeAgent.set('shared-session', 'critic');
			startAgentSession('shared-session', 'critic');

			await hooks.toolBefore(makeInput('shared-session'), makeOutput());
			const window = getActiveWindow('shared-session');
			if (window) {
				window.startedAtMs = Date.now() - 35 * 60000;
				window.lastSuccessTimeMs = Date.now();
			}

			await expect(
				hooks.toolBefore(makeInput('shared-session'), makeOutput()),
			).rejects.toThrow('Duration exhausted');

			if (window) {
				window.hardLimitHit = false;
			}
			swarmState.activeAgent.set('shared-session', 'architect');

			const { ensureAgentSession: localEnsureAgentSession } = await import('../../src/state');
			localEnsureAgentSession('shared-session', 'architect');

			expect(getAgentSession('shared-session')?.agentName).toBe('architect');

			await hooks.toolBefore(makeInput('shared-session'), makeOutput());
		});
	});

	describe('toolBefore - unlimited tool calls (0)', () => {
		it('does not throw when max_tool_calls is 0', async () => {
			const config = defaultConfig({ max_tool_calls: 0 });
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'unknown');

			for (let i = 0; i < 1000; i++) {
				await hooks.toolBefore(
					makeInput('test-session', 'tool', `call-${i}`),
					makeOutput({ index: i }),
				);
			}

			const window = getActiveWindow('test-session');
			expect(window?.toolCalls).toBe(1000);
			expect(window?.hardLimitHit).toBe(false);
		});

		it('architect profile has unlimited tool calls by default', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			swarmState.activeAgent.set('arch-session', 'architect');
			startAgentSession('arch-session', 'architect');

			for (let i = 0; i < 500; i++) {
				await hooks.toolBefore(
					makeInput('arch-session', 'tool', `call-${i}`),
					makeOutput({ index: i }),
				);
			}

			expect(true).toBe(true);
		});
	});

	describe('toolBefore - idle timeout', () => {
		it('throws when idle timeout exceeded', async () => {
			const config = defaultConfig({ idle_timeout_minutes: 30 });
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'unknown');

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

			await hooks.toolBefore(makeInput('test-session'), makeOutput());
		});

		it('idle timeout resets on successful tool call', async () => {
			const config = defaultConfig({ idle_timeout_minutes: 30 });
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'unknown');

			await hooks.toolBefore(makeInput('test-session'), makeOutput());
			const window = getActiveWindow('test-session');
			if (window) {
				window.lastSuccessTimeMs = Date.now() - 29 * 60000;
			}

			await hooks.toolBefore(makeInput('test-session'), makeOutput());

			await hooks.toolAfter(makeInput('test-session'), { title: 'Result', output: 'success', metadata: {} });

			const updatedWindow = getActiveWindow('test-session');
			expect(updatedWindow?.lastSuccessTimeMs).toBeGreaterThan(Date.now() - 1000);
		});
	});

	describe('toolAfter - lastSuccessTimeMs tracking', () => {
		it('updates lastSuccessTimeMs on success', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			await hooks.toolBefore(makeInput('test-session'), makeOutput());
			const window = getActiveWindow('test-session');
			if (window) {
				window.lastSuccessTimeMs = Date.now() - 60000;
			}

			const beforeTime = Date.now();
			await hooks.toolAfter(makeInput('test-session'), { title: 'Result', output: 'success', metadata: {} });

			expect(window?.lastSuccessTimeMs).toBeGreaterThanOrEqual(beforeTime);
		});
	});

	describe('architect exemption', () => {
		it('architect bypasses tool call limit', async () => {
			const config = defaultConfig({ max_tool_calls: 10 });
			const hooks = createGuardrailsHooks(config);

			swarmState.activeAgent.set('architect-session', 'architect');

			for (let i = 0; i < 500; i++) {
				await hooks.toolBefore(
					makeInput('architect-session', `tool-${i}`, `call-${i}`),
					makeOutput({ index: i }),
				);
			}

			expect(true).toBe(true);
		});

		it('architect bypasses duration limit', async () => {
			const config = defaultConfig({ max_duration_minutes: 30 });
			const hooks = createGuardrailsHooks(config);

			swarmState.activeAgent.set('architect-session', 'architect');
			startAgentSession('architect-session', 'architect');

			await hooks.toolBefore(makeInput('architect-session'), makeOutput());
			const window = getActiveWindow('architect-session');
			if (window) {
				window.startedAtMs = Date.now() - 60 * 60000;
				window.lastSuccessTimeMs = Date.now();
			}

			await hooks.toolBefore(makeInput('architect-session'), makeOutput());
		});

		it('prefixed architect bypasses guardrails', async () => {
			const config = defaultConfig({ max_tool_calls: 5 });
			const hooks = createGuardrailsHooks(config);

			swarmState.activeAgent.set('mega-session', 'mega_architect');

			for (let i = 0; i < 10; i++) {
				await hooks.toolBefore(
					makeInput('mega-session', `tool-${i}`, `call-${i}`),
					makeOutput({ index: i }),
				);
			}

			expect(true).toBe(true);
		});

		it('non-architect still gets blocked', async () => {
			const config = defaultConfig({
				max_tool_calls: 5,
				profiles: { coder: { max_tool_calls: 5 } },
			});
			const hooks = createGuardrailsHooks(config);

			swarmState.activeAgent.set('coder-session', 'coder');
			startAgentSession('coder-session', 'coder');

			for (let i = 0; i < 4; i++) {
				await hooks.toolBefore(makeInput('coder-session', `tool-${i}`, `call-${i}`), makeOutput({ index: i }));
			}

			await expect(
				hooks.toolBefore(makeInput('coder-session', 'tool-5', 'call-5'), makeOutput({ index: 5 })),
			).rejects.toThrow('LIMIT REACHED');
		});

		it('undefined activeAgent is treated as architect', async () => {
			const config = defaultConfig({ max_repetitions: 3 });
			const hooks = createGuardrailsHooks(config);

			const args = { filePath: '/test.ts' };

			await hooks.toolBefore(makeInput('no-agent-session', 'read', 'call-1'), makeOutput(args));
			await hooks.toolBefore(makeInput('no-agent-session', 'read', 'call-2'), makeOutput(args));
			await hooks.toolBefore(makeInput('no-agent-session', 'read', 'call-3'), makeOutput(args));

			expect(true).toBe(true);
		});
	});

	describe('delegationActive guard', () => {
		beforeEach(() => {
			resetSwarmState();
		});

		it('architect with delegationActive=true still exempt', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			swarmState.activeAgent.set('attack-session', 'architect');
			startAgentSession('attack-session', 'architect');

			const session = swarmState.agentSessions.get('attack-session');
			if (session) {
				session.delegationActive = true;
			}

			await hooks.toolBefore(
				makeInput('attack-session', 'write', 'call-1'),
				makeOutput({ filePath: 'src/test.ts' }),
			);

			expect(session?.delegationActive).toBe(true);
		});

		it('coder with delegationActive=true does not trigger self-coding detection', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			swarmState.activeAgent.set('defense-session', 'coder');
			startAgentSession('defense-session', 'coder');

			const session = swarmState.agentSessions.get('defense-session');
			if (session) {
				session.delegationActive = true;
			}

			await hooks.toolBefore(
				makeInput('defense-session', 'write', 'call-1'),
				makeOutput({ filePath: 'src/test.ts' }),
			);

			expect(session?.architectWriteCount).toBe(0);
		});
	});

	describe('architect exemption bug fix - stale delegation', () => {
		it('exempts when activeAgent is subagent but session.agentName is architect', async () => {
			const config = defaultConfig({ max_tool_calls: 5 });
			const hooks = createGuardrailsHooks(config);

			swarmState.activeAgent.set('stale-session', 'mega_coder');
			startAgentSession('stale-session', 'architect');

			for (let i = 0; i < 10; i++) {
				await hooks.toolBefore(
					makeInput('stale-session', `tool-${i}`, `call-${i}`),
					makeOutput({ index: i }),
				);
			}

			expect(true).toBe(true);
		});

		it('exempts when activeAgent is prefixed architect', async () => {
			const config = defaultConfig({ max_tool_calls: 5 });
			const hooks = createGuardrailsHooks(config);

			swarmState.activeAgent.set('mega-arch-session', 'mega_architect');

			for (let i = 0; i < 10; i++) {
				await hooks.toolBefore(
					makeInput('mega-arch-session', `tool-${i}`, `call-${i}`),
					makeOutput({ index: i }),
				);
			}

			expect(true).toBe(true);
		});

		it('subagent with fresh delegation is NOT exempt', async () => {
			const config = defaultConfig({
				max_tool_calls: 5,
				profiles: { coder: { max_tool_calls: 5 } },
			});
			const hooks = createGuardrailsHooks(config);

			swarmState.activeAgent.set('fresh-subagent', 'mega_coder');
			startAgentSession('fresh-subagent', 'mega_coder');
			const session = getAgentSession('fresh-subagent');
			if (session) {
				session.delegationActive = true;
				session.lastToolCallTime = Date.now();
			}

			for (let i = 0; i < 4; i++) {
				await hooks.toolBefore(
					makeInput('fresh-subagent', `tool-${i}`, `call-${i}`),
					makeOutput({ index: i }),
				);
			}

			await expect(
				hooks.toolBefore(makeInput('fresh-subagent', 'tool-5', 'call-5'), makeOutput({ index: 5 })),
			).rejects.toThrow('LIMIT REACHED');
		});
	});

	describe('self-fix warning injection', () => {
		beforeEach(() => {
			resetSwarmState();
		});

		it('sets selfFixAttempted flag when architect uses write tool after gate failure', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			swarmState.activeAgent.set('selffix-session', 'architect');
			startAgentSession('selffix-session', 'architect');
			const session = getAgentSession('selffix-session');

			if (session) {
				session.lastGateFailure = {
					tool: 'reviewer',
					taskId: 'task-123',
					timestamp: Date.now() - 30000,
				};
			}

			await hooks.toolBefore(
				makeInput('selffix-session', 'edit', 'call-1'),
				makeOutput({ filePath: '/src/test.ts' }),
			);

			expect(session?.selfFixAttempted).toBe(true);
		});

		it('injects SELF-FIX warning in messagesTransform', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			swarmState.activeAgent.set('selffix-warn-session', 'architect');
			startAgentSession('selffix-warn-session', 'architect');
			const session = getAgentSession('selffix-warn-session');

			if (session) {
				session.lastGateFailure = {
					tool: 'reviewer',
					taskId: 'task-456',
					timestamp: Date.now() - 10000,
				};
				session.selfFixAttempted = true;
			}

			const messages = [{
				info: { role: 'assistant', sessionID: 'selffix-warn-session' },
				parts: [{ type: 'text', text: 'I will fix the code now.' }],
			}];

			await hooks.messagesTransform({}, { messages });

			expect(messages[0].parts[0].text).toContain('SELF-FIX DETECTED');
		});

		it('does NOT inject warning without write attempt', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			swarmState.activeAgent.set('no-write-session', 'architect');
			startAgentSession('no-write-session', 'architect');
			const session = getAgentSession('no-write-session');

			if (session) {
				session.lastGateFailure = {
					tool: 'reviewer',
					taskId: 'task-789',
					timestamp: Date.now() - 30000,
				};
				session.reviewerCallCount.set(1, 1);
				session.reviewerCallCount.set(2, 1);
				session.reviewerCallCount.set(3, 1);
				session.reviewerCallCount.set(4, 1);
				session.gateLog.set('no-write-session:unknown', new Set(['diff', 'syntax_check', 'placeholder_scan', 'lint', 'pre_check_batch']));
			}

			const messages = [{
				info: { role: 'assistant', sessionID: 'no-write-session' },
				parts: [{ type: 'text', text: 'Original message.' }],
			}];

			await hooks.messagesTransform({}, { messages });

			expect(messages[0].parts[0].text).toBe('Original message.');
			expect(messages[0].parts[0].text).not.toContain('SELF-FIX DETECTED');
		});
	});

	describe('delegationActive guard fix', () => {
		beforeEach(() => {
			resetSwarmState();
		});

		it('Coder with delegationActive=true + edit tool → NO false positive', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			swarmState.activeAgent.set('test-session', 'coder');
			startAgentSession('test-session', 'coder');
			const session = getAgentSession('test-session');
			if (session) {
				session.delegationActive = true;
			}

			await hooks.toolBefore(
				makeInput('test-session', 'edit', 'call-1'),
				makeOutput({ filePath: '/src/test.ts' }),
			);

			expect(session?.architectWriteCount).toBe(0);
		});

		it('Architect with delegationActive=false + edit tool → self-coding IS detected', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			swarmState.activeAgent.set('test-session', 'architect');
			startAgentSession('test-session', 'architect');
			const session = getAgentSession('test-session');
			if (session) {
				session.delegationActive = false;
			}

			await hooks.toolBefore(
				makeInput('test-session', 'edit', 'call-1'),
				makeOutput({ filePath: '/src/test.ts' }),
			);

			expect(session?.architectWriteCount).toBe(1);
		});
	});

	describe('apply_patch path extraction', () => {
		beforeEach(() => {
			resetSwarmState();
		});

		it('apply_patch with Codex-style path → architectWriteCount increments', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			swarmState.activeAgent.set('test-session', 'architect');
			startAgentSession('test-session', 'architect');
			const session = getAgentSession('test-session');

			const warnSpy = vi.spyOn(utilsModule, 'warn').mockImplementation(() => {});

			await hooks.toolBefore(
				makeInput('test-session', 'apply_patch', 'call-1'),
				makeOutput({ input: '*** Update File: src/foo.ts\nSome code changes' }),
			);

			expect(session?.architectWriteCount).toBe(1);

			expect(warnSpy).toHaveBeenCalledWith(
				'Architect direct code edit detected via apply_patch',
				expect.objectContaining({
					tool: 'apply_patch',
					sessionID: 'test-session',
					targetPath: 'src/foo.ts',
				}),
			);

			warnSpy.mockRestore();
		});

		it('apply_patch targeting only .swarm/ → NO increment', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			swarmState.activeAgent.set('test-session', 'architect');
			startAgentSession('test-session', 'architect');
			const session = getAgentSession('test-session');

			const warnSpy = vi.spyOn(utilsModule, 'warn').mockImplementation(() => {});

			await hooks.toolBefore(
				makeInput('test-session', 'apply_patch', 'call-1'),
				makeOutput({ input: '*** Update File: .swarm/context.md\nContext changes' }),
			);

			expect(session?.architectWriteCount).toBe(0);

			expect(warnSpy).not.toHaveBeenCalledWith(
				'Architect direct code edit detected via apply_patch',
				expect.any(Object),
			);

			warnSpy.mockRestore();
		});

		it('write tool with filePath extraction still works', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			swarmState.activeAgent.set('test-session', 'architect');
			startAgentSession('test-session', 'architect');
			const session = getAgentSession('test-session');

			const warnSpy = vi.spyOn(utilsModule, 'warn').mockImplementation(() => {});

			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-1'),
				makeOutput({ filePath: 'src/test.ts' }),
			);

			expect(session?.architectWriteCount).toBe(1);

			expect(warnSpy).toHaveBeenCalledWith(
				'Architect direct code edit detected',
				expect.objectContaining({
					tool: 'write',
					targetPath: 'src/test.ts',
				}),
			);

			warnSpy.mockRestore();
		});
	});
});

/**
 * Adversarial tests for delegation-gate.ts
 *
 * Tests focus on:
 * - Attack vectors and bypass attempts
 * - Edge cases and boundary violations
 * - Migration safety for legacy sessions
 * - Concurrent session isolation
 * - Resource exhaustion (OOM, long strings)
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { PluginConfig } from '../../../src/config';
import { createDelegationGateHook } from '../../../src/hooks/delegation-gate';
import {
	ensureAgentSession,
	resetSwarmState,
	swarmState,
} from '../../../src/state';

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

function makeMessages(
	text: string,
	agent?: string,
	sessionID = 'test-session',
) {
	return {
		messages: [
			{
				info: { role: 'user' as const, agent, sessionID },
				parts: [{ type: 'text', text }],
			},
		],
	};
}

describe('delegation gate adversarial tests', () => {
	beforeEach(() => {
		resetSwarmState();
	});

	afterEach(() => {
		resetSwarmState();
	});

	describe('null/undefined message handling', () => {
		it('should not throw when messages is null', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const output = { messages: null as never };

			await hook.messagesTransform({}, output);
		});

		it('should not throw when messages is undefined', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const output = { messages: undefined };

			await hook.messagesTransform({}, output);
		});

		it('should not throw when messages array is empty', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const output = { messages: [] };

			await hook.messagesTransform({}, output);
		});

		it('should not throw when messages array contains null entries', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const output = {
				messages: [
					null,
					undefined,
					{
						info: { role: 'user' as const, sessionID: 'test-session' },
						parts: [{ type: 'text', text: 'test' }],
					},
				] as never[],
			};

			await hook.messagesTransform({}, output);
		});

		it('should not throw when message has no parts', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const output = {
				messages: [
					{
						info: { role: 'user' as const, sessionID: 'test-session' },
						parts: undefined as never,
					},
				],
			};

			await hook.messagesTransform({}, output);
		});

		it('should not throw when message parts array is empty', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const output = {
				messages: [
					{
						info: { role: 'user' as const, sessionID: 'test-session' },
						parts: [],
					},
				],
			};

			await hook.messagesTransform({}, output);
		});

		it('should not throw when parts contain null entries', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const output = {
				messages: [
					{
						info: { role: 'user' as const, sessionID: 'test-session' },
						parts: [null, undefined, { type: 'text', text: 'test' }] as never[],
					},
				],
			};

			await hook.messagesTransform({}, output);
		});

		it('should not throw when text part has no text field', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const output = {
				messages: [
					{
						info: { role: 'user' as const, sessionID: 'test-session' },
						parts: [{ type: 'text' }], // Missing text field
					},
				],
			};

			await hook.messagesTransform({}, output);
		});
	});

	describe('malformed task ID handling', () => {
		it('should handle task ID of 10000 characters without OOM', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const longTaskId = 'T' + 'a'.repeat(9999);
			const text = `coder\nTASK: ${longTaskId}\nFILE: src/test.ts`;

			const messages = makeMessages(text, 'architect');

			// Should not throw due to long task ID
			await hook.messagesTransform({}, messages);

			// Verify task ID was tracked correctly
			const session = ensureAgentSession('test-session');
			expect(session.lastCoderDelegationTaskId).toBe(longTaskId);
		});

		it('should handle task ID with special characters', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const specialTaskId =
				'Task with \\n newline, \\t tab, "quotes", \'apostrophes\', <html>, &amp;';
			const text = `coder\nTASK: ${specialTaskId}\nFILE: src/test.ts`;

			const messages = makeMessages(text, 'architect');

			await hook.messagesTransform({}, messages);

			const session = ensureAgentSession('test-session');
			expect(session.lastCoderDelegationTaskId).toBe(specialTaskId);
		});

		it('should handle task ID with emoji and unicode', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const unicodeTaskId = '🎉 Task with émojis 🚀 and 特殊符号';
			const text = `coder\nTASK: ${unicodeTaskId}\nFILE: src/test.ts`;

			const messages = makeMessages(text, 'architect');

			await hook.messagesTransform({}, messages);

			const session = ensureAgentSession('test-session');
			expect(session.lastCoderDelegationTaskId).toBe(unicodeTaskId);
		});

		it('should handle TASK line with no content', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const text = 'coder\nTASK:\nFILE: src/test.ts';

			const messages = makeMessages(text, 'architect');

			await hook.messagesTransform({}, messages);

			const session = ensureAgentSession('test-session');
			// When TASK: is empty, regex captures next line content
			expect(session.lastCoderDelegationTaskId).toBe('FILE: src/test.ts');
		});
	});

	describe('qaSkipCount boundary conditions', () => {
		it('should handle qaSkipCount at MAX_SAFE_INTEGER - 1 without overflow', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			// Setup session with qaSkipCount at MAX_SAFE_INTEGER - 1
			const session = ensureAgentSession('test-session');
			session.qaSkipCount = Number.MAX_SAFE_INTEGER - 1;
			session.qaSkipTaskIds = ['task-1'];

			swarmState.delegationChains.set('test-session', [
				{ from: 'architect', to: 'mega_coder', timestamp: 1 },
				{ from: 'mega_coder', to: 'architect', timestamp: 2 },
				{ from: 'architect', to: 'mega_coder', timestamp: 3 },
				{ from: 'mega_coder', to: 'architect', timestamp: 4 },
				{ from: 'architect', to: 'mega_coder', timestamp: 5 },
			]);

			const messages = makeMessages(
				'coder\nTASK: next-task\nFILE: src/test.ts',
				'architect',
			);

			// Should still throw correctly without integer overflow
			await expect(hook.messagesTransform({}, messages)).rejects.toThrow(
				'QA GATE ENFORCEMENT',
			);

			// qaSkipCount should NOT increment - error is thrown before increment
			expect(session.qaSkipCount).toBe(Number.MAX_SAFE_INTEGER - 1);
		});

		it('should handle qaSkipCount at 0 (initial state)', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			// Setup with fresh session
			const session = ensureAgentSession('test-session');
			expect(session.qaSkipCount).toBe(0);

			swarmState.delegationChains.set('test-session', [
				{ from: 'architect', to: 'mega_coder', timestamp: 1 },
				{ from: 'mega_coder', to: 'architect', timestamp: 2 },
				{ from: 'architect', to: 'mega_coder', timestamp: 3 },
				{ from: 'mega_coder', to: 'architect', timestamp: 4 },
				{ from: 'architect', to: 'mega_coder', timestamp: 5 },
			]);

			const messages = makeMessages(
				'coder\nTASK: next-task\nFILE: src/test.ts',
				'architect',
			);

			// First skip should warn, not throw
			await hook.messagesTransform({}, messages);
			expect(session.qaSkipCount).toBe(1);
		});

		it('should handle negative qaSkipCount (migration safety)', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			// Simulate corrupted state from migration
			const session = ensureAgentSession('test-session');
			(session as { qaSkipCount: number }).qaSkipCount = -5;

			swarmState.delegationChains.set('test-session', [
				{ from: 'architect', to: 'mega_coder', timestamp: 1 },
				{ from: 'mega_coder', to: 'architect', timestamp: 2 },
				{ from: 'architect', to: 'mega_coder', timestamp: 3 },
				{ from: 'mega_coder', to: 'architect', timestamp: 4 },
				{ from: 'architect', to: 'mega_coder', timestamp: 5 },
			]);

			const messages = makeMessages(
				'coder\nTASK: next-task\nFILE: src/test.ts',
				'architect',
			);

			// Should handle negative count gracefully
			await hook.messagesTransform({}, messages);
			// Increment from -5 should result in -4
			expect(session.qaSkipCount).toBe(-4);
		});
	});

	describe('qaSkipTaskIds with large number of entries', () => {
		it('should handle error message with 1000 skipped task IDs', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			// Create array of 1000 task IDs
			const skippedTasks: string[] = [];
			for (let i = 1; i <= 1000; i++) {
				skippedTasks.push(`task-${i.toString().padStart(4, '0')}`);
			}

			const session = ensureAgentSession('test-session');
			session.qaSkipCount = 1;
			session.qaSkipTaskIds = skippedTasks;

			swarmState.delegationChains.set('test-session', [
				{ from: 'architect', to: 'mega_coder', timestamp: 1 },
				{ from: 'mega_coder', to: 'architect', timestamp: 2 },
				{ from: 'architect', to: 'mega_coder', timestamp: 3 },
				{ from: 'mega_coder', to: 'architect', timestamp: 4 },
				{ from: 'architect', to: 'mega_coder', timestamp: 5 },
			]);

			const messages = makeMessages(
				'coder\nTASK: task-1001\nFILE: src/test.ts',
				'architect',
			);

			// Should throw with error containing skipped tasks
			await expect(hook.messagesTransform({}, messages)).rejects.toThrow(
				'QA GATE ENFORCEMENT',
			);

			// Verify first few and last few task IDs are in the error message
			const error = await hook.messagesTransform({}, messages).catch((e) => e);
			expect(error.message).toContain('task-0001');
			expect(error.message).toContain('task-1000');
		});

		it('should add new task ID to large qaSkipTaskIds array', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			// Pre-fill with 500 tasks
			const skippedTasks: string[] = [];
			for (let i = 1; i <= 500; i++) {
				skippedTasks.push(`task-${i}`);
			}

			const session = ensureAgentSession('test-session');
			session.qaSkipCount = 0;
			session.qaSkipTaskIds = skippedTasks;

			swarmState.delegationChains.set('test-session', [
				{ from: 'architect', to: 'mega_coder', timestamp: 1 },
				{ from: 'mega_coder', to: 'architect', timestamp: 2 },
				{ from: 'architect', to: 'mega_coder', timestamp: 3 },
				{ from: 'mega_coder', to: 'architect', timestamp: 4 },
				{ from: 'architect', to: 'mega_coder', timestamp: 5 },
			]);

			const messages = makeMessages(
				'coder\nTASK: task-501\nFILE: src/test.ts',
				'architect',
			);

			await hook.messagesTransform({}, messages);

			// New task should be added to the array
			expect(session.qaSkipTaskIds.length).toBe(501);
			expect(session.qaSkipTaskIds[500]).toBe('task-501');
		});
	});

	describe('disabled hook edge cases', () => {
		it('messagesTransform should be no-op when disabled regardless of session state', async () => {
			const config = makeConfig({ hooks: { delegation_gate: false } });
			const hook = createDelegationGateHook(config, process.cwd());

			// Setup session that would normally trigger a warning
			const session = ensureAgentSession('test-session');
			session.qaSkipCount = 1;
			session.qaSkipTaskIds = ['task-1'];

			swarmState.delegationChains.set('test-session', [
				{ from: 'architect', to: 'mega_coder', timestamp: 1 },
				{ from: 'mega_coder', to: 'architect', timestamp: 2 },
				{ from: 'architect', to: 'mega_coder', timestamp: 3 },
			]);

			const longText =
				'coder\nTASK: ' + 'a'.repeat(5000) + '\nFILE: src/test.ts';
			const messages = makeMessages(longText, 'architect');
			const originalText = messages.messages[0].parts[0].text;

			// Should not modify message text
			await hook.messagesTransform({}, messages);
			expect(messages.messages[0].parts[0].text).toBe(originalText);
		});

		it('toolAfter should be no-op when disabled regardless of session state', async () => {
			const config = makeConfig({ hooks: { delegation_gate: false } });
			const hook = createDelegationGateHook(config, process.cwd());

			// Setup session with non-zero skip count
			const session = ensureAgentSession('test-session');
			session.qaSkipCount = 5;
			session.qaSkipTaskIds = [
				'task-1',
				'task-2',
				'task-3',
				'task-4',
				'task-5',
			];

			swarmState.delegationChains.set('test-session', [
				{ from: 'architect', to: 'reviewer', timestamp: 1 },
			]);

			const toolAfterInput = {
				tool: 'tool.execute.Task',
				sessionID: 'test-session',
				callID: 'call-123',
			};

			// Should not reset counters when disabled
			await hook.toolAfter(toolAfterInput, {});
			expect(session.qaSkipCount).toBe(5);
			expect(session.qaSkipTaskIds.length).toBe(5);
		});

		it('messagesTransform should be no-op when disabled even with malformed input', async () => {
			const config = makeConfig({ hooks: { delegation_gate: false } });
			const hook = createDelegationGateHook(config, process.cwd());

			const malformedMessages = {
				messages: null as never,
			};

			// Should not throw
			await hook.messagesTransform({}, malformedMessages);
		});
	});

	describe('concurrent session isolation', () => {
		it('two sessions with different skip counts should not interfere', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			// Session 1: has QA skips - will throw on second consecutive skip
			const session1 = ensureAgentSession('session-1');
			session1.qaSkipCount = 1;
			session1.qaSkipTaskIds = ['task-1'];

			swarmState.delegationChains.set('session-1', [
				{ from: 'architect', to: 'mega_coder', timestamp: 1 },
				{ from: 'mega_coder', to: 'architect', timestamp: 2 },
				{ from: 'architect', to: 'mega_coder', timestamp: 3 },
			]);

			// Session 2: no QA skips initially
			const session2 = ensureAgentSession('session-2');
			session2.qaSkipCount = 0;
			session2.qaSkipTaskIds = [];

			swarmState.delegationChains.set('session-2', [
				{ from: 'architect', to: 'mega_coder', timestamp: 1 },
				{ from: 'mega_coder', to: 'architect', timestamp: 2 },
				{ from: 'architect', to: 'mega_coder', timestamp: 3 }, // Second coder without QA - should warn
			]);

			// Session 1 should throw (second skip after existing skip)
			const messages1 = makeMessages(
				'coder\nTASK: task-2\nFILE: src/a.ts',
				'architect',
				'session-1',
			);
			await expect(hook.messagesTransform({}, messages1)).rejects.toThrow(
				'QA GATE ENFORCEMENT',
			);
			expect(session1.qaSkipCount).toBe(1); // Should be thrown before increment

			// Session 2 should not throw (first skip - just warns)
			const messages2 = makeMessages(
				'coder\nTASK: task-3\nFILE: src/b.ts',
				'architect',
				'session-2',
			);
			await hook.messagesTransform({}, messages2);
			expect(session2.qaSkipCount).toBe(1); // Incremented due to warning
		});

		it('resetting qaSkipCount in one session should not affect other sessions', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			// Setup both sessions with QA skips
			const session1 = ensureAgentSession('session-1');
			session1.qaSkipCount = 2;
			session1.qaSkipTaskIds = ['s1-task-1', 's1-task-2'];

			const session2 = ensureAgentSession('session-2');
			session2.qaSkipCount = 1;
			session2.qaSkipTaskIds = ['s2-task-1'];

			// Reset session 1 via reviewer + test_engineer delegation
			// Include a coder before reviewer/test_engineer so the reset logic can execute
			// (code requires coder in chain to trigger reset flow, and both reviewer AND test_engineer to reset qaSkip)
			swarmState.delegationChains.set('session-1', [
				{ from: 'architect', to: 'mega_coder', timestamp: 1 },
				{ from: 'architect', to: 'reviewer', timestamp: 2 },
				{ from: 'architect', to: 'test_engineer', timestamp: 3 },
			]);

			await hook.toolAfter(
				{ tool: 'tool.execute.Task', sessionID: 'session-1', callID: 'call-1' },
				{},
			);

			// Session 1 should be reset (both reviewer and test_engineer seen after coder)
			expect(session1.qaSkipCount).toBe(0);
			expect(session1.qaSkipTaskIds).toEqual([]);

			// Session 2 should remain unchanged
			expect(session2.qaSkipCount).toBe(1);
			expect(session2.qaSkipTaskIds).toEqual(['s2-task-1']);
		});
	});

	describe('toolAfter edge cases', () => {
		it('should not throw when called with empty delegationChains', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			ensureAgentSession('test-session');

			// Empty delegation chains
			swarmState.delegationChains.set('test-session', []);

			const toolAfterInput = {
				tool: 'tool.execute.Task',
				sessionID: 'test-session',
				callID: 'call-123',
			};

			await hook.toolAfter(toolAfterInput, {});
		});

		it('should not throw when called with missing sessionID', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const toolAfterInput = {
				tool: 'tool.execute.Task',
				sessionID: '',
				callID: 'call-123',
			};

			await hook.toolAfter(toolAfterInput, {});
		});

		it('should not throw when called with undefined sessionID', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const toolAfterInput = {
				tool: 'tool.execute.Task',
				sessionID: undefined as never,
				callID: 'call-123',
			};

			await hook.toolAfter(toolAfterInput, {});
		});

		it('should not throw when session does not exist', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			// No session created
			swarmState.delegationChains.set('test-session', [
				{ from: 'architect', to: 'reviewer', timestamp: 1 },
			]);

			const toolAfterInput = {
				tool: 'tool.execute.Task',
				sessionID: 'test-session',
				callID: 'call-123',
			};

			await hook.toolAfter(toolAfterInput, {});
		});

		it('should handle delegationChain with null entries gracefully', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			ensureAgentSession('test-session');

			// Chain with null/undefined entries (simulated corruption)
			// This is an edge case that may throw - testing that it doesn't crash
			swarmState.delegationChains.set('test-session', [
				{ from: 'architect', to: 'reviewer', timestamp: 1 },
				null as never,
				undefined as never,
			] as never);

			const toolAfterInput = {
				tool: 'tool.execute.Task',
				sessionID: 'test-session',
				callID: 'call-123',
			};

			// May throw due to corrupted data, but shouldn't crash the process
			await expect(hook.toolAfter(toolAfterInput, {})).rejects.toThrow();
		});

		it('should handle non-Task tool name gracefully', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			ensureAgentSession('test-session');

			swarmState.delegationChains.set('test-session', [
				{ from: 'architect', to: 'reviewer', timestamp: 1 },
			]);

			const toolAfterInput = {
				tool: 'tool.execute.Bash',
				sessionID: 'test-session',
				callID: 'call-123',
			};

			await hook.toolAfter(toolAfterInput, {});
		});

		it('should handle tool name with no prefix', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			ensureAgentSession('test-session');

			swarmState.delegationChains.set('test-session', [
				{ from: 'architect', to: 'reviewer', timestamp: 1 },
			]);

			const toolAfterInput = {
				tool: 'Task', // No prefix
				sessionID: 'test-session',
				callID: 'call-123',
			};

			await hook.toolAfter(toolAfterInput, {});
		});
	});

	describe('non-coder tool in message', () => {
		it('should not increment qaSkipCount for bash tool calls', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const session = ensureAgentSession('test-session');
			session.qaSkipCount = 0;
			session.qaSkipTaskIds = [];

			swarmState.delegationChains.set('test-session', [
				{ from: 'architect', to: 'mega_coder', timestamp: 1 },
				{ from: 'mega_coder', to: 'architect', timestamp: 2 },
				{ from: 'architect', to: 'mega_coder', timestamp: 3 },
			]);

			// Message contains bash tool reference but no coder delegation
			const messages = makeMessages(
				'TASK: Run bash to check logs\n\nbash\nls -la',
				'architect',
			);
			const originalText = messages.messages[0].parts[0].text;

			await hook.messagesTransform({}, messages);
			// User message text must still contain the original text
			// (system messages may have been injected at index 0 by deliberation preamble)
			const userMsg = messages.messages.find((m) => m?.info?.role === 'user');
			expect(userMsg?.parts[0].text).toContain(originalText);

			// qaSkipCount should not be incremented (not a coder delegation)
			expect(session.qaSkipCount).toBe(0);
		});

		it('should not warn about batching for bash-only messages', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			// Long message with "and also" but no coder delegation
			const longText =
				'TASK: Check logs and also check error messages\n\nbash\ntail -f logs/app.log';
			const messages = makeMessages(longText, 'architect');
			const originalText = messages.messages[0].parts[0].text;

			await hook.messagesTransform({}, messages);
			// User message text must still contain the original text
			// System messages may have been inserted but should not contain batch warning
			const userMsg = messages.messages.find((m) => m?.info?.role === 'user');
			expect(userMsg?.parts[0].text).toContain(originalText);
			// No batch warning should appear in any system message for non-coder delegations
			const systemMsgs = messages.messages.filter(
				(m) => m?.info?.role === 'system',
			);
			const systemText = systemMsgs
				.map((m) => m.parts?.[0]?.text ?? '')
				.join('\n');
			expect(systemText).not.toContain('BATCH DETECTED');
		});
	});

	describe('migration safety for qaSkipTaskIds', () => {
		it('should handle session with undefined qaSkipTaskIds', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			// Create session without qaSkipTaskIds (simulating old state)
			swarmState.agentSessions.set('test-session', {
				agentName: 'architect',
				lastToolCallTime: Date.now(),
				lastAgentEventTime: Date.now(),
				delegationActive: false,
				activeInvocationId: 0,
				lastInvocationIdByAgent: {},
				windows: {},
				lastCompactionHint: 0,
				architectWriteCount: 0,
				lastCoderDelegationTaskId: null,
				gateLog: new Map(),
				reviewerCallCount: new Map(),
				lastGateFailure: null,
				partialGateWarningIssued: false,
				selfFixAttempted: false,
				catastrophicPhaseWarnings: new Set(),
				qaSkipCount: 0,
				// qaSkipTaskIds is missing - migration safety should initialize it
			} as never);

			swarmState.delegationChains.set('test-session', [
				{ from: 'architect', to: 'mega_coder', timestamp: 1 },
				{ from: 'mega_coder', to: 'architect', timestamp: 2 },
				{ from: 'architect', to: 'mega_coder', timestamp: 3 },
			]);

			const messages = makeMessages(
				'coder\nTASK: task-1\nFILE: src/test.ts',
				'architect',
			);

			// Should initialize qaSkipTaskIds via ensureAgentSession and not throw
			await hook.messagesTransform({}, messages);

			const session = swarmState.agentSessions.get('test-session');
			expect(session?.qaSkipTaskIds).toBeDefined();
			expect(Array.isArray(session?.qaSkipTaskIds)).toBe(true);
		});

		it('should handle session with null qaSkipTaskIds', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			// Create session with null qaSkipTaskIds
			swarmState.agentSessions.set('test-session', {
				agentName: 'architect',
				lastToolCallTime: Date.now(),
				lastAgentEventTime: Date.now(),
				delegationActive: false,
				activeInvocationId: 0,
				lastInvocationIdByAgent: {},
				windows: {},
				lastCompactionHint: 0,
				architectWriteCount: 0,
				lastCoderDelegationTaskId: null,
				gateLog: new Map(),
				reviewerCallCount: new Map(),
				lastGateFailure: null,
				partialGateWarningIssued: false,
				selfFixAttempted: false,
				catastrophicPhaseWarnings: new Set(),
				qaSkipCount: 0,
				qaSkipTaskIds: null as never,
			} as never);

			swarmState.delegationChains.set('test-session', [
				{ from: 'architect', to: 'mega_coder', timestamp: 1 },
				{ from: 'mega_coder', to: 'architect', timestamp: 2 },
				{ from: 'architect', to: 'mega_coder', timestamp: 3 },
			]);

			const messages = makeMessages(
				'coder\nTASK: task-1\nFILE: src/test.ts',
				'architect',
			);

			// Migration safety via ensureAgentSession should handle null
			await hook.messagesTransform({}, messages);

			const session = ensureAgentSession('test-session');
			expect(session.qaSkipTaskIds).toBeDefined();
			expect(Array.isArray(session.qaSkipTaskIds)).toBe(true);
		});

		it('should handle session with non-array qaSkipTaskIds', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			// Create session with string qaSkipTaskIds (corrupted state)
			swarmState.agentSessions.set('test-session', {
				agentName: 'architect',
				lastToolCallTime: Date.now(),
				lastAgentEventTime: Date.now(),
				delegationActive: false,
				activeInvocationId: 0,
				lastInvocationIdByAgent: {},
				windows: {},
				lastCompactionHint: 0,
				architectWriteCount: 0,
				lastCoderDelegationTaskId: null,
				gateLog: new Map(),
				reviewerCallCount: new Map(),
				lastGateFailure: null,
				partialGateWarningIssued: false,
				selfFixAttempted: false,
				catastrophicPhaseWarnings: new Set(),
				qaSkipCount: 0,
				qaSkipTaskIds: 'corrupted-string' as never,
			} as never);

			swarmState.delegationChains.set('test-session', [
				{ from: 'architect', to: 'mega_coder', timestamp: 1 },
				{ from: 'mega_coder', to: 'architect', timestamp: 2 },
				{ from: 'architect', to: 'mega_coder', timestamp: 3 },
			]);

			const messages = makeMessages(
				'coder\nTASK: task-1\nFILE: src/test.ts',
				'architect',
			);

			// Migration safety should handle corrupted state - will throw but should not crash
			// Note: This tests that we handle the error gracefully
			await expect(hook.messagesTransform({}, messages)).rejects.toThrow();
		});
	});

	describe('delegationChains edge cases', () => {
		it('should handle delegationChains with only coder entries', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			// Chain with only coder entries (no architect in between)
			swarmState.delegationChains.set('test-session', [
				{ from: 'architect', to: 'mega_coder', timestamp: 1 },
				{ from: 'mega_coder', to: 'mega_coder', timestamp: 2 }, // coder -> coder (unusual but possible)
			]);

			const messages = makeMessages(
				'coder\nTASK: task-2\nFILE: src/test.ts',
				'architect',
			);

			// Should not throw - only 1 actual coder delegation from architect
			await hook.messagesTransform({}, messages);
		});

		it('should handle malformed delegation entries with missing fields', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			ensureAgentSession('test-session');

			// Chain with entries missing required fields
			swarmState.delegationChains.set('test-session', [
				{ from: 'architect', to: 'mega_coder', timestamp: 1 },
				{ from: '', to: 'mega_coder', timestamp: 2 } as never, // Empty 'from'
				{ from: 'mega_coder', to: '', timestamp: 3 } as never, // Empty 'to'
			] as never);

			const messages = makeMessages(
				'coder\nTASK: task-2\nFILE: src/test.ts',
				'architect',
			);

			// Should handle malformed entries gracefully
			await hook.messagesTransform({}, messages);
		});

		it('should handle delegationChains with very long agent names', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const longAgentName = 'a'.repeat(1000);
			swarmState.delegationChains.set('test-session', [
				{ from: 'architect', to: longAgentName, timestamp: 1 },
				{ from: longAgentName, to: 'architect', timestamp: 2 },
				{ from: 'architect', to: longAgentName, timestamp: 3 },
			]);

			const messages = makeMessages(
				`${longAgentName}\nTASK: task-2\nFILE: src/test.ts`,
				'architect',
			);

			await hook.messagesTransform({}, messages);
		});
	});

	describe('edge case: unknown task ID', () => {
		it('should handle message without TASK: line (not a coder delegation)', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const session = ensureAgentSession('test-session');
			session.qaSkipCount = 0;

			swarmState.delegationChains.set('test-session', [
				{ from: 'architect', to: 'mega_coder', timestamp: 1 },
				{ from: 'mega_coder', to: 'architect', timestamp: 2 },
				{ from: 'architect', to: 'mega_coder', timestamp: 3 },
			]);

			// Message with 'coder' but no TASK: line - not considered a coder delegation
			const messages = makeMessages('coder\n\nFILE: src/test.ts', 'architect');

			await hook.messagesTransform({}, messages);

			// Since this is NOT a coder delegation (no TASK: line),
			// qaSkipCount should NOT be incremented
			expect(session.qaSkipCount).toBe(0);
			expect(session.qaSkipTaskIds).toEqual([]);
		});

		it('should handle undefined currentTaskId when pushing to qaSkipTaskIds', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const session = ensureAgentSession('test-session');
			session.qaSkipCount = 0;

			swarmState.delegationChains.set('test-session', [
				{ from: 'architect', to: 'mega_coder', timestamp: 1 },
				{ from: 'mega_coder', to: 'architect', timestamp: 2 },
				{ from: 'architect', to: 'mega_coder', timestamp: 3 },
			]);

			// Message with empty TASK: (currentTaskId will be empty string from next line)
			const messages = makeMessages(
				'coder\nTASK: \nFILE: src/test.ts',
				'architect',
			);

			await hook.messagesTransform({}, messages);

			// When TASK: is empty, the regex captures the next line content
			expect(session.qaSkipTaskIds).toContain('FILE: src/test.ts');
		});
	});

	describe('agent name edge cases', () => {
		it('should handle agent name with special characters', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const messages = makeMessages(
				'coder\nTASK: test\nFILE: src/test.ts',
				'agent-with-dash',
			);
			const originalText = messages.messages[0].parts[0].text;

			await hook.messagesTransform({}, messages);
			// Non-architect agent should be ignored
			expect(messages.messages[0].parts[0].text).toBe(originalText);
		});

		it('should handle agent name with numbers', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const messages = makeMessages(
				'coder\nTASK: test\nFILE: src/test.ts',
				'agent123',
			);
			const originalText = messages.messages[0].parts[0].text;

			await hook.messagesTransform({}, messages);
			expect(messages.messages[0].parts[0].text).toBe(originalText);
		});

		it('should handle agent name that is empty string', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const messages = makeMessages('coder\nTASK: test\nFILE: src/test.ts', '');
			const originalText = messages.messages[0].parts[0].text;

			// Empty agent name is treated as non-architect (stripped agent is undefined, not 'architect')
			// So the message is not modified
			await hook.messagesTransform({}, messages);
			// Text may contain injected preamble - check original text is contained
			expect(messages.messages[0].parts[0].text).toContain(originalText);
		});
	});

	describe('toolAfter input.args.subagent_type adversarial tests', () => {
		it('should handle input.args as null', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const session = ensureAgentSession('test-session');
			session.taskWorkflowStates = new Map([['1.1', 'coder_delegated']]);

			const toolAfterInput = {
				tool: 'tool.execute.Task',
				sessionID: 'test-session',
				callID: 'call-123',
				args: null as never,
			};

			await hook.toolAfter(toolAfterInput, {});
			expect(session.taskWorkflowStates.get('1.1')).toBe('coder_delegated');
		});

		it('should handle input.args as undefined', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const session = ensureAgentSession('test-session');
			session.taskWorkflowStates = new Map([['1.1', 'coder_delegated']]);

			const toolAfterInput = {
				tool: 'tool.execute.Task',
				sessionID: 'test-session',
				callID: 'call-124',
				args: undefined,
			};

			await hook.toolAfter(toolAfterInput, {});
			expect(session.taskWorkflowStates.get('1.1')).toBe('coder_delegated');
		});

		it('should handle input.args as primitive string', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const session = ensureAgentSession('test-session');
			session.taskWorkflowStates = new Map([['1.1', 'coder_delegated']]);

			const toolAfterInput = {
				tool: 'tool.execute.Task',
				sessionID: 'test-session',
				callID: 'call-125',
				args: 'not-an-object' as never,
			};

			await hook.toolAfter(toolAfterInput, {});
			expect(session.taskWorkflowStates.get('1.1')).toBe('coder_delegated');
		});

		it('should handle input.args as primitive number', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const session = ensureAgentSession('test-session');
			session.taskWorkflowStates = new Map([['1.1', 'coder_delegated']]);

			const toolAfterInput = {
				tool: 'tool.execute.Task',
				sessionID: 'test-session',
				callID: 'call-126',
				args: 42 as never,
			};

			await hook.toolAfter(toolAfterInput, {});
			expect(session.taskWorkflowStates.get('1.1')).toBe('coder_delegated');
		});

		it('should handle input.args as primitive boolean', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const session = ensureAgentSession('test-session');
			session.taskWorkflowStates = new Map([['1.1', 'coder_delegated']]);

			const toolAfterInput = {
				tool: 'tool.execute.Task',
				sessionID: 'test-session',
				callID: 'call-127',
				args: true as never,
			};

			await hook.toolAfter(toolAfterInput, {});
			expect(session.taskWorkflowStates.get('1.1')).toBe('coder_delegated');
		});

		it('should handle input.args as array', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const session = ensureAgentSession('test-session');
			session.taskWorkflowStates = new Map([['1.1', 'coder_delegated']]);

			const toolAfterInput = {
				tool: 'tool.execute.Task',
				sessionID: 'test-session',
				callID: 'call-128',
				args: ['reviewer'] as never,
			};

			await hook.toolAfter(toolAfterInput, {});
			expect(session.taskWorkflowStates.get('1.1')).toBe('coder_delegated');
		});

		it('should handle subagent_type as number', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const session = ensureAgentSession('test-session');
			session.taskWorkflowStates = new Map([['1.1', 'coder_delegated']]);

			const toolAfterInput = {
				tool: 'tool.execute.Task',
				sessionID: 'test-session',
				callID: 'call-129',
				args: { subagent_type: 123 as unknown },
			};

			await hook.toolAfter(toolAfterInput, {});
			expect(session.taskWorkflowStates.get('1.1')).toBe('coder_delegated');
		});

		it('should handle subagent_type as object', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const session = ensureAgentSession('test-session');
			session.taskWorkflowStates = new Map([['1.1', 'coder_delegated']]);

			const toolAfterInput = {
				tool: 'tool.execute.Task',
				sessionID: 'test-session',
				callID: 'call-130',
				args: { subagent_type: { agent: 'reviewer' } as unknown },
			};

			await hook.toolAfter(toolAfterInput, {});
			expect(session.taskWorkflowStates.get('1.1')).toBe('coder_delegated');
		});

		it('should handle subagent_type as array', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const session = ensureAgentSession('test-session');
			session.taskWorkflowStates = new Map([['1.1', 'coder_delegated']]);

			const toolAfterInput = {
				tool: 'tool.execute.Task',
				sessionID: 'test-session',
				callID: 'call-131',
				args: { subagent_type: ['reviewer'] as unknown },
			};

			await hook.toolAfter(toolAfterInput, {});
			expect(session.taskWorkflowStates.get('1.1')).toBe('coder_delegated');
		});

		it('should handle subagent_type as boolean true', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const session = ensureAgentSession('test-session');
			session.taskWorkflowStates = new Map([['1.1', 'coder_delegated']]);

			const toolAfterInput = {
				tool: 'tool.execute.Task',
				sessionID: 'test-session',
				callID: 'call-132',
				args: { subagent_type: true },
			};

			await hook.toolAfter(toolAfterInput, {});
			expect(session.taskWorkflowStates.get('1.1')).toBe('coder_delegated');
		});

		it('should handle subagent_type as boolean false', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const session = ensureAgentSession('test-session');
			session.taskWorkflowStates = new Map([['1.1', 'coder_delegated']]);

			const toolAfterInput = {
				tool: 'tool.execute.Task',
				sessionID: 'test-session',
				callID: 'call-133',
				args: { subagent_type: false },
			};

			await hook.toolAfter(toolAfterInput, {});
			expect(session.taskWorkflowStates.get('1.1')).toBe('coder_delegated');
		});

		it('should handle SQL injection attempt in subagent_type', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const session = ensureAgentSession('test-session');
			session.taskWorkflowStates = new Map([['1.1', 'coder_delegated']]);

			const toolAfterInput = {
				tool: 'tool.execute.Task',
				sessionID: 'test-session',
				callID: 'call-134',
				args: { subagent_type: 'reviewer; DROP TABLE users;--' },
			};

			await hook.toolAfter(toolAfterInput, {});
			expect(session.taskWorkflowStates.get('1.1')).toBe('coder_delegated');
		});

		it('should handle command injection attempt in subagent_type', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const session = ensureAgentSession('test-session');
			session.taskWorkflowStates = new Map([['1.1', 'coder_delegated']]);

			const toolAfterInput = {
				tool: 'tool.execute.Task',
				sessionID: 'test-session',
				callID: 'call-135',
				args: { subagent_type: 'reviewer && rm -rf /' },
			};

			await hook.toolAfter(toolAfterInput, {});
			expect(session.taskWorkflowStates.get('1.1')).toBe('coder_delegated');
		});

		it('should handle extremely long subagent_type (10000 chars)', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const session = ensureAgentSession('test-session');
			session.taskWorkflowStates = new Map([['1.1', 'coder_delegated']]);

			const longValue = 'r' + 'e'.repeat(9998) + 'w';
			const toolAfterInput = {
				tool: 'tool.execute.Task',
				sessionID: 'test-session',
				callID: 'call-136',
				args: { subagent_type: longValue },
			};

			await hook.toolAfter(toolAfterInput, {});
			expect(session.taskWorkflowStates.get('1.1')).toBe('coder_delegated');
		});

		it('should handle prototype pollution attempt (__proto__)', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const session = ensureAgentSession('test-session');
			session.taskWorkflowStates = new Map([['1.1', 'coder_delegated']]);

			const toolAfterInput = {
				tool: 'tool.execute.Task',
				sessionID: 'test-session',
				callID: 'call-137',
				args: { subagent_type: '__proto__' },
			};

			await hook.toolAfter(toolAfterInput, {});
			expect(session.taskWorkflowStates.get('1.1')).toBe('coder_delegated');
		});

		it('should handle constructor pollution attempt', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const session = ensureAgentSession('test-session');
			session.taskWorkflowStates = new Map([['1.1', 'coder_delegated']]);

			const toolAfterInput = {
				tool: 'tool.execute.Task',
				sessionID: 'test-session',
				callID: 'call-138',
				args: { subagent_type: 'constructor' },
			};

			await hook.toolAfter(toolAfterInput, {});
			expect(session.taskWorkflowStates.get('1.1')).toBe('coder_delegated');
		});

		it('should handle null subagent_type', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const session = ensureAgentSession('test-session');
			session.taskWorkflowStates = new Map([['1.1', 'coder_delegated']]);

			const toolAfterInput = {
				tool: 'tool.execute.Task',
				sessionID: 'test-session',
				callID: 'call-139',
				args: { subagent_type: null },
			};

			await hook.toolAfter(toolAfterInput, {});
			expect(session.taskWorkflowStates.get('1.1')).toBe('coder_delegated');
		});

		it('should handle undefined subagent_type', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const session = ensureAgentSession('test-session');
			session.taskWorkflowStates = new Map([['1.1', 'coder_delegated']]);

			const toolAfterInput = {
				tool: 'tool.execute.Task',
				sessionID: 'test-session',
				callID: 'call-140',
				args: { subagent_type: undefined },
			};

			await hook.toolAfter(toolAfterInput, {});
			expect(session.taskWorkflowStates.get('1.1')).toBe('coder_delegated');
		});

		it('should advance state when valid reviewer in input.args', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const session = ensureAgentSession('test-session');
			session.taskWorkflowStates = new Map([['1.1', 'coder_delegated']]);

			const toolAfterInput = {
				tool: 'tool.execute.Task',
				sessionID: 'test-session',
				callID: 'call-141',
				args: { subagent_type: 'reviewer' },
			};

			await hook.toolAfter(toolAfterInput, {});
			expect(session.taskWorkflowStates.get('1.1')).toBe('reviewer_run');
		});

		it('should advance state when valid test_engineer in input.args', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const session = ensureAgentSession('test-session');
			session.taskWorkflowStates = new Map([['1.1', 'reviewer_run']]);

			const toolAfterInput = {
				tool: 'tool.execute.Task',
				sessionID: 'test-session',
				callID: 'call-142',
				args: { subagent_type: 'test_engineer' },
			};

			await hook.toolAfter(toolAfterInput, {});
			expect(session.taskWorkflowStates.get('1.1')).toBe('tests_run');
		});

		it('should handle empty string subagent_type', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const session = ensureAgentSession('test-session');
			session.taskWorkflowStates = new Map([['1.1', 'coder_delegated']]);

			const toolAfterInput = {
				tool: 'tool.execute.Task',
				sessionID: 'test-session',
				callID: 'call-143',
				args: { subagent_type: '' },
			};

			await hook.toolAfter(toolAfterInput, {});
			expect(session.taskWorkflowStates.get('1.1')).toBe('coder_delegated');
		});

		it('should handle whitespace-only subagent_type', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const session = ensureAgentSession('test-session');
			session.taskWorkflowStates = new Map([['1.1', 'coder_delegated']]);

			const toolAfterInput = {
				tool: 'tool.execute.Task',
				sessionID: 'test-session',
				callID: 'call-144',
				args: { subagent_type: '   ' },
			};

			await hook.toolAfter(toolAfterInput, {});
			expect(session.taskWorkflowStates.get('1.1')).toBe('coder_delegated');
		});

		it('should handle swarm prefix in subagent_type', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const session = ensureAgentSession('test-session');
			session.taskWorkflowStates = new Map([['1.1', 'coder_delegated']]);

			const toolAfterInput = {
				tool: 'tool.execute.Task',
				sessionID: 'test-session',
				callID: 'call-145',
				args: { subagent_type: 'swarm_reviewer' },
			};

			await hook.toolAfter(toolAfterInput, {});
			expect(session.taskWorkflowStates.get('1.1')).toBe('reviewer_run');
		});

		it('should handle unicode in subagent_type', async () => {
			const config = makeConfig();
			const hook = createDelegationGateHook(config, process.cwd());

			const session = ensureAgentSession('test-session');
			session.taskWorkflowStates = new Map([['1.1', 'coder_delegated']]);

			const toolAfterInput = {
				tool: 'tool.execute.Task',
				sessionID: 'test-session',
				callID: 'call-146',
				args: { subagent_type: 'reviewer🚀' },
			};

			await hook.toolAfter(toolAfterInput, {});
			expect(session.taskWorkflowStates.get('1.1')).toBe('coder_delegated');
		});
	});
});

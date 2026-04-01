import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { GuardrailsConfig } from '../../../src/config/schema';
import { createGuardrailsHooks } from '../../../src/hooks/guardrails';
import {
	ensureAgentSession,
	resetSwarmState,
	swarmState,
} from '../../../src/state';

const TEST_DIR = '/test/project';

const defaultConfig: GuardrailsConfig = {
	enabled: true,
	max_tool_calls: 200,
	max_duration_minutes: 30,
	max_repetitions: 10,
	max_consecutive_errors: 5,
	warning_threshold: 0.75,
	idle_timeout_minutes: 60,
	qa_gates: {
		required_tools: [
			'diff',
			'syntax_check',
			'placeholder_scan',
			'lint',
			'pre_check_batch',
		],
		require_reviewer_test_engineer: true,
	},
};

function makeTaskArgs(subagentType: string, prompt = 'Fix the bug') {
	return { subagent_type: subagentType, prompt };
}

describe('guardrails loop detection', () => {
	let hooks: ReturnType<typeof createGuardrailsHooks>;

	beforeEach(() => {
		resetSwarmState();
		hooks = createGuardrailsHooks(TEST_DIR, defaultConfig);
	});

	afterEach(() => {
		resetSwarmState();
	});

	// -------------------------------------------------------------------------
	// Test 1: toolBefore with non-Task tool (bash) — does NOT set loopWarningPending
	// -------------------------------------------------------------------------
	test('toolBefore with bash — does NOT set loopWarningPending, does NOT throw', async () => {
		const sessionId = 'session-bash-test';
		// Set up an architect session
		ensureAgentSession(sessionId, 'architect');
		swarmState.activeAgent.set(sessionId, 'architect');

		const input = { tool: 'bash', sessionID: sessionId, callID: 'call-1' };
		const output = { args: { command: 'ls -la' } };

		await expect(
			hooks.toolBefore(input as any, output as any),
		).resolves.toBeUndefined();

		const session = swarmState.agentSessions.get(sessionId);
		expect(session?.loopWarningPending).toBeUndefined();
	});

	// -------------------------------------------------------------------------
	// Test 2: toolBefore with Task tool, 2 identical delegations — no warning
	// -------------------------------------------------------------------------
	test('toolBefore with Task, 2 identical delegations — no warning (count < 3)', async () => {
		const sessionId = 'session-2-identical';
		ensureAgentSession(sessionId, 'architect');
		swarmState.activeAgent.set(sessionId, 'architect');

		const input1 = { tool: 'Task', sessionID: sessionId, callID: 'call-1' };
		const output1 = { args: makeTaskArgs('coder', 'Fix bug #1') };

		const input2 = { tool: 'Task', sessionID: sessionId, callID: 'call-2' };
		const output2 = { args: makeTaskArgs('coder', 'Fix bug #1') };

		await hooks.toolBefore(input1 as any, output1 as any);
		await hooks.toolBefore(input2 as any, output2 as any);

		const session = swarmState.agentSessions.get(sessionId);
		expect(session?.loopWarningPending).toBeUndefined();
	});

	// -------------------------------------------------------------------------
	// Test 3: toolBefore with Task tool, 3 identical delegations — loopWarningPending set
	// -------------------------------------------------------------------------
	test('toolBefore with Task, 3 identical delegations — loopWarningPending is set', async () => {
		const sessionId = 'session-3-identical';
		ensureAgentSession(sessionId, 'architect');
		swarmState.activeAgent.set(sessionId, 'architect');

		const args = makeTaskArgs('coder', 'Fix the same bug');

		for (let i = 1; i <= 3; i++) {
			const input = { tool: 'Task', sessionID: sessionId, callID: `call-${i}` };
			const output = { args };
			await hooks.toolBefore(input as any, output as any);
		}

		const session = swarmState.agentSessions.get(sessionId);
		expect(session?.loopWarningPending).toBeDefined();
		expect(session?.loopWarningPending?.message).toContain('LOOP DETECTED');
		expect(session?.loopWarningPending?.agent).toBe('coder');
	});

	// -------------------------------------------------------------------------
	// Test 4: toolBefore with Task tool, 5 identical delegations — throws CIRCUIT BREAKER
	// -------------------------------------------------------------------------
	test('toolBefore with Task, 5 identical delegations — throws CIRCUIT BREAKER error', async () => {
		const sessionId = 'session-5-identical';
		ensureAgentSession(sessionId, 'architect');
		swarmState.activeAgent.set(sessionId, 'architect');

		const args = makeTaskArgs('reviewer', 'Review the same task');

		for (let i = 1; i <= 4; i++) {
			const input = { tool: 'Task', sessionID: sessionId, callID: `call-${i}` };
			const output = { args };
			// First 4 should not throw
			await expect(
				hooks.toolBefore(input as any, output as any),
			).resolves.toBeUndefined();
		}

		// 5th should throw
		const input5 = { tool: 'Task', sessionID: sessionId, callID: 'call-5' };
		const output5 = { args };
		await expect(
			hooks.toolBefore(input5 as any, output5 as any),
		).rejects.toThrow('CIRCUIT BREAKER');
	});

	// -------------------------------------------------------------------------
	// Test 5: toolBefore with Task tool, different agents between calls — no loop
	// -------------------------------------------------------------------------
	test('toolBefore with Task, different agents between calls — no loop triggered', async () => {
		const sessionId = 'session-different-agents';
		ensureAgentSession(sessionId, 'architect');
		swarmState.activeAgent.set(sessionId, 'architect');

		const args1 = makeTaskArgs('coder', 'Fix the bug');
		const args2 = makeTaskArgs('reviewer', 'Review the code');
		const args3 = makeTaskArgs('test_engineer', 'Run tests');
		const args4 = makeTaskArgs('coder', 'Fix another bug');
		const args5 = makeTaskArgs('reviewer', 'Review again');

		const inputs = [
			{ tool: 'Task', sessionID: sessionId, callID: 'call-1', args: args1 },
			{ tool: 'Task', sessionID: sessionId, callID: 'call-2', args: args2 },
			{ tool: 'Task', sessionID: sessionId, callID: 'call-3', args: args3 },
			{ tool: 'Task', sessionID: sessionId, callID: 'call-4', args: args4 },
			{ tool: 'Task', sessionID: sessionId, callID: 'call-5', args: args5 },
		];

		for (const inp of inputs) {
			const input = {
				tool: inp.tool,
				sessionID: inp.sessionID,
				callID: inp.callID,
			};
			const output = { args: inp.args };
			await expect(
				hooks.toolBefore(input as any, output as any),
			).resolves.toBeUndefined();
		}

		const session = swarmState.agentSessions.get(sessionId);
		expect(session?.loopWarningPending).toBeUndefined();
	});

	// -------------------------------------------------------------------------
	// Test 6: messagesTransform with loopWarningPending — injects warning + clears flag
	// -------------------------------------------------------------------------
	test('messagesTransform with loopWarningPending — injects "[LOOP WARNING]" and clears flag', async () => {
		const sessionId = 'session-transform-warning';
		ensureAgentSession(sessionId, 'architect');
		swarmState.activeAgent.set(sessionId, 'architect');

		// Pre-set loopWarningPending
		const session = swarmState.agentSessions.get(sessionId)!;
		session.loopWarningPending = {
			agent: 'coder',
			message:
				'LOOP DETECTED: You have delegated to coder with the same pattern 3 times.',
			timestamp: Date.now(),
		};

		const systemMessage = {
			info: { role: 'system', sessionID: sessionId },
			parts: [{ type: 'text' as const, text: 'You are a helpful assistant.' }],
		};

		const output = {
			messages: [
				systemMessage,
				{
					info: { role: 'user', sessionID: sessionId },
					parts: [{ type: 'text' as const, text: 'Hello' }],
				},
			],
		};

		await hooks.messagesTransform({}, output as any);

		// Check warning was injected into system message
		const textPart = output.messages[0].parts[0] as {
			type: string;
			text: string;
		};
		expect(textPart.text).toContain('[LOOP WARNING]');
		expect(textPart.text).toContain('LOOP DETECTED');

		// Check flag was cleared
		expect(session.loopWarningPending).toBeUndefined();
	});

	// -------------------------------------------------------------------------
	// Test 7: messagesTransform with no loopWarningPending — no injection, no error
	// -------------------------------------------------------------------------
	test('messagesTransform with no loopWarningPending — no LOOP WARNING injection, no error', async () => {
		const sessionId = 'session-transform-no-warning';
		ensureAgentSession(sessionId, 'architect');
		swarmState.activeAgent.set(sessionId, 'architect');

		// Session has no gates logged, so partial gate warning will fire (expected behavior).
		// We only care that LOOP WARNING is NOT present.
		const systemMessage = {
			info: { role: 'system', sessionID: sessionId },
			parts: [{ type: 'text' as const, text: 'You are a helpful assistant.' }],
		};

		const output = {
			messages: [
				systemMessage,
				{
					info: { role: 'user', sessionID: sessionId },
					parts: [{ type: 'text' as const, text: 'Hello' }],
				},
			],
		};

		// Should not throw
		await expect(
			hooks.messagesTransform({}, output as any),
		).resolves.toBeUndefined();

		// LOOP WARNING should NOT be present (only checking loop detection behavior)
		const textPart = output.messages[0].parts[0] as {
			type: string;
			text: string;
		};
		expect(textPart.text).not.toContain('[LOOP WARNING]');
	});

	// -------------------------------------------------------------------------
	// Test 8: messagesTransform with loopWarningPending but non-architect session — no injection
	// -------------------------------------------------------------------------
	test('messagesTransform with loopWarningPending but non-architect session — no injection', async () => {
		const sessionId = 'session-transform-non-architect';
		// Set up a non-architect session (e.g., coder)
		ensureAgentSession(sessionId, 'coder');
		swarmState.activeAgent.set(sessionId, 'coder');

		// Pre-set loopWarningPending
		const session = swarmState.agentSessions.get(sessionId)!;
		session.loopWarningPending = {
			agent: 'test_engineer',
			message:
				'LOOP DETECTED: You have delegated to test_engineer with the same pattern 3 times.',
			timestamp: Date.now(),
		};

		const systemMessage = {
			info: { role: 'system', sessionID: sessionId },
			parts: [{ type: 'text' as const, text: 'You are a coder agent.' }],
		};

		const output = {
			messages: [
				systemMessage,
				{
					info: { role: 'user', sessionID: sessionId },
					parts: [{ type: 'text' as const, text: 'Fix the bug' }],
				},
			],
		};

		await hooks.messagesTransform({}, output as any);

		// Message should be unchanged (no architect = no injection)
		const textPart = output.messages[0].parts[0] as {
			type: string;
			text: string;
		};
		expect(textPart.text).toBe('You are a coder agent.');

		// Flag should NOT be cleared because injection didn't happen
		expect(session.loopWarningPending).toBeDefined();
	});

	// -------------------------------------------------------------------------
	// Test 9: FR-001 Gap fix — Warning fires at count=4 (was only at count=3)
	// -------------------------------------------------------------------------
	test('toolBefore with Task, 4 identical delegations — loopWarningPending is set at count=4 (FR-001 gap fix)', async () => {
		const sessionId = 'session-4-identical-fr001';
		ensureAgentSession(sessionId, 'architect');
		swarmState.activeAgent.set(sessionId, 'architect');

		const args = makeTaskArgs('coder', 'Fix the same bug');

		// Make 4 identical delegations
		for (let i = 1; i <= 4; i++) {
			const input = { tool: 'Task', sessionID: sessionId, callID: `call-${i}` };
			const output = { args };
			await hooks.toolBefore(input as any, output as any);
		}

		const session = swarmState.agentSessions.get(sessionId);
		expect(session?.loopWarningPending).toBeDefined();
		expect(session?.loopWarningPending?.message).toContain('LOOP DETECTED');
		expect(session?.loopWarningPending?.agent).toBe('coder');
		// Message should reference count >= 3 (not just "3 times")
		expect(session?.loopWarningPending?.message).toMatch(
			/3 times|4 times|repeated/,
		);
	});

	// -------------------------------------------------------------------------
	// Test 10: Boundary — count=1 should NOT trigger warning
	// -------------------------------------------------------------------------
	test('toolBefore with Task, 1 delegation — no warning (count=1 below threshold)', async () => {
		const sessionId = 'session-1-delegation';
		ensureAgentSession(sessionId, 'architect');
		swarmState.activeAgent.set(sessionId, 'architect');

		const args = makeTaskArgs('coder', 'Fix a bug');

		const input = { tool: 'Task', sessionID: sessionId, callID: 'call-1' };
		const output = { args };
		await hooks.toolBefore(input as any, output as any);

		const session = swarmState.agentSessions.get(sessionId);
		expect(session?.loopWarningPending).toBeUndefined();
	});

	// -------------------------------------------------------------------------
	// Test 11: FR-001 — Warning fires at count=3 AND count=4, then hard block at count=5
	// -------------------------------------------------------------------------
	test('toolBefore with Task, progression 3->4->5: warning at 3, warning at 4, block at 5', async () => {
		const sessionId = 'session-progression-345';
		ensureAgentSession(sessionId, 'architect');
		swarmState.activeAgent.set(sessionId, 'architect');

		const args = makeTaskArgs('reviewer', 'Review task');

		// Call 1-2: no warning
		for (let i = 1; i <= 2; i++) {
			const input = { tool: 'Task', sessionID: sessionId, callID: `call-${i}` };
			const output = { args };
			await hooks.toolBefore(input as any, output as any);
		}
		expect(
			swarmState.agentSessions.get(sessionId)?.loopWarningPending,
		).toBeUndefined();

		// Call 3: warning fires
		const input3 = { tool: 'Task', sessionID: sessionId, callID: 'call-3' };
		const output3 = { args };
		await hooks.toolBefore(input3 as any, output3 as any);
		expect(
			swarmState.agentSessions.get(sessionId)?.loopWarningPending,
		).toBeDefined();

		// Clear the warning to test count=4
		swarmState.agentSessions.get(sessionId)!.loopWarningPending = undefined;

		// Call 4: warning fires again (this was the gap)
		const input4 = { tool: 'Task', sessionID: sessionId, callID: 'call-4' };
		const output4 = { args };
		await hooks.toolBefore(input4 as any, output4 as any);
		expect(
			swarmState.agentSessions.get(sessionId)?.loopWarningPending,
		).toBeDefined();

		// Clear the warning to test count=5 block
		swarmState.agentSessions.get(sessionId)!.loopWarningPending = undefined;

		// Call 5: hard block
		const input5 = { tool: 'Task', sessionID: sessionId, callID: 'call-5' };
		const output5 = { args };
		await expect(
			hooks.toolBefore(input5 as any, output5 as any),
		).rejects.toThrow('CIRCUIT BREAKER');
	});
});

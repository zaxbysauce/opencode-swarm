/**
 * Integration test for circuit breaker per-invocation budget isolation
 *
 * Tests that:
 * 1. A subagent can be re-invoked after its first invocation hits the limit
 * 2. Budgets are isolated between different agents (coder vs reviewer)
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ORCHESTRATOR_NAME } from '../../src/config/constants';
import type { GuardrailsConfig } from '../../src/config/schema';
import type { PluginConfig } from '../../src/config/schema';
import { createGuardrailsHooks } from '../../src/hooks/guardrails';
import { createDelegationTrackerHook } from '../../src/hooks/delegation-tracker';
import {
	beginInvocation,
	ensureAgentSession,
	getActiveWindow,
	resetSwarmState,
	swarmState,
} from '../../src/state';

describe('Circuit Breaker Multi-Invocation Budget Isolation', () => {
	const sessionId = 'test-session-multi';

	// PluginConfig for delegation tracker
	const pluginConfig: PluginConfig = {
		max_iterations: 5,
		qa_retry_limit: 3,
		inject_phase_reminders: true,
	};

	// GuardrailsConfig with strict tool call limit
	const guardrailsConfig: GuardrailsConfig = {
		enabled: true,
		max_tool_calls: 10,
		max_duration_minutes: 30,
		max_repetitions: 10,
		max_consecutive_errors: 5,
		warning_threshold: 0.75,
		idle_timeout_minutes: 60,
	};

	beforeEach(() => {
		resetSwarmState();
	});

	afterEach(() => {
		resetSwarmState();
	});

	it('should allow coder re-invocation after first invocation hits limit', async () => {
		// Create hooks
		const delegationHook = createDelegationTrackerHook(pluginConfig);
		const guardrailsHooks = createGuardrailsHooks(guardrailsConfig);

		// Step 1: Delegate to mega_coder
		await delegationHook({ sessionID: sessionId, agent: 'mega_coder' }, {});

		// Verify initial state - first invocation window created
		const window1 = getActiveWindow(sessionId);
		expect(window1).toBeDefined();
		expect(window1?.id).toBe(1);
		expect(window1?.toolCalls).toBe(0);
		expect(window1?.hardLimitHit).toBe(false);

		// Step 2: Make 9 tool calls - should all succeed
		// toolBefore increments toolCalls FIRST, then checks >= max_tool_calls
		// With max_tool_calls=10: calls 1-9 succeed, call 10 throws
		for (let i = 1; i <= 9; i++) {
			const callId = `call-first-${i}`;
			await guardrailsHooks.toolBefore(
				{ tool: 'read', sessionID: sessionId, callID: callId },
				{ args: { filePath: '/test' } },
			);
			await guardrailsHooks.toolAfter(
				{ tool: 'read', sessionID: sessionId, callID: callId },
				{ title: 'read', output: 'content', metadata: {} },
			);
		}

		// Verify 9 calls completed
		const windowAfter9 = getActiveWindow(sessionId);
		expect(windowAfter9?.toolCalls).toBe(9);

		// Step 3: 10th tool call should throw (limit reached)
		const callId10 = 'call-first-10';
		await expect(
			guardrailsHooks.toolBefore(
				{ tool: 'read', sessionID: sessionId, callID: callId10 },
				{ args: { filePath: '/test' } },
			),
		).rejects.toThrow(/LIMIT REACHED/);

		// Verify hardLimitHit is set
		const window1Final = getActiveWindow(sessionId);
		expect(window1Final?.hardLimitHit).toBe(true);

		// Step 4: Reset to architect (empty agent string)
		await delegationHook({ sessionID: sessionId, agent: '' }, {});

		// Step 5: Delegate to mega_coder again
		await delegationHook({ sessionID: sessionId, agent: 'mega_coder' }, {});

		// Step 6: Verify new window (second invocation) is created with fresh budget
		const window2 = getActiveWindow(sessionId);
		expect(window2).toBeDefined();
		expect(window2?.id).toBe(2); // Second invocation
		expect(window2?.toolCalls).toBe(0);
		expect(window2?.hardLimitHit).toBe(false);

		// Step 7: Make a tool call - should succeed (fresh budget)
		const callIdNew = 'call-new-1';
		await guardrailsHooks.toolBefore(
			{ tool: 'read', sessionID: sessionId, callID: callIdNew },
			{ args: { filePath: '/test' } },
		);

		// Step 8: Verify toolCalls incremented in new window
		const window2AfterCall = getActiveWindow(sessionId);
		expect(window2AfterCall?.toolCalls).toBe(1);
	});

	it('should isolate budgets between different agents', async () => {
		// Create hooks
		const delegationHook = createDelegationTrackerHook(pluginConfig);
		const guardrailsHooks = createGuardrailsHooks(guardrailsConfig);

		// Step 1: Delegate to mega_coder
		await delegationHook({ sessionID: sessionId, agent: 'mega_coder' }, {});

		// Verify initial state
		const coderWindow = getActiveWindow(sessionId);
		expect(coderWindow).toBeDefined();
		expect(coderWindow?.id).toBe(1);
		expect(coderWindow?.toolCalls).toBe(0);

		// Step 2: Make tool calls until limit (9 ok, 10th throws)
		for (let i = 1; i <= 9; i++) {
			const callId = `coder-call-${i}`;
			await guardrailsHooks.toolBefore(
				{ tool: 'read', sessionID: sessionId, callID: callId },
				{ args: { filePath: '/test' } },
			);
			await guardrailsHooks.toolAfter(
				{ tool: 'read', sessionID: sessionId, callID: callId },
				{ title: 'read', output: 'content', metadata: {} },
			);
		}

		// 10th call should throw
		const callId10 = 'coder-call-10';
		await expect(
			guardrailsHooks.toolBefore(
				{ tool: 'read', sessionID: sessionId, callID: callId10 },
				{ args: { filePath: '/test' } },
			),
		).rejects.toThrow(/LIMIT REACHED/);

		// Verify coder window hit hard limit
		const coderWindowFinal = getActiveWindow(sessionId);
		expect(coderWindowFinal?.hardLimitHit).toBe(true);

		// Step 3: Reset to architect
		await delegationHook({ sessionID: sessionId, agent: '' }, {});

		// Step 4: Delegate to mega_reviewer (different agent)
		await delegationHook({ sessionID: sessionId, agent: 'mega_reviewer' }, {});

		// Step 5: Verify reviewer has fresh window with 0 tool calls
		const reviewerWindow = getActiveWindow(sessionId);
		expect(reviewerWindow).toBeDefined();
		expect(reviewerWindow?.id).toBe(1); // First invocation for reviewer
		expect(reviewerWindow?.toolCalls).toBe(0);
		expect(reviewerWindow?.hardLimitHit).toBe(false);

		// Step 6: Make a tool call as reviewer - should succeed
		const reviewerCallId = 'reviewer-call-1';
		await guardrailsHooks.toolBefore(
			{ tool: 'read', sessionID: sessionId, callID: reviewerCallId },
			{ args: { filePath: '/test' } },
		);

		// Step 7: Verify reviewer window has 1 tool call (isolated budget)
		const reviewerWindowAfter = getActiveWindow(sessionId);
		expect(reviewerWindowAfter?.toolCalls).toBe(1);
	});
});

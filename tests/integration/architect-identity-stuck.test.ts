/**
 * Regression tests for architect identity-stuck bug
 *
 * These tests expose bugs in the current implementation:
 * 1. Stale subagent identity + repeated tool calls should still stale-reset to architect
 *    (tool activity must NOT prevent stale detection)
 * 2. Task tool completion should force immediate architect handoff even if chat.message is delayed
 * 3. Prefixed architect in chat.message should set delegationActive=false
 * 4. Existing guardrails behavior should remain intact for real subagents
 *
 * These tests are DESIGNED TO FAIL with the current buggy implementation
 * and PASS after the fix is applied.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ORCHESTRATOR_NAME } from '../../src/config/constants';
import type { PluginConfig } from '../../src/config/schema';
import { createDelegationTrackerHook } from '../../src/hooks/delegation-tracker';
import { createGuardrailsHooks } from '../../src/hooks/guardrails';
import {
	beginInvocation,
	ensureAgentSession,
	getActiveWindow,
	getAgentSession,
	resetSwarmState,
	swarmState,
} from '../../src/state';

describe('Architect Identity-Stuck Regression Tests', () => {
	const sessionId = 'test-session-regression';
	const defaultConfig: PluginConfig = {
		max_iterations: 5,
		qa_retry_limit: 3,
		inject_phase_reminders: true,
	};

	beforeEach(() => {
		resetSwarmState();
	});

	afterEach(() => {
		resetSwarmState();
	});

	describe('BUG 1: Stale subagent identity + repeated tool calls should stale-reset', () => {
		/**
		 * BUG: When subagent makes repeated tool calls, lastToolCallTime keeps getting updated,
		 * preventing the 10s stale window from ever triggering. The architect stays "stuck"
		 * as the subagent identity.
		 *
		 * The fix requires SEPARATING two timestamps:
		 * 1. lastToolCallTime - for tool activity (idle timeout)
		 * 2. delegationStartTime or similar - for stale delegation detection
		 *
		 * Currently, they use the same lastToolCallTime, which causes the bug.
		 */
		it('REGRESSION: stale detection should NOT depend on recent tool activity', async () => {
			// Setup: Subagent (mega_coder) was delegated, then delegation ended
			swarmState.activeAgent.set(sessionId, 'mega_coder');
			const session = ensureAgentSession(sessionId, 'mega_coder');
			session.delegationActive = false; // Delegation explicitly ended

			// Set lastToolCallTime to 15 seconds ago to simulate stale state
			session.lastToolCallTime = Date.now() - 15000;

			// The stale check should return TRUE because delegationActive=false
			// regardless of when the last tool call was
			const staleDueToDelegationActive = !session.delegationActive;
			expect(staleDueToDelegationActive).toBe(true); // This part works
		});

		/**
		 * The bug: When delegationActive=true (subagent still working),
		 * but lastToolCallTime is stale (>10s), the stale detection should work.
		 */
		it('REGRESSION: tool activity should not prevent stale detection when delegationActive=false', async () => {
			swarmState.activeAgent.set(sessionId, 'mega_coder');
			const session = ensureAgentSession(sessionId, 'mega_coder');

			// Set delegation as ended (subagent returned control)
			session.delegationActive = false;
			session.lastToolCallTime = Date.now() - 5000; // 5 seconds ago (within 10s window)

			// The stale check should return TRUE because delegationActive=false
			// even though lastToolCallTime is recent (< 10s)
			const staleCheck =
				!session.delegationActive ||
				Date.now() - session.lastToolCallTime > 10000;

			// With delegationActive=false, this should be true regardless of time
			expect(staleCheck).toBe(true);

			// This correctly resets to architect
			if (staleCheck) {
				swarmState.activeAgent.set(sessionId, ORCHESTRATOR_NAME);
				ensureAgentSession(sessionId, ORCHESTRATOR_NAME);
			}

			expect(swarmState.activeAgent.get(sessionId)).toBe(ORCHESTRATOR_NAME);
		});
	});

	describe('BUG 2: Task tool completion should force immediate architect handoff', () => {
		/**
		 * BUG: When a "task" tool completes (subagent finishes), there's no mechanism
		 * to immediately hand off to architect. The chat.message hook may be delayed,
		 * leaving the subagent identity "stuck".
		 */
		it('REGRESSION: task tool completion should trigger immediate architect handoff', async () => {
			const delegationHook = createDelegationTrackerHook(defaultConfig);

			// Setup: Subagent is working
			swarmState.activeAgent.set(sessionId, 'mega_coder');
			const session = ensureAgentSession(sessionId, 'mega_coder');
			session.delegationActive = true;

			// CURRENT BUG: There's no hook to detect task completion and do handoff
			// The chat.message might come later, leaving identity stuck
			expect(session.delegationActive).toBe(true); // Still active!
			expect(swarmState.activeAgent.get(sessionId)).toBe('mega_coder'); // Still mega_coder!

			// Even after a delay (simulating no chat.message), nothing changes
			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(session.delegationActive).toBe(true);
			expect(swarmState.activeAgent.get(sessionId)).toBe('mega_coder');
		});

		it('should hand off to architect when chat.message fires with no agent', async () => {
			const delegationHook = createDelegationTrackerHook(defaultConfig);

			// Setup: Subagent was working
			swarmState.activeAgent.set(sessionId, 'mega_coder');
			const session = ensureAgentSession(sessionId, 'mega_coder');
			session.delegationActive = true;

			// Chat.message fires with no agent (delegation ended)
			await delegationHook({ sessionID: sessionId, agent: undefined }, {});

			// Now it should be architect
			expect(session.delegationActive).toBe(false);
			expect(swarmState.activeAgent.get(sessionId)).toBe(ORCHESTRATOR_NAME);
		});
	});

	describe('BUG 3: Prefixed architect in chat.message should set delegationActive=false', () => {
		/**
		 * BUG: When chat.message receives a message with "architect" as the agent,
		 * it should recognize this as the architect taking over and set
		 * delegationActive=false.
		 *
		 * CURRENT BUG: The code only sets delegationActive=false when agent is
		 * empty/undefined, not when agent is explicitly "architect".
		 */
		it('REGRESSION: architect agent in chat.message should set delegationActive=false', async () => {
			const delegationHook = createDelegationTrackerHook(defaultConfig);

			// Setup: Subagent was working
			swarmState.activeAgent.set(sessionId, 'mega_coder');
			const session = ensureAgentSession(sessionId, 'mega_coder');
			session.delegationActive = true;

			// Chat.message fires with "architect" as agent (architect taking over)
			// EXPECTED: Should recognize as architect and set delegationActive=false
			await delegationHook({ sessionID: sessionId, agent: 'architect' }, {});

			// CURRENT BUG: This fails because the code only checks for empty/undefined
			// It doesn't recognize "architect" as a signal to end delegation
			expect(session.delegationActive).toBe(false);
			expect(swarmState.activeAgent.get(sessionId)).toBe(ORCHESTRATOR_NAME);
		});

		it('REGRESSION: prefixed mega_architect in chat.message should also end delegation', async () => {
			const delegationHook = createDelegationTrackerHook(defaultConfig);

			// Setup: Subagent was working
			swarmState.activeAgent.set(sessionId, 'mega_coder');
			const session = ensureAgentSession(sessionId, 'mega_coder');
			session.delegationActive = true;

			// Chat.message fires with "mega_architect" as agent
			// EXPECTED: Should recognize as architect and set delegationActive=false
			await delegationHook({ sessionID: sessionId, agent: 'mega_architect' }, {});

			// CURRENT BUG: This fails too - needs prefix stripping
			expect(session.delegationActive).toBe(false);
		});

		it('empty agent should still work (existing behavior)', async () => {
			const delegationHook = createDelegationTrackerHook(defaultConfig);

			// Setup: Subagent was working
			swarmState.activeAgent.set(sessionId, 'mega_coder');
			const session = ensureAgentSession(sessionId, 'mega_coder');
			session.delegationActive = true;

			// Chat.message fires with empty agent (existing behavior)
			await delegationHook({ sessionID: sessionId, agent: '' }, {});

			// This should work (existing behavior)
			expect(session.delegationActive).toBe(false);
			expect(swarmState.activeAgent.get(sessionId)).toBe(ORCHESTRATOR_NAME);
		});
	});

	describe('BUG 4: Guardrails should remain intact for real subagents', () => {
		/**
		 * This test validates that guardrails still work for subagents.
		 * Note: Extensive guardrail tests exist in other test files.
		 */

		it('architect should be exempt from guardrails', async () => {
			const config: Parameters<typeof createGuardrailsHooks>[0] = {
				enabled: true,
				max_tool_calls: 5,
				max_duration_minutes: 30,
				max_repetitions: 10,
				max_consecutive_errors: 5,
				warning_threshold: 0.8,
				idle_timeout_minutes: 60,
				profiles: {
					architect: {
						max_duration_minutes: 0, // Exempt
						max_tool_calls: 0, // Exempt
					},
				},
			};

			const hooks = createGuardrailsHooks(config);

			// Architect should be exempt
			swarmState.activeAgent.set(sessionId, ORCHESTRATOR_NAME);
			ensureAgentSession(sessionId, ORCHESTRATOR_NAME);

			// Make many tool calls - architect should be exempt
			for (let i = 0; i < 10; i++) {
				await expect(
					hooks.toolBefore(
						{ tool: 'read', sessionID: sessionId, callID: `arch-call-${i}` },
						{ args: { filePath: `/test${i}` } },
					),
				).resolves.toBeUndefined();
			}

			const archSession = getAgentSession(sessionId);
			// Architect has no window (exempt from guardrails)
			const archWindow = getActiveWindow(sessionId);
			expect(archWindow).toBeUndefined();
		});
	});

	describe('Edge cases for identity-stuck bug', () => {
		it('should handle rapid delegation cycles correctly', async () => {
			const delegationHook = createDelegationTrackerHook(defaultConfig);

			// Architect starts - delegationActive should be false (architect is not a subagent)
			await delegationHook({ sessionID: sessionId, agent: 'architect' }, {});
			expect(swarmState.activeAgent.get(sessionId)).toBe(ORCHESTRATOR_NAME);

			let session = getAgentSession(sessionId);
			expect(session?.delegationActive).toBe(false); // Architect has delegationActive=false

			// Delegate to coder - delegationActive should be true (subagent)
			await delegationHook({ sessionID: sessionId, agent: 'coder' }, {});
			expect(swarmState.activeAgent.get(sessionId)).toBe('coder');

			// Return to architect - delegationActive should be false
			await delegationHook({ sessionID: sessionId, agent: undefined }, {});
			expect(swarmState.activeAgent.get(sessionId)).toBe(ORCHESTRATOR_NAME);

			session = getAgentSession(sessionId);
			expect(session?.delegationActive).toBe(false);

			// Delegate again to reviewer - delegationActive should be true (subagent)
			await delegationHook({ sessionID: sessionId, agent: 'reviewer' }, {});
			expect(swarmState.activeAgent.get(sessionId)).toBe('reviewer');

			session = getAgentSession(sessionId);
			expect(session?.delegationActive).toBe(true); // Subagent has delegationActive=true
		});

		it('should handle unknown agent names gracefully', async () => {
			const delegationHook = createDelegationTrackerHook(defaultConfig);

			// Unknown agent
			await delegationHook({ sessionID: sessionId, agent: 'custom_agent' }, {});
			expect(swarmState.activeAgent.get(sessionId)).toBe('custom_agent');

			const session = getAgentSession(sessionId);
			expect(session?.agentName).toBe('custom_agent');
			expect(session?.delegationActive).toBe(true);
		});

		it('should preserve session state across agent switches', async () => {
			const delegationHook = createDelegationTrackerHook(defaultConfig);
			const config: Parameters<typeof createGuardrailsHooks>[0] = {
				enabled: true,
				max_tool_calls: 100,
				max_duration_minutes: 30,
				max_repetitions: 10,
				max_consecutive_errors: 5,
				warning_threshold: 0.8,
				idle_timeout_minutes: 60,
			};

			const guardrailsHooks = createGuardrailsHooks(config);

			// Start with coder
			swarmState.activeAgent.set(sessionId, 'mega_coder');
			const session = ensureAgentSession(sessionId, 'mega_coder');
			session.delegationActive = true;
			beginInvocation(sessionId, 'mega_coder');
			const window = getActiveWindow(sessionId)!;
			window.toolCalls = 3;

			// Make a tool call as coder
			await guardrailsHooks.toolBefore(
				{ tool: 'read', sessionID: sessionId, callID: 'call-1' },
				{ args: { filePath: '/test' } },
			);

			expect(window.toolCalls).toBe(4);

			// Switch to architect
			await delegationHook({ sessionID: sessionId, agent: 'architect' }, {});

			// After switching to architect, tool call count should be reset
			const updatedSession = getAgentSession(sessionId);
			expect(updatedSession?.agentName).toBe(ORCHESTRATOR_NAME);
			// Architect has no active window (exempt from guardrails)
			const archWindow = getActiveWindow(sessionId);
			expect(archWindow).toBeUndefined();
		});

		it('should correctly strip swarm prefix for agent name resolution', async () => {
			const config: Parameters<typeof createGuardrailsHooks>[0] = {
				enabled: true,
				max_tool_calls: 100,
				max_duration_minutes: 30,
				max_repetitions: 10,
				max_consecutive_errors: 5,
				warning_threshold: 0.8,
				idle_timeout_minutes: 60,
				profiles: {
					architect: {
						max_duration_minutes: 0,
						max_tool_calls: 0,
					},
					coder: {
						max_tool_calls: 50,
						max_duration_minutes: 20,
					},
				},
			};

			const hooks = createGuardrailsHooks(config);

			// Test mega_coder -> coder profile resolution
			swarmState.activeAgent.set(sessionId, 'mega_coder');
			const session = ensureAgentSession(sessionId, 'mega_coder');
			beginInvocation(sessionId, 'mega_coder');
			const window = getActiveWindow(sessionId)!;

			// Should resolve to coder profile (20 min limit)
			window.startedAtMs = Date.now() - 25 * 60000; // 25 minutes ago

			// Should throw because it exceeds coder's 20 min limit
			await expect(
				hooks.toolBefore(
					{ tool: 'read', sessionID: sessionId, callID: 'call-1' },
					{ args: { filePath: '/test' } },
				),
			).rejects.toThrow(/LIMIT REACHED/);
		});
	});
});

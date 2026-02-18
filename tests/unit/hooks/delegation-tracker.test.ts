import { describe, it, expect, beforeEach } from 'bun:test';
import { swarmState, resetSwarmState, getActiveWindow } from '../../../src/state';
import { createDelegationTrackerHook } from '../../../src/hooks/delegation-tracker';
import type { PluginConfig } from '../../../src/config';

describe('DelegationTrackerHook', () => {
	const defaultConfig: PluginConfig = {
		max_iterations: 5,
		qa_retry_limit: 3,
		inject_phase_reminders: true,
	};

	const enabledConfig: PluginConfig = {
		max_iterations: 5,
		qa_retry_limit: 3,
		inject_phase_reminders: true,
		hooks: {
			system_enhancer: true,
			compaction: true,
			agent_activity: true,
			delegation_tracker: true,
			agent_awareness_max_chars: 300,
		},
	};

	beforeEach(() => {
		resetSwarmState();
	});

	describe('activeAgent updates', () => {
		it('always updates activeAgent when agent is present', async () => {
			const hook = createDelegationTrackerHook(defaultConfig);
			const sessionId = 'test-session-1';

			await hook({ sessionID: sessionId, agent: 'coder' }, {});

			expect(swarmState.activeAgent.get(sessionId)).toBe('coder');
		});

		it('skips when no agent is specified', async () => {
			const hook = createDelegationTrackerHook(defaultConfig);
			const sessionId = 'test-session-1';

			// Set a previous agent
			swarmState.activeAgent.set(sessionId, 'architect');

			await hook({ sessionID: sessionId }, {});

			// Should remain unchanged
			expect(swarmState.activeAgent.get(sessionId)).toBe('architect');
			expect(swarmState.delegationChains.has(sessionId)).toBe(false);
			expect(swarmState.pendingEvents).toBe(0);
		});

		it('skips when agent is empty string', async () => {
			const hook = createDelegationTrackerHook(defaultConfig);
			const sessionId = 'test-session-1';

			// Set a previous agent
			swarmState.activeAgent.set(sessionId, 'architect');

			await hook({ sessionID: sessionId, agent: '' }, {});

			// Should remain unchanged
			expect(swarmState.activeAgent.get(sessionId)).toBe('architect');
			expect(swarmState.delegationChains.has(sessionId)).toBe(false);
			expect(swarmState.pendingEvents).toBe(0);
		});

		it('activeAgent tracks correctly', async () => {
			const hook = createDelegationTrackerHook(defaultConfig);
			const sessionId = 's1';

			await hook({ sessionID: sessionId, agent: 'coder' }, {});

			expect(swarmState.activeAgent.get('s1')).toBe('coder');
		});

		it('multiple sessions maintain independent active agents', async () => {
			const hook = createDelegationTrackerHook(defaultConfig);

			await hook({ sessionID: 'session1', agent: 'architect' }, {});
			await hook({ sessionID: 'session2', agent: 'coder' }, {});
			await hook({ sessionID: 'session3', agent: 'reviewer' }, {});

			expect(swarmState.activeAgent.get('session1')).toBe('architect');
			expect(swarmState.activeAgent.get('session2')).toBe('coder');
			expect(swarmState.activeAgent.get('session3')).toBe('reviewer');
		});
	});

	describe('delegation tracking disabled by default', () => {
		it('no delegation entries created when delegation_tracker is undefined', async () => {
			const hook = createDelegationTrackerHook(defaultConfig);
			const sessionId = 'test-session';

			// Set previous agent
			swarmState.activeAgent.set(sessionId, 'architect');

			await hook({ sessionID: sessionId, agent: 'coder' }, {});

			expect(swarmState.delegationChains.has(sessionId)).toBe(false);
			expect(swarmState.pendingEvents).toBe(0);
			expect(swarmState.activeAgent.get(sessionId)).toBe('coder'); // But agent still updated
		});

		it('no delegation entries created when delegation_tracker is false', async () => {
			const disabledConfig: PluginConfig = {
				...defaultConfig,
				hooks: {
					system_enhancer: false,
					compaction: false,
					agent_activity: false,
					delegation_tracker: false,
					agent_awareness_max_chars: 300,
				},
			};
			const hook = createDelegationTrackerHook(disabledConfig);
			const sessionId = 'test-session';

			// Set previous agent
			swarmState.activeAgent.set(sessionId, 'architect');

			await hook({ sessionID: sessionId, agent: 'coder' }, {});

			expect(swarmState.delegationChains.has(sessionId)).toBe(false);
			expect(swarmState.pendingEvents).toBe(0);
			expect(swarmState.activeAgent.get(sessionId)).toBe('coder'); // But agent still updated
		});

		it('pendingEvents NOT incremented when delegation tracking disabled', async () => {
			const hook = createDelegationTrackerHook(defaultConfig);
			const sessionId = 'test-session';

			swarmState.activeAgent.set(sessionId, 'architect');
			const initialEvents = swarmState.pendingEvents;

			await hook({ sessionID: sessionId, agent: 'coder' }, {});

			expect(swarmState.pendingEvents).toBe(initialEvents); // Should remain unchanged
		});
	});

	describe('delegation tracking enabled', () => {
		it('creates delegation entry when agent changes', async () => {
			const hook = createDelegationTrackerHook(enabledConfig);
			const sessionId = 'test-session';

			// Set previous agent
			swarmState.activeAgent.set(sessionId, 'architect');

			await hook({ sessionID: sessionId, agent: 'coder' }, {});

			expect(swarmState.delegationChains.has(sessionId)).toBe(true);
			const chain = swarmState.delegationChains.get(sessionId);
			expect(chain).toHaveLength(1);

			const entry = chain![0];
			expect(entry.from).toBe('architect');
			expect(entry.to).toBe('coder');
			expect(typeof entry.timestamp).toBe('number');
			expect(entry.timestamp).toBeGreaterThan(0);
		});

		it('same agent does not create delegation entry', async () => {
			const hook = createDelegationTrackerHook(enabledConfig);
			const sessionId = 'test-session';

			// Set previous agent
			swarmState.activeAgent.set(sessionId, 'architect');

			await hook({ sessionID: sessionId, agent: 'architect' }, {});

			expect(swarmState.delegationChains.has(sessionId)).toBe(false);
			expect(swarmState.pendingEvents).toBe(0);
		});

		it('first agent assignment does not create delegation entry', async () => {
			const hook = createDelegationTrackerHook(enabledConfig);
			const sessionId = 'test-session';

			// No previous agent set
			await hook({ sessionID: sessionId, agent: 'architect' }, {});

			expect(swarmState.delegationChains.has(sessionId)).toBe(false);
			expect(swarmState.pendingEvents).toBe(0);
		});

		it('chain accumulates multiple agent switches', async () => {
			const hook = createDelegationTrackerHook(enabledConfig);
			const sessionId = 'test-session';

			// Simulate a series of agent switches
			swarmState.activeAgent.set(sessionId, 'architect');
			await hook({ sessionID: sessionId, agent: 'coder' }, {});
			await hook({ sessionID: sessionId, agent: 'reviewer' }, {});
			await hook({ sessionID: sessionId, agent: 'sme' }, {});
			await hook({ sessionID: sessionId, agent: 'tester' }, {});

			const chain = swarmState.delegationChains.get(sessionId);
			expect(chain).toHaveLength(4); // 4 switches total

			expect(chain![0]).toEqual({
				from: 'architect',
				to: 'coder',
				timestamp: expect.any(Number),
			});
			expect(chain![1]).toEqual({
				from: 'coder',
				to: 'reviewer',
				timestamp: expect.any(Number),
			});
			expect(chain![2]).toEqual({
				from: 'reviewer',
				to: 'sme',
				timestamp: expect.any(Number),
			});
			expect(chain![3]).toEqual({
				from: 'sme',
				to: 'tester',
				timestamp: expect.any(Number),
			});
		});

		it('pendingEvents increments for each delegation', async () => {
			const hook = createDelegationTrackerHook(enabledConfig);
			const sessionId = 'test-session';

			swarmState.activeAgent.set(sessionId, 'architect');
			const initialEvents = swarmState.pendingEvents;

			await hook({ sessionID: sessionId, agent: 'coder' }, {});
			expect(swarmState.pendingEvents).toBe(initialEvents + 1);

			await hook({ sessionID: sessionId, agent: 'reviewer' }, {});
			expect(swarmState.pendingEvents).toBe(initialEvents + 2);
		});

		it('pendingEvents NOT incremented when delegation tracking disabled', async () => {
			const hook = createDelegationTrackerHook(enabledConfig);
			const sessionId = 'test-session';

			// Use default config (delegation tracking disabled)
			const disabledHook = createDelegationTrackerHook(defaultConfig);

			swarmState.activeAgent.set(sessionId, 'architect');
			const initialEvents = swarmState.pendingEvents;

			await disabledHook({ sessionID: sessionId, agent: 'coder' }, {});

			expect(swarmState.pendingEvents).toBe(initialEvents); // Should remain unchanged
		});
	});

	describe('edge cases', () => {
		it('handles null agent gracefully', async () => {
			const hook = createDelegationTrackerHook(enabledConfig);
			const sessionId = 'test-session';

			swarmState.activeAgent.set(sessionId, 'architect');

			// @ts-expect-error - testing runtime behavior with null
			await hook({ sessionID: sessionId, agent: null }, {});

			// Should remain unchanged since null is falsy
			expect(swarmState.activeAgent.get(sessionId)).toBe('architect');
			expect(swarmState.delegationChains.has(sessionId)).toBe(false);
		});

		it('handles multiple sessions with different delegation patterns', async () => {
			const hook = createDelegationTrackerHook(enabledConfig);

			// Session 1: agent switch (should create delegation)
			swarmState.activeAgent.set('session1', 'architect');
			await hook({ sessionID: 'session1', agent: 'coder' }, {});

			// Session 2: first agent (no delegation)
			await hook({ sessionID: 'session2', agent: 'reviewer' }, {});

			// Session 3: same agent (no delegation)
			swarmState.activeAgent.set('session3', 'sme');
			await hook({ sessionID: 'session3', agent: 'sme' }, {});

			// Session 4: agent switch (should create delegation)
			swarmState.activeAgent.set('session4', 'architect');
			await hook({ sessionID: 'session4', agent: 'tester' }, {});

			expect(swarmState.delegationChains.get('session1')).toHaveLength(1);
			expect(swarmState.delegationChains.get('session2')).toBeUndefined();
			expect(swarmState.delegationChains.get('session3')).toBeUndefined();
			expect(swarmState.delegationChains.get('session4')).toHaveLength(1);

			expect(swarmState.pendingEvents).toBe(2); // Only 2 actual delegations
		});

		it('delegation chain initialization creates new array on first switch', async () => {
			const hook = createDelegationTrackerHook(enabledConfig);
			const sessionId = 'sess';

			// Set initial agent
			swarmState.activeAgent.set(sessionId, 'architect');

			// First delegation should create a new array
			await hook({ sessionID: sessionId, agent: 'coder' }, {});
			const firstChain = swarmState.delegationChains.get(sessionId);
			expect(firstChain).toHaveLength(1);

			// Second delegation should reuse the same array (not create a new one)
			const originalArray = firstChain;
			await hook({ sessionID: sessionId, agent: 'reviewer' }, {});
			const secondChain = swarmState.delegationChains.get(sessionId);

			// Verify it's the same array object (reference equality)
			expect(secondChain).toBe(originalArray);
			expect(secondChain).toHaveLength(2);
		});

		it('timestamps are monotonically increasing', async () => {
			const hook = createDelegationTrackerHook(enabledConfig);
			const sessionId = 'test-session';

			// Set initial agent
			swarmState.activeAgent.set(sessionId, 'architect');

			// Make rapid calls to ensure timestamps might be close together
			await hook({ sessionID: sessionId, agent: 'coder' }, {});
			await hook({ sessionID: sessionId, agent: 'reviewer' }, {});
			await hook({ sessionID: sessionId, agent: 'sme' }, {});

			const chain = swarmState.delegationChains.get(sessionId);
			expect(chain).toHaveLength(3);

			// Verify timestamps are monotonically increasing
			expect(chain![0].timestamp).toBeLessThanOrEqual(chain![1].timestamp);
			expect(chain![1].timestamp).toBeLessThanOrEqual(chain![2].timestamp);
		});

		it('handles undefined agent field explicitly', async () => {
			const hook = createDelegationTrackerHook(enabledConfig);
			const sessionId = 'test-session';

			// Set a previous agent
			swarmState.activeAgent.set(sessionId, 'architect');

			// Call hook with explicitly undefined agent
			await hook({ sessionID: sessionId, agent: undefined }, {});

			// Should remain unchanged since undefined is falsy
			expect(swarmState.activeAgent.get(sessionId)).toBe('architect');
			expect(swarmState.delegationChains.has(sessionId)).toBe(false);
			expect(swarmState.pendingEvents).toBe(0);
		});
	});

	// Regression tests for v5.1.6 hotfix: architect identity-stuck
	describe('architect identity-stuck hotfix', () => {
		describe('lastAgentEventTime updates', () => {
			it('updates lastAgentEventTime when chat.message sets subagent', async () => {
				const hook = createDelegationTrackerHook(defaultConfig);
				const sessionId = 'test-session';
				const beforeTime = Date.now() - 1000; // 1 second ago

				// Set initial agent event time
				await hook({ sessionID: sessionId, agent: 'architect' }, {});
				const session = swarmState.agentSessions.get(sessionId);
				expect(session).toBeDefined();
				expect(session!.lastAgentEventTime).toBeGreaterThanOrEqual(beforeTime);
			});

			it('updates lastAgentEventTime when chat.message clears agent (handoff to architect)', async () => {
				const hook = createDelegationTrackerHook(defaultConfig);
				const sessionId = 'test-session';

				// First set a subagent
				await hook({ sessionID: sessionId, agent: 'coder' }, {});
				const beforeTime = Date.now();

				// Then clear agent to trigger handoff to architect
				await hook({ sessionID: sessionId, agent: '' }, {});

				const session = swarmState.agentSessions.get(sessionId);
				expect(session).toBeDefined();
				// lastAgentEventTime should be updated after handoff
				expect(session!.lastAgentEventTime).toBeGreaterThanOrEqual(beforeTime);
			});
		});

		describe('delegationActive semantics', () => {
			it('sets delegationActive=false for architect agent', async () => {
				const hook = createDelegationTrackerHook(defaultConfig);
				const sessionId = 'test-session';

				await hook({ sessionID: sessionId, agent: 'architect' }, {});

				const session = swarmState.agentSessions.get(sessionId);
				expect(session!.delegationActive).toBe(false);
			});

			it('sets delegationActive=false for architect-prefixed names (mega_architect)', async () => {
				const hook = createDelegationTrackerHook(defaultConfig);
				const sessionId = 'test-session';

				await hook({ sessionID: sessionId, agent: 'mega_architect' }, {});

				const session = swarmState.agentSessions.get(sessionId);
				expect(session!.delegationActive).toBe(false);
			});

			it('sets delegationActive=true for subagent (coder)', async () => {
				const hook = createDelegationTrackerHook(defaultConfig);
				const sessionId = 'test-session';

				await hook({ sessionID: sessionId, agent: 'coder' }, {});

				const session = swarmState.agentSessions.get(sessionId);
				expect(session!.delegationActive).toBe(true);
			});

			it('sets delegationActive=true for all subagent types', async () => {
				const hook = createDelegationTrackerHook(defaultConfig);
				const subagents = ['sme', 'reviewer', 'critic', 'explorer', 'test_engineer'];

				for (const agent of subagents) {
					const sessionId = `session-${agent}`;
					await hook({ sessionID: sessionId, agent }, {});

					const session = swarmState.agentSessions.get(sessionId);
					expect(session!.delegationActive).toBe(true);
				}
			});

			it('sets delegationActive=false when agent field is empty (architect handoff)', async () => {
				const hook = createDelegationTrackerHook(defaultConfig);
				const sessionId = 'test-session';

				// First set a subagent
				await hook({ sessionID: sessionId, agent: 'coder' }, {});
				expect(swarmState.agentSessions.get(sessionId)!.delegationActive).toBe(true);

				// Then clear agent to trigger handoff
				await hook({ sessionID: sessionId, agent: '' }, {});

				const session = swarmState.agentSessions.get(sessionId);
				expect(session!.delegationActive).toBe(false);
			});
		});

		describe('architect-prefixed names treated as architect', () => {
			it('treats mega_architect as architect', async () => {
				const hook = createDelegationTrackerHook(defaultConfig);
				const sessionId = 'test-session';

				await hook({ sessionID: sessionId, agent: 'mega_architect' }, {});

				const session = swarmState.agentSessions.get(sessionId);
				expect(session!.delegationActive).toBe(false);
				expect(swarmState.activeAgent.get(sessionId)).toBe('mega_architect');
			});

			it('treats senior_architect as architect', async () => {
				const hook = createDelegationTrackerHook(defaultConfig);
				const sessionId = 'test-session';

				await hook({ sessionID: sessionId, agent: 'senior_architect' }, {});

				const session = swarmState.agentSessions.get(sessionId);
				expect(session!.delegationActive).toBe(false);
			});
		});
	});

	// Fix 4: guardrails disabled optimization tests
	describe('guardrails disabled optimization', () => {
		it('does not call beginInvocation when guardrails disabled', async () => {
			const hook = createDelegationTrackerHook(defaultConfig, false);
			const sessionId = 'test-session';

			await hook({ sessionID: sessionId, agent: 'coder' }, {});

			// Active agent should still be set
			expect(swarmState.activeAgent.get(sessionId)).toBe('coder');
			// Session should exist
			expect(swarmState.agentSessions.get(sessionId)).toBeDefined();
			// But no invocation window should be created
			expect(getActiveWindow(sessionId)).toBeUndefined();
		});

		it('calls beginInvocation when guardrails enabled (default)', async () => {
			const hook = createDelegationTrackerHook(defaultConfig);
			const sessionId = 'test-session';

			await hook({ sessionID: sessionId, agent: 'coder' }, {});

			// Active agent should be set
			expect(swarmState.activeAgent.get(sessionId)).toBe('coder');
			// Invocation window should be created
			expect(getActiveWindow(sessionId)).toBeDefined();
		});

		it('calls beginInvocation when guardrails explicitly enabled', async () => {
			const hook = createDelegationTrackerHook(defaultConfig, true);
			const sessionId = 'test-session';

			await hook({ sessionID: sessionId, agent: 'coder' }, {});

			expect(getActiveWindow(sessionId)).toBeDefined();
		});

		it('architect is never tracked regardless of guardrails flag', async () => {
			const hook = createDelegationTrackerHook(defaultConfig, true);
			const sessionId = 'test-session';

			await hook({ sessionID: sessionId, agent: 'architect' }, {});

			// Architect should never have an invocation window
			expect(getActiveWindow(sessionId)).toBeUndefined();
		});
	});
});
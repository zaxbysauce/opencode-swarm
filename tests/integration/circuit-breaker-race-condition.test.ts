/**
 * Integration test for circuit breaker race condition fix
 *
 * Tests the scenario where:
 * 1. Subagent finishes execution and returns
 * 2. Architect immediately makes a tool call before chat.message hook fires
 * 3. Architect should be exempt from circuit breaker, not inherit subagent limits
 *
 * This test verifies the 10-second stale delegation window prevents
 * the architect from being misidentified as a subagent.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ORCHESTRATOR_NAME } from '../../src/config/constants';
import type { GuardrailsConfig } from '../../src/config/schema';
import { createGuardrailsHooks } from '../../src/hooks/guardrails';
import {
	beginInvocation,
	ensureAgentSession,
	getActiveWindow,
	resetSwarmState,
	swarmState,
} from '../../src/state';

describe('Circuit Breaker Race Condition', () => {
	const sessionId = 'test-session-123';

	beforeEach(() => {
		resetSwarmState();
	});

	afterEach(() => {
		resetSwarmState();
	});

	it('should exempt architect from circuit breaker after subagent finishes (delegationActive=false)', async () => {
		// Setup: Architect has strict 5-minute limit in config to verify exemption works
		const config: GuardrailsConfig = {
			enabled: true,
			max_tool_calls: 100,
			max_duration_minutes: 5,
			max_repetitions: 10,
			max_consecutive_errors: 5,
			warning_threshold: 0.75,
			idle_timeout_minutes: 60,
			profiles: {
				architect: {
					max_duration_minutes: 0, // Exempt
					max_tool_calls: 0, // Exempt
				},
			},
		};

		const hooks = createGuardrailsHooks(config);

		// Scenario: Subagent (mega_coder) runs for 6 minutes, then finishes
		// 1. Subagent starts
		swarmState.activeAgent.set(sessionId, 'mega_coder');
		const session = ensureAgentSession(sessionId, 'mega_coder');
		session.delegationActive = true;

		// Create invocation window for subagent
		beginInvocation(sessionId, 'mega_coder');
		const window = getActiveWindow(sessionId)!;

		// 2. Simulate 6 minutes of subagent work (exceeds generic 5 min limit)
		window.startedAtMs = Date.now() - 6 * 60000;
		session.lastToolCallTime = Date.now() - 6 * 60000;

		// 3. Subagent finishes - chat.message sets delegationActive=false
		session.delegationActive = false;

		// 4. RACE CONDITION: Architect makes tool call BEFORE chat.message updates activeAgent
		// activeAgent map still has 'mega_coder', but delegationActive=false should trigger exemption

		// Simulate the stale delegation detection from index.ts (lines 161-174)
		// This happens BEFORE the guardrails hook in the actual plugin flow
		const activeAgent = swarmState.activeAgent.get(sessionId);
		if (session && activeAgent && activeAgent !== ORCHESTRATOR_NAME) {
			const staleDelegation =
				!session.delegationActive ||
				Date.now() - session.lastToolCallTime > 10000;
			if (staleDelegation) {
				swarmState.activeAgent.set(sessionId, ORCHESTRATOR_NAME);
				ensureAgentSession(sessionId, ORCHESTRATOR_NAME);
			}
		}

		// Now the guardrail hook should exempt architect
		await expect(
			hooks.toolBefore(
				{ tool: 'read', sessionID: sessionId, callID: 'call-1' },
				{ args: { filePath: '/test' } },
			),
		).resolves.toBeUndefined();

		// Verify session was updated to architect
		const updatedSession = swarmState.agentSessions.get(sessionId);
		expect(updatedSession?.agentName).toBe(ORCHESTRATOR_NAME);
	});

	it('should exempt architect from circuit breaker after stale delegation window (>10s)', async () => {
		const config: GuardrailsConfig = {
			enabled: true,
			max_tool_calls: 100,
			max_duration_minutes: 5,
			max_repetitions: 10,
			max_consecutive_errors: 5,
			warning_threshold: 0.75,
			idle_timeout_minutes: 60,
			profiles: {
				architect: {
					max_duration_minutes: 0,
					max_tool_calls: 0,
				},
			},
		};

		const hooks = createGuardrailsHooks(config);

		// Scenario: Subagent runs for 6 minutes, then becomes idle for >10 seconds
		swarmState.activeAgent.set(sessionId, 'mega_coder');
		const session = ensureAgentSession(sessionId, 'mega_coder');
		session.delegationActive = true;

		// Create invocation window for subagent
		beginInvocation(sessionId, 'mega_coder');
		const window = getActiveWindow(sessionId)!;

		// Simulate 6 minutes of work, then 11 seconds of idle time
		window.startedAtMs = Date.now() - 6 * 60000 - 11000;
		session.lastToolCallTime = Date.now() - 11000; // 11 seconds ago

		// Simulate the stale delegation detection from index.ts (lines 161-174)
		const activeAgent = swarmState.activeAgent.get(sessionId);
		if (session && activeAgent && activeAgent !== ORCHESTRATOR_NAME) {
			const staleDelegation =
				!session.delegationActive ||
				Date.now() - session.lastToolCallTime > 10000;
			if (staleDelegation) {
				swarmState.activeAgent.set(sessionId, ORCHESTRATOR_NAME);
				ensureAgentSession(sessionId, ORCHESTRATOR_NAME);
			}
		}

		// Now the architect tool call should be exempt
		await expect(
			hooks.toolBefore(
				{ tool: 'read', sessionID: sessionId, callID: 'call-1' },
				{ args: { filePath: '/test' } },
			),
		).resolves.toBeUndefined();

		// Verify session was reset with architect name
		const updatedSession = swarmState.agentSessions.get(sessionId);
		expect(updatedSession?.agentName).toBe(ORCHESTRATOR_NAME);
		// Architect has no active window (exempt from guardrails)
		const archWindow = getActiveWindow(sessionId);
		expect(archWindow).toBeUndefined();
	});

	it('should NOT exempt subagent within 10-second window (legitimate subagent work)', async () => {
		const config: GuardrailsConfig = {
			enabled: true,
			max_tool_calls: 100,
			max_duration_minutes: 5,
			max_repetitions: 10,
			max_consecutive_errors: 5,
			warning_threshold: 0.75,
			idle_timeout_minutes: 60,
			profiles: {
				coder: {
					max_duration_minutes: 6, // Just over 6 min limit for this test
					max_tool_calls: 400,
				},
			},
		};

		const hooks = createGuardrailsHooks(config);

		// Scenario: Subagent is actively working, makes tool call within 10s window
		swarmState.activeAgent.set(sessionId, 'mega_coder');
		const session = ensureAgentSession(sessionId, 'mega_coder');
		session.delegationActive = true;

		// Create invocation window for subagent
		beginInvocation(sessionId, 'mega_coder');
		const window = getActiveWindow(sessionId)!;

		// Simulate 7 minutes of work (exceeds 6 min limit), but last tool call was recent
		window.startedAtMs = Date.now() - 7 * 60000;
		session.lastToolCallTime = Date.now() - 5000; // 5 seconds ago (within 10s window)

		// Subagent should hit circuit breaker because:
		// 1. delegationActive is true (still working)
		// 2. lastToolCallTime is recent (< 10s)
		// 3. Duration exceeds limit (7 min > 6 min)

		// First, simulate the stale check (should NOT trigger)
		const staleDelegation =
			!session.delegationActive ||
			Date.now() - session.lastToolCallTime > 10000;
		expect(staleDelegation).toBe(false);

		// Guardrail should throw because subagent exceeded duration limit
		await expect(
			hooks.toolBefore(
				{ tool: 'read', sessionID: sessionId, callID: 'call-1' },
				{ args: { filePath: '/test' } },
			),
		).rejects.toThrow(/LIMIT REACHED.*Duration exhausted/);

		// Verify hardLimitHit flag is set
		expect(window.hardLimitHit).toBe(true);
	});

	it('should handle rapid architect→subagent→architect transitions', async () => {
		const config: GuardrailsConfig = {
			enabled: true,
			max_tool_calls: 100,
			max_duration_minutes: 30,
			max_repetitions: 10,
			max_consecutive_errors: 5,
			warning_threshold: 0.75,
			idle_timeout_minutes: 60,
			profiles: {
				architect: {
					max_duration_minutes: 0,
					max_tool_calls: 0,
				},
			},
		};

		const hooks = createGuardrailsHooks(config);

		// 1. Architect starts
		swarmState.activeAgent.set(sessionId, ORCHESTRATOR_NAME);
		ensureAgentSession(sessionId, ORCHESTRATOR_NAME);

		await expect(
			hooks.toolBefore(
				{ tool: 'read', sessionID: sessionId, callID: 'call-1' },
				{ args: { filePath: '/test' } },
			),
		).resolves.toBeUndefined();

		// 2. Delegate to subagent
		swarmState.activeAgent.set(sessionId, 'mega_explorer');
		const session = ensureAgentSession(sessionId, 'mega_explorer');
		session.delegationActive = true;

		await expect(
			hooks.toolBefore(
				{ tool: 'glob', sessionID: sessionId, callID: 'call-2' },
				{ args: { pattern: '*.ts' } },
			),
		).resolves.toBeUndefined();

		// 3. Subagent finishes, architect takes over
		session.delegationActive = false;

		// Simulate stale delegation detection from index.ts
		const activeAgent = swarmState.activeAgent.get(sessionId);
		if (session && activeAgent && activeAgent !== ORCHESTRATOR_NAME) {
			const staleDelegation =
				!session.delegationActive ||
				Date.now() - session.lastToolCallTime > 10000;
			if (staleDelegation) {
				swarmState.activeAgent.set(sessionId, ORCHESTRATOR_NAME);
				ensureAgentSession(sessionId, ORCHESTRATOR_NAME);
			}
		}

		// 4. Architect tool call (should be exempt)
		await expect(
			hooks.toolBefore(
				{ tool: 'read', sessionID: sessionId, callID: 'call-3' },
				{ args: { filePath: '/test2' } },
			),
		).resolves.toBeUndefined();

		// Verify transition worked
		const updatedSession = swarmState.agentSessions.get(sessionId);
		expect(updatedSession?.agentName).toBe(ORCHESTRATOR_NAME);
	});

	it('should correctly resolve limits for prefixed agent names (mega_coder)', async () => {
		const config: GuardrailsConfig = {
			enabled: true,
			max_tool_calls: 100,
			max_duration_minutes: 30,
			max_repetitions: 10,
			max_consecutive_errors: 5,
			warning_threshold: 0.75,
			idle_timeout_minutes: 60,
			profiles: {
				coder: {
					max_duration_minutes: 45,
					max_tool_calls: 400,
				},
			},
		};

		const hooks = createGuardrailsHooks(config);

		// Subagent with swarm prefix should get coder profile (45 min, 400 calls)
		swarmState.activeAgent.set(sessionId, 'mega_coder');
		const session = ensureAgentSession(sessionId, 'mega_coder');
		session.delegationActive = true;

		// Create invocation window for subagent
		beginInvocation(sessionId, 'mega_coder');
		const window = getActiveWindow(sessionId)!;

		// Simulate work just under coder's 45 min limit
		window.startedAtMs = Date.now() - 44 * 60000;
		session.lastToolCallTime = Date.now() - 1000;

		// Should NOT throw (within limits)
		await expect(
			hooks.toolBefore(
				{ tool: 'edit', sessionID: sessionId, callID: 'call-1' },
				{ args: { filePath: '/test', oldString: 'a', newString: 'b' } },
			),
		).resolves.toBeUndefined();

		// Now simulate exceeding the limit
		window.startedAtMs = Date.now() - 46 * 60000;

		// Should throw (exceeded 45 min limit)
		await expect(
			hooks.toolBefore(
				{ tool: 'edit', sessionID: sessionId, callID: 'call-2' },
				{ args: { filePath: '/test', oldString: 'a', newString: 'b' } },
			),
		).rejects.toThrow(/LIMIT REACHED.*Duration exhausted.*45/);
	});

	it('should handle unknown agent names by using base config (not architect exempt)', async () => {
		const config: GuardrailsConfig = {
			enabled: true,
			max_tool_calls: 100,
			max_duration_minutes: 30,
			max_repetitions: 10,
			max_consecutive_errors: 5,
			warning_threshold: 0.75,
			idle_timeout_minutes: 60,
			profiles: {
				architect: {
					max_duration_minutes: 0,
					max_tool_calls: 0,
				},
			},
		};

		const hooks = createGuardrailsHooks(config);

		// Unknown agent name (doesn't match any built-in profile)
		swarmState.activeAgent.set(sessionId, 'custom_mystery_agent');
		const session = ensureAgentSession(sessionId, 'custom_mystery_agent');

		// Create invocation window for agent
		beginInvocation(sessionId, 'custom_mystery_agent');
		const window = getActiveWindow(sessionId)!;

		// Simulate 50 minutes of work (would exceed base config limit of 30 minutes)
		window.startedAtMs = Date.now() - 50 * 60000;
		session.lastToolCallTime = Date.now() - 1000;

		// Should throw because unknown agents get base config (not architect exempt)
		// This is the fix: unknown agents should NOT bypass guardrails via architect fallback
		await expect(
			hooks.toolBefore(
				{ tool: 'read', sessionID: sessionId, callID: 'call-1' },
				{ args: { filePath: '/test' } },
			),
		).rejects.toThrow(/LIMIT REACHED.*Duration exhausted.*30/);
	});
});

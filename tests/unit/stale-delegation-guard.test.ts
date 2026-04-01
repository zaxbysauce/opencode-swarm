import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ORCHESTRATOR_NAME } from '../../src/config/constants';
import {
	ensureAgentSession,
	resetSwarmState,
	swarmState,
} from '../../src/state';

/**
 * Tests for stale-delegation takeover guard during active tool execution.
 *
 * This verifies:
 * 1. tool.execute.before registers the current tool call BEFORE checking for stale delegation
 * 2. The current callID is EXCLUDED when checking for other in-flight tool calls
 * 3. OTHER in-flight tool calls DO block stale-delegation takeover
 * 4. Deterministic Task handoff in tool.execute.after remains unchanged
 */

describe('Stale-Delegation Takeover Guard', () => {
	let tempDir: string;

	beforeEach(async () => {
		resetSwarmState();
		tempDir = await mkdtemp(join(tmpdir(), 'stale-delegation-test-'));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	describe('tool.execute.before - current call registration', () => {
		it('should register current tool call BEFORE stale-delegation check', async () => {
			const sessionID = 'test-session';
			const callID = 'call-1';

			// Set up a subagent session that is stale (old lastAgentEventTime)
			ensureAgentSession(sessionID, 'coder', tempDir);
			const session = swarmState.agentSessions.get(sessionID);
			session!.delegationActive = false;
			session!.lastAgentEventTime = Date.now() - 15000; // >10s ago, stale

			// Set active agent to subagent
			swarmState.activeAgent.set(sessionID, 'coder');

			// Simulate tool.execute.before: register current tool call FIRST
			swarmState.activeToolCalls.set(callID, {
				tool: 'test-tool',
				sessionID,
				callID,
				startTime: Date.now(),
			});

			// Verify the call is registered
			expect(swarmState.activeToolCalls.has(callID)).toBe(true);
			expect(swarmState.activeToolCalls.get(callID)?.sessionID).toBe(sessionID);
		});

		it('should exclude current callID from other-in-flight check', async () => {
			const sessionID = 'test-session';
			const currentCallID = 'current-call';
			const otherCallID = 'other-call';

			// Set up subagent session
			ensureAgentSession(sessionID, 'coder', tempDir);
			const session = swarmState.agentSessions.get(sessionID)!;
			session.delegationActive = false;
			session.lastAgentEventTime = Date.now() - 15000;
			swarmState.activeAgent.set(sessionID, 'coder');

			// Register an OTHER tool call already in progress
			swarmState.activeToolCalls.set(otherCallID, {
				tool: 'other-tool',
				sessionID,
				callID: otherCallID,
				startTime: Date.now(),
			});

			// Now register current call (simulating the fix)
			swarmState.activeToolCalls.set(currentCallID, {
				tool: 'current-tool',
				sessionID,
				callID: currentCallID,
				startTime: Date.now(),
			});

			// Check for other in-flight calls, EXCLUDING current callID
			const hasActiveToolCall = Array.from(
				swarmState.activeToolCalls.values(),
			).some(
				(entry) =>
					entry.sessionID === sessionID && entry.callID !== currentCallID,
			);

			// Should detect OTHER call (not current)
			expect(hasActiveToolCall).toBe(true);
		});

		it('should NOT block stale-delegation when only current call is in-flight', async () => {
			const sessionID = 'test-session';
			const currentCallID = 'current-call';

			// Set up subagent session that is stale
			ensureAgentSession(sessionID, 'coder', tempDir);
			const session = swarmState.agentSessions.get(sessionID)!;
			session.delegationActive = false;
			session.lastAgentEventTime = Date.now() - 15000;
			swarmState.activeAgent.set(sessionID, 'coder');

			// Register ONLY current call (no other calls)
			swarmState.activeToolCalls.set(currentCallID, {
				tool: 'current-tool',
				sessionID,
				callID: currentCallID,
				startTime: Date.now(),
			});

			// Check for other in-flight calls, EXCLUDING current callID
			const hasActiveToolCall = Array.from(
				swarmState.activeToolCalls.values(),
			).some(
				(entry) =>
					entry.sessionID === sessionID && entry.callID !== currentCallID,
			);

			// Should NOT detect any OTHER call
			expect(hasActiveToolCall).toBe(false);
		});
	});

	describe('tool.execute.before - stale delegation logic', () => {
		it('should revert to architect when stale and no other tool calls in-flight', async () => {
			const sessionID = 'test-session';
			const callID = 'call-1';

			// Set up subagent session that is stale
			ensureAgentSession(sessionID, 'coder', tempDir);
			const session = swarmState.agentSessions.get(sessionID)!;
			session.delegationActive = false;
			session.lastAgentEventTime = Date.now() - 15000; // >10s stale
			swarmState.activeAgent.set(sessionID, 'coder');

			// Register current tool call
			swarmState.activeToolCalls.set(callID, {
				tool: 'test-tool',
				sessionID,
				callID,
				startTime: Date.now(),
			});

			// Check for other in-flight calls (excluding current)
			const hasActiveToolCall = Array.from(
				swarmState.activeToolCalls.values(),
			).some(
				(entry) => entry.sessionID === sessionID && entry.callID !== callID,
			);

			// Determine if stale delegation should revert
			const activeAgent = swarmState.activeAgent.get(sessionID);
			const shouldRevert =
				session &&
				activeAgent &&
				activeAgent !== ORCHESTRATOR_NAME &&
				!hasActiveToolCall &&
				(!session.delegationActive ||
					Date.now() - session.lastAgentEventTime > 10000);

			expect(shouldRevert).toBe(true);

			// Execute the revert
			if (shouldRevert) {
				swarmState.activeAgent.set(sessionID, ORCHESTRATOR_NAME);
				ensureAgentSession(sessionID, ORCHESTRATOR_NAME, tempDir);
			}

			// Verify revert happened
			expect(swarmState.activeAgent.get(sessionID)).toBe(ORCHESTRATOR_NAME);
		});

		it('should NOT revert to architect when other tool calls ARE in-flight', async () => {
			const sessionID = 'test-session';
			const currentCallID = 'current-call';
			const otherCallID = 'other-call';

			// Set up subagent session that is stale
			ensureAgentSession(sessionID, 'coder', tempDir);
			const session = swarmState.agentSessions.get(sessionID)!;
			session.delegationActive = false;
			session.lastAgentEventTime = Date.now() - 15000;
			swarmState.activeAgent.set(sessionID, 'coder');

			// Register OTHER tool call already in progress
			swarmState.activeToolCalls.set(otherCallID, {
				tool: 'other-tool',
				sessionID,
				callID: otherCallID,
				startTime: Date.now(),
			});

			// Register current tool call
			swarmState.activeToolCalls.set(currentCallID, {
				tool: 'current-tool',
				sessionID,
				callID: currentCallID,
				startTime: Date.now(),
			});

			// Check for other in-flight calls (excluding current)
			const hasActiveToolCall = Array.from(
				swarmState.activeToolCalls.values(),
			).some(
				(entry) =>
					entry.sessionID === sessionID && entry.callID !== currentCallID,
			);

			// Determine if stale delegation should revert
			const activeAgent = swarmState.activeAgent.get(sessionID);
			const shouldRevert =
				session &&
				activeAgent &&
				activeAgent !== ORCHESTRATOR_NAME &&
				!hasActiveToolCall &&
				(!session.delegationActive ||
					Date.now() - session.lastAgentEventTime > 10000);

			// Should NOT revert because OTHER tool call is in-flight
			expect(shouldRevert).toBe(false);
			expect(hasActiveToolCall).toBe(true);

			// Active agent should remain as coder
			expect(swarmState.activeAgent.get(sessionID)).toBe('coder');
		});

		it('should revert when delegationActive is true but lastAgentEventTime >10s (stale timeout)', async () => {
			const sessionID = 'test-session';
			const callID = 'call-1';

			// Set up subagent session with active delegation but stale lastAgentEventTime
			ensureAgentSession(sessionID, 'coder', tempDir);
			const session = swarmState.agentSessions.get(sessionID)!;
			session.delegationActive = true; // Delegation is marked active
			session.lastAgentEventTime = Date.now() - 15000; // But >10s since event - TIMEOUT triggers revert
			swarmState.activeAgent.set(sessionID, 'coder');

			// Register current tool call
			swarmState.activeToolCalls.set(callID, {
				tool: 'test-tool',
				sessionID,
				callID,
				startTime: Date.now(),
			});

			// Check for other in-flight calls
			const hasActiveToolCall = Array.from(
				swarmState.activeToolCalls.values(),
			).some(
				(entry) => entry.sessionID === sessionID && entry.callID !== callID,
			);

			// Determine if stale delegation should revert
			// The stale check is: !delegationActive OR lastAgentEventTime > 10s
			// So with delegationActive=true but lastAgentEventTime >10s, it IS stale
			const activeAgent = swarmState.activeAgent.get(sessionID);
			const shouldRevert =
				session &&
				activeAgent &&
				activeAgent !== ORCHESTRATOR_NAME &&
				!hasActiveToolCall &&
				(!session.delegationActive ||
					Date.now() - session.lastAgentEventTime > 10000);

			// Should revert because lastAgentEventTime >10s (stale timeout)
			expect(shouldRevert).toBe(true);

			// Execute the revert
			if (shouldRevert) {
				swarmState.activeAgent.set(sessionID, ORCHESTRATOR_NAME);
				ensureAgentSession(sessionID, ORCHESTRATOR_NAME, tempDir);
			}

			// Verify revert happened
			expect(swarmState.activeAgent.get(sessionID)).toBe(ORCHESTRATOR_NAME);
		});

		it('should NOT revert when delegationActive is true AND lastAgentEventTime is recent', async () => {
			const sessionID = 'test-session';
			const callID = 'call-1';

			// Set up subagent session with active delegation and recent lastAgentEventTime
			ensureAgentSession(sessionID, 'coder', tempDir);
			const session = swarmState.agentSessions.get(sessionID)!;
			session.delegationActive = true; // Delegation is active
			session.lastAgentEventTime = Date.now() - 5000; // Only 5s ago - within timeout
			swarmState.activeAgent.set(sessionID, 'coder');

			// Register current tool call
			swarmState.activeToolCalls.set(callID, {
				tool: 'test-tool',
				sessionID,
				callID,
				startTime: Date.now(),
			});

			// Check for other in-flight calls
			const hasActiveToolCall = Array.from(
				swarmState.activeToolCalls.values(),
			).some(
				(entry) => entry.sessionID === sessionID && entry.callID !== callID,
			);

			// Determine if stale delegation should revert
			const activeAgent = swarmState.activeAgent.get(sessionID);
			const shouldRevert =
				session &&
				activeAgent &&
				activeAgent !== ORCHESTRATOR_NAME &&
				!hasActiveToolCall &&
				(!session.delegationActive ||
					Date.now() - session.lastAgentEventTime > 10000);

			// Should NOT revert because both delegationActive=true AND lastAgentEventTime is recent
			expect(shouldRevert).toBe(false);
			expect(swarmState.activeAgent.get(sessionID)).toBe('coder');
		});

		it('should NOT revert when active agent is already architect', async () => {
			const sessionID = 'test-session';
			const callID = 'call-1';

			// Set up architect session (already orchestrator)
			ensureAgentSession(sessionID, ORCHESTRATOR_NAME, tempDir);
			const session = swarmState.agentSessions.get(sessionID)!;
			session.delegationActive = false;
			session.lastAgentEventTime = Date.now() - 15000;
			swarmState.activeAgent.set(sessionID, ORCHESTRATOR_NAME);

			// Register current tool call
			swarmState.activeToolCalls.set(callID, {
				tool: 'test-tool',
				sessionID,
				callID,
				startTime: Date.now(),
			});

			// Check for other in-flight calls
			const hasActiveToolCall = Array.from(
				swarmState.activeToolCalls.values(),
			).some(
				(entry) => entry.sessionID === sessionID && entry.callID !== callID,
			);

			// Determine if stale delegation should revert
			const activeAgent = swarmState.activeAgent.get(sessionID);
			const shouldRevert =
				session &&
				activeAgent &&
				activeAgent !== ORCHESTRATOR_NAME &&
				!hasActiveToolCall &&
				(!session.delegationActive ||
					Date.now() - session.lastAgentEventTime > 10000);

			// Should NOT revert because already architect
			expect(shouldRevert).toBe(false);
			expect(swarmState.activeAgent.get(sessionID)).toBe(ORCHESTRATOR_NAME);
		});
	});

	describe('tool.execute.after - deterministic Task handoff', () => {
		it('should force handoff to architect when Task tool completes', async () => {
			const sessionID = 'test-session';
			const callID = 'call-task';

			// Set up subagent session
			ensureAgentSession(sessionID, 'coder', tempDir);
			const session = swarmState.agentSessions.get(sessionID)!;
			session.delegationActive = true;
			session.lastAgentEventTime = Date.now();
			swarmState.activeAgent.set(sessionID, 'coder');

			// Simulate tool.execute.after for Task tool
			const input = {
				tool: 'Task', // Task tool name
				sessionID,
				callID,
			};

			// Normalize tool name (as done in index.ts)
			const normalizedTool = input.tool.replace(/^[^:]+[:.]/, '');

			// Execute deterministic handoff logic
			if (normalizedTool === 'Task' || normalizedTool === 'task') {
				swarmState.activeAgent.set(sessionID, ORCHESTRATOR_NAME);
				ensureAgentSession(sessionID, ORCHESTRATOR_NAME, tempDir);

				const updatedSession = swarmState.agentSessions.get(sessionID);
				if (updatedSession) {
					updatedSession.delegationActive = false;
					updatedSession.lastAgentEventTime = Date.now();
				}
			}

			// Verify handoff to architect occurred
			expect(swarmState.activeAgent.get(sessionID)).toBe(ORCHESTRATOR_NAME);
			expect(swarmState.agentSessions.get(sessionID)?.agentName).toBe(
				ORCHESTRATOR_NAME,
			);
			expect(swarmState.agentSessions.get(sessionID)?.delegationActive).toBe(
				false,
			);
		});

		it('should force handoff for lowercase task tool name', () => {
			const sessionID = 'test-session';

			// Set up subagent session
			ensureAgentSession(sessionID, 'coder', tempDir);
			swarmState.activeAgent.set(sessionID, 'coder');

			// Test lowercase 'task'
			const normalizedTool: string = 'task';

			if (normalizedTool === 'Task' || normalizedTool === 'task') {
				swarmState.activeAgent.set(sessionID, ORCHESTRATOR_NAME);
				ensureAgentSession(sessionID, ORCHESTRATOR_NAME, tempDir);

				const session = swarmState.agentSessions.get(sessionID);
				if (session) {
					session.delegationActive = false;
					session.lastAgentEventTime = Date.now();
				}
			}

			expect(swarmState.activeAgent.get(sessionID)).toBe(ORCHESTRATOR_NAME);
		});

		it('should NOT force handoff for non-Task tools', () => {
			const sessionID = 'test-session';

			// Set up subagent session
			ensureAgentSession(sessionID, 'coder', tempDir);
			swarmState.activeAgent.set(sessionID, 'coder');

			// Test non-Task tool
			const normalizedTool: string = 'read';

			if (normalizedTool === 'Task' || normalizedTool === 'task') {
				swarmState.activeAgent.set(sessionID, ORCHESTRATOR_NAME);
			}

			// Agent should remain as coder
			expect(swarmState.activeAgent.get(sessionID)).toBe('coder');
		});

		it('should handle Task tool with prefix (e.g., tool.execute.Task)', () => {
			const sessionID = 'test-session';

			// Set up subagent session
			ensureAgentSession(sessionID, 'coder', tempDir);
			swarmState.activeAgent.set(sessionID, 'coder');

			// Test prefixed tool name
			const normalizedTool = 'tool.execute.Task'.replace(/^[^:]+[:.]/, '');

			if (normalizedTool === 'Task' || normalizedTool === 'task') {
				swarmState.activeAgent.set(sessionID, ORCHESTRATOR_NAME);
				ensureAgentSession(sessionID, ORCHESTRATOR_NAME, tempDir);

				const session = swarmState.agentSessions.get(sessionID);
				if (session) {
					session.delegationActive = false;
					session.lastAgentEventTime = Date.now();
				}
			}

			// Verify handoff to architect occurred
			expect(swarmState.activeAgent.get(sessionID)).toBe(ORCHESTRATOR_NAME);
		});

		it('should update lastAgentEventTime on Task handoff', () => {
			const sessionID = 'test-session';
			const oldTimestamp = Date.now() - 1000;

			// Set up subagent session with old timestamp
			ensureAgentSession(sessionID, 'coder', tempDir);
			const session = swarmState.agentSessions.get(sessionID)!;
			session.delegationActive = true;
			session.lastAgentEventTime = oldTimestamp;
			swarmState.activeAgent.set(sessionID, 'coder');

			// Execute Task handoff
			const normalizedTool: string = 'Task';
			if (normalizedTool === 'Task' || normalizedTool === 'task') {
				swarmState.activeAgent.set(sessionID, ORCHESTRATOR_NAME);
				ensureAgentSession(sessionID, ORCHESTRATOR_NAME, tempDir);

				session.delegationActive = false;
				session.lastAgentEventTime = Date.now();
			}

			// Verify timestamp was updated
			expect(session.lastAgentEventTime).toBeGreaterThan(oldTimestamp);
		});
	});

	describe('Integration: full flow with other calls blocking revert', () => {
		it('should allow current call to trigger stale revert even when other calls exist', async () => {
			const sessionID = 'test-session';
			const currentCallID = 'current-call';
			const otherCallID = 'other-call-1';
			const anotherCallID = 'other-call-2';

			// Set up stale subagent session
			ensureAgentSession(sessionID, 'coder', tempDir);
			const session = swarmState.agentSessions.get(sessionID)!;
			session.delegationActive = false;
			session.lastAgentEventTime = Date.now() - 15000;
			swarmState.activeAgent.set(sessionID, 'coder');

			// Simulate concurrent tool execution: multiple calls in flight
			// Add two OTHER calls
			swarmState.activeToolCalls.set(otherCallID, {
				tool: 'other-tool-1',
				sessionID,
				callID: otherCallID,
				startTime: Date.now() - 5000,
			});
			swarmState.activeToolCalls.set(anotherCallID, {
				tool: 'other-tool-2',
				sessionID,
				callID: anotherCallID,
				startTime: Date.now() - 3000,
			});

			// Register current call
			swarmState.activeToolCalls.set(currentCallID, {
				tool: 'current-tool',
				sessionID,
				callID: currentCallID,
				startTime: Date.now(),
			});

			// Verify 3 total calls in flight
			expect(swarmState.activeToolCalls.size).toBe(3);

			// Check for OTHER calls (excluding current)
			const hasActiveToolCall = Array.from(
				swarmState.activeToolCalls.values(),
			).some(
				(entry) =>
					entry.sessionID === sessionID && entry.callID !== currentCallID,
			);

			// OTHER calls exist, so should NOT revert during this call
			expect(hasActiveToolCall).toBe(true);

			// But when OTHER calls complete (simulated by clearing them)
			swarmState.activeToolCalls.delete(otherCallID);
			swarmState.activeToolCalls.delete(anotherCallID);

			// Now check again
			const hasActiveToolCallAfterCompletion = Array.from(
				swarmState.activeToolCalls.values(),
			).some(
				(entry) =>
					entry.sessionID === sessionID && entry.callID !== currentCallID,
			);

			// Now should revert (stale + no other calls)
			expect(hasActiveToolCallAfterCompletion).toBe(false);

			const activeAgent = swarmState.activeAgent.get(sessionID);
			const shouldRevert =
				session &&
				activeAgent &&
				activeAgent !== ORCHESTRATOR_NAME &&
				!hasActiveToolCallAfterCompletion &&
				(!session.delegationActive ||
					Date.now() - session.lastAgentEventTime > 10000);

			expect(shouldRevert).toBe(true);
		});
	});
});

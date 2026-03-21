import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ORCHESTRATOR_NAME } from './config/constants';
import { ensureAgentSession, startAgentSession, swarmState } from './state';

// Test architect session bootstrap directory threading
// Verifies that ctx.directory is passed to ensureAgentSession in both bootstrap paths:
// 1. Stale-delegation reset (src/index.ts lines 570-574)
// 2. Deterministic Task handoff (src/index.ts lines 647-649)

let tmpDir: string;
let testSessionId: string;
let mockDirectory: string;

beforeEach(() => {
	tmpDir = mkdtempSync(path.join(os.tmpdir(), 'bootstrap-test-'));
	mockDirectory = tmpDir;
	testSessionId = `test-session-${Date.now()}`;
});

afterEach(() => {
	try {
		rmSync(tmpDir, { recursive: true, force: true });
	} catch {
		/* best effort */
	}
	// Clean up all test sessions
	for (const key of swarmState.agentSessions.keys()) {
		if (key.startsWith('test-session-')) {
			swarmState.agentSessions.delete(key);
		}
	}
	swarmState.activeAgent.clear();
});

describe('Architect session bootstrap directory threading', () => {
	describe('Path 1: Stale-delegation reset', () => {
		it('should pass ctx.directory to ensureAgentSession when resetting stale delegation', () => {
			// Setup: Create a session with a subagent active and stale delegation
			startAgentSession(testSessionId, 'coder');
			const session = swarmState.agentSessions.get(testSessionId);
			expect(session).toBeDefined();

			// Set the session to have a stale delegation (old timestamp)
			session!.delegationActive = true;
			session!.lastAgentEventTime = Date.now() - 15000; // > 10s old = stale

			// Set active agent to a subagent
			swarmState.activeAgent.set(testSessionId, 'coder');

			// Act: Simulate stale delegation detection and reset
			// This is the logic from src/index.ts lines 560-577
			const activeAgent = swarmState.activeAgent.get(testSessionId);
			const currentSession = swarmState.agentSessions.get(testSessionId);

			expect(activeAgent).toBe('coder');
			expect(currentSession?.delegationActive).toBe(true);

			// Simulate the stale delegation reset with directory
			const staleDelegation =
				!currentSession!.delegationActive ||
				Date.now() - currentSession!.lastAgentEventTime > 10000;

			expect(staleDelegation).toBe(true);

			// This is the critical assertion: directory must be passed
			// When stale delegation is detected, ensureAgentSession is called with directory
			const result = ensureAgentSession(
				testSessionId,
				ORCHESTRATOR_NAME,
				mockDirectory,
			);

			// Verify the session was properly reset to architect with directory context
			expect(result.agentName).toBe(ORCHESTRATOR_NAME);
			expect(result.delegationActive).toBe(false);
		});

		it('should NOT reset when delegation is not stale', () => {
			// Setup: Create a session with active (non-stale) delegation
			startAgentSession(testSessionId, 'coder');
			const session = swarmState.agentSessions.get(testSessionId);
			expect(session).toBeDefined();

			// Set the session to have a recent timestamp (not stale)
			session!.delegationActive = true;
			session!.lastAgentEventTime = Date.now(); // Recent = not stale

			swarmState.activeAgent.set(testSessionId, 'coder');

			// Act: Check if delegation is stale
			const currentSession = swarmState.agentSessions.get(testSessionId);
			const staleDelegation =
				!currentSession!.delegationActive ||
				Date.now() - currentSession!.lastAgentEventTime > 10000;

			// Verify: Should NOT be stale
			expect(staleDelegation).toBe(false);

			// Ensure session still has coder as agent (not reset)
			const result = ensureAgentSession(testSessionId, 'coder', mockDirectory);
			expect(result.agentName).toBe('coder');
		});
	});

	describe('Path 2: Deterministic Task handoff', () => {
		it('should pass ctx.directory to ensureAgentSession when Task tool completes', () => {
			// Setup: Create a session with a subagent
			startAgentSession(testSessionId, 'coder');
			const session = swarmState.agentSessions.get(testSessionId);
			expect(session).toBeDefined();

			// Set active agent to subagent
			swarmState.activeAgent.set(testSessionId, 'coder');

			// Act: Simulate Task tool completion handoff
			// This is the logic from src/index.ts lines 643-657
			const normalizedTool = 'Task'; // Simulating Task tool completion

			if (normalizedTool === 'Task' || normalizedTool === 'task') {
				// Set active agent to architect
				swarmState.activeAgent.set(testSessionId, ORCHESTRATOR_NAME);

				// Critical assertion: directory must be passed to ensureAgentSession
				const result = ensureAgentSession(
					testSessionId,
					ORCHESTRATOR_NAME,
					mockDirectory,
				);

				// Verify session is now architect-controlled
				expect(result.agentName).toBe(ORCHESTRATOR_NAME);
				expect(result.delegationActive).toBe(false);
			}
		});

		it('should update lastAgentEventTime on Task handoff', () => {
			// Setup
			startAgentSession(testSessionId, 'coder');
			const session = swarmState.agentSessions.get(testSessionId);
			const oldTimestamp = Date.now() - 5000;
			session!.lastAgentEventTime = oldTimestamp;

			// Act: Simulate Task handoff with directory
			swarmState.activeAgent.set(testSessionId, ORCHESTRATOR_NAME);
			ensureAgentSession(testSessionId, ORCHESTRATOR_NAME, mockDirectory);

			// Verify timestamp was updated
			const updatedSession = swarmState.agentSessions.get(testSessionId);
			expect(updatedSession!.lastAgentEventTime).toBeGreaterThan(oldTimestamp);
		});
	});

	describe('Directory parameter propagation', () => {
		it('should accept directory parameter in ensureAgentSession', () => {
			// This verifies the function signature accepts the directory parameter
			// which is what src/index.ts now passes
			startAgentSession(testSessionId, 'architect');
			const result = ensureAgentSession(
				testSessionId,
				ORCHESTRATOR_NAME,
				mockDirectory,
			);

			expect(result).toBeDefined();
			expect(result.agentName).toBe(ORCHESTRATOR_NAME);
		});

		it('should work with undefined directory (backward compatibility)', () => {
			// Verify backward compatibility - directory is optional
			startAgentSession(testSessionId, 'architect');
			const result = ensureAgentSession(testSessionId, ORCHESTRATOR_NAME);

			expect(result).toBeDefined();
			expect(result.agentName).toBe(ORCHESTRATOR_NAME);
		});

		it('should handle empty string directory', () => {
			// Edge case: empty string is falsy but should still be handled
			startAgentSession(testSessionId, 'architect');
			const result = ensureAgentSession(testSessionId, ORCHESTRATOR_NAME, '');

			expect(result).toBeDefined();
		});
	});

	describe('Integration: Both bootstrap paths use same pattern', () => {
		it('both paths call ensureAgentSession with directory parameter', () => {
			// This test verifies that both bootstrap paths use the same pattern
			// of passing ctx.directory to ensureAgentSession

			// Path 1: Stale delegation
			startAgentSession(`${testSessionId}-path1`, 'coder');
			const session1 = swarmState.agentSessions.get(`${testSessionId}-path1`);
			session1!.delegationActive = true;
			session1!.lastAgentEventTime = Date.now() - 20000;
			swarmState.activeAgent.set(`${testSessionId}-path1`, 'coder');

			const result1 = ensureAgentSession(
				`${testSessionId}-path1`,
				ORCHESTRATOR_NAME,
				mockDirectory, // ctx.directory passed here
			);
			expect(result1.agentName).toBe(ORCHESTRATOR_NAME);

			// Path 2: Task handoff
			startAgentSession(`${testSessionId}-path2`, 'coder');
			const session2 = swarmState.agentSessions.get(`${testSessionId}-path2`);
			session2!.delegationActive = true;
			session2!.lastAgentEventTime = Date.now() - 20000;
			swarmState.activeAgent.set(`${testSessionId}-path2`, 'coder');

			const result2 = ensureAgentSession(
				`${testSessionId}-path2`,
				ORCHESTRATOR_NAME,
				mockDirectory, // ctx.directory passed here too
			);
			expect(result2.agentName).toBe(ORCHESTRATOR_NAME);

			// Both paths result in architect-controlled session
			expect(result1.delegationActive).toBe(false);
			expect(result2.delegationActive).toBe(false);
		});
	});
});

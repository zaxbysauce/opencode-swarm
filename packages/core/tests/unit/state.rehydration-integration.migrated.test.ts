import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AgentSessionState } from '../../src/state';
import {
	ensureAgentSession,
	rehydrateSessionFromDisk,
	startAgentSession,
	swarmState,
} from '../../src/state';

let tmpDir: string;
let testSessionId: string;

// Track calls to rehydrateSessionFromDisk
let rehydrateCalls: Array<{ directory: string; session: AgentSessionState }> =
	[];
let originalRehydrate: typeof rehydrateSessionFromDisk;

beforeEach(() => {
	tmpDir = mkdtempSync(path.join(os.tmpdir(), 'rehydrate-integration-test-'));
	mkdirSync(path.join(tmpDir, '.swarm', 'evidence'), { recursive: true });
	testSessionId = 'test-session-' + Date.now();

	// Capture rehydrate calls by wrapping the function
	rehydrateCalls = [];
	originalRehydrate = rehydrateSessionFromDisk;
});

afterEach(() => {
	try {
		rmSync(tmpDir, { recursive: true, force: true });
	} catch {
		/* best effort */
	}
	swarmState.agentSessions.delete(testSessionId);
});

// Helper to create a session and get the actual session from the map
function createTestSession(): AgentSessionState {
	startAgentSession(testSessionId, 'architect');
	const session = swarmState.agentSessions.get(testSessionId);
	if (!session) {
		throw new Error('Failed to create test session');
	}
	return session;
}

// Helper to create plan.json content
function writePlan(tasks: Array<{ id: string; status: string }>): void {
	const plan = {
		schema_version: '1.0.0' as const,
		title: 'Test Plan',
		swarm: 'test',
		phases: [
			{
				id: 1,
				name: 'Phase 1',
				status: 'pending' as const,
				tasks: tasks.map((t) => ({
					id: t.id,
					phase: 1,
					description: `Task ${t.id}`,
					status: t.status,
					size: 'small' as const,
					depends: [],
					files_touched: [],
				})),
			},
		],
	};
	writeFileSync(path.join(tmpDir, '.swarm', 'plan.json'), JSON.stringify(plan));
}

describe('startAgentSession with directory parameter', () => {
	it('1. without directory parameter - does NOT call rehydrateSessionFromDisk', () => {
		// Arrange & Act: create session WITHOUT directory
		startAgentSession(testSessionId, 'architect');

		// Assert: rehydrateSessionFromDisk should NOT have been called
		// (we check this indirectly - no rehydration files should be created)
		const session = swarmState.agentSessions.get(testSessionId);
		expect(session?.taskWorkflowStates?.size).toBe(0);
	});

	it('2. with directory parameter - DOES call rehydrateSessionFromDisk', async () => {
		// Arrange: create plan.json so rehydration has data
		writePlan([{ id: '1.1', status: 'in_progress' }]);

		// Act: create session WITH directory
		startAgentSession(testSessionId, 'architect', 7200000, tmpDir);

		// Give async rehydration time to complete
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Assert: rehydrateSessionFromDisk SHOULD have been called
		// Check that workflow states were populated from the plan
		const session = swarmState.agentSessions.get(testSessionId);
		expect(session?.taskWorkflowStates?.get('1.1')).toBe('coder_delegated');
	});

	it('3. backward compatibility - creates session without errors when directory omitted', () => {
		// Act & Assert: should not throw
		expect(() => {
			startAgentSession(testSessionId, 'architect');
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
		expect(session?.agentName).toBe('architect');
	});

	it('4. directory parameter is optional - rehydration is fire-and-forget (non-blocking)', async () => {
		// Arrange: create valid plan
		writePlan([{ id: '1.1', status: 'in_progress' }]);

		// Act: create session with directory - should return immediately (non-blocking)
		const startTime = Date.now();
		startAgentSession(testSessionId, 'architect', 7200000, tmpDir);
		const endTime = Date.now();

		// Assert: should return quickly (not waiting for rehydration)
		expect(endTime - startTime).toBeLessThan(100);
	});
});

describe('ensureAgentSession with directory parameter', () => {
	it('5. without directory parameter - does NOT call rehydrateSessionFromDisk for new session', () => {
		// Arrange & Act: create session WITHOUT directory
		ensureAgentSession(testSessionId, 'architect');

		// Assert: rehydrateSessionFromDisk should NOT have been called
		const session = swarmState.agentSessions.get(testSessionId);
		expect(session?.taskWorkflowStates?.size).toBe(0);
	});

	it('6. with directory parameter - DOES call rehydrateSessionFromDisk for new session', async () => {
		// Arrange: create plan.json so rehydration has data
		writePlan([{ id: '1.1', status: 'in_progress' }]);

		// Act: create session WITH directory
		ensureAgentSession(testSessionId, 'architect', tmpDir);

		// Give async rehydration time to complete
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Assert: rehydrateSessionFromDisk SHOULD have been called
		const session = swarmState.agentSessions.get(testSessionId);
		expect(session?.taskWorkflowStates?.get('1.1')).toBe('coder_delegated');
	});

	it('7. existing session without directory - does NOT trigger rehydration', () => {
		// Arrange: create session first without directory
		ensureAgentSession(testSessionId, 'architect');
		const sessionBefore = swarmState.agentSessions.get(testSessionId);
		if (sessionBefore) {
			sessionBefore.taskWorkflowStates?.set('1.1', 'tests_run');
		}

		// Act: call ensureAgentSession again (session already exists)
		ensureAgentSession(testSessionId, 'architect');

		// Assert: rehydrateSessionFromDisk should NOT have been called
		// The workflow state should remain tests_run (not overwritten by rehydration)
		const sessionAfter = swarmState.agentSessions.get(testSessionId);
		expect(sessionAfter?.taskWorkflowStates?.get('1.1')).toBe('tests_run');
	});

	it('8. backward compatibility - works without directory parameter', () => {
		// Act & Assert: should not throw
		expect(() => {
			ensureAgentSession(testSessionId, 'architect');
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
		expect(session?.agentName).toBe('architect');
	});
});

describe('rehydration integration behavior', () => {
	it('9. rehydration errors are swallowed (non-fatal)', async () => {
		// Arrange: create plan with invalid JSON to cause rehydration error
		writeFileSync(path.join(tmpDir, '.swarm', 'plan.json'), 'invalid json {{{');

		// Act & Assert: should NOT throw - errors are swallowed
		expect(() => {
			startAgentSession(testSessionId, 'architect', 7200000, tmpDir);
		}).not.toThrow();

		// Session should still exist
		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
	});

	it('10. empty/undefined directory does not trigger rehydration', () => {
		// Act: call with empty string
		startAgentSession(testSessionId, 'architect', 7200000, '');

		// Assert: rehydrate should NOT be called (empty string is falsy)
		const session = swarmState.agentSessions.get(testSessionId);
		expect(session?.taskWorkflowStates?.size).toBe(0);
	});

	it('11. undefined directory explicitly passed does not trigger rehydration', () => {
		// Act: call with undefined
		startAgentSession(testSessionId, 'architect', 7200000, undefined);

		// Assert: rehydrate should NOT be called
		const session = swarmState.agentSessions.get(testSessionId);
		expect(session?.taskWorkflowStates?.size).toBe(0);
	});

	it('12. directory is passed to rehydrateSessionFromDisk correctly', async () => {
		// Arrange: create plan with known task
		writePlan([{ id: '1.1', status: 'completed' }]);

		// Act: call with specific directory
		startAgentSession(testSessionId, 'coder', 7200000, tmpDir);

		// Give async rehydration time to complete
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Assert: the workflow state should reflect the plan status
		// completed -> complete
		const session = swarmState.agentSessions.get(testSessionId);
		expect(session?.taskWorkflowStates?.get('1.1')).toBe('complete');
	});
});

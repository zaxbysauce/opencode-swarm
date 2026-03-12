/**
 * Integration tests for session snapshot functionality.
 * Tests round-trip save/load, error handling, and idempotency.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Direct imports from session modules (not from src/index.ts)
import { createSnapshotWriterHook } from '../../../src/session/snapshot-writer.js';
import { loadSnapshot, reconcileTaskStatesFromPlan } from '../../../src/session/snapshot-reader.js';

// State imports for setup and verification
import { swarmState, resetSwarmState, startAgentSession, ensureAgentSession } from '../../../src/state.js';

describe('Snapshot Integration', () => {
	let tempDir: string;

	beforeEach(() => {
		// Create temp directory for each test
		tempDir = mkdtempSync(join(tmpdir(), 'snapshot-test-'));
		// Reset swarm state to clean slate
		resetSwarmState();
	});

	afterEach(() => {
		// Clean up temp directory
		try {
			rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
		// Always reset state between tests
		resetSwarmState();
	});

	describe('round-trip test', () => {
		it('should write snapshot and load back matching state', async () => {
			// Setup: populate swarmState with some data
			const sessionId = 'test-session-1';
			startAgentSession(sessionId, 'coder');
			const session = ensureAgentSession(sessionId, 'coder');

			// Add some tool aggregate data
			swarmState.toolAggregates.set('read', {
				tool: 'read',
				count: 5,
				successCount: 4,
				failureCount: 1,
				totalDuration: 1000,
			});

			// Explicitly set activeAgent for both sessions
			swarmState.activeAgent.set(sessionId, 'coder');
			swarmState.activeAgent.set('session-2', 'reviewer');

			// Add delegation chain
			swarmState.delegationChains.set('session-1', [
				{ from: 'architect', to: 'coder', timestamp: Date.now() },
			]);

			// Set some session state fields
			session.architectWriteCount = 3;
			session.currentTaskId = 'task-123';
			session.qaSkipCount = 2;
			session.qaSkipTaskIds = ['task-1', 'task-2'];
			session.phaseAgentsDispatched.add('coder');
			session.phaseAgentsDispatched.add('reviewer');

			// Create snapshot writer hook and call it
			const snapshotWriterHook = createSnapshotWriterHook(tempDir);
			await snapshotWriterHook({}, {});

			// Verify file was written
			const statePath = join(tempDir, '.swarm', 'session', 'state.json');
			const file = Bun.file(statePath);
			const content = await file.text();
			const parsed = JSON.parse(content);

			expect(parsed).toBeDefined();
			expect(parsed.version).toBe(1);
			expect(parsed.toolAggregates.read).toBeDefined();
			expect(parsed.activeAgent['session-2']).toBe('reviewer');
			expect(parsed.agentSessions[sessionId]).toBeDefined();

			// Reset state and load snapshot
			resetSwarmState();
			await loadSnapshot(tempDir);

			// Verify state was rehydrated correctly
			expect(swarmState.toolAggregates.size).toBe(1);
			const toolAgg = swarmState.toolAggregates.get('read');
			expect(toolAgg).toBeDefined();
			expect(toolAgg?.count).toBe(5);
			expect(toolAgg?.successCount).toBe(4);
			expect(toolAgg?.failureCount).toBe(1);
			expect(toolAgg?.totalDuration).toBe(1000);

			expect(swarmState.activeAgent.size).toBe(2);
			expect(swarmState.activeAgent.get(sessionId)).toBe('coder');
			expect(swarmState.activeAgent.get('session-2')).toBe('reviewer');

			expect(swarmState.delegationChains.size).toBe(1);
			const chain = swarmState.delegationChains.get('session-1');
			expect(chain).toBeDefined();
			expect(chain?.length).toBe(1);
			expect(chain?.[0].from).toBe('architect');
			expect(chain?.[0].to).toBe('coder');

			expect(swarmState.agentSessions.size).toBe(1);
			const loadedSession = swarmState.agentSessions.get(sessionId);
			expect(loadedSession).toBeDefined();
			expect(loadedSession?.agentName).toBe('coder');
			expect(loadedSession?.architectWriteCount).toBe(3);
			expect(loadedSession?.currentTaskId).toBe('task-123');
			expect(loadedSession?.qaSkipCount).toBe(2);
			expect(loadedSession?.qaSkipTaskIds).toEqual(['task-1', 'task-2']);
			expect(loadedSession?.phaseAgentsDispatched.has('coder')).toBe(true);
			expect(loadedSession?.phaseAgentsDispatched.has('reviewer')).toBe(true);
		});
	});

	describe('load with no file', () => {
		it('should return without error when state.json does not exist', async () => {
			// Setup: populate some state first
			swarmState.toolAggregates.set('test', {
				tool: 'test',
				count: 10,
				successCount: 9,
				failureCount: 1,
				totalDuration: 500,
			});

			// Create empty .swarm directory but no state.json
			const swarmDir = join(tempDir, '.swarm', 'session');
			Bun.write(join(swarmDir, 'dummy.txt'), 'dummy');

			// Load snapshot should not throw
			await loadSnapshot(tempDir);

			// State should remain unchanged
			expect(swarmState.toolAggregates.size).toBe(1);
			const agg = swarmState.toolAggregates.get('test');
			expect(agg?.count).toBe(10);
		});

		it('should leave swarmState unchanged when file is missing', async () => {
			// Setup initial state
			swarmState.activeAgent.set('session-1', 'architect');
			startAgentSession('session-1', 'architect');

			// Record initial state
			const initialActiveAgent = swarmState.activeAgent.get('session-1');
			const initialSessionCount = swarmState.agentSessions.size;

			// Load from directory with no snapshot
			await loadSnapshot(tempDir);

			// Verify state is unchanged
			expect(swarmState.activeAgent.get('session-1')).toBe(initialActiveAgent);
			expect(swarmState.agentSessions.size).toBe(initialSessionCount);
		});
	});

	describe('load with corrupted JSON', () => {
		it('should not throw when state.json contains invalid JSON', async () => {
			// Setup: populate some state
			swarmState.toolAggregates.set('valid', {
				tool: 'valid',
				count: 1,
				successCount: 1,
				failureCount: 0,
				totalDuration: 100,
			});

			// Create directory and write corrupted JSON
			const sessionDir = join(tempDir, '.swarm', 'session');
			Bun.write(join(sessionDir, '.gitkeep'), ''); // Ensure directory exists
			const statePath = join(sessionDir, 'state.json');
			writeFileSync(statePath, '{ invalid json {{{', 'utf-8');

			// Should not throw
			await loadSnapshot(tempDir);

			// State should remain unchanged (corrupt file ignored)
			expect(swarmState.toolAggregates.size).toBe(1);
			const agg = swarmState.toolAggregates.get('valid');
			expect(agg?.count).toBe(1);
		});

		it('should not throw when state.json is empty', async () => {
			// Setup state
			swarmState.activeAgent.set('session-1', 'coder');

			// Create directory and write empty file
			const sessionDir = join(tempDir, '.swarm', 'session');
			Bun.write(join(sessionDir, '.gitkeep'), '');
			const statePath = join(sessionDir, 'state.json');
			writeFileSync(statePath, '', 'utf-8');

			// Should not throw
			await loadSnapshot(tempDir);

			// State unchanged
			expect(swarmState.activeAgent.size).toBe(1);
		});

		it('should not throw when state.json contains wrong version', async () => {
			// Setup state
			startAgentSession('session-1', 'reviewer');

			// Create directory and write snapshot with wrong version
			const sessionDir = join(tempDir, '.swarm', 'session');
			Bun.write(join(sessionDir, '.gitkeep'), '');
			const wrongVersionData = JSON.stringify({
				version: 999,
				writtenAt: Date.now(),
				toolAggregates: {},
				activeAgent: {},
				delegationChains: {},
				agentSessions: {},
			});
			const statePath = join(sessionDir, 'state.json');
			writeFileSync(statePath, wrongVersionData, 'utf-8');

			// Should not throw
			await loadSnapshot(tempDir);

			// State unchanged (wrong version ignored)
			expect(swarmState.agentSessions.size).toBe(1);
		});
	});

	describe('writer hook with empty state', () => {
		it('should succeed when swarmState is completely empty', async () => {
			// Ensure state is empty (resetSwarmState already called in beforeEach)
			resetSwarmState();

			expect(swarmState.toolAggregates.size).toBe(0);
			expect(swarmState.activeAgent.size).toBe(0);
			expect(swarmState.delegationChains.size).toBe(0);
			expect(swarmState.agentSessions.size).toBe(0);

			// Create hook and call it
			const snapshotWriterHook = createSnapshotWriterHook(tempDir);
			await snapshotWriterHook({}, {});

			// Verify file was written even with empty state
			const statePath = join(tempDir, '.swarm', 'session', 'state.json');
			const file = Bun.file(statePath);
			const exists = await file.exists();
			expect(exists).toBe(true);

			const content = await file.text();
			const parsed = JSON.parse(content);
			expect(parsed.version).toBe(1);
			expect(parsed.toolAggregates).toEqual({});
			expect(parsed.activeAgent).toEqual({});
			expect(parsed.delegationChains).toEqual({});
			expect(parsed.agentSessions).toEqual({});
		});

		it('should create directory structure if needed', async () => {
			// Start with completely empty temp dir
			resetSwarmState();

			// Call hook
			const snapshotWriterHook = createSnapshotWriterHook(tempDir);
			await snapshotWriterHook({}, {});

			// Verify directory and file exist
			const statePath = join(tempDir, '.swarm', 'session', 'state.json');
			const file = Bun.file(statePath);
			expect(await file.exists()).toBe(true);
		});
	});

	describe('writer idempotency', () => {
		it('should overwrite cleanly when called multiple times', async () => {
			// Setup: populate state with initial data
			const sessionId = 'test-session-idempotent';
			startAgentSession(sessionId, 'tester');
			const session = ensureAgentSession(sessionId, 'tester');

			swarmState.toolAggregates.set('write', {
				tool: 'write',
				count: 3,
				successCount: 3,
				failureCount: 0,
				totalDuration: 200,
			});

			session.architectWriteCount = 1;

			// First write
			const snapshotWriterHook = createSnapshotWriterHook(tempDir);
			await snapshotWriterHook({}, {});

			// Verify first write
			const statePath = join(tempDir, '.swarm', 'session', 'state.json');
			let file = Bun.file(statePath);
			let content1 = await file.text();
			let parsed1 = JSON.parse(content1);
			expect(parsed1.toolAggregates.write.count).toBe(3);
			expect(parsed1.agentSessions[sessionId].architectWriteCount).toBe(1);

			// Modify state
			swarmState.toolAggregates.get('write')!.count = 7;
			session.architectWriteCount = 5;
			session.qaSkipCount = 3;

			// Second write (overwrite)
			await snapshotWriterHook({}, {});

			// Verify second write overwrote correctly
			file = Bun.file(statePath);
			const content2 = await file.text();
			const parsed2 = JSON.parse(content2);
			expect(parsed2.toolAggregates.write.count).toBe(7);
			expect(parsed2.agentSessions[sessionId].architectWriteCount).toBe(5);
			expect(parsed2.agentSessions[sessionId].qaSkipCount).toBe(3);

			// Third write with same data (no crash)
			await snapshotWriterHook({}, {});

			file = Bun.file(statePath);
			const content3 = await file.text();
			const parsed3 = JSON.parse(content3);
			expect(parsed3.toolAggregates.write.count).toBe(7); // Still 7
		});

		it('should handle rapid consecutive writes without error', async () => {
			// Setup minimal state
			startAgentSession('session-rapid', 'rapid-agent');
			const hook = createSnapshotWriterHook(tempDir);

			// Rapid consecutive writes
			const writes: Promise<void>[] = [];
			for (let i = 0; i < 5; i++) {
				writes.push(hook({}, {}));
			}

			// All should complete without error
			await Promise.all(writes);

			// Verify file exists and is valid
			const statePath = join(tempDir, '.swarm', 'session', 'state.json');
			const file = Bun.file(statePath);
			expect(await file.exists()).toBe(true);
			const content = await file.text();
			const parsed = JSON.parse(content);
			expect(parsed.version).toBe(1);
		});

		it('should maintain valid JSON after multiple writes', async () => {
			// Setup state
			swarmState.toolAggregates.set('tool1', {
				tool: 'tool1',
				count: 1,
				successCount: 1,
				failureCount: 0,
				totalDuration: 50,
			});

			const hook = createSnapshotWriterHook(tempDir);

			// Write, modify, write multiple times
			for (let i = 0; i < 3; i++) {
				await hook({}, {});

				// Modify state
				swarmState.toolAggregates.set('tool1', {
					tool: 'tool1',
					count: i + 2,
					successCount: i + 2,
					failureCount: 0,
					totalDuration: 50 * (i + 2),
				});
			}

			// Final write
			await hook({}, {});

			// Verify final state is valid and matches last write
			const statePath = join(tempDir, '.swarm', 'session', 'state.json');
			const file = Bun.file(statePath);
			const content = await file.text();

			// Should be valid JSON
			expect(() => JSON.parse(content)).not.toThrow();

			const parsed = JSON.parse(content);
			expect(parsed.toolAggregates.tool1.count).toBe(4); // Last value (3 + 1)
		});
	});

	describe('integration with Map/Set serialization', () => {
		it('should correctly serialize and deserialize Map fields', async () => {
			// Setup session with Map fields
			const sessionId = 'session-map-test';
			startAgentSession(sessionId, 'coder');
			const session = ensureAgentSession(sessionId, 'coder');

			// Populate gateLog Map
			session.gateLog.set('task-1', new Set(['gate-a', 'gate-b']));
			session.gateLog.set('task-2', new Set(['gate-c']));

			// Populate reviewerCallCount Map
			session.reviewerCallCount.set(1, 3);
			session.reviewerCallCount.set(2, 5);

			// Write snapshot
			const hook = createSnapshotWriterHook(tempDir);
			await hook({}, {});

			// Reset and load
			resetSwarmState();
			await loadSnapshot(tempDir);

			// Verify Maps were restored correctly
			const loadedSession = swarmState.agentSessions.get(sessionId);
			expect(loadedSession).toBeDefined();
			expect(loadedSession?.gateLog.size).toBe(2);
			expect(loadedSession?.gateLog.get('task-1')).toEqual(new Set(['gate-a', 'gate-b']));
			expect(loadedSession?.gateLog.get('task-2')).toEqual(new Set(['gate-c']));
			expect(loadedSession?.reviewerCallCount.get(1)).toBe(3);
			expect(loadedSession?.reviewerCallCount.get(2)).toBe(5);
		});

		it('should correctly serialize and deserialize Set fields', async () => {
			// Setup session with Set fields
			const sessionId = 'session-set-test';
			startAgentSession(sessionId, 'reviewer');
			const session = ensureAgentSession(sessionId, 'reviewer');

			// Populate Sets
			session.partialGateWarningsIssuedForTask.add('task-a');
			session.partialGateWarningsIssuedForTask.add('task-b');
			session.catastrophicPhaseWarnings.add(1);
			session.catastrophicPhaseWarnings.add(3);
			session.phaseAgentsDispatched.add('coder');
			session.phaseAgentsDispatched.add('reviewer');

			// Write snapshot
			const hook = createSnapshotWriterHook(tempDir);
			await hook({}, {});

			// Reset and load
			resetSwarmState();
			await loadSnapshot(tempDir);

			// Verify Sets were restored correctly
			const loadedSession = swarmState.agentSessions.get(sessionId);
			expect(loadedSession).toBeDefined();
			expect(loadedSession?.partialGateWarningsIssuedForTask.size).toBe(2);
			expect(loadedSession?.partialGateWarningsIssuedForTask.has('task-a')).toBe(true);
			expect(loadedSession?.partialGateWarningsIssuedForTask.has('task-b')).toBe(true);
			expect(loadedSession?.catastrophicPhaseWarnings.size).toBe(2);
			expect(loadedSession?.catastrophicPhaseWarnings.has(1)).toBe(true);
			expect(loadedSession?.catastrophicPhaseWarnings.has(3)).toBe(true);
			expect(loadedSession?.phaseAgentsDispatched.has('coder')).toBe(true);
			expect(loadedSession?.phaseAgentsDispatched.has('reviewer')).toBe(true);
		});
	});

	// Helper to create a mock AgentSessionState
	function makeMockSession(): ReturnType<typeof ensureAgentSession> {
		return {
			agentName: 'mega',
			lastToolCallTime: 0,
			lastAgentEventTime: 0,
			delegationActive: false,
			activeInvocationId: 0,
			lastInvocationIdByAgent: {},
			windows: {},
			lastCompactionHint: 0,
			architectWriteCount: 0,
			lastCoderDelegationTaskId: null,
			currentTaskId: null,
			gateLog: new Map(),
			reviewerCallCount: new Map(),
			lastGateFailure: null,
			partialGateWarningsIssuedForTask: new Set(),
			selfFixAttempted: false,
			catastrophicPhaseWarnings: new Set(),
			lastPhaseCompleteTimestamp: 0,
			lastPhaseCompletePhase: 0,
			phaseAgentsDispatched: new Set(),
			qaSkipCount: 0,
			qaSkipTaskIds: [],
			taskWorkflowStates: new Map(),
			lastGateOutcome: null,
			declaredCoderScope: null,
			lastScopeViolation: null,
			modifiedFilesThisCoderTask: [],
		};
	}

	// Helper to create plan JSON
	function makePlanJSON(tasks: { id: string; status: string }[]): string {
		return JSON.stringify({ phases: [{ id: 1, name: 'Phase 1', status: 'in_progress', tasks }] });
	}

	describe('reconcileTaskStatesFromPlan', () => {
		let planDir: string;

		beforeEach(() => {
			// Create temp directory for plan.json tests
			planDir = mkdtempSync(join(tmpdir(), 'plan-reconcile-test-'));
			resetSwarmState();
		});

		afterEach(() => {
			try {
				rmSync(planDir, { recursive: true, force: true });
			} catch {
				// Ignore cleanup errors
			}
			resetSwarmState();
		});

		it('should seed completed plan tasks to tests_run', async () => {
			// Given: session with taskId '1.1' at 'idle'
			const sessionId = 'session-completed-test';
			const mockSession = makeMockSession();
			mockSession.taskWorkflowStates.set('1.1', 'idle');
			swarmState.agentSessions.set(sessionId, mockSession);

			// And: plan has task '1.1' as 'completed'
			const planDirInner = join(planDir, '.swarm');
			mkdirSync(planDirInner, { recursive: true });
			writeFileSync(join(planDirInner, 'plan.json'), makePlanJSON([{ id: '1.1', status: 'completed' }]), 'utf-8');

			// When
			await reconcileTaskStatesFromPlan(planDir);

			// Then: session taskWorkflowStates.get('1.1') === 'tests_run'
			expect(mockSession.taskWorkflowStates.get('1.1')).toBe('tests_run');
		});

		it('should seed in_progress plan tasks to coder_delegated', async () => {
			// Given: session with taskId '2.1' at 'idle'
			const sessionId = 'session-inprogress-test';
			const mockSession = makeMockSession();
			mockSession.taskWorkflowStates.set('2.1', 'idle');
			swarmState.agentSessions.set(sessionId, mockSession);

			// And: plan has task '2.1' as 'in_progress'
			const planDirInner = join(planDir, '.swarm');
			mkdirSync(planDirInner, { recursive: true });
			writeFileSync(join(planDirInner, 'plan.json'), makePlanJSON([{ id: '2.1', status: 'in_progress' }]), 'utf-8');

			// When
			await reconcileTaskStatesFromPlan(planDir);

			// Then: state === 'coder_delegated'
			expect(mockSession.taskWorkflowStates.get('2.1')).toBe('coder_delegated');
		});

		it('should not regress tasks already at tests_run', async () => {
			// Given: session with '1.1' already at 'tests_run'
			const sessionId = 'session-tests-run-test';
			const mockSession = makeMockSession();
			mockSession.taskWorkflowStates.set('1.1', 'tests_run');
			swarmState.agentSessions.set(sessionId, mockSession);

			// And: plan says 'completed'
			const planDirInner = join(planDir, '.swarm');
			mkdirSync(planDirInner, { recursive: true });
			writeFileSync(join(planDirInner, 'plan.json'), makePlanJSON([{ id: '1.1', status: 'completed' }]), 'utf-8');

			// When - should not throw
			await reconcileTaskStatesFromPlan(planDir);

			// Then: remains 'tests_run'
			expect(mockSession.taskWorkflowStates.get('1.1')).toBe('tests_run');
		});

		it('should not regress tasks already at complete', async () => {
			// Given: session with '1.1' at 'complete'
			const sessionId = 'session-complete-test';
			const mockSession = makeMockSession();
			mockSession.taskWorkflowStates.set('1.1', 'complete');
			swarmState.agentSessions.set(sessionId, mockSession);

			// And: plan says 'completed'
			const planDirInner = join(planDir, '.swarm');
			mkdirSync(planDirInner, { recursive: true });
			writeFileSync(join(planDirInner, 'plan.json'), makePlanJSON([{ id: '1.1', status: 'completed' }]), 'utf-8');

			// When - should not throw
			await reconcileTaskStatesFromPlan(planDir);

			// Then: remains 'complete'
			expect(mockSession.taskWorkflowStates.get('1.1')).toBe('complete');
		});

		it('should ignore pending tasks', async () => {
			// Given: session state is 'idle'
			const sessionId = 'session-pending-test';
			const mockSession = makeMockSession();
			// No entry for task '3.1' means getTaskState returns 'idle'
			swarmState.agentSessions.set(sessionId, mockSession);

			// And: plan task '3.1' is 'pending'
			const planDirInner = join(planDir, '.swarm');
			mkdirSync(planDirInner, { recursive: true });
			writeFileSync(join(planDirInner, 'plan.json'), makePlanJSON([{ id: '3.1', status: 'pending' }]), 'utf-8');

			// When
			await reconcileTaskStatesFromPlan(planDir);

			// Then: remains 'idle' (no entry in Map)
			expect(mockSession.taskWorkflowStates.get('3.1')).toBeUndefined();
		});

		it('should handle missing plan.json gracefully', async () => {
			// Given: session with a task at 'idle'
			const sessionId = 'session-missing-test';
			const mockSession = makeMockSession();
			mockSession.taskWorkflowStates.set('1.1', 'idle');
			swarmState.agentSessions.set(sessionId, mockSession);

			// And: .swarm directory does NOT exist (plan.json is missing)
			// (planDir is empty - no .swarm folder)

			// When - should not throw (Bun.file().text() throws naturally for missing files)
			await reconcileTaskStatesFromPlan(planDir);

			// Then: state unchanged (still 'idle')
			expect(mockSession.taskWorkflowStates.get('1.1')).toBe('idle');
		});

		it('should handle corrupted JSON gracefully', async () => {
			// Given: session with a task at 'idle'
			const sessionId = 'session-corrupt-test';
			const mockSession = makeMockSession();
			mockSession.taskWorkflowStates.set('1.1', 'idle');
			swarmState.agentSessions.set(sessionId, mockSession);

			// And: plan.json contains non-JSON string
			const planDirInner = join(planDir, '.swarm');
			mkdirSync(planDirInner, { recursive: true });
			writeFileSync(join(planDirInner, 'plan.json'), '{ invalid json {{{', 'utf-8');

			// When - should not throw
			await reconcileTaskStatesFromPlan(planDir);

			// Then: state unchanged (still 'idle')
			expect(mockSession.taskWorkflowStates.get('1.1')).toBe('idle');
		});

		it('should heal corrupted state values during reconcile', async () => {
			// Given: session with '1.1' at corrupted value 'unknown_state' and '2.1' at 'idle'
			const sessionId = 'session-corrupted-state-test';
			const mockSession = makeMockSession();
			mockSession.taskWorkflowStates.set('1.1', 'unknown_state' as unknown as import('../../../src/state.js').TaskWorkflowState);
			mockSession.taskWorkflowStates.set('2.1', 'idle');
			swarmState.agentSessions.set(sessionId, mockSession);

			// And: plan has both tasks as 'completed'
			const planDirInner = join(planDir, '.swarm');
			mkdirSync(planDirInner, { recursive: true });
			writeFileSync(
				join(planDirInner, 'plan.json'),
				makePlanJSON([
					{ id: '1.1', status: 'completed' },
					{ id: '2.1', status: 'completed' },
				]),
				'utf-8',
			);

			// When
			await reconcileTaskStatesFromPlan(planDir);

			// Then: corrupted entry is healed (advanced to 'tests_run' because indexOf('unknown_state') === -1)
			expect(mockSession.taskWorkflowStates.get('1.1')).toBe('tests_run');
			// And: valid entry is also advanced to 'tests_run'
			expect(mockSession.taskWorkflowStates.get('2.1')).toBe('tests_run');
		});
	});
});

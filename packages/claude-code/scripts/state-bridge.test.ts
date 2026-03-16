import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import {
	createStateBridge,
	type MinimalSwarmState,
	StateBridge,
} from './state-bridge';

describe('StateBridge', () => {
	let tempDir: string;

	beforeEach(() => {
		// Create a temporary directory for each test
		tempDir = mkdtempSync(path.join(tmpdir(), 'state-bridge-test-'));
	});

	afterEach(() => {
		// Clean up after each test
		if (existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	function createSwarmDir(swarmDir: string): void {
		mkdirSync(path.join(swarmDir, 'session'), { recursive: true });
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Test 1: load() with no .swarm/ directory → returns empty MinimalSwarmState
	// ─────────────────────────────────────────────────────────────────────────
	test('load() with no .swarm/ directory returns empty MinimalSwarmState', () => {
		const bridge = createStateBridge(tempDir, 'test-session');
		const state = bridge.load();

		expect(state.taskStates.size).toBe(0);
		expect(state.delegationChains.size).toBe(0);
		expect(state.toolCallCounts.size).toBe(0);
		expect(state.sessionId).toBe('test-session');
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Test 2: load() reads task states from plan.json
	// ─────────────────────────────────────────────────────────────────────────
	test('load() reads task states from plan.json', () => {
		const swarmDir = path.join(tempDir, '.swarm');
		createSwarmDir(swarmDir);

		const plan = {
			phases: [
				{
					id: 'phase-1',
					tasks: [
						{ id: '1.1', status: 'completed' },
						{ id: '1.2', status: 'in_progress' },
						{ id: '1.3', status: 'pending' },
					],
				},
				{
					id: 'phase-2',
					tasks: [{ id: '2.1', status: 'blocked' }],
				},
			],
		};
		writeFileSync(
			path.join(swarmDir, 'plan.json'),
			JSON.stringify(plan),
			'utf-8',
		);

		const bridge = createStateBridge(tempDir, 'test-session');
		const state = bridge.load();

		expect(state.taskStates.size).toBe(4);

		const task1 = state.taskStates.get('1.1');
		expect(task1?.id).toBe('1.1');
		expect(task1?.status).toBe('completed');
		expect(task1?.workflowState).toBe('complete');

		const task2 = state.taskStates.get('1.2');
		expect(task2?.id).toBe('1.2');
		expect(task2?.status).toBe('in_progress');
		expect(task2?.workflowState).toBe('coder_delegated');

		const task3 = state.taskStates.get('1.3');
		expect(task3?.status).toBe('pending');
		expect(task3?.workflowState).toBe('idle');

		const task4 = state.taskStates.get('2.1');
		expect(task4?.status).toBe('blocked');
		expect(task4?.workflowState).toBe('idle');
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Test 3: load() reads delegation chains from session/state.json
	// ─────────────────────────────────────────────────────────────────────────
	test('load() reads delegation chains from session/state.json', () => {
		const swarmDir = path.join(tempDir, '.swarm');
		createSwarmDir(swarmDir);

		const snapshot = {
			delegationChains: {
				'session-1': [
					{ from: 'user', to: 'coder', timestamp: 1000 },
					{ from: 'coder', to: 'reviewer', timestamp: 2000 },
				],
				'session-2': [{ from: 'user', to: 'planner', timestamp: 3000 }],
			},
			toolAggregates: {
				Read: { totalCalls: 50 },
				Write: { totalCalls: 25 },
			},
		};
		writeFileSync(
			path.join(swarmDir, 'session', 'state.json'),
			JSON.stringify(snapshot),
			'utf-8',
		);

		const bridge = createStateBridge(tempDir, 'session-1');
		const state = bridge.load();

		const chain1 = state.delegationChains.get('session-1');
		expect(chain1?.length).toBe(2);
		expect(chain1?.[0]).toEqual({ from: 'user', to: 'coder', timestamp: 1000 });
		expect(chain1?.[1]).toEqual({
			from: 'coder',
			to: 'reviewer',
			timestamp: 2000,
		});

		const chain2 = state.delegationChains.get('session-2');
		expect(chain2?.length).toBe(1);

		// Tool call counts
		expect(state.toolCallCounts.get('Read')).toBe(50);
		expect(state.toolCallCounts.get('Write')).toBe(25);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Test 4: load() uses cache when mtimes match (cache hit)
	// ─────────────────────────────────────────────────────────────────────────
	test('load() uses cache when mtimes match (cache hit)', () => {
		const swarmDir = path.join(tempDir, '.swarm');
		createSwarmDir(swarmDir);

		// Write initial plan and snapshot
		const plan = { phases: [{ tasks: [{ id: '1.1', status: 'completed' }] }] };
		const snapshot = { delegationChains: {}, toolAggregates: {} };

		writeFileSync(
			path.join(swarmDir, 'plan.json'),
			JSON.stringify(plan),
			'utf-8',
		);
		writeFileSync(
			path.join(swarmDir, 'session', 'state.json'),
			JSON.stringify(snapshot),
			'utf-8',
		);

		const bridge = createStateBridge(tempDir, 'test-session');

		// First load - cold load
		const state1 = bridge.load();
		expect(state1.taskStates.get('1.1')?.status).toBe('completed');

		// Modify cached state in memory
		state1.taskStates.set('1.1', {
			id: '1.1',
			status: 'completed',
			workflowState: 'complete',
		});
		state1.toolCallCounts.set('TestTool', 999);

		// Second load - should hit cache
		const state2 = bridge.load();

		// Cache should return the cached state with original values
		// The in-memory modifications to state1 don't persist to cache
		expect(state2.taskStates.get('1.1')?.status).toBe('completed');
		expect(state2.toolCallCounts.get('TestTool')).toBeUndefined();
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Test 5: load() does cold load when mtimes differ (cache miss)
	// ─────────────────────────────────────────────────────────────────────────
	test('load() does cold load when mtimes differ (cache miss)', () => {
		const swarmDir = path.join(tempDir, '.swarm');
		createSwarmDir(swarmDir);

		// Write initial plan and snapshot
		const plan1 = { phases: [{ tasks: [{ id: '1.1', status: 'pending' }] }] };
		const snapshot = { delegationChains: {}, toolAggregates: {} };

		writeFileSync(
			path.join(swarmDir, 'plan.json'),
			JSON.stringify(plan1),
			'utf-8',
		);
		writeFileSync(
			path.join(swarmDir, 'session', 'state.json'),
			JSON.stringify(snapshot),
			'utf-8',
		);

		const bridge = createStateBridge(tempDir, 'test-session');

		// First load - cold load
		const state1 = bridge.load();
		expect(state1.taskStates.get('1.1')?.status).toBe('pending');

		// Modify plan.json to change mtime
		const plan2 = { phases: [{ tasks: [{ id: '1.1', status: 'completed' }] }] };
		writeFileSync(
			path.join(swarmDir, 'plan.json'),
			JSON.stringify(plan2),
			'utf-8',
		);

		// Second load - should cold load because mtime changed
		const state2 = bridge.load();
		expect(state2.taskStates.get('1.1')?.status).toBe('completed');
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Test 6: save() persists delegationChains to session/state.json
	// ─────────────────────────────────────────────────────────────────────────
	test('save() persists delegationChains to session/state.json', () => {
		const swarmDir = path.join(tempDir, '.swarm');
		createSwarmDir(swarmDir);

		const bridge = createStateBridge(tempDir, 'test-session');

		const state: MinimalSwarmState = {
			taskStates: new Map(),
			delegationChains: new Map([
				[
					'test-session',
					[
						{ from: 'user', to: 'coder', timestamp: 1000 },
						{ from: 'coder', to: 'reviewer', timestamp: 2000 },
					],
				],
			]),
			toolCallCounts: new Map(),
			sessionId: 'test-session',
			cwd: tempDir,
		};

		bridge.save(state);

		const saved = JSON.parse(
			readFileSync(path.join(swarmDir, 'session', 'state.json'), 'utf-8'),
		);

		expect(saved.delegationChains).toBeDefined();
		expect(saved.delegationChains['test-session']).toHaveLength(2);
		expect(saved.delegationChains['test-session'][0]).toEqual({
			from: 'user',
			to: 'coder',
			timestamp: 1000,
		});
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Test 7: save() persists toolCallCounts to session/state.json
	// ─────────────────────────────────────────────────────────────────────────
	test('save() persists toolCallCounts to session/state.json', () => {
		const swarmDir = path.join(tempDir, '.swarm');
		createSwarmDir(swarmDir);

		const bridge = createStateBridge(tempDir, 'test-session');

		const state: MinimalSwarmState = {
			taskStates: new Map(),
			delegationChains: new Map(),
			toolCallCounts: new Map([
				['Read', 42],
				['Write', 15],
				['Edit', 7],
			]),
			sessionId: 'test-session',
			cwd: tempDir,
		};

		bridge.save(state);

		const saved = JSON.parse(
			readFileSync(path.join(swarmDir, 'session', 'state.json'), 'utf-8'),
		);

		expect(saved.toolAggregates).toBeDefined();
		expect(saved.toolAggregates.Read.totalCalls).toBe(42);
		expect(saved.toolAggregates.Write.totalCalls).toBe(15);
		expect(saved.toolAggregates.Edit.totalCalls).toBe(7);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Test 8: save() updates cache after writing
	// ─────────────────────────────────────────────────────────────────────────
	test('save() updates cache after writing', () => {
		const swarmDir = path.join(tempDir, '.swarm');
		createSwarmDir(swarmDir);

		const plan = { phases: [{ tasks: [{ id: '1.1', status: 'pending' }] }] };
		const snapshot = { delegationChains: {}, toolAggregates: {} };

		writeFileSync(
			path.join(swarmDir, 'plan.json'),
			JSON.stringify(plan),
			'utf-8',
		);
		writeFileSync(
			path.join(swarmDir, 'session', 'state.json'),
			JSON.stringify(snapshot),
			'utf-8',
		);

		const bridge = createStateBridge(tempDir, 'test-session');

		// Load to populate cache
		bridge.load();

		// Now save new state
		const state: MinimalSwarmState = {
			taskStates: new Map(),
			delegationChains: new Map(),
			toolCallCounts: new Map([['NewTool', 100]]),
			sessionId: 'test-session',
			cwd: tempDir,
		};
		bridge.save(state);

		// Verify cache was updated
		const cachePath = path.join(swarmDir, 'state-cache.json');
		expect(existsSync(cachePath)).toBe(true);

		const cache = JSON.parse(readFileSync(cachePath, 'utf-8'));
		expect(cache.state.toolCallCounts).toContainEqual(['NewTool', 100]);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Test 9: advanceTaskWorkflowState() advances forward correctly
	// ─────────────────────────────────────────────────────────────────────────
	test('advanceTaskWorkflowState() advances forward correctly', () => {
		const bridge = createStateBridge(tempDir, 'test-session');

		const state: MinimalSwarmState = {
			taskStates: new Map([
				['task-1', { id: 'task-1', status: 'pending', workflowState: 'idle' }],
			]),
			delegationChains: new Map(),
			toolCallCounts: new Map(),
			sessionId: 'test-session',
			cwd: tempDir,
		};

		// Advance from idle to coder_delegated - status should be preserved from existing
		bridge.advanceTaskWorkflowState(state, 'task-1', 'coder_delegated');
		expect(state.taskStates.get('task-1')?.workflowState).toBe(
			'coder_delegated',
		);
		expect(state.taskStates.get('task-1')?.status).toBe('pending');

		// Advance to pre_check_passed
		bridge.advanceTaskWorkflowState(state, 'task-1', 'pre_check_passed');
		expect(state.taskStates.get('task-1')?.workflowState).toBe(
			'pre_check_passed',
		);

		// Advance to complete
		bridge.advanceTaskWorkflowState(state, 'task-1', 'complete');
		expect(state.taskStates.get('task-1')?.workflowState).toBe('complete');
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Test 10: advanceTaskWorkflowState() ignores backward transitions
	// ─────────────────────────────────────────────────────────────────────────
	test('advanceTaskWorkflowState() ignores backward transitions', () => {
		const bridge = createStateBridge(tempDir, 'test-session');

		const state: MinimalSwarmState = {
			taskStates: new Map([
				[
					'task-1',
					{
						id: 'task-1',
						status: 'in_progress',
						workflowState: 'pre_check_passed',
					},
				],
			]),
			delegationChains: new Map(),
			toolCallCounts: new Map(),
			sessionId: 'test-session',
			cwd: tempDir,
		};

		// Try to advance backward to idle - should be ignored
		bridge.advanceTaskWorkflowState(state, 'task-1', 'idle');
		expect(state.taskStates.get('task-1')?.workflowState).toBe(
			'pre_check_passed',
		);

		// Try to advance to same state - should be ignored
		bridge.advanceTaskWorkflowState(state, 'task-1', 'pre_check_passed');
		expect(state.taskStates.get('task-1')?.workflowState).toBe(
			'pre_check_passed',
		);

		// Try backward to coder_delegated
		bridge.advanceTaskWorkflowState(state, 'task-1', 'coder_delegated');
		expect(state.taskStates.get('task-1')?.workflowState).toBe(
			'pre_check_passed',
		);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Test 11: recordDelegation() appends to chain
	// ─────────────────────────────────────────────────────────────────────────
	test('recordDelegation() appends to chain', () => {
		const bridge = createStateBridge(tempDir, 'test-session');

		const state: MinimalSwarmState = {
			taskStates: new Map(),
			delegationChains: new Map(),
			toolCallCounts: new Map(),
			sessionId: 'test-session',
			cwd: tempDir,
		};

		// First delegation
		bridge.recordDelegation(state, 'user', 'coder');
		let chain = state.delegationChains.get('test-session');
		expect(chain?.length).toBe(1);
		expect(chain?.[0].from).toBe('user');
		expect(chain?.[0].to).toBe('coder');

		// Second delegation - should append
		bridge.recordDelegation(state, 'coder', 'reviewer');
		chain = state.delegationChains.get('test-session');
		expect(chain?.length).toBe(2);
		expect(chain?.[1].from).toBe('coder');
		expect(chain?.[1].to).toBe('reviewer');
		// Both entries should have timestamps
		expect(chain?.[0].timestamp).toBeGreaterThan(0);
		expect(chain?.[1].timestamp).toBeGreaterThan(0);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Test 12: createStateBridge() factory creates StateBridge instance
	// ─────────────────────────────────────────────────────────────────────────
	test('createStateBridge() factory creates StateBridge instance', () => {
		const bridge = createStateBridge(tempDir, 'factory-test-session');

		expect(bridge).toBeInstanceOf(StateBridge);

		// Verify it works
		const state = bridge.load();
		expect(state.sessionId).toBe('factory-test-session');
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Additional: Empty plan.json returns empty taskStates
	// ─────────────────────────────────────────────────────────────────────────
	test('load() handles empty plan.json gracefully', () => {
		const swarmDir = path.join(tempDir, '.swarm');
		createSwarmDir(swarmDir);

		// Write empty plan
		writeFileSync(
			path.join(swarmDir, 'plan.json'),
			JSON.stringify({ phases: [] }),
			'utf-8',
		);

		const bridge = createStateBridge(tempDir, 'test-session');
		const state = bridge.load();

		expect(state.taskStates.size).toBe(0);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Additional: save() preserves existing fields in state.json
	// ─────────────────────────────────────────────────────────────────────────
	test('save() preserves existing fields in state.json', () => {
		const swarmDir = path.join(tempDir, '.swarm');
		createSwarmDir(swarmDir);

		// Write existing state with extra fields
		const existing = {
			someOtherField: 'should be preserved',
			anotherField: { nested: 'value' },
			delegationChains: {},
			toolAggregates: {},
		};
		writeFileSync(
			path.join(swarmDir, 'session', 'state.json'),
			JSON.stringify(existing),
			'utf-8',
		);

		const bridge = createStateBridge(tempDir, 'test-session');

		const state: MinimalSwarmState = {
			taskStates: new Map(),
			delegationChains: new Map(),
			toolCallCounts: new Map([['TestTool', 5]]),
			sessionId: 'test-session',
			cwd: tempDir,
		};

		bridge.save(state);

		const saved = JSON.parse(
			readFileSync(path.join(swarmDir, 'session', 'state.json'), 'utf-8'),
		);

		expect(saved.someOtherField).toBe('should be preserved');
		expect(saved.anotherField.nested).toBe('value');
	});
});

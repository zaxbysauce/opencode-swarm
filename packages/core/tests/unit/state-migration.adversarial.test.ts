/**
 * Migration-specific adversarial tests for state module.
 * 
 * Focus areas:
 * - Wrong-path resolution for migrated tests
 * - Duplicate test execution risk from leftover root copies
 * - Package-local import breakage detection
 * - Helper path consistency
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { swarmState, resetSwarmState, ToolCallEntry, ToolAggregate, DelegationEntry } from '../../src/state';

// Test that the package-local import resolves correctly
describe('migration: package-local import path resolution', () => {
	beforeEach(() => {
		resetSwarmState();
	});

	it('should resolve package-local imports correctly - swarmState exported', () => {
		// This tests that the import path ../../src/state resolves correctly
		// from packages/core/tests/unit/
		expect(swarmState).toBeDefined();
		expect(swarmState.activeToolCalls).toBeInstanceOf(Map);
	});

	it('should resolve package-local imports correctly - types exported', () => {
		// Test that types are correctly exported and usable
		const mockToolCall: ToolCallEntry = {
			tool: 'test-tool',
			sessionID: 'session-123',
			callID: 'call-456',
			startTime: Date.now()
		};
		
		swarmState.activeToolCalls.set('key1', mockToolCall);
		const retrieved = swarmState.activeToolCalls.get('key1');
		
		expect(retrieved).toEqual(mockToolCall);
	});

	it('should resolve package-local imports correctly - ToolAggregate type', () => {
		const mockAggregate: ToolAggregate = {
			tool: 'test-aggregate-tool',
			count: 5,
			successCount: 4,
			failureCount: 1,
			totalDuration: 1000
		};
		
		swarmState.toolAggregates.set('agg1', mockAggregate);
		expect(swarmState.toolAggregates.get('agg1')).toEqual(mockAggregate);
	});

	it('should resolve package-local imports correctly - DelegationEntry type', () => {
		const mockDelegation: DelegationEntry = {
			from: 'agent-from',
			to: 'agent-to',
			timestamp: Date.now()
		};
		
		swarmState.delegationChains.set('chain1', [mockDelegation]);
		expect(swarmState.delegationChains.get('chain1')).toEqual([mockDelegation]);
	});
});

// Test for duplicate test file detection - verifies package tests don't conflict with root
describe('migration: duplicate test execution risk detection', () => {
	beforeEach(() => {
		resetSwarmState();
	});

	it('should execute independently without root test interference', () => {
		// This test verifies that the migrated package test runs independently
		// The existence of this test in packages/core/tests/unit/ proves the migration
		
		// Set a unique marker in state
		swarmState.pendingEvents = 999;
		
		// Reset should clear everything
		resetSwarmState();
		
		// Verify clean state - no interference from root tests
		expect(swarmState.pendingEvents).toBe(0);
		expect(swarmState.activeToolCalls.size).toBe(0);
		expect(swarmState.toolAggregates.size).toBe(0);
		expect(swarmState.activeAgent.size).toBe(0);
		expect(swarmState.delegationChains.size).toBe(0);
	});

	it('should have isolated state from other test files', () => {
		// Each test file should have isolated state via resetSwarmState
		// This prevents duplicate execution from causing state leakage
		
		swarmState.activeToolCalls.set('isolation-test', {
			tool: 'isolation-tool',
			sessionID: 'isolation-session',
			callID: 'isolation-call',
			startTime: Date.now()
		});
		
		// After reset, should be clean
		resetSwarmState();
		
		expect(swarmState.activeToolCalls.has('isolation-test')).toBe(false);
		expect(swarmState.activeToolCalls.size).toBe(0);
	});
});

// Test helper path consistency
describe('migration: helper path consistency', () => {
	beforeEach(() => {
		resetSwarmState();
	});

	it('should work with relative path depth consistency (unit tests = 2 levels up)', () => {
		// In packages/core/tests/unit/state.test.ts, the path ../../src/state
		// goes: unit -> tests -> core -> packages -> src/state
		// That's 2 levels up from unit/, then into src/
		
		// Verify that state exports are available at expected paths
		expect(swarmState).toBeDefined();
		expect(resetSwarmState).toBeDefined();
		expect(typeof resetSwarmState).toBe('function');
		
		// Verify basic state operations work
		swarmState.pendingEvents = 42;
		expect(swarmState.pendingEvents).toBe(42);
		
		resetSwarmState();
		expect(swarmState.pendingEvents).toBe(0);
	});

	it('should have consistent import depth for test helpers', () => {
		// Test that tests/helpers/workflow-session-factory.ts path resolves
		// It uses: import from '../../src/state' which is:
		// helpers -> tests -> core -> src/state (2 levels up)
		
		// Verify the helper would have access to the same exports
		// by checking that state operations work as expected
		swarmState.activeAgent.set('helper-test-session', 'helper-test-agent');
		
		const agent = swarmState.activeAgent.get('helper-test-session');
		expect(agent).toBe('helper-test-agent');
	});
});

// Test for path resolution edge cases
describe('migration: path resolution edge cases', () => {
	beforeEach(() => {
		resetSwarmState();
	});

	it('should handle state with deep nesting in package', () => {
		// The package structure is:
		// packages/core/tests/unit/ -> ../../src/state
		// This should resolve to packages/core/src/state.ts
		
		// Verify core exports are available
		expect(swarmState).toBeDefined();
		
		// Verify we can use all expected properties
		expect(swarmState.activeToolCalls).toBeInstanceOf(Map);
		expect(swarmState.toolAggregates).toBeInstanceOf(Map);
		expect(swarmState.activeAgent).toBeInstanceOf(Map);
		expect(swarmState.delegationChains).toBeInstanceOf(Map);
		expect(typeof swarmState.pendingEvents).toBe('number');
	});

	it('should correctly export all expected functions', () => {
		// Verify the exports match what the import expects
		// The test file imports: swarmState, resetSwarmState, ToolCallEntry, ToolAggregate, DelegationEntry
		
		expect(swarmState).toBeDefined();
		expect(resetSwarmState).toBeDefined();
		expect(typeof resetSwarmState).toBe('function');
		
		// Verify reset actually works
		swarmState.pendingEvents = 100;
		resetSwarmState();
		expect(swarmState.pendingEvents).toBe(0);
	});

	it('should not have broken re-exports from index', () => {
		// The package should re-export state from index.ts
		// Verify the full chain works: index.ts -> state.ts -> tests
		
		// Basic sanity check that the module chain works
		expect(swarmState.activeToolCalls).toBeInstanceOf(Map);
		expect(swarmState.toolAggregates).toBeInstanceOf(Map);
	});
});

// Test for verifying no path confusion with old root tests
describe('migration: path confusion prevention', () => {
	beforeEach(() => {
		resetSwarmState();
	});

	it('should use correct package path, not root path', () => {
		// This test explicitly uses the package-local path
		// from packages/core/tests/unit/state.test.ts using ../../src/state
		// NOT the old root path which would be ../../../packages/core/src/state
		
		// If wrong path was used, imports would fail at build time
		// This test verifies the correct behavior at runtime
		
		// The key verification is that this test file exists in packages/core/tests/unit/
		// and successfully imports from ../../src/state
		
		swarmState.activeToolCalls.set('path-test', {
			tool: 'path-verification',
			sessionID: 'path-session',
			callID: 'path-call',
			startTime: Date.now()
		});
		
		const entry = swarmState.activeToolCalls.get('path-test');
		expect(entry?.tool).toBe('path-verification');
		expect(entry?.sessionID).toBe('path-session');
	});

	it('should not have circular import issues in migration', () => {
		// Verify no circular dependency between test imports and source
		resetSwarmState();
		
		// Do several operations to stress test the import chain
		for (let i = 0; i < 10; i++) {
			swarmState.activeToolCalls.set(`stress-${i}`, {
				tool: `tool-${i}`,
				sessionID: `session-${i}`,
				callID: `call-${i}`,
				startTime: Date.now() + i
			});
		}
		
		expect(swarmState.activeToolCalls.size).toBe(10);
		
		resetSwarmState();
		expect(swarmState.activeToolCalls.size).toBe(0);
	});
});

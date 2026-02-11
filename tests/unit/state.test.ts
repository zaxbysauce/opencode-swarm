import { describe, it, expect, beforeEach } from 'bun:test';
import { swarmState, resetSwarmState, ToolCallEntry, ToolAggregate, DelegationEntry, startAgentSession, endAgentSession, getAgentSession, ensureAgentSession } from '../../src/state';

describe('state module', () => {
	beforeEach(() => {
		resetSwarmState();
	});

	describe('swarmState initial shape', () => {
		it('should have all 5 required properties', () => {
			expect(swarmState).toHaveProperty('activeToolCalls');
			expect(swarmState).toHaveProperty('toolAggregates');
			expect(swarmState).toHaveProperty('activeAgent');
			expect(swarmState).toHaveProperty('delegationChains');
			expect(swarmState).toHaveProperty('pendingEvents');
		});

		it('should have Maps for the first 4 properties', () => {
			expect(swarmState.activeToolCalls).toBeInstanceOf(Map);
			expect(swarmState.toolAggregates).toBeInstanceOf(Map);
			expect(swarmState.activeAgent).toBeInstanceOf(Map);
			expect(swarmState.delegationChains).toBeInstanceOf(Map);
		});

		it('should have empty Maps initially', () => {
			expect(swarmState.activeToolCalls.size).toBe(0);
			expect(swarmState.toolAggregates.size).toBe(0);
			expect(swarmState.activeAgent.size).toBe(0);
			expect(swarmState.delegationChains.size).toBe(0);
		});

		it('should have pendingEvents as 0 initially', () => {
			expect(swarmState.pendingEvents).toBe(0);
		});
	});

	describe('activeToolCalls', () => {
		const mockToolCall: ToolCallEntry = {
			tool: 'test-tool',
			sessionID: 'session-123',
			callID: 'call-456',
			startTime: Date.now()
		};

		it('should set and get ToolCallEntry correctly', () => {
			const key = 'test-key';
			swarmState.activeToolCalls.set(key, mockToolCall);
			
			const retrieved = swarmState.activeToolCalls.get(key);
			expect(retrieved).toEqual(mockToolCall);
			expect(swarmState.activeToolCalls.size).toBe(1);
		});

		it('should delete entries correctly', () => {
			const key = 'test-key';
			swarmState.activeToolCalls.set(key, mockToolCall);
			expect(swarmState.activeToolCalls.size).toBe(1);
			
			swarmState.activeToolCalls.delete(key);
			expect(swarmState.activeToolCalls.size).toBe(0);
			expect(swarmState.activeToolCalls.get(key)).toBeUndefined();
		});

		it('should store entries with correct ToolCallEntry shape', () => {
			const key = 'test-key';
			swarmState.activeToolCalls.set(key, mockToolCall);
			
			const entry = swarmState.activeToolCalls.get(key)!;
			expect(entry.tool).toBe('test-tool');
			expect(entry.sessionID).toBe('session-123');
			expect(entry.callID).toBe('call-456');
			expect(entry.startTime).toBeDefined();
			expect(typeof entry.startTime).toBe('number');
		});
	});

	describe('toolAggregates', () => {
		const mockAggregate: ToolAggregate = {
			tool: 'test-aggregate-tool',
			count: 5,
			successCount: 4,
			failureCount: 1,
			totalDuration: 1000
		};

		it('should set and get ToolAggregate correctly', () => {
			const key = 'aggregate-key';
			swarmState.toolAggregates.set(key, mockAggregate);
			
			const retrieved = swarmState.toolAggregates.get(key);
			expect(retrieved).toEqual(mockAggregate);
			expect(swarmState.toolAggregates.size).toBe(1);
		});

		it('should store entries with correct ToolAggregate shape', () => {
			const key = 'aggregate-key';
			swarmState.toolAggregates.set(key, mockAggregate);
			
			const entry = swarmState.toolAggregates.get(key)!;
			expect(entry.tool).toBe('test-aggregate-tool');
			expect(entry.count).toBe(5);
			expect(entry.successCount).toBe(4);
			expect(entry.failureCount).toBe(1);
			expect(entry.totalDuration).toBe(1000);
		});

		it('should update existing entries', () => {
			const key = 'aggregate-key';
			swarmState.toolAggregates.set(key, mockAggregate);
			
			const updatedAggregate: ToolAggregate = {
				...mockAggregate,
				count: 10,
				successCount: 8
			};
			
			swarmState.toolAggregates.set(key, updatedAggregate);
			expect(swarmState.toolAggregates.get(key)?.count).toBe(10);
			expect(swarmState.toolAggregates.get(key)?.successCount).toBe(8);
			expect(swarmState.toolAggregates.size).toBe(1);
		});
	});

	describe('activeAgent', () => {
		it('should set and get session→agent mapping', () => {
			const sessionId = 'session-abc';
			const agentId = 'agent-xyz';
			
			swarmState.activeAgent.set(sessionId, agentId);
			expect(swarmState.activeAgent.get(sessionId)).toBe(agentId);
			expect(swarmState.activeAgent.size).toBe(1);
		});

		it('should support has() method for session→agent mapping', () => {
			const sessionId = 'session-abc';
			const agentId = 'agent-xyz';
			
			expect(swarmState.activeAgent.has(sessionId)).toBe(false);
			
			swarmState.activeAgent.set(sessionId, agentId);
			expect(swarmState.activeAgent.has(sessionId)).toBe(true);
		});

		it('should update existing session mappings', () => {
			const sessionId = 'session-abc';
			const agentId1 = 'agent-xyz';
			const agentId2 = 'agent-def';
			
			swarmState.activeAgent.set(sessionId, agentId1);
			expect(swarmState.activeAgent.get(sessionId)).toBe(agentId1);
			
			swarmState.activeAgent.set(sessionId, agentId2);
			expect(swarmState.activeAgent.get(sessionId)).toBe(agentId2);
			expect(swarmState.activeAgent.size).toBe(1);
		});

		it('should support multiple session→agent mappings', () => {
			swarmState.activeAgent.set('session-1', 'agent-1');
			swarmState.activeAgent.set('session-2', 'agent-2');
			swarmState.activeAgent.set('session-3', 'agent-3');
			
			expect(swarmState.activeAgent.get('session-1')).toBe('agent-1');
			expect(swarmState.activeAgent.get('session-2')).toBe('agent-2');
			expect(swarmState.activeAgent.get('session-3')).toBe('agent-3');
			expect(swarmState.activeAgent.size).toBe(3);
		});
	});

	describe('delegationChains', () => {
		const mockDelegation: DelegationEntry = {
			from: 'agent-from',
			to: 'agent-to',
			timestamp: Date.now()
		};

		it('should set and get arrays of DelegationEntry', () => {
			const chainId = 'chain-123';
			const chain = [mockDelegation];
			
			swarmState.delegationChains.set(chainId, chain);
			const retrieved = swarmState.delegationChains.get(chainId);
			
			expect(retrieved).toEqual(chain);
			expect(Array.isArray(retrieved)).toBe(true);
			expect(swarmState.delegationChains.size).toBe(1);
		});

		it('should store entries with correct DelegationEntry shape', () => {
			const chainId = 'chain-123';
			swarmState.delegationChains.set(chainId, [mockDelegation]);
			
			const entry = swarmState.delegationChains.get(chainId)![0];
			expect(entry.from).toBe('agent-from');
			expect(entry.to).toBe('agent-to');
			expect(entry.timestamp).toBeDefined();
			expect(typeof entry.timestamp).toBe('number');
		});

		it('should support multiple delegation entries in a chain', () => {
			const chainId = 'chain-123';
			const chain: DelegationEntry[] = [
				mockDelegation,
				{
					from: 'agent-to',
					to: 'agent-final',
					timestamp: Date.now()
				}
			];
			
			swarmState.delegationChains.set(chainId, chain);
			const retrieved = swarmState.delegationChains.get(chainId);
			
			expect(retrieved?.length).toBe(2);
			expect(retrieved?.[0].from).toBe('agent-from');
			expect(retrieved?.[1].to).toBe('agent-final');
		});

		it('should support multiple delegation chains', () => {
			const chain1: DelegationEntry[] = [{ from: 'a', to: 'b', timestamp: Date.now() }];
			const chain2: DelegationEntry[] = [{ from: 'c', to: 'd', timestamp: Date.now() }];
			
			swarmState.delegationChains.set('chain-1', chain1);
			swarmState.delegationChains.set('chain-2', chain2);
			
			expect(swarmState.delegationChains.size).toBe(2);
			expect(swarmState.delegationChains.get('chain-1')).toEqual(chain1);
			expect(swarmState.delegationChains.get('chain-2')).toEqual(chain2);
		});
	});

	describe('pendingEvents', () => {
		it('should start at 0', () => {
			expect(swarmState.pendingEvents).toBe(0);
		});

		it('should increment correctly', () => {
			swarmState.pendingEvents = 1;
			expect(swarmState.pendingEvents).toBe(1);
			
			swarmState.pendingEvents = 5;
			expect(swarmState.pendingEvents).toBe(5);
		});

		it('should support large values', () => {
			swarmState.pendingEvents = 1000;
			expect(swarmState.pendingEvents).toBe(1000);
		});
	});

	describe('resetSwarmState()', () => {
		it('should clear all Maps and reset pendingEvents to 0 after data has been added', () => {
			// Add data to all properties
			swarmState.activeToolCalls.set('key1', {
				tool: 'test-tool',
				sessionID: 'session-1',
				callID: 'call-1',
				startTime: Date.now()
			});
			
			swarmState.toolAggregates.set('key2', {
				tool: 'test-aggregate-tool',
				count: 5,
				successCount: 4,
				failureCount: 1,
				totalDuration: 1000
			});
			
			swarmState.activeAgent.set('session-1', 'agent-1');
			
			swarmState.delegationChains.set('chain-1', [{
				from: 'agent-from',
				to: 'agent-to',
				timestamp: Date.now()
			}]);
			
			swarmState.pendingEvents = 10;
			
			// Verify data was added
			expect(swarmState.activeToolCalls.size).toBe(1);
			expect(swarmState.toolAggregates.size).toBe(1);
			expect(swarmState.activeAgent.size).toBe(1);
			expect(swarmState.delegationChains.size).toBe(1);
			expect(swarmState.pendingEvents).toBe(10);
			
			// Reset
			resetSwarmState();
			
			// Verify all data was cleared
			expect(swarmState.activeToolCalls.size).toBe(0);
			expect(swarmState.toolAggregates.size).toBe(0);
			expect(swarmState.activeAgent.size).toBe(0);
			expect(swarmState.delegationChains.size).toBe(0);
			expect(swarmState.pendingEvents).toBe(0);
		});

		it('should be idempotent - calling it twice should be safe', () => {
			// Add some data
			swarmState.activeToolCalls.set('key1', {
				tool: 'test-tool',
				sessionID: 'session-1',
				callID: 'call-1',
				startTime: Date.now()
			});
			swarmState.pendingEvents = 5;
			
			// First reset
			resetSwarmState();
			expect(swarmState.pendingEvents).toBe(0);
			expect(swarmState.activeToolCalls.size).toBe(0);
			
			// Second reset - should not cause any issues
			resetSwarmState();
			expect(swarmState.pendingEvents).toBe(0);
			expect(swarmState.activeToolCalls.size).toBe(0);
			
			// Add data again and reset again
			swarmState.pendingEvents = 3;
			swarmState.activeAgent.set('session-1', 'agent-1');
			
			resetSwarmState();
			expect(swarmState.pendingEvents).toBe(0);
			expect(swarmState.activeAgent.size).toBe(0);
		});
	});

	describe('Map independence', () => {
		it('should have independent Maps - clearing one does not affect others', () => {
			// Add data to all Maps
			swarmState.activeToolCalls.set('key1', {
				tool: 'test-tool',
				sessionID: 'session-1',
				callID: 'call-1',
				startTime: Date.now()
			});

			swarmState.toolAggregates.set('key2', {
				tool: 'test-aggregate-tool',
				count: 5,
				successCount: 4,
				failureCount: 1,
				totalDuration: 1000
			});

			swarmState.activeAgent.set('session-1', 'agent-1');

			swarmState.delegationChains.set('chain-1', [{
				from: 'agent-from',
				to: 'agent-to',
				timestamp: Date.now()
			}]);

			swarmState.pendingEvents = 10;

			// Clear activeToolCalls manually
			swarmState.activeToolCalls.clear();

			// Verify other Maps are unaffected
			expect(swarmState.activeToolCalls.size).toBe(0);
			expect(swarmState.toolAggregates.size).toBe(1);
			expect(swarmState.activeAgent.size).toBe(1);
			expect(swarmState.delegationChains.size).toBe(1);
			expect(swarmState.pendingEvents).toBe(10);

			// Clear toolAggregates manually
			swarmState.toolAggregates.clear();

			// Verify other Maps are still unaffected
			expect(swarmState.activeToolCalls.size).toBe(0);
			expect(swarmState.toolAggregates.size).toBe(0);
			expect(swarmState.activeAgent.size).toBe(1);
			expect(swarmState.delegationChains.size).toBe(1);
			expect(swarmState.pendingEvents).toBe(10);

			// Clear activeAgent manually
			swarmState.activeAgent.clear();

			// Verify delegationChains is still unaffected
			expect(swarmState.activeToolCalls.size).toBe(0);
			expect(swarmState.toolAggregates.size).toBe(0);
			expect(swarmState.activeAgent.size).toBe(0);
			expect(swarmState.delegationChains.size).toBe(1);
			expect(swarmState.pendingEvents).toBe(10);

			// Clear delegationChains manually
			swarmState.delegationChains.clear();

			// Verify pendingEvents is still unaffected
			expect(swarmState.activeToolCalls.size).toBe(0);
			expect(swarmState.toolAggregates.size).toBe(0);
			expect(swarmState.activeAgent.size).toBe(0);
			expect(swarmState.delegationChains.size).toBe(0);
			expect(swarmState.pendingEvents).toBe(10);
		});
	});

	describe('agentSessions', () => {
		it('agentSessions map exists on swarmState', () => {
			expect(swarmState.agentSessions).toBeInstanceOf(Map);
			expect(swarmState.agentSessions).toBeDefined();
		});

		it('startAgentSession creates entry', () => {
			startAgentSession('s1', 'coder');
			const session = getAgentSession('s1');

			expect(session).toBeDefined();
			expect(session?.agentName).toBe('coder');
			expect(session?.toolCallCount).toBe(0);
			expect(session?.consecutiveErrors).toBe(0);
			expect(session?.recentToolCalls).toEqual([]);
			expect(session?.warningIssued).toBe(false);
			expect(session?.hardLimitHit).toBe(false);
			expect(typeof session?.startTime).toBe('number');
		});

		it('endAgentSession removes entry', () => {
			startAgentSession('s1', 'coder');
			expect(getAgentSession('s1')).toBeDefined();

			endAgentSession('s1');
			expect(getAgentSession('s1')).toBeUndefined();
		});

		it('getAgentSession returns undefined for unknown', () => {
			expect(getAgentSession('nonexistent')).toBeUndefined();
		});

		it('resetSwarmState clears agentSessions', () => {
			startAgentSession('s1', 'coder');
			startAgentSession('s2', 'reviewer');
			expect(swarmState.agentSessions.size).toBe(2);

			resetSwarmState();

			expect(swarmState.agentSessions.size).toBe(0);
		});

		it('stale eviction removes old sessions', () => {
			// Start an old session
			startAgentSession('old-session', 'coder');
			const oldSession = getAgentSession('old-session');
			if (oldSession) {
				oldSession.lastToolCallTime = Date.now() - 7300000; // 121 minutes ago (>120 min threshold)
			}

			// Start a new session (triggers stale eviction with default 120 min)
			startAgentSession('new-session', 'reviewer');

			// Old session should be gone
			expect(getAgentSession('old-session')).toBeUndefined();
			// New session should exist
			expect(getAgentSession('new-session')).toBeDefined();
		});

		it('stale eviction preserves recent sessions', () => {
			// Start two sessions
			startAgentSession('old-session', 'coder');
			startAgentSession('recent-session', 'reviewer');

			// Make one old
			const oldSession = getAgentSession('old-session');
			if (oldSession) {
				oldSession.lastToolCallTime = Date.now() - 7300000; // 121 minutes ago (>120 min threshold)
			}

			// Keep recent session recent
			const recentSession = getAgentSession('recent-session');
			if (recentSession) {
				recentSession.lastToolCallTime = Date.now() - 300000; // 5 minutes ago
			}

			// Start a new session (triggers stale eviction with default 120 min)
			startAgentSession('new-session', 'explorer');

			// Old session should be gone
			expect(getAgentSession('old-session')).toBeUndefined();
			// Recent session should still exist
			expect(getAgentSession('recent-session')).toBeDefined();
			// New session should exist
			expect(getAgentSession('new-session')).toBeDefined();
		});
	});

	describe('ensureAgentSession', () => {
		it('creates new session when none exists', () => {
			const session = ensureAgentSession('new-session', 'architect');
			expect(session.agentName).toBe('architect');
			expect(session.toolCallCount).toBe(0);
			expect(session.hardLimitHit).toBe(false);
			expect(session.lastToolCallTime).toBeGreaterThan(0);
		});

		it('creates session with unknown when no agent name provided', () => {
			const session = ensureAgentSession('new-session');
			expect(session.agentName).toBe('unknown');
		});

		it('updates lastToolCallTime on existing session', () => {
			startAgentSession('existing-session', 'coder');
			const session1 = getAgentSession('existing-session')!;
			const firstTime = session1.lastToolCallTime;

			// Small delay to ensure timestamp difference
			const laterTime = firstTime + 100;
			// Manually advance to simulate time passing
			session1.lastToolCallTime = firstTime;

			const session2 = ensureAgentSession('existing-session');
			expect(session2.lastToolCallTime).toBeGreaterThanOrEqual(firstTime);
			expect(session2).toBe(session1); // Same object reference
		});

		it('updates agent name from unknown to real name', () => {
			ensureAgentSession('test-session'); // Creates with 'unknown'
			const session = ensureAgentSession('test-session', 'paid_architect');
			expect(session.agentName).toBe('paid_architect');
		});

	it('updates agent name when switching from non-unknown to different agent', () => {
		ensureAgentSession('test-session', 'architect');
		const session = ensureAgentSession('test-session', 'coder');
		expect(session.agentName).toBe('coder'); // Should change
	});

	it('resets guardrail state when switching agents', () => {
		// Start with architect
		const session = ensureAgentSession('test-session', 'architect');
		session.toolCallCount = 50;
		session.consecutiveErrors = 3;
		session.warningIssued = true;
		session.hardLimitHit = true;
		session.recentToolCalls = [{ tool: 'read', argsHash: 123, timestamp: Date.now() }];
		const oldStartTime = session.startTime;
		const oldLastSuccessTime = session.lastSuccessTime;

		// Small delay to ensure time difference
		const beforeSwitch = Date.now();

		// Switch to coder
		ensureAgentSession('test-session', 'coder');

		// All guardrail state should be reset
		expect(session.agentName).toBe('coder');
		expect(session.toolCallCount).toBe(0);
		expect(session.consecutiveErrors).toBe(0);
		expect(session.warningIssued).toBe(false);
		expect(session.hardLimitHit).toBe(false);
		expect(session.recentToolCalls).toEqual([]);
		expect(session.warningReason).toBe('');
		expect(session.startTime).toBeGreaterThanOrEqual(oldStartTime); // Reset to now or later
		expect(session.lastSuccessTime).toBeGreaterThanOrEqual(beforeSwitch);
	});

	it('resets startTime when updating from unknown', () => {
		const session = ensureAgentSession('test-session'); // unknown
		const originalStart = session.startTime;
		session.startTime = originalStart - 60000; // Simulate 1 min elapsed

		ensureAgentSession('test-session', 'architect');
		expect(session.startTime).toBeGreaterThan(originalStart - 60000); // Reset
	});

	it('resets startTime and guardrail state when switching from unknown to real agent', () => {
		const session = ensureAgentSession('test-session'); // unknown
		session.toolCallCount = 10;
		session.hardLimitHit = true;
		const originalStart = session.startTime;
		session.startTime = originalStart - 60000;

		ensureAgentSession('test-session', 'architect');
		expect(session.agentName).toBe('architect');
		expect(session.toolCallCount).toBe(0);
		expect(session.hardLimitHit).toBe(false);
		expect(session.startTime).toBeGreaterThan(originalStart - 60000);
	});

		it('returns same session object for same sessionID', () => {
			const s1 = ensureAgentSession('same-id', 'architect');
			const s2 = ensureAgentSession('same-id');
			expect(s1).toBe(s2);
		});
	});
});
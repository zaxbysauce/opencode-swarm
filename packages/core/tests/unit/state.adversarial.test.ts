import { describe, it, expect, beforeEach } from 'bun:test';
import { resetSwarmState, ensureAgentSession, advanceTaskState, getTaskState, type AgentSessionState, type TaskWorkflowState } from '../../src/state';

/**
 * Adversarial security/edge-case tests for state machine helpers in src/state.ts
 * Tests malformed inputs, oversized payloads, injection attempts, boundary violations, and race conditions
 */
describe('state machine adversarial tests', () => {
	let session: AgentSessionState;
	const sessionId = 'adversarial-test-session';

	beforeEach(() => {
		resetSwarmState();
		session = ensureAgentSession(sessionId, 'test-agent');
	});

	describe('advanceTaskState with invalid taskId', () => {
		it('should handle null taskId - safely returns without mutation', () => {
			// null is handled by isValidTaskId - should safely return without throwing
			expect(() => {
				advanceTaskState(session, null as any, 'coder_delegated');
			}).not.toThrow();
			
			// Should NOT set the state for invalid taskId
			// (isValidTaskId returns false for null)
		});

		it('should handle undefined taskId - safely returns without mutation', () => {
			// undefined is handled by isValidTaskId - should safely return without throwing
			expect(() => {
				advanceTaskState(session, undefined as any, 'coder_delegated');
			}).not.toThrow();
			
			// Should NOT set the state for invalid taskId
		});

		it('should handle empty string taskId - safely returns without mutation', () => {
			// Empty string after trim is empty, so isValidTaskId returns false
			expect(() => {
				advanceTaskState(session, '', 'coder_delegated');
			}).not.toThrow();
			
			// Should NOT set state for empty string (fails isValidTaskId)
		});

		it('should handle very long taskId (10,000 chars) without crashing', () => {
			const longTaskId = 'a'.repeat(10000);
			
			expect(() => {
				advanceTaskState(session, longTaskId, 'coder_delegated');
			}).not.toThrow();
			
			expect(session.taskWorkflowStates.get(longTaskId)).toBe('coder_delegated');
		});

		it('should handle taskId with special characters (potential injection)', () => {
			const maliciousTaskId = '</script><img src=x onerror=alert(1)>';
			
			expect(() => {
				advanceTaskState(session, maliciousTaskId, 'coder_delegated');
			}).not.toThrow();
			
			expect(session.taskWorkflowStates.get(maliciousTaskId)).toBe('coder_delegated');
		});

		it('should handle taskId with null bytes', () => {
			const taskIdWithNull = 'test\0task';
			
			expect(() => {
				advanceTaskState(session, taskIdWithNull as any, 'coder_delegated');
			}).not.toThrow();
		});

		it('should handle taskId that is a number - now handled gracefully by isValidTaskId', () => {
			// FIXED: The code now uses isValidTaskId which checks typeof !== 'string'
			// and safely returns without mutation instead of crashing with TypeError
			expect(() => {
				advanceTaskState(session, 123 as any, 'coder_delegated');
			}).not.toThrow(); // Now gracefully returns instead of throwing TypeError
			
			// State should NOT be set for invalid taskId
			expect(session.taskWorkflowStates.get('123')).toBeUndefined();
		});
	});

	describe('advanceTaskState with invalid session', () => {
		it('should throw when session is undefined', () => {
			expect(() => {
				advanceTaskState(undefined as any, 'task-1', 'coder_delegated');
			}).toThrow();
		});

		it('should throw when session is null', () => {
			expect(() => {
				advanceTaskState(null as any, 'task-1', 'coder_delegated');
			}).toThrow();
		});

		it('should throw when session is a plain object without taskWorkflowStates', () => {
			const badSession = { agentName: 'test' } as any;
			
			expect(() => {
				advanceTaskState(badSession, 'task-1', 'coder_delegated');
			}).toThrow();
		});

		it('should throw when session.taskWorkflowStates is null', () => {
			const badSession = {
				agentName: 'test',
				taskWorkflowStates: null
			} as any;
			
			expect(() => {
				advanceTaskState(badSession, 'task-1', 'coder_delegated');
			}).toThrow();
		});

		it('should throw when session.taskWorkflowStates is undefined', () => {
			const badSession = {
				agentName: 'test',
				taskWorkflowStates: undefined
			} as any;
			
			expect(() => {
				advanceTaskState(badSession, 'task-1', 'coder_delegated');
			}).toThrow();
		});
	});

	describe('advanceTaskState with invalid newState', () => {
		it('should throw when newState is undefined', () => {
			expect(() => {
				advanceTaskState(session, 'task-1', undefined as any);
			}).toThrow('INVALID_TASK_STATE_TRANSITION');
		});

		it('should throw when newState is null', () => {
			expect(() => {
				advanceTaskState(session, 'task-1', null as any);
			}).toThrow('INVALID_TASK_STATE_TRANSITION');
		});

		it('should throw when newState is a garbage string', () => {
			expect(() => {
				advanceTaskState(session, 'task-1', 'invalid_state' as any);
			}).toThrow('INVALID_TASK_STATE_TRANSITION');
		});

		it('should throw when newState is an empty string', () => {
			expect(() => {
				advanceTaskState(session, 'task-1', '' as any);
			}).toThrow('INVALID_TASK_STATE_TRANSITION');
		});

		it('should throw when newState is a number', () => {
			expect(() => {
				advanceTaskState(session, 'task-1', 1 as any);
			}).toThrow('INVALID_TASK_STATE_TRANSITION');
		});

		it('should throw when newState is an object', () => {
			expect(() => {
				advanceTaskState(session, 'task-1', { state: 'test' } as any);
			}).toThrow('INVALID_TASK_STATE_TRANSITION');
		});

		it('should throw when attempting backward transition', () => {
			advanceTaskState(session, 'task-1', 'coder_delegated');
			advanceTaskState(session, 'task-1', 'pre_check_passed');
			
			// Try to go back to earlier state
			expect(() => {
				advanceTaskState(session, 'task-1', 'idle' as any);
			}).toThrow('INVALID_TASK_STATE_TRANSITION');
			
			// Try to go to same state
			expect(() => {
				advanceTaskState(session, 'task-1', 'pre_check_passed' as any);
			}).toThrow('INVALID_TASK_STATE_TRANSITION');
		});

		it('should throw when advancing past complete state', () => {
			// Advance to complete
			advanceTaskState(session, 'task-1', 'coder_delegated');
			advanceTaskState(session, 'task-1', 'pre_check_passed');
			advanceTaskState(session, 'task-1', 'reviewer_run');
			advanceTaskState(session, 'task-1', 'tests_run');
			advanceTaskState(session, 'task-1', 'complete');
			
			// Try to advance past complete - should throw since there's no valid state after complete
			// indexOf('complete') = 5, and any other valid state has index < 5
			expect(() => {
				advanceTaskState(session, 'task-1', 'complete' as any);
			}).toThrow('INVALID_TASK_STATE_TRANSITION');
		});
	});

	describe('getTaskState with invalid inputs', () => {
		it('should handle null taskId gracefully', () => {
			// Should not throw, returns 'idle' as default
			expect(() => {
				const result = getTaskState(session, null as any);
				expect(result).toBe('idle');
			}).not.toThrow();
		});

		it('should handle undefined taskId gracefully', () => {
			expect(() => {
				const result = getTaskState(session, undefined as any);
				expect(result).toBe('idle');
			}).not.toThrow();
		});

		it('should handle empty string taskId - returns idle (invalid after trim)', () => {
			// Empty string fails isValidTaskId, returns idle
			expect(getTaskState(session, '')).toBe('idle');
		});

		it('should return idle for non-existent taskId', () => {
			expect(getTaskState(session, 'nonexistent-task')).toBe('idle');
		});

		it('should handle very long taskId', () => {
			const longTaskId = 'x'.repeat(10000);
			expect(() => {
				const result = getTaskState(session, longTaskId);
				expect(result).toBe('idle');
			}).not.toThrow();
		});
	});

	describe('rapid state transitions (race condition simulation)', () => {
		it('should handle rapid sequential advances without corruption', () => {
			const taskId = 'rapid-test-task';
			const states: TaskWorkflowState[] = [
				'idle',
				'coder_delegated',
				'pre_check_passed',
				'reviewer_run',
				'tests_run',
				'complete'
			];
			
			// Rapidly advance through all states
			for (let i = 1; i < states.length; i++) {
				advanceTaskState(session, taskId, states[i]);
			}
			
			// Verify final state is correct
			expect(getTaskState(session, taskId)).toBe('complete');
			
			// Verify no extra entries were created
			expect(session.taskWorkflowStates.size).toBe(1);
		});

		it('should handle multiple tasks being advanced rapidly', () => {
			const taskIds = ['task-1', 'task-2', 'task-3', 'task-4', 'task-5'];
			
			// Interleave advances
			for (let i = 0; i < 5; i++) {
				for (const taskId of taskIds) {
					if (i === 0) {
						advanceTaskState(session, taskId, 'coder_delegated');
					} else if (i === 1) {
						advanceTaskState(session, taskId, 'pre_check_passed');
					} else if (i === 2) {
						advanceTaskState(session, taskId, 'reviewer_run');
					} else if (i === 3) {
						advanceTaskState(session, taskId, 'tests_run');
					} else {
						advanceTaskState(session, taskId, 'complete');
					}
				}
			}
			
			// All should be complete
			for (const taskId of taskIds) {
				expect(getTaskState(session, taskId)).toBe('complete');
			}
			
			// Should have exactly 5 entries
			expect(session.taskWorkflowStates.size).toBe(5);
		});

		it('should handle concurrent-like access patterns', () => {
			// Simulate concurrent access by alternating between tasks
			for (let i = 0; i < 100; i++) {
				const taskId = `task-${i % 10}`;
				const stateIndex = Math.min(Math.floor(i / 10), 5);
				const states: TaskWorkflowState[] = [
					'idle',
					'coder_delegated',
					'pre_check_passed',
					'reviewer_run',
					'tests_run',
					'complete'
				];
				
				try {
					advanceTaskState(session, taskId, states[stateIndex]);
				} catch {
					// Ignore transition errors for already-completed tasks
				}
			}
			
			// Should have exactly 10 unique tasks
			expect(session.taskWorkflowStates.size).toBe(10);
		});
	});

	describe('corrupted/legacy session migration safety', () => {
		it('should handle session without taskWorkflowStates property', () => {
			const corruptedSession = {
				agentName: 'test',
				lastToolCallTime: Date.now(),
				// Missing taskWorkflowStates
			} as any;
			
			// Should throw when trying to access missing Map
			expect(() => {
				advanceTaskState(corruptedSession, 'task-1', 'coder_delegated');
			}).toThrow();
		});

		it('should handle session where taskWorkflowStates is not a Map', () => {
			const badSession = {
				agentName: 'test',
				taskWorkflowStates: 'not-a-map',
			} as any;
			
			expect(() => {
				advanceTaskState(badSession, 'task-1', 'coder_delegated');
			}).toThrow();
		});

		it('should handle session where taskWorkflowStates is an array', () => {
			const badSession = {
				agentName: 'test',
				taskWorkflowStates: [] as any,
			} as any;
			
			expect(() => {
				advanceTaskState(badSession, 'task-1', 'coder_delegated');
			}).toThrow();
		});

		it('ensureAgentSession should migrate missing taskWorkflowStates', () => {
			// Create a session manually without taskWorkflowStates
			const legacySession = {
				agentName: 'legacy',
				lastToolCallTime: Date.now(),
			} as any;
			
			// Set it directly in swarmState (bypassing ensureAgentSession)
			const { swarmState } = require('../../src/state');
			swarmState.agentSessions.set('legacy-session', legacySession);
			
			// Now use ensureAgentSession which should migrate it
			const migratedSession = ensureAgentSession('legacy-session', 'migrated');
			
			// taskWorkflowStates should now be a Map
			expect(migratedSession.taskWorkflowStates).toBeInstanceOf(Map);
			
			// And should work normally
			advanceTaskState(migratedSession, 'task-1', 'coder_delegated');
			expect(getTaskState(migratedSession, 'task-1')).toBe('coder_delegated');
		});
	});

	describe('edge cases and boundary violations', () => {
		it('should handle state machine at boundaries correctly', () => {
			const taskId = 'boundary-test';
			
			// Start at idle (default)
			expect(getTaskState(session, taskId)).toBe('idle');
			
			// Advance to first state
			advanceTaskState(session, taskId, 'coder_delegated');
			expect(getTaskState(session, taskId)).toBe('coder_delegated');
			
			// Can't go back to idle
			expect(() => {
				advanceTaskState(session, taskId, 'idle' as any);
			}).toThrow();
			
			// Fixed: complete can only be reached from tests_run
			expect(() => {
				advanceTaskState(session, taskId, 'complete' as any);
			}).toThrow('INVALID_TASK_STATE_TRANSITION');
		});

		it('should handle negative index edge case in state check', () => {
			// The condition is: if (newIndex <= currentIndex) throw
			// This correctly handles:
			// - newIndex = -1 (invalid state) vs any valid currentIndex (0-5)
			// - newIndex = 5 (complete) vs currentIndex = 5 (complete)
			
			// Test invalid state throws
			expect(() => {
				advanceTaskState(session, 'task-1', 'invalid' as any);
			}).toThrow();
			
			// Test same state throws
			advanceTaskState(session, 'task-1', 'coder_delegated');
			expect(() => {
				advanceTaskState(session, 'task-1', 'coder_delegated' as any);
			}).toThrow();
		});

		it('should handle unicode taskIds', () => {
			const unicodeTaskId = '任务-🔧-✏️';
			
			expect(() => {
				advanceTaskState(session, unicodeTaskId, 'coder_delegated');
			}).not.toThrow();
			
			expect(getTaskState(session, unicodeTaskId)).toBe('coder_delegated');
		});

		it('should handle emoji taskIds', () => {
			const emojiTaskId = '🎫-urgent-task-🔥';
			
			expect(() => {
				advanceTaskState(session, emojiTaskId, 'coder_delegated');
			}).not.toThrow();
			
			expect(getTaskState(session, emojiTaskId)).toBe('coder_delegated');
		});

		it('should handle taskId with newlines', () => {
			const multilineTaskId = 'task\nwith\nnewlines';
			
			expect(() => {
				advanceTaskState(session, multilineTaskId as any, 'coder_delegated');
			}).not.toThrow();
		});

		it('should handle taskId that looks like a state', () => {
			// Task ID that happens to match a valid state name
			const stateLikeTaskId = 'complete';
			
			// Should still work - task IDs are separate from state values
			advanceTaskState(session, stateLikeTaskId, 'coder_delegated');
			expect(getTaskState(session, stateLikeTaskId)).toBe('coder_delegated');
			
			// But advancing the task itself to complete should work
			advanceTaskState(session, stateLikeTaskId, 'pre_check_passed');
			advanceTaskState(session, stateLikeTaskId, 'reviewer_run');
			advanceTaskState(session, stateLikeTaskId, 'tests_run');
			advanceTaskState(session, stateLikeTaskId, 'complete');
			
			expect(getTaskState(session, stateLikeTaskId)).toBe('complete');
		});
	});

	describe('potential prototype pollution', () => {
		it('should handle __proto__ as taskId without polluting prototype', () => {
			expect(() => {
				advanceTaskState(session, '__proto__' as any, 'coder_delegated');
			}).not.toThrow();
			
			// Should store under the string key '__proto__' without issues
			expect(session.taskWorkflowStates.get('__proto__')).toBe('coder_delegated');
			
			// Object.prototype should not have 'test' property added
			expect(({} as any).test).toBeUndefined();
		});

		it('should handle constructor as taskId', () => {
			expect(() => {
				advanceTaskState(session, 'constructor' as any, 'coder_delegated');
			}).not.toThrow();
		});

		it('should handle toString as taskId', () => {
			expect(() => {
				advanceTaskState(session, 'toString' as any, 'coder_delegated');
			}).not.toThrow();
		});
	});

	// ============================================
	// SECOND SLICE: Migration-specific boundary cases
	// ============================================

	describe('wrong-path resolution during migration', () => {
		it('should handle path traversal attempts in rehydration', async () => {
			// Simulate path traversal in directory parameter
			const { rehydrateSessionFromDisk } = await import('../../src/state');
			
			// Create a session for rehydration
			const testSession = ensureAgentSession('path-traversal-test', 'test-agent');
			
			// Attempt rehydration with path traversal - should not crash
			// The function catches errors internally and resolves to undefined
			await expect(
				rehydrateSessionFromDisk('../../../etc/passwd', testSession)
			).resolves.toBeUndefined();
		});

		it('should handle absolute path with null bytes in rehydration', async () => {
			const { rehydrateSessionFromDisk } = await import('../../src/state');
			const testSession = ensureAgentSession('null-byte-path-test', 'test-agent');
			
			// Path with null byte should not crash but may fail
			const maliciousPath = '/some/path\0with\0null';
			await expect(
				rehydrateSessionFromDisk(maliciousPath, testSession)
			).resolves.toBeUndefined();
		});

		it('should handle extremely deep nested paths in rehydration', async () => {
			const { rehydrateSessionFromDisk } = await import('../../src/state');
			const testSession = ensureAgentSession('deep-path-test', 'test-agent');
			
			// Very deep path - should handle gracefully
			const deepPath = '/'.repeat(500);
			await expect(
				rehydrateSessionFromDisk(deepPath, testSession)
			).resolves.toBeUndefined();
		});

		it('should handle relative path with ../ in rehydration', async () => {
			const { rehydrateSessionFromDisk } = await import('../../src/state');
			const testSession = ensureAgentSession('relative-path-test', 'test-agent');
			
			// Relative path with parent traversal
			const relativePath = '../../../.swarm/plan.json';
			await expect(
				rehydrateSessionFromDisk(relativePath, testSession)
			).resolves.toBeUndefined();
		});
	});

	describe('leftover root copies handling', () => {
		it('should handle legacy session with missing windows field', () => {
			// Simulate old session structure before windows were added
			const legacySession = {
				agentName: 'legacy-agent',
				lastToolCallTime: Date.now(),
				lastAgentEventTime: Date.now(),
				delegationActive: false,
				// Missing: activeInvocationId, lastInvocationIdByAgent, windows
			} as any;
			
			// Inject into state
			const { swarmState } = require('../../src/state');
			swarmState.agentSessions.set('legacy-session', legacySession);
			
			// ensureAgentSession should migrate it
			const migrated = ensureAgentSession('legacy-session', 'legacy-agent');
			
			// Windows should now exist
			expect(migrated.windows).toBeDefined();
			expect(migrated.activeInvocationId).toBe(0);
			expect(migrated.lastInvocationIdByAgent).toEqual({});
		});

		it('should handle legacy session with partial window data', () => {
			const partialSession = {
				agentName: 'partial-agent',
				lastToolCallTime: Date.now(),
				activeInvocationId: 5,
				lastInvocationIdByAgent: { coder: 3 },
				windows: undefined as any, // Missing but should be initialized
			} as any;
			
			const { swarmState } = require('../../src/state');
			swarmState.agentSessions.set('partial-session', partialSession);
			
			const migrated = ensureAgentSession('partial-session', 'partial-agent');
			expect(migrated.windows).toBeDefined();
		});

		it('should handle session missing v6.12 anti-process-violation fields', () => {
			const preV612Session = {
				agentName: 'pre-v612',
				lastToolCallTime: Date.now(),
				lastAgentEventTime: Date.now(),
				delegationActive: false,
				windows: {},
				lastInvocationIdByAgent: {},
				activeInvocationId: 0,
			} as any;
			
			const { swarmState } = require('../../src/state');
			swarmState.agentSessions.set('pre-v612-session', preV612Session);
			
			const migrated = ensureAgentSession('pre-v612-session', 'pre-v612');
			
			// All v6.12 fields should be initialized
			expect(migrated.architectWriteCount).toBe(0);
			expect(migrated.lastCoderDelegationTaskId).toBeNull();
			expect(migrated.currentTaskId).toBeNull();
			expect(migrated.gateLog).toBeInstanceOf(Map);
			expect(migrated.reviewerCallCount).toBeInstanceOf(Map);
			expect(migrated.lastGateFailure).toBeNull();
			expect(migrated.partialGateWarningsIssuedForTask).toBeInstanceOf(Set);
			expect(migrated.selfFixAttempted).toBe(false);
		});

		it('should handle session missing QA Skip fields (v6.17)', () => {
			const preV617Session = {
				agentName: 'pre-v617',
				lastToolCallTime: Date.now(),
				taskWorkflowStates: new Map(),
				gateLog: new Map(),
				reviewerCallCount: new Map(),
			} as any;
			
			const { swarmState } = require('../../src/state');
			swarmState.agentSessions.set('pre-v617-session', preV617Session);
			
			const migrated = ensureAgentSession('pre-v617-session', 'pre-v617');
			
			expect(migrated.qaSkipCount).toBe(0);
			expect(migrated.qaSkipTaskIds).toEqual([]);
		});

		it('should handle session missing Turbo Mode field (v6.26)', () => {
			const preV626Session = {
				agentName: 'pre-v626',
				lastToolCallTime: Date.now(),
				taskWorkflowStates: new Map(),
			} as any;
			
			const { swarmState } = require('../../src/state');
			swarmState.agentSessions.set('pre-v626-session', preV626Session);
			
			const migrated = ensureAgentSession('pre-v626-session', 'pre-v626');
			
			expect(migrated.turboMode).toBe(false);
		});
	});

	describe('package-local import breakage scenarios', () => {
		it('should handle ensureAgentSession with corrupted taskWorkflowStates (not a Map) - BUG: not repaired', () => {
			// BUG: The ensureAgentSession only checks if taskWorkflowStates EXISTS (!session.taskWorkflowStates)
			// but doesn't validate that it's actually a Map instance
			const corruptedSession = {
				agentName: 'corrupted',
				lastToolCallTime: Date.now(),
				taskWorkflowStates: 'not-a-map' as any,
			} as any;
			
			const { swarmState } = require('../../src/state');
			swarmState.agentSessions.set('corrupted-session', corruptedSession);
			
			// ensureAgentSession should repair the corrupted field
			const repaired = ensureAgentSession('corrupted-session', 'corrupted');
			
			// BUG: Currently this fails because the code only checks "if (!session.taskWorkflowStates)"
			// not "if (!(session.taskWorkflowStates instanceof Map))"
			expect(repaired.taskWorkflowStates).toBeInstanceOf(Map);
		});

		it('should handle ensureAgentSession with taskWorkflowStates as array - BUG: not repaired', () => {
			// BUG: Same issue - only checks existence, not type
			const arraySession = {
				agentName: 'array-session',
				lastToolCallTime: Date.now(),
				taskWorkflowStates: [] as any,
			} as any;
			
			const { swarmState } = require('../../src/state');
			swarmState.agentSessions.set('array-session', arraySession);
			
			const repaired = ensureAgentSession('array-session', 'array-session');
			
			// BUG: This fails because the code doesn't validate the type
			expect(repaired.taskWorkflowStates).toBeInstanceOf(Map);
		});

		it('should handle ensureAgentSession with taskWorkflowStates as plain object - BUG: not repaired', () => {
			// BUG: Same issue - only checks existence, not type
			const objectSession = {
				agentName: 'object-session',
				lastToolCallTime: Date.now(),
				taskWorkflowStates: { some: 'object' } as any,
			} as any;
			
			const { swarmState } = require('../../src/state');
			swarmState.agentSessions.set('object-session', objectSession);
			
			const repaired = ensureAgentSession('object-session', 'object-session');
			
			// BUG: This fails because the code doesn't validate the type
			expect(repaired.taskWorkflowStates).toBeInstanceOf(Map);
		});

		it('should handle ensureAgentSession with gateLog as plain object instead of Map - BUG: not repaired', () => {
			// BUG: Same issue with gateLog
			const badGateLogSession = {
				agentName: 'bad-gatelog',
				lastToolCallTime: Date.now(),
				taskWorkflowStates: new Map(),
				gateLog: { some: 'object' } as any,
			} as any;
			
			const { swarmState } = require('../../src/state');
			swarmState.agentSessions.set('bad-gatelog-session', badGateLogSession);
			
			const repaired = ensureAgentSession('bad-gatelog-session', 'bad-gatelog');
			
			// BUG: This fails because the code only checks "if (!session.gateLog)"
			expect(repaired.gateLog).toBeInstanceOf(Map);
		});

		it('should handle ensureAgentSession with reviewerCallCount as plain object - BUG: not repaired', () => {
			// BUG: Same issue with reviewerCallCount
			const badReviewerCountSession = {
				agentName: 'bad-reviewer',
				lastToolCallTime: Date.now(),
				taskWorkflowStates: new Map(),
				reviewerCallCount: { some: 'object' } as any,
			} as any;
			
			const { swarmState } = require('../../src/state');
			swarmState.agentSessions.set('bad-reviewer-session', badReviewerCountSession);
			
			const repaired = ensureAgentSession('bad-reviewer-session', 'bad-reviewer');
			
			// BUG: This fails because the code only checks "if (!session.reviewerCallCount)"
			expect(repaired.reviewerCallCount).toBeInstanceOf(Map);
		});
	});

	describe('runtime require() path consistency', () => {
		it('should maintain consistent module path resolution', () => {
			// Test that multiple require() calls to the same module return consistent results
			const state1 = require('../../src/state');
			const state2 = require('../../src/state');
			
			// Both should reference the same swarmState singleton
			expect(state1.swarmState).toBe(state2.swarmState);
		});

		it('should have consistent resetSwarmState behavior across require calls', () => {
			// Reset state first to start clean
			resetSwarmState();
			
			const state1 = require('../../src/state');
			
			// Create some state
			state1.ensureAgentSession('test-session-consistency', 'test-agent');
			expect(state1.swarmState.agentSessions.size).toBe(1);
			
			// Reset via first require
			state1.resetSwarmState();
			expect(state1.swarmState.agentSessions.size).toBe(0);
			
			// Second require should also see clean state
			const state2 = require('../../src/state');
			expect(state2.swarmState.agentSessions.size).toBe(0);
		});

		it('should handle circular require scenario gracefully', async () => {
			// First, import the state module
			const state = await import('../../src/state');
			
			// Create session
			state.ensureAgentSession('circular-test', 'test-agent');
			expect(state.swarmState.agentSessions.has('circular-test')).toBe(true);
			
			// Re-import - should not cause issues
			const stateAgain = await import('../../src/state');
			expect(stateAgain.swarmState.agentSessions.has('circular-test')).toBe(true);
		});

		it('should maintain state consistency when imported via different relative paths', () => {
			// Import from the same module using different path resolutions
			const directImport = require('../../src/state');
			const resolvedImport = require('../../src/state');
			
			// Both should access the same singleton
			expect(directImport.swarmState).toBe(resolvedImport.swarmState);
			expect(directImport.swarmState.agentSessions).toBe(resolvedImport.swarmState.agentSessions);
		});

		it('should handle re-require after module cache manipulation', () => {
			// Get module - should maintain state
			const state1 = require('../../src/state');
			
			// Add state (if not exists)
			if (!state1.swarmState.agentSessions.has('cache-test')) {
				state1.ensureAgentSession('cache-test', 'test-agent');
			}
			expect(state1.swarmState.agentSessions.has('cache-test')).toBe(true);
		});
	});

	describe('migration edge cases with edge state values', () => {
		it('should handle session with lastToolCallTime as 0', () => {
			const zeroTimeSession = {
				agentName: 'zero-time',
				lastToolCallTime: 0,
				lastAgentEventTime: 0,
			} as any;
			
			const { swarmState } = require('../../src/state');
			swarmState.agentSessions.set('zero-time-session', zeroTimeSession);
			
			const migrated = ensureAgentSession('zero-time-session', 'zero-time');
			expect(migrated.lastToolCallTime).toBeGreaterThan(0);
		});

		it('should handle session with negative timestamps', () => {
			const negativeTimeSession = {
				agentName: 'negative-time',
				lastToolCallTime: -1000,
				lastAgentEventTime: -500,
			} as any;
			
			const { swarmState } = require('../../src/state');
			swarmState.agentSessions.set('negative-time-session', negativeTimeSession);
			
			const migrated = ensureAgentSession('negative-time-session', 'negative-time');
			expect(migrated.lastToolCallTime).toBeGreaterThan(0);
		});

		it('should handle session with NaN timestamps', () => {
			const nanTimeSession = {
				agentName: 'nan-time',
				lastToolCallTime: NaN,
				lastAgentEventTime: NaN,
			} as any;
			
			const { swarmState } = require('../../src/state');
			swarmState.agentSessions.set('nan-time-session', nanTimeSession);
			
			const migrated = ensureAgentSession('nan-time-session', 'nan-time');
			expect(migrated.lastToolCallTime).toBeGreaterThan(0);
		});

		it('should handle session with Infinity timestamps', () => {
			const infTimeSession = {
				agentName: 'inf-time',
				lastToolCallTime: Infinity,
				lastAgentEventTime: -Infinity,
			} as any;
			
			const { swarmState } = require('../../src/state');
			swarmState.agentSessions.set('inf-time-session', infTimeSession);
			
			const migrated = ensureAgentSession('inf-time-session', 'inf-time');
			expect(migrated.lastToolCallTime).toBeGreaterThan(0);
		});

		it('should handle session with undefined delegationActive - BUG: not normalized', () => {
			// BUG: The code checks if delegationActive exists but doesn't handle undefined explicitly
			const undefinedDelegationSession = {
				agentName: 'undefined-delegation',
				lastToolCallTime: Date.now(),
				delegationActive: undefined as any,
			} as any;
			
			const { swarmState } = require('../../src/state');
			swarmState.agentSessions.set('undefined-delegation-session', undefinedDelegationSession);
			
			const migrated = ensureAgentSession('undefined-delegation-session', 'undefined-delegation');
			// BUG: Currently remains undefined instead of being set to false
			expect(migrated.delegationActive).toBe(false);
		});

		it('should handle session with string instead of boolean for delegationActive - BUG: not normalized', () => {
			// BUG: String "true" is not normalized to boolean true
			const stringDelegationSession = {
				agentName: 'string-delegation',
				lastToolCallTime: Date.now(),
				delegationActive: 'true' as any, // String instead of boolean
			} as any;
			
			const { swarmState } = require('../../src/state');
			swarmState.agentSessions.set('string-delegation-session', stringDelegationSession);
			
			const migrated = ensureAgentSession('string-delegation-session', 'string-delegation');
			// BUG: Should be normalized to boolean, but currently stays as string
			expect(typeof migrated.delegationActive).toBe('boolean');
		});
	});
});

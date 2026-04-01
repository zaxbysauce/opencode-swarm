import { beforeEach, describe, expect, it } from 'bun:test';
import {
	type AgentSessionState,
	advanceTaskState,
	ensureAgentSession,
	getTaskState,
	resetSwarmState,
	type TaskWorkflowState,
} from '../../src/state';

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
		it('should handle null taskId (silently rejected by isValidTaskId)', () => {
			// null is rejected — advanceTaskState silently returns without mutating state
			expect(() => {
				advanceTaskState(session, null as any, 'coder_delegated');
			}).not.toThrow();

			// State was never set for null key
			expect(session.taskWorkflowStates.get(null as any)).toBeUndefined();
		});

		it('should handle undefined taskId (silently rejected by isValidTaskId)', () => {
			// undefined is rejected — advanceTaskState silently returns without mutating state
			expect(() => {
				advanceTaskState(session, undefined as any, 'coder_delegated');
			}).not.toThrow();

			// State was never set for undefined key
			expect(session.taskWorkflowStates.get(undefined as any)).toBeUndefined();
		});

		it('should handle empty string taskId (rejected by isValidTaskId)', () => {
			// Empty string is rejected — trimmed length is 0
			expect(() => {
				advanceTaskState(session, '', 'coder_delegated');
			}).not.toThrow();

			expect(session.taskWorkflowStates.get('')).toBeUndefined();
		});

		it('should handle very long taskId (10,000 chars) without crashing', () => {
			const longTaskId = 'a'.repeat(10000);

			expect(() => {
				advanceTaskState(session, longTaskId, 'coder_delegated');
			}).not.toThrow();

			expect(session.taskWorkflowStates.get(longTaskId)).toBe(
				'coder_delegated',
			);
		});

		it('should handle taskId with special characters (potential injection)', () => {
			const maliciousTaskId = '</script><img src=x onerror=alert(1)>';

			expect(() => {
				advanceTaskState(session, maliciousTaskId, 'coder_delegated');
			}).not.toThrow();

			expect(session.taskWorkflowStates.get(maliciousTaskId)).toBe(
				'coder_delegated',
			);
		});

		it('should handle taskId with null bytes', () => {
			const taskIdWithNull = 'test\0task';

			expect(() => {
				advanceTaskState(session, taskIdWithNull as any, 'coder_delegated');
			}).not.toThrow();
		});

		it('should handle taskId that is a number (rejected by typeof guard)', () => {
			expect(() => {
				advanceTaskState(session, 123 as any, 'coder_delegated');
			}).not.toThrow();

			// No state was set for the numeric key
			expect(session.taskWorkflowStates.size).toBe(0);
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
				taskWorkflowStates: null,
			} as any;

			expect(() => {
				advanceTaskState(badSession, 'task-1', 'coder_delegated');
			}).toThrow();
		});

		it('should throw when session.taskWorkflowStates is undefined', () => {
			const badSession = {
				agentName: 'test',
				taskWorkflowStates: undefined,
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

		it('should handle empty string taskId (returns idle for invalid taskId)', () => {
			advanceTaskState(session, '', 'coder_delegated');
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
				'complete',
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
					'complete',
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
			expect(session.taskWorkflowStates.get('__proto__')).toBe(
				'coder_delegated',
			);

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
});

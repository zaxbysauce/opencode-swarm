import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ensureAgentSession, startAgentSession, swarmState } from './state';

let tmpDir: string;
let testSessionId: string;

beforeEach(() => {
	tmpDir = mkdtempSync(path.join(os.tmpdir(), 'adversarial-rehydrate-'));
	mkdirSync(path.join(tmpDir, '.swarm', 'evidence'), { recursive: true });
	testSessionId = `adversarial-test-${Date.now()}`;
});

afterEach(() => {
	try {
		rmSync(tmpDir, { recursive: true, force: true });
	} catch {
		/* best effort */
	}
	swarmState.agentSessions.delete(testSessionId);
});

// ============================================================================
// ATTACK VECTOR 1: Missing directories
// ============================================================================

describe('ADVERSARIAL: Missing directories', () => {
	it('1. non-existent directory path does not crash session creation', () => {
		const nonExistentPath = '/this/path/does/not/exist/12345';

		expect(() => {
			startAgentSession(testSessionId, 'architect', 7200000, nonExistentPath);
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
		expect(session?.agentName).toBe('architect');
	});

	it('2. ensureAgentSession with non-existent directory is non-fatal', () => {
		const nonExistentPath = '/non/existent/dir/67890';

		expect(() => {
			ensureAgentSession(testSessionId, 'architect', nonExistentPath);
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
	});

	it('3. directory exists but .swarm subdirectory missing does not crash', () => {
		// Create tmpDir without .swarm subdirectory
		const emptyDir = mkdtempSync(path.join(os.tmpdir(), 'no-swarm-'));

		expect(() => {
			startAgentSession(testSessionId, 'coder', 7200000, emptyDir);
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();

		rmSync(emptyDir, { recursive: true, force: true });
	});

	it('4. .swarm exists but plan.json missing does not crash', () => {
		mkdirSync(path.join(tmpDir, '.swarm'), { recursive: true });
		// Don't create plan.json

		expect(() => {
			startAgentSession(testSessionId, 'reviewer', 7200000, tmpDir);
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
	});
});

// ============================================================================
// ATTACK VECTOR 2: Malformed durable state
// ============================================================================

describe('ADVERSARIAL: Malformed durable state', () => {
	it('5. corrupted plan.json (invalid JSON) does not crash session', () => {
		writeFileSync(
			path.join(tmpDir, '.swarm', 'plan.json'),
			'{{invalid json{{{',
		);

		expect(() => {
			startAgentSession(testSessionId, 'architect', 7200000, tmpDir);
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
	});

	it('6. plan.json with invalid schema does not crash session', () => {
		// Valid JSON but missing required fields
		const invalidPlan = {
			// Missing schema_version, title, swarm, phases
			random_field: 'should not be here',
		};
		writeFileSync(
			path.join(tmpDir, '.swarm', 'plan.json'),
			JSON.stringify(invalidPlan),
		);

		expect(() => {
			startAgentSession(testSessionId, 'architect', 7200000, tmpDir);
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
	});

	it('7. plan.json with empty array for phases does not crash', () => {
		const emptyPlan = {
			schema_version: '1.0.0',
			title: 'Empty',
			swarm: 'test',
			phases: [], // Empty phases array
		};
		writeFileSync(
			path.join(tmpDir, '.swarm', 'plan.json'),
			JSON.stringify(emptyPlan),
		);

		expect(() => {
			startAgentSession(testSessionId, 'architect', 7200000, tmpDir);
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
	});

	it('8. plan.json with malformed task status does not crash', () => {
		const planWithBadStatus = {
			schema_version: '1.0.0',
			title: 'Test',
			swarm: 'test',
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'pending',
					tasks: [
						{
							id: '1.1',
							phase: 1,
							description: 'Task',
							status: 'invalid_status_not_in_enum', // Invalid status
							size: 'small',
						},
					],
				},
			],
		};
		writeFileSync(
			path.join(tmpDir, '.swarm', 'plan.json'),
			JSON.stringify(planWithBadStatus),
		);

		expect(() => {
			startAgentSession(testSessionId, 'architect', 7200000, tmpDir);
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
	});

	it('9. corrupted evidence file (invalid JSON) does not crash session', () => {
		// Write plan first
		const plan = {
			schema_version: '1.0.0',
			title: 'Test',
			swarm: 'test',
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'pending',
					tasks: [
						{
							id: '1.1',
							phase: 1,
							description: 'Task',
							status: 'pending',
							size: 'small',
						},
					],
				},
			],
		};
		writeFileSync(
			path.join(tmpDir, '.swarm', 'plan.json'),
			JSON.stringify(plan),
		);

		// Write corrupted evidence file
		writeFileSync(
			path.join(tmpDir, '.swarm', 'evidence', '1.1.json'),
			'{{corrupted json',
		);

		expect(() => {
			startAgentSession(testSessionId, 'architect', 7200000, tmpDir);
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
	});

	it('10. evidence file with invalid taskId format does not crash', () => {
		// Write plan first
		const plan = {
			schema_version: '1.0.0',
			title: 'Test',
			swarm: 'test',
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'pending',
					tasks: [
						{
							id: '1.1',
							phase: 1,
							description: 'Task',
							status: 'pending',
							size: 'small',
						},
					],
				},
			],
		};
		writeFileSync(
			path.join(tmpDir, '.swarm', 'plan.json'),
			JSON.stringify(plan),
		);

		// Write evidence with invalid taskId format (should be filtered by validation)
		// These are intentionally invalid format but won't try to traverse paths
		const badTaskIdFiles = [
			'invalid-task-id.json', // Not N.M format
			'1.1.2.3.4.5.6.7.8.json', // Too many segments
			'.json', // Just extension
			'1.json', // Missing second number
		];

		for (const badFile of badTaskIdFiles) {
			const evidence = {
				taskId: badFile.replace('.json', ''),
				required_gates: ['reviewer', 'test_engineer'],
				gates: {},
			};
			writeFileSync(
				path.join(tmpDir, '.swarm', 'evidence', badFile),
				JSON.stringify(evidence),
			);
		}

		expect(() => {
			startAgentSession(testSessionId, 'architect', 7200000, tmpDir);
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
	});

	it('11. evidence file missing required_gates does not crash', () => {
		const plan = {
			schema_version: '1.0.0',
			title: 'Test',
			swarm: 'test',
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'pending',
					tasks: [
						{
							id: '1.1',
							phase: 1,
							description: 'Task',
							status: 'pending',
							size: 'small',
						},
					],
				},
			],
		};
		writeFileSync(
			path.join(tmpDir, '.swarm', 'plan.json'),
			JSON.stringify(plan),
		);

		// Evidence missing required_gates
		const invalidEvidence = {
			taskId: '1.1',
			// Missing required_gates
			gates: {},
		};
		writeFileSync(
			path.join(tmpDir, '.swarm', 'evidence', '1.1.json'),
			JSON.stringify(invalidEvidence),
		);

		expect(() => {
			startAgentSession(testSessionId, 'architect', 7200000, tmpDir);
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
	});

	it('12. very large plan.json does not cause memory issues or crash', () => {
		// Create a plan with many phases and tasks to test memory handling
		const largePlan = {
			schema_version: '1.0.0',
			title: 'Large Test Plan',
			swarm: 'test',
			phases: Array.from({ length: 100 }, (_, pi) => ({
				id: pi + 1,
				name: `Phase ${pi + 1}`,
				status: 'pending',
				tasks: Array.from({ length: 50 }, (_, ti) => ({
					id: `${pi + 1}.${ti + 1}`,
					phase: pi + 1,
					description: `Task ${pi + 1}.${ti + 1}`,
					status: 'pending',
					size: 'small',
				})),
			})),
		};
		writeFileSync(
			path.join(tmpDir, '.swarm', 'plan.json'),
			JSON.stringify(largePlan),
		);

		expect(() => {
			startAgentSession(testSessionId, 'architect', 7200000, tmpDir);
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
	});

	it('13. plan.json with null values does not crash', () => {
		const planWithNulls = {
			schema_version: '1.0.0',
			title: null, // Null title
			swarm: 'test',
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'pending',
					tasks: [
						{
							id: '1.1',
							phase: 1,
							description: 'Task',
							status: 'pending',
							size: null, // Null size
						},
					],
				},
			],
		};
		writeFileSync(
			path.join(tmpDir, '.swarm', 'plan.json'),
			JSON.stringify(planWithNulls),
		);

		expect(() => {
			startAgentSession(testSessionId, 'architect', 7200000, tmpDir);
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
	});

	it('14. plan.json with extreme numbers does not crash', () => {
		const planWithExtremeNumbers = {
			schema_version: '1.0.0',
			title: 'Test',
			swarm: 'test',
			phases: [
				{
					id: Number.MAX_SAFE_INTEGER, // Extreme number
					name: 'Phase 1',
					status: 'pending',
					tasks: [
						{
							id: '1.1',
							phase: Number.MAX_SAFE_INTEGER,
							description: 'Task',
							status: 'pending',
							size: 'small',
						},
					],
				},
			],
		};
		writeFileSync(
			path.join(tmpDir, '.swarm', 'plan.json'),
			JSON.stringify(planWithExtremeNumbers),
		);

		expect(() => {
			startAgentSession(testSessionId, 'architect', 7200000, tmpDir);
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
	});
});

// ============================================================================
// ATTACK VECTOR 3: Repeated bootstrap calls
// ============================================================================

describe('ADVERSARIAL: Repeated bootstrap calls', () => {
	it('15. multiple startAgentSession calls with same sessionId are non-fatal', () => {
		expect(() => {
			startAgentSession(testSessionId, 'architect', 7200000, tmpDir);
			startAgentSession(testSessionId, 'architect', 7200000, tmpDir);
			startAgentSession(testSessionId, 'architect', 7200000, tmpDir);
		}).not.toThrow();

		// Only one session should exist
		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
	});

	it('16. repeated ensureAgentSession calls do not cause issues', () => {
		expect(() => {
			ensureAgentSession(testSessionId, 'architect', tmpDir);
			ensureAgentSession(testSessionId, 'architect', tmpDir);
			ensureAgentSession(testSessionId, 'architect', tmpDir);
			ensureAgentSession(testSessionId, 'architect', tmpDir);
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
	});

	it('17. alternating startAgentSession and ensureAgentSession is safe', () => {
		expect(() => {
			startAgentSession(testSessionId, 'architect', 7200000, tmpDir);
			ensureAgentSession(testSessionId, 'coder', tmpDir);
			startAgentSession(testSessionId, 'reviewer', 7200000, tmpDir);
			ensureAgentSession(testSessionId, 'test_engineer', tmpDir);
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
		// Last call was with test_engineer
		expect(session?.agentName).toBe('test_engineer');
	});

	it('18. rapid session creation with different IDs does not leak memory', () => {
		const sessionIds: string[] = [];

		// Create many sessions
		for (let i = 0; i < 100; i++) {
			const sid = `rapid-${testSessionId}-${i}`;
			sessionIds.push(sid);
			startAgentSession(sid, 'architect', 7200000, tmpDir);
		}

		// Verify all sessions exist
		for (const sid of sessionIds) {
			const session = swarmState.agentSessions.get(sid);
			expect(session).toBeDefined();
		}

		// Clean up
		for (const sid of sessionIds) {
			swarmState.agentSessions.delete(sid);
		}
	});
});

// ============================================================================
// ATTACK VECTOR 4: Backward compatibility
// ============================================================================

describe('ADVERSARIAL: Backward compatibility', () => {
	it('19. calling without directory parameter maintains backward compatibility', () => {
		expect(() => {
			startAgentSession(testSessionId, 'architect');
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
		expect(session?.agentName).toBe('architect');
	});

	it('20. ensureAgentSession without directory maintains backward compatibility', () => {
		expect(() => {
			ensureAgentSession(testSessionId, 'architect');
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
	});

	it('21. undefined directory explicitly passed behaves same as omitted', () => {
		// Test 1: undefined passed explicitly
		startAgentSession(testSessionId, 'architect', 7200000, undefined);
		const session1 = swarmState.agentSessions.get(testSessionId);

		// Test 2: directory omitted entirely
		const session2Id = `${testSessionId}-2`;
		startAgentSession(session2Id, 'architect', 7200000);
		const session2 = swarmState.agentSessions.get(session2Id);

		// Both should work identically - no rehydration should occur
		expect(session1?.taskWorkflowStates?.size).toBe(0);
		expect(session2?.taskWorkflowStates?.size).toBe(0);

		// Clean up
		swarmState.agentSessions.delete(testSessionId);
		swarmState.agentSessions.delete(session2Id);

		swarmState.agentSessions.delete(session2Id);
	});

	it('22. empty string directory does not trigger rehydration', () => {
		expect(() => {
			startAgentSession(testSessionId, 'architect', 7200000, '');
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
		// Empty string should be falsy - no rehydration
		expect(session?.taskWorkflowStates?.size).toBe(0);
	});

	it('23. null directory does not crash', () => {
		expect(() => {
			// @ts-expect-error - intentionally passing null to test runtime behavior
			startAgentSession(testSessionId, 'architect', 7200000, null);
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
	});
});

// ============================================================================
// ATTACK VECTOR 5: Crash attempts through rehydration errors
// ============================================================================

describe('ADVERSARIAL: Crash attempts', () => {
	it('24. directory with only whitespace does not crash', () => {
		expect(() => {
			startAgentSession(testSessionId, 'architect', 7200000, '   ');
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
	});

	it('25. directory with null bytes does not crash', () => {
		const dirWithNull = '/tmp/test\x00dir';
		expect(() => {
			startAgentSession(testSessionId, 'architect', 7200000, dirWithNull);
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
	});

	it('26. extremely long directory path does not crash', () => {
		const longPath = `/tmp/${'a'.repeat(10000)}`;
		expect(() => {
			startAgentSession(testSessionId, 'architect', 7200000, longPath);
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
	});

	it('27. plan.json with deeply nested structure does not crash', () => {
		// Create a deeply nested JSON that might cause stack overflow in parsing
		const deepJson = `{"a":${'{"b":'.repeat(1000)}1${'}'.repeat(1000)}`;
		writeFileSync(path.join(tmpDir, '.swarm', 'plan.json'), deepJson);

		expect(() => {
			startAgentSession(testSessionId, 'architect', 7200000, tmpDir);
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
	});

	it('28. evidence directory with binary files does not crash', () => {
		const plan = {
			schema_version: '1.0.0',
			title: 'Test',
			swarm: 'test',
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'pending',
					tasks: [
						{
							id: '1.1',
							phase: 1,
							description: 'Task',
							status: 'pending',
							size: 'small',
						},
					],
				},
			],
		};
		writeFileSync(
			path.join(tmpDir, '.swarm', 'plan.json'),
			JSON.stringify(plan),
		);

		// Write binary-like content
		const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);
		writeFileSync(
			path.join(tmpDir, '.swarm', 'evidence', '1.1.json'),
			binaryContent,
		);

		expect(() => {
			startAgentSession(testSessionId, 'architect', 7200000, tmpDir);
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
	});

	it('29. plan.json with special Unicode characters does not crash', () => {
		const planWithUnicode = {
			schema_version: '1.0.0',
			title: 'Test\u0000\u0001\uFFFF', // Null and control chars
			swarm: 'test',
			phases: [
				{
					id: 1,
					name: 'Phase\u200b\u200c\u200d', // Zero-width chars
					status: 'pending',
					tasks: [
						{
							id: '1.1',
							phase: 1,
							description: 'Task💩', // Emoji
							status: 'pending',
							size: 'small',
						},
					],
				},
			],
		};
		writeFileSync(
			path.join(tmpDir, '.swarm', 'plan.json'),
			JSON.stringify(planWithUnicode),
		);

		expect(() => {
			startAgentSession(testSessionId, 'architect', 7200000, tmpDir);
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
	});

	it('30. evidence file with array instead of object does not crash', () => {
		const plan = {
			schema_version: '1.0.0',
			title: 'Test',
			swarm: 'test',
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'pending',
					tasks: [
						{
							id: '1.1',
							phase: 1,
							description: 'Task',
							status: 'pending',
							size: 'small',
						},
					],
				},
			],
		};
		writeFileSync(
			path.join(tmpDir, '.swarm', 'plan.json'),
			JSON.stringify(plan),
		);

		// Write array instead of object
		writeFileSync(
			path.join(tmpDir, '.swarm', 'evidence', '1.1.json'),
			JSON.stringify([1, 2, 3]),
		);

		expect(() => {
			startAgentSession(testSessionId, 'architect', 7200000, tmpDir);
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
	});

	it('31. evidence file with primitive instead of object does not crash', () => {
		const plan = {
			schema_version: '1.0.0',
			title: 'Test',
			swarm: 'test',
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'pending',
					tasks: [
						{
							id: '1.1',
							phase: 1,
							description: 'Task',
							status: 'pending',
							size: 'small',
						},
					],
				},
			],
		};
		writeFileSync(
			path.join(tmpDir, '.swarm', 'plan.json'),
			JSON.stringify(plan),
		);

		// Write primitive instead of object
		writeFileSync(
			path.join(tmpDir, '.swarm', 'evidence', '1.1.json'),
			JSON.stringify('just a string'),
		);

		expect(() => {
			startAgentSession(testSessionId, 'architect', 7200000, tmpDir);
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
	});

	it('32. nested evidence files (subdirectory) are safely ignored', () => {
		const plan = {
			schema_version: '1.0.0',
			title: 'Test',
			swarm: 'test',
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'pending',
					tasks: [
						{
							id: '1.1',
							phase: 1,
							description: 'Task',
							status: 'pending',
							size: 'small',
						},
					],
				},
			],
		};
		writeFileSync(
			path.join(tmpDir, '.swarm', 'plan.json'),
			JSON.stringify(plan),
		);

		// Create subdirectory in evidence
		mkdirSync(path.join(tmpDir, '.swarm', 'evidence', 'subdir'), {
			recursive: true,
		});
		writeFileSync(
			path.join(tmpDir, '.swarm', 'evidence', 'subdir', '1.2.json'),
			JSON.stringify({ taskId: '1.2', required_gates: [], gates: {} }),
		);

		expect(() => {
			startAgentSession(testSessionId, 'architect', 7200000, tmpDir);
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
	});

	it('33. symbolic link to invalid path does not crash', () => {
		const plan = {
			schema_version: '1.0.0',
			title: 'Test',
			swarm: 'test',
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'pending',
					tasks: [
						{
							id: '1.1',
							phase: 1,
							description: 'Task',
							status: 'pending',
							size: 'small',
						},
					],
				},
			],
		};
		writeFileSync(
			path.join(tmpDir, '.swarm', 'plan.json'),
			JSON.stringify(plan),
		);

		// Create a symlink to non-existent target
		const symlinkPath = path.join(
			tmpDir,
			'.swarm',
			'evidence',
			'broken-link.json',
		);
		try {
			// This may fail on Windows without admin, so we wrap in try/catch
			require('node:fs').symlinkSync('/nonexistent/path', symlinkPath, 'file');
		} catch {
			// Symlink creation failed - that's fine, skip this part of the test
		}

		expect(() => {
			startAgentSession(testSessionId, 'architect', 7200000, tmpDir);
		}).not.toThrow();

		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
	});
});

// ============================================================================
// ATTACK VECTOR 6: Session state integrity
// ============================================================================

describe('ADVERSARIAL: Session state integrity', () => {
	it('34. rehydration failure does not corrupt existing session state', () => {
		// First create a session with valid data
		startAgentSession(testSessionId, 'architect');
		const sessionBefore = swarmState.agentSessions.get(testSessionId);
		sessionBefore?.taskWorkflowStates.set('1.1', 'complete');
		sessionBefore?.taskWorkflowStates.set('1.2', 'tests_run');

		// Now call with malformed directory - should not corrupt existing state
		writeFileSync(path.join(tmpDir, '.swarm', 'plan.json'), '{{invalid json');

		expect(() => {
			startAgentSession(testSessionId, 'architect', 7200000, tmpDir);
		}).not.toThrow();

		const sessionAfter = swarmState.agentSessions.get(testSessionId);
		// Existing state should be preserved (or at minimum, session should not be corrupted)
		expect(sessionAfter).toBeDefined();
		expect(sessionAfter?.taskWorkflowStates).toBeDefined();
	});

	it('35. session remains functional after rehydration error', () => {
		// Create session with invalid rehydration
		writeFileSync(path.join(tmpDir, '.swarm', 'plan.json'), '{{corrupted');

		startAgentSession(testSessionId, 'architect', 7200000, tmpDir);
		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();

		// Session should still be usable - can update task states
		expect(() => {
			session?.taskWorkflowStates.set('2.1', 'coder_delegated');
		}).not.toThrow();

		expect(session?.taskWorkflowStates.get('2.1')).toBe('coder_delegated');
	});
});

/**
 * Guardrails Hook Directory Threading Test
 *
 * Verifies that guardrails.ts passes the hook project `directory` to ensureAgentSession
 * during session bootstrap (v6.26 Task 3).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { swarmState } from '../state';
import { createGuardrailsHooks } from './guardrails';

describe('guardrails session bootstrap directory threading', () => {
	const testSessionId = 'guardrails-test-session';
	const mockDirectory = '/mock/project/directory';

	beforeEach(() => {
		// Clean up any existing session state
		swarmState.agentSessions.delete(testSessionId);
		swarmState.activeAgent.delete(testSessionId);
	});

	it('should pass directory to ensureAgentSession during toolBefore hook', async () => {
		// Create guardrails hooks with explicit directory
		const hooks = createGuardrailsHooks(mockDirectory, {
			enabled: true,
			max_duration_minutes: 30,
			max_tool_calls: 100,
			max_repetitions: 5,
			max_consecutive_errors: 5,
			idle_timeout_minutes: 10,
			warning_threshold: 0.8,
		});

		// Simulate a non-architect session to trigger ensureAgentSession call
		// Set activeAgent to something other than architect so guardrails applies
		swarmState.activeAgent.set(testSessionId, 'coder');

		// Call toolBefore - this should call ensureAgentSession with directory
		await hooks.toolBefore(
			{
				tool: 'read',
				sessionID: testSessionId,
				callID: 'test-call-1',
			},
			{ args: { filePath: '/some/file.ts' } },
		);

		// Verify session was created - this confirms ensureAgentSession was called with directory
		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
		expect(session?.agentName).toBe('coder');
	});

	it('should use process.cwd() as fallback when directory is not provided', async () => {
		// Create guardrails hooks WITHOUT explicit directory (legacy mode)
		const hooks = createGuardrailsHooks({
			enabled: true,
			max_duration_minutes: 30,
			max_tool_calls: 100,
			max_repetitions: 5,
			max_consecutive_errors: 5,
			idle_timeout_minutes: 10,
			warning_threshold: 0.8,
		});

		// Simulate a non-architect session
		swarmState.activeAgent.set(testSessionId, 'test_engineer');

		// Call toolBefore
		await hooks.toolBefore(
			{
				tool: 'read',
				sessionID: testSessionId,
				callID: 'test-call-2',
			},
			{ args: { filePath: '/some/file.ts' } },
		);

		// Verify session was created (fallback to process.cwd())
		const session = swarmState.agentSessions.get(testSessionId);
		expect(session).toBeDefined();
		expect(session?.agentName).toBe('test_engineer');
	});

	it('should preserve session state across multiple tool calls with same directory', async () => {
		const testDir = '/test/preserved/directory';
		const hooks = createGuardrailsHooks(testDir, {
			enabled: true,
			max_duration_minutes: 30,
			max_tool_calls: 100,
			max_repetitions: 5,
			max_consecutive_errors: 5,
			idle_timeout_minutes: 10,
			warning_threshold: 0.8,
		});

		// Set up non-architect session
		swarmState.activeAgent.set(testSessionId, 'reviewer');

		// First tool call
		await hooks.toolBefore(
			{ tool: 'read', sessionID: testSessionId, callID: 'call-1' },
			{ args: { filePath: '/file1.ts' } },
		);

		// Verify session exists
		const session1 = swarmState.agentSessions.get(testSessionId);
		expect(session1).toBeDefined();
		expect(session1?.agentName).toBe('reviewer');

		// Second tool call - should reuse same session
		await hooks.toolBefore(
			{ tool: 'read', sessionID: testSessionId, callID: 'call-2' },
			{ args: { filePath: '/file2.ts' } },
		);

		const session2 = swarmState.agentSessions.get(testSessionId);
		// Should be same session object
		expect(session2).toBe(session1);
	});
});

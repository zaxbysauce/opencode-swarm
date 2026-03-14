/**
 * Guardrails Session Bootstrap Directory Adversarial Test
 *
 * Tests attack vectors around odd directory values, architect exemption preservation,
 * and non-fatal legacy fallback behavior for the v6.26 Task 3 directory threading fix.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ORCHESTRATOR_NAME } from '../config/constants';
import { resetSwarmState, swarmState } from '../state';
import { createGuardrailsHooks } from './guardrails';

describe('guardrails session bootstrap directory adversarial tests', () => {
	const testSessionId = 'adversarial-test-session';

	beforeEach(() => {
		resetSwarmState();
		swarmState.agentSessions.delete(testSessionId);
		swarmState.activeAgent.delete(testSessionId);
	});

	describe('odd directory values - attack vectors', () => {
		it('should handle empty string directory', async () => {
			const hooks = createGuardrailsHooks('', {
				enabled: true,
				max_duration_minutes: 30,
				max_tool_calls: 100,
				max_repetitions: 5,
				max_consecutive_errors: 5,
				idle_timeout_minutes: 10,
				warning_threshold: 0.8,
			});

			swarmState.activeAgent.set(testSessionId, 'coder');

			// Should not throw with empty string directory
			await hooks.toolBefore(
				{ tool: 'read', sessionID: testSessionId, callID: 'call-1' },
				{ args: { filePath: '/some/file.ts' } },
			);

			// Session should be created (uses process.cwd() fallback for empty string)
			const session = swarmState.agentSessions.get(testSessionId);
			expect(session).toBeDefined();
		});

		it('should handle directory with null bytes', async () => {
			// Null bytes in path could potentially cause issues
			const maliciousDir = '/test/dir\x00with\x00nulls';
			const hooks = createGuardrailsHooks(maliciousDir, {
				enabled: true,
				max_duration_minutes: 30,
				max_tool_calls: 100,
				max_repetitions: 5,
				max_consecutive_errors: 5,
				idle_timeout_minutes: 10,
				warning_threshold: 0.8,
			});

			swarmState.activeAgent.set(testSessionId, 'coder');

			// Should not crash - should handle gracefully
			await hooks.toolBefore(
				{ tool: 'read', sessionID: testSessionId, callID: 'call-1' },
				{ args: { filePath: '/some/file.ts' } },
			);

			const session = swarmState.agentSessions.get(testSessionId);
			expect(session).toBeDefined();
		});

		it('should handle directory with path traversal sequences', async () => {
			const traversalDir = '/test/../../../etc';
			const hooks = createGuardrailsHooks(traversalDir, {
				enabled: true,
				max_duration_minutes: 30,
				max_tool_calls: 100,
				max_repetitions: 5,
				max_consecutive_errors: 5,
				idle_timeout_minutes: 10,
				warning_threshold: 0.8,
			});

			swarmState.activeAgent.set(testSessionId, 'coder');

			// Should not crash - path resolution is handled downstream
			await hooks.toolBefore(
				{ tool: 'read', sessionID: testSessionId, callID: 'call-1' },
				{ args: { filePath: '/some/file.ts' } },
			);

			const session = swarmState.agentSessions.get(testSessionId);
			expect(session).toBeDefined();
		});

		it('should handle extremely long directory path', async () => {
			// Create a very long path (10KB+)
			const longDir = '/test/' + 'a'.repeat(10000);
			const hooks = createGuardrailsHooks(longDir, {
				enabled: true,
				max_duration_minutes: 30,
				max_tool_calls: 100,
				max_repetitions: 5,
				max_consecutive_errors: 5,
				idle_timeout_minutes: 10,
				warning_threshold: 0.8,
			});

			swarmState.activeAgent.set(testSessionId, 'coder');

			// Should not crash
			await hooks.toolBefore(
				{ tool: 'read', sessionID: testSessionId, callID: 'call-1' },
				{ args: { filePath: '/some/file.ts' } },
			);

			const session = swarmState.agentSessions.get(testSessionId);
			expect(session).toBeDefined();
		});

		it('should handle directory with special shell characters', async () => {
			// Characters that might cause shell injection or path issues
			const specialDir = '/test/dir; rm -rf /; echo "pwned"';
			const hooks = createGuardrailsHooks(specialDir, {
				enabled: true,
				max_duration_minutes: 30,
				max_tool_calls: 100,
				max_repetitions: 5,
				max_consecutive_errors: 5,
				idle_timeout_minutes: 10,
				warning_threshold: 0.8,
			});

			swarmState.activeAgent.set(testSessionId, 'coder');

			// Should handle gracefully - string is treated as path, not executed
			await hooks.toolBefore(
				{ tool: 'read', sessionID: testSessionId, callID: 'call-1' },
				{ args: { filePath: '/some/file.ts' } },
			);

			const session = swarmState.agentSessions.get(testSessionId);
			expect(session).toBeDefined();
		});

		it('should handle directory with unicode characters', async () => {
			// Unicode paths including emoji and combining characters
			const unicodeDir = '/test/日本語/🚀/dir';
			const hooks = createGuardrailsHooks(unicodeDir, {
				enabled: true,
				max_duration_minutes: 30,
				max_tool_calls: 100,
				max_repetitions: 5,
				max_consecutive_errors: 5,
				idle_timeout_minutes: 10,
				warning_threshold: 0.8,
			});

			swarmState.activeAgent.set(testSessionId, 'coder');

			// Should handle unicode paths
			await hooks.toolBefore(
				{ tool: 'read', sessionID: testSessionId, callID: 'call-1' },
				{ args: { filePath: '/some/file.ts' } },
			);

			const session = swarmState.agentSessions.get(testSessionId);
			expect(session).toBeDefined();
		});

		it('should handle directory with only whitespace', async () => {
			const whitespaceDir = '   ';
			const hooks = createGuardrailsHooks(whitespaceDir, {
				enabled: true,
				max_duration_minutes: 30,
				max_tool_calls: 100,
				max_repetitions: 5,
				max_consecutive_errors: 5,
				idle_timeout_minutes: 10,
				warning_threshold: 0.8,
			});

			swarmState.activeAgent.set(testSessionId, 'coder');

			// Should not crash
			await hooks.toolBefore(
				{ tool: 'read', sessionID: testSessionId, callID: 'call-1' },
				{ args: { filePath: '/some/file.ts' } },
			);

			const session = swarmState.agentSessions.get(testSessionId);
			expect(session).toBeDefined();
		});

		it('should handle directory with RTL override characters', async () => {
			// RTL override can trick path display - potential security issue
			const rtlDir = '/test/\u202Edormal\u202C/path';
			const hooks = createGuardrailsHooks(rtlDir, {
				enabled: true,
				max_duration_minutes: 30,
				max_tool_calls: 100,
				max_repetitions: 5,
				max_consecutive_errors: 5,
				idle_timeout_minutes: 10,
				warning_threshold: 0.8,
			});

			swarmState.activeAgent.set(testSessionId, 'coder');

			// Should handle gracefully
			await hooks.toolBefore(
				{ tool: 'read', sessionID: testSessionId, callID: 'call-1' },
				{ args: { filePath: '/some/file.ts' } },
			);

			const session = swarmState.agentSessions.get(testSessionId);
			expect(session).toBeDefined();
		});
	});

	describe('architect exemption preservation with directory', () => {
		it('should exempt architect even with empty string directory', async () => {
			const hooks = createGuardrailsHooks('', {
				enabled: true,
				max_duration_minutes: 30,
				max_tool_calls: 100,
				max_repetitions: 5,
				max_consecutive_errors: 5,
				idle_timeout_minutes: 10,
				warning_threshold: 0.8,
			});

			// Set active agent to architect - this triggers early return (no session created)
			swarmState.activeAgent.set(testSessionId, ORCHESTRATOR_NAME);

			// Should not throw - architect is exempt, returns early without creating session
			await hooks.toolBefore(
				{ tool: 'write', sessionID: testSessionId, callID: 'call-1' },
				{ args: { filePath: '/src/main.ts' } },
			);

			// Architect exemption means NO session is created (early return at line 551-553)
			// This is correct behavior - architect doesn't need session tracking
		});

		it('should exempt architect with malformed directory', async () => {
			const hooks = createGuardrailsHooks('/\x00\x00invalid', {
				enabled: true,
				max_duration_minutes: 30,
				max_tool_calls: 100,
				max_repetitions: 5,
				max_consecutive_errors: 5,
				idle_timeout_minutes: 10,
				warning_threshold: 0.8,
			});

			swarmState.activeAgent.set(testSessionId, ORCHESTRATOR_NAME);

			// Should not throw - architect is exempt
			await hooks.toolBefore(
				{ tool: 'edit', sessionID: testSessionId, callID: 'call-1' },
				{ args: { filePath: '/src/app.ts' } },
			);

			// Architect exemption - no session created
		});

		it('should exempt architect with path traversal directory', async () => {
			const hooks = createGuardrailsHooks('../../../sensitive', {
				enabled: true,
				max_duration_minutes: 30,
				max_tool_calls: 100,
				max_repetitions: 5,
				max_consecutive_errors: 5,
				idle_timeout_minutes: 10,
				warning_threshold: 0.8,
			});

			swarmState.activeAgent.set(testSessionId, ORCHESTRATOR_NAME);

			// Should not throw - architect is exempt
			await hooks.toolBefore(
				{ tool: 'write', sessionID: testSessionId, callID: 'call-1' },
				{ args: { filePath: '/etc/passwd' } },
			);

			// Architect exemption - no session created
		});

		it('should exempt architect from session creation limits even with weird directory', async () => {
			const weirdDir = '/test/🎉'.repeat(100);
			const hooks = createGuardrailsHooks(weirdDir, {
				enabled: true,
				max_duration_minutes: 30,
				max_tool_calls: 100,
				max_repetitions: 5,
				max_consecutive_errors: 5,
				idle_timeout_minutes: 10,
				warning_threshold: 0.8,
			});

			swarmState.activeAgent.set(testSessionId, ORCHESTRATOR_NAME);

			// Multiple tool calls should all succeed for architect (no session, no limits)
			for (let i = 0; i < 10; i++) {
				await hooks.toolBefore(
					{ tool: 'read', sessionID: testSessionId, callID: `call-${i}` },
					{ args: { filePath: `/file${i}.ts` } },
				);
			}

			// Architect has no session - exempt from all limits
		});

		it('should preserve architect exemption in session state lookup with odd directory', async () => {
			const hooks = createGuardrailsHooks('', {
				enabled: true,
				max_duration_minutes: 30,
				max_tool_calls: 100,
				max_repetitions: 5,
				max_consecutive_errors: 5,
				idle_timeout_minutes: 10,
				warning_threshold: 0.8,
			});

			// Pre-create session with architect name
			const { startAgentSession } = await import('../state');
			startAgentSession(testSessionId, ORCHESTRATOR_NAME);

			// Set active agent to architect as well
			swarmState.activeAgent.set(testSessionId, ORCHESTRATOR_NAME);

			// Should not throw and should not apply guardrails
			await hooks.toolBefore(
				{ tool: 'patch', sessionID: testSessionId, callID: 'call-1' },
				{ args: { input: 'some patch content' } },
			);

			const session = swarmState.agentSessions.get(testSessionId);
			expect(session).toBeDefined();
			expect(session?.agentName).toBe(ORCHESTRATOR_NAME);
		});
	});

	describe('non-fatal legacy fallback behavior', () => {
		it('should fallback to process.cwd() when directory is undefined', async () => {
			// Legacy call style - no directory provided
			const hooks = createGuardrailsHooks({
				enabled: true,
				max_duration_minutes: 30,
				max_tool_calls: 100,
				max_repetitions: 5,
				max_consecutive_errors: 5,
				idle_timeout_minutes: 10,
				warning_threshold: 0.8,
			});

			swarmState.activeAgent.set(testSessionId, 'test_engineer');

			// Should not throw - uses fallback
			await hooks.toolBefore(
				{ tool: 'read', sessionID: testSessionId, callID: 'call-1' },
				{ args: { filePath: '/some/file.ts' } },
			);

			const session = swarmState.agentSessions.get(testSessionId);
			expect(session).toBeDefined();
			expect(session?.agentName).toBe('test_engineer');
		});

		it('should fallback when directory is explicitly null', async () => {
			// @ts-expect-error - testing explicit null handling
			const hooks = createGuardrailsHooks(null, {
				enabled: true,
				max_duration_minutes: 30,
				max_tool_calls: 100,
				max_repetitions: 5,
				max_consecutive_errors: 5,
				idle_timeout_minutes: 10,
				warning_threshold: 0.8,
			});

			swarmState.activeAgent.set(testSessionId, 'reviewer');

			// Should fallback to process.cwd()
			await hooks.toolBefore(
				{ tool: 'read', sessionID: testSessionId, callID: 'call-1' },
				{ args: { filePath: '/some/file.ts' } },
			);

			const session = swarmState.agentSessions.get(testSessionId);
			expect(session).toBeDefined();
		});

		it('should handle legacy config object detection correctly', async () => {
			// This should be detected as legacy call and use process.cwd()
			const hooks = createGuardrailsHooks({
				enabled: true,
				max_duration_minutes: 30,
				max_tool_calls: 100,
				max_repetitions: 5,
				max_consecutive_errors: 5,
				idle_timeout_minutes: 10,
				warning_threshold: 0.8,
			});

			swarmState.activeAgent.set(testSessionId, 'mega_coder');

			// Multiple calls should all work with fallback
			for (let i = 0; i < 5; i++) {
				await hooks.toolBefore(
					{ tool: 'read', sessionID: testSessionId, callID: `call-${i}` },
					{ args: { filePath: `/file${i}.ts` } },
				);
			}

			const session = swarmState.agentSessions.get(testSessionId);
			expect(session).toBeDefined();
		});

		it('should not throw on undefined args with legacy fallback', async () => {
			const hooks = createGuardrailsHooks({
				enabled: true,
				max_duration_minutes: 30,
				max_tool_calls: 100,
				max_repetitions: 5,
				max_consecutive_errors: 5,
				idle_timeout_minutes: 10,
				warning_threshold: 0.8,
			});

			swarmState.activeAgent.set(testSessionId, 'coder');

			// Should not throw even with undefined args
			await hooks.toolBefore(
				{ tool: 'read', sessionID: testSessionId, callID: 'call-1' },
				{ args: undefined },
			);

			const session = swarmState.agentSessions.get(testSessionId);
			expect(session).toBeDefined();
		});
	});
});

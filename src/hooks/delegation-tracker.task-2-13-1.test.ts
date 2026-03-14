/**
 * Verification tests for Task 2.13.1: Thread plugin directory into createDelegationTrackerHook
 *
 * This test verifies that src/index.ts properly threads ctx.directory into
 * createDelegationTrackerHook(config, guardrailsConfig.enabled, ctx.directory)
 * so the delegation-tracker receives project-directory context without breaking
 * existing boolean configuration semantics.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the dependencies
vi.mock('../state', () => ({
	swarmState: {
		activeAgent: new Map<string, string>(),
		agentSessions: new Map<string, unknown>(),
		delegationChains: new Map<string, unknown[]>(),
		pendingEvents: 0,
	},
	ensureAgentSession: vi
		.fn()
		.mockImplementation(
			(sessionId: string, agentName: string, directory?: string) => {
				const session = {
					sessionId,
					agentName,
					directory,
					delegationActive: false,
					startTime: Date.now(),
				};
				return session;
			},
		),
	beginInvocation: vi.fn(),
	recordPhaseAgentDispatch: vi.fn(),
	updateAgentEventTime: vi.fn(),
}));

vi.mock('../config/constants', () => ({
	ORCHESTRATOR_NAME: 'architect',
}));

vi.mock('../config/schema', () => ({
	stripKnownSwarmPrefix: vi.fn().mockImplementation((agent: string) => agent),
}));

import { ensureAgentSession, swarmState } from '../state';
import { createDelegationTrackerHook } from './delegation-tracker';

describe('Task 2.13.1: delegation-tracker directory threading from src/index.ts', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset swarmState
		swarmState.activeAgent.clear();
		swarmState.agentSessions.clear();
		swarmState.delegationChains.clear();
		swarmState.pendingEvents = 0;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ===== Task 2.13.1: Core verification =====

	it('should thread ctx.directory from src/index.ts legacy 3-arg signature', async () => {
		// Simulating src/index.ts lines 146-150:
		// const delegationHandler = createDelegationTrackerHook(
		//     config,
		//     guardrailsConfig.enabled,
		//     ctx.directory,
		// );
		const config = {
			max_iterations: 5,
			qa_retry_limit: 3,
			inject_phase_reminders: true,
			hooks: { delegation_tracker: true },
		} as any;
		const guardrailsEnabled = true;
		const ctxDirectory = '/project/workspace';

		// This is the exact call pattern from src/index.ts
		const hook = createDelegationTrackerHook(
			config,
			guardrailsEnabled,
			ctxDirectory,
		);
		expect(typeof hook).toBe('function');

		// Execute the hook to verify directory is passed through
		await hook({ sessionID: 'test-session', agent: 'coder' }, {} as any);

		// Verify ensureAgentSession was called with the ctx.directory
		expect(ensureAgentSession).toHaveBeenCalledWith(
			'test-session',
			'coder',
			ctxDirectory, // Must be '/project/workspace', not process.cwd()
		);
	});

	it('should preserve boolean guardrails config in legacy 3-arg signature', async () => {
		// Verify that guardrailsConfig.enabled boolean is properly preserved
		const config = {
			max_iterations: 5,
			qa_retry_limit: 3,
			inject_phase_reminders: true,
		} as any;
		const ctxDirectory = '/my/project';

		// Test with guardrailsEnabled = true
		const hookWithGuardrails = createDelegationTrackerHook(
			config,
			true,
			ctxDirectory,
		);
		await hookWithGuardrails(
			{ sessionID: 'session-1', agent: 'coder' },
			{} as any,
		);

		const { beginInvocation } = await import('../state');
		expect(beginInvocation).toHaveBeenCalledWith('session-1', 'coder');

		// Reset mocks
		vi.clearAllMocks();

		// Test with guardrailsEnabled = false
		const hookWithoutGuardrails = createDelegationTrackerHook(
			config,
			false,
			ctxDirectory,
		);
		await hookWithoutGuardrails(
			{ sessionID: 'session-2', agent: 'coder' },
			{} as any,
		);

		expect(beginInvocation).not.toHaveBeenCalled();
	});

	it('should NOT break backward compatibility with legacy 1-arg signature', () => {
		// Ensure existing code that calls createDelegationTrackerHook(config) still works
		const legacyConfig = {
			max_iterations: 10,
			qa_retry_limit: 3,
			inject_phase_reminders: true,
			hooks: { delegation_tracker: true },
		} as any;

		const hook = createDelegationTrackerHook(legacyConfig);
		expect(typeof hook).toBe('function');
	});

	it('should NOT break backward compatibility with legacy 2-arg signature', () => {
		// New 2-arg signature: createDelegationTrackerHook(directory, config)
		const config = {
			max_iterations: 5,
			qa_retry_limit: 3,
			inject_phase_reminders: true,
		} as any;
		const hook = createDelegationTrackerHook('/new/signature/dir', config);
		expect(typeof hook).toBe('function');
	});

	// ===== Additional verification for different ctx.directory values =====

	it('should handle different ctx.directory values from src/index.ts', async () => {
		const config = {
			max_iterations: 5,
			qa_retry_limit: 3,
			inject_phase_reminders: true,
		} as any;
		const guardrailsEnabled = true;

		// Test various directory formats that might come from ctx.directory
		const testDirs = [
			'/home/user/projects/my-app',
			'C:\\Users\\Developer\\project',
			'/tmp/workspace-123',
			'./relative/path',
			'/workspace',
		];

		for (const dir of testDirs) {
			vi.clearAllMocks();

			const hook = createDelegationTrackerHook(config, guardrailsEnabled, dir);
			await hook(
				{ sessionID: 'test-session', agent: 'qa_reviewer' },
				{} as any,
			);

			expect(ensureAgentSession).toHaveBeenCalledWith(
				'test-session',
				'qa_reviewer',
				dir,
			);
		}
	});

	// ===== Edge case: directory is undefined/null =====

	it('should handle undefined directory (falls back to process.cwd())', async () => {
		const config = {
			max_iterations: 5,
			qa_retry_limit: 3,
			inject_phase_reminders: true,
		} as any;

		// Simulate src/index.ts call with potentially undefined directory
		// (though ctx.directory should always be defined in practice)
		const hook = createDelegationTrackerHook(config, true, undefined);
		await hook({ sessionID: 'test-session', agent: 'coder' }, {} as any);

		// Should have been called (with fallback to process.cwd() in the function)
		expect(ensureAgentSession).toHaveBeenCalled();
	});

	// ===== Verify directory is used in ensureAgentSession calls =====

	it('should use ctx.directory in ensureAgentSession during agent dispatch', async () => {
		const config = {
			max_iterations: 5,
			qa_retry_limit: 3,
			inject_phase_reminders: true,
		} as any;
		const ctxDirectory = '/explicit/project/dir';
		const hook = createDelegationTrackerHook(config, true, ctxDirectory);

		// Trigger agent dispatch
		await hook({ sessionID: 'dispatch-test', agent: 'mega_coder' }, {} as any);

		// Verify directory is used in the state management
		expect(ensureAgentSession).toHaveBeenCalledWith(
			'dispatch-test',
			'mega_coder',
			ctxDirectory,
		);
	});

	it('should use ctx.directory when delegation ends (architect takes over)', async () => {
		const config = {
			max_iterations: 5,
			qa_retry_limit: 3,
			inject_phase_reminders: true,
		} as any;
		const ctxDirectory = '/end/delegate/path';
		const hook = createDelegationTrackerHook(config, true, ctxDirectory);

		// First, set up a delegation
		swarmState.activeAgent.set('session-end', 'coder');
		await hook({ sessionID: 'session-end', agent: 'coder' }, {} as any);

		// Now simulate delegation ending (no agent specified)
		await hook({ sessionID: 'session-end', agent: '' }, {} as any);

		// Should have called ensureAgentSession with ctx.directory for architect reset
		expect(ensureAgentSession).toHaveBeenCalledWith(
			'session-end',
			'architect',
			ctxDirectory,
		);
	});
});

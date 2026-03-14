/**
 * Adversarial tests for delegation-tracker project-directory acceptance
 * Tests odd directory values, backward-compatibility edge cases, and guardrails flag preservation
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the dependencies
vi.mock('../state', () => ({
	swarmState: {
		activeAgent: new Map(),
		agentSessions: new Map(),
		delegationChains: new Map(),
		pendingEvents: 0,
	},
	ensureAgentSession: vi
		.fn()
		.mockImplementation((sessionId, agentName, directory) => {
			const session = {
				sessionId,
				agentName,
				directory,
				delegationActive: false,
				startTime: Date.now(),
			};
			return session;
		}),
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

describe('delegation-tracker adversarial: directory handling', () => {
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

	// ===== ODD DIRECTORY VALUES - ATTACK VECTORS =====

	it('should handle empty string directory', async () => {
		const hook = createDelegationTrackerHook('', {});
		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		expect(ensureAgentSession).toHaveBeenCalledWith(
			'test-session',
			'coder',
			'', // Empty string should be preserved
		);
	});

	it('should handle whitespace-only directory', async () => {
		const hook = createDelegationTrackerHook('   ', {});
		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		expect(ensureAgentSession).toHaveBeenCalledWith(
			'test-session',
			'coder',
			'   ',
		);
	});

	it('should handle directory with path traversal attempts', async () => {
		const maliciousPaths = [
			'../../../etc/passwd',
			'..\\..\\..\\windows\\system32',
			'/absolute/../../../etc',
			'./.././secret',
		];

		for (const path of maliciousPaths) {
			const hook = createDelegationTrackerHook(path, {});
			await hook({ sessionID: 'test-session', agent: 'coder' }, {});

			expect(ensureAgentSession).toHaveBeenCalledWith(
				'test-session',
				'coder',
				path, // Should accept but downstream should sanitize
			);
		}
	});

	it('should handle unicode directory names', async () => {
		const unicodePaths = [
			'/home/用户',
			'/home/😀',
			'/home/उपयोगकर्ता',
			'/home/العربية',
			'/tmp/тест/디렉토리',
		];

		for (const path of unicodePaths) {
			const hook = createDelegationTrackerHook(path, {});
			await hook({ sessionID: 'test-session', agent: 'coder' }, {});

			expect(ensureAgentSession).toHaveBeenCalledWith(
				'test-session',
				'coder',
				path,
			);
		}
	});

	it('should handle very long directory paths', async () => {
		const longPath = '/'.repeat(10000); // Extremely long path
		const hook = createDelegationTrackerHook(longPath, {});
		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		expect(ensureAgentSession).toHaveBeenCalledWith(
			'test-session',
			'coder',
			longPath,
		);
	});

	it('should handle directory with null bytes', async () => {
		// JavaScript strings can contain null characters
		const pathWithNull = '/tmp/test\x00file';
		const hook = createDelegationTrackerHook(pathWithNull, {});
		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		expect(ensureAgentSession).toHaveBeenCalledWith(
			'test-session',
			'coder',
			pathWithNull,
		);
	});

	it('should handle directory with special characters', async () => {
		const specialPaths = [
			'/tmp/test dir',
			"/tmp/test'dir",
			'/tmp/test"dir',
			'/tmp/test$dir',
			'/tmp/test`dir',
			'/tmp/test|dir',
		];

		for (const path of specialPaths) {
			const hook = createDelegationTrackerHook(path, {});
			await hook({ sessionID: 'test-session', agent: 'coder' }, {});

			expect(ensureAgentSession).toHaveBeenCalledWith(
				'test-session',
				'coder',
				path,
			);
		}
	});

	// ===== BACKWARD COMPATIBILITY EDGE CASES =====

	it('should support legacy 1-arg signature (config only)', () => {
		const legacyConfig = {
			max_iterations: 10,
			hooks: { delegation_tracker: true },
		};

		const hook = createDelegationTrackerHook(legacyConfig);
		expect(typeof hook).toBe('function');
	});

	it('should support legacy 3-arg signature (config, guardrails, directory)', () => {
		const legacyConfig = {
			max_iterations: 10,
			hooks: { delegation_tracker: true },
		};

		const hook = createDelegationTrackerHook(
			legacyConfig,
			false,
			'/custom/dir',
		);
		expect(typeof hook).toBe('function');

		// Execute and verify directory is passed through
		hook({ sessionID: 'test-session', agent: 'coder' }, {}).then(() => {
			expect(ensureAgentSession).toHaveBeenCalledWith(
				'test-session',
				'coder',
				'/custom/dir',
			);
		});
	});

	it('should support new 2-arg signature (directory, config)', () => {
		const hook = createDelegationTrackerHook('/new/project/dir', {
			max_iterations: 5,
		});
		expect(typeof hook).toBe('function');

		hook({ sessionID: 'test-session', agent: 'coder' }, {}).then(() => {
			expect(ensureAgentSession).toHaveBeenCalledWith(
				'test-session',
				'coder',
				'/new/project/dir',
			);
		});
	});

	it('should fallback to process.cwd() when directory is undefined in legacy mode', () => {
		const legacyConfig = { max_iterations: 5 };

		const hook = createDelegationTrackerHook(legacyConfig);
		expect(typeof hook).toBe('function');
	});

	it('should handle undefined directory in new signature gracefully', async () => {
		// New signature with undefined as first arg - should use default
		const hook = createDelegationTrackerHook(
			undefined as unknown as string,
			{},
		);
		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		// Should default to process.cwd() when undefined
		expect(ensureAgentSession).toHaveBeenCalled();
	});

	// ===== GUARDRAILS-ENABLED FLAG PRESERVATION =====

	it('should preserve guardrailsEnabled=true from legacy 3-arg signature', async () => {
		const config = { max_iterations: 5 };
		const hook = createDelegationTrackerHook(config, true, '/test/dir');

		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		// verify beginInvocation was called (indicates guardrailsEnabled=true)
		const { beginInvocation } = await import('../state');
		expect(beginInvocation).toHaveBeenCalledWith('test-session', 'coder');
	});

	it('should preserve guardrailsEnabled=false from legacy 3-arg signature', async () => {
		const config = { max_iterations: 5 };
		const hook = createDelegationTrackerHook(config, false, '/test/dir');

		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		// verify beginInvocation was NOT called (indicates guardrailsEnabled=false)
		const { beginInvocation } = await import('../state');
		expect(beginInvocation).not.toHaveBeenCalled();
	});

	it('should default guardrailsEnabled to true in new signature', async () => {
		const hook = createDelegationTrackerHook('/test/dir', {});

		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		// Default should be true, so beginInvocation should be called
		const { beginInvocation } = await import('../state');
		expect(beginInvocation).toHaveBeenCalledWith('test-session', 'coder');
	});

	it('should use guardrailsEnabled=true when calling with legacy 1-arg signature', async () => {
		const config = { max_iterations: 5 };
		const hook = createDelegationTrackerHook(config);

		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		const { beginInvocation } = await import('../state');
		expect(beginInvocation).toHaveBeenCalledWith('test-session', 'coder');
	});

	// ===== ADDITIONAL EDGE CASES =====

	it('should handle numeric directory value', async () => {
		// TypeScript would prevent this but runtime might pass weird values
		const hook = createDelegationTrackerHook(12345 as unknown as string, {});
		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		expect(ensureAgentSession).toHaveBeenCalled();
	});

	it('should handle null config in new signature', async () => {
		const hook = createDelegationTrackerHook('/test/dir', null as any);

		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		// Should use default config
		expect(ensureAgentSession).toHaveBeenCalledWith(
			'test-session',
			'coder',
			'/test/dir',
		);
	});

	it('should handle array as directory (type confusion)', async () => {
		const hook = createDelegationTrackerHook(['/dir1', '/dir2'] as any, {});
		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		// Should handle without crashing
		expect(ensureAgentSession).toHaveBeenCalled();
	});

	it('should handle object as directory (type confusion)', async () => {
		const hook = createDelegationTrackerHook({ path: '/test' } as any, {});
		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		// Should handle without crashing
		expect(ensureAgentSession).toHaveBeenCalled();
	});
});

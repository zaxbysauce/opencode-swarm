/**
 * Adversarial tests for delegation-tracker project-directory acceptance
 * Tests odd directory values, backward-compatibility edge cases, and guardrails flag preservation
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { PluginConfig } from '../../../src/config';
import { createDelegationTrackerHook } from '../../../src/hooks/delegation-tracker';
import { resetSwarmState, swarmState } from '../../../src/state';

describe('delegation-tracker adversarial: directory handling', () => {
	const defaultConfig: PluginConfig = {
		max_iterations: 5,
		qa_retry_limit: 3,
		inject_phase_reminders: true,
	};

	beforeEach(() => {
		resetSwarmState();
	});

	afterEach(() => {
		resetSwarmState();
	});

	// ===== ODD DIRECTORY VALUES - ATTACK VECTORS =====
	// The hook accepts various directory values and uses them to call ensureAgentSession
	// We verify it doesn't crash and correctly updates state

	it('should handle empty string directory without crashing', async () => {
		const hook = createDelegationTrackerHook('', defaultConfig);
		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		// Should not crash and should update state
		expect(swarmState.activeAgent.get('test-session')).toBe('coder');
	});

	it('should handle whitespace-only directory', async () => {
		const hook = createDelegationTrackerHook('   ', defaultConfig);
		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		expect(swarmState.activeAgent.get('test-session')).toBe('coder');
	});

	it('should handle directory with path traversal attempts', async () => {
		const maliciousPath = '../../../etc/passwd';
		const hook = createDelegationTrackerHook(maliciousPath, defaultConfig);
		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		// Should accept path traversal - downstream should sanitize
		expect(swarmState.activeAgent.get('test-session')).toBe('coder');
	});

	it('should handle unicode directory names', async () => {
		const unicodePath = '/home/用户';
		const hook = createDelegationTrackerHook(unicodePath, defaultConfig);
		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		expect(swarmState.activeAgent.get('test-session')).toBe('coder');
	});

	it('should handle very long directory paths', async () => {
		const longPath = '/'.repeat(10000);
		const hook = createDelegationTrackerHook(longPath, defaultConfig);
		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		expect(swarmState.activeAgent.get('test-session')).toBe('coder');
	});

	it('should handle directory with null bytes', async () => {
		const pathWithNull = '/tmp/test\x00file';
		const hook = createDelegationTrackerHook(pathWithNull, defaultConfig);
		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		expect(swarmState.activeAgent.get('test-session')).toBe('coder');
	});

	it('should handle directory with special characters', async () => {
		const specialPath = '/tmp/test dir';
		const hook = createDelegationTrackerHook(specialPath, defaultConfig);
		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		expect(swarmState.activeAgent.get('test-session')).toBe('coder');
	});

	// ===== BACKWARD COMPATIBILITY EDGE CASES =====

	it('should support legacy 1-arg signature (config only)', () => {
		const legacyConfig: PluginConfig = {
			max_iterations: 10,
			qa_retry_limit: 3,
			inject_phase_reminders: true,
			hooks: {
				system_enhancer: true,
				compaction: true,
				agent_activity: true,
				delegation_tracker: true,
				delegation_gate: true,
				agent_awareness_max_chars: 300,
				delegation_max_chars: 4000,
			},
		};

		const hook = createDelegationTrackerHook(legacyConfig);
		expect(typeof hook).toBe('function');
	});

	it('should support legacy 3-arg signature (config, guardrails, directory)', async () => {
		const legacyConfig: PluginConfig = {
			max_iterations: 10,
			qa_retry_limit: 3,
			inject_phase_reminders: true,
			hooks: {
				system_enhancer: true,
				compaction: true,
				agent_activity: true,
				delegation_tracker: true,
				delegation_gate: true,
				agent_awareness_max_chars: 300,
				delegation_max_chars: 4000,
			},
		};

		const hook = createDelegationTrackerHook(
			legacyConfig,
			false,
			'/custom/dir',
		);
		expect(typeof hook).toBe('function');

		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		expect(swarmState.activeAgent.get('test-session')).toBe('coder');
	});

	it('should support new 2-arg signature (directory, config)', async () => {
		const hook = createDelegationTrackerHook('/new/project/dir', defaultConfig);
		expect(typeof hook).toBe('function');

		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		expect(swarmState.activeAgent.get('test-session')).toBe('coder');
	});

	it('should fallback to process.cwd() when directory is undefined in legacy mode', async () => {
		const legacyConfig: PluginConfig = {
			max_iterations: 5,
			qa_retry_limit: 3,
			inject_phase_reminders: true,
		};

		const hook = createDelegationTrackerHook(legacyConfig);
		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		expect(swarmState.activeAgent.get('test-session')).toBe('coder');
	});

	it('should handle undefined directory in new signature', async () => {
		const hook = createDelegationTrackerHook(
			undefined as unknown as string,
			defaultConfig,
		);
		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		expect(swarmState.activeAgent.get('test-session')).toBe('coder');
	});

	// ===== GUARDRAILS-ENABLED FLAG PRESERVATION =====
	// The guardrailsEnabled flag controls whether beginInvocation is called
	// When guardrailsEnabled=false, non-architect agents should still be tracked in activeAgent
	// but beginInvocation should NOT be called

	it('should preserve guardrailsEnabled=true from legacy 3-arg signature', async () => {
		const config: PluginConfig = {
			max_iterations: 5,
			qa_retry_limit: 3,
			inject_phase_reminders: true,
		};
		const hook = createDelegationTrackerHook(config, true, '/test/dir');

		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		// Agent should be tracked
		expect(swarmState.activeAgent.get('test-session')).toBe('coder');
		// Session should have delegationActive=true (since it's a non-architect)
		const session = swarmState.agentSessions.get('test-session');
		expect(session?.delegationActive).toBe(true);
	});

	it('should preserve guardrailsEnabled=false from legacy 3-arg signature', async () => {
		const config: PluginConfig = {
			max_iterations: 5,
			qa_retry_limit: 3,
			inject_phase_reminders: true,
		};
		const hook = createDelegationTrackerHook(config, false, '/test/dir');

		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		// Agent should still be tracked (activeAgent is always updated)
		expect(swarmState.activeAgent.get('test-session')).toBe('coder');
		// Note: delegationActive is set based on !isArchitect, not guardrailsEnabled
		// So even with guardrailsEnabled=false, delegationActive=true for non-architect
		const session = swarmState.agentSessions.get('test-session');
		expect(session?.delegationActive).toBe(true); // coder is not architect
	});

	it('should default guardrailsEnabled to true in new signature', async () => {
		const hook = createDelegationTrackerHook('/test/dir', defaultConfig);

		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		// Default should be true - agent tracked and delegationActive set
		expect(swarmState.activeAgent.get('test-session')).toBe('coder');
		const session = swarmState.agentSessions.get('test-session');
		expect(session?.delegationActive).toBe(true);
	});

	it('should use guardrailsEnabled=true when calling with legacy 1-arg signature', async () => {
		const config: PluginConfig = {
			max_iterations: 5,
			qa_retry_limit: 3,
			inject_phase_reminders: true,
		};
		const hook = createDelegationTrackerHook(config);

		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		expect(swarmState.activeAgent.get('test-session')).toBe('coder');
		const session = swarmState.agentSessions.get('test-session');
		expect(session?.delegationActive).toBe(true);
	});

	// ===== ADDITIONAL EDGE CASES =====

	it('should handle numeric directory value', async () => {
		// TypeScript would prevent this but runtime might pass weird values
		const hook = createDelegationTrackerHook(
			12345 as unknown as string,
			defaultConfig,
		);
		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		// Should handle without crashing
		expect(swarmState.activeAgent.get('test-session')).toBe('coder');
	});

	it('should handle null config in new signature', async () => {
		const hook = createDelegationTrackerHook(
			'/test/dir',
			null as unknown as PluginConfig,
		);

		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		// Should use default config
		expect(swarmState.activeAgent.get('test-session')).toBe('coder');
	});

	it('should handle array as directory (type confusion)', async () => {
		const hook = createDelegationTrackerHook(
			['/dir1', '/dir2'] as unknown as string,
			defaultConfig,
		);
		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		// Should handle without crashing
		expect(swarmState.activeAgent.get('test-session')).toBe('coder');
	});

	it('should handle object as directory (type confusion)', async () => {
		const hook = createDelegationTrackerHook(
			{ path: '/test' } as unknown as string,
			defaultConfig,
		);
		await hook({ sessionID: 'test-session', agent: 'coder' }, {});

		// Should handle without crashing
		expect(swarmState.activeAgent.get('test-session')).toBe('coder');
	});
});

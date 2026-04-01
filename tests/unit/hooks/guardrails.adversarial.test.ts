import { beforeEach, describe, expect, it, vi } from 'bun:test';
import type { GuardrailsConfig } from '../../../src/config/schema';
import {
	createGuardrailsHooks,
	getStoredInputArgs,
	hashArgs,
	setStoredInputArgs,
} from '../../../src/hooks/guardrails';
import {
	beginInvocation,
	getActiveWindow,
	getAgentSession,
	resetSwarmState,
	startAgentSession,
} from '../../../src/state';

function defaultConfig(
	overrides?: Partial<GuardrailsConfig>,
): GuardrailsConfig {
	return {
		enabled: true,
		max_tool_calls: 200,
		max_duration_minutes: 30,
		idle_timeout_minutes: 60,
		max_repetitions: 10,
		max_consecutive_errors: 5,
		warning_threshold: 0.75,
		profiles: undefined,
		...overrides,
	};
}

function makeToolBeforeInput(
	sessionID = 'test-session',
	tool = 'read',
	callID = 'call-1',
	args?: Record<string, unknown>,
) {
	return { tool, sessionID, callID, args };
}

function makeToolAfterInput(
	sessionID = 'test-session',
	tool = 'Task',
	callID = 'call-1',
	args?: Record<string, unknown>,
) {
	return { tool, sessionID, callID, args };
}

function makeAfterOutput(output: string = 'success') {
	return { title: 'Result', output, metadata: {} };
}

/**
 * Adversarial security tests for Task 1.2 changes in guardrails.ts
 * Focus: isAgentDelegation function and input.args nullish coalescing fallback
 */
describe('guardrails adversarial - Task 1.2 delegation detection', () => {
	beforeEach(() => {
		resetSwarmState();
		vi.clearAllMocks();
	});

	describe('isAgentDelegation function - edge cases', () => {
		it('should return false when args is null (nullish coalescing fallback)', async () => {
			// Pre-store args for fallback
			setStoredInputArgs('call-1', { subagent_type: 'reviewer' });

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			// toolBefore to set up the window and call count
			await hooks.toolBefore(
				makeToolBeforeInput('test-session', 'Task', 'call-1'),
				{ args: { subagent_type: 'reviewer' } },
			);

			// toolAfter with null args - should fallback to stored args
			await hooks.toolAfter(
				makeToolAfterInput('test-session', 'Task', 'call-1', null as any),
				makeAfterOutput('success'),
			);

			const session = getAgentSession('test-session');
			// Stored args has subagent_type: 'reviewer', so should increment
			const count = session?.reviewerCallCount.get(1) ?? 0;
			expect(count).toBe(1);
		});

		it('should return false when args is undefined (nullish coalescing fallback)', async () => {
			setStoredInputArgs('call-2', { subagent_type: 'test_engineer' });

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			await hooks.toolBefore(
				makeToolBeforeInput('test-session', 'Task', 'call-2'),
				{ args: { subagent_type: 'test_engineer' } },
			);

			// toolAfter without args property - should fallback to stored args
			await hooks.toolAfter(
				makeToolAfterInput('test-session', 'Task', 'call-2'),
				makeAfterOutput('success'),
			);

			const session = getAgentSession('test-session');
			const count = session?.reviewerCallCount.get(1) ?? 0;
			expect(count).toBe(1);
		});

		it('should return false when args is empty object {} - no subagent_type', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			// Empty object - no subagent_type property
			await hooks.toolBefore(
				makeToolBeforeInput('test-session', 'Task', 'call-3'),
				{ args: {} },
			);

			await hooks.toolAfter(
				makeToolAfterInput('test-session', 'Task', 'call-3', {}),
				makeAfterOutput('success'),
			);

			const session = getAgentSession('test-session');
			const count = session?.reviewerCallCount.get(1) ?? 0;
			expect(count).toBe(0);
		});

		it('should return isDelegation=true but NOT increment counter when subagent_type is empty string', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			// Empty string subagent_type - typeof === 'string' is true
			// But empty string should NOT increment reviewer counter
			await hooks.toolBefore(
				makeToolBeforeInput('test-session', 'Task', 'call-4'),
				{ args: { subagent_type: '' } },
			);

			await hooks.toolAfter(
				makeToolAfterInput('test-session', 'Task', 'call-4', {
					subagent_type: '',
				}),
				makeAfterOutput('success'),
			);

			const session = getAgentSession('test-session');
			const count = session?.reviewerCallCount.get(1) ?? 0;
			// Empty string subagent_type passes isAgentDelegation check (typeof === 'string')
			// but targetAgent is '' which is NOT 'reviewer' or 'test_engineer'
			expect(count).toBe(0);
		});

		it('should return false when subagent_type is null', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			// subagent_type: null - typeof null !== 'string'
			await hooks.toolBefore(
				makeToolBeforeInput('test-session', 'Task', 'call-5'),
				{ args: { subagent_type: null } },
			);

			await hooks.toolAfter(
				makeToolAfterInput('test-session', 'Task', 'call-5', {
					subagent_type: null,
				}),
				makeAfterOutput('success'),
			);

			const session = getAgentSession('test-session');
			const count = session?.reviewerCallCount.get(1) ?? 0;
			expect(count).toBe(0);
		});

		it('should return false when subagent_type is undefined', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			await hooks.toolBefore(
				makeToolBeforeInput('test-session', 'Task', 'call-6'),
				{ args: { subagent_type: undefined } },
			);

			await hooks.toolAfter(
				makeToolAfterInput('test-session', 'Task', 'call-6', {
					subagent_type: undefined,
				}),
				makeAfterOutput('success'),
			);

			const session = getAgentSession('test-session');
			const count = session?.reviewerCallCount.get(1) ?? 0;
			expect(count).toBe(0);
		});

		it('should return false when subagent_type is number', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			await hooks.toolBefore(
				makeToolBeforeInput('test-session', 'Task', 'call-7'),
				{ args: { subagent_type: 123 } },
			);

			await hooks.toolAfter(
				makeToolAfterInput('test-session', 'Task', 'call-7', {
					subagent_type: 123 as any,
				}),
				makeAfterOutput('success'),
			);

			const session = getAgentSession('test-session');
			const count = session?.reviewerCallCount.get(1) ?? 0;
			expect(count).toBe(0);
		});

		it('should return false when subagent_type is boolean', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			await hooks.toolBefore(
				makeToolBeforeInput('test-session', 'Task', 'call-8'),
				{ args: { subagent_type: true } },
			);

			await hooks.toolAfter(
				makeToolAfterInput('test-session', 'Task', 'call-8', {
					subagent_type: true as any,
				}),
				makeAfterOutput('success'),
			);

			const session = getAgentSession('test-session');
			const count = session?.reviewerCallCount.get(1) ?? 0;
			expect(count).toBe(0);
		});

		it('should return false when subagent_type is object', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			await hooks.toolBefore(
				makeToolBeforeInput('test-session', 'Task', 'call-9'),
				{ args: { subagent_type: { role: 'reviewer' } } },
			);

			await hooks.toolAfter(
				makeToolAfterInput('test-session', 'Task', 'call-9', {
					subagent_type: { role: 'reviewer' } as any,
				}),
				makeAfterOutput('success'),
			);

			const session = getAgentSession('test-session');
			const count = session?.reviewerCallCount.get(1) ?? 0;
			expect(count).toBe(0);
		});
	});

	describe('input.args primary source with stored args fallback', () => {
		it('should use input.args (primary source) over stored args', async () => {
			// Pre-store args with coder subagent
			setStoredInputArgs('call-10', { subagent_type: 'coder' });

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			await hooks.toolBefore(
				makeToolBeforeInput('test-session', 'Task', 'call-10'),
				{ args: { subagent_type: 'coder' } },
			);

			// toolAfter has input.args with 'reviewer' - should take precedence
			await hooks.toolAfter(
				makeToolAfterInput('test-session', 'Task', 'call-10', {
					subagent_type: 'reviewer',
				}),
				makeAfterOutput('success'),
			);

			const session = getAgentSession('test-session');
			const count = session?.reviewerCallCount.get(1) ?? 0;
			// input.args 'reviewer' wins, so counter increments
			expect(count).toBe(1);
		});

		it('should use stored args when input.args is missing', async () => {
			// Pre-store args with reviewer subagent
			setStoredInputArgs('call-11', { subagent_type: 'reviewer' });

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			await hooks.toolBefore(
				makeToolBeforeInput('test-session', 'Task', 'call-11'),
				{ args: { subagent_type: 'reviewer' } },
			);

			// toolAfter has no args - should fallback to stored args
			await hooks.toolAfter(
				makeToolAfterInput('test-session', 'Task', 'call-11'),
				makeAfterOutput('success'),
			);

			const session = getAgentSession('test-session');
			const count = session?.reviewerCallCount.get(1) ?? 0;
			expect(count).toBe(1);
		});

		it('should use stored args when input.args is undefined', async () => {
			setStoredInputArgs('call-12', { subagent_type: 'test_engineer' });

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			await hooks.toolBefore(
				makeToolBeforeInput('test-session', 'Task', 'call-12'),
				{ args: { subagent_type: 'test_engineer' } },
			);

			// Explicitly pass undefined args
			await hooks.toolAfter(
				makeToolAfterInput('test-session', 'Task', 'call-12', undefined),
				makeAfterOutput('success'),
			);

			const session = getAgentSession('test-session');
			const count = session?.reviewerCallCount.get(1) ?? 0;
			expect(count).toBe(1);
		});
	});

	describe('valid reviewer/test_engineer delegation increments counter', () => {
		it('should increment counter for reviewer delegation', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			await hooks.toolBefore(
				makeToolBeforeInput('test-session', 'Task', 'call-13'),
				{ args: { subagent_type: 'reviewer' } },
			);

			await hooks.toolAfter(
				makeToolAfterInput('test-session', 'Task', 'call-13', {
					subagent_type: 'reviewer',
				}),
				makeAfterOutput('success'),
			);

			const session = getAgentSession('test-session');
			expect(session?.reviewerCallCount.get(1)).toBe(1);
		});

		it('should increment counter for test_engineer delegation', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			await hooks.toolBefore(
				makeToolBeforeInput('test-session', 'Task', 'call-14'),
				{ args: { subagent_type: 'test_engineer' } },
			);

			await hooks.toolAfter(
				makeToolAfterInput('test-session', 'Task', 'call-14', {
					subagent_type: 'test_engineer',
				}),
				makeAfterOutput('success'),
			);

			const session = getAgentSession('test-session');
			expect(session?.reviewerCallCount.get(1)).toBe(1);
		});

		it('should NOT increment counter for coder delegation', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'architect');

			await hooks.toolBefore(
				makeToolBeforeInput('test-session', 'Task', 'call-15'),
				{ args: { subagent_type: 'coder' } },
			);

			await hooks.toolAfter(
				makeToolAfterInput('test-session', 'Task', 'call-15', {
					subagent_type: 'coder',
				}),
				makeAfterOutput('success'),
			);

			const session = getAgentSession('test-session');
			const count = session?.reviewerCallCount.get(1) ?? 0;
			expect(count).toBe(0);
		});
	});

	describe('non-Task tools should not trigger delegation detection', () => {
		it('should ignore non-Task tools', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			// Even with valid subagent_type, non-Task tool should be ignored
			await hooks.toolBefore(
				makeToolBeforeInput('test-session', 'read', 'call-16'),
				{ args: { subagent_type: 'reviewer' } },
			);

			await hooks.toolAfter(
				makeToolAfterInput('test-session', 'read', 'call-16', {
					subagent_type: 'reviewer',
				}),
				makeAfterOutput('success'),
			);

			const session = getAgentSession('test-session');
			const count = session?.reviewerCallCount.get(1) ?? 0;
			expect(count).toBe(0);
		});

		it('should handle Task tool with colon namespace prefix', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			// Task with colon namespace prefix (e.g., "mcp:Task")
			await hooks.toolBefore(
				makeToolBeforeInput('test-session', 'mcp:Task', 'call-17'),
				{ args: { subagent_type: 'reviewer' } },
			);

			await hooks.toolAfter(
				makeToolAfterInput('test-session', 'mcp:Task', 'call-17', {
					subagent_type: 'reviewer',
				}),
				makeAfterOutput('success'),
			);

			const session = getAgentSession('test-session');
			expect(session?.reviewerCallCount.get(1)).toBe(1);
		});

		it('should NOT handle Task tool with double-underscore namespace prefix (current limitation)', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			// Task with __ prefix - regex /^[^:]+[:.]/ does NOT match double-underscore
			// So this is a known limitation of the current implementation
			await hooks.toolBefore(
				makeToolBeforeInput(
					'test-session',
					'mcp__code_executor__Task',
					'call-17',
				),
				{ args: { subagent_type: 'reviewer' } },
			);

			await hooks.toolAfter(
				makeToolAfterInput(
					'test-session',
					'mcp__code_executor__Task',
					'call-17',
					{ subagent_type: 'reviewer' },
				),
				makeAfterOutput('success'),
			);

			const session = getAgentSession('test-session');
			// Current regex doesn't handle __ prefix, so counter is NOT incremented
			const count = session?.reviewerCallCount.get(1) ?? 0;
			expect(count).toBe(0);
		});
	});

	describe('oversized payload handling', () => {
		it('should handle extremely large subagent_type string', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			// Create a very long string
			const largeString = 'a'.repeat(100000);

			await hooks.toolBefore(
				makeToolBeforeInput('test-session', 'Task', 'call-18'),
				{ args: { subagent_type: largeString } },
			);

			await hooks.toolAfter(
				makeToolAfterInput('test-session', 'Task', 'call-18', {
					subagent_type: largeString,
				}),
				makeAfterOutput('success'),
			);

			const session = getAgentSession('test-session');
			// Large string is valid but not 'reviewer' or 'test_engineer'
			const count = session?.reviewerCallCount.get(1) ?? 0;
			expect(count).toBe(0);
		});

		it('should handle args with many properties', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			// Create object with many properties
			const manyProps: Record<string, unknown> = { subagent_type: 'reviewer' };
			for (let i = 0; i < 100; i++) {
				manyProps[`prop${i}`] = `value${i}`;
			}

			await hooks.toolBefore(
				makeToolBeforeInput('test-session', 'Task', 'call-19'),
				{ args: manyProps },
			);

			await hooks.toolAfter(
				makeToolAfterInput('test-session', 'Task', 'call-19', manyProps),
				makeAfterOutput('success'),
			);

			const session = getAgentSession('test-session');
			expect(session?.reviewerCallCount.get(1)).toBe(1);
		});

		it('should handle nested objects in args', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			await hooks.toolBefore(
				makeToolBeforeInput('test-session', 'Task', 'call-20'),
				{ args: { subagent_type: { nested: 'reviewer' } } },
			);

			await hooks.toolAfter(
				makeToolAfterInput('test-session', 'Task', 'call-20', {
					subagent_type: { nested: 'reviewer' } as any,
				}),
				makeAfterOutput('success'),
			);

			const session = getAgentSession('test-session');
			const count = session?.reviewerCallCount.get(1) ?? 0;
			expect(count).toBe(0);
		});
	});

	describe('prefixed agent name stripping (issue: mega_reviewer/mega_test_engineer)', () => {
		it('should increment reviewerCallCount for mega_reviewer delegation', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'architect');

			await hooks.toolBefore(
				makeToolBeforeInput('test-session', 'Task', 'call-prefix-1'),
				{ args: { subagent_type: 'mega_reviewer' } },
			);

			await hooks.toolAfter(
				makeToolAfterInput('test-session', 'Task', 'call-prefix-1', {
					subagent_type: 'mega_reviewer',
				}),
				makeAfterOutput('success'),
			);

			const session = getAgentSession('test-session');
			const count = session?.reviewerCallCount.get(1) ?? 0;
			expect(count).toBe(1);
		});

		it('should increment reviewerCallCount for mega_test_engineer delegation', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'architect');

			await hooks.toolBefore(
				makeToolBeforeInput('test-session', 'Task', 'call-prefix-2'),
				{ args: { subagent_type: 'mega_test_engineer' } },
			);

			await hooks.toolAfter(
				makeToolAfterInput('test-session', 'Task', 'call-prefix-2', {
					subagent_type: 'mega_test_engineer',
				}),
				makeAfterOutput('success'),
			);

			const session = getAgentSession('test-session');
			const count = session?.reviewerCallCount.get(1) ?? 0;
			expect(count).toBe(1);
		});

		it('should increment reviewerCallCount for local_reviewer delegation', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'architect');

			await hooks.toolBefore(
				makeToolBeforeInput('test-session', 'Task', 'call-prefix-3'),
				{ args: { subagent_type: 'local_reviewer' } },
			);

			await hooks.toolAfter(
				makeToolAfterInput('test-session', 'Task', 'call-prefix-3', {
					subagent_type: 'local_reviewer',
				}),
				makeAfterOutput('success'),
			);

			const session = getAgentSession('test-session');
			const count = session?.reviewerCallCount.get(1) ?? 0;
			expect(count).toBe(1);
		});

		it('should NOT increment reviewerCallCount for unprefixed non-reviewer', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'architect');

			await hooks.toolBefore(
				makeToolBeforeInput('test-session', 'Task', 'call-prefix-4'),
				{ args: { subagent_type: 'mega_coder' } },
			);

			await hooks.toolAfter(
				makeToolAfterInput('test-session', 'Task', 'call-prefix-4', {
					subagent_type: 'mega_coder',
				}),
				makeAfterOutput('success'),
			);

			const session = getAgentSession('test-session');
			const count = session?.reviewerCallCount.get(1) ?? 0;
			expect(count).toBe(0);
		});
	});

	describe('hashArgs edge cases', () => {
		it('should handle null args for hashing', () => {
			const { hashArgs } = require('../../../src/hooks/guardrails');
			expect(hashArgs(null)).toBeDefined();
		});

		it('should handle undefined args for hashing', () => {
			const { hashArgs } = require('../../../src/hooks/guardrails');
			expect(hashArgs(undefined)).toBeDefined();
		});

		it('should handle array args for hashing', () => {
			const { hashArgs } = require('../../../src/hooks/guardrails');
			expect(hashArgs([1, 2, 3])).toBeDefined();
		});
	});
});

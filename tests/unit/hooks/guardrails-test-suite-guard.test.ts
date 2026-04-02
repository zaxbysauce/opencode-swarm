import { beforeEach, describe, expect, it } from 'bun:test';
import type { GuardrailsConfig } from '../../../src/config/schema';
import { createGuardrailsHooks } from '../../../src/hooks/guardrails';
import { resetSwarmState, startAgentSession } from '../../../src/state';

const TEST_DIR = '/tmp';

/**
 * Verification tests for the bash test suite execution guard (Task 1.3)
 * Guards against agents running full test suites without a specific file path.
 */
function defaultConfig(): GuardrailsConfig {
	return {
		enabled: true,
		max_tool_calls: 200,
		max_duration_minutes: 30,
		idle_timeout_minutes: 60,
		max_repetitions: 10,
		max_consecutive_errors: 5,
		warning_threshold: 0.75,
		profiles: undefined,
	};
}

function makeBashInput(command: string) {
	return { tool: 'bash' as const, sessionID: 'test-session', callID: 'call-1' };
}

function makeOutput(command: string) {
	return { args: { command } };
}

describe('bash test suite execution guard - verification', () => {
	beforeEach(() => {
		resetSwarmState();
		startAgentSession('test-session', 'coder');
	});

	describe('bun test commands', () => {
		it('blocks "bun test" with no arguments', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(makeBashInput('bun test'), makeOutput('bun test')),
			).rejects.toThrow(
				'BLOCKED: Full test suite execution is not allowed in-session',
			);
		});

		it('blocks "bun test --coverage" (flags only)', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('bun test --coverage'),
					makeOutput('bun test --coverage'),
				),
			).rejects.toThrow(
				'BLOCKED: Full test suite execution is not allowed in-session',
			);
		});

		it('allows "bun test src/tools/foo.test.ts" (file path present)', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('bun test src/tools/foo.test.ts'),
					makeOutput('bun test src/tools/foo.test.ts'),
				),
			).resolves.toBeUndefined();
		});

		it('allows "bun test path/to/file.test.ts --coverage" (file + flags)', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('bun test path/to/file.test.ts --coverage'),
					makeOutput('bun test path/to/file.test.ts --coverage'),
				),
			).resolves.toBeUndefined();
		});
	});

	describe('npm test commands', () => {
		it('blocks "npm test" (no arguments)', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(makeBashInput('npm test'), makeOutput('npm test')),
			).rejects.toThrow(
				'BLOCKED: Full test suite execution is not allowed in-session',
			);
		});

		it('blocks "npm test" with flags only', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('npm test -- --coverage'),
					makeOutput('npm test -- --coverage'),
				),
			).rejects.toThrow(
				'BLOCKED: Full test suite execution is not allowed in-session',
			);
		});
	});

	describe('npx vitest commands', () => {
		it('blocks "npx vitest" (no arguments)', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(makeBashInput('npx vitest'), makeOutput('npx vitest')),
			).rejects.toThrow(
				'BLOCKED: Full test suite execution is not allowed in-session',
			);
		});
	});

	describe('shell tool variant', () => {
		it('blocks full test suite on "shell" tool too', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			const shellInput = {
				tool: 'shell' as const,
				sessionID: 'test-session',
				callID: 'call-1',
			};
			await expect(
				hooks.toolBefore(shellInput, makeOutput('bun test')),
			).rejects.toThrow(
				'BLOCKED: Full test suite execution is not allowed in-session',
			);
		});
	});

	describe('non-matching commands pass through', () => {
		it('allows "echo hello" (not a test runner)', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(makeBashInput('echo hello'), makeOutput('echo hello')),
			).resolves.toBeUndefined();
		});

		it('allows "node test.js" (not a blocked prefix)', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('node test.js'),
					makeOutput('node test.js'),
				),
			).resolves.toBeUndefined();
		});

		it('allows "bun run tests" (bun run, not bun test)', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('bun run tests'),
					makeOutput('bun run tests'),
				),
			).resolves.toBeUndefined();
		});

		it('allows "npx jest" (npx jest, not npx vitest)', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(makeBashInput('npx jest'), makeOutput('npx jest')),
			).resolves.toBeUndefined();
		});
	});
});

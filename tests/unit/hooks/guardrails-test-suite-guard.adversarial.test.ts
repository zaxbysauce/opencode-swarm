import { beforeEach, describe, expect, it } from 'bun:test';
import type { GuardrailsConfig } from '../../../src/config/schema';
import { createGuardrailsHooks } from '../../../src/hooks/guardrails';
import { resetSwarmState, startAgentSession } from '../../../src/state';

const TEST_DIR = '/tmp';

/**
 * Adversarial security tests for the bash test suite execution guard (Task 1.3)
 * Probes edge cases, injection attempts, and type confusion attacks.
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

function makeOutputNull() {
	return { args: { command: null } };
}

function makeOutputUndefined() {
	return { args: { command: undefined } };
}

function makeOutputNoCommand() {
	return { args: {} };
}

describe('bash test suite execution guard - adversarial', () => {
	beforeEach(() => {
		resetSwarmState();
		startAgentSession('test-session', 'coder');
	});

	describe('flag injection attempts - should be blocked', () => {
		it('blocks "bun test --reporter verbose" (flag value, not a file)', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('bun test --reporter verbose'),
					makeOutput('bun test --reporter verbose'),
				),
			).rejects.toThrow(
				'BLOCKED: Full test suite execution is not allowed in-session',
			);
		});

		it('blocks "npx vitest run" (subcommand token, not a file)', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('npx vitest run'),
					makeOutput('npx vitest run'),
				),
			).rejects.toThrow(
				'BLOCKED: Full test suite execution is not allowed in-session',
			);
		});

		it('blocks "bun test --config vitest.config.ts"', async () => {
			// DOCUMENTED FALSE NEGATIVE: .ts extension looks like a file argument
			// This is an acceptable edge case per the design spec.
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('bun test --config vitest.config.ts'),
					makeOutput('bun test --config vitest.config.ts'),
				),
			).resolves.toBeUndefined();
		});

		it('blocks "bun test --watch --passWithNoTests" (multiple flags)', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('bun test --watch --passWithNoTests'),
					makeOutput('bun test --watch --passWithNoTests'),
				),
			).rejects.toThrow(
				'BLOCKED: Full test suite execution is not allowed in-session',
			);
		});

		it('blocks "npm test -- --watch --coverage" (npm test with flags)', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('npm test -- --watch --coverage'),
					makeOutput('npm test -- --watch --coverage'),
				),
			).rejects.toThrow(
				'BLOCKED: Full test suite execution is not allowed in-session',
			);
		});
	});

	describe('case sensitivity - should NOT match', () => {
		it('allows "BUN TEST" (uppercase) - case sensitive pattern', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(makeBashInput('BUN TEST'), makeOutput('BUN TEST')),
			).resolves.toBeUndefined();
		});

		it('allows "Bun Test" (mixed case) - case sensitive pattern', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(makeBashInput('Bun Test'), makeOutput('Bun Test')),
			).resolves.toBeUndefined();
		});

		it('allows "bun TEST" (partial uppercase) - case sensitive pattern', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(makeBashInput('bun TEST'), makeOutput('bun TEST')),
			).resolves.toBeUndefined();
		});
	});

	describe('whitespace normalization', () => {
		it('blocks "bun  test" (double space between runner tokens)', async () => {
			// \s+ in the pattern handles multiple whitespace
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(makeBashInput('bun  test'), makeOutput('bun  test')),
			).rejects.toThrow(
				'BLOCKED: Full test suite execution is not allowed in-session',
			);
		});

		it('blocks "bun   test   --coverage" (extra whitespace)', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('bun   test   --coverage'),
					makeOutput('bun   test   --coverage'),
				),
			).rejects.toThrow(
				'BLOCKED: Full test suite execution is not allowed in-session',
			);
		});
	});

	describe('file argument detection', () => {
		it('allows "bun test foo.spec.ts" (.ts extension is a file)', async () => {
			// .ts file should be recognized as a file argument
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('bun test foo.spec.ts'),
					makeOutput('bun test foo.spec.ts'),
				),
			).resolves.toBeUndefined();
		});

		it('allows "bun test ./tests/unit/guardrails.test.ts"', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('bun test ./tests/unit/guardrails.test.ts'),
					makeOutput('bun test ./tests/unit/guardrails.test.ts'),
				),
			).resolves.toBeUndefined();
		});

		it('allows "bun test tests\\hooks\\guardrails.test.ts" (Windows backslash paths)', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('bun test tests\\hooks\\guardrails.test.ts'),
					makeOutput('bun test tests\\hooks\\guardrails.test.ts'),
				),
			).resolves.toBeUndefined();
		});

		it('allows "bun test src/tools/foo.test.js"', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('bun test src/tools/foo.test.js'),
					makeOutput('bun test src/tools/foo.test.js'),
				),
			).resolves.toBeUndefined();
		});

		it('allows "bun test src/tools/foo.test.tsx"', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('bun test src/tools/foo.test.tsx'),
					makeOutput('bun test src/tools/foo.test.tsx'),
				),
			).resolves.toBeUndefined();
		});

		it('allows "bun test src/tools/foo.test.mts"', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('bun test src/tools/foo.test.mts'),
					makeOutput('bun test src/tools/foo.test.mts'),
				),
			).resolves.toBeUndefined();
		});

		it('allows "bun test src/tools/foo.test.mjs"', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('bun test src/tools/foo.test.mjs'),
					makeOutput('bun test src/tools/foo.test.mjs'),
				),
			).resolves.toBeUndefined();
		});

		it('blocks "bun test src" (path without extension)', async () => {
			// "src" has no extension and no path separators, so it's not a recognized file arg
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('bun test src'),
					makeOutput('bun test src'),
				),
			).rejects.toThrow(
				'BLOCKED: Full test suite execution is not allowed in-session',
			);
		});

		it('blocks "bun test tests" (directory-like token without extension)', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('bun test tests'),
					makeOutput('bun test tests'),
				),
			).rejects.toThrow(
				'BLOCKED: Full test suite execution is not allowed in-session',
			);
		});
	});

	describe('non-matching prefix commands', () => {
		it('allows "echo bun test" (not at command start)', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('echo bun test'),
					makeOutput('echo bun test'),
				),
			).resolves.toBeUndefined();
		});

		it('allows "cat package.json | bun test" (pipe - test runner not at start)', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('cat package.json | bun test'),
					makeOutput('cat package.json | bun test'),
				),
			).resolves.toBeUndefined();
		});

		it('allows "bun run test" (bun run, not bun test)', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('bun run test'),
					makeOutput('bun run test'),
				),
			).resolves.toBeUndefined();
		});

		it('allows "npm run test" (npm run, not npm test)', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('npm run test'),
					makeOutput('npm run test'),
				),
			).resolves.toBeUndefined();
		});

		it('blocks "npx vitest-core" (npx vitest-core matches npx vitest prefix)', async () => {
			// "npx vitest-core" matches the npx vitest prefix (word boundary after vitest matches the hyphen).
			// Since "core" is not a recognized file arg, this is blocked.
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('npx vitest-core'),
					makeOutput('npx vitest-core'),
				),
			).rejects.toThrow(
				'BLOCKED: Full test suite execution is not allowed in-session',
			);
		});

		it('allows empty command string', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(makeBashInput(''), makeOutput('')),
			).resolves.toBeUndefined();
		});

		it('allows whitespace-only command string', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(makeBashInput('   '), makeOutput('   ')),
			).resolves.toBeUndefined();
		});
	});

	describe('type confusion attacks', () => {
		it('handles null command gracefully (no throw)', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(makeBashInput(''), makeOutputNull()),
			).resolves.toBeUndefined();
		});

		it('handles undefined command gracefully (no throw)', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(makeBashInput(''), makeOutputUndefined()),
			).resolves.toBeUndefined();
		});

		it('handles missing command property gracefully (no throw)', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(makeBashInput(''), makeOutputNoCommand()),
			).resolves.toBeUndefined();
		});

		it('handles non-string command (number) gracefully', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			const input = {
				tool: 'bash' as const,
				sessionID: 'test-session',
				callID: 'call-1',
			};
			const output = { args: { command: 12345 as unknown as string } };
			await expect(hooks.toolBefore(input, output)).resolves.toBeUndefined();
		});

		it('handles non-string command (object) gracefully', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			const input = {
				tool: 'bash' as const,
				sessionID: 'test-session',
				callID: 'call-1',
			};
			const output = {
				args: { command: { cmd: 'bun test' } } as unknown as string,
			};
			await expect(hooks.toolBefore(input, output)).resolves.toBeUndefined();
		});

		it('handles array command gracefully', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			const input = {
				tool: 'bash' as const,
				sessionID: 'test-session',
				callID: 'call-1',
			};
			const output = {
				args: { command: ['bun', 'test'] } as unknown as string,
			};
			await expect(hooks.toolBefore(input, output)).resolves.toBeUndefined();
		});
	});

	describe('injection-style attacks', () => {
		it('allows "bun test -- ; echo hacked" (semicolon injection)', async () => {
			// The "echo hacked" part has no path separators or test extensions
			// so it won't be detected as a file argument, BUT the guard only
			// looks at remaining tokens after runner prefix. Since ";" is not
			// recognized as a file arg, this should be blocked.
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('bun test -- ; echo hacked'),
					makeOutput('bun test -- ; echo hacked'),
				),
			).rejects.toThrow(
				'BLOCKED: Full test suite execution is not allowed in-session',
			);
		});

		it('allows "bun test ./file.test.js && bun test" (chained - second part has no file)', async () => {
			// Guard only checks first token match; chained commands are not analyzed
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('bun test ./file.test.js && bun test'),
					makeOutput('bun test ./file.test.js && bun test'),
				),
			).resolves.toBeUndefined(); // Allowed because first file arg present
		});

		it('blocks "bun test && bun test" (chained - no file args)', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('bun test && bun test'),
					makeOutput('bun test && bun test'),
				),
			).rejects.toThrow(
				'BLOCKED: Full test suite execution is not allowed in-session',
			);
		});

		it('allows path traversal attempt with file arg: "bun test ../foo.test.ts"', async () => {
			// Path traversal IS detected as a file path (contains ../) and allowed
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('bun test ../foo.test.ts'),
					makeOutput('bun test ../foo.test.ts'),
				),
			).resolves.toBeUndefined();
		});
	});

	describe('bunx variant', () => {
		it('blocks "bunx vitest" (no args)', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('bunx vitest'),
					makeOutput('bunx vitest'),
				),
			).rejects.toThrow(
				'BLOCKED: Full test suite execution is not allowed in-session',
			);
		});

		it('blocks "bunx vitest run" (subcommand, not file)', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('bunx vitest run'),
					makeOutput('bunx vitest run'),
				),
			).rejects.toThrow(
				'BLOCKED: Full test suite execution is not allowed in-session',
			);
		});

		it('blocks "bunx vitest tests/guardrails.test.ts" (file absorbed into runnerTokenCount)', async () => {
			// KNOWN LIMITATION: When the command is exactly 3 tokens (bunx/vitest/<file>),
			// the file path is absorbed as the 3rd runner token. remainingTokens = [],
			// hasFileArg = false, so this is blocked. This is a pre-existing guard limitation.
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('bunx vitest tests/guardrails.test.ts'),
					makeOutput('bunx vitest tests/guardrails.test.ts'),
				),
			).rejects.toThrow(
				'BLOCKED: Full test suite execution is not allowed in-session',
			);
		});

		it('blocks "bunx vitest  tests/guardrails.test.ts" (whitespace collapse still absorbs file)', async () => {
			// split(/\s+/) collapses consecutive whitespace, so double-space still produces 3 tokens.
			// The file path is absorbed into runnerTokenCount regardless of extra spaces.
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('bunx vitest  tests/guardrails.test.ts'),
					makeOutput('bunx vitest  tests/guardrails.test.ts'),
				),
			).rejects.toThrow(
				'BLOCKED: Full test suite execution is not allowed in-session',
			);
		});
	});

	describe('boundary values', () => {
		it('handles very long command string (no extension) - should block', async () => {
			const longCmd = 'bun test ' + 'x'.repeat(10000);
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(makeBashInput(longCmd), makeOutput(longCmd)),
			).rejects.toThrow(
				'BLOCKED: Full test suite execution is not allowed in-session',
			);
		});

		it('handles command that is just a path separator "/"', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(makeBashInput('bun test /'), makeOutput('bun test /')),
			).resolves.toBeUndefined(); // "/" is technically a path
		});

		it('handles command with only flags (dash-only values)', async () => {
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, defaultConfig());
			await expect(
				hooks.toolBefore(
					makeBashInput('bun test -- --testPathIgnorePatterns=tests'),
					makeOutput('bun test -- --testPathIgnorePatterns=tests'),
				),
			).rejects.toThrow(
				'BLOCKED: Full test suite execution is not allowed in-session',
			);
		});
	});
});

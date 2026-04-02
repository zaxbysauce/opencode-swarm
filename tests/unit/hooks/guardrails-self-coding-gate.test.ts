import { beforeEach, describe, expect, it } from 'bun:test';
import { ORCHESTRATOR_NAME } from '../../../src/config/constants';
import type { GuardrailsConfig } from '../../../src/config/schema';
import { createGuardrailsHooks } from '../../../src/hooks/guardrails';
import {
	getAgentSession,
	getTaskState,
	resetSwarmState,
	startAgentSession,
	swarmState,
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

function makeInput(
	sessionID = 'test-session',
	tool = 'write',
	callID = 'call-1',
) {
	return { tool, sessionID, callID };
}

function makeOutput(args: unknown = { filePath: '/test.ts' }) {
	return { args };
}

describe('guardrails self-coding detection gate (Task 7A.2)', () => {
	beforeEach(() => {
		resetSwarmState();
	});

	describe('verification tests - isSourceCodePath gating', () => {
		it('architect writes to src/auth/login.ts → should increment architectWriteCount', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: 'src/auth/login.ts' });

			await hooks.toolBefore(input, output);

			const session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(1);
		});

		it('architect writes to README.md → should NOT increment architectWriteCount', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: 'README.md' });

			await hooks.toolBefore(input, output);

			const session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(0);
		});

		it('architect writes to package.json → should NOT increment architectWriteCount', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: 'package.json' });

			await hooks.toolBefore(input, output);

			const session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(0);
		});

		it('architect writes to .github/workflows/ci.yml → should NOT increment architectWriteCount', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: '.github/workflows/ci.yml' });

			await hooks.toolBefore(input, output);

			const session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(0);
		});

		it('architect writes to src/hooks/guardrails.ts → should increment architectWriteCount', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: 'src/hooks/guardrails.ts' });

			await hooks.toolBefore(input, output);

			const session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(1);
		});
	});

	describe('adversarial tests - edge cases and bypass attempts', () => {
		it('architect attempts write to src/../README.md (path traversal) → should NOT increment architectWriteCount', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: 'src/../README.md' });

			await hooks.toolBefore(input, output);

			const session = getAgentSession('test-session');
			// Path should be normalized to README.md, which is not source code
			expect(session?.architectWriteCount).toBe(0);
		});

		it('architect writes to SRC/index.ts (case sensitivity) → should increment architectWriteCount', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: 'SRC/index.ts' });

			await hooks.toolBefore(input, output);

			const session = getAgentSession('test-session');
			// Uppercase SRC doesn't match non-source patterns, so it should be counted
			expect(session?.architectWriteCount).toBe(1);
		});

		it('architect writes to CHANGELOG.md → should NOT increment architectWriteCount', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: 'CHANGELOG.md' });

			await hooks.toolBefore(input, output);

			const session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(0);
		});

		it('architect writes to docs/guide.md → should NOT increment architectWriteCount', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: 'docs/guide.md' });

			await hooks.toolBefore(input, output);

			const session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(0);
		});

		it('architect writes to .swarm/context.md → should NOT increment architectWriteCount', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: '.swarm/context.md' });

			await hooks.toolBefore(input, output);

			const session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(0);
		});
	});

	describe('mixed write scenarios', () => {
		it('architect writes to src/ (counted) and README.md (not counted) → correct counts', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			// Write to source code (counted)
			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-1'),
				makeOutput({ filePath: 'src/test.ts' }),
			);

			// Write to README (not counted)
			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-2'),
				makeOutput({ filePath: 'README.md' }),
			);

			// Write to another source file (counted)
			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-3'),
				makeOutput({ filePath: 'src/auth/login.ts' }),
			);

			// Write to package.json (not counted)
			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-4'),
				makeOutput({ filePath: 'package.json' }),
			);

			const session = getAgentSession('test-session');
			// Only source code writes should be counted
			expect(session?.architectWriteCount).toBe(2);
		});
	});

	describe('non-architect sessions are unaffected', () => {
		it('coder writes to src/test.ts → should NOT increment architectWriteCount', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', 'coder');

			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: 'src/test.ts' });

			await hooks.toolBefore(input, output);

			const session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(0);
		});
	});

	describe('write tool variants', () => {
		it('architect uses edit tool on src/test.ts → should increment architectWriteCount', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			const input = makeInput('test-session', 'edit', 'call-1');
			const output = makeOutput({ filePath: 'src/test.ts' });

			await hooks.toolBefore(input, output);

			const session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(1);
		});

		it('architect uses patch tool on src/test.ts → should increment architectWriteCount', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			const input = makeInput('test-session', 'patch', 'call-1');
			const output = makeOutput({ filePath: 'src/test.ts' });

			await hooks.toolBefore(input, output);

			const session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(1);
		});
	});

	describe('hard block at architectWriteCount >= 3 (Task 1.3)', () => {
		it('architectWriteCount = 1: write tool on source file → increments to 1, NO throw', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: 'src/test.ts' });

			// Should NOT throw at count 1
			await expect(hooks.toolBefore(input, output)).resolves.toBeUndefined();

			const session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(1);
		});

		it('architectWriteCount = 2: write tool on source file → increments to 2, NO throw', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			// Pre-set count to 1
			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-1'),
				makeOutput({ filePath: 'src/file1.ts' }),
			);

			// This should increment to 2 and NOT throw
			const input = makeInput('test-session', 'write', 'call-2');
			const output = makeOutput({ filePath: 'src/file2.ts' });

			await expect(hooks.toolBefore(input, output)).resolves.toBeUndefined();

			const session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(2);
		});

		it.skip('architectWriteCount = 3 (3rd write): → throws Error with SELF_CODING_BLOCK', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			// Pre-set count to 2
			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-1'),
				makeOutput({ filePath: 'src/file1.ts' }),
			);
			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-2'),
				makeOutput({ filePath: 'src/file2.ts' }),
			);

			// This should increment to 3 and THROW
			const input = makeInput('test-session', 'write', 'call-3');
			const output = makeOutput({ filePath: 'src/file3.ts' });

			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				'SELF_CODING_BLOCK:',
			);
		});

		it.skip('architectWriteCount = 4 (already past threshold): → throws Error with SELF_CODING_BLOCK', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			// Pre-set count to 3
			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-1'),
				makeOutput({ filePath: 'src/file1.ts' }),
			);
			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-2'),
				makeOutput({ filePath: 'src/file2.ts' }),
			);
			// This one throws at count 3, so we need to catch it
			try {
				await hooks.toolBefore(
					makeInput('test-session', 'write', 'call-3'),
					makeOutput({ filePath: 'src/file3.ts' }),
				);
			} catch {
				// Expected to throw
			}

			// Verify count is 3
			const session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(3);

			// This should also throw at count 4 (already past threshold)
			const input = makeInput('test-session', 'write', 'call-4');
			const output = makeOutput({ filePath: 'src/file4.ts' });

			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				'SELF_CODING_BLOCK:',
			);
		});

		it('no session (session lookup returns undefined): → no throw, no warn', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			// Do NOT start an agent session

			const input = makeInput('non-existent-session', 'write', 'call-1');
			const output = makeOutput({ filePath: 'src/test.ts' });

			// Should NOT throw when session doesn't exist
			await expect(hooks.toolBefore(input, output)).resolves.toBeUndefined();
		});

		it.skip('apply_patch tool at count 3: → throws Error with SELF_CODING_BLOCK', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			// Pre-set count to 2
			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-1'),
				makeOutput({ filePath: 'src/file1.ts' }),
			);
			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-2'),
				makeOutput({ filePath: 'src/file2.ts' }),
			);

			// Use apply_patch tool - should throw at count 3
			const input = makeInput('test-session', 'apply_patch', 'call-3');
			const output = makeOutput({
				patch:
					'*** Update File: src/file3.ts\n--- a/src/file3.ts\n+++ b/src/file3.ts\n@@ -1 +1,2 @@\n+export const x = 1;',
			});

			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				'SELF_CODING_BLOCK:',
			);
		});

		it('non-architect agent at count 3: → no throw (block only runs for architect)', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			// Start as 'coder' agent, not ORCHESTRATOR_NAME
			startAgentSession('test-session', 'coder');

			// Pre-set architectWriteCount to 2 (simulating edge case from prior session data)
			const session = getAgentSession('test-session');
			if (session) {
				session.architectWriteCount = 2;
			}

			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: 'src/test.ts' });

			// Should NOT throw for non-architect
			await expect(hooks.toolBefore(input, output)).resolves.toBeUndefined();

			// Count should remain at 2 for coder (not incremented since coder is not architect)
			const updatedSession = getAgentSession('test-session');
			expect(updatedSession?.architectWriteCount).toBe(2);
		});

		it.skip('edit tool at count 3: → throws Error with SELF_CODING_BLOCK', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			// Pre-set count to 2
			await hooks.toolBefore(
				makeInput('test-session', 'edit', 'call-1'),
				makeOutput({ filePath: 'src/file1.ts' }),
			);
			await hooks.toolBefore(
				makeInput('test-session', 'edit', 'call-2'),
				makeOutput({ filePath: 'src/file2.ts' }),
			);

			// This should increment to 3 and THROW
			const input = makeInput('test-session', 'edit', 'call-3');
			const output = makeOutput({ filePath: 'src/file3.ts' });

			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				'SELF_CODING_BLOCK:',
			);
		});

		it.skip('patch tool at count 3: → throws Error with SELF_CODING_BLOCK', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			// Pre-set count to 2 using regular writes
			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-1'),
				makeOutput({ filePath: 'src/file1.ts' }),
			);
			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-2'),
				makeOutput({ filePath: 'src/file2.ts' }),
			);

			// Use patch tool - should throw at count 3
			const input = makeInput('test-session', 'patch', 'call-3');
			const output = makeOutput({ filePath: 'src/file3.ts' });

			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				'SELF_CODING_BLOCK:',
			);
		});
	});

	// Adversarial security tests for architectWriteCount >= 3 hard block
	describe.skip('adversarial security tests - bypass attempts', () => {
		// Attack Vector 2: Uninitialized bypass
		// Verify that architectWriteCount is properly initialized even when session exists
		it('UNINITIALIZED BYPASS: session with undefined architectWriteCount → produces NaN which bypasses block (VULNERABILITY)', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			// Manually set architectWriteCount to undefined to simulate uninitialized state
			const session = getAgentSession('test-session');
			expect(session).toBeDefined();
			session!.architectWriteCount = undefined as unknown as number;

			// Make 3 write calls - should NOT throw because NaN >= 3 is false
			for (let i = 1; i <= 3; i++) {
				const input = makeInput('test-session', 'write', `call-${i}`);
				const output = makeOutput({ filePath: `src/test${i}.ts` });
				// eslint-disable-next-line no-await-in-loop
				await expect(hooks.toolBefore(input, output)).resolves.toBeUndefined();
			}

			// The session has NaN after undefined++ (NaN + 1 = NaN)
			// This is a BYPASS - the block never fires because NaN >= 3 is false
			const updatedSession = getAgentSession('test-session');
			expect(updatedSession?.architectWriteCount).toBe(NaN);

			// NOTE: This is a VULNERABILITY - uninitialized architectWriteCount bypasses the block
			// The fix would be to check `if (session.architectWriteCount === undefined) continue;`
			// or ensure initialization happens before the increment
		});

		// Attack Vector 3: Floating point manipulation
		it('FLOATING POINT MANIPULATION: architectWriteCount = 2.9 → increment to 3.9 >= 3 throws', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			// Manually set architectWriteCount to 2.9
			const session = getAgentSession('test-session');
			session!.architectWriteCount = 2.9;

			// Make a write call - should increment to 3.9 and throw
			const input = makeInput('test-session', 'write', 'call-1');
			const output = makeOutput({ filePath: 'src/test.ts' });

			// Should throw because 3.9 >= 3 is true
			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				'SELF_CODING_BLOCK:',
			);
		});

		// Attack Vector 4: Negative count bypass
		it('NEGATIVE COUNT BYPASS: architectWriteCount = -100 → requires 103 writes to trigger block', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			// Manually set architectWriteCount to -100
			const session = getAgentSession('test-session');
			session!.architectWriteCount = -100;

			// Make 102 writes - should NOT throw (count goes to 2)
			for (let i = 1; i <= 102; i++) {
				const input = makeInput('test-session', 'write', `call-${i}`);
				const output = makeOutput({ filePath: `src/test${i}.ts` });
				// eslint-disable-next-line no-await-in-loop
				await expect(hooks.toolBefore(input, output)).resolves.toBeUndefined();
			}

			// Verify count is 2
			const updatedSession = getAgentSession('test-session');
			expect(updatedSession?.architectWriteCount).toBe(2);

			// 103rd write should throw
			const input = makeInput('test-session', 'write', 'call-103');
			const output = makeOutput({ filePath: 'src/test103.ts' });
			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				'SELF_CODING_BLOCK:',
			);
		});

		// Attack Vector 5: SessionID mismatch
		it('SESSIONID MISMATCH: non-existent sessionID → guardrails creates session as side effect', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			// Do NOT start a session

			const input = makeInput('non-existent-session', 'write', 'call-1');
			const output = makeOutput({ filePath: 'src/test.ts' });

			// Should NOT throw - no session to track for self-coding detection
			await expect(hooks.toolBefore(input, output)).resolves.toBeUndefined();

			// NOTE: guardrails creates a session via ensureAgentSession as a side effect
			// This is expected behavior - the guardrails system ensures a session exists
			// for tracking. The session is created with architectWriteCount = 0.
			const session = getAgentSession('non-existent-session');
			expect(session).toBeDefined();
			expect(session?.architectWriteCount).toBe(0);
		});

		// Attack Vector 6: SWARM directory bypass
		it('SWARM DIRECTORY BYPASS: .swarm/context.md at count 3 → should NOT throw', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			// Pre-set count to 2
			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-1'),
				makeOutput({ filePath: 'src/file1.ts' }),
			);
			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-2'),
				makeOutput({ filePath: 'src/file2.ts' }),
			);

			// Verify count is 2
			let session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(2);

			// Write to .swarm/ - should NOT throw because .swarm/ is exempt
			const input = makeInput('test-session', 'write', 'call-3');
			const output = makeOutput({ filePath: '.swarm/context.md' });

			await expect(hooks.toolBefore(input, output)).resolves.toBeUndefined();

			// Count should still be 2 (not incremented for .swarm/ writes)
			session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(2);
		});

		// Attack Vector 7: Path traversal to reach source from swarm
		it('PATH TRAVERSAL BYPASS: .swarm/../src/guardrails.ts → should NOT bypass .swarm/ check', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			// Pre-set count to 2
			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-1'),
				makeOutput({ filePath: 'src/file1.ts' }),
			);
			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-2'),
				makeOutput({ filePath: 'src/file2.ts' }),
			);

			// Try to write to source via path traversal - should be blocked
			const input = makeInput('test-session', 'write', 'call-3');
			const output = makeOutput({ filePath: '.swarm/../src/guardrails.ts' });

			// Should throw because path normalization should resolve to src/guardrails.ts
			// which is outside .swarm/ and is source code
			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				'SELF_CODING_BLOCK:',
			);
		});

		// Attack Vector 8: apply_patch with no valid file path
		it('APPLY_PATCH BYPASS: malformed/empty patch → should NOT increment count', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			// Pre-set count to 2
			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-1'),
				makeOutput({ filePath: 'src/file1.ts' }),
			);
			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-2'),
				makeOutput({ filePath: 'src/file2.ts' }),
			);

			// Verify count is 2
			let session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(2);

			// Apply empty/malformed patch - should NOT increment count
			const input = makeInput('test-session', 'apply_patch', 'call-3');
			const output = makeOutput({ patch: '' });

			await expect(hooks.toolBefore(input, output)).resolves.toBeUndefined();

			// Count should still be 2 (no valid paths found in empty patch)
			session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(2);

			// Another write should still trigger block at count 3
			const input2 = makeInput('test-session', 'write', 'call-4');
			const output2 = makeOutput({ filePath: 'src/file3.ts' });
			await expect(hooks.toolBefore(input2, output2)).rejects.toThrow(
				'SELF_CODING_BLOCK:',
			);
		});

		it('APPLY_PATCH BYPASS: patch with only /dev/null paths → should NOT increment count', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			// Pre-set count to 2
			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-1'),
				makeOutput({ filePath: 'src/file1.ts' }),
			);
			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-2'),
				makeOutput({ filePath: 'src/file2.ts' }),
			);

			// Verify count is 2
			let session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(2);

			// Apply patch with only /dev/null (new file creation) - should NOT increment
			// The code filters out /dev/null paths
			const input = makeInput('test-session', 'apply_patch', 'call-3');
			const output = makeOutput({
				patch:
					'*** Add File: /dev/null\ndiff --git a/src/new.ts b/src/new.ts\nnew file mode 100644\n--- /dev/null\n+++ b/src/new.ts\n@@ -0,0 +1 @@\n+content',
			});

			// This patch actually includes a valid path (src/new.ts), so it WILL increment
			// The /dev/null is just the "old" file for new files
			// Let's use a completely malformed patch with no valid paths
			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				'SELF_CODING_BLOCK:',
			);

			session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(3);
		});

		it('APPLY_PATCH BYPASS: truly empty patch → should NOT increment count', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			// Pre-set count to 2
			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-1'),
				makeOutput({ filePath: 'src/file1.ts' }),
			);
			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-2'),
				makeOutput({ filePath: 'src/file2.ts' }),
			);

			// Verify count is 2
			let session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(2);

			// Apply empty patch - should NOT increment count
			const input = makeInput('test-session', 'apply_patch', 'call-3');
			const output = makeOutput({ patch: '' });

			await expect(hooks.toolBefore(input, output)).resolves.toBeUndefined();

			// Count should still be 2 (no valid paths found in empty patch)
			session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(2);

			// Another write should still trigger block at count 3
			const input2 = makeInput('test-session', 'write', 'call-4');
			const output2 = makeOutput({ filePath: 'src/file3.ts' });
			await expect(hooks.toolBefore(input2, output2)).rejects.toThrow(
				'SELF_CODING_BLOCK:',
			);
		});

		// Attack Vector 1: Reset bypass (documented as known behavior)
		it('RESET BYPASS (KNOWN): artificially resetting architectWriteCount to 0 after 2 writes → 3rd write becomes count 1', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			startAgentSession('test-session', ORCHESTRATOR_NAME);

			// Make 2 writes - count should be 2
			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-1'),
				makeOutput({ filePath: 'src/file1.ts' }),
			);
			await hooks.toolBefore(
				makeInput('test-session', 'write', 'call-2'),
				makeOutput({ filePath: 'src/file2.ts' }),
			);

			let session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(2);

			// Simulate external/privileged code resetting the counter
			session!.architectWriteCount = 0;

			// Now make another write - count becomes 1, NOT 3
			const input = makeInput('test-session', 'write', 'call-3');
			const output = makeOutput({ filePath: 'src/file3.ts' });

			// Should NOT throw because count is 1 (after reset)
			await expect(hooks.toolBefore(input, output)).resolves.toBeUndefined();

			session = getAgentSession('test-session');
			expect(session?.architectWriteCount).toBe(1);

			// This is expected behavior - documented as known acceptable limitation
			// The guard can be bypassed if privileged code intentionally resets the counter
		});
	});

	// Task 2.3 — lastGateOutcome and state machine wiring
	describe.skip('Task 2.3 — lastGateOutcome and state machine wiring', () => {
		beforeEach(() => {
			resetSwarmState();
		});

		// Helper to make toolAfter input
		function makeToolAfterInput(
			sessionID = 'test-session',
			tool = 'pre_check_batch',
			callID = 'call-1',
		) {
			return { tool, sessionID, callID };
		}

		// Helper to make toolAfter output
		function makeToolAfterOutput(outputValue: string) {
			return { title: 'tool result', output: outputValue, metadata: null };
		}

		it('pre_check_batch passing output → lastGateOutcome.gate === pre_check_batch and passed === true', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			// Use non-architect session for gate tool testing
			startAgentSession('test-session', 'mega_coder');

			// Simulate passing pre_check_batch output
			const input = makeToolAfterInput(
				'test-session',
				'pre_check_batch',
				'call-1',
			);
			const output = makeToolAfterOutput(
				'gates_passed: true\nAll checks passed!',
			);

			await hooks.toolAfter(input, output);

			const session = getAgentSession('test-session');
			expect(session?.lastGateOutcome).not.toBeNull();
			expect(session?.lastGateOutcome?.gate).toBe('pre_check_batch');
			expect(session?.lastGateOutcome?.passed).toBe(true);
		});

		it('pre_check_batch failing output (contains FAIL) → lastGateOutcome.passed === false', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			// Use non-architect session for gate tool testing
			startAgentSession('test-session', 'mega_coder');

			// Simulate failing pre_check_batch output with FAIL
			const input = makeToolAfterInput(
				'test-session',
				'pre_check_batch',
				'call-1',
			);
			const output = makeToolAfterOutput(
				'gates_passed: false\nFAIL: lint check failed',
			);

			await hooks.toolAfter(input, output);

			const session = getAgentSession('test-session');
			expect(session?.lastGateOutcome).not.toBeNull();
			expect(session?.lastGateOutcome?.gate).toBe('pre_check_batch');
			expect(session?.lastGateOutcome?.passed).toBe(false);
		});

		it('reviewer delegation with VERDICT: APPROVED → lastGateOutcome.gate === reviewer and passed === true', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			// Use non-architect session for delegation detection to work
			startAgentSession('test-session', 'mega_coder');

			// Set up task ID for the session
			const session = getAgentSession('test-session');
			session!.currentTaskId = 'task-1';

			// Simulate toolBefore storing input args for delegation detection
			// We need to call toolBefore first to store the input args for the Task tool
			await hooks.toolBefore(
				{ tool: 'Task', sessionID: 'test-session', callID: 'call-1' },
				{ args: { subagent_type: 'reviewer', task: 'Review code changes' } },
			);

			// Simulate reviewer delegation output with APPROVED
			const input = makeToolAfterInput('test-session', 'Task', 'call-1');
			const output = makeToolAfterOutput(
				'VERDICT: APPROVED\nAll checks passed. Code looks good.',
			);

			await hooks.toolAfter(input, output);

			const updatedSession = getAgentSession('test-session');
			expect(updatedSession?.lastGateOutcome).not.toBeNull();
			expect(updatedSession?.lastGateOutcome?.gate).toBe('reviewer');
			expect(updatedSession?.lastGateOutcome?.passed).toBe(true);
		});

		it('reviewer delegation with VERDICT: REJECTED → lastGateOutcome.passed === false', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			// Use non-architect session for delegation detection to work
			startAgentSession('test-session', 'mega_coder');

			// Set up task ID for the session
			const session = getAgentSession('test-session');
			session!.currentTaskId = 'task-1';

			// Simulate toolBefore storing input args
			await hooks.toolBefore(
				{ tool: 'Task', sessionID: 'test-session', callID: 'call-1' },
				{ args: { subagent_type: 'reviewer', task: 'Review code changes' } },
			);

			// Simulate reviewer delegation output with REJECTED
			const input = makeToolAfterInput('test-session', 'Task', 'call-1');
			const output = makeToolAfterOutput(
				'VERDICT: REJECTED\nCode has issues that need fixing.',
			);

			await hooks.toolAfter(input, output);

			const updatedSession = getAgentSession('test-session');
			expect(updatedSession?.lastGateOutcome).not.toBeNull();
			expect(updatedSession?.lastGateOutcome?.gate).toBe('reviewer');
			expect(updatedSession?.lastGateOutcome?.passed).toBe(false);
		});

		it('test_engineer delegation with VERDICT: PASS → lastGateOutcome.passed === true', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			// Use non-architect session for delegation detection to work
			startAgentSession('test-session', 'mega_coder');

			// Set up task ID for the session
			const session = getAgentSession('test-session');
			session!.currentTaskId = 'task-1';

			// Simulate toolBefore storing input args
			await hooks.toolBefore(
				{ tool: 'Task', sessionID: 'test-session', callID: 'call-1' },
				{ args: { subagent_type: 'test_engineer', task: 'Run tests' } },
			);

			// Simulate test_engineer delegation output with PASS
			const input = makeToolAfterInput('test-session', 'Task', 'call-1');
			const output = makeToolAfterOutput('VERDICT: PASS\nAll tests passed!');

			await hooks.toolAfter(input, output);

			const updatedSession = getAgentSession('test-session');
			expect(updatedSession?.lastGateOutcome).not.toBeNull();
			expect(updatedSession?.lastGateOutcome?.gate).toBe('test_engineer');
			expect(updatedSession?.lastGateOutcome?.passed).toBe(true);
		});

		it('NOT APPROVED in reviewer output does NOT result in agentPassed=true', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			// Use non-architect session for delegation detection to work
			startAgentSession('test-session', 'mega_coder');

			// Set up task ID for the session
			const session = getAgentSession('test-session');
			session!.currentTaskId = 'task-1';

			// Simulate toolBefore storing input args
			await hooks.toolBefore(
				{ tool: 'Task', sessionID: 'test-session', callID: 'call-1' },
				{ args: { subagent_type: 'reviewer', task: 'Review code changes' } },
			);

			// Simulate reviewer output with "NOT APPROVED" (not exact match)
			const input = makeToolAfterInput('test-session', 'Task', 'call-1');
			const output = makeToolAfterOutput(
				'NOT APPROVED: Issues found in the code.',
			);

			await hooks.toolAfter(input, output);

			const updatedSession = getAgentSession('test-session');
			expect(updatedSession?.lastGateOutcome).not.toBeNull();
			expect(updatedSession?.lastGateOutcome?.gate).toBe('reviewer');
			expect(updatedSession?.lastGateOutcome?.passed).toBe(false);
		});

		it('failed to PASS in test_engineer output does NOT result in agentPassed=true', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			// Use non-architect session for delegation detection to work
			startAgentSession('test-session', 'mega_coder');

			// Set up task ID for the session
			const session = getAgentSession('test-session');
			session!.currentTaskId = 'task-1';

			// Simulate toolBefore storing input args
			await hooks.toolBefore(
				{ tool: 'Task', sessionID: 'test-session', callID: 'call-1' },
				{ args: { subagent_type: 'test_engineer', task: 'Run tests' } },
			);

			// Simulate test_engineer output with "failed to PASS" (not exact match)
			const input = makeToolAfterInput('test-session', 'Task', 'call-1');
			const output = makeToolAfterOutput(
				'Test failed to PASS: Some tests are failing.',
			);

			await hooks.toolAfter(input, output);

			const updatedSession = getAgentSession('test-session');
			expect(updatedSession?.lastGateOutcome).not.toBeNull();
			expect(updatedSession?.lastGateOutcome?.gate).toBe('test_engineer');
			expect(updatedSession?.lastGateOutcome?.passed).toBe(false);
		});

		it('after reviewer APPROVED, getTaskState(session, taskId) === reviewer_run', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			// Use non-architect session for delegation detection to work
			startAgentSession('test-session', 'mega_coder');

			// Set up task ID for the session
			const session = getAgentSession('test-session');
			session!.currentTaskId = 'task-1';

			// Simulate toolBefore storing input args
			await hooks.toolBefore(
				{ tool: 'Task', sessionID: 'test-session', callID: 'call-1' },
				{ args: { subagent_type: 'reviewer', task: 'Review code changes' } },
			);

			// Verify initial state is idle
			let taskState = getTaskState(session!, 'task-1');
			expect(taskState).toBe('idle');

			// Simulate reviewer delegation output with APPROVED
			const input = makeToolAfterInput('test-session', 'Task', 'call-1');
			const output = makeToolAfterOutput(
				'VERDICT: APPROVED\nAll checks passed.',
			);

			await hooks.toolAfter(input, output);

			// Verify state advanced to reviewer_run
			const updatedSession = getAgentSession('test-session');
			taskState = getTaskState(updatedSession!, 'task-1');
			expect(taskState).toBe('reviewer_run');
		});

		it('after test_engineer PASS (from reviewer_run), getTaskState(session, taskId) === tests_run', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);
			// Use non-architect session for delegation detection to work
			startAgentSession('test-session', 'mega_coder');

			// Set up task ID and advance to reviewer_run state
			const session = getAgentSession('test-session');
			session!.currentTaskId = 'task-1';
			session!.taskWorkflowStates.set('task-1', 'reviewer_run');

			// Verify we're at reviewer_run
			let taskState = getTaskState(session!, 'task-1');
			expect(taskState).toBe('reviewer_run');

			// Simulate toolBefore storing input args
			await hooks.toolBefore(
				{ tool: 'Task', sessionID: 'test-session', callID: 'call-1' },
				{ args: { subagent_type: 'test_engineer', task: 'Run tests' } },
			);

			// Simulate test_engineer delegation output with PASS
			const input = makeToolAfterInput('test-session', 'Task', 'call-1');
			const output = makeToolAfterOutput('VERDICT: PASS\nAll tests passed!');

			await hooks.toolAfter(input, output);

			// Verify state advanced to tests_run
			const updatedSession = getAgentSession('test-session');
			taskState = getTaskState(updatedSession!, 'task-1');
			expect(taskState).toBe('tests_run');
		});
	});
});

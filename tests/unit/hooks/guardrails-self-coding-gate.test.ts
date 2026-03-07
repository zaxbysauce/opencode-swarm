import { describe, it, expect, beforeEach } from 'bun:test';
import { createGuardrailsHooks } from '../../../src/hooks/guardrails';
import { resetSwarmState, startAgentSession, getAgentSession, swarmState } from '../../../src/state';
import type { GuardrailsConfig } from '../../../src/config/schema';
import { ORCHESTRATOR_NAME } from '../../../src/config/constants';

function defaultConfig(overrides?: Partial<GuardrailsConfig>): GuardrailsConfig {
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

function makeInput(sessionID = 'test-session', tool = 'write', callID = 'call-1') {
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
});

import { beforeEach, describe, expect, test } from 'bun:test';
import type { GuardrailsConfig } from '../../../src/config/schema';
import { createGuardrailsHooks } from '../../../src/hooks/guardrails';
import { resetSwarmState, startAgentSession } from '../../../src/state';

const TEST_DIR = '/tmp';

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
		block_destructive_commands: true,
		...overrides,
	};
}

function makeBashInput(sessionID = 'test-session', command: string) {
	return { tool: 'bash', sessionID, callID: 'call-1' };
}

function makeBashOutput(command: string) {
	return { args: { command } };
}

describe('destructive command guard', () => {
	beforeEach(() => {
		resetSwarmState();
		startAgentSession('test-session', 'coder');
	});

	describe('rm -rf commands', () => {
		test('rm -rf node_modules → ALLOWED', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, config);
			const input = makeBashInput('test-session', 'rm -rf node_modules');
			const output = makeBashOutput('rm -rf node_modules');
			await expect(hooks.toolBefore(input, output)).resolves.toBeUndefined();
		});

		test('rm -rf .git → ALLOWED', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, config);
			const input = makeBashInput('test-session', 'rm -rf .git');
			const output = makeBashOutput('rm -rf .git');
			await expect(hooks.toolBefore(input, output)).resolves.toBeUndefined();
		});

		test('rm -rf / → BLOCKED', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, config);
			const input = makeBashInput('test-session', 'rm -rf /');
			const output = makeBashOutput('rm -rf /');
			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				/BLOCKED: Potentially destructive shell command/,
			);
		});

		test('rm -rf /important → BLOCKED', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, config);
			const input = makeBashInput('test-session', 'rm -rf /important');
			const output = makeBashOutput('rm -rf /important');
			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				/BLOCKED: Potentially destructive shell command/,
			);
		});

		test('rm -rf src/ dist/ → BLOCKED (multiple paths, src/ is not safe)', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, config);
			const input = makeBashInput('test-session', 'rm -rf src/ dist/');
			const output = makeBashOutput('rm -rf src/ dist/');
			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				/BLOCKED: Potentially destructive shell command/,
			);
		});

		test('rm -r -f / → BLOCKED (reversed flags)', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, config);
			const input = makeBashInput('test-session', 'rm -r -f /');
			const output = makeBashOutput('rm -r -f /');
			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				/BLOCKED: Potentially destructive shell command/,
			);
		});

		test('rm --recursive --force / → allowed (long-form flags not detected by current patterns)', async () => {
			// Current patterns only detect -rf combined or -r/-f separate, not long-form --recursive --force
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, config);
			const input = makeBashInput('test-session', 'rm --recursive --force /');
			const output = makeBashOutput('rm --recursive --force /');
			await expect(hooks.toolBefore(input, output)).resolves.toBeUndefined();
		});

		test('rm -rf node_modules/.cache → BLOCKED (node_modules/.cache is not safe)', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, config);
			const input = makeBashInput('test-session', 'rm -rf node_modules/.cache');
			const output = makeBashOutput('rm -rf node_modules/.cache');
			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				/BLOCKED: Potentially destructive shell command/,
			);
		});
	});

	describe('git force push and reset commands', () => {
		test('git push --force → BLOCKED', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, config);
			const input = makeBashInput('test-session', 'git push --force');
			const output = makeBashOutput('git push --force');
			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				/BLOCKED: Force push detected/,
			);
		});

		test('git push -f → BLOCKED', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, config);
			const input = makeBashInput('test-session', 'git push -f');
			const output = makeBashOutput('git push -f');
			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				/BLOCKED: Force push detected/,
			);
		});

		test('git reset --hard → BLOCKED', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, config);
			const input = makeBashInput('test-session', 'git reset --hard');
			const output = makeBashOutput('git reset --hard');
			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				/BLOCKED: "git reset --hard" detected/,
			);
		});

		test('git reset --mixed HEAD~1 → BLOCKED', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, config);
			const input = makeBashInput('test-session', 'git reset --mixed HEAD~1');
			const output = makeBashOutput('git reset --mixed HEAD~1');
			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				/BLOCKED: "git reset --mixed" with a target branch/,
			);
		});
	});

	describe('kubectl and docker commands', () => {
		test('kubectl delete pod app → BLOCKED', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, config);
			const input = makeBashInput('test-session', 'kubectl delete pod app');
			const output = makeBashOutput('kubectl delete pod app');
			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				/BLOCKED: "kubectl delete" detected/,
			);
		});

		test('docker system prune -af → BLOCKED', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, config);
			const input = makeBashInput('test-session', 'docker system prune -af');
			const output = makeBashOutput('docker system prune -af');
			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				/BLOCKED: "docker system prune" detected/,
			);
		});
	});

	describe('fork bomb detection', () => {
		test('Fork bomb compact :(){:|:&};: → BLOCKED', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, config);
			const input = makeBashInput('test-session', ':(){:|:&};:');
			const output = makeBashOutput(':(){:|:&};:');
			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				/BLOCKED: Potentially destructive shell command detected/,
			);
		});

		test('Fork bomb standard :(){ :|:& };: → BLOCKED', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, config);
			const input = makeBashInput('test-session', ':(){ :|:& };:');
			const output = makeBashOutput(':(){ :|:& };:');
			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				/BLOCKED: Potentially destructive shell command detected/,
			);
		});
	});

	describe('safe commands', () => {
		test('ls -la → ALLOWED', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, config);
			const input = makeBashInput('test-session', 'ls -la');
			const output = makeBashOutput('ls -la');
			await expect(hooks.toolBefore(input, output)).resolves.toBeUndefined();
		});

		test('cat file.txt → ALLOWED', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, config);
			const input = makeBashInput('test-session', 'cat file.txt');
			const output = makeBashOutput('cat file.txt');
			await expect(hooks.toolBefore(input, output)).resolves.toBeUndefined();
		});

		test('echo hello → ALLOWED', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, config);
			const input = makeBashInput('test-session', 'echo hello');
			const output = makeBashOutput('echo hello');
			await expect(hooks.toolBefore(input, output)).resolves.toBeUndefined();
		});
	});

	describe('block_destructive_commands disabled', () => {
		test('rm -rf / allowed when block_destructive_commands is false', async () => {
			const config = defaultConfig({ block_destructive_commands: false });
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, config);
			const input = makeBashInput('test-session', 'rm -rf /');
			const output = makeBashOutput('rm -rf /');
			await expect(hooks.toolBefore(input, output)).resolves.toBeUndefined();
		});

		test('git push --force allowed when block_destructive_commands is false', async () => {
			const config = defaultConfig({ block_destructive_commands: false });
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, config);
			const input = makeBashInput('test-session', 'git push --force');
			const output = makeBashOutput('git push --force');
			await expect(hooks.toolBefore(input, output)).resolves.toBeUndefined();
		});
	});

	describe('shell tool also blocked', () => {
		test('rm -rf / blocked when tool is shell', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, config);
			const input = {
				tool: 'shell',
				sessionID: 'test-session',
				callID: 'call-1',
			};
			const output = makeBashOutput('rm -rf /');
			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				/BLOCKED: Potentially destructive shell command/,
			);
		});
	});

	describe('SQL destructive commands', () => {
		test('DROP TABLE → BLOCKED', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, config);
			const input = makeBashInput('test-session', 'DROP TABLE users');
			const output = makeBashOutput('DROP TABLE users');
			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				/BLOCKED: SQL DROP command detected/,
			);
		});

		test('DROP DATABASE → BLOCKED', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, config);
			const input = makeBashInput('test-session', 'DROP DATABASE production');
			const output = makeBashOutput('DROP DATABASE production');
			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				/BLOCKED: SQL DROP command detected/,
			);
		});

		test('TRUNCATE TABLE → BLOCKED', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, config);
			const input = makeBashInput('test-session', 'TRUNCATE TABLE orders');
			const output = makeBashOutput('TRUNCATE TABLE orders');
			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				/BLOCKED: SQL TRUNCATE command detected/,
			);
		});
	});

	describe('mkfs disk format command', () => {
		test('mkfs.ext4 → BLOCKED', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(TEST_DIR, undefined, config);
			const input = makeBashInput('test-session', 'mkfs.ext4 /dev/sda1');
			const output = makeBashOutput('mkfs.ext4 /dev/sda1');
			await expect(hooks.toolBefore(input, output)).rejects.toThrow(
				/BLOCKED: Disk format command \(mkfs\) detected/,
			);
		});
	});
});

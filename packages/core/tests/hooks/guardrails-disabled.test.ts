import { describe, it, expect } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadPluginConfigWithMeta } from '../../src/config/loader';
import { GuardrailsConfigSchema } from '../../src/config/schema';
import { createGuardrailsHooks } from '../../src/hooks/guardrails';

describe('guardrails disabled — end-to-end', () => {
	it('config file with guardrails.enabled:false → createGuardrailsHooks → toolBefore is a noop', async () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-test-'));
		const originalXDG = process.env.XDG_CONFIG_HOME;

		try {
			process.env.XDG_CONFIG_HOME = tempDir;

			const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-proj-'));
			const configDir = path.join(projectDir, '.opencode');
			fs.mkdirSync(configDir, { recursive: true });
			fs.writeFileSync(
				path.join(configDir, 'opencode-swarm.json'),
				JSON.stringify({ guardrails: { enabled: false } }),
			);

			try {
				const { config } = loadPluginConfigWithMeta(projectDir);

				expect(config.guardrails?.enabled).toBe(false);

				const guardrailsConfig = GuardrailsConfigSchema.parse(
					config.guardrails ?? {},
				);
				expect(guardrailsConfig.enabled).toBe(false);

				const hooks = createGuardrailsHooks(guardrailsConfig);

				const result = await hooks.toolBefore(
					{ tool: 'bash', sessionID: 'test-session', callID: 'call-1' },
					{ args: { command: 'echo hello' } },
				);
				expect(result).toBeUndefined();

				const afterResult = await hooks.toolAfter(
					{ tool: 'bash', sessionID: 'test-session', callID: 'call-1' },
					{ title: 'bash', output: 'hello', metadata: {} },
				);
				expect(afterResult).toBeUndefined();
			} finally {
				fs.rmSync(projectDir, { recursive: true, force: true });
			}
		} finally {
			if (originalXDG === undefined) {
				delete process.env.XDG_CONFIG_HOME;
			} else {
				process.env.XDG_CONFIG_HOME = originalXDG;
			}
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('config file with _loadedFromFile:true in JSON → guardrails NOT bypassed', async () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-test-'));
		const originalXDG = process.env.XDG_CONFIG_HOME;

		try {
			process.env.XDG_CONFIG_HOME = tempDir;

			const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-proj-'));
			const configDir = path.join(projectDir, '.opencode');
			fs.mkdirSync(configDir, { recursive: true });
			fs.writeFileSync(
				path.join(configDir, 'opencode-swarm.json'),
				JSON.stringify({ _loadedFromFile: true }),
			);

			try {
				const { config } = loadPluginConfigWithMeta(projectDir);

				expect(Object.prototype.hasOwnProperty.call(config, '_loadedFromFile')).toBe(false);
			} finally {
				fs.rmSync(projectDir, { recursive: true, force: true });
			}
		} finally {
			if (originalXDG === undefined) {
				delete process.env.XDG_CONFIG_HOME;
			} else {
				process.env.XDG_CONFIG_HOME = originalXDG;
			}
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});
});

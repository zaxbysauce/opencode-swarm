import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI_PATH = join(import.meta.dir, '../../../src/cli/index.ts');

async function runCLI(
	args: string[],
	env: Record<string, string> = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(['bun', 'run', CLI_PATH, ...args], {
		env: { ...process.env, ...env },
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const exitCode = await proc.exited;
	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	return { exitCode, stdout, stderr };
}

describe('CLI install command', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'opencode-swarm-test-'));
		// Create the opencode subdirectory
		await mkdir(join(tempDir, 'opencode'), { recursive: true });
	});

	afterEach(async () => {
		if (existsSync(tempDir)) {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	test('Fresh install creates opencode.json with plugin entry', async () => {
		// Setup: Create tempDir with opencode/ subdirectory (no config files)
		const opencodeDir = join(tempDir, 'opencode');
		expect(existsSync(opencodeDir)).toBe(true);
		const opencodeJsonPath = join(opencodeDir, 'opencode.json');
		const configJsonPath = join(opencodeDir, 'config.json');
		expect(existsSync(opencodeJsonPath)).toBe(false);
		expect(existsSync(configJsonPath)).toBe(false);

		// Run: Run install command
		const result = await runCLI(['install'], { XDG_CONFIG_HOME: tempDir });

		// Assert: Exit code 0 and success message
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain(
			'✓ Added opencode-swarm to OpenCode plugins',
		);

		// Assert: opencode.json exists and contains plugin entry
		expect(existsSync(opencodeJsonPath)).toBe(true);
		const configData = JSON.parse(await readFile(opencodeJsonPath, 'utf-8'));
		expect(configData.plugin).toContain('opencode-swarm');

		// Assert: config.json does NOT exist (install writes only to opencode.json)
		expect(existsSync(configJsonPath)).toBe(false);
	});

	test('Migration — install migrates config.json to opencode.json when opencode.json is absent', async () => {
		// Setup: Create config.json with existing plugin and agent config (NO opencode.json)
		const opencodeDir = join(tempDir, 'opencode');
		const configJsonPath = join(opencodeDir, 'config.json');
		const opencodeJsonPath = join(opencodeDir, 'opencode.json');

		const legacyConfig = {
			plugin: ['opencode-swarm'],
			agent: {
				explore: { disable: true },
				general: { disable: true },
			},
		};
		await writeFile(configJsonPath, JSON.stringify(legacyConfig, null, 2));

		// Verify opencode.json does NOT exist yet
		expect(existsSync(opencodeJsonPath)).toBe(false);

		// Run: Run install command
		const result = await runCLI(['install'], { XDG_CONFIG_HOME: tempDir });

		// Assert: Exit code 0
		expect(result.exitCode).toBe(0);

		// Assert: Migration message is logged
		expect(result.stdout).toContain(
			'Migrating existing config from config.json to opencode.json',
		);

		// Assert: opencode.json exists and contains the plugin
		expect(existsSync(opencodeJsonPath)).toBe(true);
		const newConfig = JSON.parse(await readFile(opencodeJsonPath, 'utf-8'));
		expect(newConfig.plugin).toContain('opencode-swarm');

		// Assert: config.json still exists (install does NOT delete the legacy file)
		expect(existsSync(configJsonPath)).toBe(true);
	});

	test('No migration when opencode.json already exists', async () => {
		// Setup: Create opencode.json with other-plugin AND config.json with should-not-be-read
		const opencodeDir = join(tempDir, 'opencode');
		const opencodeJsonPath = join(opencodeDir, 'opencode.json');
		const configJsonPath = join(opencodeDir, 'config.json');

		const existingConfig = {
			plugin: ['other-plugin'],
		};
		await writeFile(opencodeJsonPath, JSON.stringify(existingConfig, null, 2));

		const legacyConfig = {
			plugin: ['should-not-be-read'],
		};
		await writeFile(configJsonPath, JSON.stringify(legacyConfig, null, 2));

		// Run: Run install command
		const result = await runCLI(['install'], { XDG_CONFIG_HOME: tempDir });

		// Assert: Exit code 0
		expect(result.exitCode).toBe(0);

		// Assert: No migration message
		expect(result.stdout).not.toContain('Migrating');

		// Assert: opencode.json contains BOTH plugins
		const updatedConfig = JSON.parse(await readFile(opencodeJsonPath, 'utf-8'));
		expect(updatedConfig.plugin).toContain('other-plugin');
		expect(updatedConfig.plugin).toContain('opencode-swarm');

		// Assert: stdout does NOT contain the legacy plugin name (the legacy file was ignored)
		expect(result.stdout).not.toContain('should-not-be-read');
	});

	test('Install is idempotent — running twice does not duplicate plugin entry', async () => {
		// Setup: Run install once (no prior config)
		const opencodeDir = join(tempDir, 'opencode');
		const opencodeJsonPath = join(opencodeDir, 'opencode.json');

		const result1 = await runCLI(['install'], { XDG_CONFIG_HOME: tempDir });
		expect(result1.exitCode).toBe(0);

		// Run install a second time with the same tempDir
		const result2 = await runCLI(['install'], { XDG_CONFIG_HOME: tempDir });

		// Assert: Exit code 0 on second run
		expect(result2.exitCode).toBe(0);

		// Assert: Plugin array contains exactly ONE entry for opencode-swarm (no duplicates)
		const configData = JSON.parse(await readFile(opencodeJsonPath, 'utf-8'));
		const swarmPlugins = configData.plugin.filter(
			(p: string) => p === 'opencode-swarm',
		);
		expect(swarmPlugins).toHaveLength(1);
	});

	test('Migration with empty config.json creates fresh opencode.json', async () => {
		// Setup: Create config.json with empty config object (NO opencode.json)
		const opencodeDir = join(tempDir, 'opencode');
		const configJsonPath = join(opencodeDir, 'config.json');
		const opencodeJsonPath = join(opencodeDir, 'opencode.json');

		await writeFile(configJsonPath, JSON.stringify({}, null, 2));

		// Verify opencode.json does NOT exist yet
		expect(existsSync(opencodeJsonPath)).toBe(false);

		// Run: Run install command
		const result = await runCLI(['install'], { XDG_CONFIG_HOME: tempDir });

		// Assert: Exit code 0
		expect(result.exitCode).toBe(0);

		// Assert: Migration message is logged
		expect(result.stdout).toContain(
			'Migrating existing config from config.json to opencode.json',
		);

		// Assert: opencode.json exists and plugin array contains opencode-swarm
		expect(existsSync(opencodeJsonPath)).toBe(true);
		const newConfig = JSON.parse(await readFile(opencodeJsonPath, 'utf-8'));
		expect(newConfig.plugin).toContain('opencode-swarm');
	});
});

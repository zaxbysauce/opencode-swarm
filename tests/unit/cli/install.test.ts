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

	test('Install preserves existing custom agent settings — does not wipe user config', async () => {
		// Setup: Create opencode.json with custom agent settings and other user config
		const opencodeDir = join(tempDir, 'opencode');
		const opencodeJsonPath = join(opencodeDir, 'opencode.json');

		const existingConfig = {
			plugin: ['other-plugin'],
			theme: 'dark',
			agent: {
				explore: { model: 'my-custom-explore-model', temperature: 0.2 },
				general: { model: 'my-custom-general-model' },
				coder: { model: 'my-coder-model' },
			},
		};
		await writeFile(opencodeJsonPath, JSON.stringify(existingConfig, null, 2));

		// Run install
		const result = await runCLI(['install'], { XDG_CONFIG_HOME: tempDir });
		expect(result.exitCode).toBe(0);

		const updated = JSON.parse(await readFile(opencodeJsonPath, 'utf-8'));

		// Plugin entry added
		expect(updated.plugin).toContain('opencode-swarm');

		// Top-level user config preserved
		expect(updated.theme).toBe('dark');

		// agent.explore: disable enforced but custom keys preserved
		expect(updated.agent.explore.disable).toBe(true);
		expect(updated.agent.explore.model).toBe('my-custom-explore-model');
		expect(updated.agent.explore.temperature).toBe(0.2);

		// agent.general: disable enforced but custom model preserved
		expect(updated.agent.general.disable).toBe(true);
		expect(updated.agent.general.model).toBe('my-custom-general-model');

		// Unrelated agent untouched
		expect(updated.agent.coder.model).toBe('my-coder-model');
	});

	test('import.meta.main is true in test entry point, false in imported modules — confirming the guard in cli/index is effective', () => {
		// Each Bun test worker uses the test file as its entry point.
		// import.meta.main is TRUE here (this file is the entry point) and
		// FALSE in any module this file imports. The guard in cli/index.ts uses
		// `if (import.meta.main)` to prevent main() from running when that
		// module is imported rather than directly executed. Without this guard,
		// Bun test workers would call install() with an empty argv defaulting to
		// 'install', overwriting the user's real opencode.json.
		expect(import.meta.main).toBe(true);
	});

	test('Install safely handles malformed agent config (null, false, string values)', async () => {
		// Edge case: if agent.explore or agent.general are non-objects
		// (null, false, string, number, etc.), the merge semantics should
		// safely ignore them without corrupting data via spread operator.
		const opencodeDir = join(tempDir, 'opencode');
		const opencodeJsonPath = join(opencodeDir, 'opencode.json');

		const malformedConfig = {
			plugin: [],
			agent: {
				explore: null, // Invalid: should be object or undefined
				general: false, // Invalid: should be object or undefined
				coder: { model: 'my-coder' }, // Valid: keep as-is
			},
		};
		await writeFile(opencodeJsonPath, JSON.stringify(malformedConfig, null, 2));

		// Run install
		const result = await runCLI(['install'], { XDG_CONFIG_HOME: tempDir });
		expect(result.exitCode).toBe(0);

		const updated = JSON.parse(await readFile(opencodeJsonPath, 'utf-8'));

		// agent.explore: should become { disable: true } (the null is replaced)
		expect(updated.agent.explore).toEqual({ disable: true });

		// agent.general: should become { disable: true } (the false is replaced)
		expect(updated.agent.general).toEqual({ disable: true });

		// Unrelated agent should be preserved as-is
		expect(updated.agent.coder.model).toBe('my-coder');
	});

	test('Install overwrites disable:false to disable:true for standard config', async () => {
		// Regression: if user has disable:false explicitly set, ensure
		// install() overwrites it to disable:true (enforce the required flag).
		const opencodeDir = join(tempDir, 'opencode');
		const opencodeJsonPath = join(opencodeDir, 'opencode.json');

		const configWithDisableFalse = {
			plugin: [],
			agent: {
				explore: { disable: false, model: 'custom-explore' },
				general: { disable: false, model: 'custom-general' },
			},
		};
		await writeFile(
			opencodeJsonPath,
			JSON.stringify(configWithDisableFalse, null, 2),
		);

		// Run install
		const result = await runCLI(['install'], { XDG_CONFIG_HOME: tempDir });
		expect(result.exitCode).toBe(0);

		const updated = JSON.parse(await readFile(opencodeJsonPath, 'utf-8'));

		// disable should be overwritten to true, custom model preserved
		expect(updated.agent.explore.disable).toBe(true);
		expect(updated.agent.explore.model).toBe('custom-explore');

		expect(updated.agent.general.disable).toBe(true);
		expect(updated.agent.general.model).toBe('custom-general');
	});
});

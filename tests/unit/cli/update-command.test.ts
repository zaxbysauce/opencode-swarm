/**
 * Tests for `bunx opencode-swarm update` (issue #675).
 *
 * The update subcommand performs a cache-only refresh of OpenCode's plugin
 * cache without touching opencode.json, plugin config, or custom prompts.
 * It exists because users who never re-run `install` silently keep running
 * a stale cached copy forever.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI_PATH = join(
	import.meta.dir,
	'..',
	'..',
	'..',
	'src',
	'cli',
	'index.ts',
);

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

describe('CLI update command', () => {
	let tempDir: string;
	let xdgCacheHome: string;
	let xdgConfigHome: string;
	let xdgCachePluginPath: string;
	let nodeModulesPluginPath: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'opencode-swarm-update-'));
		xdgCacheHome = join(tempDir, 'cache');
		xdgConfigHome = join(tempDir, 'config');
		xdgCachePluginPath = join(
			xdgCacheHome,
			'opencode',
			'packages',
			'opencode-swarm@latest',
		);
		nodeModulesPluginPath = join(
			xdgConfigHome,
			'opencode',
			'node_modules',
			'opencode-swarm',
		);
	});

	afterEach(async () => {
		if (existsSync(tempDir)) {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	test('clears XDG cache layout when present', async () => {
		await mkdir(xdgCachePluginPath, { recursive: true });
		await writeFile(
			join(xdgCachePluginPath, 'package.json'),
			'{"name":"stale"}',
		);

		const result = await runCLI(['update'], {
			XDG_CACHE_HOME: xdgCacheHome,
			XDG_CONFIG_HOME: xdgConfigHome,
		});

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('✓ Cleared');
		expect(result.stdout).toContain('opencode-swarm@latest');
		expect(existsSync(xdgCachePluginPath)).toBe(false);
	});

	test('clears node_modules layout when present (Linux/devcontainer)', async () => {
		await mkdir(nodeModulesPluginPath, { recursive: true });
		await writeFile(
			join(nodeModulesPluginPath, 'package.json'),
			'{"name":"stale"}',
		);

		const result = await runCLI(['update'], {
			XDG_CACHE_HOME: xdgCacheHome,
			XDG_CONFIG_HOME: xdgConfigHome,
		});

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('✓ Cleared');
		expect(result.stdout).toContain('node_modules');
		expect(existsSync(nodeModulesPluginPath)).toBe(false);
	});

	test('clears BOTH layouts when both are present', async () => {
		await mkdir(xdgCachePluginPath, { recursive: true });
		await mkdir(nodeModulesPluginPath, { recursive: true });

		const result = await runCLI(['update'], {
			XDG_CACHE_HOME: xdgCacheHome,
			XDG_CONFIG_HOME: xdgConfigHome,
		});

		expect(result.exitCode).toBe(0);
		expect(existsSync(xdgCachePluginPath)).toBe(false);
		expect(existsSync(nodeModulesPluginPath)).toBe(false);
		// Both paths should appear in the cleared output
		expect(result.stdout.match(/✓ Cleared/g)?.length).toBeGreaterThanOrEqual(2);
	});

	test('reports nothing-to-do when no cache exists in either layout', async () => {
		const result = await runCLI(['update'], {
			XDG_CACHE_HOME: xdgCacheHome,
			XDG_CONFIG_HOME: xdgConfigHome,
		});

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('No cached plugin found');
		expect(result.stdout).toContain('Checked locations:');
	});

	test('is idempotent — second run still exits 0', async () => {
		await mkdir(xdgCachePluginPath, { recursive: true });

		const first = await runCLI(['update'], {
			XDG_CACHE_HOME: xdgCacheHome,
			XDG_CONFIG_HOME: xdgConfigHome,
		});
		expect(first.exitCode).toBe(0);
		expect(existsSync(xdgCachePluginPath)).toBe(false);

		const second = await runCLI(['update'], {
			XDG_CACHE_HOME: xdgCacheHome,
			XDG_CONFIG_HOME: xdgConfigHome,
		});
		expect(second.exitCode).toBe(0);
		expect(second.stdout).toContain('No cached plugin found');
	});

	test('does not touch opencode.json or opencode-swarm.json', async () => {
		// Pre-create both cache layouts AND user config files; assert only the
		// cache directories are removed.
		await mkdir(xdgCachePluginPath, { recursive: true });
		const opencodeJson = join(xdgConfigHome, 'opencode', 'opencode.json');
		const pluginJson = join(xdgConfigHome, 'opencode', 'opencode-swarm.json');
		await mkdir(join(xdgConfigHome, 'opencode'), { recursive: true });
		const originalOpencode = '{"plugin":["something-else"]}\n';
		const originalPlugin = '{"agents":{"existing":{"model":"keep"}}}\n';
		await writeFile(opencodeJson, originalOpencode);
		await writeFile(pluginJson, originalPlugin);

		const result = await runCLI(['update'], {
			XDG_CACHE_HOME: xdgCacheHome,
			XDG_CONFIG_HOME: xdgConfigHome,
		});

		expect(result.exitCode).toBe(0);
		expect(existsSync(xdgCachePluginPath)).toBe(false);
		expect(await Bun.file(opencodeJson).text()).toBe(originalOpencode);
		expect(await Bun.file(pluginJson).text()).toBe(originalPlugin);
	});

	test('--help lists update as a top-level command', async () => {
		const result = await runCLI(['--help']);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('update');
		expect(result.stdout).toContain(
			"Refresh OpenCode's plugin cache so the next start fetches latest from npm",
		);
	});
});

#!/usr/bin/env bun
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import packageJson from '../../package.json' with { type: 'json' };
import { resolveCommand, VALID_COMMANDS } from '../commands/registry.js';

const { version } = packageJson;

const CONFIG_DIR = path.join(
	process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
	'opencode',
);

const OPENCODE_CONFIG_PATH = path.join(CONFIG_DIR, 'opencode.json');
const PLUGIN_CONFIG_PATH = path.join(CONFIG_DIR, 'opencode-swarm.json');
const PROMPTS_DIR = path.join(CONFIG_DIR, 'opencode-swarm');

// OpenCode caches plugins in two layouts depending on the host:
// 1. XDG cache layout (some Windows + macOS installs):
//    `~/.cache/opencode/packages/opencode-swarm@latest/`
// 2. node_modules layout (most Linux installs, devcontainers, GitHub
//    Codespaces): `~/.config/opencode/node_modules/opencode-swarm/`
//    OpenCode keeps a `package.json` + `package-lock.json` at CONFIG_DIR and
//    npm-installs plugins into a sibling `node_modules/` (issue #675).
//
// `update` and `install` evict both layouts so a stale cache anywhere is
// guaranteed to be refreshed on the next opencode startup.
const OPENCODE_PLUGIN_CACHE_PATHS: readonly string[] = [
	path.join(
		process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'),
		'opencode',
		'packages',
		'opencode-swarm@latest',
	),
	path.join(CONFIG_DIR, 'node_modules', 'opencode-swarm'),
];

// Safety floor: refuse to recursively delete a path that would be a
// catastrophic deletion (root, home directory, etc.). The cache paths above
// are derived from env-vars that, if pathologically set (e.g., XDG_CACHE_HOME=/),
// would have us rm-rf'ing the user's filesystem. This guard rejects any path
// shorter than the depth a real cache directory would have.
function isSafeCachePath(p: string): boolean {
	const resolved = path.resolve(p);
	const home = path.resolve(os.homedir());
	if (resolved === '/' || resolved === home || resolved.length <= home.length)
		return false;
	// Cache paths must end in a known cache leaf to limit blast radius
	// even if someone redirects an env var.
	const leaf = path.basename(resolved);
	return leaf === 'opencode-swarm@latest' || leaf === 'opencode-swarm';
}

interface OpenCodeConfig {
	plugin?: string[];
	agent?: Record<string, unknown>;
	[key: string]: unknown;
}

function ensureDir(dir: string): void {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
}

function loadJson<T>(filepath: string): T | null {
	try {
		const content = fs.readFileSync(filepath, 'utf-8');
		// Strip comments for JSONC support
		const stripped = content
			.replace(
				/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g,
				(match, comment) => (comment ? '' : match),
			)
			.replace(/,(\s*[}\]])/g, '$1');
		return JSON.parse(stripped) as T;
	} catch {
		return null;
	}
}

function saveJson(filepath: string, data: unknown): void {
	fs.writeFileSync(filepath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

function writeProjectConfigIfMissing(cwd: string): void {
	try {
		const opencodeDir = path.join(cwd, '.opencode');
		const projectConfigPath = path.join(opencodeDir, 'opencode-swarm.json');

		// Only write if file doesn't already exist
		if (fs.existsSync(projectConfigPath)) {
			return;
		}

		// Create .opencode/ directory if it doesn't exist
		ensureDir(opencodeDir);

		// Write minimal starter content
		const starterConfig = { agents: {} };
		saveJson(projectConfigPath, starterConfig);
		console.log('✓ Created project config at:', projectConfigPath);
	} catch (error) {
		console.warn(
			'⚠ Could not create project config — installation will continue:',
		);
		console.warn(`  ${error instanceof Error ? error.message : String(error)}`);
	}
}

async function install(): Promise<number> {
	console.log('🐝 Installing OpenCode Swarm...\n');

	// Ensure config directory exists
	ensureDir(CONFIG_DIR);
	ensureDir(PROMPTS_DIR);

	// Load or create OpenCode config
	// Migration: if opencode.json doesn't exist but config.json does (old installer bug), use config.json as starting state
	const LEGACY_CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
	let opencodeConfig = loadJson<OpenCodeConfig>(OPENCODE_CONFIG_PATH);
	if (!opencodeConfig) {
		const legacyConfig = loadJson<OpenCodeConfig>(LEGACY_CONFIG_PATH);
		if (legacyConfig) {
			console.log(
				'⚠ Migrating existing config from config.json to opencode.json...',
			);
			opencodeConfig = legacyConfig;
		} else {
			opencodeConfig = {};
		}
	}

	// Add plugin to OpenCode config (note: 'plugin' not 'plugins')
	if (!opencodeConfig.plugin) {
		opencodeConfig.plugin = [];
	}

	const pluginName = 'opencode-swarm';

	// Remove any existing entries for this plugin
	opencodeConfig.plugin = opencodeConfig.plugin.filter(
		(p) => p !== pluginName && !p.startsWith(`${pluginName}@`),
	);

	// Add fresh entry
	opencodeConfig.plugin.push(pluginName);

	// Disable OpenCode's default agents to avoid conflicts.
	// Use merge semantics to preserve any custom settings (e.g. model) the user
	// may have configured — only enforce disable:true, don't wipe other keys.
	// Safely handle edge cases where agent.explore/general might be non-objects
	// (null, false, string, etc.) to avoid data corruption from spread operator.
	if (!opencodeConfig.agent) {
		opencodeConfig.agent = {};
	}
	opencodeConfig.agent.explore = {
		...(typeof opencodeConfig.agent.explore === 'object' &&
		opencodeConfig.agent.explore !== null
			? (opencodeConfig.agent.explore as Record<string, unknown>)
			: {}),
		disable: true,
	};
	opencodeConfig.agent.general = {
		...(typeof opencodeConfig.agent.general === 'object' &&
		opencodeConfig.agent.general !== null
			? (opencodeConfig.agent.general as Record<string, unknown>)
			: {}),
		disable: true,
	};

	saveJson(OPENCODE_CONFIG_PATH, opencodeConfig);
	console.log('✓ Added opencode-swarm to OpenCode plugins');
	console.log('✓ Disabled default OpenCode agents (explore, general)');

	// Evict the opencode plugin cache so the next startup pulls the latest version
	// from npm. opencode's Npm.add() is cache-first with no staleness check — once
	// the directory exists it is returned verbatim on every subsequent start,
	// ignoring all npm updates. Clearing it here ensures `bunx opencode-swarm install`
	// actually upgrades the running version, not just the config registration.
	const evicted = evictPluginCaches();
	if (evicted.cleared.length > 0) {
		console.log(
			`✓ Cleared opencode plugin cache (next start will fetch latest): ${evicted.cleared.join(', ')}`,
		);
	}
	for (const failed of evicted.failed) {
		console.warn(
			`⚠ Could not clear opencode plugin cache — you may need to delete it manually:\n  ${failed}`,
		);
	}

	// Create default plugin config if not exists
	if (!fs.existsSync(PLUGIN_CONFIG_PATH)) {
		const defaultConfig = {
			// Must match PluginConfigSchema in src/config/schema.ts
			// v6.14: free OpenCode Zen models; v6.73+ switched to big-pickle with gpt-5-nano fallback; architect inherits OpenCode UI selection
			// v6.85+: Multi-level fallback chains - only big-pickle and gpt-5-nano are consistently available in free tier
			agents: {
				coder: {
					model: 'opencode/minimax-m2.5-free',
					fallback_models: ['opencode/gpt-5-nano', 'opencode/big-pickle'],
				},
				reviewer: {
					model: 'opencode/big-pickle',
					fallback_models: ['opencode/gpt-5-nano', 'opencode/big-pickle'],
				},
				test_engineer: {
					model: 'opencode/gpt-5-nano',
					fallback_models: ['opencode/big-pickle'],
				},
				explorer: {
					model: 'opencode/big-pickle',
					fallback_models: ['opencode/gpt-5-nano', 'opencode/big-pickle'],
				},
				sme: {
					model: 'opencode/big-pickle',
					fallback_models: ['opencode/gpt-5-nano', 'opencode/big-pickle'],
				},
				critic: {
					model: 'opencode/big-pickle',
					fallback_models: ['opencode/gpt-5-nano', 'opencode/big-pickle'],
				},
				docs: {
					model: 'opencode/big-pickle',
					fallback_models: ['opencode/gpt-5-nano', 'opencode/big-pickle'],
				},
				designer: {
					model: 'opencode/big-pickle',
					fallback_models: ['opencode/gpt-5-nano', 'opencode/big-pickle'],
				},
				critic_sounding_board: {
					model: 'opencode/gpt-5-nano',
					fallback_models: ['opencode/big-pickle'],
				},
				critic_drift_verifier: {
					model: 'opencode/gpt-5-nano',
					fallback_models: ['opencode/big-pickle'],
				},
				critic_hallucination_verifier: {
					model: 'opencode/gpt-5-nano',
					fallback_models: ['opencode/big-pickle'],
				},
				critic_oversight: {
					model: 'opencode/gpt-5-nano',
					fallback_models: ['opencode/big-pickle'],
				},
				curator_init: {
					model: 'opencode/gpt-5-nano',
					fallback_models: ['opencode/big-pickle'],
				},
				curator_phase: {
					model: 'opencode/gpt-5-nano',
					fallback_models: ['opencode/big-pickle'],
				},
				council_member: {
					model: 'opencode/gpt-5-nano',
					fallback_models: ['opencode/big-pickle'],
				},
				council_moderator: {
					model: 'opencode/gpt-5-nano',
					fallback_models: ['opencode/big-pickle'],
				},
			},
			max_iterations: 5,
		};
		saveJson(PLUGIN_CONFIG_PATH, defaultConfig);
		console.log('✓ Created default plugin config at:', PLUGIN_CONFIG_PATH);
	} else {
		console.log('✓ Plugin config already exists at:', PLUGIN_CONFIG_PATH);
	}

	// Create project-level config if not exists
	writeProjectConfigIfMissing(process.cwd());

	console.log('\n📁 Configuration files:');
	console.log(`   OpenCode config: ${OPENCODE_CONFIG_PATH}`);
	console.log(`   Plugin config:   ${PLUGIN_CONFIG_PATH}`);
	console.log(`   Custom prompts:  ${PROMPTS_DIR}/`);

	console.log('\n🚀 Installation complete!');
	console.log('\nNext steps:');
	console.log('1. Run "opencode" in your project directory');
	console.log(
		'2. Select the Architect agent in the OpenCode agent/mode dropdown',
	);
	console.log(
		'3. Ask it anything — the Architect coordinates all other agents automatically',
	);
	console.log(
		'4. Run /swarm diagnose inside OpenCode to confirm the plugin loaded',
	);
	console.log('   (also try: /swarm agents  /swarm config)');

	console.log('\n💡 Model configuration:');
	console.log(`   Global config: ${PLUGIN_CONFIG_PATH}`);
	console.log(
		'   Project override: .opencode/opencode-swarm.json  (create in your project root)',
	);
	console.log(
		'   On first OpenCode startup, .swarm/config.example.json will be written to your project root',
	);
	console.log('   — use it as a reference for customizing model assignments.');

	return 0;
}

/**
 * Cache-only refresh: deletes opencode's cached copy of opencode-swarm@latest so
 * the next opencode startup re-fetches from npm. Lighter than `install` — does
 * not touch opencode.json, plugin config, or custom prompts.
 *
 * Motivation: opencode's Npm.add() is cache-first with no staleness check on
 * `@latest`-tagged plugins (see comment in install()). Users who never re-run
 * `install` silently keep running an old version forever (issue #675).
 */
async function update(): Promise<number> {
	console.log('🐝 Refreshing OpenCode Swarm plugin cache...\n');
	const result = evictPluginCaches();
	if (result.cleared.length > 0) {
		for (const cleared of result.cleared) {
			console.log(`✓ Cleared: ${cleared}`);
		}
		console.log('\nRestart OpenCode to fetch the latest version from npm.');
	}
	if (result.cleared.length === 0 && result.failed.length === 0) {
		console.log(
			'No cached plugin found. Restart OpenCode to fetch the latest version from npm.',
		);
		console.log('Checked locations:');
		for (const p of OPENCODE_PLUGIN_CACHE_PATHS) {
			console.log(`  - ${p}`);
		}
	}
	if (result.failed.length > 0) {
		for (const failed of result.failed) {
			console.error(`✗ Could not clear: ${failed}`);
		}
		return 1;
	}
	return 0;
}

/**
 * Recursively delete every known opencode plugin cache location for
 * opencode-swarm. Returns paths actually cleared and paths that errored.
 * Skips paths that don't exist or fail the safety guard.
 */
function evictPluginCaches(): { cleared: string[]; failed: string[] } {
	const cleared: string[] = [];
	const failed: string[] = [];
	for (const cachePath of OPENCODE_PLUGIN_CACHE_PATHS) {
		if (!fs.existsSync(cachePath)) continue;
		if (!isSafeCachePath(cachePath)) {
			failed.push(`${cachePath} (refused: failed safety check)`);
			continue;
		}
		try {
			fs.rmSync(cachePath, { recursive: true, force: true });
			cleared.push(cachePath);
		} catch (err) {
			failed.push(
				`${cachePath} (${err instanceof Error ? err.message : String(err)})`,
			);
		}
	}
	return { cleared, failed };
}

async function uninstall(): Promise<number> {
	try {
		console.log('🐝 Uninstalling OpenCode Swarm...\n');

		// Load opencode config
		const opencodeConfig = loadJson<OpenCodeConfig>(OPENCODE_CONFIG_PATH);

		// If config is null
		if (!opencodeConfig) {
			// Check if the file exists
			if (fs.existsSync(OPENCODE_CONFIG_PATH)) {
				// It's malformed JSON
				console.log(
					`✗ Could not parse opencode config at: ${OPENCODE_CONFIG_PATH}`,
				);
				return 1;
			} else {
				// File doesn't exist
				console.log(`⚠ No opencode config found at: ${OPENCODE_CONFIG_PATH}`);
				console.log('Nothing to uninstall.');
				return 0;
			}
		}

		// If config has no plugin array or it's empty
		if (!opencodeConfig.plugin || opencodeConfig.plugin.length === 0) {
			console.log('⚠ opencode-swarm is not installed (no plugins configured).');
			return 0;
		}

		// Filter out 'opencode-swarm' and entries starting with 'opencode-swarm@'
		const pluginName = 'opencode-swarm';
		const filteredPlugins = opencodeConfig.plugin.filter(
			(p) => p !== pluginName && !p.startsWith(`${pluginName}@`),
		);

		// If array length didn't change (plugin wasn't found)
		if (filteredPlugins.length === opencodeConfig.plugin.length) {
			console.log('⚠ opencode-swarm is not installed.');
			return 0;
		}

		// Update config and save
		opencodeConfig.plugin = filteredPlugins;

		// Remove the disabled agent overrides
		if (opencodeConfig.agent) {
			delete opencodeConfig.agent.explore;
			delete opencodeConfig.agent.general;

			// If agent is now empty, delete it too
			if (Object.keys(opencodeConfig.agent).length === 0) {
				delete opencodeConfig.agent;
			}
		}

		// Save the updated config
		saveJson(OPENCODE_CONFIG_PATH, opencodeConfig);
		console.log('✓ Removed opencode-swarm from OpenCode plugins');
		console.log('✓ Re-enabled default OpenCode agents (explore, general)');

		// Check for --clean flag
		if (process.argv.includes('--clean')) {
			let cleaned = false;

			// If PLUGIN_CONFIG_PATH exists: delete it
			if (fs.existsSync(PLUGIN_CONFIG_PATH)) {
				fs.unlinkSync(PLUGIN_CONFIG_PATH);
				console.log(`✓ Removed plugin config: ${PLUGIN_CONFIG_PATH}`);
				cleaned = true;
			}

			// If PROMPTS_DIR exists: delete it recursively
			if (fs.existsSync(PROMPTS_DIR)) {
				fs.rmSync(PROMPTS_DIR, { recursive: true });
				console.log(`✓ Removed custom prompts: ${PROMPTS_DIR}`);
				cleaned = true;
			}

			// If neither exists
			if (!cleaned) {
				console.log('✓ No config files to clean up');
			}
		}

		console.log('\n✅ Uninstall complete!');
		return 0;
	} catch (error) {
		console.log(
			'✗ Uninstall failed: ' +
				(error instanceof Error ? error.message : String(error)),
		);
		return 1;
	}
}

function printHelp(): void {
	const commandList = VALID_COMMANDS.filter((cmd) => !cmd.includes(' '))
		.map((cmd) => `  ${cmd}`)
		.join('\n');
	console.log(`
opencode-swarm - Architect-centric agentic swarm plugin for OpenCode

Usage: bunx opencode-swarm [command] [OPTIONS]

Commands:
  install     Install and configure the plugin (default)
  update      Refresh OpenCode's plugin cache so the next start fetches latest from npm
  uninstall   Remove the plugin from OpenCode config
  run         Run a plugin command directly (for use outside OpenCode)

Options:
  --clean     Also remove config files and custom prompts (with uninstall)
  -h, --help  Show this help message

Run subcommands:
${commandList}

Configuration:
  Edit ~/.config/opencode/opencode-swarm.json to customize:
  - Model assignments per agent or category
  - Preset configurations (remote, hybrid)
  - Local inference endpoints (GPU/NPU URLs)
  - Max iterations and other settings

Custom Prompts:
  Place custom prompts in ~/.config/opencode/opencode-swarm/
  - {agent}.md       - Replace default prompt
  - {agent}_append.md - Append to default prompt

Examples:
  bunx opencode-swarm install
  bunx opencode-swarm update
  bunx opencode-swarm uninstall
  bunx opencode-swarm uninstall --clean
  bunx opencode-swarm --help
  bunx opencode-swarm run status
  bunx opencode-swarm run sync-plan
  bunx opencode-swarm run knowledge migrate
  bunx opencode-swarm run dark-matter
  bunx opencode-swarm run diagnose
  bunx opencode-swarm run evidence summary
`);
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);

	if (args.includes('-v') || args.includes('--version')) {
		console.log(`opencode-swarm ${version}`);
		process.exit(0);
	}

	if (args.includes('-h') || args.includes('--help')) {
		printHelp();
		process.exit(0);
	}

	// Default command is install
	const command = args[0] || 'install';

	if (command === 'install') {
		const exitCode = await install();
		process.exit(exitCode);
	} else if (command === 'update') {
		const exitCode = await update();
		process.exit(exitCode);
	} else if (command === 'uninstall') {
		const exitCode = await uninstall();
		process.exit(exitCode);
	} else if (command === 'run') {
		const exitCode = await run(args.slice(1));
		process.exit(exitCode);
	} else {
		console.error(`Unknown command: ${command}`);
		console.error('Run with --help for usage information');
		process.exit(1);
	}
}

// Guard against module-level side effects when imported by test files.
// In Bun's test worker, process.argv has only 2 elements, so slice(2) is
// empty and command defaults to 'install', which would overwrite the user's
// real opencode.json. import.meta.main is false when this module is imported,
// so main() only runs when the file is the actual CLI entry point.
if (import.meta.main) {
	main().catch((err) => {
		console.error('Fatal error:', err);
		process.exit(1);
	});
}

/**
 * Dispatch function for routing argv tokens to plugin command handlers.
 * Used by the "run" subcommand entry point.
 * Delegates to the unified COMMAND_REGISTRY via resolveCommand().
 */
export async function run(args: string[]): Promise<number> {
	const cwd = process.cwd();

	// Handle empty args
	if (!args || args.length === 0) {
		console.error(
			`Usage: bunx opencode-swarm run <command> [args]\nValid commands: ${VALID_COMMANDS.join(', ')}`,
		);
		return 1;
	}

	const resolved = resolveCommand(args);

	if (!resolved) {
		console.error(
			`Unknown command: ${args[0]}\nValid commands: ${VALID_COMMANDS.join(', ')}`,
		);
		return 1;
	}

	const result = await resolved.entry.handler({
		directory: cwd,
		args: resolved.remainingArgs,
		sessionID: '',
		agents: {},
	});

	console.log(result);
	return 0;
}

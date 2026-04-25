#!/usr/bin/env bun
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { resolveCommand, VALID_COMMANDS } from '../commands/registry.js';

const CONFIG_DIR = path.join(
	process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
	'opencode',
);

const OPENCODE_CONFIG_PATH = path.join(CONFIG_DIR, 'opencode.json');
const PLUGIN_CONFIG_PATH = path.join(CONFIG_DIR, 'opencode-swarm.json');
const PROMPTS_DIR = path.join(CONFIG_DIR, 'opencode-swarm');

const OPENCODE_PLUGIN_CACHE_PATH = path.join(
	process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'),
	'opencode',
	'packages',
	'opencode-swarm@latest',
);

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
	try {
		if (fs.existsSync(OPENCODE_PLUGIN_CACHE_PATH)) {
			fs.rmSync(OPENCODE_PLUGIN_CACHE_PATH, { recursive: true, force: true });
			console.log(
				'✓ Cleared opencode plugin cache (next start will fetch latest)',
			);
		}
	} catch {
		console.warn(
			'⚠ Could not clear opencode plugin cache — you may need to delete it manually:',
		);
		console.warn(`  ${OPENCODE_PLUGIN_CACHE_PATH}`);
	}

	// Create default plugin config if not exists
	if (!fs.existsSync(PLUGIN_CONFIG_PATH)) {
		const defaultConfig = {
			// Must match PluginConfigSchema in src/config/schema.ts
			// v6.14: free OpenCode Zen models; v6.73+ switched to big-pickle with gpt-5-nano fallback; architect inherits OpenCode UI selection
			agents: {
				coder: {
					model: 'opencode/minimax-m2.5-free',
					fallback_models: ['opencode/gpt-5-nano'],
				},
				reviewer: {
					model: 'opencode/big-pickle',
					fallback_models: ['opencode/gpt-5-nano'],
				},
				test_engineer: { model: 'opencode/gpt-5-nano' },
				explorer: {
					model: 'opencode/big-pickle',
					fallback_models: ['opencode/gpt-5-nano'],
				},
				sme: {
					model: 'opencode/big-pickle',
					fallback_models: ['opencode/gpt-5-nano'],
				},
				critic: {
					model: 'opencode/big-pickle',
					fallback_models: ['opencode/gpt-5-nano'],
				},
				docs: {
					model: 'opencode/big-pickle',
					fallback_models: ['opencode/gpt-5-nano'],
				},
				designer: {
					model: 'opencode/big-pickle',
					fallback_models: ['opencode/gpt-5-nano'],
				},
				critic_sounding_board: {
					fallback_models: ['opencode/gpt-5-nano'],
				},
				critic_drift_verifier: {
					fallback_models: ['opencode/gpt-5-nano'],
				},
				critic_hallucination_verifier: {
					fallback_models: ['opencode/gpt-5-nano'],
				},
				critic_oversight: {
					fallback_models: ['opencode/gpt-5-nano'],
				},
				curator_init: {
					fallback_models: ['opencode/gpt-5-nano'],
				},
				curator_phase: {
					fallback_models: ['opencode/gpt-5-nano'],
				},
				council_member: {
					fallback_models: ['opencode/gpt-5-nano'],
				},
				council_moderator: {
					fallback_models: ['opencode/gpt-5-nano'],
				},
			},
			max_iterations: 5,
		};
		saveJson(PLUGIN_CONFIG_PATH, defaultConfig);
		console.log('✓ Created default plugin config at:', PLUGIN_CONFIG_PATH);
	} else {
		console.log('✓ Plugin config already exists at:', PLUGIN_CONFIG_PATH);
	}

	console.log('\n📁 Configuration files:');
	console.log(`   OpenCode config: ${OPENCODE_CONFIG_PATH}`);
	console.log(`   Plugin config:   ${PLUGIN_CONFIG_PATH}`);
	console.log(`   Custom prompts:  ${PROMPTS_DIR}/`);

	console.log('\n🚀 Installation complete!');
	console.log('\nNext steps:');
	console.log('1. Edit the plugin config to customize models and settings');
	console.log('2. Run "opencode" to start using the swarm');
	console.log('3. The Architect agent will orchestrate your requests');

	console.log('\n📖 SME agent:');
	console.log(
		'   The SME agent supports any domain — the Architect determines',
	);
	console.log('   what expertise is needed and requests it dynamically.');

	return 0;
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

	if (args.includes('-h') || args.includes('--help')) {
		printHelp();
		process.exit(0);
	}

	// Default command is install
	const command = args[0] || 'install';

	if (command === 'install') {
		const exitCode = await install();
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

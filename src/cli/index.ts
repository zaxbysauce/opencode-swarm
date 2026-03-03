#!/usr/bin/env bun
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
	handleAgentsCommand,
	handleAnalyzeCommand,
	handleArchiveCommand,
	handleBenchmarkCommand,
	handleClarifyCommand,
	handleConfigCommand,
	handleDarkMatterCommand,
	handleDiagnoseCommand,
	handleDoctorCommand,
	handleEvidenceCommand,
	handleEvidenceSummaryCommand,
	handleExportCommand,
	handleHistoryCommand,
	handleKnowledgeMigrateCommand,
	handleKnowledgeQuarantineCommand,
	handleKnowledgeRestoreCommand,
	handlePlanCommand,
	handlePreflightCommand,
	handleResetCommand,
	handleRetrieveCommand,
	handleSpecifyCommand,
	handleStatusCommand,
	handleSyncPlanCommand,
} from '../commands/index.js';

const CONFIG_DIR = path.join(
	process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
	'opencode',
);

const OPENCODE_CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const PLUGIN_CONFIG_PATH = path.join(CONFIG_DIR, 'opencode-swarm.json');
const PROMPTS_DIR = path.join(CONFIG_DIR, 'opencode-swarm');

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
	let opencodeConfig = loadJson<OpenCodeConfig>(OPENCODE_CONFIG_PATH);
	if (!opencodeConfig) {
		opencodeConfig = {};
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

	// Disable OpenCode's default agents to avoid conflicts
	if (!opencodeConfig.agent) {
		opencodeConfig.agent = {};
	}
	opencodeConfig.agent.explore = { disable: true };
	opencodeConfig.agent.general = { disable: true };

	saveJson(OPENCODE_CONFIG_PATH, opencodeConfig);
	console.log('✓ Added opencode-swarm to OpenCode plugins');
	console.log('✓ Disabled default OpenCode agents (explore, general)');

	// Create default plugin config if not exists
	if (!fs.existsSync(PLUGIN_CONFIG_PATH)) {
		const defaultConfig = {
			// Must match PluginConfigSchema in src/config/schema.ts
			// v6.14: free OpenCode Zen models; architect inherits OpenCode UI selection
			agents: {
				coder: { model: 'opencode/minimax-m2.5-free' },
				reviewer: { model: 'opencode/big-pickle' },
				test_engineer: { model: 'opencode/gpt-5-nano' },
				explorer: { model: 'opencode/trinity-large-preview-free' },
				sme: { model: 'opencode/trinity-large-preview-free' },
				critic: { model: 'opencode/trinity-large-preview-free' },
				docs: { model: 'opencode/trinity-large-preview-free' },
				designer: { model: 'opencode/trinity-large-preview-free' },
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
  bunx opencode-swarm run knowledge migrate
  bunx opencode-swarm run dark-matter
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

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});

/**
 * Dispatch function for routing argv tokens to plugin command handlers.
 * Used by the "run" subcommand entry point.
 */
export async function run(args: string[]): Promise<number> {
	const cwd = process.cwd();

	// Handle empty args
	if (!args || args.length === 0) {
		console.error(
			'Usage: bunx opencode-swarm run <command> [args]\nRun "bunx opencode-swarm --help" for a list of commands.',
		);
		return 1;
	}

	const subcommand = args[0];

	// Dispatch table
	switch (subcommand) {
		case 'status': {
			const result = await handleStatusCommand(cwd, {});
			console.log(result);
			return 0;
		}
		case 'plan': {
			const result = await handlePlanCommand(cwd, args.slice(1));
			console.log(result);
			return 0;
		}
		case 'agents': {
			const result = handleAgentsCommand({}, undefined);
			console.log(result);
			return 0;
		}
		case 'archive': {
			const result = await handleArchiveCommand(cwd, args.slice(1));
			console.log(result);
			return 0;
		}
		case 'history': {
			const result = await handleHistoryCommand(cwd, args.slice(1));
			console.log(result);
			return 0;
		}
		case 'config': {
			if (args[1] === 'doctor') {
				const result = await handleDoctorCommand(cwd, args.slice(2));
				console.log(result);
			} else {
				const result = await handleConfigCommand(cwd, args.slice(1));
				console.log(result);
			}
			return 0;
		}
		case 'doctor': {
			const result = await handleDoctorCommand(cwd, args.slice(1));
			console.log(result);
			return 0;
		}
		case 'evidence': {
			if (args[1] === 'summary') {
				const result = await handleEvidenceSummaryCommand(cwd);
				console.log(result);
			} else {
				const result = await handleEvidenceCommand(cwd, args.slice(1));
				console.log(result);
			}
			return 0;
		}
		case 'diagnose': {
			const result = await handleDiagnoseCommand(cwd, args.slice(1));
			console.log(result);
			return 0;
		}
		case 'preflight': {
			const result = await handlePreflightCommand(cwd, args.slice(1));
			console.log(result);
			return 0;
		}
		case 'sync-plan': {
			const result = await handleSyncPlanCommand(cwd, args.slice(1));
			console.log(result);
			return 0;
		}
		case 'benchmark': {
			const result = await handleBenchmarkCommand(cwd, args.slice(1));
			console.log(result);
			return 0;
		}
		case 'export': {
			const result = await handleExportCommand(cwd, args.slice(1));
			console.log(result);
			return 0;
		}
		case 'reset': {
			const result = await handleResetCommand(cwd, args.slice(1));
			console.log(result);
			return 0;
		}
		case 'retrieve': {
			const result = await handleRetrieveCommand(cwd, args.slice(1));
			console.log(result);
			return 0;
		}
		case 'clarify': {
			const result = await handleClarifyCommand(cwd, args.slice(1));
			console.log(result);
			return 0;
		}
		case 'analyze': {
			const result = await handleAnalyzeCommand(cwd, args.slice(1));
			console.log(result);
			return 0;
		}
		case 'specify': {
			const result = await handleSpecifyCommand(cwd, args.slice(1));
			console.log(result);
			return 0;
		}
		case 'dark-matter': {
			const result = await handleDarkMatterCommand(cwd, args.slice(1));
			console.log(result);
			return 0;
		}
		case 'knowledge': {
			const knowledgeSubcmd = args[1];
			if (knowledgeSubcmd === 'migrate') {
				const result = await handleKnowledgeMigrateCommand(cwd, args.slice(2));
				console.log(result);
			} else if (knowledgeSubcmd === 'quarantine') {
				const result = await handleKnowledgeQuarantineCommand(
					cwd,
					args.slice(2),
				);
				console.log(result);
			} else if (knowledgeSubcmd === 'restore') {
				const result = await handleKnowledgeRestoreCommand(cwd, args.slice(2));
				console.log(result);
			} else {
				console.error(
					'Usage: bunx opencode-swarm run knowledge <migrate|quarantine|restore>',
				);
				return 1;
			}
			return 0;
		}
		default: {
			console.error(
				`Unknown command: ${args[0]}\nRun "bunx opencode-swarm run" with no args for help.`,
			);
			return 1;
		}
	}
}

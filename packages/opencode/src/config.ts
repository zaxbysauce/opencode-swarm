/**
 * OpenCode-specific config loading — wraps core loader with plugin config support
 * loadRawConfigFromPath stays in @opencode-swarm/core; these functions are opencode-specific
 */

import * as os from 'node:os';
import * as path from 'node:path';
// Import from @opencode-swarm/core (resolves via paths in tsconfig)
import {
	type AgentName,
	type AutomationCapabilities,
	type AutomationConfig,
	type AutomationMode,
	deepMerge,
	loadRawConfigFromPath,
	type PipelineAgentName,
	type PluginConfig,
	PluginConfigSchema,
	type QAAgentName,
} from '@opencode-swarm/core';

const CONFIG_FILENAME = 'opencode-swarm.json';

/**
 * Get the user's configuration directory (XDG Base Directory spec).
 */
function getUserConfigDir(): string {
	return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}

/**
 * Migrate v6.12 presets-format config to v6.13+ agents format.
 * v6.12 install() generated: { preset: 'remote', presets: { remote: { architect: {...} } } }
 * v6.13+ expects:            { agents: { architect: {...} } }
 */
function migratePresetsConfig(
	raw: Record<string, unknown>,
): Record<string, unknown> {
	if (raw.presets && typeof raw.presets === 'object' && !raw.agents) {
		const presetName = (raw.preset as string) || 'remote';
		const presets = raw.presets as Record<string, unknown>;
		const activePreset = presets[presetName] || Object.values(presets)[0];

		if (activePreset && typeof activePreset === 'object') {
			const migrated = { ...raw, agents: activePreset } as Record<
				string,
				unknown
			>;
			delete migrated.preset;
			delete migrated.presets;
			delete migrated.swarm_mode;
			console.warn(
				'[opencode-swarm] Migrated v6.12 presets config to agents format. Consider updating your opencode-swarm.json.',
			);
			return migrated;
		}
	}
	return raw;
}

/**
 * Load plugin configuration from user and project config files.
 *
 * Config locations:
 * 1. User config: ~/.config/opencode/opencode-swarm.json
 * 2. Project config: <directory>/.opencode/opencode-swarm.json
 *
 * Project config takes precedence. Nested objects are deep-merged.
 * IMPORTANT: Raw configs are merged BEFORE Zod parsing so that
 * Zod defaults don't override explicit user values.
 */
export function loadPluginConfig(directory: string): PluginConfig {
	const userConfigPath = path.join(
		getUserConfigDir(),
		'opencode',
		CONFIG_FILENAME,
	);

	const projectConfigPath = path.join(directory, '.opencode', CONFIG_FILENAME);

	// Load raw configs (no Zod defaults applied yet)
	const userResult = loadRawConfigFromPath(userConfigPath);
	const projectResult = loadRawConfigFromPath(projectConfigPath);

	const rawUserConfig = userResult.config;
	const rawProjectConfig = projectResult.config;

	// Track whether any config files existed AND whether there were load errors
	// Use fileExisted to track if files existed (regardless of whether they loaded successfully)
	const loadedFromFile = userResult.fileExisted || projectResult.fileExisted;
	const configHadErrors = userResult.hadError || projectResult.hadError;

	// Deep-merge raw objects before Zod parsing so that
	// Zod defaults don't override explicit user values
	let mergedRaw: Record<string, unknown> = rawUserConfig ?? {};
	if (rawProjectConfig) {
		mergedRaw = deepMerge(mergedRaw, rawProjectConfig) as Record<
			string,
			unknown
		>;
	}

	// Migrate v6.12 presets format to v6.13+ agents format
	mergedRaw = migratePresetsConfig(mergedRaw);

	// Validate merged config with Zod (applies defaults ONCE)
	const result = PluginConfigSchema.safeParse(mergedRaw);
	if (!result.success) {
		// If merged config fails validation, try user config alone
		// (project config may have invalid values that should be ignored)
		if (rawUserConfig) {
			const userParseResult = PluginConfigSchema.safeParse(rawUserConfig);
			if (userParseResult.success) {
				console.warn(
					'[opencode-swarm] Project config ignored due to validation errors. Using user config.',
				);
				return userParseResult.data;
			}
		}
		// Neither merged nor user config is valid, return defaults with guardrails ENABLED (fail-secure)
		console.warn('[opencode-swarm] Merged config validation failed:');
		console.warn(result.error.format());
		console.warn(
			'[opencode-swarm] ⚠️ SECURITY: Falling back to conservative defaults with guardrails ENABLED. Fix the config file to restore custom configuration.',
		);
		// Fail-secure: return defaults with guardrails explicitly enabled
		return PluginConfigSchema.parse({
			guardrails: { enabled: true },
		});
	}

	// If config files existed but had load errors, apply fail-secure defaults
	if (loadedFromFile && configHadErrors) {
		// Merge the valid parts with fail-secure guardrails
		return PluginConfigSchema.parse({
			...mergedRaw,
			guardrails: { enabled: true },
		});
	}

	return result.data;
}

/**
 * Internal variant of loadPluginConfig that also returns loader metadata.
 * Used only by src/index.ts to determine guardrails fallback behavior.
 * NOT part of the public API — use loadPluginConfig() for all other callers.
 */
export function loadPluginConfigWithMeta(directory: string): {
	config: PluginConfig;
	loadedFromFile: boolean;
} {
	const userConfigPath = path.join(
		getUserConfigDir(),
		'opencode',
		CONFIG_FILENAME,
	);
	const projectConfigPath = path.join(directory, '.opencode', CONFIG_FILENAME);
	const userResult = loadRawConfigFromPath(userConfigPath);
	const projectResult = loadRawConfigFromPath(projectConfigPath);
	// Use fileExisted to track if files existed (regardless of load success)
	const loadedFromFile = userResult.fileExisted || projectResult.fileExisted;
	const config = loadPluginConfig(directory);
	return { config, loadedFromFile };
}

// Re-export config-facing types from core for consumers
export type {
	AgentName,
	AutomationCapabilities,
	AutomationConfig,
	AutomationMode,
	PipelineAgentName,
	PluginConfig,
	QAAgentName,
};

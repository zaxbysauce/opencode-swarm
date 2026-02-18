import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { type PluginConfig, PluginConfigSchema } from './schema';

const CONFIG_FILENAME = 'opencode-swarm.json';
const PROMPTS_DIR_NAME = 'opencode-swarm';

export const MAX_CONFIG_FILE_BYTES = 102_400;

/**
 * Get the user's configuration directory (XDG Base Directory spec).
 */
function getUserConfigDir(): string {
	return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}

/**
 * Load raw config JSON from a file path without Zod validation.
 * Returns the raw JSON object for pre-validation merging.
 */
function loadRawConfigFromPath(
	configPath: string,
): Record<string, unknown> | null {
	try {
		const stats = fs.statSync(configPath);
		if (stats.size > MAX_CONFIG_FILE_BYTES) {
			console.warn(
				`[opencode-swarm] Config file too large (max 100 KB): ${configPath}`,
			);
			console.warn(
				'[opencode-swarm] ⚠️ Guardrails will be DISABLED as a safety precaution. Fix the config file to restore normal operation.',
			);
			return null;
		}

		const content = fs.readFileSync(configPath, 'utf-8');
		// TOCTOU guard: re-check size after read (file may have grown between statSync and readFileSync)
		if (content.length > MAX_CONFIG_FILE_BYTES) {
			console.warn(
				`[opencode-swarm] Config file too large after read (max 100 KB): ${configPath}`,
			);
			console.warn(
				'[opencode-swarm] ⚠️ Guardrails will be DISABLED as a safety precaution. Fix the config file to restore normal operation.',
			);
			return null;
		}

		const rawConfig = JSON.parse(content);

		if (
			typeof rawConfig !== 'object' ||
			rawConfig === null ||
			Array.isArray(rawConfig)
		) {
			console.warn(
				`[opencode-swarm] Invalid config at ${configPath}: expected an object`,
			);
			console.warn(
				'[opencode-swarm] ⚠️ Guardrails will be DISABLED as a safety precaution. Fix the config file to restore normal operation.',
			);
			return null;
		}

		return rawConfig as Record<string, unknown>;
	} catch (error) {
		if (
			error instanceof Error &&
			'code' in error &&
			(error as NodeJS.ErrnoException).code !== 'ENOENT'
		) {
			console.warn(
				`[opencode-swarm] ⚠️ CONFIG LOAD FAILURE — config exists at ${configPath} but could not be loaded: ${error.message}`,
			);
			console.warn(
				'[opencode-swarm] ⚠️ Guardrails will be DISABLED as a safety precaution. Fix the config file to restore normal operation.',
			);
		}
		return null;
	}
}

import { deepMerge as deepMergeFn } from '../utils/merge';

// Re-export deepMerge and MAX_MERGE_DEPTH from src/utils/merge for backward compatibility.
// Tests and src/config/constants.ts import these from loader.ts directly.
export { deepMerge, MAX_MERGE_DEPTH } from '../utils/merge';

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
	const rawUserConfig = loadRawConfigFromPath(userConfigPath);
	const rawProjectConfig = loadRawConfigFromPath(projectConfigPath);

	// Track whether any config was loaded from file
	const loadedFromFile = rawUserConfig !== null || rawProjectConfig !== null;

	// Deep-merge raw objects before Zod parsing so that
	// Zod defaults don't override explicit user values
	let mergedRaw: Record<string, unknown> = rawUserConfig ?? {};
	if (rawProjectConfig) {
		mergedRaw = deepMergeFn(mergedRaw, rawProjectConfig) as Record<
			string,
			unknown
		>;
	}

	// Validate merged config with Zod (applies defaults ONCE)
	const result = PluginConfigSchema.safeParse(mergedRaw);
	if (!result.success) {
		// If merged config fails validation, try user config alone
		// (project config may have invalid values that should be ignored)
		if (rawUserConfig) {
			const userResult = PluginConfigSchema.safeParse(rawUserConfig);
			if (userResult.success) {
				console.warn(
					'[opencode-swarm] Project config ignored due to validation errors. Using user config.',
				);
				return userResult.data;
			}
		}
		// Neither merged nor user config is valid, return defaults
		console.warn('[opencode-swarm] Merged config validation failed:');
		console.warn(result.error.format());
		console.warn(
			'[opencode-swarm] ⚠️ Guardrails will be DISABLED as a safety precaution. Fix the config file to restore normal operation.',
		);
		return PluginConfigSchema.parse({});
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
	const rawUserConfig = loadRawConfigFromPath(userConfigPath);
	const rawProjectConfig = loadRawConfigFromPath(projectConfigPath);
	const loadedFromFile = rawUserConfig !== null || rawProjectConfig !== null;
	const config = loadPluginConfig(directory);
	return { config, loadedFromFile };
}

/**
 * Load custom prompt for an agent from the prompts directory.
 * Checks for {agent}.md (replaces default) and {agent}_append.md (appends).
 */
export function loadAgentPrompt(agentName: string): {
	prompt?: string;
	appendPrompt?: string;
} {
	const promptsDir = path.join(
		getUserConfigDir(),
		'opencode',
		PROMPTS_DIR_NAME,
	);
	const result: { prompt?: string; appendPrompt?: string } = {};

	// Check for replacement prompt
	const promptPath = path.join(promptsDir, `${agentName}.md`);
	if (fs.existsSync(promptPath)) {
		try {
			result.prompt = fs.readFileSync(promptPath, 'utf-8');
		} catch (error) {
			console.warn(
				`[opencode-swarm] Error reading prompt file ${promptPath}:`,
				error instanceof Error ? error.message : String(error),
			);
		}
	}

	// Check for append prompt
	const appendPromptPath = path.join(promptsDir, `${agentName}_append.md`);
	if (fs.existsSync(appendPromptPath)) {
		try {
			result.appendPrompt = fs.readFileSync(appendPromptPath, 'utf-8');
		} catch (error) {
			console.warn(
				`[opencode-swarm] Error reading append prompt ${appendPromptPath}:`,
				error instanceof Error ? error.message : String(error),
			);
		}
	}

	return result;
}

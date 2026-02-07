import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { type PluginConfig, PluginConfigSchema } from './schema';

const CONFIG_FILENAME = 'opencode-swarm.json';
const PROMPTS_DIR_NAME = 'opencode-swarm';

/**
 * Get the user's configuration directory (XDG Base Directory spec).
 */
function getUserConfigDir(): string {
	return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}

/**
 * Load and validate config from a specific file path.
 */
function loadConfigFromPath(configPath: string): PluginConfig | null {
	try {
		const content = fs.readFileSync(configPath, 'utf-8');
		const rawConfig = JSON.parse(content);
		const result = PluginConfigSchema.safeParse(rawConfig);

		if (!result.success) {
			console.warn(`[opencode-swarm] Invalid config at ${configPath}:`);
			console.warn(result.error.format());
			return null;
		}

		return result.data;
	} catch (error) {
		if (
			error instanceof Error &&
			'code' in error &&
			(error as NodeJS.ErrnoException).code !== 'ENOENT'
		) {
			console.warn(
				`[opencode-swarm] Error reading config from ${configPath}:`,
				error.message,
			);
		}
		return null;
	}
}

/**
 * Deep merge two objects, with override values taking precedence.
 */
export function deepMerge<T extends Record<string, unknown>>(
	base?: T,
	override?: T,
): T | undefined {
	if (!base) return override;
	if (!override) return base;

	const result = { ...base } as T;
	for (const key of Object.keys(override) as (keyof T)[]) {
		const baseVal = base[key];
		const overrideVal = override[key];

		if (
			typeof baseVal === 'object' &&
			baseVal !== null &&
			typeof overrideVal === 'object' &&
			overrideVal !== null &&
			!Array.isArray(baseVal) &&
			!Array.isArray(overrideVal)
		) {
			result[key] = deepMerge(
				baseVal as Record<string, unknown>,
				overrideVal as Record<string, unknown>,
			) as T[keyof T];
		} else {
			result[key] = overrideVal;
		}
	}
	return result;
}

/**
 * Load plugin configuration from user and project config files.
 *
 * Config locations:
 * 1. User config: ~/.config/opencode/opencode-swarm.json
 * 2. Project config: <directory>/.opencode/opencode-swarm.json
 *
 * Project config takes precedence. Nested objects are deep-merged.
 */
export function loadPluginConfig(directory: string): PluginConfig {
	const userConfigPath = path.join(
		getUserConfigDir(),
		'opencode',
		CONFIG_FILENAME,
	);

	const projectConfigPath = path.join(directory, '.opencode', CONFIG_FILENAME);

	let config: PluginConfig = loadConfigFromPath(userConfigPath) ?? {
		max_iterations: 5,
		qa_retry_limit: 3,
		inject_phase_reminders: true,
	};

	const projectConfig = loadConfigFromPath(projectConfigPath);
	if (projectConfig) {
		config = {
			...config,
			...projectConfig,
			agents: deepMerge(config.agents, projectConfig.agents),
		};
	}

	return config;
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

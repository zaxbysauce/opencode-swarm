import type { PluginConfig } from './schema';
export declare const MAX_CONFIG_FILE_BYTES = 102400;
/**
 * Load raw config JSON from a file path without Zod validation.
 * Returns the raw JSON object for pre-validation merging.
 * Also returns whether the file existed (vs. not existing at all).
 */
declare function loadRawConfigFromPath(configPath: string): {
    config: Record<string, unknown> | null;
    fileExisted: boolean;
    hadError: boolean;
};
export { loadRawConfigFromPath };
/**
 * Load custom prompt for an agent from the prompts directory.
 * Checks for {agent}.md (replaces default) and {agent}_append.md (appends).
 */
export declare function loadAgentPrompt(agentName: string): {
    prompt?: string;
    appendPrompt?: string;
};
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
export declare function loadPluginConfig(directory: string): PluginConfig;
/**
 * Internal variant of loadPluginConfig that also returns loader metadata.
 * Used to determine guardrails fallback behavior.
 */
export declare function loadPluginConfigWithMeta(directory: string): {
    config: PluginConfig;
    loadedFromFile: boolean;
};

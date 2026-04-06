import { type PluginConfig } from './schema';
export declare const MAX_CONFIG_FILE_BYTES = 102400;
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
export declare function loadPluginConfig(directory: string): PluginConfig;
/**
 * Internal variant of loadPluginConfig that also returns loader metadata.
 * Used only by src/index.ts to determine guardrails fallback behavior.
 * NOT part of the public API — use loadPluginConfig() for all other callers.
 */
export declare function loadPluginConfigWithMeta(directory: string): {
    config: PluginConfig;
    loadedFromFile: boolean;
};
/**
 * Load custom prompt for an agent from the prompts directory.
 * Checks for {agent}.md (replaces default) and {agent}_append.md (appends).
 */
export declare function loadAgentPrompt(agentName: string): {
    prompt?: string;
    appendPrompt?: string;
};

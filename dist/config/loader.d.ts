import { type PluginConfig } from './schema';
/**
 * Deep merge two objects, with override values taking precedence.
 */
export declare function deepMerge<T extends Record<string, unknown>>(base?: T, override?: T): T | undefined;
/**
 * Load plugin configuration from user and project config files.
 *
 * Config locations:
 * 1. User config: ~/.config/opencode/opencode-swarm.json
 * 2. Project config: <directory>/.opencode/opencode-swarm.json
 *
 * Project config takes precedence. Nested objects are deep-merged.
 */
export declare function loadPluginConfig(directory: string): PluginConfig;
/**
 * Load custom prompt for an agent from the prompts directory.
 * Checks for {agent}.md (replaces default) and {agent}_append.md (appends).
 */
export declare function loadAgentPrompt(agentName: string): {
    prompt?: string;
    appendPrompt?: string;
};

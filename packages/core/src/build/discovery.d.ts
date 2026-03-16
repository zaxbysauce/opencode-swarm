/**
 * Build Discovery Module
 *
 * Discovers build commands from project configuration files.
 * Provides toolchain detection and package.json script discovery.
 */
/**
 * Represents a discovered build command
 */
export interface BuildCommand {
    /** The command to execute */
    command: string;
    /** Working directory for the command */
    cwd: string;
    /** Optional: ecosystem (npm, cargo, etc.) */
    ecosystem?: string;
    /** Optional: command name from package.json scripts */
    name?: string;
}
/**
 * Options for build discovery
 */
export interface BuildDiscoveryOptions {
    /** Scope: 'changed' or 'all' */
    scope: 'changed' | 'all';
    /** List of changed files when scope is 'changed' */
    changedFiles?: string[];
}
/**
 * Result of build discovery
 */
export interface BuildDiscoveryResult {
    /** Discovered build commands */
    commands: BuildCommand[];
    /** List of skipped ecosystems with reasons */
    skipped: Array<{
        ecosystem: string;
        reason: string;
    }>;
}
/**
 * Check if a command exists on PATH
 * Uses 'where' on Windows, 'which' on Unix
 */
export declare function isCommandAvailable(command: string): boolean;
/**
 * Main discovery function - discovers build commands for all detected ecosystems
 */
export declare function discoverBuildCommands(workingDir: string, options: BuildDiscoveryOptions): Promise<BuildDiscoveryResult>;

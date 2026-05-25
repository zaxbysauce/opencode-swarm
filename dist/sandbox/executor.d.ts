/**
 * Platform-agnostic sandbox execution abstraction.
 *
 * Provides a unified interface for sandboxed shell command execution across
 * Linux (Bubblewrap), macOS (sandbox-exec), and Windows (restricted token/Low Integrity).
 */
/**
 * Error thrown when sandbox operations fail.
 */
export declare class SandboxError extends Error {
    readonly code: string;
    constructor(message: string, code: string);
}
/**
 * Interface for platform-specific sandbox executors.
 */
export interface SandboxExecutor {
    /** Human-readable name of the sandbox mechanism */
    readonly mechanism: string;
    /** Whether this executor is available on the current platform */
    isAvailable(): boolean;
    /**
     * Wrap a shell command with sandbox prefix.
     * @param command - The raw shell command string to execute
     * @param scopePaths - Absolute paths the coder is allowed to write to
     * @param tempDir - Optional temporary directory path (platform default if omitted)
     * @returns The wrapped command string with sandbox prefix
     * @throws SandboxError if sandbox cannot wrap the command
     */
    wrapCommand(command: string, scopePaths: string[], tempDir?: string): string;
    /**
     * Get the environment variable overrides for this sandbox.
     * Returns a record of env vars to set/unset.
     */
    getEnvOverrides(): Record<string, string | null>;
}
/**
 * Get the platform-appropriate sandbox executor.
 *
 * Returns null if no sandbox mechanism is available for the current platform.
 * The result is cached after the first call for fast subsequent access.
 *
 * Lazily imports platform-specific executor modules to avoid import-time
 * failures on platforms where they don't exist.
 */
export declare function getExecutor(): Promise<SandboxExecutor | null>;
/**
 * Reset the cached executor — useful for testing.
 * @internal
 */
export declare function _resetExecutorCache(): void;

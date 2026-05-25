/**
 * macOS sandbox-exec sandbox executor.
 *
 * Wraps shell commands with sandbox-exec(8) to restrict process capabilities
 * using a profile-based deny-by-default policy.
 *
 * Profile allows:
 *   - Read-only access to essential system paths (/usr, /bin, /sbin, /lib)
 *   - Read-write access to each scope path
 *   - Read-write access to the temp directory (500MB bounded)
 *   - Denies all other file writes
 */
import type { SandboxExecutor } from '../executor';
/**
 * Check whether the sandbox-exec binary is present and functional.
 * Uses spawnSync to probe synchronously without throwing.
 */
declare function probeSandboxExec(): boolean;
/**
 * DI seam for testability. Exposes probeSandboxExec so tests can simulate
 * ENOENT / EACCES / ENOSPC error conditions without requiring a real sandbox-exec binary.
 */
export declare const _internals: {
    probeSandboxExec: typeof probeSandboxExec;
};
/**
 * macOS sandbox-exec sandbox executor.
 */
export declare class MacOSSandboxExecutor implements SandboxExecutor {
    /** Human-readable mechanism identifier */
    readonly mechanism = "sandbox-exec";
    private readonly _scopePaths;
    private readonly _tempDir;
    private _available;
    private _disabledReason;
    /**
     * @param scopePaths - Absolute paths the sandboxed process may write to
     * @param tempDir   - Optional temp directory path (defaults to system temp)
     */
    constructor(scopePaths?: string[], tempDir?: string);
    /**
     * Returns true when sandbox-exec is available and the sandbox has not been disabled.
     */
    isAvailable(): boolean;
    /**
     * Disable the sandbox with a reason. Allows external code to force
     * fallback to unwrapped execution (e.g., for testing or explicit opt-out).
     */
    disable(reason: string): void;
    /**
     * Wrap a shell command string with sandbox-exec.
     *
     * @param command   - Raw shell command to execute inside the sandbox
     * @param scopePaths - Additional scope paths to bind (merged with constructor scope)
     * @param tempDir   - Optional temp directory override
     * @returns A sandbox-exec wrapped command string ready for shell execution,
     *          or the raw command string when the sandbox is unavailable (passthrough mode)
     */
    wrapCommand(command: string, scopePaths: string[], tempDir?: string): string;
    /**
     * Return environment variable overrides required for the macOS sandbox.
     *
     * DYLD_INSERT_LIBRARIES, DYLD_LIBRARY_PATH, DYLD_FRAMEWORK_PATH, and
     * DYLD_ROOT_PATH can be used to bypass sandbox restrictions by injecting
     * dynamic libraries. Unsetting them improves sandbox enforcement (defense in depth).
     */
    getEnvOverrides(): Record<string, string | null>;
}
export {};

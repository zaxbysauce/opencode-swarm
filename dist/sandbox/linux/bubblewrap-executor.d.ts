/**
 * Linux Bubblewrap sandbox executor.
 *
 * Wraps shell commands with bwrap (Bubblewrap) to restrict process capabilities.
 * Uses --bind to mount scope paths read-write, --tmpfs for /tmp, and --ro-bind
 * for essential read-only system paths.
 */
import { type SandboxExecutor } from '../executor';
/**
 * Check whether the bwrap binary is present on PATH.
 * Uses spawnSync to probe synchronously without throwing.
 * Logs specific error codes when bwrap is found but unusable.
 */
declare function probeBwrap(): boolean;
/**
 * DI seam for testability. Exposes probeBwrap so tests can simulate
 * ENOENT / EACCES / ENOSPC error conditions without requiring a real bwrap binary.
 * Internal calls use probeBwrap() directly; tests replace _internals.probeBwrap.
 */
export declare const _internals: {
    probeBwrap: typeof probeBwrap;
};
/**
 * Linux Bubblewrap sandbox executor.
 *
 * Instantiated with scope paths and an optional temp directory override.
 * wrapCommand() returns a bwrap-wrapped command string that:
 *   - bind-mounts each scope path read-write
 *   - mounts a tmpfs at /tmp (writable temporary storage)
 *   - bind-mounts essential system paths read-only
 *   - spawns the raw command via `bash -c '<command>'`
 */
export declare class BubblewrapSandboxExecutor implements SandboxExecutor {
    /** Human-readable mechanism identifier */
    readonly mechanism = "Bubblewrap";
    private readonly _scopePaths;
    private readonly _tempDir;
    private _available;
    private _disabledReason;
    /**
     * @param scopePaths - Absolute paths the sandboxed process may write to (default: empty array)
     * @param tempDir   - Optional temp directory path (defaults to /tmp)
     */
    constructor(scopePaths?: string[], tempDir?: string);
    /**
     * Returns true when the bwrap binary is found on PATH and the sandbox
     * has not been disabled.
     */
    isAvailable(): boolean;
    /**
     * Disable the sandbox with a reason. Allows external code to force
     * fallback to unwrapped execution (e.g., for testing, explicit opt-out,
     * or when initialization fails).
     *
     * After calling disable():
     * - isAvailable() returns false
     * - wrapCommand() returns the raw command unchanged (passthrough)
     */
    disable(reason: string): void;
    /**
     * Wrap a shell command string with bwrap sandbox arguments.
     *
     * @param command   - Raw shell command to execute inside the sandbox
     * @param scopePaths - Additional scope paths to bind (merged with constructor scope)
     * @param tempDir   - Optional temp directory override
     * @returns A bwrap-wrapped command string ready for shell execution,
     *          or the raw command string when the sandbox is unavailable (passthrough mode)
     */
    wrapCommand(command: string, scopePaths: string[], tempDir?: string): string;
    /**
     * Return environment variable overrides required for the bubblewrap sandbox.
     *
     * Security is achieved through bwrap CLI flags (--unshare-user, --unshare-net,
     * --unshare-ipc, --die-with-parent, --new-session), not environment variables.
     * bwrap ignores unknown environment variables.
     */
    getEnvOverrides(): Record<string, string | null>;
}
export {};

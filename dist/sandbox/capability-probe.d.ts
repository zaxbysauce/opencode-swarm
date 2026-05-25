/**
 * Platform sandbox capability probe.
 *
 * Detects OS-native sandbox mechanism availability for each platform:
 *   - Linux:   Bubblewrap (bwrap)
 *   - macOS:   sandbox-exec
 *   - Windows: PowerShell-based wrapper (not a native OS sandbox mechanism)
 *
 * Each probe is bounded to 2 seconds via AbortController to satisfy
 * Invariant 1 (plugin init is fast, bounded, fail-open).
 */
/** Possible sandbox status values. */
export type SandboxStatus = 'enabled' | 'disabled' | 'unsupported';
/** Result of a sandbox capability probe. */
export interface SandboxCapability {
    /** Whether the sandbox mechanism is available. */
    status: SandboxStatus;
    /** Human-readable mechanism name, e.g. "Bubblewrap". */
    mechanism: string;
    /** Current process.platform value. */
    platform: 'linux' | 'darwin' | 'win32';
    /** Error message from the probe, if any. */
    error?: string;
}
/**
 * Detects the availability of OS-native sandbox mechanisms.
 *
 * Results are cached for the session lifetime (module-level variable).
 */
/**
 * Synchronous check whether Bubblewrap was detected as available.
 * Must be called after detect() has resolved — returns false if detect()
 * has not yet been called or if the cached result is not Linux/enabled.
 */
export declare function isBubblewrapAvailable(): boolean;
/**
 * Synchronous check whether sandbox-exec was detected as available.
 * Must be called after detect() has resolved — returns false if detect()
 * has not yet been called or if the cached result is not macOS/enabled.
 */
export declare function isSandboxExecAvailable(): boolean;
/**
 * Synchronous check whether Windows Restricted Token support is available.
 * Must be called after detect() has resolved — returns false if detect()
 * has not yet been called or if the cached result is not win32/enabled.
 */
export declare function isWindowsSandboxAvailable(): boolean;
export declare class SandboxCapabilityProbe {
    /**
     * Detect sandbox capability for the current platform.
     *
     * @returns A promise that resolves to the sandbox capability result.
     */
    detect(): Promise<SandboxCapability>;
}

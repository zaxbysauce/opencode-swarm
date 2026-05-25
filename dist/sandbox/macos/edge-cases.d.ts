/**
 * Edge case handling utilities for macOS sandbox-exec.
 *
 * This module provides functions to detect and prevent:
 * - DYLD injection attacks
 * - Temp directory manipulation
 * - Sandbox profile bypass attempts
 * - SIP-protected path access
 * - Entitlement escalation
 * - Quarantine bypass
 * - Nested sandbox execution
 */
/**
 * Check whether the environment contains DYLD environment variables
 * that can be used to inject code into sandboxed processes.
 *
 * These variables are ignored in SIP-protected processes but may
 * work in some sandbox configurations.
 *
 * @param path - Unused, kept for signature compatibility
 * @param env  - The environment variables to check
 * @returns true if DYLD injection variables are present
 */
export declare function detectDyldInjection(_path: string, env: Record<string, string | undefined>): boolean;
/**
 * Check whether a command tries to escape the temp directory via
 * symlinks, path traversal, or environment variable override.
 *
 * @param tempDir  - The allowed temp directory path
 * @param command  - The command string to analyze
 * @returns true if temp directory manipulation is detected
 */
export declare function detectTmpDirManipulation(tempDir: string, command: string): boolean;
/**
 * Check whether a command tries to bypass sandbox profile restrictions by:
 * - Writing to paths outside scopePaths
 * - Using mktemp in unusual locations
 * - Creating hard/symbolic links to escape scope
 *
 * @param command     - The command string to analyze
 * @param scopePaths  - Array of allowed scope paths
 * @returns true if sandbox profile bypass is detected
 */
export declare function detectSandboxProfileBypass(command: string, scopePaths: string[]): boolean;
/**
 * Check whether a path is under System Integrity Protection protected locations.
 *
 * SIP-protected paths cannot be modified even in a sandbox:
 * - /System
 * - /usr/libexec
 * - /usr/sbin
 * - /AppleInternal
 *
 * @param path - The path to check
 * @returns true if the path is SIP-protected
 */
export declare function detectSIPSProtectedPath(path: string): boolean;
/**
 * Check whether a command tries to escalate privileges or modify
 * sandbox entitlements.
 *
 * @param command - The command string to analyze
 * @returns true if entitlement escalation is detected
 */
export declare function detectEntitlementEscalation(command: string): boolean;
/**
 * Check whether a command tries to bypass macOS quarantine restrictions.
 *
 * Downloaded files have a quarantine attribute that gates execution.
 * Removing this attribute allows unapproved software to run.
 *
 * @param command - The command string to analyze
 * @returns true if quarantine bypass is detected
 */
export declare function detectQuarantineBypass(command: string): boolean;
/**
 * Check whether a command tries to spawn another sandbox-exec instance
 * (nested sandboxing).
 *
 * Nested sandbox execution can be used to escape restrictions by
 * spawning a less-restricted sandbox within a sandbox.
 *
 * @param command - The command string to analyze
 * @returns true if nested sandbox execution is detected
 */
export declare function detectSandboxExecItself(command: string): boolean;

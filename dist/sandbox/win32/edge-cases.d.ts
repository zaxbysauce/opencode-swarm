/**
 * Edge case handling utilities for Windows sandbox.
 *
 * This module provides functions to detect and prevent:
 * - Path traversal attacks
 * - Registry escape attempts
 * - PowerShell command bypass
 * - WMI command execution bypass
 * - Windows service escalation
 * - DLL search order hijacking
 * - Token manipulation attacks
 */
/**
 * Detects Windows path traversal patterns that could escape sandbox containment.
 *
 * Attack: Attackers use `..`, absolute paths, or extended-length paths
 * to access files outside the intended sandbox scope.
 *
 * @param command - The command string to analyze
 * @returns true if path traversal patterns are detected
 */
export declare function detectPathTraversal(command: string): boolean;
/**
 * Detects registry manipulation attempts to bypass sandbox restrictions.
 *
 * Attack: Modifying the registry can disable security policies,
 * create startup entries, or alter system behavior.
 *
 * @param command - The command string to analyze
 * @returns true if registry manipulation is detected
 */
export declare function detectRegistryEscape(command: string): boolean;
/**
 * Detects PowerShell encoded commands and execution policy bypass attempts.
 *
 * Attack: PowerShell's -EncodedCommand can bypass script execution policies.
 * Combined with path traversal, this allows executing arbitrary code.
 *
 * @param command - The command string to analyze
 * @returns true if PowerShell escape/bypass is detected
 */
export declare function detectPowerShellEscape(command: string): boolean;
/**
 * Detects WMI command execution that could bypass sandbox restrictions.
 *
 * Attack: WMI can spawn processes without creating a visible child process,
 * making it useful for stealthy code execution.
 *
 * @param command - The command string to analyze
 * @returns true if WMI escape is detected
 */
export declare function detectWMIEscape(command: string): boolean;
/**
 * Detects attempts to create or modify Windows services for privilege escalation.
 *
 * Attack: Creating a new service or modifying an existing one can result
 * in code execution with elevated privileges.
 *
 * @param command - The command string to analyze
 * @returns true if service escalation is detected
 */
export declare function detectServiceEscalation(command: string): boolean;
/**
 * Detects DLL search order hijacking via PATH manipulation.
 *
 * Attack: If the PATH contains ".", current directory, or writable
 * system paths, an attacker can place a malicious DLL that gets loaded
 * by a legitimate binary.
 *
 * @param command - The command string to analyze
 * @param env - The environment variables to check
 * @returns true if DLL hijacking via PATH manipulation is detected
 */
export declare function detectDLLHijacking(command: string, env?: Record<string, string | undefined>): boolean;
/**
 * Detects attempts to manipulate process tokens or create processes with elevated privileges.
 *
 * Attack: Token manipulation allows a process to acquire elevated privileges
 * or the privileges of another user, enabling privilege escalation.
 *
 * @param command - The command string to analyze
 * @returns true if token manipulation is detected
 */
export declare function detectTokenManipulation(command: string): boolean;

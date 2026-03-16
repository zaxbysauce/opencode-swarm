/**
 * Shared hook utilities for OpenCode Swarm
 *
 * This module provides common utilities for working with hooks,
 * including error handling, handler composition, file I/O, and
 * token estimation for swarm-related operations.
 */
export declare function safeHook<I, O>(fn: (input: I, output: O) => Promise<void>): (input: I, output: O) => Promise<void>;
export declare function composeHandlers<I, O>(...fns: Array<(input: I, output: O) => Promise<void>>): (input: I, output: O) => Promise<void>;
/**
 * Validates that a filename is safe to use within the .swarm directory
 *
 * @param directory - The base directory containing the .swarm folder
 * @param filename - The filename to validate
 * @returns The resolved absolute path if validation passes
 * @throws Error if the filename is invalid or attempts path traversal
 */
export declare function validateSwarmPath(directory: string, filename: string): string;
export declare function readSwarmFileAsync(directory: string, filename: string): Promise<string | null>;
export declare function estimateTokens(text: string): number;

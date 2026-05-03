/**
 * LLM-based mutation patch generator.
 *
 * Uses the opencode SDK to call an LLM session and generate mutation testing patches
 * for specified source files. Produces MutationPatch[] for use by executeMutationSuite.
 */
import type { ToolContext } from '@opencode-ai/plugin';
import type { MutationPatch } from './engine.js';
/**
 * Dependency-injection seam.  Tests may override `timeoutMs` to a short value
 * to exercise the timeout path without waiting 90 seconds.
 */
export declare const _internals: {
    timeoutMs: number;
};
/**
 * Generate mutation testing patches for the given source files using an LLM.
 *
 * @param files - Array of file paths to generate mutations for
 * @param ctx - Optional ToolContext providing sessionID and directory
 * @returns Promise<MutationPatch[]> array of mutation patches, never throws
 */
export declare function generateMutants(files: string[], ctx?: ToolContext): Promise<MutationPatch[]>;

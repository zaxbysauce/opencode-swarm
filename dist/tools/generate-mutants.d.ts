/**
 * Generate mutation patches tool.
 * Calls generateMutants() from src/mutation/generator.ts with the ToolContext
 * and returns the patch list for piping into the mutation_test tool.
 * On LLM failure, emits a SKIP verdict with a diagnostic message.
 */
import type { MutationPatch } from '../mutation/engine.js';
import { createSwarmTool } from './create-tool';
export interface GenerateMutantsResult {
    verdict: 'ready' | 'SKIP';
    patches: MutationPatch[];
    count: number;
    message?: string;
}
export declare const generate_mutants: ReturnType<typeof createSwarmTool>;

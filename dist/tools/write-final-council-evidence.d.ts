/**
 * Write final council evidence tool for persisting final holistic council verdicts.
 * Accepts phase, verdict, and summary from the Architect and writes
 * a structured evidence file to the flat evidence root (not per-phase).
 */
import type { ToolDefinition } from '@opencode-ai/plugin/tool';
/**
 * Arguments for the write_final_council_evidence tool
 */
export interface WriteFinalCouncilEvidenceArgs {
    /** The phase number for the final council verdict */
    phase: number;
    /** Verdict of the final council: 'APPROVED' or 'NEEDS_REVISION' */
    verdict: 'APPROVED' | 'NEEDS_REVISION';
    /** Human-readable summary of the final council verdict */
    summary: string;
}
/**
 * Execute the write_final_council_evidence tool.
 * Validates input, builds an evidence entry, and writes to disk.
 * @param args - The write final council evidence arguments
 * @param directory - Working directory
 * @returns JSON string with success status and details
 */
export declare function executeWriteFinalCouncilEvidence(args: WriteFinalCouncilEvidenceArgs, directory: string): Promise<string>;
/**
 * Tool definition for write_final_council_evidence
 */
export declare const write_final_council_evidence: ToolDefinition;

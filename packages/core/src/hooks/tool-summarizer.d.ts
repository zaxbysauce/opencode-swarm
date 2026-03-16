/**
 * Tool Output Summarizer Hook
 *
 * Intercepts oversized tool outputs in tool.execute.after,
 * stores the full content to .swarm/summaries/, and replaces
 * the output with a compact summary containing a retrieval ID.
 */
import type { SummaryConfig } from '../config/schema';
/**
 * Reset the summary ID counter. Used for testing.
 */
export declare function resetSummaryIdCounter(): void;
/**
 * Creates a tool.execute.after hook that summarizes oversized tool outputs.
 *
 * @param config - Summary configuration including enabled, thresholds, and limits
 * @param directory - Base directory for storing full outputs
 * @returns Async hook function for tool.execute.after
 */
export declare function createToolSummarizerHook(config: SummaryConfig, directory: string): (input: {
    tool: string;
    sessionID: string;
    callID: string;
}, output: {
    title: string;
    output: string;
    metadata: unknown;
}) => Promise<void>;

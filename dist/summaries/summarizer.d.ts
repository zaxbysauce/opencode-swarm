/**
 * Summarization engine for tool outputs.
 * Provides content type detection, summarization decision logic, and structured summary creation.
 */
/**
 * Hysteresis factor to prevent churn for outputs near the threshold.
 * An output must be 25% larger than the threshold to be summarized.
 */
export declare const HYSTERESIS_FACTOR = 1.25;
/**
 * Content type classification for tool outputs.
 */
type ContentType = 'json' | 'code' | 'text' | 'binary';
/**
 * Heuristic-based content type detection.
 * @param output - The tool output string to analyze
 * @param toolName - The name of the tool that produced the output
 * @returns The detected content type: 'json', 'code', 'text', or 'binary'
 */
export declare function detectContentType(output: string, toolName: string): ContentType;
/**
 * Determines whether output should be summarized based on size and hysteresis.
 * Uses hysteresis to prevent repeated summarization decisions for outputs near the threshold.
 * @param output - The tool output string to check
 * @param thresholdBytes - The threshold in bytes
 * @returns true if the output should be summarized
 */
export declare function shouldSummarize(output: string, thresholdBytes: number): boolean;
/**
 * Creates a structured summary string from tool output.
 * @param output - The full tool output string
 * @param toolName - The name of the tool that produced the output
 * @param summaryId - Unique identifier for this summary
 * @param maxSummaryChars - Maximum characters allowed for the preview
 * @returns Formatted summary string
 */
export declare function createSummary(output: string, toolName: string, summaryId: string, maxSummaryChars: number): string;
export {};

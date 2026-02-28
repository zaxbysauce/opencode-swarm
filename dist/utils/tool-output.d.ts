/**
 * Truncate tool output to a maximum number of lines.
 * Adds a footer with omitted line count and guidance.
 *
 * @param output - The tool output to truncate
 * @param maxLines - Maximum number of lines to keep
 * @param toolName - Optional tool name for the footer
 * @returns Truncated output with footer, or original if within limit
 */
export declare function truncateToolOutput(output: string, maxLines: number, toolName?: string): string;

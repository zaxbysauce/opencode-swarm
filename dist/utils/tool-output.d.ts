/**
 * Truncate tool output to a maximum number of lines.
 * Preserves tail context (last N lines) in addition to head.
 * Adds a footer with omitted line count and guidance.
 *
 * @param output - The tool output to truncate
 * @param maxLines - Maximum number of lines to keep
 * @param toolName - Optional tool name for the footer
 * @param tailLines - Number of tail lines to preserve (default: 10)
 * @returns Truncated output with footer, or original if within limit
 */
export declare function truncateToolOutput(output: string, maxLines: number, toolName?: string, tailLines?: number): string;

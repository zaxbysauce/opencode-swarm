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
export function truncateToolOutput(
	output: string,
	maxLines: number,
	toolName?: string,
	tailLines: number = 10,
): string {
	if (!output) {
		return output;
	}

	// Ensure tailLines < maxLines to prevent overlap between head and tail
	if (tailLines >= maxLines) {
		tailLines = Math.floor(maxLines / 2);
	}

	const lines = output.split('\n');

	if (lines.length <= maxLines) {
		return output;
	}

	const omittedCount = lines.length - maxLines;
	const headLines = lines.slice(0, maxLines - tailLines);
	const tailContent = lines.slice(-tailLines);

	const footerLines: string[] = [];
	footerLines.push('');
	footerLines.push(
		`[... ${omittedCount} line${omittedCount === 1 ? '' : 's'} omitted ...]`,
	);

	if (toolName) {
		footerLines.push(`Tool: ${toolName}`);
	}

	footerLines.push('Use /swarm retrieve <id> to get the full content');

	return `${headLines.join('\n')}\n${tailContent.join('\n')}\n${footerLines.join('\n')}`;
}

/**
 * Truncate tool output to a maximum number of lines.
 * Adds a footer with omitted line count and guidance.
 *
 * @param output - The tool output to truncate
 * @param maxLines - Maximum number of lines to keep
 * @param toolName - Optional tool name for the footer
 * @returns Truncated output with footer, or original if within limit
 */
export function truncateToolOutput(
	output: string,
	maxLines: number,
	toolName?: string,
): string {
	if (!output) {
		return output;
	}

	const lines = output.split('\n');

	if (lines.length <= maxLines) {
		return output;
	}

	const omittedCount = lines.length - maxLines;
	const truncated = lines.slice(0, maxLines);

	const footerLines: string[] = [];
	footerLines.push('');
	footerLines.push(
		`[... ${omittedCount} line${omittedCount === 1 ? '' : 's'} omitted ...]`,
	);

	if (toolName) {
		footerLines.push(`Tool: ${toolName}`);
	}

	footerLines.push('Use /swarm retrieve <id> to get the full content');

	return truncated.join('\n') + '\n' + footerLines.join('\n');
}

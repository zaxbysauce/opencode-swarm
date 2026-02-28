/**
 * Consolidates multiple system messages into a single system message at index 0.
 *
 * Note: Merged content order matches original insertion order (OpenCode base prompt
 * first, then swarm agent prompt) - this assumes sequential message construction.
 */

type Message = {
	role: string;
	content: unknown;
	[key: string]: unknown;
};

export function consolidateSystemMessages(messages: Message[]): Message[] {
	// Fast path: if there's exactly one system message at index 0, return unchanged
	if (
		messages.length > 0 &&
		messages[0].role === 'system' &&
		messages[0].content !== undefined &&
		typeof messages[0].content === 'string' &&
		messages[0].content.trim().length > 0
	) {
		// Check if there's only one system message in the entire array
		const systemMessageCount = messages.filter(
			(m) => m.role === 'system' && typeof m.content === 'string',
		).length;

		if (systemMessageCount === 1) {
			return messages;
		}
	}

	// Collect indices and contents of system messages to merge
	const systemMessageIndices: number[] = [];
	const systemContents: string[] = [];

	for (let i = 0; i < messages.length; i++) {
		const message = messages[i];

		// Skip messages that are not system role
		if (message.role !== 'system') {
			continue;
		}

		// Skip system messages that have tool_call_id or name - these are likely
		// tool-result messages misclassified as system
		if (message.tool_call_id !== undefined || message.name !== undefined) {
			continue;
		}

		// Only process system messages with string content
		// Leave Anthropic-style content: [{ type: "text", text: "..." }] untouched
		if (typeof message.content !== 'string') {
			continue;
		}

		// Filter out empty/whitespace-only content
		const trimmedContent = message.content.trim();
		if (trimmedContent.length === 0) {
			continue;
		}

		systemMessageIndices.push(i);
		systemContents.push(trimmedContent);
	}

	// If there are no system messages to merge, return unchanged
	if (systemContents.length === 0) {
		return messages;
	}

	// Build the new array
	// Join system contents with double newline - OpenCode base prompt first,
	// then swarm agent prompt (matching original insertion order)
	const mergedSystemContent = systemContents.join('\n\n');

	const result: Message[] = [];

	// Add the consolidated system message at index 0
	// Preserve additional fields from the first system message
	const firstSystemMessage = messages[systemMessageIndices[0]];
	result.push({
		role: 'system',
		content: mergedSystemContent,
		...Object.fromEntries(
			Object.entries(firstSystemMessage).filter(
				([key]) => key !== 'role' && key !== 'content',
			),
		),
	});

	// Add all non-system messages in their original order
	for (let i = 0; i < messages.length; i++) {
		if (!systemMessageIndices.includes(i)) {
			// Create a shallow copy to avoid mutating the original
			result.push({ ...messages[i] });
		}
	}

	return result;
}

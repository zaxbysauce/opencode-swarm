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
	// Fast path: if there's exactly one system message at index 0 and no other system
	// messages anywhere in the array, return unchanged.
	// HF-3: Must check ALL system messages (not just mergeable ones) to uphold the
	// guarantee that no system message survives at index > 0.
	if (
		messages.length > 0 &&
		messages[0].role === 'system' &&
		messages[0].content !== undefined &&
		typeof messages[0].content === 'string' &&
		messages[0].content.trim().length > 0
	) {
		// Count ALL system-role messages in the array (regardless of content format or fields)
		const totalSystemCount = messages.filter((m) => m.role === 'system').length;

		if (totalSystemCount === 1) {
			return [...messages];
		}
	}

	// Collect indices and contents of system messages to merge
	const systemMessageIndices: number[] = [];
	const systemContents: string[] = [];

	for (let i = 0; i < messages.length; i++) {
		const message = messages[i];

		// Only process system-role messages
		if (message.role !== 'system') continue;

		// Skip system messages that have tool_call_id or name - these are likely
		// tool-result messages misclassified as system; they will be removed by
		// the safety-net filter (not merged into the consolidated message)
		if (message.tool_call_id !== undefined || message.name !== undefined)
			continue;

		// Extract text content regardless of format
		let textContent: string | null = null;

		if (typeof message.content === 'string') {
			const trimmed = message.content.trim();
			if (trimmed.length > 0) textContent = trimmed;
		} else if (Array.isArray(message.content)) {
			// Handle Anthropic-style content: [{ type: "text", text: "..." }]
			const texts = (message.content as Array<{ type?: string; text?: string }>)
				.filter((part) => part.type === 'text' && typeof part.text === 'string')
				.map((part) => part.text!.trim())
				.filter((t) => t.length > 0);
			if (texts.length > 0) textContent = texts.join('\n');
		}
		// null, undefined, or unrecognized content format — mark for removal

		systemMessageIndices.push(i);
		if (textContent) {
			systemContents.push(textContent);
		}
	}

	// If there are no system messages to merge, remove all system messages
	// except the one at index 0 (local models crash on system messages at index > 0)
	if (systemContents.length === 0) {
		return messages.filter((m, idx) => {
			// Keep all non-system messages
			if (m.role !== 'system') return true;
			// Keep first system message only (index 0 in original array)
			// Safety net: local models (Qwen, Gemma) crash on system messages at index > 0
			return idx === 0;
		});
	}

	// Build the new array
	// Join system contents with double newline - OpenCode base prompt first,
	// then swarm agent prompt (matching original insertion order)
	const mergedSystemContent = systemContents.join('\n\n');

	const result: Message[] = [];

	// Add the consolidated system message at index 0
	// Preserve additional fields from the first system message, but strip tool-specific fields
	const firstSystemMessage = messages[systemMessageIndices[0]];
	result.push({
		role: 'system',
		content: mergedSystemContent,
		...Object.fromEntries(
			Object.entries(firstSystemMessage).filter(
				([key]) =>
					key !== 'role' &&
					key !== 'content' &&
					key !== 'name' &&
					key !== 'tool_call_id',
			),
		),
	});

	// Add all non-system messages in their original order
	for (let i = 0; i < messages.length; i++) {
		const message = messages[i];

		// Skip system messages that are in systemMessageIndices (they were merged)
		if (systemMessageIndices.includes(i)) {
			continue;
		}

		// Skip whitespace-only system messages that were not merged
		if (
			message.role === 'system' &&
			typeof message.content === 'string' &&
			message.content.trim().length === 0
		) {
			continue;
		}

		// Create a shallow copy to avoid mutating the original
		result.push({ ...message });
	}

	// Safety net: strip any system message that slipped past merge logic
	// Local models (Qwen, Gemma) crash on system messages at index > 0
	return result.filter((msg, idx) => {
		if (idx === 0) return true;
		return msg.role !== 'system';
	});
}

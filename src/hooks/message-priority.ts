/**
 * Message Priority Classifier Hook
 *
 * Provides zero-cost message priority classification to enable intelligent
 * context pruning. Messages are tagged with priority tiers (0-4) so that
 * low-priority messages are removed first during context budget pressure.
 *
 * Priority tiers:
 * - CRITICAL (0): System prompt, plan state, active instructions
 * - HIGH (1): User messages, current task context, tool definitions
 * - MEDIUM (2): Recent assistant responses, recent tool results
 * - LOW (3): Old assistant responses, old tool results, confirmations
 * - DISPOSABLE (4): Duplicate reads, superseded writes, stale errors
 */

/**
 * Message priority tiers for context pruning decisions.
 * Lower values = higher priority (kept longer during pruning).
 */
export const MessagePriority = {
	/** System prompt, plan state, active instructions - never prune */
	CRITICAL: 0,
	/** User messages, current task context, tool definitions */
	HIGH: 1,
	/** Recent assistant responses, recent tool results (within recentWindowSize) */
	MEDIUM: 2,
	/** Old assistant responses, old tool results */
	LOW: 3,
	/** Duplicate reads, superseded writes, stale errors - prune first */
	DISPOSABLE: 4,
} as const;

export type MessagePriorityType =
	(typeof MessagePriority)[keyof typeof MessagePriority];

/** Message structure matching the format from context-budget.ts */
interface MessageInfo {
	role?: string;
	agent?: string;
	sessionID?: string;
	modelID?: string;
	providerID?: string;
	toolName?: string;
	toolArgs?: unknown;
	[key: string]: unknown;
}

interface MessagePart {
	type?: string;
	text?: string;
	[key: string]: unknown;
}

export interface MessageWithParts {
	info?: MessageInfo;
	parts?: MessagePart[];
}

/**
 * Checks if text contains .swarm/plan or .swarm/context references
 * indicating swarm state that should be preserved.
 *
 * @param text - The text content to check
 * @returns true if the text contains plan/context references
 */
export function containsPlanContent(text: string): boolean {
	if (!text) return false;

	const lowerText = text.toLowerCase();
	return (
		lowerText.includes('.swarm/plan') ||
		lowerText.includes('.swarm/context') ||
		lowerText.includes('swarm/plan.md') ||
		lowerText.includes('swarm/context.md')
	);
}

/**
 * Checks if a message is a tool result (assistant message with tool call).
 *
 * @param message - The message to check
 * @returns true if the message appears to be a tool result
 */
export function isToolResult(message: MessageWithParts): boolean {
	if (!message?.info) return false;

	const role = message.info.role;
	const toolName = message.info.toolName;

	// Assistant messages with tool info are tool results
	return role === 'assistant' && !!toolName;
}

/**
 * Checks if two consecutive tool read calls are duplicates
 * (same tool with same first argument).
 *
 * @param current - The current message
 * @param previous - The previous message
 * @returns true if this is a duplicate tool read
 */
export function isDuplicateToolRead(
	current: MessageWithParts,
	previous: MessageWithParts,
): boolean {
	if (!current?.info || !previous?.info) return false;

	const currentTool = current.info.toolName;
	const previousTool = previous.info.toolName;

	// Must be the same tool
	if (currentTool !== previousTool) return false;

	// Must be read operations
	const isReadTool =
		currentTool?.toLowerCase().includes('read') &&
		previousTool?.toLowerCase().includes('read');

	if (!isReadTool) return false;

	// Check if first argument is the same
	const currentArgs = current.info.toolArgs as
		| Record<string, unknown>
		| undefined;
	const previousArgs = previous.info.toolArgs as
		| Record<string, unknown>
		| undefined;

	if (!currentArgs || !previousArgs) return false;

	// Get the first key/value from tool args
	const currentKeys = Object.keys(currentArgs);
	const previousKeys = Object.keys(previousArgs);

	if (currentKeys.length === 0 || previousKeys.length === 0) return false;

	// Compare first argument value
	const firstKey = currentKeys[0];
	return currentArgs[firstKey] === previousArgs[firstKey];
}

/**
 * Checks if a message contains an error pattern and is stale
 * (more than the specified number of turns old).
 *
 * @param text - The message text to check
 * @param turnsAgo - How many turns ago the message was sent
 * @returns true if the message is a stale error
 */
export function isStaleError(text: string, turnsAgo: number): boolean {
	if (!text) return false;

	// Only check messages older than threshold
	if (turnsAgo <= 6) return false;

	const lowerText = text.toLowerCase();

	// Common error patterns
	const errorPatterns = [
		'error:',
		'failed to',
		'could not',
		'unable to',
		'exception',
		'errno',
		'cannot read',
		'not found',
		'access denied',
		'timeout',
	];

	return errorPatterns.some((pattern) => lowerText.includes(pattern));
}

/**
 * Extracts text content from a message's parts.
 *
 * @param message - The message to extract text from
 * @returns The concatenated text content
 */
function extractMessageText(message: MessageWithParts): string {
	if (!message?.parts || message.parts.length === 0) return '';

	return message.parts.map((part) => part?.text || '').join('');
}

/**
 * Classifies a message by priority tier for intelligent pruning.
 *
 * @param message - The message to classify
 * @param index - Position in messages array (0-indexed)
 * @param totalMessages - Total number of messages
 * @param recentWindowSize - Number of recent messages to consider MEDIUM (default 10)
 * @returns Priority tier (0=CRITICAL, 1=HIGH, 2=MEDIUM, 3=LOW, 4=DISPOSABLE)
 */
export function classifyMessage(
	message: MessageWithParts,
	index: number,
	totalMessages: number,
	recentWindowSize: number = 10,
): MessagePriorityType {
	// Extract role and text for classification
	const role = message?.info?.role;
	const text = extractMessageText(message);

	// 1. Check for plan/context content - CRITICAL (preserve swarm state)
	if (containsPlanContent(text)) {
		return MessagePriority.CRITICAL;
	}

	// 2. System messages - CRITICAL (never prune swarm state)
	if (role === 'system') {
		return MessagePriority.CRITICAL;
	}

	// 3. User messages - HIGH
	if (role === 'user') {
		return MessagePriority.HIGH;
	}

	// 4. Check for tool results
	if (isToolResult(message)) {
		const positionFromEnd = totalMessages - 1 - index;

		// Recent tool results - MEDIUM
		if (positionFromEnd < recentWindowSize) {
			return MessagePriority.MEDIUM;
		}

		// Check for stale errors
		if (isStaleError(text, positionFromEnd)) {
			return MessagePriority.DISPOSABLE;
		}

		// Older tool results - LOW
		return MessagePriority.LOW;
	}

	// 5. Assistant messages
	if (role === 'assistant') {
		const positionFromEnd = totalMessages - 1 - index;

		// Recent assistant messages - MEDIUM
		if (positionFromEnd < recentWindowSize) {
			return MessagePriority.MEDIUM;
		}

		// Check for stale errors
		if (isStaleError(text, positionFromEnd)) {
			return MessagePriority.DISPOSABLE;
		}

		// Older assistant messages - LOW
		return MessagePriority.LOW;
	}

	// 6. Default: treat as LOW priority
	return MessagePriority.LOW;
}

/**
 * Classifies a batch of messages with duplicate detection.
 * This function should be called in order (oldest to newest) to properly
 * detect consecutive duplicate tool reads.
 *
 * @param messages - Array of messages to classify
 * @param recentWindowSize - Number of recent messages to consider MEDIUM (default 10)
 * @returns Array of priority classifications matching message order
 */
export function classifyMessages(
	messages: MessageWithParts[],
	recentWindowSize: number = 10,
): MessagePriorityType[] {
	const results: MessagePriorityType[] = [];
	const totalMessages = messages.length;

	for (let i = 0; i < messages.length; i++) {
		const message = messages[i];
		const priority = classifyMessage(
			message,
			i,
			totalMessages,
			recentWindowSize,
		);

		// Check for consecutive duplicate tool reads (when looking at newer messages)
		// Mark older duplicates as DISPOSABLE
		if (i > 0) {
			const current = messages[i];
			const previous = messages[i - 1];

			if (isDuplicateToolRead(current, previous)) {
				// Only demote if not already CRITICAL or HIGH priority
				if (results[i - 1] >= MessagePriority.MEDIUM) {
					results[i - 1] = MessagePriority.DISPOSABLE;
				}
			}
		}

		results.push(priority);
	}

	return results;
}

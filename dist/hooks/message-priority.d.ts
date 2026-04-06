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
export declare const MessagePriority: {
    /** System prompt, plan state, active instructions - never prune */
    readonly CRITICAL: 0;
    /** User messages, current task context, tool definitions */
    readonly HIGH: 1;
    /** Recent assistant responses, recent tool results (within recentWindowSize) */
    readonly MEDIUM: 2;
    /** Old assistant responses, old tool results */
    readonly LOW: 3;
    /** Duplicate reads, superseded writes, stale errors - prune first */
    readonly DISPOSABLE: 4;
};
export type MessagePriorityType = (typeof MessagePriority)[keyof typeof MessagePriority];
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
export declare function containsPlanContent(text: string): boolean;
/**
 * Checks if a message is a tool result (assistant message with tool call).
 *
 * @param message - The message to check
 * @returns true if the message appears to be a tool result
 */
export declare function isToolResult(message: MessageWithParts): boolean;
/**
 * Checks if two consecutive tool read calls are duplicates
 * (same tool with same first argument).
 *
 * @param current - The current message
 * @param previous - The previous message
 * @returns true if this is a duplicate tool read
 */
export declare function isDuplicateToolRead(current: MessageWithParts, previous: MessageWithParts): boolean;
/**
 * Checks if a message contains an error pattern and is stale
 * (more than the specified number of turns old).
 *
 * @param text - The message text to check
 * @param turnsAgo - How many turns ago the message was sent
 * @returns true if the message is a stale error
 */
export declare function isStaleError(text: string, turnsAgo: number): boolean;
/**
 * Classifies a message by priority tier for intelligent pruning.
 *
 * @param message - The message to classify
 * @param index - Position in messages array (0-indexed)
 * @param totalMessages - Total number of messages
 * @param recentWindowSize - Number of recent messages to consider MEDIUM (default 10)
 * @returns Priority tier (0=CRITICAL, 1=HIGH, 2=MEDIUM, 3=LOW, 4=DISPOSABLE)
 */
export declare function classifyMessage(message: MessageWithParts, index: number, totalMessages: number, recentWindowSize?: number): MessagePriorityType;
/**
 * Classifies a batch of messages with duplicate detection.
 * This function should be called in order (oldest to newest) to properly
 * detect consecutive duplicate tool reads.
 *
 * @param messages - Array of messages to classify
 * @param recentWindowSize - Number of recent messages to consider MEDIUM (default 10)
 * @returns Array of priority classifications matching message order
 */
export declare function classifyMessages(messages: MessageWithParts[], recentWindowSize?: number): MessagePriorityType[];
export {};

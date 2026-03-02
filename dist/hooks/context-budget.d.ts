/**
 * Context Budget Tracker Hook
 *
 * Estimates token usage across all messages and injects budget warnings
 * when thresholds are exceeded. Uses experimental.chat.messages.transform
 * to provide proactive context management guidance to the architect agent.
 */
import type { PluginConfig } from '../config';
interface MessageInfo {
    role: string;
    agent?: string;
    sessionID?: string;
    modelID?: string;
    providerID?: string;
    [key: string]: unknown;
}
interface MessagePart {
    type: string;
    text?: string;
    [key: string]: unknown;
}
interface MessageWithParts {
    info: MessageInfo;
    parts: MessagePart[];
}
/**
 * Creates the experimental.chat.messages.transform hook for context budget tracking.
 * Injects warnings when context usage exceeds configured thresholds.
 * Only operates on messages for the architect agent.
 */
export declare function createContextBudgetHandler(config: PluginConfig): (_input: Record<string, never>, _output: {
    messages?: MessageWithParts[];
}) => Promise<void>;
export {};

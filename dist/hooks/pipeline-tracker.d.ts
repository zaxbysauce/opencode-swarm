/**
 * Pipeline Tracker Hook
 *
 * Injects phase reminders into messages to keep the Architect on track.
 * Uses experimental.chat.messages.transform so it doesn't show in UI.
 *
 * Research: "LLMs Get Lost In Multi-Turn Conversation" shows ~40% compliance
 * drop after 2-3 turns without reminders.
 */
import type { PluginConfig } from '../config';
interface MessageInfo {
    role: string;
    agent?: string;
    sessionID?: string;
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
 * Creates the experimental.chat.messages.transform hook for pipeline tracking.
 * Only injects for the architect agent.
 */
export declare function createPipelineTrackerHook(config: PluginConfig): {
    'experimental.chat.messages.transform'?: undefined;
} | {
    'experimental.chat.messages.transform': (_input: Record<string, never>, output: {
        messages?: MessageWithParts[];
    }) => Promise<void>;
};
export {};

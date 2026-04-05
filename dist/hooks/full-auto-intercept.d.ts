/**
 * Full-Auto Intercept Hook
 *
 * Intercepts architect messages in full-auto mode and triggers autonomous oversight
 * when the architect outputs escalation patterns (questions, phase completion prompts).
 *
 * This hook runs as a chat.message transform — it inspects the architect's output
 * and injects the critic's autonomous oversight response when escalation is detected.
 */
import type { PluginConfig } from '../config';
interface MessageWithParts {
    info: {
        role: string;
        agent?: string;
        sessionID?: string;
        [key: string]: unknown;
    };
    parts: Array<{
        type: string;
        text?: string;
        [key: string]: unknown;
    }>;
}
/**
 * Creates the full-auto intercept hook factory.
 *
 * This hook intercepts architect messages in full-auto mode and triggers
 * autonomous oversight when escalation patterns are detected.
 *
 * @param config - Plugin configuration containing full_auto settings
 * @param directory - Working directory from plugin init context
 * @returns Hook object with messagesTransform function
 */
export declare function createFullAutoInterceptHook(config: PluginConfig, directory: string): {
    messagesTransform: (input: Record<string, never>, output: {
        messages?: MessageWithParts[];
    }) => Promise<void>;
};
export {};

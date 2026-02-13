/**
 * Delegation Gate Hook
 *
 * Warns the architect when coder delegations are too large or batched.
 * Uses experimental.chat.messages.transform to provide non-blocking guidance.
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
 * Creates the experimental.chat.messages.transform hook for delegation gating.
 * Inspects coder delegations and warns when tasks are oversized or batched.
 */
export declare function createDelegationGateHook(config: PluginConfig): (input: Record<string, never>, output: {
    messages?: MessageWithParts[];
}) => Promise<void>;
export {};

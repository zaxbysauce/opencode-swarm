/**
 * Delegation Gate Hook
 *
 * Warns the architect when coder delegations are too large or batched.
 * Uses experimental.chat.messages.transform to provide non-blocking guidance.
 */
import type { PluginConfig } from '../config';
import type { DelegationEnvelope, EnvelopeValidationResult } from '../types/delegation.js';
/**
 * v6.33.1 CRIT-1: Fallback map for declared coder scope by taskId.
 * When messagesTransform sets declaredCoderScope on the architect session,
 * the coder session may not exist yet. This map allows scope-guard to look up
 * the scope by taskId when the session's declaredCoderScope is null.
 */
export declare const pendingCoderScopeByTaskId: Map<string, string[]>;
/**
 * Parses a string to extract a DelegationEnvelope.
 * Returns null if no valid envelope is found.
 * Never throws - all errors are caught and result in null.
 */
export declare function parseDelegationEnvelope(content: string, directory?: string): DelegationEnvelope | null;
interface ValidationContext {
    planTasks: string[];
    validAgents: string[];
}
/**
 * Validates a DelegationEnvelope against the current plan and agent list.
 * Returns { valid: true } on success, or { valid: false; reason: string } on failure.
 */
export declare function validateDelegationEnvelope(envelope: unknown, context: ValidationContext): EnvelopeValidationResult;
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
export declare function createDelegationGateHook(config: PluginConfig, directory: string): {
    messagesTransform: (input: Record<string, never>, output: {
        messages?: MessageWithParts[];
    }) => Promise<void>;
    toolAfter: (input: {
        tool: string;
        sessionID: string;
        callID: string;
        args?: Record<string, unknown>;
    }, output: unknown) => Promise<void>;
};
export {};

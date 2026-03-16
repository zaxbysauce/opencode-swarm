/**
 * Provider-Aware Model Limit Resolution
 *
 * Resolves context window limits based on the model and provider platform.
 * The same model has different context limits depending on the provider:
 * - Claude Sonnet 4.6: 200k native, 128k on Copilot
 * - GPT-5: 400k native, 128k on Copilot
 * - Copilot caps ALL models at 128k prompt, regardless of native limit
 */
/**
 * Native model context limits (in tokens) when used on their native platform.
 */
export declare const NATIVE_MODEL_LIMITS: Record<string, number>;
/**
 * Provider-specific context caps that override native limits.
 * These are typically lower than native limits (e.g., Copilot caps at 128k).
 */
export declare const PROVIDER_CAPS: Record<string, number>;
/**
 * Message structure from experimental.chat.messages.transform hook.
 */
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
 * Extracts modelID and providerID from the most recent assistant message.
 *
 * @param messages - Array of messages from experimental.chat.messages.transform hook
 * @returns Object containing modelID and/or providerID if found
 *
 * @example
 * const info = extractModelInfo(messages);
 * // Returns: { modelID: 'claude-sonnet-4-6', providerID: 'anthropic' }
 * // Or: {} if no assistant messages or fields not found
 */
export declare function extractModelInfo(messages: MessageWithParts[]): {
    modelID?: string;
    providerID?: string;
};
/**
 * Resolves the context limit for a given model/provider combination.
 *
 * Resolution order (first match wins):
 * 1. Check configOverrides["provider/model"] (e.g., "copilot/claude-sonnet-4-6": 200000)
 * 2. Check configOverrides[modelID] (e.g., "claude-sonnet-4-6": 200000)
 * 3. Check PROVIDER_CAPS[providerID] (e.g., copilot → 128000)
 * 4. Check NATIVE_MODEL_LIMITS with prefix matching (e.g., "claude-sonnet-4" matches "claude-sonnet-4-6-20260301")
 * 5. Check configOverrides.default
 * 6. Fall back to 128000
 *
 * @param modelID - The model identifier (e.g., "claude-sonnet-4-6", "gpt-5")
 * @param providerID - The provider identifier (e.g., "copilot", "anthropic")
 * @param configOverrides - User configuration overrides
 * @returns The resolved context limit in tokens
 *
 * @example
 * // Provider cap (copilot)
 * resolveModelLimit("claude-sonnet-4-6", "copilot", {})
 * // Returns: 128000
 *
 * @example
 * // Native limit (anthropic)
 * resolveModelLimit("claude-sonnet-4-6", "anthropic", {})
 * // Returns: 200000
 *
 * @example
 * // Override beats cap
 * resolveModelLimit("gpt-5", "copilot", { "copilot/gpt-5": 200000 })
 * // Returns: 200000
 *
 * @example
 * // Prefix match for model variants
 * resolveModelLimit("claude-sonnet-4-6-20260301", "anthropic", {})
 * // Returns: 200000
 *
 * @example
 * // Full fallback
 * resolveModelLimit(undefined, undefined, {})
 * // Returns: 128000
 */
export declare function resolveModelLimit(modelID?: string, providerID?: string, configOverrides?: Record<string, number>): number;
export {};

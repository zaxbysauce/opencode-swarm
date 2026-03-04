/**
 * Guardrails Hook Module
 *
 * Circuit breaker for runaway LLM agents. Monitors tool usage via OpenCode Plugin API hooks
 * and implements two-layer protection:
 * - Layer 1 (Soft Warning @ warning_threshold): Sets warning flag for messagesTransform to inject warning
 * - Layer 2 (Hard Block @ 100%): Throws error in toolBefore to block further calls, injects STOP message
 */
import { type GuardrailsConfig } from '../config/schema';
/**
 * Creates guardrails hooks for circuit breaker protection
 * @param directory Working directory (from plugin init context)
 * @param config Guardrails configuration
 * @returns Tool before/after hooks and messages transform hook
 */
export declare function createGuardrailsHooks(directory: string, config: GuardrailsConfig): {
    toolBefore: (input: {
        tool: string;
        sessionID: string;
        callID: string;
    }, output: {
        args: unknown;
    }) => Promise<void>;
    toolAfter: (input: {
        tool: string;
        sessionID: string;
        callID: string;
    }, output: {
        title: string;
        output: string;
        metadata: unknown;
    }) => Promise<void>;
    messagesTransform: (input: Record<string, never>, output: {
        messages?: Array<{
            info: {
                role: string;
                agent?: string;
                sessionID?: string;
            };
            parts: Array<{
                type: string;
                text?: string;
                [key: string]: unknown;
            }>;
        }>;
    }) => Promise<void>;
};
/**
 * Hashes tool arguments for repetition detection
 * @param args Tool arguments to hash
 * @returns Numeric hash (0 if hashing fails)
 */
export declare function hashArgs(args: unknown): number;

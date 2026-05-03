/**
 * Full-Auto Intercept Hook
 *
 * Intercepts architect messages in full-auto mode and triggers autonomous oversight
 * when the architect outputs escalation patterns (questions, phase completion prompts).
 *
 * This hook runs as a chat.message transform — it inspects the architect's output
 * and injects the critic's autonomous oversight response when escalation is detected.
 */
import type { OpencodeClient } from '@opencode-ai/sdk';
import type { AgentDefinition } from '../agents/architect.js';
import type { PluginConfig } from '../config';
import type { AgentSessionState } from '../state.js';
/**
 * Test-only dependency-injection seam. Production code accesses state through
 * `_internals.*` so tests can swap individual functions on this object without
 * resorting to `mock.module('../../../src/state.js', ...)`, which leaks across
 * test files in Bun's shared test-runner process and contaminates unrelated
 * suites (see `gitignore-warning.ts:_internals` and `diff-scope.ts:_internals`
 * for the pattern rationale). Tests should restore overridden properties in
 * `afterEach`.
 *
 * All fields default to `null`. In production the lazy loaders (`_loadState`,
 * `_loadCritic`) are used as fallbacks. In tests, set a non-null override
 * before calling the hook to bypass the real module entirely.
 */
export declare const _internals: {
    hasActiveFullAuto: ((sessionId?: string) => boolean) | null;
    ensureAgentSession: ((sessionId: string) => AgentSessionState) | null;
    swarmState: {
        opencodeClient: OpencodeClient | null;
    } | null;
    createCriticAutonomousOversightAgent: ((model: string, customAppendPrompt?: string) => AgentDefinition) | null;
};
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
 * Result from critic dispatch — used to inject verdict into message stream.
 */
interface CriticDispatchResult {
    verdict: string;
    reasoning: string;
    evidenceChecked: string[];
    antiPatternsDetected: string[];
    escalationNeeded: boolean;
    rawResponse: string;
}
/**
 * Parses the critic's structured text response into a CriticDispatchResult.
 * The critic response format is:
 *   VERDICT: APPROVED | NEEDS_REVISION | ...
 *   REASONING: [text with possible multi-line content]
 *   EVIDENCE_CHECKED: [list]
 *   ANTI_PATTERNS_DETECTED: [list or "none"]
 *   ESCALATION_NEEDED: YES | NO
 */
export declare function parseCriticResponse(rawResponse: string): CriticDispatchResult;
/**
 * Injects the critic's verdict as an assistant message after the architect's message.
 * This makes the verdict visible in the chat without modifying the architect's output.
 *
 * Verdict handling:
 * - ANSWER: injects critic's reasoning as the assistant's answer
 * - ESCALATE_TO_HUMAN: triggers escalation (handled separately)
 * - APPROVED / NEEDS_REVISION / REJECTED / BLOCKED / REPHRASE: injects verdict message
 */
export declare function injectVerdictIntoMessages(messages: MessageWithParts[], architectIndex: number, criticResult: CriticDispatchResult, escalationType: 'phase_completion' | 'question', oversightAgentName: string): void;
/**
 * Handles critic dispatch and writes the auto_oversight event after the critic responds.
 *
 * This function encapsulates the critic invocation and event writing flow.
 * The critic response is awaited before writing the event to events.jsonl.
 */
export declare function dispatchCriticAndWriteEvent(directory: string, architectOutput: string, criticContext: string, criticModel: string, escalationType: 'phase_completion' | 'question', interactionCount: number, deadlockCount: number, oversightAgentName: string): Promise<CriticDispatchResult>;
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

/**
 * Delegation message sanitization - Layer 2 defense against inter-agent manipulation.
 * Strips attempt metadata, urgency references, and consequence claims from gate agent messages.
 */
declare const SANITIZATION_PATTERNS: RegExp[];
/**
 * Sanitize a message by stripping manipulation patterns.
 * Returns sanitized text and logs if any stripping occurred.
 */
export declare function sanitizeMessage(text: string, patterns?: RegExp[]): {
    sanitized: string;
    modified: boolean;
    stripped: string[];
};
/**
 * Check if message is to a gate agent (reviewer, test_engineer, critic).
 */
export declare function isGateAgentMessage(agentName: string): boolean;
/**
 * Create a hook that sanitizes delegation messages to gate agents.
 * @param directory - The project directory containing the .swarm folder
 */
export declare function createDelegationSanitizerHook(directory: string): (input: unknown, output: unknown) => Promise<void>;
export { SANITIZATION_PATTERNS };

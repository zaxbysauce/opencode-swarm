/**
 * Base error class for all swarm errors.
 * Includes a machine-readable `code` and a user-facing `guidance` string.
 */
export declare class SwarmError extends Error {
    readonly code: string;
    readonly guidance: string;
    constructor(message: string, code: string, guidance: string);
}
/**
 * Error thrown when configuration loading or validation fails.
 */
export declare class ConfigError extends SwarmError {
    constructor(message: string, guidance: string);
}
/**
 * Error thrown when a hook execution fails.
 */
export declare class HookError extends SwarmError {
    constructor(message: string, guidance: string);
}
/**
 * Error thrown when a tool execution fails.
 */
export declare class ToolError extends SwarmError {
    constructor(message: string, guidance: string);
}
/**
 * Error thrown when CLI operations fail.
 */
export declare class CLIError extends SwarmError {
    constructor(message: string, guidance: string);
}

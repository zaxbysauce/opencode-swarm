/**
 * Canonical tool-name normalization helpers
 *
 * Strip namespace prefixes (e.g., "mega:write", "mega.search") to get the base tool name.
 */
/**
 * Strip namespace prefix from a tool name.
 *
 * Examples:
 *   "opencode:write" → "write"
 *   "opencode.bash" → "bash"
 *   "write" → "write"
 *   undefined/null → undefined
 */
export declare function normalizeToolName(toolName: string): string;
export declare function normalizeToolName(toolName: null | undefined): string | undefined;
/**
 * Strip namespace prefix and lowercase the result.
 *
 * Examples:
 *   "opencode:WRITE" → "write"
 *   "opencode.bash" → "bash"
 *   "write" → "write"
 */
export declare function normalizeToolNameLowerCase(toolName: string): string;

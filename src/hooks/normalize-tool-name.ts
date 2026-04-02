/**
 * Canonical tool-name normalization helpers
 *
 * Strip namespace prefixes (e.g., "mega:write", "mega.search") to get the base tool name.
 */

const NAMESPACE_PREFIX_PATTERN = /^[^:]+[:.]/;

/**
 * Strip namespace prefix from a tool name.
 *
 * Examples:
 *   "opencode:write" → "write"
 *   "opencode.bash" → "bash"
 *   "write" → "write"
 *   undefined/null → undefined
 */
export function normalizeToolName(toolName: string): string;
export function normalizeToolName(
	toolName: null | undefined,
): string | undefined;
export function normalizeToolName(
	toolName: string | null | undefined,
): string | undefined {
	if (!toolName) return undefined;
	return toolName.replace(NAMESPACE_PREFIX_PATTERN, '');
}

/**
 * Strip namespace prefix and lowercase the result.
 *
 * Examples:
 *   "opencode:WRITE" → "write"
 *   "opencode.bash" → "bash"
 *   "write" → "write"
 */
export function normalizeToolNameLowerCase(toolName: string): string {
	return toolName.replace(NAMESPACE_PREFIX_PATTERN, '').toLowerCase();
}

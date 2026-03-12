/**
 * Centralized regex safety utilities.
 *
 * Every call-site that builds a RegExp from runtime strings
 * (user config, glob patterns, tool input) MUST go through one of
 * these helpers to prevent ReDoS and broken matching.
 */

/**
 * Escape all regex metacharacters in a string so it can be
 * safely interpolated into a `new RegExp(...)` call.
 *
 * Covers the full set: . * + ? ^ $ { } ( ) | [ ] \
 */
export function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Convert a simple glob pattern (supports `*` and `?` wildcards)
 * into an anchored, case-insensitive RegExp.
 *
 * All other regex metacharacters in the pattern are escaped first,
 * so filenames containing `.`, `(`, `[`, etc. match literally.
 *
 * Semantics:
 *   `*`  → `.*`   (zero or more of any character)
 *   `?`  → `.`    (exactly one character)
 *
 * This is intentionally simple — it does NOT handle `**` / globstar.
 * For globstar support see `quality/metrics.ts` which has its own
 * path-aware implementation.
 */
export function simpleGlobToRegex(
	pattern: string,
	flags: string = 'i',
): RegExp {
	// Stash wildcards, escape everything else, restore wildcards
	let escaped = pattern
		.replace(/\*/g, '\x00STAR\x00')
		.replace(/\?/g, '\x00QMARK\x00');

	escaped = escapeRegex(escaped);

	escaped = escaped
		.replace(/\x00STAR\x00/g, '.*')
		.replace(/\x00QMARK\x00/g, '.');

	return new RegExp(`^${escaped}$`, flags);
}

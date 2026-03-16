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
export declare function escapeRegex(s: string): string;
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
export declare function simpleGlobToRegex(pattern: string, flags?: string): RegExp;

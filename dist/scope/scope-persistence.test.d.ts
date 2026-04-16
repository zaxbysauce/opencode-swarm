/**
 * Tests for scope-persistence (#519 v6.71.1).
 *
 * Covers:
 *   - Atomic write + read round-trip
 *   - Schema-version fail-closed on unknown version
 *   - TTL expiry returns null
 *   - lstat symlink guard
 *   - Plan.json fallback (files_touched) for active task
 *   - Resolve chain order: memory → disk → plan.json → pending-map
 *   - Invalid taskId rejection
 */
export {};

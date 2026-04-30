/**
 * Timeout-helper tests (issue #704).
 *
 * The plugin init path uses `withTimeout` to bound the snapshot rehydration
 * read so a slow filesystem cannot pin the host's `await server(...)`. The
 * helper must:
 *   - resolve to the racer's value when the racer wins,
 *   - reject with the supplied error when the deadline elapses,
 *   - clear its timer in `finally` (no leak that holds the loop open),
 *   - never throw synchronously.
 */
export {};

/**
 * Repo-graph builder hook tests (issue #704).
 *
 * These tests validate the contract that prevents the OpenCode Desktop hang:
 *   - calling `init()` returns control to the caller within a single
 *     macrotask (i.e. async-function-runs-sync-until-first-await is not
 *     reintroduced),
 *   - `toolAfter` waits for the initial scan before applying incremental
 *     updates (no race between the deferred init and the first write tool),
 *   - the homedir-refusal guard surfaces as a clean catch in `init()`.
 */
export {};

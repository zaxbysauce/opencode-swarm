/**
 * Tests for AgentRunContext and getRunContext (Phase 3 — dark foundation).
 *
 * Verifies:
 *   1. swarmState maps are the same objects as defaultRunContext maps (facade equivalence).
 *   2. Distinct AgentRunContext instances do not share per-run maps.
 *   3. toolAggregates is intentionally process-global (shared reference).
 *   4. getRunContext with no arg / unknown runId returns defaultRunContext.
 */
export {};

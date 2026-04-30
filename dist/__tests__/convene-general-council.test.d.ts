/**
 * Tests for src/tools/convene-general-council.ts.
 *
 * Covers config gating, evidence path isolation (.swarm/council/general/),
 * roundsCompleted derivation, and structured-error responses for invalid
 * args + disabled-config paths. The moderatorPrompt field has been removed
 * from ConveneOk — the architect now synthesizes the final answer directly
 * via the inline output rules in MODE: COUNCIL.
 *
 * Real filesystem (tmp dir) for evidence-path assertions; no real HTTP.
 */
export {};

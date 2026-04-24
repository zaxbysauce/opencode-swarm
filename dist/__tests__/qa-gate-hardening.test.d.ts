/**
 * QA gate hardening tests.
 *
 * Covers the additions from the QA gate hardening rollout:
 * 1. council_general_review as the 9th QA gate (default OFF, ratchet-tighter, persistence)
 * 2. Behavioral guidance markup is rendered into the architect prompt for SPECIFY,
 *    BRAINSTORM, and PLAN inline gate-selection paths.
 * 3. save_plan blocks with QA_GATE_SELECTION_REQUIRED when context.md has no
 *    `## Pending QA Gate Selection` section AND no existing QaGateProfile.
 * 4. SWARM_SKIP_GATE_SELECTION=1 bypasses the new check.
 */
export {};

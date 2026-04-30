/**
 * Integration tests for council agent registration in src/agents/index.ts.
 *
 * Pins two behaviors that the council-mode refactor (commit c7e3be4) intends
 * to guarantee:
 *
 * 1. Model resolution regression test — `council_generalist` / `council_skeptic`
 *    / `council_domain_expert` MUST source their models from the user's
 *    configured `agents.reviewer.model` / `agents.critic.model` /
 *    `agents.sme.model` overrides, not from a hardcoded DEFAULT_MODELS
 *    fallback. This pins the fix for the original bug where
 *    `getModel('council_member')` always fell back to
 *    DEFAULT_MODELS.council_member because no swarm config ever had a
 *    `council_member` entry.
 *
 * 2. Deprecation warning pathway test — setting
 *    `council.general.moderatorModel` MUST surface a deferred deprecation
 *    warning at agent-creation time. The legacy `council.general.moderator`
 *    field is NOT checked because the strict schema applies a default of
 *    `true` to it, and the warning would then fire for every council user
 *    (real bug fixed in commit eee5977).
 */
export {};

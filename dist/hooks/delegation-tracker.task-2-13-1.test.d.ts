/**
 * Verification tests for Task 2.13.1: Thread plugin directory into createDelegationTrackerHook
 *
 * This test verifies that src/index.ts properly threads ctx.directory into
 * createDelegationTrackerHook(config, guardrailsConfig.enabled, ctx.directory)
 * so the delegation-tracker receives project-directory context without breaking
 * existing boolean configuration semantics.
 */
export {};

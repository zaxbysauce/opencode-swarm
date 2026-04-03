/**
 * Tests for the migration-aware identity guard in loadPlan()'s validation-failure
 * catch path (lines ~299-323 of manager.ts).
 *
 * When plan.json fails schema validation, the old code unconditionally called
 * replayFromLedger(). This allowed a post-migration ledger (old identity) to
 * overwrite a schema-invalid but correctly migrated plan.json.
 *
 * The fix: extract swarm+title from the raw JSON (even if schema validation
 * fails), compare against the first ledger event's plan_id, and only replay
 * when identities match.
 */
export {};

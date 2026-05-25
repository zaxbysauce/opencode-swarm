# Plan identity gate, snapshot retry, rebuild audit (Phase 1)

## What changed

- **Plan identity verification (FR-001):** `save_plan` now compares the incoming plan's identity (swarm + title) against the existing plan using `derivePlanId()`. If they differ, the tool rejects with `PLAN_IDENTITY_MISMATCH` unless `confirm_identity_change: true` is passed. This prevents accidental plan overwrites when an architect passes the wrong title or swarm_id.

- **`plan_rebuilt` ledger event (FR-003):** `rebuildPlan()` now appends a `plan_rebuilt` event to the ledger with `reason`, `phases_count`, and `tasks_count` payload. Triggers on ledger hash mismatch, approved snapshot fallback, and validation failure recovery. The event is idempotent (no-op on replay).

- **Snapshot retry with exponential backoff (FR-004):** Snapshot writes in both `save-plan.ts` and `manager.ts` now retry up to 3 times at 10/20/40ms intervals. After all retries are exhausted, a visible `console.warn` is emitted and a `snapshot_failed` telemetry event is recorded. Snapshot failures are non-fatal and never block the save operation.

- **`snapshot_failed` telemetry:** New event type added to `TelemetryEvent` union, emitted with `{ error, retries, source }` when snapshot writes exhaust all retries.

## Why

Phase 1 foundations for plan durability improvements: identity verification prevents data loss from accidental overwrites, the rebuild audit trail enables post-hoc forensics on when/why replays occurred, and snapshot retry addresses transient write failures that were previously silent.

## Migration

No migration required. All changes are additive and backward-compatible.

## Breaking changes

None.

## Test coverage

- `tests/unit/tools/save-plan-identity-gate.test.ts` — 11 identity gate tests
- `tests/unit/tools/save-plan-identity-gate.adversarial.test.ts` — 27 adversarial identity gate tests
- `tests/unit/tools/save-plan-snapshot-retry.test.ts` — 15 snapshot retry tests
- `tests/unit/tools/save-plan-snapshot-retry.adversarial.test.ts` — 41 adversarial snapshot retry tests
- `tests/unit/plan/plan-rebuilt-ledger-event.test.ts` — 9 rebuild ledger event tests

# `/swarm close` terminal plan state — managed write path (Phase 2)

## What changed

- **`/swarm close`:** terminal plan state now written through `closePlanTerminalState()` (FR-002, FR-005, FR-006) instead of raw `fs.writeFile`
- **Terminal ledger events:** `task_status_changed` (with original `from_status`) and `phase_completed` events appended to ledger before plan file writes, providing audit trail for crash/restart recovery
- **PlanSchema validation:** enforced before any ledger events or file writes — invalid plans rejected early with no side effects
- **Atomic writes:** `plan.json` and `plan.md` written via temp+rename pattern (same as `savePlan` and `rebuildPlan`)
- **Write-marker updated:** `.plan-write-marker` refreshed after terminal writes for `PlanSyncWorker` compatibility
- **Terminal snapshot:** `takeSnapshotEvent` called with `source: 'close_terminal'` to embed final closed statuses in ledger for replay integrity

## Why

Phase 2 of the plan durability improvements: the `/swarm close` command previously wrote terminal plan state directly via `fs.writeFile`, bypassing the ledger audit trail and atomic write guarantees. This made crash recovery unreliable and the close path inconsistent with `savePlan`'s managed write path. `closePlanTerminalState()` brings `/swarm close` into the same ledger-first, PlanSchema-validated, atomic-write pattern used everywhere else.

## Migration

No migration required. All changes are additive and backward-compatible.

## Breaking changes

None.

## Test coverage

- `tests/unit/commands/close.test.ts` — close command terminal state write tests
- `tests/unit/plan/manager.test.ts` — `closePlanTerminalState` unit tests

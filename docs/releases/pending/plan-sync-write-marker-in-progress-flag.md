# PlanSyncWorker race mitigation — in_progress write-marker flag (Phase 3)

## What changed

- **Write-marker `in_progress` flag (FR-007):** The `.plan-write-marker` file now includes an `in_progress` boolean field. An intermediate marker (`in_progress: true`) is written immediately after `plan.json` is renamed, before the final plan files are written. The marker is updated to `in_progress: false` at the end of the save operation.

- **PlanSyncWorker race mitigation:** `checkForUnauthorizedWrite()` now skips the mtime-based unauthorized-write check when `marker.in_progress === true`. This prevents false-positive warnings when PlanSyncWorker observes the marker file mid-save.

- **Test fixes:** 9 pre-existing integration test failures in `tests/integration/plan-sync-worker.test.ts` fixed by adding `acknowledged_removals` to the `updatePlan` helper, properly handling the PLAN_TASK_REMOVAL guard.

## Why

Phase 3 completes the plan durability improvements: the write-marker race condition (where PlanSyncWorker could flag an in-progress `savePlan` as an unauthorized external write) is now prevented by the `in_progress` flag. All 333 tests across 23 test files now pass.

## Migration

No migration required. All changes are additive and backward-compatible.

## Breaking changes

None.

## Test coverage

- `tests/integration/plan-sync-worker.test.ts` — PlanSyncWorker race condition tests
- `src/plan/manager.ts` — write-marker in_progress flag integration
- `src/background/plan-sync-worker.ts` — checkForUnauthorizedWrite in_progress skip logic

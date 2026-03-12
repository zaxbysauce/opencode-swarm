# Fix Plan: Issues #145 and #146 (v6.22.18)

## Scope
This document plans targeted fixes for:
- **#145**: phase status does not move to `in_progress` when the first task is set to `in_progress`.
- **#146**: task completion gate rejects `update_task_status(..., completed)` even after reviewer/test engineer gates were satisfied.

The plan is intentionally minimal-risk and focuses on existing update flows in `update_task_status` + plan/state managers.

---

## Issue #145 — phase status is stale after task status updates

### Observed behavior
`updateTaskStatus` updates task statuses only, then persists the plan. It does **not** recompute `phase.status`, so a phase can remain `pending` even when one or more tasks are `in_progress`.

### Likely root cause
`src/plan/manager.ts:updateTaskStatus()` maps tasks and writes plan, but never derives phase status from task statuses.

### Proposed fix
1. Add a small pure helper in `src/plan/manager.ts`:
   - `derivePhaseStatusFromTasks(tasks: Task[]): Phase['status']`
2. Use status precedence aligned to issue expectation **and existing enums**:
   - if **all tasks have `status === "completed"`** → phase `complete`
   - else if **any task `in_progress`** → phase `in_progress`
   - else if **any task `blocked`** (and no in-progress) → phase `blocked`
   - else (all pending / mixed pending+completed) → phase `pending`
3. In `updateTaskStatus`, after mutating tasks for each phase, set `phase.status = derivePhaseStatusFromTasks(updatedTasks)` before saving.
4. Keep `current_phase` behavior unchanged for this patch (avoid side effects).

### Notes from review
- `TaskStatus` uses `completed`, while phase status uses `complete` (with `completed` accepted as alias). The derivation logic must compare task status to `completed` and write normalized phase `complete`.

### Regression tests to add
Create tests in a new file (recommended): `src/plan/manager.update-task-status.test.ts`
- Setting first task in phase from `pending` → `in_progress` updates phase to `in_progress`.
- Setting all tasks in phase to `completed` updates phase to `complete`.
- Setting a task back to `pending` in an otherwise pending phase leaves phase `pending`.
- Optional: blocked precedence test (`blocked` without any `in_progress` yields `blocked`).

### Risk/compatibility
Low risk: logic is localized to phase status derivation during task updates and does not change schema.

---

## Issue #146 — completion gate false-negative for reviewer/test_engineer runs

### Observed behavior
`update_task_status` for `completed` can fail with QA gate errors despite reviewer + test_engineer agents having run.

### Refined diagnosis
- `checkReviewerGate` relies primarily on in-memory `taskWorkflowStates` being at `tests_run`/`complete`.
- There is explicit **all-idle detection** in `checkReviewerGate`, but it currently has no effect and then falls back to checking whether `plan.json` already says `completed` (circular for first completion write).
- The alias hypothesis (`mega_reviewer`, `mega_test_engineer`) is likely **not** root cause; delegation normalization already strips known prefixes.

### Proposed fix (single-source-of-truth path)
1. Keep the state machine as authority; do **not** add a parallel gate-evidence system.
2. In `checkReviewerGate`, when `allIdle` is true for the task across valid sessions, treat it as untracked-state recovery and allow completion.
3. Keep existing `tests_run`/`complete` fast-path unchanged.
4. Improve blocked error text to include per-session task states and explicitly call out missing required state.
5. On successful completion update, advance task workflow state to `complete` (best effort) for sessions where current state is `tests_run`.

### Regression tests to add
Create tests in new file (recommended): `src/tools/update-task-status.gates.test.ts`
- When state machine is `tests_run`, completion passes.
- When all valid sessions show task state `idle`, completion passes via recovery path (prevents retry loop).
- When sessions show non-idle and not `tests_run`/`complete`, completion fails with actionable state summary.

### Risk/compatibility
Medium-low risk: changes stay within existing gate semantics and avoid introducing a second source of truth.

---

## Delivery order
1. Implement #145 first (small deterministic behavior fix).
2. Add/green #145 tests.
3. Implement #146 all-idle recovery + messaging.
4. Add/green #146 tests.
5. Run targeted tests, then full test suite (`bun test`) and typecheck (`bun run typecheck`).

## Definition of done
- Repro scenario for #145 now updates phase status correctly for first `in_progress` task and all-complete states.
- Repro scenario for #146 can mark task completed after valid reviewer/test engineer flow even when task state tracking was idle/unavailable.
- New regression tests cover both failures.
- No schema changes and no regressions in existing test suite.

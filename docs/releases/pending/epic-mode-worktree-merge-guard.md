# Epic Mode: worktree merge-back guard for Rule 2 auto-commit

## What changed

- Epic Mode's Rule 2 auto-commit (in `plan/manager.updateTaskStatus`) now
  refuses to write a `swarm(task <id>):` completion marker when the task's
  coder ran in an isolated git worktree whose **merge-back failed or only
  partially landed**. Without this guard, the task's changes would be
  stranded in the preserved worktree while Rule 3's git-log scan treated
  the task as satisfied — silently advancing the plan past work that never
  reached the main tree.
- New leaf module `src/hooks/delegation-gate/worktree-merge-status.ts`: a
  process-local registry that bridges worktree isolation (writer) and Epic
  Mode Rule 2 (reader) without creating an import cycle. It records a
  `partial`/`failed` outcome keyed by plan task id, and clears it when a
  later re-dispatch of the same task merges cleanly.
- `finishStandardWorktreeDispatch` (and the hard-throw path in
  `delegation-gate.ts`) record the merge-back outcome into the registry;
  `updateTaskStatus` consults it before firing Rule 2. The merge-back is
  awaited inside the coder's `tool.execute.after` hook, which completes
  before the architect's turn that calls `update_task_status`, so the
  status is always settled by the time the guard reads it.
- When the marker is skipped, the plan status update **still persists**
  (the ledger is authoritative) and a `criticalWarn` surfaces the stranded
  worktree so the operator can resolve it and re-run the task.

## Why

Epic Mode was designed against a single shared working tree; main has since
added per-coder worktree isolation. The two compose, but a failed merge-back
is the one interaction where Epic's commit-based completion evidence could
diverge from what actually landed. This closes that gap.

## Compatibility

- No behavior change unless Epic Mode is active **and** worktree isolation
  produces a failed/partial merge-back. Default-off Epic Mode is unaffected.
- The `gitExec` non-interactive hardening (`GIT_TERMINAL_PROMPT=0`, scoped
  `commit.gpgsign=false`/`tag.gpgsign=false`) ensures Rule 2 commits never
  hang on a GPG/credential prompt on hosts with global commit signing.

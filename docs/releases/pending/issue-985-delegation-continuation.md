## Fix

- Strengthened architect continuation guidance so resumed plan work points at the durable current task, requires scoped coder dispatch, and preserves parallel execution profiles instead of falling back to broad rediscovery.

## Why

- Fixes #985, where "continue with the plan" could lead the architect to inspect files directly instead of moving the current task through `update_task_status`, `declare_scope`, and coder Task delegation.

## Validation

- Added focused unit coverage for serial continuation guidance, sorted current-task selection, parallel coder-slot guidance, and the architect resume prompt.

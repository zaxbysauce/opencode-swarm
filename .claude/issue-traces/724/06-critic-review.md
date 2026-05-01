# Critic Review — Issue 724

## Critic Mode
Two critics ran: fallback self-critic (synchronous) + independent background agent.
Background agent result incorporated — it is authoritative where it differs from self-critic.

## Verdict: NEEDS_REVISION (blocking on backward-compat wrapper; minor on TOCTOU note)

## Issues Found

### Issue 1: queueMicrotask / repoGraphHook timing gap (minor)
`repoGraphHook.init()` is queued via `queueMicrotask` before the proposed
`await ensureSwarmGitExcluded(...)` call. When JS yields at the `await`, queued
microtasks run — including starting `repoGraphHook.init()`. The graph builder writes to
`.swarm/repo-graph.json` asynchronously. In practice, the git subprocess calls in
`ensureSwarmGitExcluded` complete in <50ms while the graph scan takes seconds, so the
exclude write precedes the graph write. But the plan should document this timing nuance.

**Required revision**: Add a note to the plan acknowledging the timing gap and why it's
safe in practice (git calls are fast; graph scan is slow; the gap is accepted).

### Issue 2: warnIfSwarmNotGitignored backward compatibility
The plan says "kept as a thin synchronous wrapper for backward compat in tests" but does
not explicitly specify what that wrapper must do. Since tests import
`resetGitignoreWarningState` and `warnIfSwarmNotGitignored` from the module, both must
remain exported and functional.

**Required revision**: Explicitly state in the plan that:
- `warnIfSwarmNotGitignored(directory, quiet?)` remains exported and synchronous
- `resetGitignoreWarningState()` remains exported for test isolation
- These are now thin wrappers: `warnIfSwarmNotGitignored` calls
  `ensureSwarmGitExcluded(...).catch(() => {})` (fire-and-forget) as a backward-compat shim

### Non-Issues (resolved)

**Tracked file handling**: Writing to `.git/info/exclude` does NOT fix already-tracked
files — the plan correctly addresses this with tracked-file detection + unsuppressed warning.
The warning tells users the exact `git rm -r --cached .swarm` command. ✅

**loadSnapshot ordering**: Confirmed read-only (no `.swarm/` file creation in normal case;
quarantine rename only moves within existing `.swarm/`). No gap. ✅

**git check-ignore probe**: `.swarm/.gitkeep` is a valid probe path for `check-ignore`. ✅

**validateDiffScope filter**: Filtering `.swarm/` is correct because `.swarm/` must always
be excluded from Git; plan.json edits are done by `save_plan` tool not coder direct writes. ✅

**Concurrent process race**: Two simultaneous appends produce duplicate entries in exclude
file; git treats them as one rule. Benign. ✅

**git unavailable**: All git subprocess calls are wrapped in try/catch; non-fatal. ✅

## Revisions Required
1. Add timing note for `repoGraphHook` / `queueMicrotask` gap
2. Explicitly specify backward-compat exports

Both are documentation/spec clarifications, not logic changes. Fix direction is correct.

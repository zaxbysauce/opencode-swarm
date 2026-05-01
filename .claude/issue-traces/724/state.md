# Issue 724 Trace State

## Current Phase
Phase 3: Fix Plan (writing plan + independent critic)

## Completed Gates
- [x] Phase 0: trace directory created, todo list initialized
- [x] Phase 1: issue fetched, codebase read, reproduction documented
- [x] Phase 2: root cause localized to exact lines

## Active Hypothesis
`.swarm/` runtime files appear as uncommitted changes because:
1. Primary: plugin writes `.swarm/` files **before** calling `warnIfSwarmNotGitignored()`, so the protection runs too late to matter when files are already tracked
2. Secondary: `findGitRoot()` only recognizes `.git` as a directory, not a file (worktree/submodule path), silently skipping protection
3. Secondary: warning is suppressed in `quiet` mode, so desktop-default sessions never see it
4. Secondary: no detection of already-tracked `.swarm/` files (where `.gitignore` is irrelevant)
5. Secondary: no automatic protection — function only warns, never writes to `.git/info/exclude`
6. Tertiary: `validateDiffScope()` includes `.swarm/` paths in diff output when files are tracked

## Selected Fix Candidate
Replace `warnIfSwarmNotGitignored()` with `ensureSwarmGitExcluded()` that:
- Uses git CLI for git-root detection (handles worktrees/submodules)
- Automatically writes to `.git/info/exclude` before any `.swarm/` write
- Detects tracked `.swarm/` files and emits unsuppressed warning
- Filters `.swarm/` from `validateDiffScope()` output
- Moves the call to before all `.swarm/` startup writes

## Unresolved Risks
- Async git subprocess adds ~5-50ms to startup on slow systems
- Read-only repos can't write `.git/info/exclude` — must be non-fatal
- Concurrent plugin starts could race writing to the exclude file — idempotency needed

## Next Action
Write fix plan → run independent critic → present to user

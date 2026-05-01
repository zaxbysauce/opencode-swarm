# PR Body — Issue 724

## Summary

Fixes #724: `.swarm/` runtime-artifact Git hygiene bug.

The reporter saw "weird uncommitted changes" with paths like `git:<sha>:.swarm/dark-matter.md`. The `git:<sha>:` URI prefix means those files are **tracked** in Git. Every plugin startup writes to `.swarm/`, and tracked files bypass `.gitignore`, so each write created a permanent diff.

**Root causes fixed:**
- `ensureSwarmGitExcluded` replaces the advisory-only `warnIfSwarmNotGitignored` at the call site — it automatically writes `.swarm/` to `.git/info/exclude` before any `.swarm/` write, using git CLI (handles worktrees/submodules where `.git` is a file, not a directory)
- Moved the protection call to **before** `initTelemetry`, `writeSwarmConfigExampleIfNew`, `writeProjectConfigIfNew` (previously the warning ran after those writes)
- The exclude write is **never** gated on `quiet` mode (previous advisory warn was suppressed in quiet/desktop mode)
- Tracked `.swarm/` files are now detected via `git ls-files` and trigger an **unsuppressed** remediation warning
- `validateDiffScope()` now filters `.swarm/` paths to prevent tracked runtime files from producing false scope-violation warnings in QA review

## Test plan

- [ ] All 20 tests in `tests/gitignore-warning.test.ts` pass (12 existing + 8 new)
- [ ] New `ensureSwarmGitExcluded` tests cover: fresh repo writes exclude, already-ignored skips, no-duplicate-append, quiet-mode still writes, tracked-file warning, no-git no-throw, idempotent
- [ ] `src/hooks/diff-scope.test.ts` test 10 confirms `.swarm/` filter
- [ ] Pre-existing test failures in `diff-scope.test.ts` tests 2+9 are unrelated (git commit signing env issue) and pre-date this PR

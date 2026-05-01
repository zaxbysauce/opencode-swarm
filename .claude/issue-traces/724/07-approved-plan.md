# Approved Plan — Issue 724

> **Awaiting user approval before implementation begins.**

## Critic Review Summary
Two critics ran. Both returned NEEDS_REVISION. Revisions incorporated below:
1. **Blocking (independent critic)**: `warnIfSwarmNotGitignored` cannot be a synchronous wrapper around async `ensureSwarmGitExcluded` — tests call-then-assert synchronously, so a fire-and-forget wrapper would make all 12 existing tests race. Fix: keep `warnIfSwarmNotGitignored` entirely unchanged; add `ensureSwarmGitExcluded` as a new independent export.
2. **Minor (both critics)**: TOCTOU note corrected — read-check-append is not atomic; harmless duplicate `.swarm/` entries may occur; git handles duplicates correctly.
3. **Minor (self-critic)**: `repoGraphHook` timing gap documented.

Fix direction is confirmed correct by both critics.

---

## What Changed and Why
The plugin writes runtime state to `.swarm/` on every startup but its only protection is
an advisory `console.warn()` that fires **after** the writes, is suppressed in quiet mode,
does not detect already-tracked `.swarm/` files, and fails for Git worktrees. This is why
@Moeinich saw "weird uncommitted changes" — `.swarm/` files had been committed at some
point and are now tracked, making every startup produce visible diffs.

---

## Change 1: `src/utils/gitignore-warning.ts`

**Action**: Add a new `ensureSwarmGitExcluded(directory, options?)` function. Keep
`warnIfSwarmNotGitignored` and `resetGitignoreWarningState` exported as backward-compat
shims (tests depend on them).

**What it does:**
1. `git -C <dir> rev-parse --show-toplevel` — gets git root (handles worktrees/submodules where `.git` is a file, not a directory)
2. `git -C <dir> rev-parse --git-path info/exclude` — gets the correct local exclude path
3. `git -C <dir> check-ignore -q .swarm/.gitkeep` — tests if `.swarm/` is already ignored by any source
4. If not ignored: reads exclude file, checks for existing `.swarm` or `.swarm/` line, appends `# opencode-swarm\n.swarm/\n` if absent
5. `git -C <dir> ls-files -- .swarm` — detects tracked `.swarm/` files
6. If tracked: emits an **unsuppressed** `console.warn` with exact remediation:
   ```
   [opencode-swarm] WARNING: .swarm/ files are tracked by Git.
   .swarm/ contains local runtime state and may contain sensitive session data.
   Ignoring will not affect already-tracked files. To stop tracking them, run:
     git rm -r --cached .swarm
     echo ".swarm/" >> .gitignore
     git commit -m "Stop tracking opencode-swarm runtime state"
   ```
7. Non-fatal: all git subprocess errors caught and swallowed; never throws
8. Module-level flag: fires at most once per process

**quiet mode:**
- Exclude write: **always** happens (not gated on quiet)
- "Added .swarm/ to .git/info/exclude" info log: gated on `!quiet`
- Tracked-file warning: **never** gated on quiet (security/hygiene relevant)

**Backward-compat exports — UNCHANGED:**
- `warnIfSwarmNotGitignored(directory, quiet?)` — remains entirely synchronous and functionally unchanged; the 12 existing tests depend on synchronous call-then-assert semantics
- `resetGitignoreWarningState()` — remains exported for test isolation
- `_gitignoreWarningEmitted` — remains as exported module flag

`ensureSwarmGitExcluded` is a **new independent async export**. `src/index.ts` switches to calling it. `warnIfSwarmNotGitignored` is NOT modified — it becomes dead code at the call site in `src/index.ts` only (nothing else calls it in production).

**Timing note:** `repoGraphHook.init()` is queued via `queueMicrotask` in `src/index.ts`.
When `initializeOpenCodeSwarm` yields at `await ensureSwarmGitExcluded(...)`, that microtask
starts, beginning an async workspace scan. The scan writes to `.swarm/repo-graph.json` after
the scan completes (seconds later). The git subprocess calls in `ensureSwarmGitExcluded`
complete in <50ms. In practice, the `.git/info/exclude` write precedes the graph write.
This ordering gap is accepted because: (a) the race window is extremely narrow; (b) the
`repo-graph.json` write is itself non-critical for the Git hygiene fix.

---

## Change 2: `src/index.ts`

**Action**: Replace `warnIfSwarmNotGitignored(ctx.directory, config.quiet)` call at line 311 with `await ensureSwarmGitExcluded(ctx.directory, { quiet: config.quiet })` moved to **before line 308** (before all `.swarm/` writes).

```typescript
// BEFORE (lines 308-311):
initTelemetry(ctx.directory);
writeSwarmConfigExampleIfNew(ctx.directory);
writeProjectConfigIfNew(ctx.directory, config.quiet);
warnIfSwarmNotGitignored(ctx.directory, config.quiet);

// AFTER:
await ensureSwarmGitExcluded(ctx.directory, { quiet: config.quiet });  // ← NEW (moved before)
initTelemetry(ctx.directory);
writeSwarmConfigExampleIfNew(ctx.directory);
writeProjectConfigIfNew(ctx.directory, config.quiet);
// (warnIfSwarmNotGitignored call removed)
```

**Import**: Update `src/index.ts` import to use `ensureSwarmGitExcluded` from `./utils/gitignore-warning`.

---

## Change 3: `src/hooks/diff-scope.ts`

**Action**: In `validateDiffScope()`, filter `.swarm/` paths from the changed files list
before scope comparison:

```typescript
// After: const changedFiles = await getChangedFiles(directory);
// Add filter:
const filteredFiles = changedFiles.filter(
  (f) => !f.replace(/\\/g, '/').startsWith('.swarm/')
);
// Use filteredFiles instead of changedFiles in the rest of validateDiffScope
```

**Why**: When `.swarm/` files are tracked, they appear in `git diff --name-only` output and
generate spurious "scope violation" warnings in QA review. These are runtime files, not code.

---

## Change 4: `tests/gitignore-warning.test.ts`

**Action**: Add tests for `ensureSwarmGitExcluded`. Existing tests for `warnIfSwarmNotGitignored`
remain unchanged (they cover the backward-compat shim).

New tests:
1. Fresh git repo with no ignore rules: function appends `.swarm/` to `.git/info/exclude`
2. `.swarm/` already in `.gitignore`: no exclude write
3. `.swarm/` already in `.git/info/exclude`: no duplicate append
4. quiet mode: exclude write still runs, no cosmetic log
5. Tracked `.swarm/foo.json`: emits unsuppressed warning with `git rm -r --cached .swarm`
6. No git repo (no `.git` anywhere): no throw, no write
7. Called twice: idempotent — `.swarm/` appears only once in exclude file

---

## Files Changed
| File | Change |
|------|--------|
| `src/utils/gitignore-warning.ts` | Add `ensureSwarmGitExcluded`; keep existing exports as shims |
| `src/index.ts` | Move+replace protection call to before writes (~line 308) |
| `src/hooks/diff-scope.ts` | Filter `.swarm/` from `validateDiffScope()` |
| `tests/gitignore-warning.test.ts` | Add 7 new tests for `ensureSwarmGitExcluded` |

## No Unwired Functionality
- Storage migration to OS app-data: explicitly deferred
- Config doctor `.swarm/` checks: deferred to future PR
- Auto `git rm --cached`: rejected (too destructive)

---

## [ ] USER APPROVAL REQUIRED BEFORE IMPLEMENTATION

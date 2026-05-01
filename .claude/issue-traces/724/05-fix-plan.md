# Fix Plan — Issue 724

## Issue Summary
Plugin startup writes `.swarm/` runtime files that appear as uncommitted Git changes. When
`.swarm/` files are already tracked (committed), `.gitignore` cannot hide them. The current
advisory-only warning fires too late, is suppressed in quiet mode, doesn't detect tracked
files, and never automatically writes to `.git/info/exclude`.

## Root Cause (confirmed)
See `04-root-cause.md`. Six concrete defects:
1. Protection call runs after writes (`src/index.ts:308-311`)
2. `findGitRoot()` fails for worktrees/submodules (`gitignore-warning.ts:26-29`)
3. Warning suppressed in quiet mode (`gitignore-warning.ts:100-105`)
4. No tracked-file detection (no `git ls-files`)
5. No automatic `.git/info/exclude` write
6. `validateDiffScope()` includes `.swarm/` in diff output (`diff-scope.ts:107-137`)

## Candidates Considered

### Candidate A — Storage migration to OS app-data
Move `.swarm/` entirely to `~/.local/share/opencode-swarm/<project-hash>/` or equivalent.  
**Rejected**: Too large. Every consumer of `.swarm/` paths would need updating. Migration
needed for existing installations. Out of scope for a targeted bug fix.

### Candidate B — Add .swarm/ to .gitignore automatically (project file)
Auto-append `.swarm/` to `.gitignore` on every startup.  
**Rejected**: Writing to `.gitignore` is itself a committed change, creating a different
uncommitted-changes problem. Mutates user's tracked files without asking.

### Candidate C (SELECTED) — Auto-protect via .git/info/exclude + tracked-file warning
Replace the advisory warn with `ensureSwarmGitExcluded()` that:
- Calls `git rev-parse --show-toplevel` for reliable git-root detection (handles worktrees)
- Calls `git rev-parse --git-path info/exclude` to resolve the correct exclude path
- Calls `git check-ignore -q .swarm/.gitkeep` to test existing coverage idempotently
- Appends `.swarm/` to `.git/info/exclude` if not already covered
- Calls `git ls-files -- .swarm` to detect tracked files
- Emits an unsuppressed tracked-file remediation warning
- Moves the call to **before** any `.swarm/` write in `src/index.ts`

**Why C is correct:**
- `.git/info/exclude` is local-only — doesn't dirty the repo
- git CLI handles all edge cases (worktrees, submodules, nested repos, global excludes)
- Tracked-file detection enables correct remediation guidance
- Moving the call before writes means protection is established first

## Selected Fix

### File 1: `src/utils/gitignore-warning.ts` (replace entire file)

Replace `warnIfSwarmNotGitignored` + `findGitRoot` with:
- `ensureSwarmGitExcluded(directory, options?)` — async, idempotent, non-fatal
- `warnIfSwarmNotGitignored` kept as a thin synchronous wrapper for backward compat in tests

**New function responsibilities:**
1. `git -C <dir> rev-parse --show-toplevel` → git root (handles worktrees/submodules)
2. `git -C <dir> rev-parse --git-path info/exclude` → correct exclude path
3. `git -C <dir> check-ignore -q .swarm/.gitkeep` → already covered?
4. If not covered: read exclude file, check if `.swarm` or `.swarm/` already present,
   append `# opencode-swarm\n.swarm/\n` if not (atomic: read+check+append)
5. `git -C <dir> ls-files -- .swarm` → detect tracked files
6. If tracked: emit unsuppressed `console.warn` with exact remediation commands
7. Non-fatal: all errors caught and swallowed; never throws
8. Module-level flag to fire at most once per process

**quiet mode behavior:**
- Exclude write: ALWAYS happens (not gated on quiet)
- "Added .swarm/ to .git/info/exclude" info log: gated on `!quiet`
- Tracked-file warning: NEVER gated on quiet (security-relevant)

### File 2: `src/index.ts` (move the call)

Move `ensureSwarmGitExcluded(ctx.directory, { quiet: config.quiet })` to BEFORE line 308,
immediately after config load and before any `.swarm/` writes:

```typescript
// Protect .swarm/ from Git BEFORE any write to .swarm/
await ensureSwarmGitExcluded(ctx.directory, { quiet: config.quiet });

initTelemetry(ctx.directory);
writeSwarmConfigExampleIfNew(ctx.directory);
writeProjectConfigIfNew(ctx.directory, config.quiet);
// (remove old warnIfSwarmNotGitignored call)
```

Note: `ensureSwarmGitExcluded` is async (spawns git subprocesses). Since
`initializeOpenCodeSwarm` is already async, `await` is fine. The git calls are
fast (<50ms) and bounded by the overall plugin init timeout.

### File 3: `src/hooks/diff-scope.ts` (filter .swarm/)

In `validateDiffScope()`, add a filter after `getChangedFiles()`:

```typescript
const changedFiles = await getChangedFiles(directory);
if (!changedFiles) return null;

// Filter out .swarm/ runtime paths — tracked .swarm files must not
// trigger spurious scope warnings in QA review.
const filteredFiles = changedFiles.filter(
  (f) => !f.replace(/\\/g, '/').startsWith('.swarm/')
);
// use filteredFiles instead of changedFiles below
```

### File 4: `tests/gitignore-warning.test.ts` (update + extend)

Existing tests cover `warnIfSwarmNotGitignored`; those stay. Add new tests for
`ensureSwarmGitExcluded`:
- fresh git repo: function writes `.swarm/` to `.git/info/exclude`
- already excluded via `.gitignore`: no exclude write, no duplicate append
- already excluded via `exclude`: no duplicate append
- worktree-style (`.git` is a file): uses `git rev-parse` correctly (can be integration-level)
- tracked `.swarm/foo.json`: emits unsuppressed warning with remediation commands
- quiet mode: exclude write still happens, tracked-file warning still fires
- no git repo: no throw, no write
- called twice: idempotent, appends only once

**Note on test approach**: tests that spawn real git processes require creating real git repos
in temp directories (already done in existing test suite with `makeGitRepo`). The new tests
will extend this pattern.

## Files Expected to Change
1. `src/utils/gitignore-warning.ts` — replace `findGitRoot` + `warnIfSwarmNotGitignored` with `ensureSwarmGitExcluded`
2. `src/index.ts` — move/replace call site (lines ~308-311)
3. `src/hooks/diff-scope.ts` — add `.swarm/` filter in `validateDiffScope()`
4. `tests/gitignore-warning.test.ts` — add new test cases

## Edge Cases
| Case | Handling |
|------|----------|
| No Git repo | `git rev-parse` exits non-zero → catch → return early |
| `.git/info/` dir doesn't exist | `git rev-parse --git-path` gives correct path; we `mkdirSync(..., {recursive:true})` before write |
| `.git` is a file (worktree) | `git rev-parse --git-path info/exclude` resolves through the file automatically |
| Already has `.swarm` in exclude | `git check-ignore` returns 0 → skip write |
| Read-only `.git/info/exclude` | write fails → catch → continue without error |
| Concurrent starts | Both try to append; one may duplicate — idempotent check before append prevents this |
| Tracked `.swarm/` files | `git ls-files` returns non-empty → warn without auto-fix |
| Quiet mode | Exclude write still runs; only cosmetic logs are gated |
| No-Git workspace | `git` not found → subprocess error → catch → return early |

## Test Plan
1. **Unit: gitignore-warning.ts** — 8 new tests covering all edge cases above
2. **Unit: diff-scope.ts** — 1 new test: `.swarm/` paths filtered from undeclared list
3. **Integration startup regression** (optional if time permits):
   - Create temp git repo, init plugin, assert `.swarm/` is in `git check-ignore --stdin`
   - Assert `git status --porcelain -- .swarm` is empty after startup
4. **Integration tracked-file regression**:
   - Commit `.swarm/session/state.json`, run `ensureSwarmGitExcluded`, assert warning emitted

## Impact Analysis
| Surface | Impact |
|---------|--------|
| Plugin startup time | +5–50ms (git subprocesses, unnoticeable) |
| Existing `.swarm/` protection (non-worktree, non-quiet) | Unchanged or improved |
| Worktree users | Now protected (previously broken) |
| Quiet-mode users | Now protected (previously silent) |
| Already-tracked repos | Now warned with exact remediation |
| QA reviewer output | Cleaner — no false `.swarm/` scope warnings |
| Public API | None changed; `warnIfSwarmNotGitignored` kept for compat |
| Tests | All existing gitignore-warning tests continue passing |

## Rollout/Risk/Rollback
- Risk: LOW — all changes are additive or defensive
- The git subprocess calls are already used elsewhere in the codebase (diff-scope.ts)
- Non-fatal error handling means failures never block plugin init
- Rollback: revert the three source files; `.git/info/exclude` entries are harmless

## Unwired Functionality Checklist
- [ ] Storage migration to OS app-data — explicitly deferred, not part of this fix
- [ ] Config doctor `.swarm/` checks — left for a future enhancement PR
- [ ] `git rm --cached` auto-remediation — explicitly rejected (too destructive)

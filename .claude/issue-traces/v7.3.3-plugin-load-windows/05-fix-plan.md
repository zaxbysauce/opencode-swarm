# Fix Plan

## Issue Summary
opencode-swarm plugin fails to load on Windows 11 (and is at risk of the same failure on macOS / Linux): `ensureSwarmGitExcluded` is awaited on the critical plugin-init path with no timeout, and its 4 sequential `bunSpawn(['git', ...])` calls have no per-call timeout and no `stdin: 'ignore'`. Any host condition that prevents git from exiting promptly (antivirus, credential prompt, slow PATH lookup, network home, sandboxed exec, Bun-on-Windows stdin pipe semantics) hangs plugin init forever; OpenCode silently drops the plugin and no agents appear.

## Root Cause
See `04-root-cause.md`. Net: an awaited unbounded subprocess chain on the critical init path violates the "init must complete in bounded time" contract that the rest of the file already honours (e.g. `loadSnapshot` is wrapped in `withTimeout(5_000)`).

## Candidates considered

### Candidate 1 — `withTimeout` wrapper at the call site only  ← TOO NARROW
- Wrap `await ensureSwarmGitExcluded(...)` in `withTimeout(..., 3_000)`; on timeout, log a warning and continue.
- ✅ Smallest change.
- ❌ Leaves `bunSpawn` calls running in the background after the timeout fires. They never get killed because no `timeout` option was passed; the orphan git processes keep file descriptors and may delay process shutdown.
- ❌ Does not fix the analogous defect in `validateDiffScope`.

### Candidate 2 — Per-`bunSpawn` `timeout` + `stdin: 'ignore'` only  ← LEAVES OUTER GAP
- Pass `timeout: 1_500` and `stdin: 'ignore'` to each `bunSpawn` call inside `ensureSwarmGitExcluded` (and `getChangedFiles`).
- ✅ Each child is bounded. Stdin EOF is signalled immediately.
- ❌ A pathological host could still combine four ~1.5 s timeouts into ~6 s of init delay before the function exits. Plugin host may already be timing out before then.
- ❌ Does not honour the existing `withTimeout` pattern used elsewhere in `initializeOpenCodeSwarm`.

### Candidate 3 — Defense in depth: `withTimeout` outer wrapper + per-spawn `timeout` + `stdin: 'ignore'` + apply to both call sites  ← SELECTED
- Wrap the call at `src/index.ts:312` in `withTimeout(ensureSwarmGitExcluded(...), 3_000, ...)`. On timeout, emit a debug log via the existing `log` helper (suppressed when `quiet`) and continue init.
- Inside `ensureSwarmGitExcluded`, pass `{ timeout: 1_500, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' }` to every `bunSpawn` call (4 sites).
- Apply the same `{ timeout: 1_500, stdin: 'ignore' }` hardening to the two `bunSpawn(['git', ...])` calls in `src/hooks/diff-scope.ts:54-100` (the H2 secondary defect).
- ✅ Outer guard ensures plugin init can never block, even if every internal mitigation fails.
- ✅ Inner guard kills orphan git processes promptly so resources don't leak.
- ✅ `stdin: 'ignore'` removes the Bun-on-Windows stdin-EOF stall path.
- ✅ Same fix protects all three platforms with no `process.platform` branches.
- ❌ Slightly larger diff than the minimal one-line patch — but the additional surface area is exactly what makes the fix robust on hosts we cannot test directly.

### Candidate 4 — Move `ensureSwarmGitExcluded` to fire-and-forget (`queueMicrotask`)
- ✅ Init can never block on it.
- ❌ Defeats its purpose: the function MUST complete before `writeSwarmConfigExampleIfNew` and `writeProjectConfigIfNew` create files in `.swarm/`, otherwise the very pollution it is designed to prevent (untracked-but-now-tracked `.swarm/` files showing in `git status`) gets re-introduced.
- Rejected.

### Candidate 5 — Default `bunSpawn` to `stdin: 'ignore'` for all callers
- ✅ Systemic fix.
- ❌ Wider blast radius — other call sites (test runners, etc.) might rely on default `'pipe'`. Risk of regressions in unrelated areas.
- Rejected for this PR. Could be a follow-up.

### Selection: Candidate 3.

## Selected Fix — exact changes

### 1. `src/index.ts` — wrap the awaited call in `withTimeout`
- Replace
  ```ts
  await ensureSwarmGitExcluded(ctx.directory, { quiet: config.quiet });
  ```
  with
  ```ts
  await withTimeout(
      ensureSwarmGitExcluded(ctx.directory, { quiet: config.quiet }),
      3_000,
      new Error(
          'ensureSwarmGitExcluded exceeded 3s budget; continuing without git-hygiene check',
      ),
  ).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      log('ensureSwarmGitExcluded timed out or failed (non-fatal)', { error: msg });
  });
  ```
- Mirrors the `loadSnapshot` pattern at `src/index.ts:267-276`. Uses the existing `log` helper already imported from `./utils`.

### 2. `src/utils/gitignore-warning.ts` — bound each `bunSpawn` and ignore stdin
- Update each of the 4 `bunSpawn(['git', ...])` calls so the options object is `{ timeout: 1_500, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' }` (current code passes only `{ stdout: 'pipe', stderr: 'pipe' }`).
- Affected lines: 166-169, 180-183, 203-206, 242-245.

### 3. `src/hooks/diff-scope.ts` — same hardening (secondary defect)
- Update both `bunSpawn` calls (`getChangedFiles`) to pass `{ timeout: 1_500, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' }` plus the existing `cwd: directory`.
- Affected lines: 57-61, 77-81.

### Acceptable rationale for hard-coded constants
- `3_000 ms` outer budget mirrors `loadSnapshot`'s 5 s budget; chosen tighter because git CLI is normally <50 ms and a healthy host should never come close.
- `1_500 ms` per-spawn budget gives the slowest of the 4 calls room to complete on a moderately slow host while still firing well before the outer wrapper.

## Files Expected to Change
- `src/index.ts` (1 hunk near line 312)
- `src/utils/gitignore-warning.ts` (4 hunks at the `bunSpawn` call sites)
- `src/hooks/diff-scope.ts` (2 hunks at the `bunSpawn` call sites)
- `tests/gitignore-warning.test.ts` (extend with regression coverage — see test plan)
- `src/hooks/diff-scope.test.ts` (extend with regression coverage)
- `dist/` artefacts (rebuilt by `bun run build`)
- `CHANGELOG.md` is auto-managed by release-please — do NOT edit; the conventional-commit `fix:` prefix triggers the entry.

## Test Plan

### New / extended automated tests

1. **`tests/gitignore-warning.test.ts`** — add cases:
   - `ensureSwarmGitExcluded` resolves promptly when every `bunSpawn` returns a never-resolving subprocess (mock `bunSpawn` to return `{ exited: new Promise(() => {}), stdout: { text: () => new Promise(() => {}) }, ... }`). The outer test must complete within ~5 s — current code would exceed any reasonable test timeout. **Failing test before fix; passing after.**
   - `ensureSwarmGitExcluded` passes `timeout: 1_500` and `stdin: 'ignore'` to every `bunSpawn` invocation (assert via spy on `bunSpawn`).
   - `ensureSwarmGitExcluded` does not throw or unhandled-reject when git binary is missing (existing coverage; verify still green).

2. **`src/hooks/diff-scope.test.ts`** — add cases:
   - `getChangedFiles` passes `timeout` and `stdin: 'ignore'` on both `bunSpawn` calls.
   - `getChangedFiles` resolves to `null` when git hangs (mock as above) within bounded time.

3. **`src/index.ts` indirect coverage** — extend existing bootstrap tests (`src/index.adversarial-bootstrap.test.ts` / `src/index.bootstrap-adversarial.test.ts`) with a case where `ensureSwarmGitExcluded` is mocked to return a never-resolving promise; assert `OpenCodeSwarm(ctx)` resolves within ~5 s and exposes the agent list.

### Existing regression suite
- `bun test` (full suite). Watch for:
  - any test that asserts `bunSpawn` is called with the exact previous options object (must be updated to the new shape).
  - any test that depends on the previous absence of `stdin` in spawn options.
- `node scripts/repro-704.mjs` (cross-platform init-deadline harness). Should still pass and ideally be extended with a "bunSpawn-stub returns never-resolving subprocess" case.
- `bun run typecheck`.
- `bun run lint`.
- `bun run build` (regenerates `dist/`).

### Manual cross-platform smoke
- Out of scope for this container, but recommended once the PR opens: install the freshly published version on a Windows 11 host, restart OpenCode, verify `/swarm agents` lists the roster.

## Edge Cases Explicitly Considered
- `bunSpawn` is called from many other places. Only the two files above are touched; other callers keep their existing options.
- `_swarmGitExcludedChecked = true` is set BEFORE the try block (`src/utils/gitignore-warning.ts:160`). After a timeout, the next plugin load will short-circuit (`if (_swarmGitExcludedChecked) return;`) — that is acceptable: the user's `.swarm/` either is or is not git-excluded, and we don't want to retry an unbounded operation on every load. The user can run `/swarm diagnose` for the unsuppressed warning.
- `stdin: 'ignore'` does not break any of the 4 git commands — none of them read stdin (`rev-parse`, `check-ignore`, `ls-files` all act on filesystem state).
- The outer `withTimeout` rejection is converted to a `.catch` so it is non-fatal; matches the `loadSnapshot` pattern.
- `validateDiffScope`'s `try/catch` already swallows errors, so passing `timeout` does not change observable behavior on the happy path.

## Risk / Rollout / Rollback
- **Risk:** very low. The change makes existing init strictly more bounded; it does not change the success-path output. A user whose git was previously working will continue to see the existing (unsuppressed) "tracked files" warning.
- **Rollout:** standard release-please flow. `fix(...)` conventional commit triggers a patch release.
- **Rollback:** revert the PR; behaviour returns to v7.3.3.

## Unwired Functionality Checklist
- [x] Every code edit is referenced from a runtime path that this fix changes (no dead helpers).
- [x] No new exports.
- [x] No new dependencies.
- [x] No new config keys.
- [x] No `TODO` / `FIXME` / placeholder strings.
- [x] No `// removed for X` style stale comments.
- [x] All four `bunSpawn` sites in `gitignore-warning.ts` are touched, not just the first.
- [x] Both `bunSpawn` sites in `diff-scope.ts` are touched.

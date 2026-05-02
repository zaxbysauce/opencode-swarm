# Approved Plan (post-critic, awaiting user approval)

Approval line:
- [ ] Approved by user — implementation may proceed.

## Issue Summary
opencode-swarm plugin fails to load on Windows 11 (and is at risk on macOS / Linux): `ensureSwarmGitExcluded` is awaited on the critical plugin-init path with no timeout, and its 4 sequential `bunSpawn(['git', ...])` calls have no per-call timeout and no `stdin: 'ignore'`. Any host condition that prevents git from exiting promptly (antivirus, credential prompt, slow PATH lookup, network home, sandboxed exec, Bun-on-Windows stdin pipe semantics) hangs plugin init forever; OpenCode silently drops the plugin and no agents appear.

## Root Cause
See `04-root-cause.md`. The defect is platform-agnostic; surfaced first on Windows.

## Files Expected to Change
- `src/index.ts` (1 hunk, ~line 312)
- `src/utils/gitignore-warning.ts` (export 2 timeout constants; pass them + `stdin: 'ignore'` at every `bunSpawn` site; wrap each spawn in a `try/finally` that kills the child if we exit early)
- `src/hooks/diff-scope.ts` (apply `timeout: 1_500` + `stdin: 'ignore'` + `try/finally proc.kill()` to both `bunSpawn` calls)
- `tests/gitignore-warning.test.ts` (extend with regression test using `mock.module` for never-resolving spawn)
- `src/hooks/diff-scope.test.ts` (extend with regression test using same technique)
- `dist/` rebuilt by `bun run build`

CHANGELOG is **release-please-managed** — do not edit manually. The `fix(...)` conventional commit triggers the entry.

## Selected Fix — exact changes

### 1. `src/utils/gitignore-warning.ts`
Add at top of file:
```ts
/**
 * Hard upper bound on the entire ensureSwarmGitExcluded operation when called
 * from plugin init. Plugin init must not block on git for longer than this.
 */
export const ENSURE_SWARM_GIT_EXCLUDED_OUTER_TIMEOUT_MS = 3_000;

/**
 * Hard upper bound on each individual git subprocess. Both Bun.spawn and the
 * Node fallback in `bunSpawn` honor this option and kill the child on expiry.
 */
export const ENSURE_SWARM_GIT_EXCLUDED_PER_CALL_TIMEOUT_MS = 1_500;
```

For each of the 4 `bunSpawn(['git', ...])` invocations inside `ensureSwarmGitExcluded`:
- Pass options `{ timeout: ENSURE_SWARM_GIT_EXCLUDED_PER_CALL_TIMEOUT_MS, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' }`.
- Wrap the spawn + await in a small `try { … } finally { try { proc.kill(); } catch {} }` so the child is killed even if the awaited Promise.all is interrupted (defense in depth on top of the runtime's `timeout` handling). The existing outer `try/catch` for the function body is unchanged.

Net structure for one site (illustrative):
```ts
const gitRootProc = bunSpawn(
    ['git', '-C', directory, 'rev-parse', '--show-toplevel'],
    {
        timeout: ENSURE_SWARM_GIT_EXCLUDED_PER_CALL_TIMEOUT_MS,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
    },
);
let gitRootExitCode: number;
let gitRootOutput: string;
try {
    [gitRootExitCode, gitRootOutput] = await Promise.all([
        gitRootProc.exited,
        gitRootProc.stdout.text(),
    ]);
} finally {
    try { gitRootProc.kill(); } catch { /* already exited */ }
}
```

The `kill()` after a normal exit is a no-op. Repeating this pattern for all 4 sites (`rev-parse --show-toplevel`, `rev-parse --git-path info/exclude`, `check-ignore -q`, `ls-files -- .swarm`).

### 2. `src/index.ts`
Replace:
```ts
await ensureSwarmGitExcluded(ctx.directory, { quiet: config.quiet });
```
with the bounded form, mirroring the `loadSnapshot` pattern at lines 267-276:
```ts
await withTimeout(
    ensureSwarmGitExcluded(ctx.directory, { quiet: config.quiet }),
    ENSURE_SWARM_GIT_EXCLUDED_OUTER_TIMEOUT_MS,
    new Error(
        `ensureSwarmGitExcluded exceeded ${ENSURE_SWARM_GIT_EXCLUDED_OUTER_TIMEOUT_MS}ms budget; continuing without git-hygiene check`,
    ),
).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    log('ensureSwarmGitExcluded timed out or failed (non-fatal)', { error: msg });
});
```
Add the constant import to the existing `from './utils/gitignore-warning'` line.

### 3. `src/hooks/diff-scope.ts`
For both `bunSpawn(['git', 'diff', ...])` calls in `getChangedFiles`:
- Pass options including `timeout: ENSURE_SWARM_GIT_EXCLUDED_PER_CALL_TIMEOUT_MS` (re-use the same constant — it is a sane upper bound for any one git subprocess) plus `stdin: 'ignore'` plus the existing `cwd: directory`, `stdout: 'pipe'`, `stderr: 'pipe'`.
- Wrap the spawn + await in `try { … } finally { try { proc.kill(); } catch {} }` for symmetry.

### Acceptable rationale for the constants
Documented in `06-critic-review.md` (E1). 3 s outer / 1.5 s per-call is ~30× the realistic worst case on a healthy host and ~6× on a moderately slow one, while remaining tight enough that startup is not noticeably delayed.

## Test Plan

### New / extended automated tests

**`tests/gitignore-warning.test.ts` — append a new `describe('ensureSwarmGitExcluded — bounded execution', …)` block with:**

1. **Regression: never-resolving git does not hang the function.** Use `bun:test`'s `mock.module('../src/utils/bun-compat', …)` to install a stub that returns subprocesses whose `.exited` and `.stdout.text()` never resolve, then `await import('../src/utils/gitignore-warning')` (post-mock). Wrap the `ensureSwarmGitExcluded(tmpDir)` call in a `Promise.race` with a 4 s sentinel timeout and assert it resolves before the sentinel fires.

2. **Spawn options assertion:** install a recording stub (still mocks `bunSpawn`) and assert that EVERY call receives `{ timeout, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' }`, with `timeout === ENSURE_SWARM_GIT_EXCLUDED_PER_CALL_TIMEOUT_MS`.

3. **`proc.kill()` invoked on timeout path:** install a stub that returns a never-resolving subprocess plus a recording `kill()` and assert `kill()` was called for each spawned subprocess after the outer race fires.

**`src/hooks/diff-scope.test.ts` — append a new `describe('getChangedFiles — bounded execution', …)` block with:**

1. Same never-resolving stub pattern; assert `validateDiffScope(taskId, dir)` resolves to `null` within a 4 s sentinel.
2. Assert both `bunSpawn` calls receive `timeout: ENSURE_SWARM_GIT_EXCLUDED_PER_CALL_TIMEOUT_MS` and `stdin: 'ignore'`.

### Existing regression suite
- `bun test` (full). No existing tests assert on `bunSpawn` option shape for either changed file (audited).
- `bun run typecheck`.
- `bun run lint` — must pass with no new warnings.
- `bun run build` — regenerates `dist/`. Verify no unrelated diff in `dist/`.
- `node scripts/repro-704.mjs` — must still pass; ideally extend with a never-resolving spawn variant in a follow-up.

### Manual smoke (post-PR)
On a Windows 11 host: install the freshly published version, restart OpenCode, run `/swarm agents`, confirm the full roster appears.

## Edge Cases Explicitly Considered
- `_swarmGitExcludedChecked = true` is set BEFORE the try block (`gitignore-warning.ts:160`). After a timeout, subsequent loads in the same process short-circuit. This is intentional and acceptable: the user can run `/swarm diagnose` (which calls `resetSwarmGitExcludedState()` if needed in a follow-up) for a fresh attempt; for now, an unbounded retry on every load is worse than a once-per-process bypass.
- `stdin: 'ignore'` is safe for every git command in scope — none of `rev-parse`, `check-ignore`, `ls-files`, or `diff --name-only` reads stdin.
- `proc.kill()` after a normal exit is a no-op on both Bun and Node; harmless.
- Per-spawn `timeout` is honored by both `bunSpawn` branches (`bun-compat.ts:463-470` Node, `bun-compat.ts:425-447` Bun-passthrough). Verified by reading `bun-compat.ts`.
- No new exports beyond the two timeout constants. No new dependencies.
- No `process.platform` branches; the fix is platform-agnostic by construction.

## Risk / Rollout / Rollback
- **Risk:** very low. The change makes init strictly more bounded and adds defensive cleanup. Happy-path observable behavior is unchanged on hosts where git is healthy.
- **Rollout:** standard release-please patch flow; the conventional commit `fix(plugin-init): bound ensureSwarmGitExcluded so plugin loads on every supported platform` triggers the entry.
- **Rollback:** revert the PR; behavior returns to v7.3.3.

## Unwired Functionality Checklist
- [x] No new exports beyond two timeout constants, both consumed by `src/index.ts` and the tests.
- [x] No new dependencies, no new config keys.
- [x] No `TODO` / `FIXME` / placeholder strings.
- [x] All four `bunSpawn` sites in `gitignore-warning.ts` are touched (not just the first).
- [x] Both `bunSpawn` sites in `diff-scope.ts` are touched.
- [x] All new code paths are exercised by at least one new test.
- [x] No `// removed for X` style stale comments.
- [x] No platform branches.

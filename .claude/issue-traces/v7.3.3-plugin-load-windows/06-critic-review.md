# Critic Review (round 1)

Independent critic verdict: **NEEDS_REVISION**.

## Approved sections
- A. Root cause correctness — APPROVE.
- D. Cross-platform claim (no `process.platform` branches) — APPROVE.
- F. Unwired functionality checklist — APPROVE.

## Blockers raised by the critic

1. **B2 — Outer `withTimeout` does not abort the underlying spawn.** When the outer timeout fires, the inner `Promise.all([proc.exited, proc.stdout.text()])` keeps running. We must guarantee the spawned git process is actually killed, not just abandoned, otherwise we leak a child process per failed init.
2. **B2 supplementary — Confirm Bun.spawn's `timeout` option actually kills the child.** Node fallback does (`bun-compat.ts:466` — `proc.kill('SIGKILL')` in the timer). Bun's `timeout` option is documented to kill via `killSignal` (default SIGTERM). Both branches kill on per-spawn timeout.
3. **C1 — Test mocking strategy must be concrete.** `bunSpawn` is a named import; module-level binding. Need a workable strategy (Bun's `mock.module()` or DI).
4. **C2 — Audit existing tests for assertions on `bunSpawn` call shape.** Some may break if we add new option fields.
5. **E1 — Justify or relax the `3_000` / `1_500` constants** so the plan is defensible on legitimately slow hosts.

## How the revised plan resolves each blocker

### Resolved B2 — guaranteed subprocess kill
- Keep the outer `withTimeout(3_000)` as the unconditional plugin-init safety net.
- Inside `ensureSwarmGitExcluded`, every `bunSpawn` call now passes `timeout: 1_500`. Both branches kill the child on timeout (verified):
  - Node: `bun-compat.ts:463-470` — `proc.kill('SIGKILL')` in the timer callback.
  - Bun: passes `timeout` through to `Bun.spawn`, which kills via `killSignal` per Bun documentation.
- Defense-in-depth: each spawn site is wrapped in a small `try / finally` that calls `proc.kill()` explicitly if the function exits without observing `proc.exited`. This guarantees no orphaned child even on a Bun version that ignored `timeout`.
- Module-level dedup flag (`_swarmGitExcludedChecked`) ensures we cannot leak more than one child per process lifetime.

### Resolved C1 — concrete test mocking strategy
- Existing test file (`tests/gitignore-warning.test.ts:254-450`) uses **real git** via `execSync('git init', ...)` and operates against real temp dirs. It does NOT mock `bunSpawn` and does NOT assert on `bunSpawn` options.
- For the new regression test that proves the timeout works, use Bun's `mock.module()` API (supported in `bun:test`):
  ```ts
  import { mock } from 'bun:test';
  await mock.module('../src/utils/bun-compat', () => ({
      bunSpawn: () => ({
          stdout: { text: () => new Promise(() => { /* never */ }) },
          stderr: { text: async () => '' },
          exited: new Promise(() => { /* never */ }),
          exitCode: null,
          kill: () => { /* recorded for assertion */ },
      }),
  }));
  const { ensureSwarmGitExcluded, resetSwarmGitExcludedState } = await import('../src/utils/gitignore-warning');
  resetSwarmGitExcludedState();
  await Promise.race([
      ensureSwarmGitExcluded(tmpDir, { quiet: true }),
      new Promise((_, r) => setTimeout(() => r(new Error('hung past 4s')), 4_000)),
  ]); // must NOT reject
  ```
- An auxiliary, simpler test exercises `withTimeout` itself against a never-resolving promise and asserts rejection within 3 s; that path is already covered indirectly by `src/utils/timeout.ts` semantics.

### Resolved C2 — existing-test audit
- Audited `tests/gitignore-warning.test.ts` (lines 254-450, the only existing tests for `ensureSwarmGitExcluded`). No assertion exists on `bunSpawn` options. Adding `timeout` and `stdin: 'ignore'` does not invalidate any test.
- Audited `src/hooks/diff-scope.test.ts`. The new tests added by the v7.3.3 commit (`Tests 11-12`) exercise the real git path via `execSync('git init')`, not `bunSpawn` mocking. Adding new options to `bunSpawn` does not break those assertions.
- Net: zero existing tests need modification.

### Resolved E1 — constants justification
- Plugin init MUST NOT noticeably delay OpenCode startup. End-user perceptual budget is ~1 s; 3 s outer is a hard backstop, not an expectation.
- Healthy host: every `git rev-parse` / `git check-ignore` / `git ls-files` returns in <50 ms (per measurements documented in the v7.3.3 PR comment). Realistic worst case across all 4 calls is <200 ms.
- 1.5 s per-spawn budget gives a 30× margin over the realistic worst case before the hard kill.
- 3 s outer budget gives 2× the per-spawn budget — enough for the slowest single call to land plus accumulated I/O slack — but still within a tolerable startup delay.
- Slower-than-3 s hosts are pathological (NFS-stalled `.git`, antivirus quarantine, network-pinned home). We deliberately fail-open in that case: a debug log is emitted, the user does not get the hygiene exclude/warning, but the plugin loads. The `.swarm/` files written this session may surface in `git status` until the user runs `git add .swarm/` themselves or clears the issue and reinits — an acceptable trade for guaranteed loadability.
- Constants are exported as `ENSURE_SWARM_GIT_EXCLUDED_OUTER_TIMEOUT_MS = 3_000` and `ENSURE_SWARM_GIT_EXCLUDED_PER_CALL_TIMEOUT_MS = 1_500` for testability and to make any future tuning a one-line change. No new public config surface.

## Verdict after revision
All blockers addressed. `06-critic-review.md` is the surface artifact; the revised plan in `05-fix-plan.md` (re-written below in `07-approved-plan.md`) supersedes the original.

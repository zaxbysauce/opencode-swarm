# Localization Log

## Methodology
Three parallel Explorer subagents investigated disjoint scopes:
- Explorer A (`a598f2236e790844b`): plugin init blocking paths on Windows
- Explorer B: Windows-specific runtime quirks (PATH, UNC, BOM/CRLF, proper-lockfile)
- Explorer C: reproduction harness, repo-graph init, CI coverage gaps

All three converged on the same primary suspect.

## Hypotheses considered

### H1 — `ensureSwarmGitExcluded` hangs plugin init (no timeout)  ← LEADING
- New in v7.3.3 (commit `17fc49f`).
- Awaited at `src/index.ts:312` BEFORE `initTelemetry`, `writeSwarmConfigExampleIfNew`, `writeProjectConfigIfNew`, agent registration.
- Performs up to 4 sequential `bunSpawn(['git', ...])` calls with no `timeout` option and no outer `withTimeout` wrapper.
- Compare adjacent `loadSnapshot` call (line 267) which IS wrapped in `withTimeout(5_000)`.
- Function has `try/catch` at the function body level, but the `catch` only covers throws — it does NOT abort an awaited but never-resolving `Promise.all([proc.exited, proc.stdout.text()])`.
- Plugin init that never resolves → OpenCode loader silently drops plugin → no agents visible.
- Same pattern previously caused issue #704 ("plugin reaches init then silently halts without throwing").
- **Cross-platform impact:** the lack of a timeout is a defect on every platform; observed first on Windows because git/PATH issues are most common there.

### H2 — `validateDiffScope` git spawns also lack timeouts (lower priority)
- `src/hooks/diff-scope.ts:54-100` uses the same pattern: two sequential `bunSpawn(['git', ...])` calls with no timeout.
- Not on the critical init path (runs from a hook during code review), so cannot cause "plugin no-load," but can hang a session and is the same defect class.

### H3 — Synchronous fs operations in `writeProjectConfigIfNew` / `writeSwarmConfigExampleIfNew` throw on Windows
- `src/config/project-init.ts:15-88` uses `fs.lstatSync`, `fs.mkdirSync`, `fs.writeFileSync`.
- Both functions are wrapped in `try { ... } catch {}` — silent failure, NOT a load-breaker.
- Ruled out as the load-breaker.

### H4 — Bun.spawn missing on Windows host runtime
- `bunSpawn` falls back to `node:child_process.spawn` when `getBun()` is undefined.
- Node fallback at `src/utils/bun-compat.ts:418-496` looks correct (data listeners attached to BOTH stdout and stderr via `streamFromNode`, so pipe-buffer deadlock from "unpumped stderr" is **NOT** real here, contrary to Explorer A's initial claim).
- However, when `git.exe` is absent on PATH, `nodeSpawn` emits `error` event (ENOENT) → exited resolves to 1 → function exits early. So this alone does not cause a hang.
- Ruled out as a *direct* cause; relevant only as input to H1 (PATH lookup latency adds to the unbounded await).

### H5 — proper-lockfile / lock semantics on Windows
- proper-lockfile is used in `src/scope/scope-persistence.ts` and `src/hooks/knowledge-store.ts`, NOT on the init path.
- Locks are acquired only when the architect writes `plan.json` etc. — not at plugin load.
- Ruled out for "plugin doesn't load."

### H6 — JSON BOM/CRLF parse failure in user config
- `src/config/loader.ts` parses `~/.config/opencode/opencode-swarm.json` and `.opencode/opencode-swarm.json` via async loader.
- Parse failures are caught and the loader falls back to defaults — would not break load.
- Ruled out for "plugin doesn't load."

### H7 — Dynamic `import(...)` of relative paths on Windows
- `fileURLToPath(import.meta.url)` is used in `src/services/diagnose-service.ts:500` and `src/lang/runtime.ts:36,112`.
- These are inside functions, called lazily, not at module top-level. They do not run during plugin init.
- Ruled out for "plugin doesn't load."

### H8 — repo-graph init hangs (regression of #704)
- `repoGraphHook.init()` is dispatched via `queueMicrotask` with a 30 s watchdog (`src/index.ts:287-302`). Already mitigated.
- Ruled out for "plugin doesn't load."

## Evidence summary
- Issue #704 closure body: "boot sequence reaches the plugin initialization but silently halts without throwing a fatal error" — same observable as the current report.
- Branch name `claude/fix-plugin-loading-windows-ubPU2` — user / setup intent matches H1.
- Code path `dist/index.js:90849-90910` (`ensureSwarmGitExcluded`) and `dist/index.js:91015` (the unbounded await) confirm the bundled plugin contains the unbounded code.
- All three explorers independently flagged H1 as highest-likelihood.
- Issue #732 PR and `.claude/issue-traces/724/` (the trace that produced the v7.3.3 change) explicitly motivated by `git status` pollution; performance/safety of the introduced await was justified by a comment ("git subprocess calls finish in <50ms") with no timeout enforcement.

## Conclusion before reviewer pass
Leading hypothesis: **H1**. Secondary defect-class match: **H2**. The fix must protect all three platforms (Windows, macOS, Linux).

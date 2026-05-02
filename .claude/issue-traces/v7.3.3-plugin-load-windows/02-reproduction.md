# Reproduction

## Required reproduction context
The user reports the failure on Windows 11 but only runs Windows. The investigation must consider all supported platforms.

## Reproduction commands attempted in this environment (Linux container, read-only worktree)

| Command | Purpose | Status |
| --- | --- | --- |
| `git log --oneline -30` | Recent commits to localise regressions | ✅ executed |
| `git show 17fc49f` | v7.3.3 fix(git-hygiene) commit content | ✅ executed |
| `grep -n "ensureSwarmGitExcluded" src dist` | Locate critical-path call | ✅ executed |
| `bun test` (full suite) | Baseline | ❌ NOT executed (would mutate `.swarm/` and dist artefacts; only run after a fix is staged) |
| `node scripts/repro-704.mjs` | Existing init-deadline harness | ❌ NOT executed (would mutate; deferred to validation phase) |

## Expected runtime path that fails
1. OpenCode loads `dist/index.js` (the plugin entry).
2. The exported `OpenCodeSwarm: Plugin` is invoked with `ctx`.
3. `initializeOpenCodeSwarm(ctx)` is awaited:
   - `loadPluginConfigWithMetaAsync` (already async-safe, has tests for #704)
   - full-auto / fallback-models config validation (sync, cheap)
   - `await withTimeout(loadSnapshot(...), 5_000, ...)` (bounded — see fix for #704)
   - `queueMicrotask(() => repoGraphHook.init().catch(...).finally(...))` (bounded with 30s watchdog)
   - **`await ensureSwarmGitExcluded(ctx.directory, { quiet: config.quiet })`** ← NEW in v7.3.3, **NO timeout**
   - `initTelemetry(ctx.directory)` (sync, swallowed errors)
   - `writeSwarmConfigExampleIfNew(ctx.directory)` (sync, swallowed errors)
   - `writeProjectConfigIfNew(ctx.directory, config.quiet)` (sync, swallowed errors)
   - … (agent + hook construction, returns plugin spec)
4. The plugin spec returned from this function exposes `agents`, `commands`, and `tool` to OpenCode, which then renders them in the TUI / GUI.

If step 3 never resolves (hang) or rejects (top-level catch in `OpenCodeSwarm` wrapper re-throws), the plugin loader silently drops the plugin and the user sees no agents.

## Cross-platform reproduction conditions for the leading hypothesis
`ensureSwarmGitExcluded` performs up to 4 sequential `git` subprocess calls via `bunSpawn`. There is **no per-spawn timeout** and **no outer `withTimeout` wrapper** around the function. This produces an unbounded hang under any of these conditions on **any platform**:

| Platform | Plausible hang trigger |
| --- | --- |
| Windows 11 | git not on PATH from Desktop sidecar's spawned Node env (CreateProcess search differs from cmd.exe); git.exe waiting on a credential helper prompt that never appears in headless host; antivirus intercepting child process; UNC / OneDrive `ctx.directory` slow `git rev-parse` |
| macOS | Code-signed Desktop sandbox blocking child process exec; Homebrew git path (`/opt/homebrew/bin/git`) not in inherited `PATH`; fs.appendFileSync to a `.git/info/exclude` on iCloud / Time Machine snapshot |
| Linux | Snap/Flatpak sandbox blocking exec; SELinux/AppArmor denial; FUSE-mounted home; `git` invoked from a directory whose `.git` is on an NFS share with stale handles |

The defensive fix must protect all three.

## What needs to be reproduced
1. **Code-level reproduction (sufficient evidence already collected):** `dist/index.js:91015` shows the critical `await ensureSwarmGitExcluded(ctx.directory, { quiet: config3.quiet });` with no timeout, ahead of the rest of init. `gitignore-warning.ts:155-265` confirms 4 sequential awaited spawns with no per-call timeout.
2. **Runtime reproduction on a real Windows 11 host (deferred):** would require that environment plus stub/slow git on PATH. Out of scope for this container; will be exercised via a regression test that asserts plugin init resolves within a deadline even when git is unavailable / slow.
3. **Existing repro harness (`scripts/repro-704.mjs`) gap:** That harness asserts the plugin's exported function resolves under a 400 ms deadline on Linux only and does NOT cover the `ensureSwarmGitExcluded` path. A new regression test must be added.

## Will be reproduced as a unit test
Plan: add a test that monkey-patches `bunSpawn` to return a never-resolving subprocess and asserts that `ensureSwarmGitExcluded(...)` resolves within ~3 s anyway (current behavior: hangs forever). This is a faithful failing test of the bug.

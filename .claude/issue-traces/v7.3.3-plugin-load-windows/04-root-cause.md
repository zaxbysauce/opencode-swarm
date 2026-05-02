# Root Cause

## Summary
The opencode-swarm plugin's `initializeOpenCodeSwarm` function awaits `ensureSwarmGitExcluded(ctx.directory, { quiet: config.quiet })` on the critical initialization path with **no timeout protection** at any layer. `ensureSwarmGitExcluded` performs up to four sequential `git` subprocess invocations via `bunSpawn`, each of which is awaited without a per-call `timeout` and without an explicit `stdin: 'ignore'`. If any git child process fails to exit promptly — for example because git is missing from the host PATH, antivirus is intercepting child execution, a credential helper is prompting, or `Bun.spawn` on the host (Windows in particular) leaves stdin set to `'pipe'` and the child blocks waiting for stdin EOF — the awaited call never resolves. OpenCode's plugin loader silently drops a plugin whose entry never resolves (or rejects), so no agents, commands, or tools appear in the TUI or GUI.

## Exact Location

| File | Symbol | Lines |
| --- | --- | --- |
| `src/index.ts` | `initializeOpenCodeSwarm` (the awaited call site) | 304-312 (call introduced by commit `17fc49f`) |
| `src/utils/gitignore-warning.ts` | `ensureSwarmGitExcluded` | 155-265 (function added by commit `17fc49f`) |
| `src/utils/bun-compat.ts` | `bunSpawn` | 418-496 (no default timeout, no default `stdin: 'ignore'`) |
| `src/hooks/diff-scope.ts` | `getChangedFiles` (same defect class, NOT on init path) | 54-100 |

Bundled artifact confirming the defect ships in v7.3.3:
- `dist/index.js:90849-90910` (function body)
- `dist/index.js:91015` (`await ensureSwarmGitExcluded(ctx.directory, { quiet: config3.quiet });`)

## Broken Contract
Plugin initialization must complete in bounded time on every supported platform (Windows, macOS, Linux). The host's plugin loader does not surface an error when init never resolves; it silently drops the plugin. Every awaited call on the init path therefore has an obligation to be bounded — either by an explicit `withTimeout` wrapper, or by per-operation timeouts that guarantee the chain completes.

This contract was honored elsewhere in the same function:
- `loadSnapshot(...)` is wrapped in `withTimeout(..., 5_000, ...)` (`src/index.ts:267-276`).
- `repoGraphHook.init()` is dispatched via `queueMicrotask` and bounded by an unref'd 30 s watchdog (`src/index.ts:287-302`).

`ensureSwarmGitExcluded` violates the contract.

## Triggering Conditions (per platform)

| Platform | Concrete trigger | Which `bunSpawn` call hangs |
| --- | --- | --- |
| Windows 11 | git not on PATH from sidecar's spawned env; antivirus / Defender intercepting child exec; Bun.spawn leaving stdin: 'pipe' so git waits for EOF; `ctx.directory` on OneDrive / network share | any of the 4 |
| macOS | code-signed Desktop sandbox blocking child exec; Homebrew git path missing from inherited PATH; iCloud-backed `.git` causing slow `rev-parse`; first-launch notary handshake | any of the 4 |
| Linux | Snap / Flatpak confinement; SELinux / AppArmor denial; FUSE-mounted home; NFS-mounted `.git` with stale handles; container PID-namespace stdin-EOF semantics | any of the 4 |

Critically: even when the user has git installed and on PATH, **a stale credential helper, a hung NFS handle, or any process-monitor that delays subprocess teardown is enough to keep `proc.exited` from resolving forever**. None of those are exotic.

## Evidence Chain
1. **User symptom** — "I just updated my local plugin to v7.3.3 and now it no longer loads at all. None of my agents are available in the TUI or the GUI on Windows 11."
2. **Symptom equivalence with #704** — Issue #704 closure body: "boot sequence reaches the plugin initialization but silently halts without throwing a fatal error." The fix-class needed is the same: ensure init never blocks unbounded on a child operation.
3. **Code path on disk** —
   - `src/index.ts:312`: `await ensureSwarmGitExcluded(ctx.directory, { quiet: config.quiet });` — no `withTimeout`.
   - `src/utils/gitignore-warning.ts:166-250`: 4 sequential `bunSpawn(['git', ...], { stdout: 'pipe', stderr: 'pipe' })` calls, none pass `timeout`, none pass `stdin: 'ignore'`.
   - `src/utils/bun-compat.ts:449-479`: Node fallback only kills the child if `options.timeout && options.timeout > 0`. With no option passed, the child runs forever if it doesn't exit. The Bun branch (lines 422-447) passes options through to `Bun.spawn` unchanged.
4. **Bundled artifact** — `dist/index.js:90849-90910` and `dist/index.js:91015` confirm v7.3.3 ships exactly this code.
5. **Bun on Windows known behavior** — `Bun.spawn` defaults stdin to `'pipe'` when not specified; on Windows, a child process holding an open stdin pipe can block waiting for EOF that never comes (Bun release notes 1.1.10–1.1.12 fixed several related Windows pipe issues; not all are addressed in older Bun versions still bundled with some OpenCode releases).
6. **Earlier explorer claim of "unpumped stderr deadlock" is INCORRECT** — `streamFromNode` is attached to both stdout and stderr in `bunSpawn`'s Node fallback (`src/utils/bun-compat.ts:482-483`). Discounted.
7. **Reviewer pass independently APPROVED** H1 with file:line evidence (see `state.md`).

## Why this is platform-agnostic
- The unbounded await is a defect of the code, not of any platform.
- Every supported platform has at least one realistic condition under which one of the four git calls can take longer than the user is willing to wait, or never complete.
- The visible failure was first reported on Windows 11 because Windows hosts more frequently combine antivirus interception, Bun stdin pipe semantics, and PATH propagation issues, but the same bug can manifest on macOS Desktop sandboxes and on Linux Snap/Flatpak confinements.
- The fix bounds the operation on every platform.

## Residual risks / alternative explanations not fully ruled out
- A second, independent defect could exist for Windows-only hosts (e.g., a path-encoding bug in a less-traveled code path). If after deploying this fix the user still cannot load the plugin on Windows 11, the next investigation must request the actual stderr from the user's Windows host (the top-level catch in `OpenCodeSwarm` at `src/index.ts:164-176` already prints the stack on rejection, so any reachable throw would be visible — the absence of a visible stack is itself consistent with a hang rather than a throw).
- `bunSpawn`'s Node fallback uses `nodeSpawn` without `shell: true`. On Windows this normally finds `git.exe` via PATHEXT, but if it ever fails, the failure mode is `error` event → exit code 1, not a hang. So this is not the root cause but is a related hardening opportunity.

## Confidence
~95%. Evidence chain is complete and reviewer-confirmed. The only path that would lower this is direct stderr / log evidence from the user's Windows host showing a thrown error rather than a silent hang — but the symptom matches a hang, not a throw.

# Issue Summary

## User report
> "I just updated my local plugin to v7.3.3 and now it no longer loads at all. None of my agents are available in the TUI or the GUI on Windows 11."

User clarification: it is not necessarily v7.3.3 — investigation must be exhaustive across recent versions.

## Observed behavior
- After updating opencode-swarm, plugin fails to load on Windows 11.
- No swarm agents (architect, coder, reviewer, etc.) appear in OpenCode TUI or Desktop GUI.
- User only runs Windows — macOS/Linux are NOT confirmed working; investigation must trace across **all supported platforms (Windows, macOS, Linux)**.
- A defect that surfaces "more often" on Windows (smaller pipe buffers, slower git startup, antivirus interception, OneDrive paths) typically also exists on macOS/Linux under analogous conditions (network shares, slow disks, missing git, sandboxed environments). The fix must be platform-agnostic.

## Expected behavior
- All registered swarm agents (architect, explorer, coder, reviewer, test_engineer, critic, sme, docs, etc.) appear in the OpenCode agent picker on Windows 11, identically to macOS/Linux.

## Acceptance criteria
- Updated plugin loads successfully on Windows 11.
- All agents are visible in TUI and GUI.
- No silent hang or rejected plugin during initialization.
- Cross-platform parity: same agents/commands available on Windows as on macOS/Linux.

## Environment
- OS: Windows 11
- Plugin: opencode-swarm (current package version 7.3.3, but issue may have been introduced earlier)
- Plugin entry: `dist/index.js` (built `--target node`, ESM)
- Plugin host: OpenCode (TUI + Desktop sidecar). On Windows the plugin may execute under Bun or under Node depending on how OpenCode bundles its runtime.
- Branch for fix work: `claude/fix-plugin-loading-windows-ubPU2`

## Historical context
- Issue #704 (closed in v7.0.3) had the SAME observable symptom on macOS Desktop:
  > "boot sequence reaches the plugin initialization but silently halts without throwing a fatal error"
  Fixed by deferring `repoGraphHook.init()` via `queueMicrotask` and bounding `loadSnapshot` with `withTimeout(5_000)`.
- Issue #675 (closed) — "Opencode-Swarm is no longer loading at all" — caused by stale npm cache; partly mitigated by `bunx opencode-swarm update`.
- The `dist/index.js` plugin entry has a top-level `try/catch` that re-throws to the OpenCode plugin host (`src/index.ts:163`); the host silently drops rejecting plugins (no agents visible).
- Plugin init that hangs (never resolves) yields the same observable symptom — no agents visible.

## Ambiguity list
- Which version actually introduced the regression — most likely v7.3.3 (commit 17fc49f added new `await` code on the critical init path), but other Windows-specific regressions could exist.
- Whether the user's Windows host runs the plugin under Bun or Node (affects which `bunSpawn` branch executes).
- No raw error output from the user's machine — must reason from code paths.

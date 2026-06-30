# Plugin TUI stability hardening

## What changed
Removed SIGINT/SIGTERM signal handlers from the plugin entry point and guarded previously unguarded `console.warn()` calls with `config.quiet` checks.

## Why
During multi-agent swarm sessions, the OpenCode host TUI can display "Abort" text on every output line — a rendering bug in the host (`anomalyco/opencode`). Investigation confirmed the plugin cannot produce this text, but two plugin behaviors could contribute to host TUI instability:

1. The plugin registered `process.once('SIGINT', () => { cleanupAutomation(); process.exit(130); })` and equivalent for SIGTERM. A plugin calling `process.exit()` inside the host process kills the entire host, short-circuiting the host TUI's terminal cleanup (alternate screen restore, cursor reset, raw mode disable).

2. Four `console.warn()` call sites (Config Doctor startup advisories, skill-propagation-gate logs) wrote directly to stderr without checking `config.quiet`, bypassing the host TUI's rendering pipeline.

## Changes

- **`src/index.ts`**: Removed `process.once('SIGINT', ...)` and `process.once('SIGTERM', ...)` handlers entirely. `process.on('exit', cleanupAutomation)` remains as the sole cleanup hook — the correct host-plugin contract.
- **`src/index.ts`**: Guarded Config Doctor advisory `console.warn()` calls (lines ~1150/1157) with `if (!config.quiet)`; when quiet, routes through `addDeferredWarning()` (visible via `/swarm diagnose`).
- **`src/index.ts`**: Guarded skill-propagation-gate `console.warn()` calls (lines ~1991/2025) with `if (!config.quiet)`.
- **`tests/unit/plugin-tui-safety.test.ts`**: New regression tests asserting no signal handler registrations and all `console.warn` calls are properly guarded.

## Migration steps
None. When `config.quiet` is false (the default), all console output behavior is unchanged. When `config.quiet` is true, Config Doctor advisories are now deferred to `/swarm diagnose` rather than written to stderr on startup.

## Breaking changes
None.

## Known caveats
This change mitigates but does not fix the "Abort" prefix TUI rendering bug. The rendering defect is in the OpenCode host (`anomalyco/opencode`) and requires an upstream fix.

# Guardrails disabled warning no longer leaks into TUI

## What changed

Guardrails disabled warnings are now emitted via the debug logger only (`OPENCODE_SWARM_DEBUG=1`) instead of directly to `console.warn()`. This prevents warnings from corrupting the TUI display while keeping them available for debugging.

## Why

When guardrails are disabled via configuration, a security warning is emitted at plugin initialization. Previously, this warning was always printed to `console.warn()`, which caused the TUI to display corrupted output with warning text overlaid on the normal UI. The acceptance criteria required that warnings should not leak into TUI.

## Migration

No migration required. Users who have disabled guardrails can still see the warning by setting the `OPENCODE_SWARM_DEBUG=1` environment variable. The warning is no longer printed in normal operation, preventing TUI corruption.

## Known caveats

None.

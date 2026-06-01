## realpathSync hardening for repo-graph module

## What changed

- Added `safeRealpathSync` helper in `src/tools/repo-graph/safe-realpath.ts` that wraps `realpathSync` with shared ENOENT-only fallback behavior, consistent with existing hardening patterns. Returns `null` on non-ENOENT errors instead of throwing.
- Added `_internals` DI seam for `safeRealpathSync` in `src/tools/repo-graph/builder.ts` — all symlink resolution in `resolveModuleSpecifier` now routes through `_internals.safeRealpathSync`.
- Added `_internals` DI seam for `safeRealpathSync` in `src/tools/repo-graph/storage.ts` — workspace validation in `saveGraph` now uses the seam.
- Added `safeRealpathSync` DI seam via `RepoGraphDeps.safeRealpathSync` in `src/hooks/repo-graph-builder.ts` — symlink boundary checks in `toolAfter` now use the seam.
- Added integration tests in `tests/unit/tools/repo-graph.test.ts` covering null-return paths for `safeRealpathSync` and `loadOrCreateGraph` error propagation.
- Added test in `tests/unit/hooks/repo-graph-builder.test.ts` for `toolAfter` graceful handling when `safeRealpathSync` returns null.

## Why

Issue #765: `realpathSync` calls in the repo-graph module could produce inconsistent behavior when encountering filesystem edge cases (symlinks, permission errors, non-existent paths). Some calls used raw `realpathSync` which throws on errors, while others had ad-hoc try/catch. The `_internals` DI seams also enable reliable testing of these failure paths without depending on actual filesystem conditions.

## Migration

No migration required. This is a hardening change with no behavioral changes for valid paths.

## Known caveats

- Invalid or escaped paths are silently skipped rather than throwing — this is intentional security-allowlist behavior but means some filesystem errors will not produce visible diagnostics.
- The null-return behavior means callers must explicitly check for `null` and handle it appropriately; this is already documented in the affected functions.

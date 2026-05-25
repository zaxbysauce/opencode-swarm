# Dark Matter O(n^2) Memory Explosion Fix

## What changed

- **Always write dark-matter.md cache** (`src/hooks/system-enhancer.ts`): Removed
  the `if (darkMatter.length > 0)` guard around the cache write so
  `dark-matter.md` is written even when no co-change patterns are detected.
  Previously, empty results caused every subsequent chat turn to re-run the
  full O(n^2) analysis.

- **File-count cap per commit** (`src/tools/co-change-analyzer.ts`): Commits
  with more than 500 changed files have their pair generation skipped in
  `buildCoChangeMatrix`. File commit counts are still tracked for these
  commits so NPMI marginal frequencies remain accurate. The cap is
  configurable via `maxFilesPerCommit` in `DarkMatterOptions` (default: 500).

## Why

A single commit with thousands of changed files caused `buildCoChangeMatrix`
to allocate ~10-17 GB of memory per chat turn. Because the resulting
co-change pairs all had `coChangeCount = 1` (below the `minCoChanges = 3`
threshold), every pair was filtered out, producing an empty result. The empty
result was not cached, so the next message triggered the same expensive
recomputation.

## How to use

No changes needed. Users who created a manual `.swarm/dark-matter.md`
workaround can safely delete it; the system now writes the cache
automatically.

## Migration

No migration required.

## Known caveats

- The 500-file-per-commit cap (configurable via `maxFilesPerCommit`) excludes
  pair generation for oversized commits. File commit counts are still tracked,
  preserving NPMI accuracy. Very large monorepo refactors could theoretically
  lose some co-change signal from excluded commits.

Closes: #1021

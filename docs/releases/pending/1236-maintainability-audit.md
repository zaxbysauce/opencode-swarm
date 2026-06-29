# Maintainability Audit Fixes: dedup key, normalizePath, agent boilerplate

## What changed

Closes the 5 actionable findings from the maintainability deep-dive audit (#1236):

Utility deduplication:
- `normalizePath` is now exported from a single canonical `src/utils/path.ts` with a
  null guard and the full path-normalisation suite. `src/full-auto/policy.ts` and
  `src/turbo/lean/conflicts.ts` import from the canonical source. The existing
  re-export chain (`conflicts.ts → planner.ts → turbo/lean/index.ts`) is preserved.
- `schema-drift.ts`'s URL-param normaliser (`{id}` / `:id` → `:param`) is renamed
  `normalizeApiPath` to eliminate the naming collision with the filesystem utility.

Shell-write-detect cleanup:
- The dedup-key template (`` `${category}|${operator}|${path ?? 'null'}` ``) is now
  constructed via a single `buildDedupeKey` helper, used at all 5 sites (3 Set-filter
  locations and 2 map-lookup locations in `resolveWriteTargets`).
- `ps()` and `cmd()` PowerShell / cmd.exe test helpers in `shell-write-detect.test.ts`
  are hoisted from 7 describe-scoped definitions to 2 module-level definitions.

Agent boilerplate:
- Prompt-resolution logic (`customPrompt` / `customAppendPrompt` conditional) is
  extracted to `src/agents/_prompt-helpers.ts` (`resolvePrompt`) and shared across
  11 standard agent files. `critic.ts` (non-standard 2-arg signature) and
  `curator-agent.ts` (intentional both-merge semantics) are explicitly excluded.
- The 9 Type-A agent registration blocks in `createSwarmAgents` (`src/agents/index.ts`)
  are replaced with a single `TYPE_A_AGENTS` table-driven loop. Type-E (curator
  variants) and architect/council/critic blocks remain explicit.

DD-C014 (`parseGitRemoteUrl` duplication) and DD-C015+16 (gate-file duplication):
verified as already resolved in prior work; no code changes.

DD-C005 (`system-enhancer.ts` Path A / Path B duplication, ~687 lines): investigated
on 2026-06-28. Path A is the **default** execution path for all users where
`context_budget.scoring.enabled` is omitted or `false` (the default per
`constants.ts:479` and `schema.ts:267`). Path B is the experimental opt-in scoring
path. Deletion of Path A would silently break all non-scoring users. The
`// EXACT LEGACY CODE` annotation marks Path A as frozen during a phased rollout,
not as dead code. **No code change — keep both paths.**

Remaining deferred findings (DD-C001, DD-C002, DD-C004, DD-C007, DD-C008, DD-C009,
DD-C011): all carry explicit "defer" or "optional" audit-critic verdicts; none
require action before this PR's scope is closed.

Tests:
- New unit tests: `normalizePath` (11 cases, including internal `./` segment
  resolution), `resolvePrompt` (5 cases), and dedup-key behavioral tests via
  `detectPosixWrites` / `detectWindowsWrites`.
- `explorer-consumer-contract.test.ts` source-code assertion updated to reflect
  the `resolvePrompt` call signature replacing the old inline template.

## Why

The 5 confirmed findings from the audit created latent maintenance risk: diverging
dedup-key formats across 5 copy-sites, 4 private normalizePath definitions that
each lacked one or more transforms the canonical version provides, and 11 identical
prompt-resolution blocks that would each need updating for any future change to
prompt-composition semantics. No user-visible bugs beyond the `schema-drift.ts`
naming collision (internal, no external callers).

## Migration

No breaking changes. All changes are internal refactors:
- `normalizePath` re-export from `turbo/lean/conflicts.ts` is preserved — existing
  importers (`turbo/epic/*.ts`, `turbo/lean/*.ts`) are unaffected.
- Agent prompt behaviour is identical for all 11 standard agents; curator-agent
  intentional inversion is explicitly preserved and documented.
- `buildDedupeKey` is module-internal to `shell-write-detect.ts` — not exported.
- `resolvePrompt` is exported from `src/agents/_prompt-helpers.ts` for future reuse.

## Caveats

- `src/full-auto/policy.ts` has no unit tests; the behavioural delta vs. the old
  local `normalizePath` (gains: multi-slash collapse, `./` segment resolution,
  Windows case folding) was not testable against production callers in CI.
  Confirmed safe for all call sites at lines 346, 348, 364, 446, 452: all inputs
  are file paths from `git diff`/`git status` output which do not contain `//`,
  leading `./`, or internal `.` segments on any supported platform.
- `co-change-suggester.ts` and `test-impact/analyzer.ts` backslash-only
  `normalizePath` variants are intentionally left as-is; their minimal semantics
  are different from the canonical version and could not be safely replaced without
  dedicated regression tests for their callers.

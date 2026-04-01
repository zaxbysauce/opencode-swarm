# Technical Debt and CI Stability Report

Generated: 2026-04-01
Scope: All CI workflows, all unit/integration/smoke/security test directories, src/, package.json, tsconfig.json, biome.json, bun.lock, TESTING.md
Files reviewed: ~350+
Parallel exploration used: YES (4 explorer agents)
Independent reviewer validation used: YES (1 reviewer agent)
Runtime validation used: YES (bun test runs, dependency checks)

---

## Executive Summary

CI is structurally unsound: two large test groups covering the majority of the codebase run with `continue-on-error: true`, meaning PRs can go green while hundreds of tests fail. The `test/` directory contains test theater with `expect(true).toBe(true)` assertions and imports `vitest` instead of `bun:test`, making those tests silently broken in CI. Named imports from `node:child_process` in ~7 source files mean mock interception fails for those modules, producing false-passing unit tests. Fixing the `continue-on-error` steps requires first resolving the 43 pre-existing failures tracked in #332; everything else is unblocked.

---

## Current PR/CI Blockers

1. **`continue-on-error: true` on two massive test groups** — PRs pass CI even when services, build, quality, sast, sbom, scripts, state, agents, background, context, diff, evidence, git, helpers, knowledge, lang, output, parallel, plan, session, skills, types, utils all fail. `.github/workflows/ci.yml:109` and `:125`.
2. **`test/adversarial-plan-write.test.ts` imports `vitest`** — CI uses `bun:test` exclusively; this file runs in the integration job and fails at import time. `test/adversarial-plan-write.test.ts:16`.
3. **`tests/security/ci-workflow-security.test.cjs` uses CommonJS `require('js-yaml')`** — non-standard `.cjs` format in a TypeScript/ESM project; fragile in the security job.
4. **43 pre-existing test failures acknowledged in #332** — root cause of the `continue-on-error` workaround. Must be fixed before removing it.

---

## Critical and High Findings

### CI-2 — CONFIRMED HIGH: `continue-on-error: true` silently passes broken suites

**File:** `.github/workflows/ci.yml:109, 125`

Two steps use `continue-on-error: true` with comment "43 pre-existing test bugs remain (tracked in #332)". Both use `exit $failed` internally but GitHub Actions ignores that exit code when `continue-on-error: true` is set. The affected directories cover most of the codebase: services, build, quality, sast, sbom, scripts, state, agents, background, context, diff, evidence, git, helpers, knowledge, lang, output, parallel, plan, session, skills, types, utils.

**Fix:** Resolve #332. Remove `continue-on-error: true` from both steps.

---

### CI-10 — CONFIRMED CRITICAL: Biome lints only `src/**`; all test files unscanned

**File:** `biome.json:4`

```json
"includes": ["src/**", "biome.json", "package.json", "tsconfig.json"]
```

`tests/`, `test/`, `src/__tests__/` are excluded. The `vitest` import in `test/adversarial-plan-write.test.ts` was never caught because it was never linted.

**Fix:** Add `"tests/**"` and `"test/**"` to `biome.json` includes.

---

### TEST-1 — CONFIRMED CRITICAL: Pure test theater — `expect(true).toBe(true)`

**File:** `test/adversarial-plan-write.test.ts:256, 567, 613, 637, 699, 938`

Six assertions that always pass:
- Lines 256, 567, 613, 637, 938: `expect(true).toBe(true); // Test always passes — documents finding`
- Line 699: `expect(completed || true).toBe(true);` — always passes due to `|| true`
- Line 209: `expect(threw || !existsSync(...)).toBe(true);` — passes whether or not the implementation works

**Fix:** Replace with real assertions or delete. These tests provide zero regression protection.

---

### TEST-4 — CONFIRMED CRITICAL: `test/` directory imports `vitest`, not `bun:test`

**File:** `test/adversarial-plan-write.test.ts:16`

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
```

`vitest` is not in `package.json`. The integration job globs `./test/*.test.ts` (`.github/workflows/ci.yml:169`) and runs this file. It fails at import on every PR.

**Fix:** Migrate to `bun:test`. Replace `vi.fn()` with `mock()`, `vi.spyOn` with `spyOn`.

---

### TEST-3 — CONFIRMED HIGH: Named imports from `node:child_process` bypass mocks

**Affected source files:**
- `src/hooks/spawn-helper.ts:1` — `import { spawn }`
- `src/services/diagnose-service.ts` — `import { execSync }`
- `src/git/branch.ts:1` — `import { spawnSync }`
- `src/git/pr.ts:1` — `import { spawnSync }`
- `src/sast/semgrep.ts` — `import { execFileSync, spawn }`
- `src/tools/checkpoint.ts` — `import { spawnSync }`
- `src/knowledge/identity.ts` — `import { execSync }`

TESTING.md lines 46–55 explicitly prohibits this pattern. Named imports bind at load time; `mock.module('node:child_process', ...)` cannot intercept them. Tests for these modules either run real subprocesses in CI or pass without testing real behavior.

**Fix:** Convert to `import * as child_process from 'node:child_process'` and call as `child_process.spawnSync(...)`.

---

### TEST-6 — CONFIRMED HIGH: 56+ adversarial/security tests permanently skipped

Examples:
- `tests/unit/agents/architect-v6-prompt.test.ts` — `describe.skip('Rule 4 Self-Coding Pre-Check Adversarial Tests')`
- `tests/unit/tools/co-change-analyzer.adversarial.test.ts` — 7 tests skipped: "Mock not working in Bun/Vitest environment"
- `tests/unit/hooks/knowledge-injector.adversarial.test.ts` — 9 injection attack tests skipped
- `tests/unit/hooks/guardrails-self-coding-gate.test.ts` — multiple security gate tests skipped

The skip reason is the same mock interception issue as TEST-3. Fixing TEST-3 unblocks re-enabling these.

**Fix:** Fix TEST-3, then remove `.skip` from these describe blocks.

---

### DEP-1 — CONFIRMED HIGH: Dual lockfiles; release build skips `--frozen-lockfile`

Both `bun.lock` and `package-lock.json` exist. All PR CI jobs use `bun install --frozen-lockfile`. The release job at `release-and-publish.yml:48` uses bare `bun install`. A release artifact can ship with different dependency versions than what CI validated.

**Fix:** Delete `package-lock.json`. Add `--frozen-lockfile` to the release install step.

---

### SRC-4 — CONFIRMED HIGH: TOCTOU race condition in `src/parallel/file-locks.ts`

**File:** `src/parallel/file-locks.ts:54-86`

```typescript
if (fs.existsSync(lockPath)) {          // check
    const existing = JSON.parse(         // race window — another process can delete here
        fs.readFileSync(lockPath, 'utf-8')
    );
    if (Date.now() > existing.expiresAt) {
        fs.unlinkSync(lockPath);          // second unlink throws if already deleted
    }
}
fs.writeFileSync(tempPath, ...);
fs.renameSync(tempPath, lockPath);        // can overwrite a just-acquired lock
```

Used by `src/tools/save-plan.ts`. Concurrent plan saves will intermittently corrupt the lockfile or overwrite each other's plan. The `proper-lockfile` package is already in `dependencies` — it was not used here.

**Fix:** Use `proper-lockfile` (already a dependency) or `fs.openSync(lockPath, 'wx')` for atomic exclusive creation.

---

## Test Theater Findings

| Location | Pattern | Verdict |
|---|---|---|
| `test/adversarial-plan-write.test.ts:256,567,613,637,938` | `expect(true).toBe(true)` | Theater — zero defect detection |
| `test/adversarial-plan-write.test.ts:699` | `expect(completed \|\| true).toBe(true)` | Theater — always passes |
| `test/adversarial-plan-write.test.ts:209` | `expect(threw \|\| !existsSync(...)).toBe(true)` | Theater — both branches pass |
| `tests/unit/agents/architect-v6-prompt.test.ts:26-47` | `expect(prompt).toContain('imports')` | Weak — checks substring existence, not behavior or ordering |
| `tests/smoke/packaging.test.ts` | `existsSync(dist/index.js)` + `mod.default()` call | Borderline — existence checks are theater but the factory call is behavioral |

---

## Missing or Mis-Scoped Tests

**Missing with real CI impact:**
- Concurrent lock acquisition in `src/parallel/file-locks.ts` — no test covers the race path
- Malformed gate evidence causing gate failure in `src/hooks/delegation-gate.ts`
- Architect prompt template variable substitution — 30+ `{{TEMPLATE}}` variables, no completeness test
- Session eviction logic in `src/state.ts:283` — eviction only triggers on `startAgentSession`; no test covers the eviction branch

**Mis-scoped:**
- `test/adversarial-plan-write.test.ts` — wrong framework, wrong directory, not linted. Needs full migration to `tests/integration/`.
- `tests/security/ci-workflow-security.test.cjs` — should be `ci-workflow-security.test.ts` using TypeScript.
- 56+ skipped adversarial tests — correctly scoped but disabled.

**Unnecessary:**
- Pure file-existence checks in `tests/smoke/packaging.test.ts` (`dist/index.js exists`, `dist/index.d.ts exists`) — a failed build would already surface these.

---

## Flaky-Test Risks

### CONFIRMED: Wall-clock timing in `tests/unit/hooks/agent-activity.test.ts`

```typescript
// Line 125
await new Promise(resolve => setTimeout(resolve, 10));
// Line 152
expect(aggregate.totalDuration).toBeLessThan(Date.now() - startTime + 100);
```

The 100ms buffer fails on loaded CI runners. This test will flake intermittently.

**Fix:** Use `mock.useFakeTimers()` from `bun:test`.

---

### CONFIRMED: `bun-version: latest` is non-deterministic

All CI jobs use `bun-version: latest`. A Bun release during a PR run can change behavior mid-flight and break tests that passed locally.

**Fix:** Pin to `"1.3.9"` (current) in all workflow files.

---

### LIKELY: Incomplete restore in `src/state.rehydration-integration.test.ts`

`_originalRehydrate` captures a module function in `beforeEach` but `afterEach` may not restore it. Module-level mutation persists across tests in the same process.

---

## Structural Debt with CI Impact

| Finding | File | Impact |
|---|---|---|
| Release job uses `bun install` without `--frozen-lockfile` | `release-and-publish.yml:48` | Release deps can differ from what CI validated |
| `"bun-types": "latest"` in devDependencies | `package.json:61` | Non-reproducible; a new release can break typecheck in CI |
| `dist/` partially committed; no build-drift gate | `.gitignore:28-34` | PR can change source without rebuilding; stale dist ships |
| `clean` script calls bare `node` | `package.json:40` | Fails in Bun-only CI environments |
| `swarmState` global singleton, 18+ mutators | `src/state.ts:218` | Test isolation depends on manual `resetSwarmState()` in every test file |

---

## Dependency and Toolchain Risks

| ID | Severity | Finding | Fix |
|---|---|---|---|
| DEP-1 | HIGH | Dual lockfiles (`bun.lock` + `package-lock.json`) | Delete `package-lock.json` |
| DEP-2 | MEDIUM | `zod` resolves to `4.3.6` at root, `4.1.8` under `@opencode-ai/plugin`; instanceof checks across boundary fail | Pin root to `^4.1.8` or upgrade plugin |
| DEP-5 | MEDIUM | `"bun-types": "latest"` — breaks reproducibility | Pin to `"1.3.9"` |
| DEP-7 | MEDIUM | `dist/` partially committed, no CI drift check | Add `bun run build && git diff --exit-code dist/` gate |
| DEP-4 | MEDIUM | `clean` script requires `node`, not declared in engines | Use `bun -e ...` instead |
| DEP-6 | LOW | `tsconfig.json` has both `"emitDeclarationOnly": true` and `"noEmit": false` | Remove `"noEmit": false` |

---

## Coverage Notes

- The exact number of currently-failing tests under `continue-on-error` was not runtime-validated (`node_modules` not installed in the audit environment; `bun install` was not run).
- `src/tools/` has 42 source files; ~5 have no dedicated test file but do have inline tests embedded in source. Whether inline tests run in CI was not fully traced.
- `src/session/snapshot-writer.ts` async await chain was not fully traced.
- `@opencode-ai/plugin` / `@opencode-ai/sdk` compatibility with the split `zod` versions was not runtime-tested.

---

## Validation Notes

- Candidate findings generated: 34
- Reviewer CONFIRMED: 20
- Reviewer DISPROVED: 1 (smoke test theater — tests are more behavioral than claimed)
- Reviewer UNVERIFIED: 8 (snapshot-writer await, session eviction, telemetry write race, gate error swallow paths)
- Reviewer PRE_EXISTING: 5 (swarmState singleton, session accumulation, telemetry listener swallow, hook composition, prompt toContain pattern)

---

## Green-PR Remediation Order

### Step 1 — Fix the active integration job failure (unblocks every PR)

1. Migrate `test/adversarial-plan-write.test.ts` from `vitest` to `bun:test`; replace all `expect(true).toBe(true)` with real assertions.
2. Rename `tests/security/ci-workflow-security.test.cjs` to `.test.ts`; migrate to TypeScript.
3. Add `"tests/**"` and `"test/**"` to `biome.json` includes.

### Step 2 — Resolve #332 and remove `continue-on-error`

4. Fix the 43 pre-existing test failures in services/build/quality/sast/sbom/scripts/state/agents/etc.
5. Remove `continue-on-error: true` from `ci.yml:109` and `ci.yml:125`.

### Step 3 — Fix mock interception and re-enable skipped tests

6. Convert named `node:child_process` imports to namespace imports in all 7 source files.
7. Remove `describe.skip` from all 56+ adversarial/security tests.

### Step 4 — Eliminate flaky-test risk

8. Replace wall-clock assertions in `agent-activity.test.ts` with fake timers.
9. Pin `bun-version` to `"1.3.9"` in all workflow files.
10. Pin `"bun-types"` to an exact version in `package.json`.

### Step 5 — Dependency and build hygiene

11. Delete `package-lock.json`.
12. Add `--frozen-lockfile` to `release-and-publish.yml:48`.
13. Add `bun run build && git diff --exit-code dist/` as a CI gate.
14. Change `clean` script to use `bun` not `node`.

### Step 6 — Lower-value cleanup (after the above)

15. Fix `proper-lockfile` usage in `src/parallel/file-locks.ts` to eliminate TOCTOU.
16. Align `zod` versions across the dependency tree.
17. Add missing tests: concurrent lock acquisition, gate evidence security edge cases, architect prompt template completeness, session eviction.

---

## Post-Implementation Validation (2026-04-01)

### Fixes implemented: FIX-1 through FIX-12

All 12 fixes were implemented, independently reviewed, and verified. Zero regressions introduced.

### Pre-existing failure triage

**Tools test suite (tests/unit/tools/ — 120 files per-file run):**
- 102 pass, 18 fail
- All 18 failures confirmed pre-existing on base commit f1242c3
- Failures concentrated in checkpoint, phase-complete, pkg-audit, lint-cwd, placeholder-scan-plan, sast-scan-profiles, tool-names, write-retro adversarial

**Hooks test suite:**
- Batch mode (bun --smol test tests/unit/hooks/): 1865 failures, 4009 tests, 161 files
- Per-file mode: 157 files pass, 4 files fail
- **Root cause of 1865-vs-4 gap**: bun --smol shares module cache across files in a single test run; mock.module() registrations from one file poison other files. CI avoids this by running hooks per group — the batch run is not a valid signal.
- 4 per-file failures confirmed pre-existing: `destructive-command-guard.test.ts` (18 fail), `knowledge-curator-output.test.ts` (1 fail), `system-enhancer-coder-context.test.ts` (3 fail), `telemetry-guardrails-wiring.test.ts` (1 fail)

### describe.skip / it.skip audit

56+ skip blocks exist in tests/unit/hooks/ and tests/unit/agents/. They fall into three categories:

1. **Obsolete (feature removed)**: `architect-v6-prompt.test.ts:1144` — "BEFORE SELF-CODING section was removed in Phase 3 — these tests are now obsolete"; `guardrails-self-coding-gate.test.ts` skip blocks for SELF_CODING_BLOCK — same reason. These must stay skipped; the feature they tested no longer exists.

2. **Test infrastructure issues unrelated to FIX-4**: `knowledge-injector.adversarial.test.ts` — still uses `import { vi } from 'vitest'` with `vi.mock()`. The skip blocks fail because `vi.fn().mockResolvedValue()` mid-test mock updates don't propagate correctly in bun's vitest compat layer. Un-skipping one block confirms: the test fails with `Expected to contain "` ` `" Received: ""`. Fixing requires migrating the full file to `bun:test` with `mock.module()` — a separate work item.

3. **Feature gaps**: Various `describe.skip` blocks in hooks tests document unimplemented behaviors (e.g., `knowledge-migrator.external`, `adversarial-detector-spiral`). These test planned but unbuilt features.

**FIX-4 (namespace child_process imports) did NOT unblock these skip blocks.** FIX-4 enables mock interception of child_process calls in source files (e.g., co-change-analyzer.ts). The knowledge-injector skip blocks are about mocking plan/manager.js and knowledge-reader.js — unaffected by child_process import style.

### Remaining blocked items

- `continue-on-error: true` removal: still blocked on resolving the 43 pre-existing failures in #332
- `knowledge-injector.adversarial.test.ts` skip migration: separate work item (requires full vitest→bun:test migration of the file)
- Obsolete test cleanup: `architect-v6-prompt.test.ts` Rule 4 block and related guardrails blocks should be deleted, not un-skipped

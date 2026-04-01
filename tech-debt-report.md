# Technical Debt and CI Stability Report

Generated: 2026-04-01
Scope: All CI workflows, all unit/integration/test/ directories, src/, package.json, tsconfig.json, biome.json, bun.lock, TESTING.md
Files reviewed: ~310+ (workflows, package manifests, 642 test files sampled, key source modules)
Parallel exploration used: YES (3 explorer subagents in Phase 1)
Independent reviewer validation used: YES (1 reviewer subagent in Phase 2)
Runtime validation used: YES (bun install + targeted test runs with exact failure output)

---

## Executive Summary

The **integration CI job is actively failing with 84 test failures** (no `continue-on-error`), which blocks the downstream smoke job on all platforms. The root causes are a mix of test drift (tests expect strings no longer in the prompt), deterministic bugs (lint detection not working in isolated temp dirs, file watcher timing), ordering-dependent state contamination via `process.chdir`, and evidence-file resolution issues. The quality and unit jobs are green (the unit job masks an acknowledged 43-test backlog via `continue-on-error`). The most urgent remediation is fixing the 10 integration test files that fail in isolation, because those will still fail in CI regardless of test ordering.

---

## Current PR/CI Blockers

The following issues prevent the **integration** job from passing. Since `smoke needs: [unit, integration]`, smoke is also blocked.

| # | File | Failures | Root Cause |
|---|------|----------|-----------|
| 1 | `test/reviewer-three-tier.test.ts` | 4 | Prompt string drift — test expects `'HIGH: must fix'` / `'CRITICAL: blocks approval'` / `'LOW: defense in depth'` / `'MEDIUM: fix before production'`; reviewer prompt was rewritten with different wording |
| 2 | `tests/integration/workflow-state-machine.test.ts` | 12 | `checkReviewerGate` returns "corrupt or unreadable" evidence file error instead of expected gate-rejection message; test creates `.swarm` dir in tempDir but evidence resolution fails |
| 3 | `tests/integration/plan-sync-worker.test.ts` | 6 | File watcher callbacks never fire within test window; `syncResults.length` is always 0; timing assumptions (~150ms debounce) are not met |
| 4 | `tests/integration/phase-complete-events.adversarial.test.ts` | 4 | Ordering-dependent failure when run with full suite |
| 5 | `tests/integration/curator-pipeline-health.test.ts` | 3 | Fails in isolation — pipeline round-trip produces inconsistent state |
| 6 | `tests/integration/reviewer-gate-enforcement.test.ts` | 2 | Fails in isolation |
| 7 | `tests/integration/pre-check-batch.test.ts` | 2 | `parsed.lint.ran` is `false` — lint not detected because `detectAvailableLinter()` looks for `node_modules/.bin/biome` in temp dir; temp dir has no `node_modules` |
| 8 | `tests/integration/circuit-breaker-race-condition.test.ts` | 1 | Fails in isolation |
| 9 | `tests/integration/check-gate-status-registration.test.ts` | 1 | Fails in isolation |
| 10 | `tests/integration/plan-sync-init.test.ts` | 1 | Fails in isolation |
| 11 | Ordering-contamination | ~48 | `process.chdir()` in multiple test files is not safely restored on failure; shared module cache (no `--smol` per-file isolation in integration job) |

**Total confirmed in integration run: 84 failures. All are blocking.**

Evidence: `bun test tests/integration ./test` → `462 pass, 80 fail` (integration alone) + `4 fail` (./test/reviewer-three-tier.test.ts) = 84 total.

---

## Critical and High Findings

### F1 — CONFIRMED — Integration job failing: reviewer-three-tier prompt drift
**File:** `test/reviewer-three-tier.test.ts:274,281,288,295`
**Severity:** HIGH (CI blocker)

Tests assert the reviewer prompt contains `'LOW: defense in depth improvements'`, `'MEDIUM: fix before production'`, `'HIGH: must fix'`, `'CRITICAL: blocks approval'`. The `REVIEWER_PROMPT` in `src/agents/reviewer.ts` was updated with a rewritten SEVERITY CALIBRATION block (lines 140+) using different wording (`'HIGH: Logic error...'`, `'CRITICAL: Will crash...'`). The four expected substrings do not appear anywhere in the current prompt. Tests fail deterministically.

**Fix:** Update the 4 string expectations in `test/reviewer-three-tier.test.ts` to match the current wording in the reviewer prompt, or restore the expected strings in the prompt if they were intentionally specified in prior acceptance criteria.

---

### F2 — CONFIRMED — Integration job failing: lint detection broken in temp dirs
**File:** `tests/integration/pre-check-batch.test.ts:100,138` | Root: `src/tools/lint.ts` (detectAvailableLinter)
**Severity:** HIGH (CI blocker)

`detectAvailableLinter()` checks for `path.join(projectDir, 'node_modules', '.bin', 'biome')` with no fallback to the project root or PATH. The integration test calls `process.chdir(tempDir)` where `tempDir` has no `node_modules`, so lint is never detected and `parsed.lint.ran` is `false`. CI creates a fresh checkout and would also have `node_modules` under the repo root — but if the test `chdir`s out of that dir, detection still fails. Two tests fail deterministically.

**Fix:** Add a fallback in `detectAvailableLinter` to check PATH or walk up from `projectDir` to find biome/eslint, OR have the test scaffold copy `node_modules/.bin` into the temp dir, OR pass the linter binary path explicitly.

---

### F3 — CONFIRMED — Integration job failing: plan-sync-worker file watcher timing
**File:** `tests/integration/plan-sync-worker.test.ts:111-143`
**Severity:** HIGH (CI blocker)

All 6 failures show `expect(syncResults.length).toBeGreaterThan(0)` with `Received: 0`. The worker's file system watcher never triggers callbacks during the 150ms test window. This is a deterministic failure (not intermittent) — the watcher is either not initializing correctly in the test environment, or the debounce window plus fs.watch latency exceeds the hardcoded delays.

**Fix:** Either verify the watcher mechanism actually works at all in Bun's environment and fix the implementation, or mock the file watcher layer in these tests rather than relying on real `fs.watch` timing.

---

### F4 — CONFIRMED — Integration job failing: workflow-state-machine evidence resolution
**File:** `tests/integration/workflow-state-machine.test.ts:129,151,177,204` (12 failures)
**Severity:** HIGH (CI blocker)

`checkReviewerGate('1.1')` returns "Evidence file for task 1.1 is corrupt or unreadable" instead of the expected gate-rejection message. The test scaffolds `.swarm` with a valid `plan.json` but no `evidence/1.1.json`. The gate function is treating a missing evidence file as corrupt rather than falling through to session state. This causes all state-machine transition tests to fail with unexpected error messages.

**Fix:** Either ensure `checkReviewerGate` treats a missing evidence file as absent (not corrupt), or have the test create the required evidence directory structure.

---

### F5 — CONFIRMED — Integration test ordering contamination via process.chdir
**Files:** `tests/integration/gate-workflow.test.ts:32,40` | `tests/integration/pre-check-batch.test.ts:29,40,44` | `tests/integration/workflow-state-machine.test.ts:47,48,97`
**Severity:** HIGH (CI blocker — contributes ~48 of 84 failures)

Multiple integration test files call `process.chdir(tempDir)` in `beforeEach` and restore in `afterEach`. When tests fail mid-execution, `afterEach` may still run, but if a test throws an unhandled error before the chdir the restoration may not happen. More critically, Bun runs all files in `bun test tests/integration` in the same process without the `--smol` per-file isolation used in unit tests. Any cwd leak corrupts all subsequent tests that rely on `process.cwd()` for path resolution.

The integration job command is:
```yaml
run: bun test tests/integration ./test --timeout 120000
```
No `--smol`, no per-file isolation. Unit tests explicitly use per-file isolation to work around Bun issue #330; integration tests do not.

**Fix:** Add per-file loop isolation to the integration job step (same pattern as tools unit tests), OR refactor integration tests to avoid `process.chdir` and instead pass the working directory explicitly through the tool API.

---

### F6 — PRE_EXISTING — 43 acknowledged failing tests masked by continue-on-error
**File:** `.github/workflows/ci.yml:108-109,124-125`
**Severity:** MEDIUM (CI confidence erosion)

Two large unit test batches use `continue-on-error: true` with an inline comment: "43 pre-existing test bugs remain (tracked in #332)". These cover: services, build, quality, sast, sbom, scripts, state, agents, knowledge, evidence, plan, misc. Real regressions in these modules will not block PRs. The issue has no referenced SLA or resolution target in the workflow file.

---

## Test Theater Findings

### T1 — 68 `expect(true).toBe(true)` placeholders
**Files:** `test/adversarial-plan-write.test.ts` (5 instances), `tests/adversarial/schema-summary-config.adversarial.test.ts`, `tests/adversarial/plan-manager-adversarial.test.ts`, `tests/integration/pre-check-batch.test.ts` (2 placeholders), `tests/integration/phase-preflight-auto.test.ts`

Many adversarial tests handle the "attack succeeds silently" path with `expect(true).toBe(true)` — the test passes whether or not the implementation rejected the attack. Example from `test/adversarial-plan-write.test.ts:256`:
```typescript
// Test always passes - documents finding
expect(true).toBe(true);
```
These tests record the existence of an attack vector without verifying it was blocked. They provide zero regression protection.

### T2 — Agent config tests validate prompt strings, not behavior
**Files:** `tests/unit/agents/*.test.ts` (46 files, e.g., `reviewer-three-tier.test.ts`, `architect.test.ts`)

Tests like `expect(prompt).toContain('STEP 0: INTENT RECONSTRUCTION')` confirm text is present in a prompt string. They would pass even if the function using the prompt were deleted entirely. They catch copy-paste drift (as F1 demonstrates) but do not verify the agent actually executes those steps. High volume of such tests inflates test-count metrics without protecting runtime behavior.

### T3 — 80 skipped tests
**Pattern:** `describe.skip`, `it.skip`, `test.skip` found 80 times across the test suite.
Many skipped tests are in `tests/unit/hooks/` covering critical security and knowledge paths. Skipped tests suppress failures without tracking whether the underlying code still works.

### T4 — Weak `expect(X).toBeDefined()` assertions
**Files:** `test/adversarial-plan-write.test.ts` (30+ instances)
Assertions like `expect(error).toBeDefined()` pass for any thrown error, regardless of whether it's the right error. `expect(result.plan_path).toBeDefined()` passes if the field is an empty string or `null`. No behavioral protection.

---

## Missing or Mis-Scoped Tests

### M1 — Integration tests not per-file isolated (test pyramid inversion)
The integration suite runs all files in one Bun process, but units use per-file isolation. This makes integration tests MORE fragile than unit tests — the opposite of what the pyramid should deliver. The integration layer should be the most trusted; it currently has the most failures.

### M2 — Pre-check-batch lint detection not tested with PATH fallback
There is no test verifying that `detectAvailableLinter` falls back to PATH when `node_modules/.bin/biome` is absent. The only integration test uses a scaffold that lacks `node_modules`, so the behavior when biome is in PATH but not in `node_modules/.bin` is never exercised.

### M3 — File watcher mechanism has no unit-level tests
The `PlanSyncWorker` file watcher is only exercised via integration tests that require real `fs.watch` timing. There are no unit tests that mock the watcher layer and verify the debounce/callback logic independently.

### M4 — Mutation weakness: agent prompt tests
Applying mutation thinking to the agent prompt tests: if the `REVIEWER_PROMPT` string were deleted and replaced with `"placeholder"`, the only tests that would catch it are the `toContain` string checks. None of the 46 agent test files verify the agent actually executes any of the steps described in its prompt. This is the gap that F1 illustrates — the prompt changed and the tests caught text drift, but nobody caught that the behavioral contracts might have changed.

---

## Flaky-Test Risks

### FL1 — plan-sync-worker hardcoded timing (CONFIRMED failing)
`tests/integration/plan-sync-worker.test.ts:111-143`: 50ms/100ms/150ms hardcoded delays around `fs.watch`. Already failing deterministically. Would be flaky on CI even if sometimes passing locally.

### FL2 — process.chdir contamination
Any test failure in `gate-workflow.test.ts`, `pre-check-batch.test.ts`, or `workflow-state-machine.test.ts` that occurs after `process.chdir(tempDir)` but before `afterEach` restoration will corrupt the cwd for all subsequent tests in the same process. This is a source of non-deterministic ordering failures in the full suite.

### FL3 — 234 hardcoded sleep/delay statements in unit tests
Explorer found 234 `setTimeout`/sleep invocations in test files. Primary concentration in `tests/unit/hooks/` and `tests/integration/`. These represent flaky-test time bombs on loaded CI runners.

### FL4 — Date.now() and Math.random() in tests
`tests/unit/hooks/curator.adversarial.test.ts:23` generates temp paths with `Date.now() + Math.random()`. Non-deterministic seeds. If the directory already exists (from a prior interrupted run) the test may behave differently.

---

## Structural Debt with CI Impact

### S1 — Module cache poisoning (#330) requiring workaround
**File:** `.github/workflows/ci.yml:97-105,113-120`
Bun's `--smol` mode shares module caches across test files in the same process. The workaround is to run each file in its own `bun --smol test $f` subprocess. This pattern is applied to unit/tools, unit/services, etc., but NOT to integration tests. The underlying Bun issue (#330) is unresolved; workaround adds significant test runtime and cognitive overhead.

### S2 — Bun version inconsistency across CI jobs
**File:** `ci.yml:19` vs `release-and-publish.yml:37`
`ci.yml` uses `bun-version: latest`; `release-and-publish.yml` uses `bun-version: "1.x"`. A Bun major version breaking change could cause CI to pass while publish fails, or vice versa. Should be pinned consistently.

### S3 — biome schema version requires manual sync
**File:** `biome.json:2`
Schema `2.3.14` is hardcoded. No automation to keep it in sync with `@biomejs/biome` in `devDependencies`. Will cause confusing errors if the version drifts.

### S4 — continue-on-error masking 43 bugs creates confidence gap
See F6. A PR touching the services or agents layer can regress those modules' tests without failing CI. The CI dashboard will appear green while the modules are broken.

### S5 — npm version pinned to 11.5.2 in publish workflow
**File:** `.github/workflows/release-and-publish.yml:45`
`npm i -g npm@11.5.2` is hardcoded. Node.js 22 is the pinned runtime (line 41). If npm 11.5.2 becomes incompatible with new npm registry changes, the publish job fails silently or with cryptic errors.

---

## Dependency and Toolchain Risks

### D1 — No per-file isolation in integration runner
The integration test command does not use `--smol` per-file subprocess isolation. This means the Bun module cache is shared across all 33 integration test files, causing the ordering-dependent contamination described in F5. The fix in the unit job is already established — it just hasn't been applied to integration.

### D2 — lint detection relies on node_modules/.bin proximity
`src/tools/lint.ts` detectAvailableLinter checks `{projectDir}/node_modules/.bin/biome`. This breaks whenever the working directory is changed to a location without `node_modules`. Any test or usage that changes cwd will silently disable linting.

### D3 — Vendored tree-sitter grammars require manual rebuild
`scripts/copy-grammars.ts:33-42` notes Kotlin, Swift, and Dart grammars are vendored and "must be manually rebuilt". There is no CI step verifying they are up to date or that they compile successfully. If the web-tree-sitter version changes, the WASM ABI may break silently.

---

## Coverage Notes

- Source code module-level debt analysis (from explorer subagent) was still completing at report write time. This report covers CI/test surfaces with full runtime validation. The `src/` module-level debt findings are incomplete and should be re-run.
- Windows-specific unit test failures were not validated locally. All hooks tests are skipped on Windows (`if: runner.os != 'Windows'`). No documented rationale found; 12 CI steps are Windows-skipped.
- The `security` CI job (runs `tests/security`) was not run locally. Assumed green absent other signals.

---

## Validation Notes

- Explorer candidate findings generated: ~35 (across 3 subagents)
- Reviewer confirmed: 4 (F1, F2, F3, F4 — independent reviewer context)
- Reviewer disproved: 1 (swarmState singleton theory — tests properly call resetSwarmState())
- Reviewer unverified: 0
- Runtime validation: YES — bun install performed, targeted test runs with exact output
- Confirmed CI-blocking failures: 84 in integration job (runtime-verified)
- Confirmed quality job: GREEN (runtime-verified)

---

## Green-PR Remediation Order

### Step 1 — Fix the 10 integration test files that fail in isolation (unblock integration job)

These are deterministic failures that will reproduce in every CI run:

1. **`test/reviewer-three-tier.test.ts`** — Update 4 `toContain` assertions to match current reviewer prompt wording (`'HIGH: Logic error...'`, `'CRITICAL: Will crash...'`, `'MEDIUM: Edge case...'`, `'LOW: Code smell...'`). One-line changes.

2. **`tests/integration/workflow-state-machine.test.ts`** — Fix `checkReviewerGate` to treat a missing evidence file as absent rather than corrupt, OR have the test scaffold create `evidence/1.1.json` with minimal valid content.

3. **`tests/integration/plan-sync-worker.test.ts`** — Fix or mock the file watcher so callbacks reliably fire. Consider replacing `fs.watch` timing tests with injected event tests.

4. **`tests/integration/pre-check-batch.test.ts`** — Fix `detectAvailableLinter` to fall back to PATH when `node_modules/.bin/biome` is absent in the current directory.

5. **Remaining 6 files** (curator-pipeline-health, reviewer-gate-enforcement, circuit-breaker-race-condition, check-gate-status-registration, plan-sync-init, phase-complete-events.adversarial) — Investigate and fix in order of failure count.

### Step 2 — Add per-file isolation to the integration job (fix ordering contamination)

Change `.github/workflows/ci.yml` integration step from:
```yaml
run: bun test tests/integration ./test --timeout 120000
```
to per-file loop (same pattern as tools unit tests). This eliminates the ~48 ordering-dependent failures caused by shared module cache and `process.chdir` contamination.

### Step 3 — Eliminate `process.chdir` from integration tests

Refactor `gate-workflow.test.ts`, `pre-check-batch.test.ts`, and `workflow-state-machine.test.ts` to pass working directory as an explicit parameter to the tools under test, rather than mutating the process cwd. This makes tests safe to run in parallel and eliminates the contamination risk entirely.

### Step 4 — Address test theater in critical security paths

- Replace `expect(true).toBe(true)` placeholders with real assertions about whether the attack was rejected or the output is safe. The most important ones are in `test/adversarial-plan-write.test.ts` (path traversal, null byte, injection tests).
- For the 80 skipped tests: audit each one, either enable it or delete it with a clear comment.

### Step 5 — Structural debt (non-blocking, improves confidence over time)

- Pin Bun version consistently across all CI jobs.
- Track and resolve the #332 backlog so `continue-on-error` can be removed from unit tests.
- Add CI step to verify `biome.json` schema version matches `@biomejs/biome` devDependency.
- Document and enforce the Windows test-skip rationale.
- Add PATH fallback to `detectAvailableLinter` to prevent future breakage when cwd changes.

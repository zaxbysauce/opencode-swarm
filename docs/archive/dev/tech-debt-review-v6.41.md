# Tech Debt Review — v6.23-v6.40 Test Failures

Traced and independently verified on 2026-03-30.

## Summary

All 6 pre-existing test failures have been traced end-to-end through the codebase.
Root causes fall into three categories:

1. **Validation guard mismatch** (Findings 1-3): `isValidTaskId()` was added to reject null/undefined/empty taskIds, but tests still expect the old permissive behavior.
2. **Version drift** (Finding 4): Hardcoded version string never updated across 19 minor releases.
3. **Architectural refactors** (Findings 5-6): Implementation APIs changed (evidence-first check, critic prompt modularization) without updating corresponding tests.

---

## Finding 1: state-rehydrate.test.ts

**File:** `tests/unit/state-rehydrate.test.ts` (line ~215)
**Impl:** `src/state.ts` — `evidenceToWorkflowState()` (lines 822-846)

**Problem:** Test provides evidence with `required_gates: ['reviewer', 'test_engineer']` and gates for BOTH reviewer and test_engineer. It expects `'tests_run'`, but `evidenceToWorkflowState()` checks `allPassed` first (line 828). Since both required gates are present, `allPassed = true` and the function returns `'complete'` before reaching the individual `test_engineer` gate check.

**Expected by test:** `'tests_run'`
**Actual return:** `'complete'`

**Fix:** Update the test expectation to `'complete'`, or restructure the test evidence to only provide the `test_engineer` gate (not both).

---

## Finding 2: state-workflow-guard.adversarial.test.ts

**File:** `tests/unit/state-workflow-guard.adversarial.test.ts` (lines 441-447, 467-473)
**Impl:** `src/state.ts` — `isValidTaskId()` (lines 705-711), `advanceTaskState()` (lines 724-768), `getTaskState()` (lines 780-794)

**Problem:** `isValidTaskId()` rejects empty strings (`''.trim().length > 0` is `false`) and null (`null === null` check). `advanceTaskState` silently returns without mutating state. `getTaskState` returns `'idle'` for invalid taskIds.

**Stale assertions:**
- Line 446: `expect(getTaskState(session, '')).toBe('coder_delegated')` — gets `'idle'`
- Line 472: `expect(getTaskState(session, null as any)).toBe('coder_delegated')` — gets `'idle'`

**Fix:** Update expectations to `'idle'`, matching the guard behavior.

---

## Finding 3: state.adversarial.test.ts

**File:** `tests/unit/state.adversarial.test.ts` (lines 18-45, 75-79, 210-213)
**Impl:** `src/state.ts` — same `isValidTaskId()` guard

**Problem:** Same root cause as Finding 2, plus a TypeError for numeric taskIds.

**Stale assertions:**
- Line 25: `expect(session.taskWorkflowStates.get(null as any)).toBe('coder_delegated')` — Map entry never set
- Line 35: `expect(session.taskWorkflowStates.get(undefined as any)).toBe('coder_delegated')` — Map entry never set
- Line 44: `expect(session.taskWorkflowStates.get('')).toBe('coder_delegated')` — Map entry never set
- Line 78: `expect(() => advanceTaskState(session, 123 as any, ...)).not.toThrow()` — throws `TypeError: taskId.trim is not a function`
- Line 212: `expect(getTaskState(session, '')).toBe('coder_delegated')` — gets `'idle'`

**Fix:** Update expectations to match guard behavior. For numeric taskId, either add type checking in `isValidTaskId()` before `.trim()`, or update the test to expect a throw.

---

## Finding 4: version-bump.test.ts

**File:** `tests/unit/version-bump.test.ts` (lines 6, 12)
**Impl:** `package.json` (line 3)

**Problem:** Test has hardcoded `expect(pkg.version).toBe('6.22.19')`. Current package.json version is `'6.41.0'`.

**Fix:** Update hardcoded version to `'6.41.0'`, or refactor test to use a dynamic assertion (e.g., valid semver format check).

---

## Finding 5: phase-complete-fix-adversarial.test.ts

**File:** `tests/unit/adversarial/phase-complete-fix-adversarial.test.ts` (line 93-95)
**Impl:** `src/tools/update-task-status.ts` — `checkReviewerGate()` (line 172)

**Problem:** Test calls `checkReviewerGate('1.1')` without `workingDirectory`. The implementation uses `const resolvedDir = workingDirectory!;` (non-null assertion on `undefined`). When `readTaskEvidenceRaw(undefined, '1.1')` executes, `path.join(undefined, '.swarm', 'evidence', '1.1.json')` throws `TypeError: Path must be a string`. This is caught at line 208, returning `{ blocked: true }`.

**Expected by test:** `result.blocked === false`
**Actual return:** `result.blocked === true`

The test author likely assumed `process.cwd()` would be used as fallback (test calls `process.chdir(tempDir)` before the call), but the implementation requires the parameter explicitly.

**Fix:** Pass `tempDir` as the second argument: `checkReviewerGate('1.1', tempDir)`, or add a `process.cwd()` fallback in the implementation.

---

## Finding 6: agent-audit-p2.test.ts

**File:** `tests/unit/agents/agent-audit-p2.test.ts` (lines 96-119, CR2 block)
**Impl:** `src/agents/critic.ts`

**Problem:** Commit 5d17521 refactored the critic agent from a monolithic prompt (with `### MODE: DRIFT-CHECK` containing quantitative formulas) to a role-based system with three separate prompts: `PLAN_CRITIC_PROMPT`, `SOUNDING_BOARD_PROMPT`, `PHASE_DRIFT_VERIFIER_PROMPT`.

`createCriticAgent('test-model')` defaults to `plan_critic` role, which uses `PLAN_CRITIC_PROMPT`. This prompt does NOT contain `### MODE: DRIFT-CHECK`, `COVERAGE %`, `GOLD-PLATING %`, or the threshold strings (`ALIGNED`, `MINOR_DRIFT`, `MAJOR_DRIFT`, `OFF_SPEC`).

**Note:** `prompt.indexOf('### MODE: DRIFT-CHECK')` returns `-1`, so `prompt.substring(-1)` becomes `prompt.substring(0)` (full prompt) — meaning some assertions might accidentally pass if the string appears elsewhere in the prompt.

**Failing assertions:**
- Line 103: `toContain('COVERAGE %')` — not in `PLAN_CRITIC_PROMPT`
- Line 107: `toContain('GOLD-PLATING %')` — not in `PLAN_CRITIC_PROMPT`
- Lines 111, 115-117: threshold strings — not in `PLAN_CRITIC_PROMPT`

**Fix:** Update tests to use `createCriticAgent('test-model', 'phase_drift_verifier')` which would use `PHASE_DRIFT_VERIFIER_PROMPT`, or update assertions to match the new prompt structure.

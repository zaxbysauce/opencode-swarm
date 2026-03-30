# Tech Debt Fix Plan — v6.23-v6.40 Test Failures

Based on end-to-end tracing and independent verification (2026-03-30).

## Scope

6 named test failures + 3 additional test files discovered during investigation that share the same root causes. All fixes are **test-side** except one small defensive hardening in `isValidTaskId()`.

---

## Fix 1: state-rehydrate.test.ts — Evidence setup provides all gates but expects partial state

**File:** `tests/unit/state-rehydrate.test.ts`
**Root cause:** `evidenceToWorkflowState()` in `src/state.ts` (line ~828) checks `allPassed` first. When all required gates are present, it short-circuits to `'complete'` before reaching the individual gate checks.

### Changes needed

**Test at line ~180-216** ("should use evidence with test_engineer gate to set tests_run state"):
- The evidence provides BOTH `reviewer` and `test_engineer` gates with `required_gates: ['reviewer', 'test_engineer']`
- This makes `allPassed = true`, so the function returns `'complete'`
- But the test expects `'tests_run'`
- **Fix:** Remove the `reviewer` gate from `gates` (keep it in `required_gates`). This way `allPassed` is false (reviewer gate missing), execution falls through to `if (gates.test_engineer != null)` which returns `'tests_run'`.
- This correctly tests the intended scenario: "test_engineer has run but reviewer hasn't yet"

**Test at line ~605-646** ("should respect priority: evidence > plan > existing memory"):
- Same duplicate evidence setup — provides both gates, expects `'tests_run'`
- **Fix:** Either remove `reviewer` from `gates` (same as above), OR change expectation to `'complete'` since the test's primary purpose is testing priority ordering, not a specific state value. The latter is simpler and still validates the priority logic.

**Why this is correct:** The `'complete'` behavior is documented in `docs/architecture.md` line 1312 and is the intended state machine design — when all required gates pass, the task is complete. The test at line ~219-255 already correctly tests this same scenario and expects `'complete'`.

---

## Fix 2: state-workflow-guard.adversarial.test.ts — Empty/null taskId handling

**File:** `tests/unit/state-workflow-guard.adversarial.test.ts`
**Root cause:** `isValidTaskId()` in `src/state.ts` intentionally rejects null/empty. JSDoc explicitly documents this: "Safely returns without mutating state when taskId is null, undefined, empty, or whitespace-only."

### Changes needed

**ATTACK 9 (line ~441-447)** — empty string taskId:
```
// BEFORE (stale):
expect(getTaskState(session, '')).toBe('coder_delegated');

// AFTER (correct):
expect(getTaskState(session, '')).toBe('idle');
```
Also update test name from "should still work" to reflect that empty IDs are rejected gracefully.

**ATTACK 10 (line ~467-473)** — null taskId:
```
// BEFORE (stale):
expect(getTaskState(session, null as any)).toBe('coder_delegated');

// AFTER (correct):
expect(getTaskState(session, null as any)).toBe('idle');
```
Also update comment from "Null is coerced to string 'null'" — null is now rejected, not coerced.

---

## Fix 3: state.adversarial.test.ts — Null/undefined/empty/number taskId handling

**File:** `tests/unit/state.adversarial.test.ts`
**Root cause:** Same `isValidTaskId()` guard as Fix 2, plus a TypeError gap for non-string types.

### Changes needed

**Lines 18-26** — null taskId:
```
// BEFORE (stale):
expect(session.taskWorkflowStates.get(null as any)).toBe('coder_delegated');

// AFTER (correct — state was never set):
expect(session.taskWorkflowStates.get(null as any)).toBeUndefined();
```
The `.not.toThrow()` assertion remains correct (advanceTaskState silently returns).

**Lines 28-36** — undefined taskId:
```
// BEFORE (stale):
expect(session.taskWorkflowStates.get(undefined as any)).toBe('coder_delegated');

// AFTER (correct):
expect(session.taskWorkflowStates.get(undefined as any)).toBeUndefined();
```

**Lines 38-45** — empty string taskId:
```
// BEFORE (stale):
expect(session.taskWorkflowStates.get('')).toBe('coder_delegated');

// AFTER (correct):
expect(session.taskWorkflowStates.get('')).toBeUndefined();
```

**Lines 75-79** — number taskId:
This requires BOTH a test fix and a small implementation hardening:

**Implementation change** (`src/state.ts`, `isValidTaskId()` at line ~706):
```
// BEFORE:
function isValidTaskId(taskId: string | null | undefined): boolean {
    if (taskId === null || taskId === undefined) {
        return false;
    }
    const trimmed = taskId.trim();
    return trimmed.length > 0;
}

// AFTER (add typeof guard before .trim()):
function isValidTaskId(taskId: string | null | undefined): boolean {
    if (taskId === null || taskId === undefined) {
        return false;
    }
    if (typeof taskId !== 'string') {
        return false;
    }
    const trimmed = taskId.trim();
    return trimmed.length > 0;
}
```

**Rationale:** This is the only implementation change in the entire fix plan. It aligns with the function's documented design philosophy of gracefully handling invalid inputs. The TypeScript signature says `string | null | undefined`, but runtime callers can pass `any`. The function already guards null/undefined — guarding non-string types is the same defensive pattern. Without this, `(123).trim()` throws a TypeError, which contradicts the function's "safely return false" contract.

**Test fix** (line ~75-79):
```
// BEFORE (stale):
expect(() => advanceTaskState(session, 123 as any, 'coder_delegated')).not.toThrow();

// AFTER (correct — now silently returns thanks to typeof guard):
expect(() => advanceTaskState(session, 123 as any, 'coder_delegated')).not.toThrow();
// Add: verify no state was set
expect(session.taskWorkflowStates.size).toBe(0);
```
The `.not.toThrow()` assertion becomes correct after the implementation fix. Add an assertion that no state was mutated.

**Lines 210-213** — empty string in getTaskState:
```
// BEFORE (stale):
expect(getTaskState(session, '')).toBe('coder_delegated');

// AFTER (correct):
expect(getTaskState(session, '')).toBe('idle');
```

---

## Fix 4: version-bump.test.ts — Hardcoded version string

**File:** `tests/unit/version-bump.test.ts`
**Root cause:** Version advanced from 6.22.19 → 6.41.0 across 19 releases with no automation to keep the test in sync.

### Changes needed

**Structural refactor** (not a simple version update). Rationale: updating to `6.41.0` fixes it today but recreates the same problem on the next release. There are no version bump scripts in the project — versions are managed externally.

```typescript
// BEFORE (stale):
describe('Version Bump Verification', () => {
  it('should have version set to 6.22.19', () => {
    expect(pkg.version).toBe('6.22.19')
  })

  it('should match semver format 6.22.19', () => {
    const semverRegex = /^\d+\.\d+\.\d+$/
    expect(pkg.version).toMatch(semverRegex)
    expect(pkg.version).toBe('6.22.19')
  })
})

// AFTER (resilient):
describe('Version Bump Verification', () => {
  it('should have a valid semver version', () => {
    const semverRegex = /^\d+\.\d+\.\d+$/
    expect(pkg.version).toMatch(semverRegex)
  })

  it('should have a non-empty version', () => {
    expect(pkg.version).toBeTruthy()
    expect(pkg.version.length).toBeGreaterThan(0)
  })
})
```

Remove all hardcoded version strings. The semver format check provides the meaningful validation.

---

## Fix 5: phase-complete-fix-adversarial.test.ts — Missing workingDirectory parameter

**File:** `tests/unit/adversarial/phase-complete-fix-adversarial.test.ts`
**Root cause:** `checkReviewerGate('1.1')` called without `workingDirectory`. The implementation uses `workingDirectory!` (non-null assertion) which passes `undefined` to `path.join()`, causing a TypeError caught as "corrupt evidence" → `blocked: true`.

### Changes needed

The fix is **test-side only**. Every production caller of `checkReviewerGate` passes `workingDirectory` explicitly. Adding a `process.cwd()` fallback to the implementation would mask bugs.

**All 6 `checkReviewerGate` calls in the first describe block** (lines ~28-175) need `tempDir` added as second argument:

| Line | Current call | Fixed call |
|------|-------------|-----------|
| ~40 | `checkReviewerGate('1.1')` | `checkReviewerGate('1.1', tempDir)` |
| ~60 | `checkReviewerGate('1.1')` | `checkReviewerGate('1.1', tempDir)` |
| ~93 | `checkReviewerGate('1.1')` | `checkReviewerGate('1.1', tempDir)` |
| ~119 | `checkReviewerGate('../../etc/passwd')` | `checkReviewerGate('../../etc/passwd', tempDir)` |
| ~136 | `checkReviewerGate('1.1')` | `checkReviewerGate('1.1', tempDir)` |
| ~168 | `checkReviewerGate('1.1')` | `checkReviewerGate('1.1', tempDir)` |

Also update the `checkReviewerGuard` helper (line ~179) to pass through `tempDir`:
```
// BEFORE:
const checkReviewerGuard = (taskId: string) => checkReviewerGate(taskId);

// AFTER:
const checkReviewerGuard = (taskId: string) => checkReviewerGate(taskId, tempDir);
```

Remove `process.chdir(tempDir)` / `process.chdir(originalCwd)` blocks from each test since they are no longer needed (the directory is passed explicitly, not via cwd). This also eliminates potential test pollution if a test fails before restoring cwd.

**Note:** Tests expecting `blocked: true` currently pass "by accident" because the TypeError from `path.join(undefined, ...)` gets caught as "corrupt evidence". After the fix, they will test their actual intended logic (malformed JSON, missing plan, etc.) rather than relying on an error side-effect.

---

## Fix 6: agent-audit-p2.test.ts — Critic prompt DRIFT-CHECK section removed

**File:** `tests/unit/agents/agent-audit-p2.test.ts`
**Root cause:** Commit 5d17521 refactored critic from monolithic prompt to role-based system. `### MODE: DRIFT-CHECK` moved from `PLAN_CRITIC_PROMPT` to standalone `PHASE_DRIFT_VERIFIER_PROMPT`.

### Changes needed

**X3 block (lines ~18-42):** Two of four tests are stale.

- "ANALYZE OUTPUT FORMAT is marked MANDATORY" (line ~27): Uses `indexOf('### MODE: DRIFT-CHECK')` as end boundary → returns -1 → empty substring. **Fix:** Use end-of-prompt as boundary instead: `prompt.substring(analyzeStart)` or find the next `###` heading.
- "DRIFT-CHECK OUTPUT FORMAT is marked MANDATORY" (line ~33): Tests entire prompt by accident. **Fix:** Replace with a test against `PHASE_DRIFT_VERIFIER_PROMPT` using `createCriticAgent('test-model', undefined, undefined, 'phase_drift_verifier')` or `createCriticDriftVerifierAgent('test-model')`.

**CR2 block (lines ~96-119):** Entire block needs rewrite. The new `PHASE_DRIFT_VERIFIER_PROMPT` uses a fundamentally different structure:

| Old concept (removed) | New concept in PHASE_DRIFT_VERIFIER_PROMPT |
|---|---|
| `COVERAGE %` formula | No quantitative formula — uses per-task rubric |
| `GOLD-PLATING %` formula | No quantitative formula |
| `ALIGNED` threshold | `ALIGNED` exists (line 249) |
| `MINOR_DRIFT` / `MAJOR_DRIFT` / `OFF_SPEC` | `VERIFIED` / `MISSING` / `DRIFTED` per-task verdicts |

**Fix:** Rewrite CR2 to test `PHASE_DRIFT_VERIFIER_PROMPT` content:
```typescript
describe('CR2: Phase drift verifier metrics', () => {
    const prompt = createCriticDriftVerifierAgent('test-model').config.prompt!;

    it('defines per-task verdict categories', () => {
        expect(prompt).toContain('VERIFIED');
        expect(prompt).toContain('MISSING');
        expect(prompt).toContain('DRIFTED');
    });

    it('defines phase-level verdict', () => {
        expect(prompt).toContain('APPROVED');
        expect(prompt).toContain('NEEDS_REVISION');
    });

    it('defines 4-axis rubric', () => {
        expect(prompt).toContain('File Change');
        expect(prompt).toContain('Spec Alignment');
        expect(prompt).toContain('Integrity');
        expect(prompt).toContain('Drift Detection');
    });
});
```

### Additional stale test files (discovered during investigation)

These share the same root cause and need the same fix pattern:

**`tests/unit/agents/critic-prompt.test.ts`** (lines ~232-365):
- 16+ tests in "MODE: DRIFT-CHECK -- verification" and "MODE: DRIFT-CHECK -- adversarial" blocks
- All use `prompt.split('### MODE: DRIFT-CHECK')[1]` which returns `undefined`
- **Fix:** Rewrite to test `PHASE_DRIFT_VERIFIER_PROMPT` via drift verifier role

**`tests/unit/agents/critic-driftcheck-rewritten.test.ts`** (entire file, 14 tests):
- Tests TRAJECTORY-LEVEL EVALUATION, FIRST-ERROR FOCUS, DEFAULT POSTURE: SKEPTICAL, etc.
- None of these concepts exist in the new prompt
- **Fix:** Complete rewrite against `PHASE_DRIFT_VERIFIER_PROMPT` 4-axis rubric

**`tests/unit/agents/critic-driftcheck-adversarial.test.ts`** (entire file, ~25 tests):
- Uses `extractSection(criticPrompt, 'DRIFT-CHECK')` which returns empty string
- All adversarial assumptions based on old monolithic prompt structure
- **Fix:** Complete rewrite targeting `PHASE_DRIFT_VERIFIER_PROMPT` section boundaries and injection vectors

**`tests/unit/agents/critic-sounding-board.adversarial.test.ts`** (partial):
- Section boundary tests reference `### MODE: DRIFT-CHECK` for ordering checks
- **Fix:** Remove DRIFT-CHECK references from ordering tests; test sounding board content against `sounding_board` role

---

## Implementation Change Summary

Only ONE implementation change is needed (everything else is test-side):

| File | Change | Rationale |
|------|--------|-----------|
| `src/state.ts` line ~706 | Add `if (typeof taskId !== 'string') return false;` in `isValidTaskId()` | Defensive hardening consistent with existing null/undefined guard. Prevents TypeError on `.trim()` for non-string runtime values. |

## Test Change Summary

| File | Stale assertions | Fix type |
|------|-----------------|----------|
| `tests/unit/state-rehydrate.test.ts` | 2 | Update evidence setup (remove reviewer gate) |
| `tests/unit/state-workflow-guard.adversarial.test.ts` | 2 | Update expectations to `'idle'` |
| `tests/unit/state.adversarial.test.ts` | 5 | Update expectations to `undefined`/`'idle'`; add size check |
| `tests/unit/version-bump.test.ts` | 2 | Structural refactor: remove hardcoded version, keep semver check |
| `tests/unit/adversarial/phase-complete-fix-adversarial.test.ts` | 6+ calls | Pass `tempDir` to all `checkReviewerGate` calls; remove `process.chdir` |
| `tests/unit/agents/agent-audit-p2.test.ts` | 6 | Rewrite X3 boundaries + CR2 against drift verifier role |
| `tests/unit/agents/critic-prompt.test.ts` | 16+ | Rewrite DRIFT-CHECK blocks against drift verifier role |
| `tests/unit/agents/critic-driftcheck-rewritten.test.ts` | 14 | Complete rewrite against PHASE_DRIFT_VERIFIER_PROMPT |
| `tests/unit/agents/critic-driftcheck-adversarial.test.ts` | ~25 | Complete rewrite against PHASE_DRIFT_VERIFIER_PROMPT |
| `tests/unit/agents/critic-sounding-board.adversarial.test.ts` | ~5 | Remove DRIFT-CHECK ordering refs |

## Execution Order

Fixes are independent and can be implemented in parallel, except:
- Fix 3 implementation change (`isValidTaskId` typeof guard) should land before Fix 3 test changes
- Fix 6 test rewrites for the 4 additional files should follow the same pattern established in agent-audit-p2.test.ts

## Risk Assessment

- **Low risk:** Fixes 1-5 are straightforward assertion updates with no behavioral changes
- **Medium risk:** Fix 6 requires rewriting ~60 test assertions against a new prompt structure — need to verify each assertion against actual `PHASE_DRIFT_VERIFIER_PROMPT` content
- **No production risk:** The only implementation change is a defensive guard that makes `isValidTaskId` return `false` for non-string types (previously threw TypeError) — this is strictly more graceful behavior

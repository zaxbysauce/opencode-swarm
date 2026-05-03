# Test Results

## Commands Run

### 1. Targeted mutation suite (affected files only)
```
bun test src/mutation/__tests__/engine.test.ts \
         src/mutation/__tests__/engine.adversarial.test.ts \
         src/mutation/__tests__/generator.test.ts \
         src/mutation/__tests__/gate.test.ts \
         src/mutation/__tests__/equivalence.test.ts
```
**Result: 110 pass, 0 fail** (56 tests before this PR → 110 after, +54 new tests)

### 2. Pre-existing failures baseline (unrelated to this PR)
```
bun test src/tools/__tests__/mutation-test.sourcefiles.test.ts \
         src/tools/mutation-test.security.test.ts \
         src/tools/__tests__/mutation-test.adversarial.test.ts
```
**With git stash (before my changes): 0 pass, 66 fail, 1 error**
**After my changes: same failures**
→ These failures are pre-existing and unrelated to this PR.

---

## New Regression Tests

### Bug 1 — generate_mutants timeout (generator.test.ts)

| # | Test | Result |
|---|------|--------|
| 16 | LLM prompt never resolves → timeout → returns `[]` | ✅ PASS (51ms) |
| 17 | LLM session.create never resolves → timeout → returns `[]` | ✅ PASS (51ms) |

Both tests use the `_internals.timeoutMs = 50` seam to exercise the timeout path
at 50ms instead of 90 000ms. The elapsed time confirms the deadline fires
(>40ms) without spinning until the 90s default.

### Bug 2 — git apply --ignore-whitespace (engine.adversarial.test.ts)

| # | Test | Result |
|---|------|--------|
| 1 | `buildGitApplyArgs` includes `--ignore-whitespace` | ✅ PASS |
| 2 | `buildGitApplyArgs` correct structure `apply ... -- <file>` | ✅ PASS |
| 3 | `buildGitRevertArgs` includes `--ignore-whitespace` | ✅ PASS |
| 4 | `buildGitRevertArgs` includes `-R` flag | ✅ PASS |
| 5 | `buildGitRevertArgs` correct structure `apply -R ... -- <file>` | ✅ PASS |
| 6 | `buildGitApplyArgs` handles Windows backslash path | ✅ PASS |
| 7 | `buildGitRevertArgs` handles Windows backslash path | ✅ PASS |

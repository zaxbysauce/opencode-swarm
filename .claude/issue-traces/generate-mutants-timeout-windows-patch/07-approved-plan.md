# Approved Plan

Critic verdict: **APPROVE** (see 06-critic-review.md)

---

## Changes

### 1. `src/mutation/generator.ts` — add bounded timeout to LLM calls

- Add import: `import { withTimeout } from '../utils/timeout.js';`
- Add constant: `const GENERATE_MUTANTS_TIMEOUT_MS = 90_000;`
- Wrap the body of the outer `try` block (session-create + session-prompt) with `withTimeout(...)`. On timeout the existing `catch` converts the error to `[]` and logs a warn.

### 2. `src/mutation/engine.ts` — add `--ignore-whitespace` to both `git apply` calls

- Line 104 apply: `['apply', '--ignore-whitespace', '--', patchFile]`
- Line 172 revert: `['apply', '-R', '--ignore-whitespace', '--', patchFile]`

### 3. `src/mutation/__tests__/generator.test.ts` — regression test for timeout path

- Mock `session.prompt` to return a never-resolving Promise.
- Patch `GENERATE_MUTANTS_TIMEOUT_MS` via `_internals` seam or DI to a short value (50ms).
- Assert `generateMutants` returns `[]` within ~200ms.

### 4. `src/mutation/__tests__/engine.adversarial.test.ts` — regression test for `--ignore-whitespace`

- Export `_gitApplyArgs` helper or expose via `_internals` seam to capture the actual git argument array.
- Assert `--ignore-whitespace` is present in both apply and revert calls.

---

## User Approval

- [ ] **Approved to implement**

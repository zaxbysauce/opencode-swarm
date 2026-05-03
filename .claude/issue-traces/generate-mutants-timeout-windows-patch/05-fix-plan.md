# Fix Plan

## Issue Summary
Two independent bugs surfaced from the same agent session:
1. `generate_mutants` hangs indefinitely when called in parallel (no LLM call timeout).
2. `mutation_test` returns 0% kill rate on Windows because `git apply` fails on CRLF/LF mismatch.

---

## Root Causes
See `04-root-cause.md` for full evidence chain.

---

## Fix Candidates

### Bug 1 — generate_mutants timeout

**Candidate A (Selected): Wrap entire LLM block with `withTimeout`**
- Import `withTimeout` from `../utils/timeout.js` (already exists, used in `src/index.ts`).
- Define `GENERATE_MUTANTS_TIMEOUT_MS = 90_000` (90 seconds — generous for an LLM JSON generation task, bounded to prevent infinite hang).
- Extract the session-create + prompt block into a named inner async function and race it against the timeout.
- On timeout, `withTimeout` throws; the existing outer `catch` catches it and returns `[]` (SKIP verdict).
- Cleanup (`ephemeralSessionId` deletion) already runs in the `finally` block and remains correct.

**Candidate B (Rejected): Add AbortController with timeout**
- More complex; the opencode SDK may not expose AbortController support. `withTimeout` is already the project idiom.

**Candidate C (Rejected): Set timeout only on `session.prompt` (not `session.create`)**
- `session.create` can also hang if the server is under load. Both calls must be covered.

---

### Bug 2 — git apply CRLF/LF mismatch

**Candidate A (Selected): Add `--ignore-whitespace` to both `git apply` calls**
- Apply: `['apply', '--ignore-whitespace', '--', patchFile]`
- Revert: `['apply', '-R', '--ignore-whitespace', '--', patchFile]`
- `--ignore-whitespace` (alias for `--whitespace=nowarn`) makes git ignore CRLF/LF differences in context lines during matching. It is idempotent on Unix/macOS (no behavioral change when files already use LF).
- Available in all git versions ≥ 1.8 (universally available).

**Candidate B (Rejected): Normalize patch content to CRLF on Windows**
- Requires runtime platform detection (`process.platform === 'win32'`) and string manipulation of the patch content. Fragile because git itself normalises line endings after `core.autocrlf` processing, so patching the diff text is the wrong layer.

**Candidate C (Rejected): Use `--whitespace=fix` instead**
- `--whitespace=fix` modifies patch application to fix trailing whitespace, not line endings. Wrong flag.

---

## Selected Fix

### File 1: `src/mutation/generator.ts`
- Add import: `import { withTimeout } from '../utils/timeout.js';`
- Add constant: `const GENERATE_MUTANTS_TIMEOUT_MS = 90_000;`
- Wrap the body of the existing outer `try` block — specifically the `session.create` + `session.prompt` calls — with `withTimeout(innerPromise, GENERATE_MUTANTS_TIMEOUT_MS, new Error('generateMutants: LLM call timed out'))`.
- The outer `catch` already maps any error to `[]` and `console.warn`; the timeout error flows through that path unchanged.

### File 2: `src/mutation/engine.ts`
- Line 104: change `['apply', '--', patchFile]` → `['apply', '--ignore-whitespace', '--', patchFile]`
- Line 172: change `['apply', '-R', '--', patchFile]` → `['apply', '-R', '--ignore-whitespace', '--', patchFile]`

---

## Exact Files Expected to Change
| File | Change |
|------|--------|
| `src/mutation/generator.ts` | +import, +constant, wrap LLM calls with withTimeout |
| `src/mutation/engine.ts` | Add `--ignore-whitespace` to 2 git apply invocations |
| `src/mutation/__tests__/generator.test.ts` | Add regression test: timeout path returns empty array |
| `src/mutation/__tests__/engine.adversarial.test.ts` | Add regression test: CRLF mismatch scenario |

---

## Edge Cases
- Timeout fires after session create but before prompt: `finally` block already calls `cleanup()` which does `client.session.delete` best-effort.
- `--ignore-whitespace` on a completely invalid patch (wrong file, wrong line): `git apply` still exits non-zero for semantic mismatch (correct — still `outcome: error`).
- Empty patch string from LLM: already handled by the LLM validation loop in `generator.ts`.
- Revert with `--ignore-whitespace` after a successful apply: idempotent and correct; revert must match the same context lines as apply.

## Test Plan
1. `generator.test.ts` — new test: mock `session.prompt` to never resolve; set GENERATE_MUTANTS_TIMEOUT_MS to 50ms; confirm returns `[]` within ~200ms.
2. `engine.adversarial.test.ts` — new test: simulate `git apply` failure with a mock that records the args; confirm `--ignore-whitespace` is present in both apply and revert calls.

Actually, since `executeMutation` uses `spawnSync` directly (hard dependency on git), we'll test by verifying the command array passed to `spawnSync` via DI or by reading the constant exported from the module. The simpler approach is to export a helper or test the argument array via a spy. However, following the project's pattern (no `mock.module` for complex cases), we'll verify via a thin `_internals` seam.

## Rollout / Risk / Rollback
- Risk: **Low**. Both changes are additive (flag to existing call, timeout wrapping an existing catch path).
- `--ignore-whitespace` is safe on Unix: no-op when files already use LF.
- `withTimeout` is safe: if the LLM responds within 90s (normal case), behaviour is unchanged.
- Rollback: revert commit.

## Unwired Functionality Checklist
- [ ] No new tool registration needed (no new tools)
- [ ] No config surface affected
- [ ] No public API or schema change
- [ ] No CLI change
- [ ] `src/tools/index.ts` unchanged (no new exports)
- [ ] `src/index.ts` unchanged (no plugin shape change)

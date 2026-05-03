### Root Cause

Two independent bugs in the mutation testing pipeline were identified from the agent session screenshot:

**Bug 1 — `generate_mutants` hangs when called in parallel**
`generateMutants()` in `src/mutation/generator.ts` (lines 82–123) awaited `client.session.create()` and `client.session.prompt()` with no deadline. When called as one of three parallel tool invocations, the OpenCode host exhausted its wall-clock budget and aborted the call before the JS `catch` could fire, leaving the tool stuck. Violates AGENTS.md Invariant #1 (plugin init must be fast, bounded, fail-open).

**Bug 2 — `mutation_test` patch application fails on Windows (0/5 kill rate)**
`executeMutation()` in `src/mutation/engine.ts` (lines 104 and 172) called `git apply` and `git apply -R` without the `--ignore-whitespace` flag. On Windows with `core.autocrlf=true` (the default), working-tree files use CRLF line endings while LLM-generated patches always use LF. Git's context-line matching fails, every patch returns `outcome: error`, and the kill rate is 0%. Violates AGENTS.md Invariant #2 (runtime portability — macOS, Windows, Linux).

### Fix

- **`src/mutation/generator.ts`** — Import `withTimeout` from `../utils/timeout.js`. Add `GENERATE_MUTANTS_TIMEOUT_MS = 90_000`. Export `_internals = { timeoutMs }` DI seam for tests. Wrap the entire session-create + prompt IIFE with `withTimeout(..., _internals.timeoutMs, ...)`. The existing outer `catch` converts the timeout error to `[]` (SKIP verdict) and logs a warning — no behaviour change on the happy path.

- **`src/mutation/engine.ts`** — Extract two exported pure functions `buildGitApplyArgs(patchFile)` and `buildGitRevertArgs(patchFile)` that include `--ignore-whitespace`. Replace the two inline `git apply` argument arrays with calls to these helpers. No-op on macOS/Linux; fixes CRLF/LF mismatch on Windows.

### Tests

- Regression test: `bun test src/mutation/__tests__/generator.test.ts` → **17 pass** (2 new: timeout path via `_internals.timeoutMs = 50`)
- Regression test: `bun test src/mutation/__tests__/engine.adversarial.test.ts` → **23 pass** (7 new: `buildGitApplyArgs` / `buildGitRevertArgs` structure + `--ignore-whitespace` + Windows path)
- Full targeted suite: `bun test src/mutation/__tests__/` → **110 pass, 0 fail**
- Pre-existing unrelated failures: `src/tools/__tests__/mutation-test.sourcefiles.test.ts` (66 fail) — confirmed present before this PR with `git stash`.

### Regression Protection

- `generator.test.ts` tests 16–17: `session.prompt` / `session.create` never-resolving mock with 50ms synthetic timeout. Confirms `[]` is returned in <2s.
- `engine.adversarial.test.ts` tests (git apply builders section): verify `--ignore-whitespace` is present in both apply and revert arg arrays. Verify Windows backslash path is passed through unchanged.

### Risk and Rollback

- Risk level: **low** — additive flag, bounded timeout wrapping existing error path.
- `--ignore-whitespace` is a no-op on LF-native systems (macOS, Linux).
- `withTimeout` race resolves at the LLM response time on the happy path; 90s ceiling only fires on genuine hangs.
- Rollback: revert this single commit.
- Residual risk: none. Pre-existing `git apply` failures for other reasons (wrong base, malformed patch) continue to surface correctly as `outcome: error`.

### Invariant Audit

- 1 (plugin init): **touched** — `withTimeout` added to `generateMutants`; bounded, fail-open, non-blocking.
- 2 (runtime portability): **touched** — `--ignore-whitespace` ensures Windows CRLF compatibility; no `bun:` imports introduced.
- 3 (subprocesses): **touched** — `buildGitApplyArgs`/`buildGitRevertArgs` helpers verified; `timeout`, `stdio: pipe`, array-form spawn unchanged.
- 4–12: **not touched** — no .swarm, plan, tool registration, session state, guardrails, chat, or cache changes.

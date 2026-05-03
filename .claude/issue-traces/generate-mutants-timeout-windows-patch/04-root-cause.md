# Root Cause

---

## Bug 1 — generate_mutants hangs without a timeout

### Summary
`generateMutants()` in `src/mutation/generator.ts` performs two sequential async LLM calls — `client.session.create()` (line 82) and `client.session.prompt()` (line 115) — with no timeout, deadline, or AbortController. When invoked in parallel with other long-running tool calls, the OpenCode plugin host exhausts its wall-clock budget and aborts the call, leaving the Promise unresolved. The outer `try/catch` in `generate_mutants.execute` never fires because the abort happens above the JS layer.

### Exact Location
- File: `src/mutation/generator.ts`
- Symbol: `generateMutants`
- Lines: 82–123 (session create + prompt, both bare `await`)

### Broken Contract
AGENTS.md Invariant #1 requires: "Any init-path environmental work must be wrapped in `withTimeout(...)`". `generateMutants` is called from within a tool execute handler and constitutes environmental LLM work. It violates this contract by having no bounded deadline.

### Triggering Conditions
- `generate_mutants` is called as one of ≥2 parallel tool calls in the same tool-call block.
- The combined wall-clock time of the parallel calls exceeds the host's per-call timeout.
- The LLM session creation or prompt takes longer than expected (e.g., model under load).

### Evidence Chain
1. Image: `generate_mutants` shown as "Tool execution aborted" while two sibling calls completed.
2. `src/mutation/generator.ts:82`: `await client.session.create(...)` — no timeout.
3. `src/mutation/generator.ts:115`: `await client.session.prompt(...)` — no timeout.
4. `src/utils/timeout.ts`: `withTimeout` exists and is already used in `src/index.ts` for exactly this pattern.
5. No test in `src/mutation/__tests__/generator.test.ts` covers the timeout path.

---

## Bug 2 — mutation_test patch application fails on Windows (CRLF/LF mismatch)

### Summary
`executeMutation()` in `src/mutation/engine.ts` writes LLM-generated patches to disk and applies them with `git apply` (line 104) and reverts with `git apply -R` (line 172). Neither call includes `--ignore-whitespace`. On Windows with the default `core.autocrlf=true` setting, files in the working tree are checked out with CRLF line endings. LLM patches always use LF (the LLM prompt instructs unified-diff format). Git's patch application matches context lines byte-for-byte; a LF context line never matches a CRLF line in the working tree. Every `git apply` call exits with a non-zero status, every mutation returns `outcome: 'error'`, and the kill rate is 0/5 = 0%.

### Exact Location
- File: `src/mutation/engine.ts`
- Symbol: `executeMutation`
- Lines: 104 (apply) and 172 (revert)

### Broken Contract
AGENTS.md Invariant #2 requires first-class Windows support. Invariant #3 requires subprocess calls to be portable. Using `git apply` without `--ignore-whitespace` is not portable to environments where `core.autocrlf=true` is active, which is the Windows default.

### Triggering Conditions
- Running on Windows with `core.autocrlf=true` (default).
- OR any platform where the repository has CRLF line endings in tracked files.
- LLM-generated patches always carry LF context lines.

### Evidence Chain
1. Image: "0 killed, 0 survived (patch application failed)" and "known Windows patch application issue".
2. `src/mutation/engine.ts:104`: `['apply', '--', patchFile]` — no whitespace flag.
3. `src/mutation/engine.ts:172`: `['apply', '-R', '--', patchFile]` — no whitespace flag.
4. `git apply --help`: `--ignore-whitespace` / `--ignore-space-change` makes git ignore line-ending differences when matching context lines.
5. No test covers the CRLF mismatch scenario.

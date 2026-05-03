# Localization Log

## Candidates Explored

| File | Symbol | Relevance | Confidence | Verdict |
|------|---------|-----------|-----------|---------|
| `src/mutation/generator.ts` | `generateMutants` | No timeout on LLM calls | High | **Root cause (Bug 1)** |
| `src/mutation/engine.ts` | `executeMutation` | No `--ignore-whitespace` on `git apply` | High | **Root cause (Bug 2)** |
| `src/tools/generate-mutants.ts` | `generate_mutants.execute` | Calls `generateMutants`; has try/catch | Medium | Not root cause — symptom only |
| `src/tools/mutation-test.ts` | `mutation_test.execute` | Calls `executeMutationSuite` | Low | Not root cause — passes through |
| `src/utils/timeout.ts` | `withTimeout` | Existing bounded-timeout utility | — | Fix vehicle for Bug 1 |

---

## Hypothesis Log

### H1: generate_mutants has no timeout on LLM calls
The bug is in `src/mutation/generator.ts:generateMutants` because the `client.session.create()` and `client.session.prompt()` calls are awaited without any deadline, causing the function to hang indefinitely when the plugin host exceeds its wall-clock limit.

- **Confirm if**: no `withTimeout` import or usage found in generator.ts
- **Falsify if**: a timeout wrapper or AbortController exists
- **Evidence**: `grep "withTimeout" src/mutation/generator.ts` → no results. Lines 82 and 115 are bare `await` with no deadline.
- **Verdict**: ✅ CONFIRMED

### H2: git apply fails on Windows due to CRLF/LF mismatch
The bug is in `src/mutation/engine.ts:executeMutation` because `git apply` is called without `--ignore-whitespace`. On Windows, `core.autocrlf=true` causes checked-out files to have CRLF line endings, while LLM patches always use LF. Context-line matching fails, `git apply` exits non-zero, every mutation is marked `error`, and kill rate = 0.

- **Confirm if**: no `--ignore-whitespace` in either `git apply` call; CRLF explanation is consistent with "all 5 error"
- **Falsify if**: `--ignore-whitespace` already present, or some other normalization exists
- **Evidence**: Lines 104 and 172 of engine.ts: `['apply', '--', patchFile]` and `['apply', '-R', '--', patchFile]` — no whitespace flag. Image confirms "known Windows patch application issue".
- **Verdict**: ✅ CONFIRMED

### H3 (ruled out): stdin pipe causing hang under Bun on Windows
AGENTS.md warns about `stdin: 'pipe'` under Bun causing hangs. However, both `git apply` invocations use `spawnSync` (synchronous), not `spawn` (async). For `spawnSync`, stdin pipe completion is bounded by the process exit; no infinite wait is possible. This hypothesis does not explain "Tool execution aborted" for `generate_mutants` (which uses async API calls, not subprocesses).

- **Verdict**: ❌ RULED OUT for generate_mutants; N/A for spawnSync calls in engine.ts

### H4 (ruled out): Windows path backslash breaks git apply argument
`path.join(workingDir, ...)` on Windows returns a backslash-delimited path. Git for Windows handles both forward and backward slashes in CLI arguments. This might cause edge-case failures but does not explain 100% patch failure rate across all 5 mutants.

- **Verdict**: ❌ NOT primary root cause (CRLF mismatch is more parsimonious)

---

## Files Read
- `src/mutation/generator.ts` (full)
- `src/mutation/engine.ts` (full)
- `src/tools/generate-mutants.ts` (full)
- `src/tools/mutation-test.ts` (full)
- `src/utils/timeout.ts` (full)
- `src/mutation/__tests__/generator.test.ts` (full)
- `src/mutation/__tests__/engine.test.ts` (full)
- `src/mutation/__tests__/engine.adversarial.test.ts` (partial)
- `AGENTS.md` (invariants #1, #2, #3)

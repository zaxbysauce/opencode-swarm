# Issue Summary

## Source
Image screenshot from an active agent session (no GitHub issue number).

## Observed Behaviour
The agent dispatched three parallel tool calls:
1. `mega_critic_drift_verifier` ✅ completed and returned
2. `mega_critic_hallucination_verifier` ✅ completed and returned
3. `generate_mutants` ❌ interrupted/timed out — "Tool execution aborted"

On a subsequent solo call, `generate_mutants` succeeded and returned 5 mutant patches.

Then `mutation_test [pass_threshold=0.8, warn_threshold=0.6]` was called:
- Result: **0 killed, 0 survived** (patch application failed)
- Agent observed: "known Windows patch application issue"
- Agent wrote `write_mutation_evidence` with `verdict=WARN, killRate=0, adjustedKillRate=0`

## Expected Behaviour
- `generate_mutants` should complete (or fail gracefully with SKIP) whether called alone or in parallel. It must not hang indefinitely.
- `mutation_test` should successfully apply LLM-generated patches and produce a meaningful kill rate on all three supported platforms: **macOS, Windows, and Linux**.

## Error Messages
- `generate_mutants`: "Tool execution aborted" (host-level timeout/abort)
- `mutation_test`: all 5 mutations → `outcome: 'error'`, `git apply` returns non-zero exit

## Reproduction Steps
1. Call `generate_mutants` as a third parallel tool call alongside two other long-running calls.
2. Observe "Tool execution aborted" — the LLM prompt call has no deadline.
3. Call `mutation_test` with patches whose context lines use LF while source files on Windows have CRLF (due to `core.autocrlf=true`).
4. Observe 0/5 kill rate because every `git apply` fails.

## Environment
- Runtime: Bun + Node-ESM (cross-platform plugin)
- Platforms affected: Windows (Bug 2 primary), all platforms (Bug 1)
- Files involved: `src/mutation/generator.ts`, `src/mutation/engine.ts`

## Acceptance Criteria
- `generateMutants` must abort cleanly after a bounded timeout and return SKIP rather than hanging.
- `git apply` in `executeMutation` must succeed on Windows when LLM patches use LF and working-tree files use CRLF.
- All existing tests must remain green.
- New regression tests must encode each scenario.

## Ambiguity List
- None blocking. Both bugs are well-evidenced from the image and code review.

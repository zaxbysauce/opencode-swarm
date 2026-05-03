# Issue Trace State

## ID
generate-mutants-timeout-windows-patch

## Current Phase
Phase 3 — Fix Plan (Critic review in progress)

## Completed Gates
- [x] Phase 0: trace directory created, worktree clean, branch confirmed
- [x] Phase 1: issue intake complete, two bugs identified, reproduction confirmed (baseline tests green)
- [x] Phase 2: root cause localized to exact file/line with code evidence
- [ ] Phase 3: fix plan written, critic review pending

## Active Hypotheses
(Resolved — both root causes confirmed)

## Selected Fix Candidates
1. `src/mutation/generator.ts` — wrap LLM calls with `withTimeout` (90 000 ms)
2. `src/mutation/engine.ts` — add `--ignore-whitespace` to both `git apply` invocations

## Unresolved Risks
- None material for macOS/Linux; Windows CI is not exercised by this sandbox

## Next Action
Implement fixes, run tests, validate, write PR body

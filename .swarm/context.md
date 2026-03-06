# Context
Swarm: mega

## Current State
- All 5 phases of Post-Audit Remediation are COMPLETE.
- PR #59 (phase_complete reliability + save-plan hardening) merged → released as v6.19.5.
- PR #61 (Phase 1-4 tool hardening + Windows CI native-dep removal) created, awaiting CI and merge.
- Working tree is clean on branch fix/windows-ci-native-deps.

## Decisions
- save_plan no longer falls back to process.cwd() when target workspace inputs are missing.
- savePlan now fails fast on null/undefined/non-string/blank directory input before filesystem writes.
- Adversarial test coverage was updated to use explicit test workspaces to avoid repository-root .swarm mutation.
- tree-sitter-dart, tree-sitter-kotlin, tree-sitter-swift removed from devDependencies (WASM-only usage, no native addon needed).
- Two-commit PR strategy: implementation commit + CI fix commit for clean bisect history.

## Known Risks
- phase_complete agent-dispatch tracking is cross-session — the tool may report missing agents when work was done in prior sessions. This is a known limitation documented in Phase 5 retrospective.

## Phase 5 Retrospective
- phase_number: 5 | verdict: pass | coder_revisions: 0 | reviewer_rejections: 0 | test_failures: 0 | security_findings: 0 | task_count: 9 | task_complexity: medium
- lessons_learned: (1) Verify artifact existence before listing cleanup targets in plan tasks. (2) Always fetch origin/main at session start — PRs merge and release-please bumps happen asynchronously. (3) Uncommitted working-tree changes accumulate across sessions — git status check is essential. (4) Two-commit strategy keeps PR history readable. (5) phase_complete cross-session tracking is a known limitation — document rather than fight it.

## Phase Metrics
- phase_number: 3 | total_tool_calls: 0 | coder_revisions: 0 | reviewer_rejections: 0 | test_failures: 0 | security_findings: 0 | integration_issues: 0 | task_count: 2 | task_complexity: low
- phase_number: 4 | total_tool_calls: 0 | coder_revisions: 4 | reviewer_rejections: 3 | test_failures: 1 | security_findings: 0 | integration_issues: 1 | task_count: 6 | task_complexity: medium
- top_rejection_reasons: assertion mismatch with deterministic error source, contract-test expectation drift, environment-dependent UNC/root success assumptions
- lessons_learned: synchronize tests with validation contract changes, prefer deterministic validation assertions over permission-dependent outcomes
- reset_status: phase metrics reset after retrospective evidence write

## Knowledge Retention: Release Management, Lint, and CI Fixes for Future Swarms
- Retrospective discipline: Always write a retrospective bundle prior to phase_complete to capture lessons and metrics for future reuse.
- Evidence schema discipline: Align evidence payloads to a stable contract (schema_version, task_id, timestamps, entries; per-task evidence as needed).
- CI hygiene patterns: Track common CI failure modes (lint/test failures, dependency changes) and document fixes in the retrospective for cross-project reuse.
- Release pattern: Separate implementation commits from CI-fix commits; use a two-commit flow to preserve history and ease bisecting.
- Tooling guardrails: Normalize lint keys (noUnusedImports, noControlCharactersInRegex) and ensure code changes reflect quick, traceable fixes.
- Audit trail: Include PR references and commit SHAs in retro entries for traceability.

## Agent Activity

| Tool | Calls | Success | Failed | Avg Duration |
|------|-------|---------|--------|--------------|
| read | 886 | 886 | 0 | 6ms |
| bash | 738 | 738 | 0 | 537ms |
| edit | 267 | 267 | 0 | 1894ms |
| task | 208 | 208 | 0 | 133805ms |
| grep | 156 | 156 | 0 | 118ms |
| glob | 134 | 134 | 0 | 23ms |
| retrieve_summary | 56 | 56 | 0 | 3ms |
| write | 44 | 44 | 0 | 1551ms |
| lint | 36 | 36 | 0 | 2799ms |
| pre_check_batch | 27 | 27 | 0 | 2608ms |
| todowrite | 21 | 21 | 0 | 3ms |
| test_runner | 14 | 14 | 0 | 28110ms |
| imports | 12 | 12 | 0 | 4ms |
| save_plan | 11 | 11 | 0 | 6ms |
| diff | 11 | 11 | 0 | 18ms |
| phase_complete | 9 | 9 | 0 | 7ms |
| invalid | 4 | 4 | 0 | 1ms |
| todo_extract | 3 | 3 | 0 | 2ms |
| evidence_check | 2 | 2 | 0 | 2ms |
| apply_patch | 2 | 2 | 0 | 113ms |
| secretscan | 2 | 2 | 0 | 135ms |
| symbols | 1 | 1 | 0 | 0ms |

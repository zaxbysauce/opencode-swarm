# Context
Swarm: mega

## Project Overview
- Name: opencode-swarm v6.16.1 — Spec Lifecycle Fixes + Issue Cleanup
- Type: TypeScript/Bun OpenCode plugin — architect prompt improvements + guardrails fix
- Goals: Fix RESUME overriding explicit spec commands; add stale spec detection; add spec archival; fix plan ingestion spec gate; fix Issue #17 guardrail false positive; investigate/close Issue #22
- Baseline: v6.16.0 (multi-language support, shipped)
- Target Release: v6.16.1
- Source Plan: v6.16.1-spec-lifecycle-fixes.md

## Release Workflow (MANDATORY — read before every version bump)

### The Two-File Rule
1. **`docs/releases/v{version}.md`** — Write detailed release notes HERE. The `update-release-notes` CI job automatically calls `gh release edit` with this file after release-please creates the release tag. See `v6.15.0.md` as the reference example.
2. **`CHANGELOG.md`** — ⚠️ NEVER write to this manually. release-please owns it entirely and will always prepend its own auto-generated entry on the next push. Any manual entry creates a duplicate.

### Correct release checklist (per version bump)
- [ ] Create `docs/releases/v{version}.md` with full feature descriptions (follow v6.15.0.md pattern)
- [ ] Commit it alongside the implementation work BEFORE pushing
- [ ] Use `feat:` conventional commit — release-please picks up the version bump
- [ ] Do NOT edit CHANGELOG.md

## Key Problems Being Solved

| # | Bug / Gap | Fix | Files |
|---|-----------|-----|-------|
| 1 | RESUME unconditionally wins over SPECIFY — explicit /swarm specify blocked on projects with incomplete plan.md | Explicit intent override as priority 0 in mode detection | src/agents/architect.ts |
| 2 | No stale spec detection | Scope comparison between spec.md and plan.md; soft offer to replace | src/agents/architect.ts |
| 3 | No spec archival | Archive to .swarm/spec-archive/spec-v{version}.md before replacement | src/agents/architect.ts |
| 4 | Plan ingestion without spec gate incomplete | Soft gate on plan ingestion path | src/agents/architect.ts |
| 5 | Issue #17 — architect direct edit false positive | Suppress guardrail warning during active coder delegation | src/hooks/guardrails.ts |
| 6 | Issue #22 — placeholder plan content | Investigate; fix if confirmed broken in v6.16 | src/agents/architect.ts, src/tools/save-plan.ts |

## Decisions

### Phase 0 (Pending — to be filled after investigation)
- Issue #22 verdict: pending (Task 0.3)
- Guardrails delegation state mechanism: pending (Task 0.2)

### Architecture
- Spec lifecycle fixes are ALL in the ARCHITECT_PROMPT string in src/agents/architect.ts (no new code files)
- Guardrails fix is delegation-awareness ONLY in toolBefore() — isSourceCodePath() must not be touched
- Task 4.1 creates docs/releases/v6.16.1.md (NOT CHANGELOG.md — release-please owns CHANGELOG)

### Files That Will Change
| File | Action | Tasks |
|------|--------|-------|
| src/agents/architect.ts | Modify ARCHITECT_PROMPT (mode detection + spec lifecycle) | 1.1, 1.2, 1.3, 1.4, 1.5 (conditional) |
| src/hooks/guardrails.ts | Add delegation-awareness to toolBefore() | 2.1 |
| tests/unit/agents/architect-v6-prompt.test.ts | Add new tests | 3.1, 3.2, 3.3 |
| tests/unit/hooks/guardrails.test.ts | Add new tests (create if needed) | 3.4 |
| docs/releases/v6.16.1.md | Create release notes | 4.1 |
| package.json | Version 6.16.1 | 4.2 |

### Files That Will NOT Change
- src/lang/ (all language profile files — v6.16 work, not touched)
- src/build/discovery.ts
- src/tools/ (all tool files — v6.16 work, not touched)
- src/hooks/system-enhancer.ts
- CHANGELOG.md (release-please owns it)

## SME Cache

### architect-prompt
- All spec lifecycle behaviors are purely prompt-level changes in ARCHITECT_PROMPT — no new code modules needed
- Stale spec detection is intentionally heuristic (compare headings) — false positives are acceptable because gate is soft
- Intent override must be keyword-specific to avoid false positives on conversational "clarify" usage

### guardrails
- delegation-tracker.ts or state.ts tracks active delegations — check these in Task 0.2 before implementing
- isSourceCodePath() must not change — only the warning trigger path
- Fix must not create false negatives (suppress real architect self-coding)

## Patterns
- Test framework: vitest (NOT jest/mocha/bun:test) — use bun test to run vitest files
- Architect prompt changes: edit ARCHITECT_PROMPT string directly in src/agents/architect.ts
- Evidence files: write to .swarm/evidence/ as .md files
- QA gate for prompt-only tasks: pre_check_batch may report false positives on Windows absolute paths — use individual tools if needed

## Phase Metrics (reset at phase start)
- phase_number: 0
- total_tool_calls: 0
- coder_revisions: 0
- reviewer_rejections: 0
- test_failures: 0
- security_findings: 0
- integration_issues: 0

## Project Governance (from project-instructions.md — check if exists)
- No governance file found in this workspace; using default swarm rules

## Agent Activity

| Tool | Calls | Success | Failed | Avg Duration |
|------|-------|---------|--------|--------------|
| read | 265 | 265 | 0 | 5ms |
| bash | 201 | 201 | 0 | 179ms |
| edit | 65 | 65 | 0 | 837ms |
| task | 65 | 65 | 0 | 55502ms |
| grep | 60 | 60 | 0 | 156ms |
| glob | 38 | 38 | 0 | 1960ms |
| retrieve_summary | 36 | 36 | 0 | 3ms |
| write | 24 | 24 | 0 | 389ms |
| todowrite | 21 | 21 | 0 | 30ms |
| save_plan | 6 | 6 | 0 | 14ms |
| invalid | 5 | 5 | 0 | 1ms |
| diff | 3 | 3 | 0 | 19ms |
| pre_check_batch | 3 | 3 | 0 | 1ms |
| secretscan | 3 | 3 | 0 | 6ms |
| lint | 3 | 3 | 0 | 3036ms |
| test_runner | 2 | 2 | 0 | 40877ms |
| mystatus | 1 | 1 | 0 | 1280ms |

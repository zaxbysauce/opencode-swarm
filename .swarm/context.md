# Context
Swarm: mega

## Project Overview
- Name: opencode-swarm v6.13.3 — Retrospective Enforcement & Memory Improvements
- Type: TypeScript/Bun OpenCode plugin with tool, hook, and document automation
- Goals: make retrospective writing a hard gate before phase_complete; fix system-enhancer retrospective injection (two-tier phase-scoped + cross-project, always-inject, dedup Path A/B); add user_directives + approaches_tried to evidence schema; add PRE-PHASE BRIEFING + RETROSPECTIVE GATE to architect prompt; add PHASE COUNT GUIDANCE; document recommended .swarm/ memory architecture.
- Baseline: v6.13.2 (commit cf89f9b)

## Decisions
- `phase_complete` must now check for a valid retrospective evidence bundle (`retro-{N}/evidence.json`, `type=retrospective`, `phase_number===N`, `verdict!='fail'`) before proceeding to delegation checks.
- System-enhancer retrospective injection uses TWO-TIER retrieval: Tier 1 = same-plan previous phase direct lookup; Tier 2 = cross-project historical for Phase 1 / single-phase projects.
- The `reviewer_rejections > 2` gate on retro injection is REMOVED — always inject when a retro exists.
- Path A and Path B retrospective injection code in system-enhancer.ts must be DEDUPLICATED into a single shared function.
- `user_directives` (category + scope) and `approaches_tried` (result + abandoned_reason) are new optional fields on RetrospectiveEvidenceSchema — backward compatible with default([]).
- `plan_id` in evidence metadata (via extensible z.record) is the convention for cross-project filtering in Tier 2 retrieval.
- Coder agent receives condensed Tier 1 lessons_learned only (not Tier 2 cross-project history).

## SME Cache
### security
- Validate `.swarm/events.jsonl` using `validateSwarmPath` before appending newline-delimited JSON to keep the event log parseable and safe.
- Always normalize agent names with `stripKnownSwarmPrefix` when checking required agents.
- Prevent summary loops by defaulting `exempt_tools` to `['retrieve_summary','task']`.

### evidence-system
- Evidence bundles are stored at `.swarm/evidence/{task-id}/evidence.json` (EvidenceBundle schema with `entries: Evidence[]`).
- Retro convention: `task_id = 'retro-{N}'` stored at `evidence/retro-{N}/evidence.json` — use `loadEvidence(directory, 'retro-{N}')`.
- The existing `v6.9.0-retrospective.json` is a FLAT file directly in evidence/ (not a bundle) — the old approach.
- Current system-enhancer retro injection reads flat `.json` files in evidence/ with `readdirSync` — BROKEN for new bundle structure.

### system-enhancer
- Tier 1 direct lookup: `loadEvidence(directory, 'retro-{N-1}')` then check entries for type=retrospective.
- Tier 2 fallback: scan `listEvidenceTaskIds(directory)`, filter for `retro-*` IDs, load each, sort by timestamp desc, take 3, filter by age+plan_id.
- Structured injection format: Tier 1 uses `## Previous Phase Retrospective (Phase N)` block; Tier 2 uses `## Historical Lessons` block.
- Combined injection cap: 1600 chars (Tier 1 first, Tier 2 below).

## Patterns
- Configure new tooling via `PluginConfigSchema`, keeping defaults backward-compatible so `parse({})` does not break existing users.
- Tests that touch filesystem helpers always use `createIsolatedTestEnv` to keep sandboxed directories clean.
- Documentation updates must be inserted without rearranging existing sections or rewriting unrelated semantic content.

## Stage Status
- Stage 0 (Baseline Recon): COMPLETE
- Stage 1 (Plan): COMPLETE (critic-approved at 90% confidence, r3)
- Phase 1 (Retrospective Required Gate): COMPLETE
- Phase 2 (Pre-Phase Retrospective Read): COMPLETE
- Phase 3 (Schema & Memory Improvements): COMPLETE
- Phase 4 (Integration Testing & Release): COMPLETE

## Lessons Learned (from v6.13.2 + prior sessions)
- 5 reviewer rejections in v6.13.2: config schema not aligned with existing patterns, dependency graph incorrect/confusing
- Always use `createIsolatedTestEnv` — raw mkdtemp leaks temp dirs on Windows
- Pre-existing test failures on Windows (lint.test.ts path issues) — document before starting
- `stripKnownSwarmPrefix` normalization required everywhere agent names are compared
- The system-enhancer `reviewer_rejections > 2` gate is the ROOT CAUSE of retros being silently discarded — remove it entirely
- Sonnet 4.6 admitted never reading retrospective files before starting phases — this entire version addresses that
- Coder agents must not edit .swarm/plan.json — they confuse it with test fixture plan.json files in tests/integration/; write .swarm/ state files directly (architect tool)

## Phase Metrics (Phase 4 — COMPLETE)
- phase_number: 4
- total_tool_calls: 45
- coder_revisions: 2
- reviewer_rejections: 0
- test_failures: 0
- security_findings: 0
- integration_issues: 1

## Agent Activity

| Tool | Calls | Success | Failed | Avg Duration |
|------|-------|---------|--------|--------------|
| read | 1476 | 1476 | 0 | 7ms |
| bash | 1095 | 1095 | 0 | 1970ms |
| edit | 472 | 472 | 0 | 1326ms |
| grep | 368 | 368 | 0 | 49ms |
| task | 174 | 174 | 0 | 173258ms |
| write | 97 | 97 | 0 | 2604ms |
| glob | 91 | 91 | 0 | 18ms |
| retrieve_summary | 77 | 77 | 0 | 4ms |
| test_runner | 45 | 45 | 0 | 2779ms |
| todowrite | 30 | 30 | 0 | 6ms |
| lint | 30 | 30 | 0 | 2839ms |
| pre_check_batch | 22 | 22 | 0 | 1963ms |
| secretscan | 12 | 12 | 0 | 26ms |
| diff | 11 | 11 | 0 | 11ms |
| imports | 8 | 8 | 0 | 6ms |
| checkpoint | 7 | 7 | 0 | 5ms |
| invalid | 5 | 5 | 0 | 3ms |
| evidence_check | 1 | 1 | 0 | 2ms |
| extract_code_blocks | 1 | 1 | 0 | 2ms |
| mystatus | 1 | 1 | 0 | 902ms |

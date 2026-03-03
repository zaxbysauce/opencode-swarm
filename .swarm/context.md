# Context
Swarm: mega

## Project Overview
- Name: opencode-swarm v6.17 — Two-Tier Cross-Project Knowledge Base
- Type: TypeScript/Bun OpenCode plugin — persistent knowledge system with per-project (swarm) and cross-project (hive) tiers
- Goals: Capture lessons across sessions; auto-promote lessons through candidate→established→promoted→hive lifecycle; inject hive/swarm learnings into architect context; quarantine bad rules; dark-matter co-change NPMI analysis; QA gate hardening
- Baseline: v6.16.1 (spec lifecycle fixes, shipped)
- Target Release: v6.17.0
- Source Plan: v6.17-two-tier-knowledge-base-v6.md
- Commit Prefix: feat: (minor release — new user-facing features)

## Release Workflow (MANDATORY — read before every version bump)

### The Two-File Rule
1. **`docs/releases/v{version}.md`** — Write detailed release notes HERE. The `update-release-notes` CI job automatically calls `gh release edit` with this file after release-please creates the release tag. See `v6.15.0.md` as the reference example.
2. **`CHANGELOG.md`** — ⚠️ NEVER write to this manually. release-please owns it entirely and will always prepend its own auto-generated entry on the next push. Any manual entry creates a duplicate.

### Correct release checklist (per version bump)
- [ ] Create `docs/releases/v{version}.md` with full feature descriptions (follow v6.15.0.md pattern)
- [ ] Commit it alongside the implementation work BEFORE pushing
- [ ] Choose commit prefix based on semver intent — see Conventional Commit → Semver table below
- [ ] Do NOT edit CHANGELOG.md

### ⚠️ Conventional Commit → Semver Mapping (release-please)

| Commit prefix | Version bump | Example result | Use when |
|---------------|-------------|----------------|----------|
| `fix:` | **patch** (x.y.Z) | 6.16.0 → 6.16.1 | Bug fixes, prompt tweaks, verification-only, doc patches |
| `feat:` | **minor** (x.Y.0) | 6.16.0 → 6.17.0 | New user-facing features, new modes, new commands |
| `feat!:` or `BREAKING CHANGE:` | **major** (X.0.0) | 6.16.0 → 7.0.0 | Breaking API/behavior changes |

**RULE:** v6.17.0 is a minor release — commit prefix MUST be `feat:`.

## Architecture Decisions

### Core Design
- inferTags() lives in knowledge-store.ts (NOT curator) — avoids curator→validator→inferTags circular dependency
- proper-lockfile used ONLY in rewriteKnowledge() for full-file rewrites; appendKnowledge() uses OS-level atomic append
- resolveHiveKnowledgePath() is inline 15-line resolver — NO env-paths dependency
  - win32: LOCALAPPDATA/opencode-swarm/Data/shared-learnings.jsonl
  - darwin: ~/Library/Application Support/opencode-swarm/shared-learnings.jsonl
  - linux: XDG_DATA_HOME or ~/.local/share/opencode-swarm/shared-learnings.jsonl
- /swarm knowledge quarantine and restore registered as stubs in Phase 6, replaced in Phase 9 (task 9.12)
- Task 8.1 depends on [1.2, 1.3] only — curator (3.1) not needed for co-change analyzer

### Files Being Created
| File | Phase |
|------|-------|
| src/hooks/knowledge-types.ts | Phase 1 (1.2) |
| src/hooks/knowledge-store.ts | Phase 1 (1.3) |
| src/hooks/knowledge-validator.ts | Phase 2 (2.1) |
| src/hooks/knowledge-curator.ts | Phase 3 (3.1, 3.3) |
| src/hooks/hive-promoter.ts | Phase 4 (4.1) |
| src/hooks/knowledge-reader.ts | Phase 5 (5.1) |
| src/hooks/knowledge-injector.ts | Phase 5 (5.3) |
| src/hooks/knowledge-migrator.ts | Phase 7 (7.1) |
| src/tools/co-change-analyzer.ts | Phase 8 (8.1) |
| docs/releases/v6.17.0.md | Phase 10 (10.1) |

### Files Being Modified
| File | Phase | What changes |
|------|-------|-------------|
| src/config/schema.ts | Phase 6 (6.1) | Add KnowledgeConfig block |
| src/index.ts | Phase 6 (6.2), 8 (8.3), 9 (9.12) | Register hooks + commands |
| src/hooks/delegation-gate.ts | Phase 9 (9.1) | QA skip tracking |
| src/hooks/guardrails.ts | Phase 9 (9.3, 9.4) | Per-task gate tracking |
| src/agents/architect.ts | Phase 9 (9.6) | SLASH COMMANDS + anti-exemption rules |
| src/services/diagnose-service.ts | Phase 9 (9.8) | 7 new health checks |
| package.json | Phase 1 (1.1), Phase 10 (10.2) | Add proper-lockfile; bump to 6.17.0 |

### Files That Will NOT Change
- src/lang/ (all language profile files)
- src/build/discovery.ts
- src/hooks/system-enhancer.ts
- CHANGELOG.md (release-please owns it)

## SME Cache

### knowledge-store
- proper-lockfile: lock on DIRECTORY (not individual file) to prevent concurrent writers on full-file rewrites
- appendKnowledge uses OS-level atomic append — no lock needed for append-only JSONL operations
- FIFO cap enforcement: slice to keep last N entries when appending to rejected/quarantine files
- Jaccard bigram threshold 0.6 for near-duplicate detection; normalize() lowercases + strips punctuation

### v6.17-knowledge-system
- KnowledgeCategory is union type (not enum) for simpler JSON round-trip and forward compatibility
- MessageWithParts shape must match what context-budget.ts and guardrails.ts currently use — check those files during 1.2
- Three-layer validation: Layer 1 = structural, Layer 2 = content safety (blocklists), Layer 3 = semantic (contradiction, vagueness)
- Promotion lifecycle: candidate (raw) → established (3 phase confirmations) → promoted (3 phases OR 90 days) → hive-eligible → hive candidate → hive established (3 project confirmations)

### cross-platform
- On Windows, LOCALAPPDATA env var reliably set; fall back to C:\Users\<user>\AppData\Local if missing
- Test process.platform mocking: vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
- Path normalization: use path.join() everywhere, never string concatenation for paths

## Patterns
- Test framework: vitest (NOT jest/mocha/bun:test) — use `bun test <specific-file>` to run tests
- Hook factory pattern: createXxxHook(directory, config) wrapped in safeHook() for fire-and-forget error suppression
- Evidence files: write to .swarm/evidence/ as .md or .json files
- Test paths: tests/unit/ prefix (NOT test/) — existing codebase convention
- JSONL files: one JSON object per line, skip lines that fail JSON.parse with a warning log

## Phase Metrics (reset — v6.17 Phase 1 starting)
- phase_number: 1
- total_tool_calls: 0
- coder_revisions: 0
- reviewer_rejections: 0
- test_failures: 0
- security_findings: 0
- integration_issues: 0

## v6.16.1 Retrospective Summary (2026-03-02)
- Status: COMPLETE — commit 6c94b6c pushed to origin/main (force-amended from 0066e82)
- Key lessons carried forward: patch releases need `fix:` prefix not `feat:`; Phase 0 audits prevent unnecessary changes; inline test coverage from verification passes satisfies test tasks

## Project Governance
- No governance file found in this workspace; using default swarm rules

## Agent Activity

| Tool | Calls | Success | Failed | Avg Duration |
|------|-------|---------|--------|--------------|
| read | 966 | 966 | 0 | 7ms |
| bash | 947 | 947 | 0 | 3436ms |
| edit | 536 | 536 | 0 | 1025ms |
| grep | 243 | 243 | 0 | 263ms |
| task | 225 | 225 | 0 | 150511ms |
| write | 81 | 81 | 0 | 2252ms |
| glob | 73 | 73 | 0 | 29ms |
| todowrite | 68 | 68 | 0 | 5ms |
| pre_check_batch | 56 | 56 | 0 | 2493ms |
| retrieve_summary | 54 | 54 | 0 | 2ms |
| lint | 46 | 46 | 0 | 2878ms |
| diff | 22 | 22 | 0 | 12ms |
| apply_patch | 10 | 10 | 0 | 1128ms |
| test_runner | 10 | 10 | 0 | 13486ms |
| phase_complete | 6 | 6 | 0 | 2ms |
| invalid | 5 | 5 | 0 | 1ms |
| symbols | 4 | 4 | 0 | 1ms |
| checkpoint | 3 | 3 | 0 | 5ms |
| save_plan | 2 | 2 | 0 | 6ms |
| secretscan | 1 | 1 | 0 | 5323ms |
| todo_extract | 1 | 1 | 0 | 0ms |
| imports | 1 | 1 | 0 | 3ms |

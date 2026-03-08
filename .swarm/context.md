# Context
Swarm: mega

## Current State
- **v6.20.0 RELEASED** — 2026-03-07. All implementation merged to `origin/main` via PR #69 (feat) + PR #70 (release). Tag `v6.20.0` published to npm.
- Active plan: `Issue #78 Hotfixes: Summarization Verification, Gate-State Wiring, and Plan-State Guard Hardening` — ALL PHASES COMPLETE.
- PR #82 open: `fix/gate-enforcement-hardening` → `main`. Awaiting CI green + merge.
- Commits on branch: `a42f4f1` (feature), `0673429` (lint fix), `b0d59d8` (release-please github changelog mode).
- Retrospective: `.swarm/evidence/retro-11/evidence.json` written. Phase 11 complete.
- Knowledge store: 12 entries in `%LOCALAPPDATA%\opencode-swarm\Data\knowledge.jsonl`.
- Next version bump after PR #82 merges: patch (fix: commits) → v6.20.4.
- changelog-notes-type: github now active — future CHANGELOG entries will include full PR body.

### Phase 1 — DONE (all gates passed)
- 1.1 `src/agents/index.ts` — primary agents strip `model` ✅
- 1.2 `tests/unit/agents/factory.test.ts` — tests updated for primary/subagent model contract ✅

### Phase 2 — DONE (all gates passed)
- 2.1 `src/tools/index.ts` — exports `update_task_status` ✅
- 2.2 `src/index.ts` — registers `update_task_status` in plugin runtime ✅
- 2.3 `src/tools/tool-names.ts` — adds `write_retro` to registry ✅
- 2.4 `src/config/constants.ts` — grants `write_retro` to architect only ✅
- 2.5 `src/index.ts` — registers `write_retro` in plugin runtime ✅

### Phase 3 — DONE (all gates passed)
- 3.1–3.6 `src/agents/architect.ts` — all prompt changes complete ✅
  - `Update plan.md [x]` → `update_task_status` completed guidance
  - PLAN STATE PROTECTION updated to distinguish task-level vs phase-level
  - `update_task_status` added to Available Tools
  - in_progress preamble added before step 5b
  - RETROSPECTIVE GATE replaced JSON template with `write_retro` instructions
  - `task_complexity` values aligned to `trivial|simple|moderate|complex`
  - `write_retro` added to Available Tools
  - All stale `evidence manager` / `phase_number` references replaced

### Phase 4 — DONE (all gates passed)
- 4.1–4.2 `src/evidence/manager.ts` — flat retro detection, wrapping, legacy complexity remap, atomic write-back ✅
- 4.3 `src/tools/phase-complete.ts` — migration notice in warnings ✅
- `tests/unit/tools/phase-complete.test.ts` — 2 positional assertions fixed to `.some()` pattern ✅

### Phase 5 — PARTIALLY DONE
- 5.1 `tests/unit/tools/update-task-status.test.ts` — 13 tests, all pass ✅
- 5.2 `tests/unit/tools/update-task-status.adversarial.test.ts` — 71 active + 5 skipped, all pass ✅
  - `src/tools/update-task-status.ts` — working_directory validation hardened ✅
- 5.3 `tests/integration/update-task-status-registration.test.ts` — 16 tests, all pass ✅
- 5.4 `tests/unit/agents/architect-v6-prompt.test.ts` — **BLOCKED AT REVIEWER GATE (call interrupted)**
  - All stale assertions updated + 14 pre-existing failures fixed + new tool assertions added
  - NEXT ACTION: run reviewer gate, then test_engineer verification + adversarial
- 5.5 `tests/unit/agents/architect-gates.test.ts` — **NOT STARTED**
  - Known stale: line 879 comment `// 5o = Update plan.md` — check if assertion also needs updating
- 5.6 `tests/unit/tools/phase-complete-load-evidence.test.ts` — **NOT STARTED**

### Untracked new files (not yet committed)
src/tools/update-task-status.ts, tests/unit/tools/update-task-status.test.ts, tests/unit/tools/update-task-status.adversarial.test.ts, tests/integration/update-task-status-registration.test.ts, tests/adversarial/flat-retro-adversarial.test.ts, tests/unit/evidence/flat-retro.test.ts, tests/unit/evidence/legacy-complexity-remap.test.ts, tests/unit/evidence/manager.adversarial.test.ts, tests/unit/agents/model-stripping.test.ts, tests/unit/tools/write-retro.registration.test.ts, src/tools/plugin-registration-adversarial.test.ts

### Modified files (not yet committed)
src/agents/architect.ts, src/agents/index.ts, src/config/constants.ts, src/evidence/manager.ts, src/index.ts, src/tools/index.ts, src/tools/phase-complete.ts, src/tools/tool-names.ts, tests/unit/agents/architect-v6-prompt.test.ts, tests/unit/agents/factory.test.ts, tests/unit/tools/phase-complete.test.ts

### Key prompt text for test assertions
- `update_task_status` Available Tools: `update_task_status (mark tasks complete, track phase progress)`
- `write_retro` Available Tools: `write_retro (document phase retrospectives via phase_complete workflow, capture lessons learned)`
- Step 5o: `5o. Call update_task_status with status "completed", proceed to next task.`
- All 14 pre-existing failures in architect-v6-prompt.test.ts were fixed (confirmed pre-existing via git stash test)

## Decisions
- save_plan no longer falls back to process.cwd() when target workspace inputs are missing.
- savePlan now fails fast on null/undefined/non-string/blank directory input before filesystem writes.
- Adversarial test coverage was updated to use explicit test workspaces to avoid repository-root .swarm mutation.
- tree-sitter-dart, tree-sitter-kotlin, tree-sitter-swift removed from devDependencies (WASM-only usage, no native addon needed).
- Two-commit PR strategy: implementation commit + CI fix commit for clean bisect history.
- `write_retro` addendum work is folded into the hotfix because the retrospective gate is part of the same architect workflow failure surface.
- Architect runtime exposure tasks must include plugin registration in `src/index.ts`, not only tool-name and permission lists.
- Malformed retrospective compatibility repair is planned before regression tests so phase_complete can validate repaired artifacts through the real load path.
- Issue #78 docs: add new documentation sections for summarization defaults and pagination (no prior README defaults).

## SME Cache
### ui_ux
- Raise summarization threshold to reduce premature summaries; explicit read outputs should remain unsummarized by default with clear user control and continuation cues for pagination.
- Pagination UX should show total lines, loaded range, and explicit next-call hints; chunk ordering must be stable with clear recovery states.

### security
- Enforce pagination bounds and guard against offset/limit abuse; avoid leaking existence details through error messages.
- Log retrieval attempts, avoid differentiated errors for missing vs unauthorized, and keep error responses generic for invalid ranges.

## Known Risks
- phase_complete agent-dispatch tracking is cross-session — the tool may report missing agents when work was done in prior sessions. This is a known limitation documented in Phase 5 retrospective.
- Existing repo state may still contain post-Phase-5 drift from prior sessions; verify actual working tree state before implementation and before any commit.

## Patterns
- Tool exposure pattern: a tool is usable at runtime only when its name is in `src/tools/tool-names.ts`, its architect permission is in `src/config/constants.ts`, and its implementation is registered in `src/index.ts`.
- Tool wrapper pattern: `src/tools/save-plan.ts` is the reference shape for thin MCP wrappers around manager functions with exported execute helpers.
- Prompt regression pattern: architect prompt behavior is enforced by existing prompt assertion suites under `tests/unit/agents/` and should be updated in place rather than replaced.
- Retrospective evidence pattern: valid retro files are `EvidenceBundle` wrappers with one `retrospective` entry; `src/tools/write-retro.ts` is the canonical writer.

## Relevant File Map
- Tool exposure: `src/tools/tool-names.ts`, `src/config/constants.ts`, `src/tools/index.ts`, `src/index.ts`
- Task status implementation: `src/tools/save-plan.ts`, `src/tools/update-task-status.ts`, `src/plan/manager.ts`
- Architect prompt: `src/agents/architect.ts`
- Retrospective evidence path: `src/tools/write-retro.ts`, `src/evidence/manager.ts`, `src/tools/phase-complete.ts`, `src/config/evidence-schema.ts`
- Prompt tests: `tests/unit/agents/architect-v6-prompt.test.ts`, `tests/unit/agents/architect-gates.test.ts`, `tests/unit/agents/architect-prompt-template.test.ts`
- Tool and evidence tests: `tests/unit/tools/save-plan.test.ts`, `tests/unit/tools/write-retro.test.ts`, `tests/unit/tools/phase-complete-load-evidence.test.ts`

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

## Release Management Playbook

### Versioning Rules (release-please)
- NEVER manually edit `package.json` version field — release-please owns it.
- NEVER manually edit `CHANGELOG.md` — release-please generates it from commit messages.
- NEVER manually create version tags — release-please creates them after its release PR merges.
- release-please watches `main` and opens a release PR automatically after conventional commits merge.
- Version bumps are driven by commit prefix:
  - `fix:` or `fix(scope):` → patch bump (e.g. v6.19.4 → v6.19.5)
  - `feat:` or `feat(scope):` → minor bump (e.g. v6.19.x → v6.20.0)
  - `BREAKING CHANGE:` footer or `!` suffix → major bump (e.g. v6.x.x → v7.0.0)
- If you need to describe a change in CHANGELOG without triggering a version bump, use `chore:` or `docs:` prefix.

### Commit Message Discipline
- Every commit that should appear in the changelog MUST use conventional commit format: `<type>(<scope>): <description>`
- Common types: `fix`, `feat`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`
- Scope is optional but recommended for clarity (e.g. `fix(tests):`, `feat(phase-complete):`)
- The subject line (first line) is what release-please uses for CHANGELOG entries — make it descriptive.
- Multi-commit PRs: each commit gets its own CHANGELOG entry; squash only if commits are trivially related.

### Two-Commit PR Strategy (enforced pattern)
1. **Commit A — Implementation**: The functional change. Prefix: `fix:` / `feat:` / `refactor:` etc.
   - Contains: src/ changes, test updates that directly test the feature
   - Does NOT contain: lint fixes for unrelated code, CI config tweaks
2. **Commit B — CI/Hygiene** (only if needed): Follow-on fixes for lint, CI config, or test scaffolding.
   - Prefix: `fix(lint):` / `fix(ci):` / `fix(tests):`
   - Contains: lint fixes, biome suppressions, CI workflow patches, test helper additions
   - Does NOT re-touch the feature logic from Commit A
- Rationale: clean `git bisect` — if a regression appears, Commit A vs B can be isolated immediately.

### Pre-Merge Checklist (before pushing a branch or opening a PR)
- [ ] `git fetch origin main` — confirm you are not behind; release-please may have merged a release bump
- [ ] `git status` — no unintended working-tree changes staged alongside feature work
- [ ] All commits use conventional commit format (`fix:`, `feat:`, `chore:` etc.)
- [ ] `bun run lint` passes locally (biome check, exit code 0)
- [ ] `bun run typecheck` passes locally (tsc --noEmit, no errors)
- [ ] `bun test <specific-file>` passes for files you touched (do NOT run full suite)
- [ ] No manual edits to `package.json` version, `CHANGELOG.md`, or git tags

### Post-Merge Checklist (after PR merges to main)
- [ ] Confirm CI passes on `main` (GitHub Actions — lint, typecheck, test jobs all green)
- [ ] Check if release-please has opened or updated its release PR (look for PR titled "chore(main): release X.Y.Z")
- [ ] Do NOT merge the release-please PR manually — it merges automatically once all checks pass, OR merge it yourself only when ready to publish
- [ ] After the release PR merges: confirm the new version tag appears (e.g. `v6.19.6`) and the npm publish workflow completes
- [ ] Update `.swarm/context.md` "Current State" with the new version and PR reference

### Phase-Boundary Release Checklist (run at every MODE: PHASE-WRAP)
- [ ] Run `git fetch origin main` and check if a new release was cut since the phase started
- [ ] If `main` has advanced: rebase or merge `main` into the working branch before starting the next phase
- [ ] Record the current released version in the retrospective (`plan_id`, phase number, version at phase start/end)
- [ ] If this phase introduced `feat:` commits: note that a minor version bump is pending
- [ ] If this phase introduced only `fix:` commits: note that a patch bump is pending
- [ ] Do NOT start the next phase on a stale branch — sync with `origin/main` first

### Known Gotchas
- release-please bumps happen asynchronously: a PR you merged yesterday may have already triggered a version bump by the time the next session starts. Always `git fetch` before assuming you know the current version.
- `CHANGELOG.md` conflicts: if you ever see a merge conflict in CHANGELOG.md, DO NOT resolve it manually — let release-please win (accept their version of the file).
- Biome `noControlCharactersInRegex`: rejects ALL control-char ranges in regex literals including `\x00-\x1F`, `\u0000-\u001F`. Use `new RegExp('[\\u0000-\\u001F]')` string constructor instead.
- Biome `noAssignInExpressions`: rejects `while ((x = fn()) !== null)` — refactor to pre-assign + re-assign at loop end.
- Biome unused suppression (`suppressions/unused`): a `// biome-ignore` comment that no longer suppresses an active violation causes a lint error. Remove stale suppressions.
- `bun run lint` uses the project's own `./node_modules/.bin/biome` (v2.x), not a globally installed biome. Version mismatches between global and local biome can cause spurious rule differences.

## Agent Activity

| Tool | Calls | Success | Failed | Avg Duration |
|------|-------|---------|--------|--------------|
| read | 872 | 872 | 0 | 7ms |
| bash | 709 | 709 | 0 | 710ms |
| edit | 240 | 240 | 0 | 1877ms |
| task | 202 | 202 | 0 | 115495ms |
| glob | 163 | 163 | 0 | 25ms |
| grep | 137 | 137 | 0 | 83ms |
| retrieve_summary | 45 | 45 | 0 | 3ms |
| write | 44 | 44 | 0 | 1465ms |
| lint | 31 | 31 | 0 | 2706ms |
| pre_check_batch | 28 | 28 | 0 | 2254ms |
| test_runner | 27 | 27 | 0 | 6281ms |
| todowrite | 22 | 22 | 0 | 3ms |
| update_task_status | 22 | 22 | 0 | 6ms |
| save_plan | 14 | 14 | 0 | 12ms |
| phase_complete | 14 | 14 | 0 | 6ms |
| diff | 11 | 11 | 0 | 28ms |
| imports | 10 | 10 | 0 | 5ms |
| todo_extract | 5 | 5 | 0 | 2ms |
| invalid | 5 | 5 | 0 | 1ms |
| declare_scope | 4 | 4 | 0 | 3ms |
| write_retro | 3 | 3 | 0 | 7ms |
| evidence_check | 2 | 2 | 0 | 2ms |
| apply_patch | 2 | 2 | 0 | 113ms |
| secretscan | 2 | 2 | 0 | 135ms |

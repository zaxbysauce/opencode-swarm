# Context
Swarm: mega

## Code Review Session (2026-02-23)

### Project Overview
- **Name:** opencode-swarm v6.8.1
- **Type:** TypeScript/Bun plugin for OpenCode (AI coding assistant)
- **Runtime:** Bun + Node.js compatible (ESM, target: ES2022)
- **Build:** bun build + tsc --emitDeclarationOnly
- **Test:** bun test (170+ test files across unit/integration/adversarial/security) plus targeted `bun test src/agents/test-engineer.adversarial.test.ts` for the current-model sentinel edge case
- **Lint:** Biome 2.3.14 (currently passing clean)
- **Key deps:** @opencode-ai/plugin ^1.1.53, @opencode-ai/sdk ^1.1.53, zod ^4.1.8
- **Release:** v6.8.1 documents how the current-model sentinel makes agents inherit the UI-selected model when `model` is absent or set to `"current"`.

### Architecture
Hub-and-spoke: Architect agent orchestrates 8 specialist agents (coder, reviewer, sme, explorer, test-engineer, critic, docs, designer). Plugin provides agents + tools + hooks to OpenCode.

**Source layout:**
- `src/agents/` — Agent definitions (prompt + config)
- `src/background/` — Async automation workers (circuit-breaker, queue, plan-sync, event-bus)
- `src/cli/` — Install/uninstall CLI
- `src/commands/` — /swarm slash command handlers (thin adapters to services)
- `src/config/` — Zod schemas, config loader, constants
- `src/evidence/` — Evidence bundle persistence
- `src/hooks/` — OpenCode plugin hooks (system-enhancer, guardrails, pipeline-tracker, etc.)
- `src/plan/` — plan.json/plan.md manager
- `src/services/` — Business logic (config-doctor, preflight, evidence-summary, export, etc.)
- `src/state.ts` — Module-scoped singleton for cross-hook state sharing
- `src/summaries/` — Tool output summary persistence
- `src/tools/` — MCP tools (checkpoint, diff, lint, secretscan, test-runner, etc.)
- `src/utils/` — Shared utilities (logger, merge, errors)

## Decisions
- v6.7 is GUI-first and background-first: slash commands are optional control surfaces, not mandatory workflow entry points.
- Keep `plan.json` as canonical state and derive `plan.md` deterministically to prevent status drift.
- Extract business logic into services; commands and background workers both call the same service layer.
- Ship v6.7 behind feature flags with safe defaults and gradual rollout.
- Enforce conservative unattended-security defaults (read-mostly, explicit opt-in for destructive actions).
- Add explicit release hygiene gate: verify `package.json` version bump before any publish/tag/push release flow.
- v6.8.0: Complete background automation by wiring three scaffolded-but-unwired features: EvidenceSummaryIntegration, PreflightTriggerManager handler, and PlanSyncWorker.
- v6.8.0: evidence_auto_summaries and plan_sync default to true (read-only, no side effects); phase_preflight stays false (triggers actions).
- Phase 2 is closed with integration coverage for phase preflight auto-trigger behavior; active implementation focus moves to Phase 3 PlanSyncWorker.
- Phase 3 is complete: PlanSyncWorker is implemented, exported, wired, safeguarded with timeout/callback isolation, and covered by integration/adversarial tests.
- Phase 4 is complete: README/CHANGELOG/package version are aligned for v6.8.0 release artifacts.
- v6.8.1: Current-model sentinel ambassadors (empty string or `"current"`) now resolve to `undefined`, so agents omit `model` and inherit the UI-selected model; README/CHANGELOG document this plus the rerun of `bun test src/agents/test-engineer.adversarial.test.ts` and the release bump is gated behind the package version change.
- v6.9.0 will focus on the local-only quality/anti-slop gates outlined in `opencode-swarm_phased-plan_quality-anti-slop.md` and the expanded QA gate sequence.
- v6.13.0 Phase 1: Role-Scoped Tool Filtering is complete. AGENT_TOOL_MAP is the source of truth. getAgentConfigs filters tools at runtime via this map. tool_filter config option (enabled, overrides) allows safe customization. Tool filtering is backward-compatible via optional params. test_runner cwd threading fixed framework detection with comprehensive security validation (4 CVEs caught and fixed in adversarial testing).

## Code Review Session (2026-02-24)

- Verified Phase 6 release: `package.json` version is 6.8.1, README + CHANGELOG call out the sentinel release, and `plan.md` marks the phase complete.
- Empty/"current" overrides resolve via `resolveModel()` so agents omit `model` and inherit the UI session model; tests exercise this path (`createTestEngineerAgent(resolveModel(''))`, long/unicode strings remain intact).
- `bun test src/agents/test-engineer.adversarial.test.ts` reran (18/18 pass, 100% coverage) to lock in the new behavior.
- `.swarm/context.md` now records the sentinel release to inform future architects that v6.8.1 exists and a release gate was satisfied.

## Key Findings Index

### CRITICAL (1)
- C5.1: src/tools/gitingest.ts:34 — hardcoded external URL, no opt-in

### MAJOR (16)
- C1.1: src/background/trigger.ts:29-77 — duplicate interface definitions
- C2.1: src/config/loader.ts:188-204 — double-read bug
- C2.2: src/config/loader.ts:29-50 — TOCTOU in config load
- C3.1: src/hooks/system-enhancer.ts — 628-line god function with 80% duplicate code paths
- C4.1: src/plan/manager.ts:92 — Bun.hash() not stable across versions
- C4.2: src/tools/test-runner.ts — 1065 lines, 4 functions over 100 lines
- C4.3: src/tools/imports.ts — parseImports 177 lines, execute 145 lines
- C4.4: src/state.ts:101 — toolAggregates/delegationChains grow unboundedly
- C4.5: src/commands/benchmark.ts:11 — handleBenchmarkCommand 279 lines
- C5.2: src/evidence/manager.ts:136 — PID-based temp naming (Docker collision)
- C5.3: src/summaries/manager.ts:109 — same PID collision risk
- C5.4: src/hooks/utils.ts:56-62 — incomplete path traversal protection
- C6.1: src/hooks/system-enhancer.ts — refactoring target (see C3.1)
- C6.2: src/tools/test-runner.ts — refactoring target (see C4.2)
- C6.3: src/tools/symbols.ts:116-328 — extractTSSymbols 213 lines

### MINOR (18)
- C1.2: nul (root) — Windows artifact file in repo
- C2.3: src/services/export-service.ts:24 — hardcoded version '4.5.0'
- C3.2: src/index.ts:335-443 — 8x biome-ignore any casts
- C3.3: src/services/export-service.ts:10 — plan: unknown type
- C3.4: src/hooks/utils.ts:18 — _error param declared but unused
- C3.5: src/config/loader.ts:97 — import in middle of file
- C4.6: src/config/loader.ts:14 / src/cli/index.ts:6 / src/services/config-doctor.ts:95 — getUserConfigDir() triplicated
- C4.7: src/services/preflight-integration.ts:88,106,113 — console.log not log utility
- C4.8: src/tools/pkg-audit.ts:6 — MAX_OUTPUT_BYTES 50MB excessive
- C4.9: src/commands/benchmark.ts:4-9 — CI thresholds not configurable
- C5.5: src/config/schema.ts:502 — Zod no .strict()
- C5.6: src/utils/logger.ts:1 — DEBUG at import time
- C5.7: src/background/queue.ts:115 — O(n log n) sort on enqueue
- C5.8: src/agents/*.ts — customPrompt replaces full prompt stripping security
- C6.4: src/tools/imports.ts:107 — parseImports 177 lines
- C6.5: src/tools/pkg-audit.ts — 3x duplicate audit runner pattern
- C6.6: src/config/schema.ts — 575 lines mixing multiple concerns
- C4.10: biome.json — noNonNullAssertion disabled globally

## False Positives (secretscan)
All 7 secretscan findings are false positives:
- designer.ts:69 — 'password' is a TypeScript function parameter in a UI scaffold example
- secretscan.ts:171,179,194,222,230 — The secretscan tool's own pattern definitions / redact templates
- test-runner.ts:71 — Comment about checking for path traversal patterns

## SME Cache
### security
- Tree-sitter queries must be sandboxed (timeout/complexity limits) and run with crash isolation; avoid user-supplied DSLs.
- Evidence bundles should be append-only with checksums and atomic writes; gate decisions must validate integrity before trusting a tool result.
- The QA gate should persist a `gate.lock` fingerprint and forbids CLI/ENV bypasses; downstream automation validates the fingerprint before trusting a pass.
- All tools must run offline (no network calls) and enforce resource caps (time/memory) so Tree-sitter parsing, SBOM generation, and build checks cannot hang or crash the swarm.

### pre_check_batch (2026-02-26)
**TypeScript/Tool Patterns:**
- Use static imports (not dynamic) - no circular dependency issues between sibling modules
- Create wrapper functions to normalize varying signatures (runLint needs linter detection first, runBuildCheck has reversed parameter order)
- Import full type definitions statically - don't use ReturnType inference
- Let Promise.allSettled() handle errors, post-process to normalize result shapes
- Pass `directory: string` as first-class parameter (follows existing tool patterns)

**Performance/Concurrency:**
- Use `p-limit` with concurrency=4 for 6 tools (prevents I/O saturation, leaves CPU headroom)
- Use `process.hrtime.bigint()` for timing (not Date.now()) - monotonic, nanosecond precision
- Implement proper cleanup on timeout: child.kill('SIGTERM') then SIGKILL after 5s grace period
- AbortController enables cooperative cancellation (tools can check signal.aborted)

**Security:**
- Path traversal: Validate all paths with `path.resolve()` + `path.relative().startsWith('..')` check
- CRITICAL: Run `build_check` SEPARATELY before security batch (side effects, unpredictable duration)
- Security tools (secretscan, sast_scan) are HARD GATES - any failure/timeout = gates_passed=false
- Output sanitization: Redact secrets, scrub absolute paths, remove stack traces
- Resource limits: Max 3 concurrent, 512MB per tool, 100 file cap, 10MB per file
- Input validation: Reject null bytes, control characters, shell metacharacters
- Fail-secure: Tool exception = gate failure (don't allow bypass via timeout)

## Patterns (retained from v6.8)
- Plugin config via Zod schema defaults + deep merge layering must remain backward compatible.
- Atomic write pattern (temp + rename) for plan/evidence/state files — use `savePlan()` not direct writes.
- Hook safety wrappers (`safeHook`) and deterministic tool JSON outputs are non-negotiable.
- Model sentinel (`resolveModel`) keeps `model` optional when the user wants to inherit the UI-selected model (empty strings or `"current"` resolve to `undefined`).

## Stage Status
- Stage 0 (Baseline Recon): COMPLETE
- Stage 1 Plan: APPROVED by critic (2026-02-25)
- Stage 1 Implementation: IN PROGRESS

## Phase Metrics
- phase_number: 7 (v6.13 Context Efficiency - Phases 3-7 complete)
- task_count: 17 (Phase 3: 3, Phase 4: 2, Phase 5: 3, Phase 6: 3, Phase 7: 6)
- tasks_completed: 17 (all phases complete)
- phase_status: complete
- total_tool_calls: 45+ (Phases 3-7)
- coder_revisions: 20+ 
- reviewer_rejections: 8 (many during test fixes)
- test_failures: 0 (all tests passing)
- security_findings: 0
- integration_issues: 0
- task_complexity: small+medium
- top_rejection_reasons: ["Phase 7: Test format mismatches (plan-cursor output, architect prompt wording changes)", "Phase 4: Mode detection test expectations vs actual behavior"]
- lessons_learned: ["Prompt-only changes skip test execution", "Test assertions must match actual output format", "Mode-gating DISCOVER suppresses all non-essential injections", "Tool truncation applies only to diff/symbols by default", "Zod schema changes require updating test expectations", "QA gates critical even for test file changes"]
- note: v6.13 release complete - 209 tests passing, context efficiency features shipped

## Agent Activity

| Tool | Calls | Success | Failed | Avg Duration |
|------|-------|---------|--------|--------------|
| read | 11 | 11 | 0 | 4ms |
| bash | 6 | 6 | 0 | 142ms |
| test_runner | 1 | 1 | 0 | 2ms |
| task | 1 | 1 | 0 | 80907ms |
| write | 1 | 1 | 0 | 125ms |
## v6.9.0 Release Retrospective (2026-02-25)

### Summary
Successfully implemented v6.9.0 "Quality & Anti-Slop Tooling" - 6 new quality gates with 1,100+ tests passing.

### Stages Completed
- **Stage 1** (syntax_check): 75 tests ✅
- **Stage 2** (placeholder_scan): 75 tests ✅
- **Stage 3** (sast_scan): 167 tests ✅
- **Stage 4** (sbom_generate): 108 tests ✅
- **Stage 5** (build_check): 136 tests ✅
- **Stage 6** (quality_budget): 154 tests ✅
- **Stage 7** (QA Hardening): 391 tests ✅
- **Stage 8** (Documentation): README, CHANGELOG, docs updated ✅

### Key Metrics
- **Total Tests**: 1,100+ passing
- **New Tools**: 6
- **New Evidence Types**: 6
- **Total Evidence Types**: 12
- **SAST Rules**: 63
- **Supported Languages**: 9+
- **Files Changed**: 122
- **Lines Changed**: +24,852/-1,470

### Complete QA Gate Sequence
```
coder → diff → syntax_check → placeholder_scan → imports → 
lint → secretscan → sast_scan → build_check → quality_budget → 
reviewer → security reviewer → test_engineer → adversarial tests → 
coverage check
```

### Key Features Delivered
1. **syntax_check**: Tree-sitter based syntax validation (9+ languages)
2. **placeholder_scan**: Detects TODO/FIXME and stub implementations
3. **sast_scan**: Offline SAST with 63+ security rules, optional Semgrep Tier B
4. **sbom_generate**: CycloneDX SBOM generation (8 ecosystems)
5. **build_check**: Repo-native build verification (10+ ecosystems)
6. **quality_budget**: Maintainability budget enforcement (4 metrics)

### Local-Only Guarantee
All tools run locally without Docker, network, or cloud services.

### Security Fix
Fixed critical command injection vulnerability in sast_scan Semgrep integration (spawning shell with user input). Now uses argument arrays with `shell: false`.

### Documentation Updated
- README.md - Full v6.9.0 documentation
- CHANGELOG.md - Complete release notes
- docs/architecture.md - Updated Phase 5 flow
- docs/installation.md - Configuration examples
- docs/design-rationale.md - Design decisions

### Release Status
- Version: 6.9.0
- Git Commit: bfce268
- Git Push: ✅ Complete
- Status: **RELEASED**

### Lessons Learned
1. Tree-sitter integration requires WASM grammar files - plan for build complexity
2. Security reviews are critical - caught command injection before release
3. Evidence schema design should be typed from the start, not stubbed
4. Parallel task execution (config + schema) speeds up implementation
5. Critic gate prevents issues - all plans reviewed before implementation

### Top Rejection Reasons (Critic Reviews)
1. Config schema approach not aligned with existing patterns
2. Dependency graph incorrect/confusing
3. Missing non-test code detection heuristics
4. Tool output contract vs schema inconsistency
5. Naming confusion (allow_globs actually excludes)

### Next Steps
- v6.10.0 planning (future roadmap)
- Monitor adoption of quality gates
- Collect feedback on thresholds

---

## v6.11.0 Architect Prompt Hardening (2026-02-26)

### Summary
Implement architect workflow reliability improvements: test regression fixes, namespace collision fix (Phase → MODE), critic hard stop, task atomicity, observable output, failure counting, anti-rationalization hardening.

### Key Decisions
- Rename architect internal "Phase N" headers to "MODE:" labels to avoid collision with project plan phases
- Add NAMESPACE RULE explicitly distinguishing architect modes from project phases
- Add ⛔ HARD STOP checklist in CRITIC-GATE mode before EXECUTE
- Add TASK GRANULARITY RULES to enforce small/medium task sizing
- Add observable output lines (`→ REQUIRED: Print`) for all blocking steps
- Add ANTI-EXEMPTION RULES to prevent "it's a simple change" rationalizations
- Add AUTHOR BLINDNESS WARNING to coder prompt

### Test Regression Context
v6.10 step restructuring moved:
- secretscan/sast_scan from standalone steps into pre_check_batch (5i)
- All subsequent steps renumbered (5d→5f, 5e→5g, 5i→5l, etc.)

---

## v6.10.0 Pre-Check Batch Implementation (2026-02-26)

### Summary
Implemented `pre_check_batch` tool that runs 4 verification tools in parallel after lint fix and build_check, reducing Phase 5 QA gate wall-clock time.

### Implementation Status
- **Phase 1**: Core implementation complete (7 tasks)
- **Phase 2**: Tests complete (110 new tests)

### New Files Created
- `src/tools/pre-check-batch.ts` - Parallel batch tool (~380 lines)
- `tests/unit/tools/pre-check-batch.test.ts` - Unit tests (20 tests)
- `tests/integration/pre-check-batch.test.ts` - Integration tests (7 tests)
- `.swarm/ROLLBACK-pre-check-batch.md` - Rollback documentation

### Files Modified
- `src/tools/index.ts` - Added exports
- `src/index.ts` - Added tool registration
- `src/config/schema.ts` - Added PipelineConfigSchema
- `src/config/index.ts` - Re-exported types
- `src/hooks/system-enhancer.ts` - Added parallel precheck hints (Path A & B)
- `src/agents/architect.ts` - Updated Phase 5 prompt
- `package.json` - Added p-limit@7.3.0

### New Config Option
```json
{
  "pipeline": {
    "parallel_precheck": true  // default: true
  }
}
```

### Updated QA Gate Sequence
```
coder → diff → syntax_check → placeholder_scan → lint fix → build_check → 
pre_check_batch (4 tools parallel) → reviewer → security review → 
verification tests → adversarial tests → coverage check
```

### pre_check_batch Tools (4 parallel, max 4 concurrent)
1. lint:check - Code quality verification
2. secretscan - Secret detection
3. sast_scan - Static security analysis
4. quality_budget - Maintainability metrics

### Key Metrics
- **New Tests**: 110 (20 unit + 83 schema + 7 integration)
- **All Hard Gates**: All 4 tools must pass for gates_passed=true
- **Concurrency**: p-limit(4) prevents resource exhaustion
- **Timeout**: 60s per tool
- **Security**: Path traversal protection, max 100 file limit

### SME Guidance Cached
See SME Cache section above for TypeScript, Performance, and Security guidance.

### Rollback Instructions
See `.swarm/ROLLBACK-pre-check-batch.md` for quick disable and full removal procedures.

---

## v6.12.0 Anti-Process-Violation Hardening (2026-02-27)

### Summary
Implementing v6.12 to close five architect process violation patterns discovered via Kimi K2.5 field testing: (1) self-coding instead of delegating, (2) never using reviewer, (3) partial gate execution, (4) self-fixing gate failures, (5) batching coder tasks.

### Implementation Plan
See `v6.12.md` in project root for full specification.

### Phase 1: Prompt Hardening [COMPLETE] ✅
All 11 tasks completed:

| Task | Description | File | Status |
|------|-------------|------|--------|
| 1.1 | ANTI-SELF-CODING RULES block | architect.ts | ✅ |
| 1.2 | Tool-usage boundary to Rule 1 | architect.ts | ✅ |
| 1.3 | Self-coding pre-check in Rule 4 | architect.ts | ✅ |
| 1.4 | PARTIAL GATE RATIONALIZATIONS | architect.ts | ✅ |
| 1.5 | ⛔ TASK COMPLETION GATE hard-stop | architect.ts | ✅ |
| 1.6 | precheckbatch SCOPE BOUNDARY | architect.ts | ✅ |
| 1.7 | Rule 7 STAGE A / STAGE B restructure | architect.ts | ✅ |
| 1.8 | CATASTROPHIC VIOLATION CHECK | architect.ts | ✅ |
| 1.9 | GATE FAILURE RESPONSE RULES | architect.ts | ✅ |
| 1.10 | Rule 3 BATCHING DETECTION | architect.ts | ✅ |
| 1.11 | Compliance escalation | pipeline-tracker.ts | ⏳ IN PROGRESS |

### Phase 2: Runtime Hook Detection [IN PROGRESS]
| Task | Description | File | Status |
|------|-------------|------|--------|
| 2.2 | Tracking fields in state.ts | state.ts | ✅ DONE |
| 2.1 | Architect write-tool detection | guardrails.ts | PENDING |
| 2.3 | Partial-gate/reviewer tracking | guardrails.ts | PENDING |
| 2.4 | Batch delegation detection | delegation-gate.ts | PENDING |
| 2.5 | Gate-failure self-fix detection | guardrails.ts | PENDING |

### Phase 3: Delegation Gate Enhancement [PENDING]
| Task | Description | File | Status |
|------|-------------|------|--------|
| 3.1 | Zero-delegation detection | delegation-gate.ts | PENDING |

### Phase 4: Test Suite [PENDING]
| Task | Description | File | Status |
|------|-------------|------|--------|
| 4.1 | Prompt tests (self-coding, gate-failure, batching) | architect-v6-prompt.test.ts | PENDING |
| 4.2 | Adversarial tests (self-coding, batch, self-fix hooks) | NEW FILE | PENDING |
| 4.3 | Prompt tests (partial-gate, reviewer, Stage A/B) | architect-v6-prompt.test.ts | PENDING |
| 4.4 | Adversarial tests (gate tracking, reviewer count) | NEW FILE | PENDING |
| 4.5 | Pipeline-tracker compliance tests | pipeline-tracker.test.ts | PENDING |

### Files Modified So Far
- `src/agents/architect.ts` - 11 prompt blocks added (Tasks 1.1-1.10)
- `src/state.ts` - 4 tracking fields added (Task 2.2)
- `tests/unit/agents/architect-v6-prompt.test.ts` - 50+ tests added

### Test Count
- Current: 203+ tests passing
- Target: 58 new tests for v6.12 (from spec)

### Key Decisions
- Prompt hardening uses concrete ✗/✓ rationalization format for scannability
- STAGE A/B restructure REPLACES existing header rather than adding
- Hook detections are warnings (not blocks) to avoid false positive friction
- 2-minute window for self-fix detection covers common case
- .swarm/ writes are exempt from self-coding detection
- Task 2.2 (state.ts) MUST complete before 2.1, 2.3, 2.5 (dependency)

### Next Steps
1. Complete Task 1.11 (pipeline-tracker compliance escalation) - was interrupted
2. Complete Task 2.1 (guardrails architect write detection)
3. Complete Task 2.3 (partial-gate/reviewer tracking)
4. Complete Task 2.4 (batch delegation detection)
5. Complete Task 2.5 (gate-failure self-fix detection)
6. Complete Task 3.1 (delegation-gate enhancement)
7. Run full test suite (Tasks 4.1-4.5)
8. Version bump and release

---

## v6.13.1 - System Message Consolidation (2026-02-27)

### Project Overview
- **Name:** opencode-swarm v6.13.1
- **Goals:**
  1. Consolidate system messages to prevent Jinja template errors
  2. Fix tests from overwriting user config
  3. Fix /swarm command template bug (`{{arguments}}` → `$ARGUMENTS`)
  4. Fix default config schema mismatch (preset/presets → agents)

### Key Files Identified
- `src/index.ts:326` — Command template uses `{{arguments}}`
- `src/index.ts:338-346` — messages.transform hook pipeline
- `src/cli/index.ts:88-109` — Broken defaultConfig with preset/presets
- `src/config/constants.ts:133-161` — DEFAULT_MODELS with stale IDs
- `src/config/schema.ts:684` — PluginConfigSchema accepts `agents`, not `presets`

### Current Status
- Phase 1: Task 1.1 in progress

---

## Phase Metrics

### v6.13.1 - System Message Consolidation (2026-02-28)
- **phase_number:** 1
- **total_tool_calls:** ~50
- **coder_revisions:** 4 (system message consolidation logic)
- **reviewer_rejections:** 2 (fast path array mutation, whitespace filtering)
- **test_failures:** 3 (test expectations, whitespace handling)
- **security_findings:** 0
- **integration_issues:** 0
- **task_count:** 15 (across 5 phases)
- **task_complexity:** Medium
- **top_rejection_reasons:**
  1. Fast path returning original array reference instead of new array
  2. Whitespace-only system messages not being removed from array
  3. Test expectations mismatching actual function behavior
- **lessons_learned:**
  1. Always verify fast path logic matches main processing loop
  2. Test edge cases early - whitespace filtering revealed subtle bugs
  3. Reviewer catches logic bugs that tests miss - both gates needed
  4. Test isolation helper prevents future config corruption bugs
  5. Migration layer maintains backward compatibility for v6.12 users

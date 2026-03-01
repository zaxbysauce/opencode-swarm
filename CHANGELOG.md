# Changelog

## [6.14.0](https://github.com/zaxbysauce/opencode-swarm/compare/v6.13.2...v6.14.0) (2026-03-01)


### Features

* v6.13.3 retrospective enforcement & memory improvements ([3ce66cd](https://github.com/zaxbysauce/opencode-swarm/commit/3ce66cd3d2c5319a21682b5a42b8ca103fa3ca26))


### Bug Fixes

* add null guard in system-enhancer adversarial afterEach before rmSync ([af49674](https://github.com/zaxbysauce/opencode-swarm/commit/af49674fc2652197cc5c4e9916994faddb028dc0))
* resolve 10 pre-existing syntax-check test failures ([3460a34](https://github.com/zaxbysauce/opencode-swarm/commit/3460a34bc6b6db5aa83837b7e461a28012c9734e))
* stop test-plan-sync dirs leaking into project root ([c84cad0](https://github.com/zaxbysauce/opencode-swarm/commit/c84cad0d4675fdf2fd285c88ec03fe4d91d8aab8))
* use os.tmpdir() in tests to prevent temp dirs leaking into project root ([b32a0e1](https://github.com/zaxbysauce/opencode-swarm/commit/b32a0e103306b36fe6fafd0a8a3d2c893314b59b))

## [6.13.3] - 2026-02-28

### Bug Fixes
- **Retrospective gate:** `phase_complete` now requires a retrospective evidence bundle
  before allowing phase completion. Agents can no longer skip retrospectives.
- **Phase-scoped retro injection:** System enhancer now reads the previous phase's
  retrospective by phase number (not random recent file) and always injects lessons —
  not just when `reviewer_rejections > 2`.
- **Deduplicated retro logic:** Extracted shared retrospective injection function from
  duplicated Path A / Path B code in system-enhancer.ts.

### Improvements
- **User directive capture:** New `user_directives` field in RetrospectiveEvidence schema
  captures user corrections with category and persistence scope.
- **Approach tracking:** New `approaches_tried` field tracks what was attempted and why
  approaches were abandoned, enabling future trajectory mining.
- **Pre-phase briefing:** Architect prompt now requires reading previous phase retrospective
  and printing a briefing acknowledgment before starting any new phase.
- **Coder retro injection:** Coder agent now receives condensed lessons_learned from the
  previous phase's retrospective.
- **Cross-project memory:** Phase 1 of any project now receives historical lessons from
  up to 3 recent retrospectives from prior projects in the same workspace, including
  carried-forward user directives.
- **Phase count guidance:** Architect prompt now discourages single-phase plans for large
  task sets (5+ tasks → 2+ phases, 10+ tasks → 3+ phases).
- **Plan ID tagging:** Retrospectives now include `plan_id` in metadata for reliable
  cross-project vs. same-plan filtering.

## [6.13.2] - 2026-02-28

### Added
- **`phase_complete` tool**: New enforcement gate that verifies all required agents (coder, reviewer, test_engineer) were dispatched before a phase completes. Emits structured `PhaseCompleteEvent` to `.swarm/events.jsonl`, resets per-phase dispatch tracking, and blocks or warns based on configurable policy (`enforce`/`warn`).
- **`exempt_tools` config**: `SummaryConfigSchema` now supports `exempt_tools` (default: `['retrieve_summary','task']`) to prevent summarization loops — outputs from those tools are never summarized.
- **Same-model adversarial detection**: New `AdversarialDetectionConfigSchema` and `src/hooks/adversarial-detector.ts`. Detects when coder and reviewer share the same underlying model and injects a warning or policy escalation into the reviewer's system prompt. Supports `warn`, `gate`, and `ignore` policies.
- **Swarm Briefing doc**: `docs/swarm-briefing.md` — 95-line LLM-readable pipeline briefing covering the 12-step pipeline, task format table, sizing rules, and example tasks.
- **Task Field Reference**: Inserted `## Task Field Reference` into `docs/planning.md` with FILE/TASK/CONSTRAINT/AC definitions, Good/Bad examples, and SMALL/MEDIUM/LARGE sizing guidance.

### Fixed
- **HF-1b — Architect test execution guardrail**: Architect agents now receive an injection preventing bulk `bun test` runs. Only specific test files for code modified in-session may be run, one at a time. Resolves crash-on-concurrent-test-run issue.
- **HF-1 scope refactor**: `baseRole` declaration hoisted out of block scope so it is shared between the HF-1 (coder/test_engineer no-verify) and HF-1b (architect no-bulk-test) guardrail blocks.

### Tests
- 46 new tests for HF-1b guardrails (`system-enhancer-hf1b.test.ts`, `system-enhancer-hf1b-adversarial.test.ts`)
- 400 tests across 17 files for Phases 1–4 (phase_complete, summarization loop, adversarial detection, docs)

## [6.12.1](https://github.com/zaxbysauce/opencode-swarm/compare/v6.12.0...v6.12.1) (2026-02-28)


### Bug Fixes

* TypeScript errors from optional current_phase ([284bc5f](https://github.com/zaxbysauce/opencode-swarm/commit/284bc5f574ef87210063c0bc8abe3fcd165b5886))

## [6.13.1] - 2026-02-28

### Added
- **consolidateSystemMessages** utility to merge multiple system messages into one at index 0.
- **Test isolation helpers** `createIsolatedTestEnv` and `assertSafeForWrite`.
- Migration for v6.12 presets-format configs (in‑memory, with warning).

### Fixed
- `/swarm` command template: `{{arguments}}` → `$ARGUMENTS` with LLM no‑op instruction.
- `install()` default config: preset/presets schema → agents schema.
- DEFAULT_MODELS updates: `claude-sonnet-4-5` → `claude-sonnet-4-20250514`, `gemini-2.0-flash` → `gemini-2.5-flash`.

### Tests
- 20 new tests for consolidation utility.
- 14 new tests for isolation helper.

## [6.13.0] - 2026-02-28

### Added
- **Role-Scoped Tool Filtering**: AGENT_TOOL_MAP in src/config/constants.ts
  - Architect gets all 17+ tools
  - Other agents capped at 12 tools
  - Config option: tool_filter.enabled/overrides

- **Plan Cursor**: Compressed plan summary under 1,500 tokens
  - extractPlanCursor in src/hooks/extractors.ts
  - Priority 1 injection in system-enhancer
  - Config: plan_cursor.enabled/max_tokens/lookahead_tasks

- **Mode-Conditional System Injection**: detectArchitectMode in src/hooks/system-enhancer.ts
  - DISCOVER/PLAN/EXECUTE/PHASE-WRAP/UNKNOWN modes
  - DISCOVER mode suppresses: Plan Cursor, Decisions, Agent Context, Drift, Pre-Check
  - Phase Header always injects

- **Tool Output Truncation**: truncateToolOutput in src/utils/tool-output.ts
  - Config: tool_output.truncation_enabled/max_lines/per_tool
  - Only diff/symbols tools truncated by default
  - Footer with omitted lines count and retrieval guidance

- **ZodError Fixes**: src/config/plan-schema.ts
  - current_phase now optional with inference fallback
  - PhaseStatusSchema accepts both 'complete' and 'completed'
  - loadPlan guarded with try-catch in system-enhancer

### Tests
- 209 new tests across 6 test files

## [6.12.0] - 2026-02-27

### Added
- **Anti-Process-Violation Hardening**: Runtime detection hooks to catch architect workflow violations
  - Self-coding detection: Warns when architect uses write/edit tools directly instead of delegating to mega_coder
  - Gate tracking: Detects partial QA gate execution (skipping gates)
  - Self-fix detection: Warns when same agent fixes its own gate failure within 2 minutes
  - Batch detection: Detects "implement X and add Y" batching in delegation requests
  - Zero-coder-delegation detection: Catches when tasks complete without any coder delegation
  - Catastrophic violation warning: Warns when Phase >= 4 has zero reviewer calls

- **New state tracking fields** in `AgentSessionState`:
  - `architectWriteCount`: Tracks architect's direct code edits
  - `gateLog`: Tracks which QA gates have run
  - `reviewerCallCount`: Tracks mega_reviewer delegations
  - `lastGateFailure`: Records last failed gate for self-fix detection
  - `selfFixAttempted`: Flag for self-fix detection
  - `partialGateWarningIssued`: Dedup for partial gate warnings
  - `catastrophicPhaseWarnings`: Set of phases with catastrophic warnings
  - `lastCoderDelegationTaskId`: Tracks last delegated task for zero-delegation detection

- **Pipeline-tracker compliance escalation**: Phase >= 4 now includes explicit compliance reminders

### Changed
- **Architect prompt hardening**: Added 11 new enforcement blocks to the architect agent prompt:
  - ANTI-SELF-CODING RULES with concrete ✗/✓ rationalization examples
  - Tool-usage boundary clarifying Rule 1 (DELEGATE all coding)
  - Self-coding pre-check in Rule 4 fallback
  - PARTIAL GATE RATIONALIZATIONS anti-pattern list
  - ⛔ TASK COMPLETION GATE hard-stop checklist
  - precheckbatch SCOPE BOUNDARY (Stage A gates only)
  - Rule 7 STAGE A / STAGE B restructure
  - CATASTROPHIC VIOLATION CHECK for zero-reviewer scenarios
  - GATE FAILURE RESPONSE RULES with structured rejection format
  - Rule 3 BATCHING DETECTION + split requirement
  - RETRY PROTOCOL with resume-at-step instruction

- **Delegation gate enhanced**: Batch detection now catches 8 patterns including verb+and+verb, "while you're at it", and compound task descriptions

### Fixed
- **Path traversal in `isOutsideSwarmDir`**: Now uses `path.resolve()` and `path.relative()` for proper normalization instead of simple prefix check (fixes `.swarm/../src/evil.ts` bypass)
- **Lint errors across codebase**: Fixed 30+ lint errors in checkpoint.ts, test-runner.ts, pkg-audit.ts, placeholder-scan.ts, syntax-check.ts, trigger.ts

### Security
- **Path traversal bypass fixed**: The `isOutsideSwarmDir` function in `guardrails.ts` now correctly detects traversal attempts like `.swarm/../src/evil.ts`, `../.swarm/../../etc/passwd`, and URL-encoded variants
- **135 adversarial security tests**: Comprehensive coverage of path traversal, prototype pollution, state mutation, gate bypass, and batch detection evasion attacks

### Tests
- **487 new v6.12 tests** across 8 test files:
  - `self-coding-detection.test.ts`: 40+ tests for self-coding, batch, self-fix detection
  - `gate-tracking.test.ts`: Gate tracking, reviewer count, delegation violation tests
  - `guardrails-catastrophic-warning.test.ts`: Catastrophic warning injection, deduplication, edge cases
  - `guardrails-v612-adversarial.test.ts`: Circuit breaker, config tampering, state pollution attacks
  - Plus updates to existing test files for new hook behaviors
- **34 new path traversal adversarial tests** in `guardrails-pathtraversal-adversarial.test.ts`

---

## v6.11.1 - Packaging Fix (2026-02-27)

### Fixes

- Remove `postinstall` hook to avoid Bun dependency during npm global install
- Grammars are bundled via `bun run build` into `dist/lang/grammars`

## v6.11.0 - Architect Prompt Hardening (2026-02-26)

### Workflow Hardening

#### MODE Labels — Clear Architect Workflow Phases
Renamed internal workflow headers from "Phase N" to explicit MODE labels:
- `MODE: RESUME` — Resume detection
- `MODE: CLARIFY` — Requirement clarification
- `MODE: DISCOVER` — Codebase exploration
- `MODE: CONSULT` — SME consultation
- `MODE: PLAN` — Plan creation
- `MODE: CRITIC-GATE` — Plan review checkpoint
- `MODE: EXECUTE` — Task implementation
- `MODE: PHASE-WRAP` — Phase completion

**NAMESPACE RULE**: MODE labels refer to architect's internal workflow. Project plan phases remain "Phase N" in plan.md.

#### ⛔ HARD STOP — Pre-Commit Checklist
Mandatory 4-item checklist before marking any task complete:
- [ ] All QA gates passed (lint:check, secretscan, sast_scan)
- [ ] Reviewer approval documented
- [ ] Tests pass with evidence
- [ ] No security findings

There is no override. A commit without a completed QA gate is a workflow violation.

#### Observable Output — Required Print Statements
All blocking steps (5c-5m) now require explicit output:
```
→ REQUIRED: Print {description} on all blocking steps
```
Ensures visibility into gate progress and failure points.

### Task Quality Enforcement

#### Task Granularity Rules
Tasks classified as SMALL/MEDIUM/LARGE with decomposition requirements:
- **SMALL**: 1 file, single verb, <2 hours
- **MEDIUM**: 1-2 files, compound action, <4 hours
- **LARGE**: Must decompose into smaller tasks

#### Task Atomicity Checks
Critic validates tasks are not oversized:
- Max 2 files per task (otherwise decompose)
- No compound verbs ("and", "plus", "with") in task descriptions
- Clear acceptance criteria required

#### TASK COMPLETION CHECKLIST
Emit before marking task complete:
- Evidence written to `.swarm/evidence/{taskId}/`
- plan.md updated with `[x] task complete`
- Completion confirmation printed

### Failure Handling

#### FAILURE COUNTING
Retry counter with escalation after 5 failures:
```
RETRY #{count}/5
```

#### RETRY PROTOCOL
Structured rejection format on gate failure:
```
RETRY #{count}/5
FAILED GATE: {gate_name}
REASON: {specific failure}
REQUIRED FIX: {actionable instruction}
RESUME AT: {step_5x}
```

### Anti-Rationalization

#### ANTI-EXEMPTION RULES (8 patterns blocked)
The following rationalizations are explicitly blocked:
1. "It's a simple change"
2. "Just updating docs"
3. "Only a config tweak"
4. "Hotfix, no time for QA"
5. "The tests pass locally"
6. "I'll clean it up later"
7. "No logic changes"
8. "Already reviewed the pattern"

There are NO simple changes. There are NO exceptions to the QA gate sequence.

### Security

#### AUTHOR BLINDNESS WARNING
Added to coder prompt: warns against self-review bias and requires treating own code with same scrutiny as others'.

### Updated Phase 5 QA Gate Sequence

```
coder → diff → syntax_check → placeholder_scan → imports → 
lint fix → build_check → pre_check_batch (4 parallel: lint:check, secretscan, sast_scan, quality_budget) → 
reviewer → security review → verification tests → adversarial tests → coverage check → complete
```

**Note**: `secretscan` and `sast_scan` now run inside `pre_check_batch`, not as standalone steps.

### Files Changed
- `src/agents/architect.ts` — MODE labels, HARD STOP, observable output, anti-exemption rules
- `src/agents/critic.ts` — Task granularity checks, atomicity validation
- `src/agents/coder.ts` — Author blindness warning
- `tests/unit/agents/architect-gates.test.ts` — Gate sequence tests
- `tests/unit/agents/architect-v6-prompt.test.ts` — Prompt structure validation
- `tests/unit/agents/architect-workflow-security.test.ts` — Security gate tests
- `tests/unit/agents/architect-adversarial.test.ts` — Anti-rationalization tests

---

## v6.10.0 - Parallel Pre-Check Batch (2026-02-26)

### New Features

#### pre_check_batch - Parallel Verification Tooling

**4x faster QA gates** by running independent checks in parallel:

- **lint:check** - Code quality verification (hard gate)
- **secretscan** - Secret detection (hard gate)  
- **sast_scan** - Static security analysis with 63+ rules (hard gate)
- **quality_budget** - Maintainability threshold enforcement

**Benefits**:
- Reduces total gate time from ~60s (sequential) to ~15s (parallel)
- All tools run via `p-limit` with max 4 concurrent operations
- Individual tool timeouts (60s) prevent cascading failures
- Unified `gates_passed` boolean for simplified gate logic

### New Configuration

```json
{
  "pipeline": {
    "parallel_precheck": true  // default: true
  }
}
```

Set to `false` to run gates sequentially (useful for debugging or resource constraints).

### Updated Phase 5 QA Gate Sequence

```
coder → diff → syntax_check → placeholder_scan → imports → 
lint fix → build_check → pre_check_batch (parallel) → 
reviewer → security reviewer → test_engineer → coverage check
```

### System Hints

Architect receives hints about parallel vs sequential mode via system enhancer hook. Phase 5 prompt updated to use `pre_check_batch` after `build_check`.

### Dependencies

- Added `p-limit@7.3.0` for concurrency control

### Upgrade Guide

**No breaking changes.**

1. Update to v6.10.0
2. Parallel pre-check enabled by default
3. Set `pipeline.parallel_precheck: false` to disable if needed
4. Run `bun test` to verify installation

---

## v6.9.0 - Quality & Anti-Slop Tooling (2026-02-25)

### New Features

#### syntax_check - Tree-sitter Parse Validation
- Validates syntax across 9+ languages (JS/TS, Python, Go, Rust, Java, PHP, C, C++, C#)
- Uses Tree-sitter parsers for accurate error detection
- Runs before all other gates to catch syntax errors early

#### placeholder_scan - Anti-Slop Detection
- Detects TODO/FIXME/TBD/XXX comments in production code
- Identifies placeholder text and stub implementations
- Prevents shipping incomplete or "sloppy" code
- Configurable allow_globs for docs/tests directories

#### sast_scan - Static Security Analysis
- 63+ offline security rules across 9 languages
- High-signal, low false-positive detection
- Tier A: Built-in rules (always available)
- Tier B: Optional Semgrep integration (if on PATH)
- Rules cover: eval, command injection, deserialization, buffer overflow, etc.

#### sbom_generate - Dependency Tracking
- Generates CycloneDX v1.5 SBOMs
- Supports 8 ecosystems: Node.js, Python, Rust, Go, Java, .NET, Swift, Dart
- Parses lock files: package-lock.json, Cargo.lock, poetry.lock, go.sum, etc.
- Non-blocking evidence collection

#### build_check - Build Verification
- Runs repo-native build/typecheck commands
- Supports 10+ ecosystems with automatic detection
- Graceful skip when toolchain unavailable
- Captures build output for debugging

#### quality_budget - Maintainability Enforcement
- Enforces 4 quality metrics:
  - Complexity delta (cyclomatic complexity)
  - Public API delta (new exports)
  - Duplication ratio (copy-paste detection)
  - Test-to-code ratio (coverage proxy)
- Configurable thresholds per project
- Integrated with `/swarm benchmark --ci-gate`

### New Evidence Types
- `syntax` - Syntax check results
- `placeholder` - Placeholder scan findings
- `sast` - Security analysis findings
- `sbom` - Software Bill of Materials
- `build` - Build verification results
- `quality_budget` - Quality metrics and violations

### Configuration

New `gates` config section in `.opencode/swarm.json`:

```json
{
  "gates": {
    "syntax_check": { "enabled": true },
    "placeholder_scan": { "enabled": true },
    "sast_scan": { "enabled": true },
    "sbom_generate": { "enabled": true },
    "build_check": { "enabled": true },
    "quality_budget": {
      "enabled": true,
      "max_complexity_delta": 5,
      "max_public_api_delta": 10,
      "max_duplication_ratio": 0.05,
      "min_test_to_code_ratio": 0.3
    }
  }
}
```

### Complete QA Gate Sequence

```
coder → diff → syntax_check → placeholder_scan → imports → 
lint → secretscan → sast_scan → build_check → quality_budget → 
reviewer → security reviewer → test_engineer → coverage check
```

### Local-Only Guarantee

All v6.9.0 quality tools run **locally** without:
- Docker containers
- Network connections
- External APIs
- Cloud services

Optional enhancement: Semgrep (only if already installed on PATH)

### Upgrade Guide

**No breaking changes.**

1. Update to v6.9.0
2. New gates are enabled by default
3. Configure thresholds in `.opencode/swarm.json` (optional)
4. Run `bun test` to verify installation

### Stats
- 6 new tools
- 6 new evidence types
- 12 total evidence types
- 1,100+ tests passing
- 63 SAST rules
- 9 supported languages

---

## Previous Versions

### v6.8.x
- Evidence system
- Benchmark suite
- CI gate

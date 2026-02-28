# Changelog

## [6.14.0](https://github.com/zaxbysauce/opencode-swarm/compare/opencode-swarm-v6.13.1...opencode-swarm-v6.14.0) (2026-02-28)


### Features

* agent guardrails circuit breaker (v4.6.0) ([7127233](https://github.com/zaxbysauce/opencode-swarm/commit/7127233bb953d4816c15a5a6128e4ecc4a76e558))
* canonical plan schema with JSON persistence and migration (v5.0.0 Phase 1) ([79cd855](https://github.com/zaxbysauce/opencode-swarm/commit/79cd85542dc668d9a01f1680dd997731840cbdd0))
* context injection budget with priority-ordered tryInject (v5.0.0 Phase 5.1) ([8c6db95](https://github.com/zaxbysauce/opencode-swarm/commit/8c6db958c41d8acd51127f5965530a4e61009b32))
* DX, quality & feature enhancement (v4.4.0) ([e19df7a](https://github.com/zaxbysauce/opencode-swarm/commit/e19df7a814bd7950084a3de7297ea39540a79022))
* enhanced agent view with guardrail profiles + packaging smoke tests (v5.0.0 Phase 4) ([c4e72bf](https://github.com/zaxbysauce/opencode-swarm/commit/c4e72bf3618a00cfb9d0ac6f973a5d129f195af5))
* evidence bundles with retention and archiving (v5.0.0 Phase 2) ([25f5b95](https://github.com/zaxbysauce/opencode-swarm/commit/25f5b95ea3eefb87d03b637b624f8f668b63541a))
* implement per-invocation guardrails for v5.2.0 ([4d55ebf](https://github.com/zaxbysauce/opencode-swarm/commit/4d55ebf99fff151dcd07a5bbf2172b6494b28a6c))
* implement v6.4 execution planning tools and security hardening ([51ed4c3](https://github.com/zaxbysauce/opencode-swarm/commit/51ed4c3618350956581a75cbd154ed0b3f3f4260))
* per-agent guardrail profiles with configurable limits (v5.0.0 Phase 3) ([fd3533f](https://github.com/zaxbysauce/opencode-swarm/commit/fd3533f5febf42703cf527bfb25218c52540a725))
* raise default architect guardrails limits (3x base duration and tool calls) ([f06f371](https://github.com/zaxbysauce/opencode-swarm/commit/f06f37139d3962863d4f86b13cbae729be7f7d88))
* release v6.8.0 — complete background automation ([c4082f7](https://github.com/zaxbysauce/opencode-swarm/commit/c4082f76ee40df131faa7edc79e17cb73f1e0455))
* ship v6.7 GUI-first background automation ([f4c3022](https://github.com/zaxbysauce/opencode-swarm/commit/f4c302266ad92e47e41396024a8354b579b6bf4f))
* **state:** Add shared state module for cross-hook state sharing ([363516d](https://github.com/zaxbysauce/opencode-swarm/commit/363516d87c283d028452c21ae4f544bef302bbac))
* tech debt cleanup, slash commands, README overhaul (v4.5.0) ([ea24320](https://github.com/zaxbysauce/opencode-swarm/commit/ea24320b2c3f67447e87cd6ddb2d6439d54f59e3))
* v5.0.0 — verifiable execution with evidence bundles, guardrail profiles, and injection budget ([2a35aec](https://github.com/zaxbysauce/opencode-swarm/commit/2a35aecb08d16df4a61bc1ba46579755b553b273))
* **v5.1.0:** score-based context injection (opt-in) ([4724329](https://github.com/zaxbysauce/opencode-swarm/commit/4724329d3e7336a69511921acd01479ce931bb4b))
* **v5.1.2:** /swarm benchmark command with CI gate ([39e3eff](https://github.com/zaxbysauce/opencode-swarm/commit/39e3effbcf8221b1552cdad1caacf603bd98945f))
* **v5.1.3:** reversible summaries for oversized tool outputs ([fdbd9ee](https://github.com/zaxbysauce/opencode-swarm/commit/fdbd9ee8a444c7f7e557e70c65fe3101069e4d4f))
* v6.0.0 — Core QA & Security Gates ([d48a5ef](https://github.com/zaxbysauce/opencode-swarm/commit/d48a5ef63521c531f753fc4c20d578dfa989e752))
* v6.12.0 Anti-Process-Violation Hardening ([40542ed](https://github.com/zaxbysauce/opencode-swarm/commit/40542edc21d6e48dfd8c8548d0cd8af03f6dc408))
* v6.13.1 system message consolidation + test isolation + config fixes ([d2c6d1c](https://github.com/zaxbysauce/opencode-swarm/commit/d2c6d1cab8ecde703db238ae5af7773cce2a9f5d))


### Bug Fixes

* add fourth exemption layer for architect circuit breaker ([28bf07f](https://github.com/zaxbysauce/opencode-swarm/commit/28bf07f8d9372897c0606c6267de190d8cbd80a7))
* **agents:** harden subagent identity to prevent delegation confusion (v4.3.1) ([9a52471](https://github.com/zaxbysauce/opencode-swarm/commit/9a524717b24a0f8dc574d284f9ac9dd0725cbb18))
* architect session stuck with 30-minute limit ([4f20a93](https://github.com/zaxbysauce/opencode-swarm/commit/4f20a9384adde29b751bb49002452dd37370ccfc))
* avoid npm install failure by dropping postinstall hook ([4ed1c18](https://github.com/zaxbysauce/opencode-swarm/commit/4ed1c189860f21a7caca23288efc5953fafb75a4))
* circuit breaker killing architect sessions — unlimited duration + idle timeout ([634977d](https://github.com/zaxbysauce/opencode-swarm/commit/634977dba2c89d6d5b3838eee8fdad65032e1e14))
* circuit breaker triggers too early — per-agent profiles and softened messages ([ee1a0be](https://github.com/zaxbysauce/opencode-swarm/commit/ee1a0be0efec712935da4dade588e6d40eb3993f))
* default unknown agent guardrails to architect limits ([e144bdb](https://github.com/zaxbysauce/opencode-swarm/commit/e144bdbfbfe4ab8c7ff0a629416452f0feb4bc05))
* guardrails circuit breaker now recognizes prefixed architect agents for any swarm name ([b371e89](https://github.com/zaxbysauce/opencode-swarm/commit/b371e89fc9df6b99fda978ad5d8be776b8b132e0))
* guardrails disable bypass + prevent unknown orchestrator session (v6.1.2) ([7cc0a11](https://github.com/zaxbysauce/opencode-swarm/commit/7cc0a11bd21b4e096429c26bc5c0cd47a6b736df))
* guardrails race condition — sessions no longer created with wrong agent name ([00311a9](https://github.com/zaxbysauce/opencode-swarm/commit/00311a9327475fbe513bd607da75f6bccda142ae))
* prevent architect guardrail duration regression ([96f9e6a](https://github.com/zaxbysauce/opencode-swarm/commit/96f9e6a594f801671b01d0add6ad665cb50a60c3))
* prevent stale 30-minute guardrail via agent switching; make architect tool limits unlimited ([20207de](https://github.com/zaxbysauce/opencode-swarm/commit/20207de38b8314f468cf76fb2dee50a3a61994e1))
* prevent stale 30-minute guardrail via agent switching; make architect tool limits unlimited ([370573d](https://github.com/zaxbysauce/opencode-swarm/commit/370573d461058794f7c9c6b68cae3f1e7f5639f4))
* remove [@agent](https://github.com/agent)_name prefixes from delegation prompts to prevent subagent self-delegation ([4fc9fed](https://github.com/zaxbysauce/opencode-swarm/commit/4fc9fedc8085c08e223d4435e05aa31640b847ac))
* resolve delegation tracker race condition and bump version to 5.1.8 ([b7c15fe](https://github.com/zaxbysauce/opencode-swarm/commit/b7c15fe221a0294b0f6b9e9e97a08d3f5e3144f0))
* **security:** defense-in-depth hardening (v4.3.2) ([a232242](https://github.com/zaxbysauce/opencode-swarm/commit/a232242fdf0bb8fd8131e1dade4ab53c4b8af8be))
* stabilize delegation tracking and ignore swarm data ([0888e11](https://github.com/zaxbysauce/opencode-swarm/commit/0888e11237fadf4452f2394d92fee2e9340fe374))
* stabilize test-agent prompts and flaky tool tests ([5b9fb4e](https://github.com/zaxbysauce/opencode-swarm/commit/5b9fb4e1cf44cb667920eb5835290330bf9d2b00))
* Strengthen architect review gate enforcement - explicit STOP on REJECTED verdict ([65db123](https://github.com/zaxbysauce/opencode-swarm/commit/65db1236b0761fbc6c83c71407b8e9645ffa72b3))
* **tests:** update system-enhancer tests to expect SWARM HINT injection ([58907a6](https://github.com/zaxbysauce/opencode-swarm/commit/58907a6b50bf9bc45796ab030a8b2cbd393f3909))
* TypeScript errors from optional current_phase ([284bc5f](https://github.com/zaxbysauce/opencode-swarm/commit/284bc5f574ef87210063c0bc8abe3fcd165b5886))
* update benchmark command and test for InvocationWindow model ([f2fc49d](https://github.com/zaxbysauce/opencode-swarm/commit/f2fc49d4bcb03c5bc4b0f81039975ae6590afcaa))
* **v5.1.1:** structural architect guardrail exemption + delegation gate hook ([dac7920](https://github.com/zaxbysauce/opencode-swarm/commit/dac7920adfd4d8b1dc3aac610aac84003aa61c7d))
* **v5.1.5:** architect circuit breaker race condition ([3c1eca1](https://github.com/zaxbysauce/opencode-swarm/commit/3c1eca133e3e83daeb8d6632c63bd1e45b23aa47))
* **v5.1.6:** harden architect handoff and unknown-agent guardrails ([e11fd4e](https://github.com/zaxbysauce/opencode-swarm/commit/e11fd4e813bd313ff9b21aa2d31cec0ca1270edd))
* **v5.1.7:** normalize architect identity matching ([615fac5](https://github.com/zaxbysauce/opencode-swarm/commit/615fac5511903b3dd48440aebc7b2e9cdef2cc85))
* v6.0.1 — guardrails bug fixes (config fallback, session isolation, deep merge, disabled skip) ([a508521](https://github.com/zaxbysauce/opencode-swarm/commit/a508521ea24f78fdb3a8a2ed1493b92d47cca8cd))
* v6.1.1 — security fix (_loadedFromFile bypass), tech debt cleanup, retrieve_summary registered ([d70f7ea](https://github.com/zaxbysauce/opencode-swarm/commit/d70f7eaff12931c79c3ef3ebac26aca1b8805a59))

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

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.0.1] - 2026-02-10
### Changed
- **Default architect guardrails** — The architect agent now automatically receives higher circuit breaker limits (600 tool calls, 90 min duration, 8 consecutive errors, 0.7 warning threshold) via `DEFAULT_ARCHITECT_PROFILE`. Proportional 3× scaling matches the architect's orchestration role. User-defined `profiles.architect` entries still take full precedence.

### Tests
- **7 new tests** for architect default profile resolution (automatic application, user override precedence, non-architect isolation, schema bounds validation).
- **883 total tests** across 39 files (up from 876 in v5.0.0).

## [5.0.0] - 2026-02-09
### Added
- **Canonical plan schema** — Machine-readable `plan.json` with Zod-validated `PlanSchema`, `TaskSchema`, and `PhaseSchema`. Structured task status (`pending`, `in_progress`, `completed`, `blocked`), phase-level status tracking, and schema versioning (`schema_version: "1.0"`).
- **Plan migration** — Automatic migration from legacy `plan.md` markdown format to structured `plan.json`. Preserves task status, dependencies, and phase structure. Idempotent and backward-compatible.
- **Evidence bundles** — Per-task execution evidence persisted to `.swarm/evidence/{taskId}/`. Five discriminated evidence types via Zod: `review` (with risk/issues), `test` (pass/fail counts), `diff` (files/additions/deletions), `approval`, and `note`. Atomic writes via temp+rename pattern.
- **Evidence retention** — Configurable retention policy: `max_age_days` (default: 90), `max_bundles` (default: 1000), `auto_archive` flag. `archiveEvidence()` function with maxBundles enforcement.
- **Evidence config** — `EvidenceConfigSchema` added to `PluginConfigSchema` with `enabled`, `max_age_days`, `max_bundles`, `auto_archive` fields.
- **`/swarm evidence [task]`** — View evidence bundles for a specific task or list all tasks with evidence.
- **`/swarm archive [--dry-run]`** — Archive old evidence bundles with dry-run support for previewing changes.
- **Per-agent guardrail profiles** — `GuardrailsProfileSchema` with optional override fields. `profiles` field in `GuardrailsConfigSchema` maps agent names to partial guardrail overrides. `resolveGuardrailsConfig()` pure merge function.
- **Context injection budget** — `max_injection_tokens` field in `ContextBudgetConfigSchema` (range: 100–50,000, default: 4,000). Budget-aware `tryInject()` in system-enhancer with priority-ordered injection: phase → task → decisions → agent context. Lower-priority items dropped when budget exhausted.
- **Enhanced `/swarm agents`** — Agent count summary line, `⚡ custom limits` indicator for agents with guardrail profiles, and Guardrail Profiles summary section.
- **Packaging smoke tests** — 8 CI-safe tests validating `dist/` output: entry point existence, export verification, declaration files, and bundle integrity.
- **Evidence completeness check** in `/swarm diagnose` — Reports tasks missing evidence.

### Changed
- System enhancer (`src/hooks/system-enhancer.ts`) refactored to use budget-aware `tryInject()` helper instead of direct `output.system.push()`.
- Plan-related slash commands (`plan`, `history`, `diagnose`, `export`) updated to use structured plan manager.
- Guardrails `toolBefore` hook now resolves per-agent config via `resolveGuardrailsConfig(config, session.agentName)`.
- `/swarm agents` command now loads plugin config and passes guardrails data for profile display.
- Extractors updated for plan-aware hooks.

### Tests
- **208 new tests** across 9 new test files:
  - Plan schema and manager (80 tests)
  - Evidence schema (23 tests)
  - Evidence manager (25 tests)
  - Archive command (8 tests)
  - Evidence config (8 tests)
  - Guardrail profiles (35 tests)
  - Enhanced agent view (15 tests)
  - Packaging smoke tests (8 tests)
  - Injection budget (7 tests)
- **876 total tests** across 39 files (up from 668 in v4.6.0).

## [4.6.0] - 2026-02-09
### Added
- **Agent guardrails circuit breaker** — Two-layer protection against runaway subagents. Soft warning at 50% of configurable limits, hard block at 100%. Detection signals: tool call count, wall-clock duration, consecutive repetition (same tool+args hash), and consecutive errors (null/undefined output).
- **`GuardrailsConfig` schema** — Zod-validated configuration with 6 tunable fields (`enabled`, `max_tool_calls`, `max_duration_minutes`, `max_repetitions`, `max_consecutive_errors`, `warning_threshold`), all with sensible defaults and range validation.
- **Per-session agent state tracking** — `AgentSessionState` interface with `startAgentSession()`, `endAgentSession()`, `getAgentSession()` in `src/state.ts`. Includes stale session eviction (2-hour TTL).
- **`hashArgs()` utility** — Deterministic argument hashing for repetition detection, exported for testing.

### Changed
- Plugin entry (`src/index.ts`) now registers guardrails hooks (`tool.execute.before`, `tool.execute.after`, `experimental.chat.messages.transform`) composed with existing handlers via `composeHandlers()`.
- `guardrailsHooks.toolBefore` runs **without** `safeHook` wrapper so thrown errors propagate to block tool execution at circuit-breaker limits.

### Tests
- **46 new tests** — Guardrails hooks (31 tests), agent session state (7 tests), guardrails config schema (8 tests).
- **668 total tests** across 30 files (up from 622 in v4.5.0).

## [4.5.0] - 2026-02-07
### Fixed
- Replaced string concatenation with template literals in hooks (`agent-activity.ts`, `system-enhancer.ts`).
- Documented 7 `as any` casts in `src/index.ts` with `biome-ignore` comments explaining the Plugin API type limitation.
- Extracted `stripSwarmPrefix()` utility to eliminate 3 duplicate prefix-stripping blocks in `src/agents/index.ts`.

### Added
- **`/swarm diagnose`** — Health check for `.swarm/` files, plan structure validation, and plugin configuration.
- **`/swarm export`** — Export plan.md and context.md as portable JSON with version and timestamp.
- **`/swarm reset --confirm`** — Clear `.swarm/` state files with safety confirmation gate.
- `stripSwarmPrefix()` utility function with input validation, exported for testing.

### Changed
- README.md updated with all v4.3.2–v4.5.0 features, 8 slash commands, CLI docs, and troubleshooting guide.
- Version badge updated to 4.5.0, test count updated to 622.

### Tests
- New test suites: `stripSwarmPrefix` (8 tests), diagnose command (7 tests), export command (7 tests), reset command (7 tests).
- **622 total tests** across 29 files (up from 592 in v4.4.0).

## [4.4.0] - 2026-02-07
### Changed
- Updated `@opencode-ai/plugin` and `@opencode-ai/sdk` to 1.1.53.
- Updated `@biomejs/biome` to 2.3.14.

### Added
- **CLI `uninstall` command** with `--clean` flag for removing the plugin from opencode.json and optionally cleaning up config files.
- **Custom error classes** (`SwarmError`, `ConfigError`, `HookError`, `ToolError`, `CLIError`) with actionable `guidance` messages for better DX.
- **`/swarm history` slash command** — view completed phases from plan.md with status icons and task counts.
- **`/swarm config` slash command** — view current resolved plugin configuration and config file paths.
- **Enhanced `safeHook` error logging** — SwarmError instances now include guidance text in warning output.

### Tests
- Expanded test coverage for hooks: extractors, system-enhancer, context-budget, agent-activity, delegation-tracker, compaction-customizer, pipeline-tracker (45 new edge case tests).
- Expanded test coverage for commands: status, plan, agents, dispatcher (14 new edge case tests).
- New test suites: CLI uninstall (9 tests), error classes (9 tests), history command (6 tests), config command (4 tests).
- **592 total tests** (up from 506 in v4.3.2).

## [4.3.2] - 2026-02-07
### Security
- **Path validation** — Added `validateSwarmPath()` to prevent directory traversal in `.swarm` file operations. Rejects null bytes, `..` traversal sequences, and paths escaping the `.swarm` directory. Windows-aware case-insensitive comparison.
- **Fetch hardening** — Added 10s timeout (AbortController), 5MB response size limit, and retry logic (2 retries with exponential backoff on 5xx/network errors) to the gitingest tool.
- **Deep merge depth limit** — Added `MAX_MERGE_DEPTH=10` to `deepMerge` to prevent stack overflow from deeply nested config objects.
- **Config file size limit** — Added `MAX_CONFIG_FILE_BYTES=102400` (100KB) check in `loadConfigFromPath` to prevent memory exhaustion from oversized config files.

### Added
- **23 new security-focused tests** (506 total) — Path validation (11), fetch hardening (7), merge depth limit (3), config size limit (2).

## [4.3.1] - 2026-02-07
### Fixed
- **Agent identity hardening** — Added `## IDENTITY` block at the top of all 6 subagent prompts (coder, explorer, sme, reviewer, critic, test_engineer) with explicit anti-delegation directives, WRONG/RIGHT examples, and explanation that @agent references in task payloads are orchestrator context, not delegation instructions. Fixes issue where subagents would attempt to delegate via the Task tool instead of doing work themselves.

### Added
- **36 new tests** (483 total) — Identity hardening tests verify anti-delegation markers in all subagent prompts.

## [4.3.0] - 2026-02-07
### Added
- **Hooks pipeline system** — `safeHook()` crash-safety wrapper and `composeHandlers()` for composing multiple handlers on the same hook type. Foundation for all v4.3.0 features.
- **System prompt enhancer** (`experimental.chat.system.transform`) — Injects current phase, task, and key decisions from `.swarm/` files into agent system prompts, keeping agents focused post-compaction.
- **Session compaction enhancer** (`experimental.session.compacting`) — Enriches OpenCode's built-in session compaction with plan.md phase info and context.md decisions.
- **Context budget tracker** (`experimental.chat.messages.transform`) — Estimates token usage and injects budget warnings at configurable thresholds (70%/90%). Supports per-model token limits.
- **Slash commands** — `/swarm status`, `/swarm plan [N]`, `/swarm agents`. Registered via `config` hook and handled via `command.execute.before`.
- **Agent awareness: activity tracking** — `tool.execute.before`/`tool.execute.after` hooks track tool usage per agent. Flushes activity summary to `context.md` every 20 events with promise-based write lock.
- **Agent awareness: delegation tracker** — `chat.message` hook tracks active agent per session. Opt-in delegation chain logging (disabled by default).
- **Agent awareness: cross-agent context injection** — System enhancer reads Agent Activity section from context.md and injects relevant context labels (coder/reviewer/test_engineer) into system prompts. Configurable max chars (default: 300).
- **Shared swarm state** (`src/state.ts`) — Module-scoped singleton with zero imports. Tracks agent map, event counters, and flush locks. `resetSwarmState()` for testing.
- **238 new tests** (447 total, up from 209) across 12 new test files covering hooks, commands, state, and agent awareness.

### Changed
- **System enhancer** now also injects cross-agent context from the Agent Activity section of context.md.
- **Plugin entry** (`src/index.ts`) registers 7 hook types (up from 1): `experimental.chat.messages.transform`, `experimental.chat.system.transform`, `experimental.session.compacting`, `command.execute.before`, `tool.execute.before`, `tool.execute.after`, `chat.message`.
- **Pipeline tracker** refactored to use `safeHook()` wrapper.
- **Config schema** extended with `hooks` and `context_budget` groups for fine-grained feature control.

## [4.2.0] - 2026-02-07
### Added
- **Comprehensive test suite** — 209 unit tests across 9 test files using Bun's built-in test runner. Zero additional dependencies.
  - Config tests: constants (14), schema validation (27), config loader with XDG isolation (17)
  - Tools tests: domain detector (30), file extractor with temp dirs (16), gitingest with fetch mocking (5)
  - Agent tests: creation functions (64), factory + swarm prefixing (20)
  - Hooks tests: pipeline tracker transform behavior (16)
- Exported `deepMerge` from `src/config/loader.ts` and `extractFilename` from `src/tools/file-extractor.ts` for testability.

## [4.1.0] - 2026-02-06
### Added
- **Critic agent** — New plan review gate that evaluates the architect's plan BEFORE implementation begins. Returns APPROVED/NEEDS_REVISION/REJECTED verdicts with confidence scores and up to 5 prioritized issues. Includes AI-slop detection.
- **Phase 4.5 (Critic Gate)** in architect workflow — Mandatory plan review between planning and execution. Max 2 revision cycles before escalating to user.
- **Gap analysis** in Phase 2 discovery — Architect now makes a second explorer call focused on hidden requirements, unstated assumptions, and scope risks.

### Changed
- **Test engineer** now writes AND runs tests, reporting structured PASS/FAIL verdicts instead of only generating test files. 3-step workflow: write → run → report.
- **Architect prompt** updated with test execution delegation examples and verdict loop in Phase 5 (5d-5f).
- Updated all documentation (README.md, architecture.md, design-rationale.md, installation.md) to reflect new agent structure and workflow.

## [4.0.1] - 2026-02-06
### Fixed
- Strengthened architect review gate enforcement — explicit STOP instruction on REJECTED verdict to prevent proceeding to test generation before code review passes.

## [4.0.0] - 2026-02-06
### Changed
- **BREAKING:** Replaced 16 individual SME agents (sme_security, sme_vmware, sme_python, etc.) with a single open-domain `sme` agent. The architect determines the domain and the LLM's training provides expertise.
- **BREAKING:** Merged `security_reviewer` and `auditor` into a single `reviewer` agent. Architect specifies CHECK dimensions per review.
- **BREAKING:** Removed `_sme` and `_qa` category prefix config options.
- **BREAKING:** Config schema changes — `multi_domain_sme` and `auto_detect_domains` options removed.
- Agent count reduced from 20+ to 7 per swarm (architect, explorer, sme, coder, reviewer, test_engineer).
- Swarm identity managed exclusively through system prompt template variables ({{SWARM_ID}}, {{AGENT_PREFIX}}).
- Phase 0 now cleans up stale identity memory blocks on swarm mismatch.
# OpenCode Swarm Architecture

## Design Philosophy

OpenCode Swarm is built on a simple premise: **multi-agent systems fail when they're unstructured**.

Most frameworks throw agents at a problem and hope coherence emerges. It doesn't. You get race conditions, conflicting changes, lost context, and code that doesn't work.

Swarm enforces discipline:
- One Architect owns all decisions
- One task executes at a time
- Every task gets QA'd before the next starts
- Project state persists in files, not memory

---

## Control Model

```
                    ┌─────────────┐
                    │  ARCHITECT  │
                    │  (control)  │
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│   EXPLORER    │  │     SMEs      │  │   PIPELINE    │
│  (discovery)  │  │  (advisory)   │  │ (execution)   │
└───────────────┘  └───────────────┘  └───────────────┘
                                              │
                                   ┌──────────┴──────────┐
                                   │                     │
                                   ▼                     ▼
                           ┌─────────────┐       ┌─────────────┐
                           │    CODER    │       │     QA      │
                           │ (implement) │       │  (verify)   │
                           └─────────────┘       └─────────────┘
```

### Architect: The Brain
- Owns the plan
- Makes all delegation decisions
- Synthesizes inputs from other agents
- Handles failures and escalations
- Maintains project memory

### Explorer: The Eyes
- Fast codebase scanner
- Identifies structure, languages, frameworks, key files
- Read-only (cannot write code)

### Designer: The Blueprint
- UI/UX specification agent
- Generates component scaffolds and design tokens before coding begins on UI-heavy tasks
- Runs in MODE: EXECUTE before Coder (Rule 9)

### SME: The Advisor
- Single open-domain expert (any domain: security, ios, rust, kubernetes, etc.)
- Consulted serially, one call per domain
- Guidance cached in context.md
- Read-only (cannot write code)

### Pipeline Agents: The Hands
- Coder: Implements one task at a time
- Reviewer: Dual-pass review — general correctness first, then automatic security-only pass for security-sensitive files (OWASP Top 10 categories)
- Test Engineer: Generates verification tests + adversarial tests (attack vectors, boundary violations, injection attempts)
- Gates: Automated `diff`, `imports`, `lint`, and `secretscan` tools verify contracts, dependencies, style, and security before/during review.

### Critic: The Gate
- Reviews architect's plan BEFORE implementation begins
- Returns APPROVED / NEEDS_REVISION / REJECTED
- Read-only (cannot write code)

### Docs: The Scribe
- Documentation synthesizer
- Automatically updates READMEs, API docs, and guides based on implementation changes
- Runs in Phase 6 as part of project wrap-up

---

## Execution Flow

### Phase 0: Initialize or Resume

```
Is .swarm/plan.md present?
├── YES → Read plan.md and context.md
│         Find current phase and task
│         Resume execution
│
└── NO  → New project
          Proceed to Phase 1
```

### Phase 1: Clarify

```
Is the user request clear?
├── YES → Proceed to Phase 2
│
└── NO  → Ask up to 3 clarifying questions
          Wait for answers
          Then proceed
```

### Phase 2: Discover

```
@explorer analyzes codebase
    │
    ├── Project structure
    ├── Languages and frameworks
    ├── Key files
    ├── Patterns observed
    └── Relevant SME domains
```

### Phase 3: Consult SMEs

```
For each relevant domain:
    │
    ├── Check context.md for cached guidance
    │   └── If cached → Skip this SME
    │
    └── If not cached:
        ├── Delegate to @sme with DOMAIN: [domain]
        ├── Wait for response
        └── Cache guidance in context.md
```

### Phase 4: Plan

```
Create/Update .swarm/plan.md:
    │
    ├── Project overview
    ├── Phases (logical groupings)
    │   └── Tasks (atomic units of work)
    │       ├── Dependencies
    │       ├── Acceptance criteria
    │       └── Complexity estimate
    │
    └── Status tracking
```

### Phase 4.5: Critic Gate

```
MODE: CRITIC-GATE

@critic reviews plan
    │
    ├── APPROVED → Proceed to MODE: EXECUTE
    ├── NEEDS_REVISION → Revise plan, resubmit (max 2 cycles)
    └── REJECTED → Escalate to user
```

### MODE: EXECUTE

```
For each task in current phase:
    │
    ├── Check dependencies complete
    │   └── If blocked → Skip, mark [BLOCKED]
    │
    ├── 5a. @coder implements (ONE task only)
    │       └── → REQUIRED: Print task start confirmation
    │
    ├── 5b. diff + imports tools analyze changes
    │       ├── Detect contract changes (exports, interfaces, types)
    │       ├── Track import dependencies across files
    │       └── → REQUIRED: Print change summary
    │
    ├── 5c. syntax_check validates code syntax (v6.9.0)
    │       ├── Tree-sitter parse validation for 9+ languages
    │       ├── Catches syntax errors before review
    │       └── → REQUIRED: Print syntax status
    │
    ├── 5d. placeholder_scan detects incomplete code (v6.9.0)
    │       ├── Scans for TODO/FIXME comments
    │       ├── Detects placeholder text and stub implementations
    │       └── → REQUIRED: Print placeholder scan results
    │
    ├── 5e. lint fix → lint:check (auto-fix then verify)
    │       ├── Run `lint` tool with fix mode, then check mode
    │       └── → REQUIRED: Print lint status
    │
    ├── 5f. imports audit analyzes dependencies (AST-based)
    │       ├── Track import dependencies across files
    │       └── → REQUIRED: Print import analysis
    │
    ├── 5g. build_check verifies compilation (v6.9.0)
    │       ├── Runs repo-native build/typecheck commands
    │       ├── Validates code compiles correctly
    │       └── → REQUIRED: Print build status
    │
    ├── 5h. pre_check_batch runs parallel verification (v6.10.0)
    │       ├── Runs 4 tools in parallel with p-limit (max 4 concurrent):
    │       │   ├── lint:check (code quality verification - hard gate)
    │       │   ├── secretscan (secret detection - hard gate)
    │       │   ├── sast_scan (security analysis - hard gate)
    │       │   └── quality_budget (maintainability metrics)
    │       ├── Returns unified result with gates_passed boolean
    │       ├── If gates_passed === false → Return to coder with specific failures
    │       └── → REQUIRED: Print gates_passed status

    ├── 5i. @reviewer reviews (correctness, edge-cases, performance)
    │       ├── APPROVED → Continue
    │       └── REJECTED → Retry from 5a (max 5)
    │       └── → REQUIRED: Print approval decision
    │
    ├── 5j. @reviewer security-only pass (if file matches security globs
    │       or coder output contains security keywords)
    │       ├── Security globs: auth, crypto, session, token, middleware, api, security
    │       ├── Uses OWASP Top 10 2021 categories
    │       └── → REQUIRED: Print security approval
    │
    ├── 5k. @test_engineer generates AND runs verification tests
    │       ├── PASS → Continue
    │       └── FAIL → Send failures to @coder, retry from 5a with RETRY protocol
    │       └── → REQUIRED: Print test results
    │
    ├── 5l. @test_engineer adversarial testing pass
    │       ├── Attack vectors, boundary violations, injection attempts
    │       ├── PASS → Continue
    │       └── FAIL → Send failures to @coder, retry from 5a with RETRY protocol
    │       └── → REQUIRED: Print adversarial test results
    │
    ├── 5m. ⛔ HARD STOP: Pre-commit checklist (v6.11.0)
    │       ├── [ ] All QA gates passed (lint:check, secretscan, sast_scan)
    │       ├── [ ] Reviewer approval documented
    │       ├── [ ] Tests pass with evidence
    │       └── [ ] No security findings
    │       └── → REQUIRED: Print checklist completion
    │       **No override. A commit without completed QA gate is a workflow violation.**
    │
    └── 5n. TASK COMPLETION CHECKLIST (v6.11.0)
            ├── Evidence written to .swarm/evidence/{taskId}/
            ├── plan.md updated with [x] task complete
            └── → REQUIRED: Print completion confirmation
```

### MODE: PHASE-WRAP

```
All tasks in phase done
    │
    ├── Re-run @explorer (codebase changed)
    ├── @docs synthesizer pass (updates docs per changes)
    ├── Update context.md with learnings
    ├── Archive to .swarm/history/phase-N.md
    │
    └── Ask user: "Ready for Phase [N+1]?"
```

---

## MODE Labels (v6.11)

The Architect workflow uses explicit **MODE** labels internally to distinguish architect execution phases from project plan phases:

| MODE | Description |
|------|-------------|
| `MODE: RESUME` | Detect and restore previous session state |
| `MODE: CLARIFY` | Ask clarifying questions for ambiguous requirements |
| `MODE: DISCOVER` | Explore codebase structure and patterns |
| `MODE: CONSULT` | Consult SMEs for domain guidance |
| `MODE: PLAN` | Create or update project plan |
| `MODE: CRITIC-GATE` | Plan review checkpoint before execution |
| `MODE: EXECUTE` | Task implementation with QA gates |
| `MODE: PHASE-WRAP` | Phase completion and retrospective |

**NAMESPACE RULE**: MODE labels refer to the architect's internal workflow phases. Project plan phases (in `.swarm/plan.md`) remain as "Phase N" to avoid confusion.

### Observable Output (v6.11)

All blocking steps require explicit printed output for visibility:

```
→ REQUIRED: Print {description}
```

This ensures:
- Clear progress tracking through gates
- Determinable failure points
- Evidence of execution for debugging

### Retry Protocol (v6.11)

On gate failure, emit structured rejection:

```
RETRY #{count}/5
FAILED GATE: {gate_name}
REASON: {specific failure}
REQUIRED FIX: {actionable instruction}
RESUME AT: {step_5x}
```

**Failure Counting**: Track retry count, escalate to user after 5 failures.

### Anti-Exemption Rules (v6.11)

The following rationalization patterns are explicitly blocked:

1. "It's a simple change"
2. "Just updating docs"
3. "Only a config tweak"
4. "Hotfix, no time for QA"
5. "The tests pass locally"
6. "I'll clean it up later"
7. "No logic changes"
8. "Already reviewed the pattern"

**Rule**: There are NO simple changes. There are NO exceptions to the QA gate sequence.

### Pre-Commit Rule (v6.11)

⛔ **HARD STOP** before marking any task complete:

- [ ] All QA gates passed (no overrides)
- [ ] Reviewer approval documented
- [ ] Tests pass with evidence
- [ ] No security findings

There is no override. A commit without a completed QA gate is a workflow violation.

### Task Granularity Rules (v6.11)

Tasks classified by size with strict decomposition rules:

| Size | Criteria | Decomposition Required |
|------|----------|----------------------|
| **SMALL** | 1 file, single verb, <2 hours | No |
| **MEDIUM** | 1-2 files, compound action, <4 hours | No |
| **LARGE** | >2 files OR compound verbs | **Yes** |

**Task Atomicity Checks** (Critic validates):
- Max 2 files per task (otherwise decompose)
- No compound verbs ("and", "plus", "with") in task descriptions
- Clear acceptance criteria required

---

## File Structure

```
project/
├── .swarm/
│   ├── plan.md            # Legacy phased roadmap (migrated to plan.json)
│   ├── plan.json          # Machine-readable plan with Zod-validated schema
│   ├── context.md         # Project knowledge, SME cache
│   ├── evidence/          # Per-task execution evidence
│   │   ├── 1.1/           # Evidence for task 1.1
│   │   └── 2.3/           # Evidence for task 2.3
│   └── history/
│       ├── phase-1.md     # Archived phase summaries
│       └── phase-2.md
│
├── src/
│   ├── index.ts           # Plugin entry — registers 7 hook types
│   ├── state.ts           # Shared swarm state singleton (zero imports)
│   ├── agents/            # Agent definitions and factory
│   ├── config/            # Schema, constants, loader
│   ├── commands/          # Slash command handlers (12 commands)
│   │   ├── index.ts       # Factory + dispatcher (createSwarmCommandHandler)
│   │   ├── status.ts      # /swarm status
│   │   ├── plan.ts        # /swarm plan [N]
│   │   ├── agents.ts      # /swarm agents
│   │   ├── evidence.ts    # /swarm evidence [task]
│   │   ├── archive.ts     # /swarm archive [--dry-run]
│   │   └── reset.ts       # /swarm reset --confirm
│   ├── hooks/             # Hook handlers
│   │   ├── index.ts       # Barrel exports
│   │   ├── utils.ts       # safeHook, composeHandlers, readSwarmFileAsync, estimateTokens
│   │   ├── extractors.ts  # Plan/context file parsers
│   │   ├── pipeline-tracker.ts      # Message transform (pipeline logging)
│   │   ├── context-budget.ts        # Message transform (token budget warnings)
│   │   ├── system-enhancer.ts       # System prompt transform + cross-agent context
│   │   ├── compaction-customizer.ts # Session compaction enrichment
│   │   ├── agent-activity.ts        # Tool hooks (activity tracking + flush)
│   │   └── delegation-tracker.ts    # Chat message hook (active agent tracking)
│   ├── tools/             # Domain detector, file extractor, gitingest, diff, retrieve-summary
│   ├── plan/              # Plan management
│   │   └── manager.ts     # load/save/migrate/derive plan operations
│   └── evidence/          # Evidence bundle management
│       ├── index.ts       # Barrel exports
│       └── manager.ts     # CRUD: save/load/list/delete/archive evidence
│
├── tests/unit/            # 1188 tests across 53+ files (bun test)
│   ├── agents/            # creation (64), factory (20), architect-v6-prompt (15),
│   │                      # security-categories (12)
│   ├── config/            # constants (14), schema (35), loader (17), plan-schema (40),
│   │                      # evidence-schema (23), evidence-config (8),
│   │                      # review-integration-schemas (20)
│   ├── hooks/             # pipeline-tracker (16), utils (25), system-enhancer (58),
│   │                      # compaction-customizer (26), context-budget (23),
│   │                      # extractors (32), agent-activity (14), delegation-tracker (16),
│   │                      # guardrails (39), system-enhancer-v6 (18)
│   ├── commands/          # status (6), plan (9), agents (28), index (11),
│   │                      # archive (8), benchmark (5)
│   ├── evidence/          # manager (25)
│   ├── plan/              # manager (40)
│   ├── tools/             # domain-detector (30), file-extractor (16), gitingest (5),
│   │                      # diff (22), retrieve-summary (28)
│   ├── smoke/             # packaging (8)
│   └── state.test.ts      # Shared state (31)
│
└── dist/                  # Build output (ESM)
```

### plan.md Schema

```markdown
# Project: [Name]
Created: [ISO date]
Last Updated: [ISO date]
Current Phase: [N]

## Overview
[1-2 paragraph project summary]

## Phase 1: [Name] [STATUS]
Estimated: [SMALL/MEDIUM/LARGE]

- [x] Task 1.1: [Description] [SIZE]
  - Acceptance: [Criteria]
- [ ] Task 1.2: [Description] [SIZE] (depends: 1.1)
  - Acceptance: [Criteria]
  - Attempt 1: REJECTED - [Reason]
  - Attempt 2: REJECTED - [Reason]
- [BLOCKED] Task 1.3: [Description]
  - Reason: [Why blocked]

## Phase 2: [Name] [PENDING]
...
```

### context.md Schema

```markdown
# Project Context: [Name]

## Summary
[What the project does, who it's for]

## Technical Decisions
- [Decision]: [Rationale]

## Architecture
[Key patterns, file organization]

## SME Guidance Cache
### [Domain] (Phase [N])
- [Guidance point]

## Patterns Established
- [Pattern]: [Where/how used]

## Known Issues / Tech Debt
- [ ] [Issue to address later]

## File Map
- [path]: [Purpose]
```

---

## Agent Permissions

| Agent | Read | Write | Execute | Delegate |
|-------|:----:|:-----:|:-------:|:--------:|
| architect | ✅ | ✅ | ✅ | ✅ |
| explorer | ✅ | ❌ | ❌ | ❌ |
| sme | ✅ | ❌ | ❌ | ❌ |
| coder | ✅ | ✅ | ✅ | ❌ |
| reviewer | ✅ | ❌ | ❌ | ❌ |
| critic | ✅ | ❌ | ❌ | ❌ |
| test_engineer | ✅ | ✅ | ✅ | ❌ |

---

## Failure Handling

### Task Rejection

```
Attempt 1: @coder implements
           @reviewer rejects with feedback
           
Attempt 2: @coder fixes based on feedback
           @reviewer rejects again
           
Attempt 3: @coder fixes again
           @reviewer rejects
           
Escalation: Architect handles directly
            OR re-scopes task
            Document in plan.md
```

### Blocked Tasks

```
Task cannot proceed (external dependency):
├── Mark [BLOCKED] in plan.md
├── Record reason
├── Skip to next unblocked task
└── Inform user
```

### Agent Failure

```
Agent times out or errors:
├── Retry once
├── If still failing:
│   └── Architect handles directly
└── Document in context.md
```

---

## Why Serial Execution?

Parallel execution causes:
- Race conditions in file modifications
- Context inconsistency between agents
- Non-deterministic outputs
- Debugging nightmares

Serial execution provides:
- Predictable order of operations
- Clear causal chain
- Reproducible results
- Easy debugging

**Correctness > Speed**

---

## Why QA Per Task?

QA at the end causes:
- Accumulated bugs
- Cascading failures (Task 3 builds on buggy Task 2)
- Massive rework
- Lost context on what each task was supposed to do

QA per task provides:
- Immediate feedback
- Issues fixed while context is fresh
- No bug accumulation
- Clear task boundaries

### v6.9.0 Quality Gates (6 New Gates)

v6.9.0 "Quality & Anti-Slop Tooling" adds 6 automated gates to the pre-reviewer pipeline. v6.10.0 adds parallel batch execution for faster QA gates:

| Gate | Purpose | Local-Only |
|------|---------|------------|
| `syntax_check` | Tree-sitter parse validation across 9+ languages | ✅ |
| `placeholder_scan` | Anti-slop detection for TODO/FIXME/stubs | ✅ |
| `sast_scan` | Static security analysis with 63+ rules | ✅ |
| `sbom_generate` | CycloneDX SBOM generation for dependencies | ✅ |
| `build_check` | Build/typecheck verification | ✅ |
| `pre_check_batch` | Parallel verification batch (4x faster) | ✅ |
| `quality_budget` | Maintainability threshold enforcement | ✅ |

**Local-Only Guarantee**: All v6.9.0 gates run without Docker, network connections, external APIs, or cloud services. Optional enhancement via Semgrep (if already on PATH).

---

## Why Persistent Files?

Session-only memory causes:
- Lost progress on session end
- No way to resume projects
- Re-explaining context every time
- No institutional knowledge

Persistent `.swarm/` files provide:
- Resume any project instantly
- Knowledge transfer between sessions
- Audit trail of decisions
- Cached SME guidance (no re-asking)

---

## Hooks System

The hooks system is the foundation of v5.1.x+, extended in v6.0.0 with config-aware hint injection. All features are built as hook handlers registered on OpenCode's Plugin API.

### Core Utilities

- **`safeHook(handler)`** — Wraps any hook handler in a try/catch. Errors are logged at warning level; the original payload is returned unchanged. This ensures no hook can crash the plugin.
- **`composeHandlers<I,O>(...handlers)`** — Composes multiple handlers for the same hook type into a single handler. Runs handlers sequentially on shared mutable output. Each handler is individually wrapped in `safeHook`.
- **`readSwarmFileAsync(directory, filename)`** — Reads `.swarm/` files using `Bun.file().text()`. Returns empty string on missing files.
- **`estimateTokens(text)`** — Conservative token estimation: `Math.ceil(text.length * 0.33)`.

### Hook Registration Table

| Hook Type | Handler | Purpose |
|-----------|---------|---------|
| `experimental.chat.messages.transform` | `composeHandlers(pipelineTracker, contextBudget)` | Pipeline logging + token budget warnings |
| `experimental.chat.system.transform` | `systemEnhancerHook` | Inject phase/task/decisions + cross-agent context |
| `experimental.session.compacting` | `compactionHook` | Enrich compaction with plan.md + context.md data |
| `command.execute.before` | `safeHook(commandHandler)` | Handle `/swarm` slash commands |
| `tool.execute.before` | `safeHook(activityHooks.toolBefore)` | Track tool usage per agent |
| `tool.execute.after` | `safeHook(activityHooks.toolAfter)` | Record tool results + trigger flush |
| `chat.message` | `safeHook(delegationHandler)` | Track active agent per session |

### Composition Constraint

The OpenCode Plugin API allows **one handler per hook type**. When multiple features need the same hook type (e.g., pipeline-tracker and context-budget both use `experimental.chat.messages.transform`), they must be composed via `composeHandlers()` into a single registered handler.

---

## Intelligence & Audit Tools (v6.5)

Five new tools extend the architect's decision-making capabilities with intelligence gathering and QA auditing:

### `todo_extract` — Annotation Scanner
Extracts `TODO`, `FIXME`, and `HACK` annotations across the codebase using regex matching and file discovery (Node.js native glob for cross-platform safety).

**Usage**: Phase 0 (resume check) or Phase 2 (discovery) to identify pre-existing work items and prioritize planning.

**Input**: `paths` (directory whitelist), `tags` (annotation types), `exclude` (directory patterns)  
**Output**: Structured JSON with file, line, tag, and content for each annotation

**Safety**: Validates paths against workspace root, rejects shell metacharacters, enforces file size limits

### `evidence_check` — Completeness Auditor
Audits completed tasks in `.swarm/evidence/` against required evidence types (review, test, diff, approval). Identifies missing evidence before marking a phase complete.

**Usage**: Phase 6 (phase complete) to verify every task has sufficient QA artifacts

**Input**: Task ID pattern (wildcard support)  
**Output**: JSON with per-task evidence status, missing types, and overall completeness score

**Safety**: Validates task ID format, skips symlinks, reads JSON with size limits

### `pkg_audit` — Vulnerability Scanner
Wraps `npm audit`, `pip-audit`, and `cargo audit` via Bun.spawn to identify security vulnerabilities in project dependencies.

**Usage**: Phase 2 (discovery) or Phase 6 (phase complete) to scope security risk and feed results to reviewer

**Input**: `ecosystem` (npm|pip|cargo), `days` (vulnerability age), `top_n` (limit results)  
**Output**: Structured CVE data with severity, patched versions, and advisory URLs

**Safety**: Validates enum args strictly, bounds-checks integers (1-365 days, 1-100 results), enforces timeout via Promise.race

### `complexity_hotspots` — Risk Mapper
Combines cyclomatic complexity analysis with git churn metrics to identify high-risk modules before implementation.

**Usage**: Phase 0/2 (early warning) or Phase 6 (post-implementation assessment) to flag modules needing stricter QA

**Input**: `paths` (file patterns), `metrics` (complexity|churn|both)  
**Output**: Ranked list of risky files with complexity score, recent commits, and risk level

**Safety**: Uses Bun.spawn for git commands (not shell pipes), parses output in JavaScript, cross-platform path handling

### `schema_drift` — API Contract Auditor
Compares OpenAPI specification files against actual route implementations to surface undocumented routes and phantom spec paths.

**Usage**: Phase 6 (when API routes were modified) to catch documentation drift before release

**Input**: `spec_file` (path to OpenAPI JSON/YAML), `routes_dir` (implementation directory)  
**Output**: Drift report with missing implementations, extra routes, and parameter mismatches

**Safety**: Validates spec file extension whitelist and size limits (<10MB), uses lstatSync to skip symlinks, YAML parsing with regex `g` flag for multi-line patterns

### Common Security Patterns

All five tools follow strict security practices:
- **Path validation**: `path.resolve()` + `startsWith(workspaceRoot + path.sep)` prevents traversal bypass
- **Command execution**: Bun.spawn with array args (never string concat) to prevent shell injection
- **Timeout protection**: Promise.race on all async operations to prevent hangs
- **Input validation**: Enum/range checks on all user-supplied arguments
- **File access**: Node.js native fs (not shell grep/find) for cross-platform safety

---

## Context Pruning

Context pruning manages the architect's context window to prevent overflow.

### Token Budget Tracker

Registered on `experimental.chat.messages.transform` (composed with pipeline-tracker):
1. Estimates total tokens across all message parts using `estimateTokens()`
2. Looks up model-specific token limit from `context_budget.model_limits` config (default: 128,000)
3. At `warn_threshold` (default 70%): injects `[CONTEXT WARNING]` message
4. At `critical_threshold` (default 90%): injects `[CONTEXT CRITICAL]` message

### Compaction Enhancement

Registered on `experimental.session.compacting`:
- Reads `.swarm/plan.md`: extracts current phase + incomplete tasks
- Reads `.swarm/context.md`: extracts decisions + patterns
- Injects as compaction context strings (max 500 chars each)
- Guides OpenCode's built-in compaction to preserve swarm-relevant context

### System Prompt Enhancement

Registered on `experimental.chat.system.transform`:
- Injects current phase + task from plan.md (~200 chars)
- Injects top 3 most recent decisions from context.md
- Keeps agents focused even after conversation history is compacted
- Respects `max_injection_tokens` budget (default: 4,000 tokens)
- Priority ordering: phase → task → decisions → agent context
- Lower-priority items dropped when budget is exhausted
- **v6.0.0**: Injects config override hints for `always_security_review` and `integration_analysis.enabled` when non-default values are detected

---

## Evidence System

The evidence system persists verifiable execution artifacts per task.

### Evidence Types

| Type | Fields | Purpose |
|------|--------|---------|
| `review` | risk, issues[] | Reviewer findings |
| `test` | tests_passed, tests_failed | Test engineer results |
| `diff` | files_changed[], additions, deletions | Code change summary |
| `approval` | (base fields only) | Explicit approval record |
| `note` | (base fields only) | Free-form annotation |

### Storage

```
.swarm/evidence/
├── 1.1/
│   └── evidence.json    # EvidenceBundleSchema (array of entries)
└── 2.3/
    ├── evidence.json
    └── diff.patch       # Optional raw diff
```

### Security

- Task IDs are sanitized: regex `^[\w-]+(\.[\w-]+)*$`, rejects `..`, null bytes, control chars
- Two-layer path validation: sanitize task ID + `validateSwarmPath()` on full path
- Size limits: JSON 500KB, diff.patch 5MB, total per task 20MB
- Atomic writes via temp+rename pattern

### Retention

Configurable via `evidence` config:
- `max_age_days`: Archive evidence older than N days (default: 90)
- `max_bundles`: Maximum evidence bundles before auto-archive (default: 1000)
- `auto_archive`: Enable automatic archiving (default: false)

---

## Quality Gates (v6.9.0)

Six new automated gates enforce code quality before human review. All gates run locally without Docker or network dependencies.

### Gate Overview

| Gate | Function | Fail Action |
|------|----------|-------------|
| `syntax_check` | Tree-sitter parse validation | Return to coder for fix |
| `placeholder_scan` | Detect TODO/FIXME/stubs | Return to coder to complete |
| `sast_scan` | Static security analysis (63 rules) | Return to coder for fix |
| `sbom_generate` | CycloneDX SBOM generation | Log for audit trail |
| `build_check` | Build/typecheck verification | Return to coder for fix |
| `pre_check_batch` | Parallel verification (v6.10.0) | Return to coder for fix |
| `quality_budget` | Maintainability enforcement | Return to coder or adjust limits |

### syntax_check - Parse Validation

Uses Tree-sitter grammars for 9+ languages:
- TypeScript/JavaScript
- Python
- Rust
- Go
- Java
- C/C++
- Ruby
- PHP
- C#

**Fail condition**: Parse errors, unclosed brackets, invalid syntax
**Resolution**: Coder fixes syntax errors before review

### placeholder_scan - Anti-Slop Detection

Detects patterns indicating incomplete implementation:
- `TODO`, `FIXME`, `XXX`, `HACK` comments
- Placeholder strings (`placeholder`, `stub`, `implement me`)
- Empty function bodies
- Hardcoded dummy values

**Fail condition**: Any placeholder pattern in changed files
**Resolution**: Coder completes implementation before review

### sast_scan - Static Security Analysis

63+ security rules across 9 languages covering:
- SQL injection vectors
- Path traversal patterns
- Hardcoded secrets
- Insecure crypto usage
- XSS vulnerabilities
- Command injection

**Offline operation**: Built-in rule engine, no external API calls
**Optional enhancement**: Semgrep Tier B rules if available on PATH
**Fail condition**: High/critical severity findings
**Resolution**: Coder fixes security issues before review

### sbom_generate - Dependency Tracking

Generates CycloneDX SBOMs from manifest files:
- `package.json` + `package-lock.json` (npm)
- `requirements.txt`, `Pipfile`, `poetry.lock` (Python)
- `Cargo.toml` + `Cargo.lock` (Rust)
- `go.mod` + `go.sum` (Go)
- `pom.xml`, `build.gradle` (Java)
- `Gemfile.lock` (Ruby)
- `composer.lock` (PHP)
- `.csproj` + `packages.lock.json` (C#)

**Output**: CycloneDX JSON format
**Purpose**: Security auditing, license compliance
**Fail condition**: None (informational gate)

### build_check - Compilation Verification

Runs repository-native build commands:
- `npm run build` / `tsc --noEmit` (TypeScript)
- `cargo build` / `cargo check` (Rust)
- `go build` (Go)
- `javac` / Maven / Gradle (Java)
- `python -m py_compile` (Python)

**Fail condition**: Build errors, type check failures
**Resolution**: Coder fixes build errors before review

### quality_budget - Maintainability Enforcement

Enforces configurable thresholds on code changes:

| Budget | Default | Description |
|--------|---------|-------------|
| `max_complexity_delta` | 5 | Maximum cyclomatic complexity increase |
| `max_public_api_delta` | 10 | Maximum new public API surface |
| `max_duplication_ratio` | 0.05 | Maximum code duplication ratio (5%) |
| `min_test_to_code_ratio` | 0.3 | Minimum test-to-code ratio (30%) |

**Fail condition**: Budget exceeded
**Resolution**: Refactor code or adjust budget thresholds

### pre_check_batch - Parallel Verification (v6.10.0)

Runs four verification tools in parallel for 4x faster gate execution:

| Tool | Purpose | Gate Type |
|------|---------|-----------|
| `lint:check` | Code quality verification | Hard gate |
| `secretscan` | Secret/credential detection | Hard gate |
| `sast_scan` | Static security analysis | Hard gate |
| `quality_budget` | Maintainability metrics | Hard gate |

**Parallel Execution**:
- Uses `p-limit` with max 4 concurrent operations
- 60-second timeout per tool
- 500KB combined output limit
- Individual failures don't cascade

**Return Value**:
```json
{
  "gates_passed": true,
  "lint": { "ran": true, "result": {}, "duration_ms": 1200 },
  "secretscan": { "ran": true, "result": {}, "duration_ms": 800 },
  "sast_scan": { "ran": true, "result": {}, "duration_ms": 2500 },
  "quality_budget": { "ran": true, "result": {}, "duration_ms": 400 },
  "total_duration_ms": 3200
}
```

**Configuration**:
```json
{
  "pipeline": {
    "parallel_precheck": true  // default: true
  }
}
```

**Fail condition**: Any hard gate fails (lint errors, secrets found, SAST findings, budget exceeded)
**Resolution**: Fix specific failures identified in tool results and retry

### Local-Only Guarantee

All v6.9.0 quality gates:
- ✅ Run entirely locally
- ✅ No Docker containers required
- ✅ No network connections
- ✅ No external APIs
- ✅ No cloud services

Optional enhancement:
- Semgrep CLI (if already installed on PATH)

---

## Slash Commands

Twelve commands registered under `/swarm`:

| Command | Description |
|---------|-------------|
| `/swarm status` | Shows current phase, task progress (completed/total), and agent count |
| `/swarm plan` | Displays full plan.md content |
| `/swarm plan N` | Displays only Phase N from plan.md |
| `/swarm agents` | Lists all registered agents with model, temperature, read-only status, and guardrail profiles |
| `/swarm history` | View completed phases with status icons |
| `/swarm config` | View current resolved plugin configuration |
| `/swarm diagnose` | Health check for .swarm/ files, plan structure, and evidence completeness |
| `/swarm export` | Export plan and context as portable JSON |
| `/swarm reset --confirm` | Clear swarm state files (with safety gate) |
| `/swarm evidence [task]` | View evidence bundles for a task or list all tasks with evidence |
| `/swarm archive [--dry-run]` | Archive old evidence bundles with retention policy |
| `/swarm benchmark` | Run performance benchmarks and display metrics |
| `/swarm retrieve [id]` | Retrieve auto-summarized tool outputs by ID |

### Implementation

Commands are registered in two steps:
1. **`config` hook** — Adds `swarm` command to OpenCode's command registry
2. **`command.execute.before` hook** — Intercepts `/swarm` commands and routes to handlers

The command handler uses a factory pattern: `createSwarmCommandHandler(directory, agents)` creates a closure over the project directory and agent definitions, returning a handler function.

---

## Agent Awareness

Agent awareness tracks what each agent is doing and shares relevant context across agents via system prompts. The architect remains the sole orchestrator — there is no direct inter-agent communication.

### Shared State

`src/state.ts` exports a module-scoped singleton (`swarmState`) with:
- `activeAgent: Map<sessionId, agentName>` — Which agent is active in each session (updated by chat.message hook)
- `agentSessions: Map<sessionId, AgentSessionState>` — Per-session guardrail tracking (toolCallCount, startTime, delegationActive flag)
- `eventCounter: number` — Tracks events for flush threshold
- `flushLock: Promise | null` — Serializes context.md writes
- `resetSwarmState()` — Clears all state (used in tests)

The module has **zero imports** — it's pure TypeScript with no project dependencies.

### Stale Delegation Detection

When a subagent finishes and returns control to the architect, there's a race condition between the `chat.message` hook (which updates `activeAgent`) and the `tool.execute.before` hook (which checks guardrails). To prevent the architect from inheriting subagent limits during this transition:

1. **Stale delegation window:** If `lastToolCallTime` is >10 seconds old, the session is considered stale and reverts to architect
2. **Delegation active flag:** If `delegationActive=false` (subagent finished), immediately revert to architect
3. **Early exemption:** Three name-based architect checks in the guardrails hook provide defense-in-depth

The 10-second window is tight enough to prevent architect misidentification but loose enough to allow slow subagent operations (file I/O, network).

### Activity Tracking Flow

```
chat.message hook                tool.execute.before hook         tool.execute.after hook
─────────────────               ────────────────────────         ───────────────────────
│                                │                                │
├─ Extract agent name            ├─ Read active agent from        ├─ Record tool result
│  (strip prefix:                │  swarmState                    │  (success heuristic)
│   paid_, local_,               ├─ Log: "agent X using          ├─ Increment event counter
│   mega_, default_)             │  tool Y"                       ├─ If counter >= 20:
├─ Update activeAgent            │                                │  └─ Flush to context.md
│  map                           │                                │     (promise-based lock)
│                                │                                │
```

### Cross-Agent Context Injection

The system-enhancer reads the `## Agent Activity` section from context.md and maps agent names to context labels:
- `coder` → implementation context
- `reviewer` → review findings
- `test_engineer` → test results
- Other agents → general context

Injected text is truncated to `hooks.agent_awareness_max_chars` (default: 300 characters).

---

## v6.7 Background Automation Framework

**v6.7 is GUI-first and background-first:** Slash commands remain the primary control surface, but background automation provides autonomous operation when enabled.

### Automation Modes

Three modes control background-first rollout:

| Mode | Behavior | Use Case |
|------|----------|----------|
| `manual` | No background automation, all actions via slash commands (default) | Conservative rollout, full control |
| `hybrid` | Background automation for safe operations, slash commands for sensitive ones | Gradual feature rollout |
| `auto` | Full background automation (target state) | Future production use |

**Default:** `manual` for backward compatibility. Enable automation via config.

### Per-Capability Feature Flags

All v6.7 automation features are gated behind explicit feature flags (all default `false`):

| Feature Flag | Description | Security |
|--------------|-------------|----------|
| `plan_sync` | Plan auto-heal: regenerate plan.md from canonical plan.json when out of sync | Safe - read-only regeneration |
| `phase_preflight` | Phase-boundary preflight checks before agent execution | Safe - validation-only |
| `config_doctor_on_startup` | Config Doctor runs on startup to validate/fix configuration | Moderate - auto-fix requires explicit opt-in |
| `config_doctor_autofix` | Auto-fix mode for Config Doctor (requires config_doctor_on_startup) | **Safety: Defaults to false** - autofix requires explicit opt-in |
| `evidence_auto_summaries` | Generate automatic summaries for evidence bundles | Safe - read-only aggregation |
| `decision_drift_detection` | Detect drift between planned and actual decisions | Moderate - drift detection only |

### Core Automation Components

#### 1. Event Bus (`AutomationEventBus`)

Typed event system for internal automation events. Events:
- Queue events (`enqueued`, `dequeued`, `completed`, `failed`, `retry scheduled`)
- Worker events (`started`, `stopped`, `error`)
- Circuit breaker events (`opened`, `half-open`, `closed`, `callSuccess`, `callFailure`)
- Loop protection events (`triggered`)
- Preflight events (`requested`, `triggered`, `skipped`, `completed`)
- Phase boundary events (`detected`, `checked`)
- Task events (`completed`)
- Evidence summary events (`generated`, `error`)

All events include timestamp, payload, and optional source identifier.

#### 2. Queue (`AutomationQueue`)

Lightweight in-process queue with:
- Priority levels: `critical` > `high` > `normal` > `low`
- FIFO ordering within priority
- Exponential backoff retry (configurable max)
- Max queue size protection (default 1000)
- Retry metadata tracking (attempts, next attempt time, backoff)

#### 3. Worker Manager (`WorkerManager`)

Lifecycle manager for background workers:
- Register workers with handler functions
- Configurable concurrency (default 1)
- Auto-start support
- Processing loop with idle detection
- Statistics tracking (processed count, error count, queue size)

#### 4. Circuit Breaker (`CircuitBreaker`)

Fault tolerance primitive:
- States: `closed` (normal) → `open` (fail fast) → `half-open` (testing recovery)
- Configurable failure threshold (default 5) and reset timeout (default 30s)
- Call timeout support (default 10s)
- Success threshold for half-open → closed (default 3)

Prevents cascading failures during background automation.

#### 5. Loop Protection (`LoopProtection`)

Infinite loop prevention:
- Tracks operation frequency over time window (default 10s)
- Configurable max iterations (default 5)
- Operation key for tracking specific operations
- Automatic detection and abort on threshold exceed

#### 6. Status Artifact (`AutomationStatusArtifact`)

Passive status writer for GUI visibility:
- Writes to `.swarm/automation-status.json`
- Tracks mode, capabilities, phase, triggers, outcomes
- GUI-friendly summary with readable status text

### Plan Sync Auto-Heal

**v6.7 Task 5.1:** Automatic plan.json ↔ plan.md synchronization.

#### Auto-Heal Flow

```
loadPlan(directory):
  1. Try to load plan.json
     ├─ VALID → Check if plan.md in sync
     │  ├─ In sync → Return plan
     │  └─ Out of sync → Auto-regenerate plan.md from plan.json
     │
     └─ INVALID → Try to migrate from plan.md
        ├─ plan.md exists → Migrate, save both files, return plan
        └─ plan.md doesn't exist → Fall through
  2. Try to load plan.md only (no auto-migration)
     ├─ Exists → Return migrated plan
     └─ Doesn't exist → Fall through
  3. Neither exists → Return null
```

#### Deterministic Hashing

Content hash uses natural numeric sorting for task IDs:
- `"1.2"` < `"1.10"` (not `"1.2" < "1.10"`)
- Example: `1.1, 1.2, 1.10, 1.11, 2.1` (sorted correctly)
- Hash stored in plan.md header as `<!-- PLAN_HASH: <hash> -->`

#### Atomic Writes

Plan.json writes use temp+rename pattern for atomicity:
1. Write to `plan.json.tmp.{timestamp}`
2. Atomic rename to `plan.json`
3. Derive plan.md with hash comment

### Services (Extracted from Commands)

#### Preflight Service

Validates project state before agent execution:
- Checks plan completeness
- Validates evidence requirements per task
- Detects blockers and missing dependencies
- Returns actionable findings with severity levels

**Gated behind:** `automation.capabilities.phase_preflight`

#### Config Doctor

Startup service that validates and fixes configuration:
- Validates config schema and types
- Detects stale/invalid settings
- Classifies findings by severity (info/warn/error)
- Proposes safe auto-fixes

**Security:** Defaults to scan-only mode. Autofix requires explicit `automation.capabilities.config_doctor_autofix = true`.

**Backups:** Creates encrypted backups in `.swarm/` before auto-fix. Supports restore via `/swarm config doctor --restore <backup-id>`.

#### Decision Drift Analyzer

Detects drift between planned and actual decisions:
- Stale decisions (age/phase mismatch)
- Contradictory decisions (use vs don't use, keep vs remove, etc.)
- Caches decisions from `## Decisions` section in context.md
- Returns structured drift signals for context injection

**Gated behind:** `automation.capabilities.decision_drift_detection`

#### Evidence Summary Service

Aggregates evidence per task and phase:
- Machine-readable JSON summary in `.swarm/evidence-summary.json`
- Human-readable markdown in `.swarm/evidence-summary.md`
- Per-task completion status
- Phase-level blockers (missing evidence, incomplete tasks, blocked tasks)

**Gated behind:** `automation.capabilities.evidence_auto_summaries`

### Slash Command Adapters

Commands expose service functionality without blocking UI:

| Command | Function | Security |
|---------|----------|----------|
| `/swarm preflight` | Run preflight checks on current plan | Safe - validation-only |
| `/swarm config doctor [--fix] [--restore <id>]` | Config Doctor with optional auto-fix and restore | Moderate - auto-fix opt-in |
| `/swarm sync-plan` | Force plan.md regeneration from plan.json | Safe - read-only |

All commands:
- Non-blocking (fire and forget for background ops)
- Async execution (don't block OpenCode UI)
- Log results to console
- Store artifacts in `.swarm/`

### GUI Visibility

`AutomationStatusArtifact` provides passive status for GUI:

```json
{
  "timestamp": 1234567890,
  "mode": "manual",
  "enabled": false,
  "currentPhase": 2,
  "lastTrigger": null,
  "pendingActions": 0,
  "lastOutcome": null,
  "capabilities": {
    "plan_sync": false,
    "phase_preflight": false,
    "config_doctor_on_startup": false,
    "config_doctor_autofix": false,
    "evidence_auto_summaries": false,
    "decision_drift_detection": false
  }
}
```

GUI uses `getGuiSummary()` for display:
- Status (Disabled / Hybrid / Auto)
- Current phase
- Last trigger time
- Pending actions count
- Last outcome (success/failure/skipped)

---

## v6.8 Enhanced Automation & Background Workers

**v6.8 builds on v6.7 with automatic execution triggers and persistent background workers.**

### Auto-Trigger System

#### Phase Monitor Hook

**`createPhaseMonitorHook()`** in `src/hooks/phase-monitor.ts`:

- Detects phase transitions in the execution pipeline
- Automatically triggers preflight checks when phase changes
- Registers on `PhaseChangeHook` event hook
- Configurable via `automation.capabilities.phase_preflight` (requires explicit enable)

#### Preflight Integration

**`createPreflightIntegration()`** wires the phase monitor into the hook chain:

```
Phase Monitor Hook → Preflight Service → Auto-trigger if phase changes
```

Benefits:
- No manual `/swarm preflight` command needed during execution
- Consistent preflight checks at every phase boundary
- Automatic blocker detection before agent execution

### Background Workers

#### Plan Sync Worker

**`PlanSyncWorker`** class in `src/background/plan-sync-worker.ts`:

**File Watching:**
- `fs.watch` on `plan.json` for real-time synchronization
- 2-second polling fallback if `fs.watch` fails (network/mount issues)

**Debouncing:**
- 300ms debounce before processing changes
- Prevents multiple rapid updates from triggering unnecessary regenerations
- Batch writes for better performance

**Overlap Lock:**
- Exclusive lock on plan.json during regeneration
- Concurrent reads during regeneration (readers/writer pattern)
- Safe shutdown with grace period

**Safe Shutdown:**
- Graceful shutdown on plugin unload
- Cancel pending operations
- Release all locks before exit

#### Evidence Summary Worker

Background service that auto-generates evidence summaries:

- Scheduled generation for long-running tasks
- Aggregates per-task evidence into phase-level summaries
- Writes to `.swarm/evidence-summary.json`
- Triggers via `/swarm evidence summary` command

### Configuration Updates

#### New Defaults

| Configuration | v6.7 Default | v6.8 Default | Reason |
|---------------|--------------|--------------|--------|
| `evidence_auto_summaries` | `false` | `true` | Long-running tasks benefit from automatic summaries |
| `plan_sync` | `false` | `true` | Auto-healing plan.json ↔ plan.md is safe and recommended |

#### Migration Path

v6.7 configs are fully compatible with v6.8:
- Set `evidence_auto_summaries: true` in config to enable automation
- Set `plan_sync: true` in config to enable background synchronization
- Previous configs remain valid (defaults preserved for disabled features)

### Testing Coverage

**808 new tests** across 6 new test files:
- `evidence-summary-init.test.ts` — Evidence summary service initialization
- `evidence-summary-init.adversarial.test.ts` — Error handling and recovery
- `evidence-summary-automation.test.ts` — Auto-generation triggers
- `phase-preflight-auto.test.ts` — Phase monitor and auto-trigger
- `plan-sync-worker.test.ts` — Worker core functionality
- `plan-sync-worker.adversarial.test.ts` — Edge cases and failures
- `plan-sync-init.test.ts` — Worker initialization

**Total:** 4008 tests across 136 files

### Integration Details

#### Hook Chain

```
Plugin Init
├── EvidenceSummaryIntegration (auto-generates summaries)
├── PhaseMonitorHook (detects phase changes)
└── PreflightIntegration (wires phase monitor to preflight)
```

#### Background Worker Registration

```
Plugin Init
└── WorkerManager
    └── Register PlanSyncWorker (auto-sync plan.json → plan.md)
```

#### Slash Command: `/swarm evidence summary`

Manual trigger for evidence summary generation:

```typescript
// Command handler in src/commands/evidence.ts
evidenceCommand.execute(async (args) => {
  await EvidenceSummaryService.generate();
  return { success: true, message: 'Evidence summary generated' };
});
```

### Benefits

**For Architects:**
- Less manual intervention during long-running tasks
- Automatic plan synchronization without refresh
- Consistent preflight checks at every phase boundary

**For Projects:**
- Resumable, maintainable execution state
- Automatic evidence aggregation
- Reduced risk of plan drift
- Comprehensive audit trail

**For Users:**
- "set it and forget it" automation
- No breaking changes to existing configs
- Clear visibility via status artifacts
- Graceful degradation on failures

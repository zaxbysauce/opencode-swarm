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
- Runs in Phase 5 before Coder (Rule 9)

### SME: The Advisor
- Single open-domain expert (any domain: security, ios, rust, kubernetes, etc.)
- Consulted serially, one call per domain
- Guidance cached in context.md
- Read-only (cannot write code)

### Pipeline Agents: The Hands
- Coder: Implements one task at a time
- Reviewer: Dual-pass review — general correctness first, then automatic security-only pass for security-sensitive files (OWASP Top 10 categories)
- Test Engineer: Generates verification tests + adversarial tests (attack vectors, boundary violations, injection attempts)

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
@critic reviews plan
    │
    ├── APPROVED → Proceed to Phase 5
    ├── NEEDS_REVISION → Revise plan, resubmit (max 2 cycles)
    └── REJECTED → Escalate to user
```

### Phase 5: Execute

```
For each task in current phase:
    │
    ├── Check dependencies complete
    │   └── If blocked → Skip, mark [BLOCKED]
    │
    ├── 5a. @coder implements (ONE task)
    │       └── Wait for completion
    │
    ├── 5b. diff tool analyzes changes
    │       ├── Detect contract changes (exports, interfaces, types)
    │       └── If contracts changed → @explorer runs impact analysis
    │
    ├── 5c. @reviewer reviews (correctness, edge-cases, performance)
    │       ├── APPROVED → Continue
    │       └── REJECTED → Retry from 5a (max 5)
    │
    ├── 5d. @reviewer security-only pass (if file matches security globs
    │       or coder output contains security keywords)
    │       ├── Security globs: auth, crypto, session, token, middleware, api, security
    │       └── Uses OWASP Top 10 2021 categories
    │
    ├── 5e. @test_engineer generates AND runs verification tests
    │       ├── PASS → Continue
    │       └── FAIL → Send failures to @coder, retry from 5c
    │
    ├── 5f. @test_engineer adversarial testing pass
    │       ├── Attack vectors, boundary violations, injection attempts
    │       ├── PASS → Continue
    │       └── FAIL → Send failures to @coder, retry from 5c
    │
    └── 5g. Update plan.md [x] complete (only after ALL gates pass)
```

### Phase 6: Phase Complete

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
All tasks in phase done
    │
    ├── Re-run @explorer (codebase changed)
    ├── Update context.md with learnings
    ├── Archive to .swarm/history/phase-N.md
    │
    └── Ask user: "Ready for Phase [N+1]?"
        ├── YES → Proceed
        └── NO  → Wait
```

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
- `activeAgents: Map<sessionId, agentName>` — Which agent is active in each session (updated by chat.message hook)
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
├─ Update activeAgents           │                                │  └─ Flush to context.md
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

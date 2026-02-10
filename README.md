<p align="center">
  <img src="https://img.shields.io/badge/version-5.0.0-blue" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/opencode-plugin-purple" alt="OpenCode Plugin">
  <img src="https://img.shields.io/badge/agents-8-orange" alt="Agents">
  <img src="https://img.shields.io/badge/tests-876-brightgreen" alt="Tests">
</p>

<h1 align="center">🐝 OpenCode Swarm</h1>

<p align="center">
  <strong>The only multi-agent framework that actually works.</strong><br>
  Structured phases. Persistent memory. One task at a time. QA on everything.
</p>

<p align="center">
  <a href="#why-swarm">Why Swarm?</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#installation">Installation</a> •
  <a href="#agents">Agents</a> •
  <a href="#configuration">Configuration</a>
</p>

---

## The Problem with Every Other Multi-Agent System

```
You: "Build me an authentication system"

Other Frameworks:
├── Agent 1 starts auth module...
├── Agent 2 starts user model... (conflicts with Agent 1)
├── Agent 3 starts database... (wrong schema)
├── Agent 4 starts tests... (for code that doesn't exist yet)
└── Result: Chaos. Conflicts. Context lost. Start over.

OpenCode Swarm:
├── Architect analyzes request
├── Explorer scans codebase (+ gap analysis)
├── @sme consulted on security domain
├── Architect creates phased plan with acceptance criteria
├── @critic reviews plan → APPROVED
├── Phase 1: User model → Review → Tests (run + PASS) → ✓
├── Phase 2: Auth logic → Review → Tests (run + PASS) → ✓
├── Phase 3: Session management → Review → Tests (run + PASS) → ✓
└── Result: Working code. Documented decisions. Resumable progress.
```

---

## Why Swarm?

<table>
<tr>
<td width="50%">

### ❌ Other Frameworks

- Parallel chaos, hope it converges
- Single model = correlated failures
- No planning, just vibes
- Context lost between sessions
- QA as afterthought (if at all)
- Entire codebase in one prompt
- No way to resume projects

</td>
<td width="50%">

### ✅ OpenCode Swarm

- **Serial execution** - predictable, traceable
- **Heterogeneous models** - different perspectives catch errors
- **Phased planning** - documented tasks with acceptance criteria
- **Persistent memory** - `.swarm/` files survive sessions
- **Review per task** - correctness + security review before anything ships
- **One task at a time** - focused, quality code
- **Resumable projects** - pick up exactly where you left off

</td>
</tr>
</table>

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────────────┐
│  USER: "Add user authentication with JWT"                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 0: Check for .swarm/plan.md                                      │
│           Exists? Resume. New? Continue.                                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 1: Clarify (if needed)                                           │
│           "Do you need refresh tokens? What's the session duration?"    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 2: Discover                                                      │
│           @explorer scans codebase → structure, languages, patterns     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 3: Consult SMEs (serial, cached)                                 │
│           @sme DOMAIN: security → auth best practices                   │
│           @sme DOMAIN: api → JWT patterns, refresh flow                 │
│           Guidance saved to .swarm/context.md                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 4: Plan                                                          │
│           Creates .swarm/plan.md with phases, tasks, acceptance criteria│
│                                                                         │
│           Phase 1: Foundation [3 tasks]                                 │
│           Phase 2: Core Auth [4 tasks]                                  │
│           Phase 3: Session Management [3 tasks]                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 4.5: Critic Gate                                                 │
│             @critic reviews plan → APPROVED / NEEDS_REVISION / REJECTED│
│             Max 2 revision cycles before escalating to user             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 5: Execute (per task)                                            │
│                                                                         │
│   ┌─────────┐    ┌────────────┐    ┌──────────────┐                    │
│   │ @coder  │ →  │ @reviewer  │ →  │    @test     │                    │
│   │ 1 task  │    │ check all  │    │ write + run  │                    │
│   └─────────┘    └────────────┘    └──────────────┘                    │
│        │               │                   │                            │
│        │     If REJECTED: retry    If FAIL: fix + retest               │
│        └───────────────┘                                                │
│                                                                         │
│   Update plan.md: [x] Task complete (only if PASS)                      │
│   Next task...                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 6: Phase Complete                                                │
│           Re-scan with @explorer                                        │
│           Update context.md with learnings                              │
│           Archive to .swarm/history/                                    │
│           "Phase 1 complete. Ready for Phase 2?"                        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Persistent Project Memory

Other frameworks lose everything when the session ends. Swarm doesn't.

```
.swarm/
├── plan.md          # Your project roadmap (+ plan.json)
├── context.md       # Everything a new Architect needs
├── evidence/        # Per-task execution evidence
│   ├── 1.1/         # Evidence for task 1.1
│   └── 2.3/         # Evidence for task 2.3
└── history/
    ├── phase-1.md   # What was done, what was learned
    └── phase-2.md
```

### plan.md - Living Roadmap
```markdown
# Project: Auth System
Current Phase: 2

## Phase 1: Foundation [COMPLETE]
- [x] Task 1.1: Create user model [SMALL]
- [x] Task 1.2: Add password hashing [SMALL]
- [x] Task 1.3: Database migrations [MEDIUM]

## Phase 2: Core Auth [IN PROGRESS]
- [x] Task 2.1: Login endpoint [MEDIUM]
- [ ] Task 2.2: JWT generation [MEDIUM] (depends: 2.1) ← CURRENT
  - Acceptance: Returns valid JWT with user claims
  - Attempt 1: REJECTED - Missing expiration
- [ ] Task 2.3: Token validation middleware [MEDIUM]
- [BLOCKED] Task 2.4: Refresh tokens
  - Reason: Waiting for decision on rotation strategy
```

### context.md - Institutional Knowledge
```markdown
# Project Context: Auth System

## Technical Decisions
- Using bcrypt (cost 12) for password hashing
- JWT expires in 15 minutes, refresh in 7 days
- Storing refresh tokens in Redis

## SME Guidance Cache
### Security (Phase 1)
- Never log tokens or passwords
- Use constant-time comparison for tokens
- Implement rate limiting on login

### API (Phase 1)
- Return 401 for invalid credentials (not 404)
- Include token expiry in response body

## Patterns Established
- Error handling: Custom ApiError class with status codes
- Validation: Zod schemas in /validators/
```

**Start a new session tomorrow?** The Architect reads these files and picks up exactly where you left off.

---

## Heterogeneous Models = Better Code

Most frameworks use one model for everything. Same blindspots everywhere.

Swarm lets you mix models strategically:

```json
{
  "agents": {
    "architect": { "model": "anthropic/claude-sonnet-4-5" },
    "explorer": { "model": "google/gemini-2.0-flash" },
    "coder": { "model": "anthropic/claude-sonnet-4-5" },
    "sme": { "model": "google/gemini-2.0-flash" },
    "reviewer": { "model": "openai/gpt-4o" },
    "critic": { "model": "google/gemini-2.0-flash" },
    "test_engineer": { "model": "google/gemini-2.0-flash" }
  }
}
```

| Role | Optimized For | Why Different Models? |
|------|---------------|----------------------|
| Architect | Deep reasoning | Needs to plan complex work |
| Explorer | Fast scanning | Speed over depth |
| Coder | Implementation | Best coding model you have |
| SME | Domain knowledge | Fast recall, not deep reasoning |
| Reviewer | Finding flaws | **Different vendor catches different bugs** |
| Critic | Plan review | Catches scope issues before any code is written |
| Test Engineer | Test + run | Writes tests, runs them, reports PASS/FAIL |

**If Claude writes code and GPT reviews it, GPT catches Claude's blindspots.** This is why real teams have code review.

---

## Multiple Swarms

Run different model configurations simultaneously. Perfect for:
- **Cloud vs Local**: Premium cloud models for critical work, local models for quick tasks
- **Fast vs Quality**: Quick iterations with fast models, careful work with expensive ones
- **Cost Tiers**: Cheap models for exploration, premium for implementation

### Configuration

```json
{
  "swarms": {
    "cloud": {
      "name": "Cloud",
      "agents": {
        "architect": { "model": "anthropic/claude-sonnet-4-5" },
        "coder": { "model": "anthropic/claude-sonnet-4-5" },
        "sme": { "model": "google/gemini-2.0-flash" },
        "reviewer": { "model": "openai/gpt-4o" }
      }
    },
    "local": {
      "name": "Local",
      "agents": {
        "architect": { "model": "ollama/qwen2.5:32b" },
        "coder": { "model": "ollama/qwen2.5:32b" },
        "sme": { "model": "ollama/qwen2.5:14b" },
        "reviewer": { "model": "ollama/qwen2.5:14b" }
      }
    }
  }
}
```

### What Gets Created

| Swarm | Agents |
|-------|--------|
| `cloud` (default) | `architect`, `explorer`, `coder`, `sme`, `reviewer`, `critic`, `test_engineer` |
| `local` | `local_architect`, `local_explorer`, `local_coder`, `local_sme`, `local_reviewer`, `local_critic`, `local_test_engineer` |

The first swarm (or one named "default") creates unprefixed agents. Additional swarms prefix all agent names.

### Usage

In OpenCode, you'll see multiple architects to choose from:
- `architect` - Cloud swarm (default)
- `local_architect` - Local swarm

Each architect automatically delegates to its own swarm's agents.

---

## Installation

```bash
# Install via CLI (recommended)
bunx opencode-swarm install
```

### Uninstall

```bash
# Remove from opencode.json
bunx opencode-swarm uninstall

# Remove from opencode.json + clean up config files
bunx opencode-swarm uninstall --clean
```

---

## What's New

### v5.0.0 — Verifiable Execution
- **Canonical plan schema** — Machine-readable `plan.json` with Zod-validated `PlanSchema`/`TaskSchema`/`PhaseSchema`. Automatic migration from legacy `plan.md` format. Structured status tracking (`pending`, `in_progress`, `completed`, `blocked`).
- **Evidence bundles** — Per-task execution evidence persisted to `.swarm/evidence/`. Five evidence types: `review`, `test`, `diff`, `approval`, `note`. Sanitized task IDs, atomic writes, configurable size limits. `/swarm evidence` to view, `/swarm archive` to manage retention.
- **Per-agent guardrail profiles** — Override guardrail limits for individual agents via `guardrails.profiles`. `resolveGuardrailsConfig()` merges base + profile with per-agent specificity.
- **Context injection budget** — `max_injection_tokens` config controls how much context is injected into system prompts. Priority-ordered: phase → task → decisions → agent context. Lower-priority items dropped when budget exhausted.
- **Enhanced `/swarm agents`** — Agent count summary, `⚡ custom limits` indicator for profiled agents, guardrail profiles section.
- **Packaging smoke tests** — CI-safe `dist/` validation (8 tests).
- **208 new tests** — 876 total tests across 39 files (up from 668 in v4.6.0).

### v4.6.0 — Agent Guardrails
- **Circuit breaker** — Two-layer protection against runaway agents. Soft warning at 50% of limits, hard block at 100%. Prevents infinite loops and runaway API costs.
- **Detection signals** — Tool call count, wall-clock time, consecutive repetition, and consecutive error tracking per agent session.
- **Configurable limits** — All thresholds tunable via `guardrails` config: `max_tool_calls`, `max_duration_minutes`, `max_repetitions`, `max_consecutive_errors`, `warning_threshold`.
- **46 new tests** — 668 total tests across 30 files.

### v4.5.0 — Tech Debt + New Commands
- **Lint cleanup** — Replaced string concatenation with template literals, documented `as any` casts with biome-ignore comments.
- **Code deduplication** — Extracted `stripSwarmPrefix()` utility to eliminate 3 duplicate prefix-stripping blocks.
- **`/swarm diagnose`** — Health check for `.swarm/` files, plan structure, and plugin configuration.
- **`/swarm export`** — Export plan.md and context.md as portable JSON.
- **`/swarm reset --confirm`** — Clear swarm state files with safety confirmation.

### v4.4.0 — DX & Quality
- **CLI `uninstall` command** — Remove plugin with optional `--clean` flag.
- **Custom error classes** — `SwarmError` hierarchy with actionable `guidance` messages.
- **`/swarm history`** — View completed phases from plan.md.
- **`/swarm config`** — View current resolved plugin configuration.

### v4.3.2 — Security Hardening
- **Path validation** — `validateSwarmPath()` prevents directory traversal in `.swarm/` file operations.
- **Fetch hardening** — 10s timeout, 5MB limit, retry logic for gitingest tool.
- **Config limits** — Deep merge depth limit (10), config file size limit (100KB).

### v4.3.0 — Hooks & Agent Awareness
- **Hooks pipeline** — `safeHook()` crash-safe wrapper, `composeHandlers()` for multi-handler composition.
- **Context pruning** — Token budget tracking with 70%/90% threshold warnings.
- **Slash commands** — `/swarm status`, `/swarm plan`, `/swarm agents`.
- **Agent awareness** — Activity tracking, delegation tracking, cross-agent context injection.

All features are opt-in via configuration. See [Installation Guide](docs/installation.md) for config options.

---

## Agents

### 🎯 Orchestrator
| Agent | Role |
|-------|------|
| `architect` | Central coordinator. Plans phases, delegates tasks, manages QA, maintains project memory. |

### 🔍 Discovery
| Agent | Role |
|-------|------|
| `explorer` | Fast codebase scanner. Identifies structure, languages, frameworks, key files. |

### 🧠 Domain Expert
| Agent | Role |
|-------|------|
| `sme` | Open-domain expert. The architect specifies any domain (security, python, ios, rust, kubernetes, etc.) per call. No hardcoded list — works with any domain the LLM has knowledge of. |

### 💻 Implementation
| Agent | Role |
|-------|------|
| `coder` | Implements ONE task at a time with full context |
| `test_engineer` | Generates tests, runs them, and reports structured PASS/FAIL verdicts |

### ✅ Quality Assurance
| Agent | Role |
|-------|------|
| `reviewer` | Combined correctness + security review. The architect specifies CHECK dimensions (security, correctness, edge-cases, performance, etc.) per call. |
| `critic` | Plan review gate. Reviews the architect's plan BEFORE implementation — checks completeness, feasibility, scope, dependencies, and flags AI-slop. |

---

## Slash Commands

| Command | Description |
|---------|-------------|
| `/swarm status` | Current phase, task progress, and agent count |
| `/swarm plan [N]` | View full plan or filter by phase number |
| `/swarm agents` | List all registered agents with models and permissions |
| `/swarm history` | View completed phases with status icons |
| `/swarm config` | View current resolved plugin configuration |
| `/swarm diagnose` | Health check for .swarm/ files and config |
| `/swarm export` | Export plan and context as portable JSON |
| `/swarm reset --confirm` | Clear swarm state files (with safety gate) |
| `/swarm evidence [task]` | View evidence bundles for a task or all tasks |
| `/swarm archive [--dry-run]` | Archive old evidence bundles with retention policy |

---

## Configuration

Create `~/.config/opencode/opencode-swarm.json`:

```json
{
  "agents": {
    "architect": { "model": "anthropic/claude-sonnet-4-5" },
    "explorer": { "model": "google/gemini-2.0-flash" },
    "coder": { "model": "anthropic/claude-sonnet-4-5" },
    "sme": { "model": "google/gemini-2.0-flash" },
    "reviewer": { "model": "openai/gpt-4o" },
    "critic": { "model": "google/gemini-2.0-flash" },
    "test_engineer": { "model": "google/gemini-2.0-flash" }
  }
}
```

### Disable Agents
```json
{
  "sme": { "disabled": true },
  "test_engineer": { "disabled": true }
}
```

---

## Guardrails

OpenCode Swarm includes a built-in circuit breaker that prevents subagents from running away — burning API credits in infinite loops, repeating the same tool call, or spinning for hours.

### How It Works

| Layer | Trigger | Action |
|-------|---------|--------|
| ⚠️ **Soft Warning** | 50% of any limit reached | Injects warning message into agent's chat stream |
| 🛑 **Hard Block** | 100% of any limit reached | Blocks ALL further tool calls + injects stop message |

### Detection Signals

| Signal | Default Limit | Description |
|--------|---------------|-------------|
| Tool calls | 200 | Total tool invocations per agent session |
| Duration | 30 min | Wall-clock time since delegation started |
| Repetition | 10 | Same tool + args called consecutively |
| Consecutive errors | 5 | Sequential null/undefined tool outputs |

### Configuration

Guardrails are **enabled by default**. Customize in your swarm config:

```jsonc
{
  "guardrails": {
    "enabled": true,              // default: true
    "max_tool_calls": 200,        // range: 10–1000
    "max_duration_minutes": 30,   // range: 1–120
    "max_repetitions": 10,        // range: 3–50
    "max_consecutive_errors": 5,  // range: 2–20
    "warning_threshold": 0.5      // range: 0.1–0.9 (fraction of limit for soft warning)
  }
}
```

### Per-Agent Profiles

Override limits for specific agents that need more (or less) room:

```jsonc
{
  "guardrails": {
    "max_tool_calls": 200,
    "profiles": {
      "coder": { "max_tool_calls": 500, "max_duration_minutes": 60 },
      "explorer": { "max_tool_calls": 50 }
    }
  }
}
```

Profiles merge with base config — only specified fields are overridden.

> **Built-in Architect Defaults:** The architect agent automatically receives higher limits
> (600 tool calls, 90 min duration, 8 consecutive errors, 0.7 warning threshold) without any
> configuration. These built-in defaults can be overridden via a `profiles.architect` entry.

### Disable Guardrails

```json
{
  "guardrails": {
    "enabled": false
  }
}
```

---

## Comparison

| Feature | OpenCode Swarm | AutoGen | CrewAI | LangGraph |
|---------|---------------|---------|--------|-----------|
| Execution | Serial (predictable) | Parallel (chaotic) | Parallel | Configurable |
| Planning | Phased with acceptance criteria | Ad-hoc | Role-based | Graph-based |
| Memory | Persistent `.swarm/` files | Session only | Session only | Checkpoints |
| QA | Per-task (unified review) | Optional | Optional | Manual |
| Model mixing | Per-agent configuration | Limited | Limited | Manual |
| Resume projects | ✅ Native | ❌ | ❌ | Partial |
| SME domains | Open-domain (any) | Generic | Generic | Generic |
| Task granularity | One at a time | Batched | Batched | Varies |

---

## Design Principles

1. **Plan before code** - Documented phases with acceptance criteria
2. **One task at a time** - Focused work, quality output
3. **Review everything immediately** - Correctness + security review per task, not per project
4. **Cache SME knowledge** - Don't re-ask answered questions
5. **Persistent memory** - `.swarm/` files survive sessions
6. **Serial execution** - Predictable, debuggable, no race conditions
7. **Heterogeneous models** - Different perspectives catch different bugs
8. **User checkpoints** - Confirm before proceeding to next phase
9. **Failure tracking** - Document rejections, escalate after 5 attempts
10. **Resumable by design** - Any Architect can pick up any project

---

## Testing

```bash
# Run all tests
bun test

# Run specific test file
bun test tests/unit/config/schema.test.ts
```

876 unit tests across 39 files covering config, tools, agents, hooks, commands, state, guardrails, evidence, and plan schemas. Uses Bun's built-in test runner — zero additional test dependencies.

## Troubleshooting

### Plugin not loading
1. Verify `opencode-swarm` is listed in your `opencode.json` plugins array
2. Run `bunx opencode-swarm install` to auto-configure
3. Run `/swarm diagnose` to check health status

### Commands not working
- Ensure you're using `/swarm <command>`, not `/swarm/<command>`
- Run `/swarm` with no arguments to see available commands

### Resuming a project
- Swarm automatically detects `.swarm/plan.md` and resumes where you left off
- If you get unexpected behavior, run `/swarm export` to backup, then `/swarm reset --confirm` to start fresh

---

## Documentation

- [Architecture Deep Dive](docs/architecture.md)
- [Design Rationale](docs/design-rationale.md)
- [Installation Guide](docs/installation.md)

---

## License

MIT

---

<p align="center">
  <strong>Stop hoping your agents figure it out. Start shipping code that works.</strong>
</p>

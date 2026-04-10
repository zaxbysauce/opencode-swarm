# OpenCode Swarm

<div align="center">

**Your AI writes the code. Swarm makes sure it actually works.**

[![npm version](https://img.shields.io/npm/v/opencode-swarm?color=brightgreen&label=npm)](https://www.npmjs.com/package/opencode-swarm)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-6000%2B-success)](https://github.com/zaxbysauce/opencode-swarm)

[Website](https://swarmai.site/) · [Getting Started](docs/getting-started.md) · [Configuration](docs/configuration.md) · [Architecture](docs/architecture.md)

</div>

---

OpenCode Swarm is a plugin for [OpenCode](https://opencode.ai) that turns a single AI coding session into an **architect-led team of 11 specialized agents**. One agent writes the code. A different agent reviews it. Another writes and runs tests. Another checks security. **Nothing ships until every required gate passes.**

```bash
npm install -g opencode-swarm
```

### Why Swarm?

Most AI coding tools let one model write code and ask that same model whether the code is good. That misses too much. Swarm separates planning, implementation, review, testing, and documentation into specialized internal roles — and enforces gated execution so agents never mutate the codebase in parallel.

### Key Features

- 🏗️ **11 specialized agents** — architect, coder, reviewer, test engineer, critic, critic_sounding_board, critic_drift_verifier, explorer, SME, docs, designer
- 🔒 **Gated pipeline** — code never ships without reviewer + test engineer approval (bypassed in turbo mode)
- 🔄 **Phase completion gates** — completion-verify and drift verifier gates enforced before phase completion (bypassed in turbo mode)
- 🔁 **Resumable sessions** — all state saved to `.swarm/`; pick up any project any day
- 🌐 **12 languages** — TypeScript, Python, Go, Rust, Java, Kotlin, C#, C/C++, Swift, Dart, Ruby, PHP
- 🛡️ **Built-in security** — SAST, secrets scanning, dependency audit per task
- 🆓 **Free tier** — works with OpenCode Zen's free model roster
- ⚙️ **Fully configurable** — override any agent's model, disable agents, tune guardrails

> **You select a Swarm architect once in the OpenCode GUI.** The architect coordinates all other agents automatically — you never manually switch between internal roles. If you use the default OpenCode `Build` / `Plan` modes, the plugin is bypassed entirely.

---

## What Actually Happens

You say:

```text
Build me a JWT auth system.
```

Swarm then:

1. Clarifies only what it cannot infer.
2. Scans the codebase to understand what already exists.
3. Consults domain experts when needed and caches the guidance.
4. Writes a phased implementation plan.
5. Sends that plan through a critic gate before coding starts.
6. Executes one task at a time through the QA pipeline:

* coder writes code
* automated checks run
* reviewer checks correctness
* test engineer writes and runs tests
* architect runs regression sweep (scope:"graph" to find cross-task test regressions)
* failures loop back with structured feedback

7. After each phase, docs and retrospectives are updated.

All project state lives in `.swarm/`:

```text
.swarm/
├── plan.md                        # Projected plan (generated from ledger)
├── plan.json                      # Projected plan data (generated from ledger)
├── plan-ledger.jsonl              # Durable append-only ledger — authoritative source of truth (v6.44)
├── SWARM_PLAN.md                  # Export checkpoint artifact written on save_plan / phase_complete / close
├── SWARM_PLAN.json                # Export checkpoint artifact (importable via importCheckpoint)
├── context.md                     # Technical decisions and SME guidance
├── spec.md                        # Feature specification (written by /swarm specify)
├── close-summary.md               # Written by /swarm close with project summary
├── close-lessons.md               # Optional: explicit session lessons for /swarm close to curate
├── doc-manifest.json              # Documentation index built by doc_scan tool
├── events.jsonl                   # Event stream for diagnostics
├── evidence/                      # Review/test evidence bundles per task
├── telemetry.jsonl                # Session observability events (JSONL)
├── curator-summary.json           # Curator system state
├── curator-briefing.md            # Curator init briefing injected at session start
└── drift-report-phase-N.json      # Plan-vs-reality drift reports (Curator)
```

> **Plan durability (v6.44):** `plan-ledger.jsonl` is the authoritative source of truth for plan state. `plan.json` and `plan.md` are projections derived from the ledger — if they are missing or stale, `loadPlan()` auto-rebuilds them from the ledger. `SWARM_PLAN.md` / `SWARM_PLAN.json` are export-only checkpoint artifacts written automatically — use `SWARM_PLAN.json` to restore if both `plan.json` and the ledger are lost.

Swarm is resumable by design. If `.swarm/` already exists, the architect goes straight into **RESUME** → **EXECUTE** instead of repeating discovery.

---

## Quick Start

> **Prerequisites:** [OpenCode](https://opencode.ai) installed and working. An API key for at least one LLM provider (or use the free OpenCode Zen tier — no key required).

### Step 1 — Install

```bash
npm install -g opencode-swarm
```

### Step 2 — Open your project in OpenCode

```bash
cd /your/project
opencode
```

### Step 3 — Select a Swarm architect and describe your goal

1. In the OpenCode GUI, open the **agent/mode dropdown** and select a **Swarm architect** (e.g., `architect`).
2. Type what you want to build:

```text
Build a REST API with user registration, login, and JWT auth.
```

That's it. The architect coordinates all other agents automatically.

> **First time?** Run `/swarm diagnose` to verify Swarm is healthy, `/swarm agents` to see registered agents, and `/swarm config` to see the resolved configuration.

### Step 4 — Monitor progress

```text
/swarm status    # Current phase and task
/swarm plan      # Full project plan
/swarm evidence  # Review and test results per task
```

### Step 5 — Start over if needed

```text
/swarm reset --confirm
```

### Step 6 — Configure models (optional)

Swarm works with its defaults out of the box. To override models, create `.opencode/opencode-swarm.json`:

```json
{
  "agents": {
    "coder": { "model": "opencode/minimax-m2.5-free" },
    "reviewer": { "model": "opencode/big-pickle" }
  }
}
```

You only need to specify the agents you want to override. The `architect` inherits the model currently selected in the OpenCode UI unless you set it explicitly.

See the [full configuration reference](#configuration-reference) and the [free-tier model setup](#free-tier-opencode-zen-models) for more options.

### Step 7 — Performance modes (optional)

Swarm runs optional quality hooks (slop detection, incremental verification, compaction) on every tool call. For faster iteration, you can skip these:

**Via slash command** (session-wide):
```
/swarm turbo
```

**Via config** (persistent):
```json
{
  "execution_mode": "fast"
}
```

| Mode | Behavior |
|------|----------|
| `strict` | Runs all quality hooks (slop detector, incremental verify, compaction). Maximum safety, highest overhead. |
| `balanced` (default) | Skips optional quality hooks. Recommended for most workflows. |
| `fast` | Same as balanced. Reserved for future more aggressive optimizations. |

Use `strict` mode for critical security-sensitive changes. Switch to `balanced` for routine development.

---

## Common First-Run Questions

### "Do I need to select a Swarm architect?"

**Yes.** You must explicitly choose a Swarm architect agent in the OpenCode GUI before starting your session. If you use the default OpenCode `Build` / `Plan` options, the plugin is bypassed entirely.

### "Why did the second run start coding immediately?"

Because Swarm persists state in `.swarm/` and resumes from where it left off. Check `/swarm status` or `/swarm plan`.

### "How do I know Swarm is really active?"

Run:

```text
/swarm diagnose
/swarm agents
/swarm config
```

### "How do I force a clean restart?"

Run:

```text
/swarm reset --confirm
```

---

## LLM Provider Guide

Swarm works with any LLM provider supported by OpenCode. Different agents benefit from different models — the architect needs strong reasoning, the coder needs strong code generation, and the reviewer benefits from a model different from the coder (to catch blind spots).

### Free Tier — OpenCode Zen Models {#free-tier-opencode-zen-models}

OpenCode Zen provides free models via the `opencode/` provider prefix. These are excellent starting points and require no API key:

```json
{
  "agents": {
    "coder":        { "model": "opencode/minimax-m2.5-free" },
    "reviewer":     { "model": "opencode/big-pickle" },
    "test_engineer":{ "model": "opencode/gpt-5-nano" },
    "explorer":     { "model": "opencode/trinity-large-preview-free" },
    "sme":          { "model": "opencode/trinity-large-preview-free" },
    "critic":       { "model": "opencode/trinity-large-preview-free" },
    "docs":         { "model": "opencode/trinity-large-preview-free" },
    "designer":     { "model": "opencode/trinity-large-preview-free" }
  }
}
```

> Save this configuration to `.opencode/opencode-swarm.json` in your project root (or `~/.config/opencode/opencode-swarm.json` for global config).

> **Note:** The `architect` key is intentionally omitted — it inherits whatever model you have selected in the OpenCode UI for maximum reasoning quality.

### Paid Providers

For production use, mix providers to maximize quality across writing vs. reviewing:

| Agent | Recommended Model | Why |
|---|---|---|
| `architect` | OpenCode UI selection | Needs strongest reasoning |
| `coder` | `minimax-coding-plan/MiniMax-M2.5` | Fast, accurate code generation |
| `reviewer` | `zai-coding-plan/glm-5` | Different training data from coder |
| `test_engineer` | `minimax-coding-plan/MiniMax-M2.5` | Same strengths as coder |
| `explorer` | `google/gemini-2.5-flash` | Fast read-heavy analysis |
| `sme` | `kimi-for-coding/k2p5` | Strong domain expertise |
| `critic` | `zai-coding-plan/glm-5` | Independent plan review |
| `docs` | `zai-coding-plan/glm-4.7-flash` | Fast, cost-effective documentation generation |
| `designer` | `kimi-for-coding/k2p5` | Strong UI/UX generation capabilities |

### Provider Formats

| Provider | Format | Example |
|---|---|---|
| OpenCode Zen (free) | `opencode/<model>` | `opencode/trinity-large-preview-free` |
| Anthropic | `anthropic/<model>` | `anthropic/claude-opus-4-6` |
| Google | `google/<model>` | `google/gemini-2.5-flash` |
| Z.ai | `zai-coding-plan/<model>` | `zai-coding-plan/glm-5` |
| MiniMax | `minimax-coding-plan/<model>` | `minimax-coding-plan/MiniMax-M2.5` |
| Kimi | `kimi-for-coding/<model>` | `kimi-for-coding/k2p5` |

### Model Fallback (v6.33)

When a transient model error occurs (rate limit, 429, 503, timeout, overloaded, model not found), Swarm can automatically switch to a fallback model.

**Configuration:**

```json
{
  "agents": {
    "coder": {
      "model": "anthropic/claude-opus-4-6",
      "fallback_models": [
        "anthropic/claude-sonnet-4-5",
        "opencode/gpt-5-nano"
      ]
    }
  }
}
```

- **`fallback_models`** — Optional array of up to 3 fallback model identifiers. When the primary model fails with a transient error, Swarm injects a `MODEL FALLBACK` advisory and the next retry uses the next fallback model in the list.
- **Advisory injection** — When a transient error is detected, a `MODEL FALLBACK` advisory is injected into the architect's context: *"Transient model error detected (attempt N). The agent model may be rate-limited, overloaded, or temporarily unavailable. Consider retrying with a fallback model or waiting before retrying."*
- **Exhaustion guard** — After exhausting all fallbacks (`modelFallbackExhausted = true`), further transient errors do not spam additional advisories.
- **Reset on success** — Both `model_fallback_index` and `modelFallbackExhausted` reset to 0/false on the next successful tool execution.

### Bounded Coder Revisions (v6.33)

When a task requires multiple coder attempts (e.g., reviewer rejections), Swarm tracks how many times the coder has been re-delegated for the same task and warns when limits are approached.

**Configuration:**

```json
{
  "guardrails": {
    "max_coder_revisions": 5
  }
}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `max_coder_revisions` | integer | `5` | Maximum coder re-delegations per task before advisory warning (1–20) |

**Behavior:**
- **`coderRevisions` counter** — Incremented each time the coder delegation completes for the same task (reset on new task)
- **`revisionLimitHit` flag** — Set when `coderRevisions >= max_coder_revisions`
- **Advisory injection** — When the limit is hit, a `CODER REVISION LIMIT` advisory is injected: *"Agent has been revised N times (max: M) for task X. Escalate to user or consider a fundamentally different approach."*
- **Persistence** — Both `coderRevisions` and `revisionLimitHit` are serialized/deserialized in session snapshots

## Useful Commands

| Command | What It Does |
|---------|-------------|
| `/swarm status` | Where am I? Current phase, task progress |
| `/swarm plan` | Show the full project plan |
| `/swarm diagnose` | Health check for swarm state, including config parsing, grammar files, checkpoint manifest, events stream integrity, and steering directive staleness |
| `/swarm evidence 2.1` | Show review/test results for a specific task |
| `/swarm history` | What's been completed so far |
| `/swarm close [--prune-branches]` | Idempotent session close-out: writes retrospectives, curates lessons (reads `.swarm/close-lessons.md` if present), archives evidence, resets `context.md`, cleans config-backup files, optionally prunes merged branches |
| `/swarm reset --confirm` | Start over (clears all swarm state) |

---

## The Agents

Swarm has specialized internal agents, but you do **not** manually switch into them during normal use.

The **architect** is the coordinator. It decides when to invoke the other agents and what they should do.

That means the normal user workflow is:

1. open the project in OpenCode
2. describe what you want built or changed
3. let Swarm coordinate the internal pipeline
4. inspect progress with `/swarm status`, `/swarm plan`, and `/swarm evidence`

Agent roles (see [Agent Categories](#agent-categories) for classification reference):

| Agent | Role | When It Runs |
|---|---|---|
| `architect` | Coordinates the workflow, writes plans, enforces gates | Always |
| `explorer` | Scans the codebase and gathers context | Before planning, after phase wrap |
| `sme` | Provides domain guidance | During planning / consultation |
| `critic` | Reviews the plan before execution and blocks coding until approved | Before coding starts (CRITIC-GATE mode) |
| `critic_sounding_board` | Pre-escalation pushback — the architect consults this before contacting the user; returns UNNECESSARY / REPHRASE / APPROVED / RESOLVE | When architect hits an impasse |
| `critic_drift_verifier` | **Phase-close drift detector**: verifies that the completed implementation still matches the original plan spec. Returns APPROVED or NEEDS_REVISION. When NEEDS_REVISION is returned, the phase is **blocked** — the architect must address deviations before calling `phase_complete`. After receiving the verdict, the architect calls `write_drift_evidence` to record the gate result. Bypassed in turbo mode. | Before `phase_complete` (PHASE-WRAP mode) |
| `coder` | Implements one task at a time | During execution |
| `reviewer` | Reviews correctness and security | After each task |
| `test_engineer` | Writes and runs tests | After each task |
| `designer` | Generates UI scaffolds and design tokens when needed | UI-specific work |
| `docs` | Updates docs to match what was actually built | After each phase |

If you want to see what is active right now, run:

```text
/swarm status
/swarm agents
```

---

## How It Compares

| | OpenCode Swarm | oh-my-opencode | get-shit-done |
|---|:-:|:-:|:-:|
| Multiple specialized agents | ✅ 11 agents | ❌ Prompt config | ❌ Single-agent macros |
| Plan reviewed before coding starts | ✅ | ❌ | ❌ |
| Every task reviewed + tested | ✅ | ❌ | ❌ |
| Different model for review vs. coding | ✅ | ❌ | ❌ |
| Saves state to disk, resumable | ✅ | ❌ | ❌ |
| Security scanning built in | ✅ | ❌ | ❌ |
| Learns from its own mistakes | ✅ (retrospectives) | ❌ | ❌ |

---

## Agent Categories

Agents are classified into four categories for the monitor server `/metadata` endpoint:

| Category | Agents |
|----------|--------|
| `orchestrator` | architect |
| `pipeline` | explorer, coder, test_engineer |
| `qa` | reviewer, critic, critic_sounding_board, critic_drift_verifier |
| `support` | sme, docs, designer |

Use `getAgentCategory(agentName)` from `src/config/agent-categories.ts` to resolve an agent's category at runtime.

---

<details>
<summary><strong>Full Execution Pipeline (Technical Detail)</strong></summary>

### The Pipeline

Every task goes through this sequence. No exceptions, no overrides.

```
MODE: EXECUTE (per task)
│
├── 5a. @coder implements (ONE task only)
├── 5b. diff + imports (contract + dependency analysis)
├── 5c. syntax_check (parse validation)
├── 5d. placeholder_scan (catches TODOs, stubs, incomplete code)
├── 5e. lint fix → lint check
├── 5f. build_check (does it compile?)
├── 5g. pre_check_batch (4 parallel: lint, secretscan, SAST, quality budget)
├── 5h. @reviewer (correctness pass)
├── 5i. @reviewer (security pass, if security-sensitive files changed)
├── 5j. @test_engineer (verification tests + coverage ≥70%)
├── 5k. @test_engineer (adversarial tests)
├── 5l. architect regression sweep (scope:"graph" to find cross-task test regressions)
├── 5l-ter. test drift detection (conditional — fires when changes involve command behaviour,
│         parsing/routing logic, user-visible output, public contracts, assertion-heavy areas,
│         or helper lifecycle changes; validates tests still align with current behaviour)
├── 5m. ⛔ Pre-commit checklist (all 4 items required, no override)
└── 5n. Task marked complete, evidence written
```

If any step fails, the coder gets structured feedback and retries. After 5 failures on the same task, it escalates to you.

### Architect Workflow Modes

The architect moves through these modes automatically:

| Mode | What It Means |
|---|---|
| `RESUME` | Existing `.swarm/` state was found, so Swarm continues where it left off |
| `CLARIFY` | Swarm asks for missing information it cannot infer |
| `DISCOVER` | Explorer scans the codebase; co-change dark matter analysis runs automatically to detect hidden file couplings (v6.41) |
| `CONSULT` | SME agents provide domain guidance |
| `PLAN` | Architect writes or updates the phased plan (includes CODEBASE REALITY CHECK on brownfield projects) |
| `CRITIC-GATE` | Critic reviews the plan before execution |
| `EXECUTE` | Tasks are implemented one at a time through the QA pipeline |
| `PHASE-WRAP` | A phase closes out, including: explorer rescan, docs update, `context.md` update, `write_retro`, evidence check, `sbom_generate`, **`@critic_drift_verifier` delegation** (drift check — blocking gate), `write_drift_evidence` call with verdict, mandatory gate evidence verification (`completion-verify.json` + `drift-verifier.json` both required), then `phase_complete` |

> **CODEBASE REALITY CHECK (v6.29.2):** Before any planning, the Architect dispatches Explorer to verify the current state of every referenced item. Produces a CODEBASE REALITY REPORT with statuses: NOT STARTED, PARTIALLY DONE, ALREADY COMPLETE, or ASSUMPTION INCORRECT. This prevents planning against stale assumptions. Skipped for greenfield projects with no existing codebase references.

> **Phase Completion Gates (v6.33.4):** Before a phase can be marked complete, two mandatory gates are enforced: (1) completion-verify — deterministic check that plan task identifiers exist in source files, and (2) critic_drift_verifier evidence — verification that the drift verifier approved the implementation. Both gates are automatically bypassed when turbo mode is active.

### Important

A second or later run does **not** necessarily look like a first run.

If `.swarm/plan.md` already exists, the architect may enter `RESUME` and then go directly into `EXECUTE`. That is expected and does **not** mean Swarm stopped using agents.

Use `/swarm status` if you are unsure what Swarm is doing.

Release automation uses release-please and requires conventional commit prefixes such as `fix:` or `feat:` on changes merged to `main`.

</details>

<details>
<summary><strong>Persistent Memory (What's in .swarm/)</strong></summary>

### plan.md: Your Project Roadmap

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
  - Acceptance: Returns valid JWT with user claims, 15-minute expiry
  - Attempt 1: REJECTED — missing expiration claim
- [ ] Task 2.3: Token validation middleware [MEDIUM]
```

### context.md: What's Been Decided

```markdown
## Technical Decisions
- bcrypt cost factor: 12
- JWT TTL: 15 minutes; refresh TTL: 7 days

## SME Guidance (cached, never re-asked)
### security (Phase 1)
- Never log tokens or passwords
- Rate-limit login: 5 attempts / 15 min per IP

### api (Phase 1)
- Return 401 for invalid credentials (not 404)
```

### Evidence Bundles

Every completed task writes structured evidence to `.swarm/evidence/`:

| Type | What It Captures |
|------|--------------------|
| review | Verdict, risk level, specific issues |
| test | Pass/fail counts, coverage %, failure messages |
| diff | Files changed, additions/deletions |
| retrospective | Phase metrics, lessons learned, error taxonomy classification (injected into next phase) |
| secretscan | Secret scan results: findings count, files scanned, skipped files (v6.33) |
| completion-verify | Deterministic gate: verifies plan task identifiers exist in source files (written automatically by `completion-verify` tool; required before `phase_complete`) |
| drift-verifier | Phase-close drift gate: `critic_drift_verifier` verdict (APPROVED/NEEDS_REVISION) and summary (written by architect via `write_drift_evidence`; required before `phase_complete`) |

### telemetry.jsonl: Session Observability

Swarm emits structured JSONL events to `.swarm/telemetry.jsonl` for observability tooling (dashboards, alerting, audit logs). Events are fire-and-forget — failures never affect execution.

```json
{"timestamp":"2026-03-25T14:30:00.000Z","event":"session_started","sessionId":"abc123","agentName":"architect"}
{"timestamp":"2026-03-25T14:30:05.000Z","event":"delegation_begin","sessionId":"abc123","agentName":"coder","taskId":"1.1"}
{"timestamp":"2026-03-25T14:31:00.000Z","event":"delegation_end","sessionId":"abc123","agentName":"coder","taskId":"1.1","result":"success"}
{"timestamp":"2026-03-25T14:31:10.000Z","event":"gate_passed","sessionId":"abc123","gate":"reviewer","taskId":"1.1"}
{"timestamp":"2026-03-25T14:32:00.000Z","event":"phase_changed","sessionId":"abc123","oldPhase":1,"newPhase":2}
```

| Event | When Emitted |
|-------|-------------|
| `session_started` | New agent session created |
| `session_ended` | Session ends (reason: normal, timeout, error) |
| `agent_activated` | Agent identity confirmed via chat.message |
| `delegation_begin` | Task dispatched to a sub-agent |
| `delegation_end` | Sub-agent returns (success, rejected, error) |
| `task_state_changed` | Task workflow state transitions |
| `gate_passed` | Evidence written to `.swarm/evidence/{taskId}.json` |
| `gate_failed` | Gate check blocked task completion |
| `phase_changed` | Phase completed and new phase started |
| `budget_updated` | Context budget crossed warning/critical threshold |
| `hard_limit_hit` | Tool call/duration/repetition limit reached |
| `revision_limit_hit` | Coder revision limit exceeded |
| `loop_detected` | Repetitive tool call pattern detected |
| `scope_violation` | Architect wrote outside declared scope |
| `qa_skip_violation` | QA gate skipped without valid reason |
| `model_fallback` | Transient error triggered model fallback |
| `heartbeat` | 30-second throttled keep-alive signal |

File rotates automatically at 10MB to `.swarm/telemetry.jsonl.1`.

</details>

<details>
<summary><strong>Save Plan Tool: Target Workspace Requirement</strong></summary>

The `save_plan` tool requires an explicit target workspace path. It does **not** fall back to `process.cwd()`.

### Explicit Workspace Requirement

- The `working_directory` parameter must be provided
- Providing no value or relying on implicit directory resolution will result in deterministic failure

### Failure Conditions

| Condition | Behavior |
|-----------|----------|
| Missing (`undefined` / `null`) | Fails with: "Target workspace is required" |
| Empty or whitespace-only | Fails with: "Target workspace cannot be empty or whitespace" |
| Path traversal (`..`) | Fails with: "Target workspace cannot contain path traversal" |

### Usage Contract

When using `save_plan`, always pass a valid `working_directory`:

```typescript
save_plan({
  title: "My Project",
  swarm_id: "mega",
  phases: [{ id: 1, name: "Setup", tasks: [{ id: "1.1", description: "Initialize project" }] }],
  working_directory: "/path/to/project"  // Required - no fallback
})
```

</details>

<details>
<summary><strong>Guardrails and Circuit Breakers</strong></summary>

Every agent runs inside a circuit breaker that kills runaway behavior before it burns your credits.

| Signal | Default Limit | What Happens |
|--------|:---:|-------------|
| Tool calls | 200 | Agent is stopped |
| Duration | 30 min | Agent is stopped |
| Same tool repeated | 10x | Agent is warned, then stopped |
| Consecutive errors | 5 | Agent is stopped |

Limits reset per task. A coder working on Task 2.3 is not penalized for tool calls made during Task 2.2.

#### Architect Self-Coding Block

If the architect writes files directly instead of delegating to the coder, a hard block fires:

| Write count | Behavior |
|:-----------:|----------|
| 1–2 | Warning injected into next architect message |
| ≥ 3 | `Error` thrown with `SELF_CODING_BLOCK` — identifies file paths written and count |

The counter resets only when a coder delegation is dispatched. This is a hard enforcement — not advisory.

Per-agent overrides:

```json
{
  "guardrails": {
    "profiles": {
      "coder": { "max_tool_calls": 500, "max_duration_minutes": 60 },
      "explorer": { "max_tool_calls": 50 }
    }
  }
}
```

</details>

<details>
<summary><strong>File Authority (Per-Agent Write Permissions)</strong></summary>

Swarm enforces per-agent file write authority — each agent can only write to specific paths. By default, these rules are hardcoded, but you can override them via config.

### Default Rules

| Agent | Can Write | Blocked | Zones |
|-------|-----------|---------|-------|
| `architect` | Everything (except plan files) | `.swarm/plan.md`, `.swarm/plan.json` | `generated` |
| `coder` | `src/`, `tests/`, `docs/`, `scripts/` | `.swarm/` (entire directory) | `generated`, `config` |
| `reviewer` | `.swarm/evidence/`, `.swarm/outputs/` | `src/`, `.swarm/plan.md`, `.swarm/plan.json` | `generated` |
| `test_engineer` | `tests/`, `.swarm/evidence/` | `src/`, `.swarm/plan.md`, `.swarm/plan.json` | `generated` |
| `explorer` | Read-only | Everything | — |
| `sme` | Read-only | Everything | — |
| `docs` | `docs/`, `.swarm/outputs/` | — | `generated` |
| `designer` | `docs/`, `.swarm/outputs/` | — | `generated` |
| `critic` | `.swarm/evidence/` | — | `generated` |

### Prefixed Agents

Prefixed agents (e.g., `paid_coder`, `mega_reviewer`, `local_architect`) inherit defaults from their canonical base agent via `stripKnownSwarmPrefix`. The lookup order is:

1. Exact match for the prefixed name (if explicitly defined in user config)
2. Fall back to the canonical agent's defaults (e.g., `paid_coder` → `coder`)

```json
{
  "authority": {
    "rules": {
      "coder": { "allowedPrefix": ["src/", "lib/"] },
      "paid_coder": { "allowedPrefix": ["vendor/", "plugins/"] }
    }
  }
}
```

In this example, `paid_coder` gets its own explicit rule, while other prefixed coders (e.g., `mega_coder`) fall back to `coder`.

### Runtime Enforcement

Architect direct writes are enforced at runtime via `toolBefore` hook. This tracks writes to source code paths outside `.swarm/` and protects `.swarm/plan.md` and `.swarm/plan.json` from direct modification.

### Configuration

Override default rules in `.opencode/opencode-swarm.json`:

```json
{
  "authority": {
    "enabled": true,
    "rules": {
      "coder": {
        "allowedPrefix": ["src/", "lib/", "scripts/"],
        "blockedPrefix": [".swarm/"],
        "blockedZones": ["generated"]
      },
      "explorer": {
        "readOnly": false,
        "allowedPrefix": ["notes/", "scratch/"]
      }
    }
  }
}
```

### Rule Fields

| Field | Type | Description |
|-------|------|-------------|
| `readOnly` | boolean | If `true`, agent cannot write anywhere |
| `blockedExact` | string[] | Exact file paths that are blocked |
| `allowedExact` | string[] | Exact file paths that are allowed (overrides prefix/glob restrictions) |
| `blockedPrefix` | string[] | Path prefixes that are blocked (e.g., `.swarm/`) |
| `allowedPrefix` | string[] | Only these path prefixes are allowed. Omit to remove restriction; set `[]` to deny all |
| `blockedGlobs` | string[] | Glob patterns that are blocked (uses picomatch: `**`, `*`, `?`) |
| `allowedGlobs` | string[] | Glob patterns that are allowed (uses picomatch: `**`, `*`, `?`) |
| `blockedZones` | string[] | File zones to block: `production`, `test`, `config`, `generated`, `docs`, `build` |

### Merge Behavior

- User rules **override** hardcoded defaults for the specified agent
- Scalar fields (`readOnly`) — user value replaces default
- Array fields (`blockedPrefix`, `allowedPrefix`, etc.) — user array **replaces** entirely (not merged)
- If a field is omitted in the user rule for a **known agent** (one with hardcoded defaults), the default value for that field is preserved
- If a field is omitted in the user rule for a **custom agent** (not in the defaults list), that field is `undefined` — there are no defaults to inherit
- `allowedPrefix: []` explicitly denies all writes; omitting `allowedPrefix` entirely means no allowlist restriction is applied (all paths are evaluated against blocklist rules only)
- Setting `enabled: false` ignores all custom rules and uses hardcoded defaults

### Custom Agents

Custom agents (not in the defaults list) start with no rules. Their write authority depends entirely on what you configure:

- **Not in config at all** — agent is denied with `Unknown agent` (no rule exists; this is not the same as "blocked from all writes")
- **In config without `allowedPrefix`** — no allowlist restriction applies; only any `blockedPrefix`, `blockedZones`, or `readOnly` rules you explicitly set will enforce limits
- **In config with `allowedPrefix: []`** — all writes are denied

To safely restrict a custom agent, always set `allowedPrefix` explicitly:

```json
{
  "authority": {
    "rules": {
      "my_custom_agent": {
        "allowedPrefix": ["plugins/", "extensions/"],
        "blockedZones": ["generated"]
      }
    }
  }
}
```

### Advanced Examples

#### Glob Pattern Support

Use glob patterns for complex path matching:

```json
{
  "authority": {
    "rules": {
      "coder": {
        "allowedGlobs": ["src/**/*.ts", "tests/**/*.test.ts"],
        "blockedGlobs": ["src/**/*.generated.ts", "**/*.d.ts"],
        "allowedExact": ["src/index.ts", "package.json"]
      },
      "docs_agent": {
        "allowedGlobs": ["docs/**/*.md", "*.md"],
        "blockedExact": [".swarm/plan.md"]
      }
    }
  }
}
```

**Glob Pattern Features:**
- `**` — Match any number of directories: `src/**/*.ts` matches all TypeScript files in src/ and subdirectories
- `*` — Match any characters except path separators: `*.md` matches all Markdown files in current directory
- `?` — Match single character: `test?.js` matches `test1.js`, `testa.js`
- Uses [picomatch](https://github.com/micromatch/picomatch) for cross-platform compatibility

**Path Normalization and Symlinks:**
Paths are resolved via `realpathSync` before matching, which resolves symlinks and prevents path-traversal escapes. However, if a symlink's target does not exist, `realpathSync` throws and the fallback returns the symlink's own path (unresolved). A dangling symlink inside an `allowedPrefix` directory will therefore pass prefix-based checks even if its intended target is outside the project. Use `blockedExact` or `blockedGlobs` to deny known dangling-symlink paths explicitly.

**Evaluation Order:**
1. `readOnly` check (if true, deny all writes)
2. `blockedExact` (exact path matches, highest priority)
3. `blockedGlobs` (glob pattern matches)
4. `allowedExact` (exact path matches, overrides prefix/glob restrictions)
5. `allowedGlobs` (glob pattern matches)
6. `blockedPrefix` (prefix matches)
7. `allowedPrefix` (prefix matches)
8. `blockedZones` (zone classification)

</details>

<details>
<summary><strong>Context Budget Guard</strong></summary>

The Context Budget Guard monitors how much context Swarm is injecting into the conversation. It helps prevent context overflow before it becomes a problem.

### Default Behavior

- **Enabled automatically** — No setup required. Swarm starts tracking context usage right away.
- **What it measures** — Only the context that Swarm injects (plan, context, evidence, retrospectives). It does **not** count your chat history or the model's responses.
- **Warning threshold (0.7 ratio)** — When swarm-injected context reaches ~2800 tokens (70% of 4000), the architect receives a one-time advisory warning. This is informational — execution continues normally.
- **Critical threshold (0.9 ratio)** — When context reaches ~3600 tokens (90% of 4000), the architect receives a critical alert with a recommendation to run `/swarm handoff`. This is also one-time only.
- **Non-nagging** — Alerts fire once per session, not repeatedly. You won't be pestered every turn.
- **Who sees warnings** — Only the architect receives these warnings. Other agents are unaware of the budget.

To disable entirely, set `context_budget.enabled: false` in your swarm config.

### Configuration Reference

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `context_budget.enabled` | boolean | `true` | Enable or disable the context budget guard entirely |
| `context_budget.max_injection_tokens` | number | `4000` | Token budget for swarm-injected context per turn. This is NOT the model's context window — it's the swarm plugin's own contribution |
| `context_budget.warn_threshold` | number | `0.7` | Ratio (0.0-1.0) of `max_injection_tokens` that triggers a warning advisory |
| `context_budget.critical_threshold` | number | `0.9` | Ratio (0.0-1.0) of `max_injection_tokens` that triggers a critical alert with handoff recommendation |
| `context_budget.enforce` | boolean | `true` | When true, enforces budget limits and may trigger handoffs |
| `context_budget.prune_target` | number | `0.7` | Ratio (0.0-1.0) of context to preserve when pruning occurs |
| `context_budget.preserve_last_n_turns` | number | `4` | Number of recent turns to preserve when pruning |
| `context_budget.recent_window` | number | `10` | Number of turns to consider as "recent" for scoring |
| `context_budget.tracked_agents` | string[] | `['architect']` | Agents to track for context budget warnings |
| `context_budget.enforce_on_agent_switch` | boolean | `true` | Enforce budget limits when switching agents |
| `context_budget.model_limits` | record | `{ default: 128000 }` | Per-model token limits (model name -> max tokens) |
| `context_budget.tool_output_mask_threshold` | number | `2000` | Threshold for masking tool outputs (chars) |
| `context_budget.scoring.enabled` | boolean | `false` | Enable context scoring/ranking |
| `context_budget.scoring.max_candidates` | number | `100` | Maximum items to score (10-500) |
| `context_budget.scoring.weights` | object | `{ recency: 0.3, ... }` | Scoring weights for priority |
| `context_budget.scoring.decision_decay` | object | `{ mode: 'exponential', half_life_hours: 24 }` | Decision relevance decay |
| `context_budget.scoring.token_ratios` | object | `{ prose: 0.25, code: 0.4, ... }` | Token cost multipliers |

### Example Configurations

**Minimal (disable):**
```json
{
  "context_budget": {
    "enabled": false
  }
}
```

**Default (reference):**
```json
{
  "context_budget": {
    "enabled": true,
    "max_injection_tokens": 4000,
    "warn_threshold": 0.7,
    "critical_threshold": 0.9,
    "enforce": true,
    "prune_target": 0.7,
    "preserve_last_n_turns": 4,
    "recent_window": 10,
    "tracked_agents": ["architect"],
    "enforce_on_agent_switch": true,
    "model_limits": { "default": 128000 },
    "tool_output_mask_threshold": 2000,
    "scoring": {
      "enabled": false,
      "max_candidates": 100,
      "weights": { "recency": 0.3, "relevance": 0.4, "importance": 0.3 },
      "decision_decay": { "mode": "exponential", "half_life_hours": 24 },
      "token_ratios": { "prose": 0.25, "code": 0.4, "json": 0.6, "logs": 0.1 }
    }
  }
}
```

**Aggressive (for long-running sessions):**
```json
{
  "context_budget": {
    "enabled": true,
    "max_injection_tokens": 2000,
    "warn_threshold": 0.5,
    "critical_threshold": 0.75,
    "enforce": true,
    "prune_target": 0.6,
    "preserve_last_n_turns": 2,
    "recent_window": 5,
    "tracked_agents": ["architect"],
    "enforce_on_agent_switch": true,
    "model_limits": { "default": 128000 },
    "tool_output_mask_threshold": 1500,
    "scoring": {
      "enabled": true,
      "max_candidates": 50,
      "weights": { "recency": 0.5, "relevance": 0.3, "importance": 0.2 },
      "decision_decay": { "mode": "linear", "half_life_hours": 12 },
      "token_ratios": { "prose": 0.2, "code": 0.35, "json": 0.5, "logs": 0.05 }
    }
  }
}
```

### What This Does NOT Do

- **Does NOT prune chat history** — Your conversation with the model is untouched
- **Does NOT modify tool outputs** — What tools return is unchanged
- **Does NOT block execution** — The guard is advisory only; it warns but never stops the pipeline
- **Does NOT interact with compaction.auto** — Separate feature with separate configuration
- **Only measures swarm's injected context** — Not the full context window, just what Swarm adds

</details>

<details>
<summary><strong>Quality Gates (Technical Detail)</strong></summary>

### Built-in Tools

| Tool | What It Does |
|------|-------------|
| syntax_check | Tree-sitter validation across 12 languages |
| placeholder_scan | Catches TODOs, FIXMEs, stubs, placeholder text |
| sast_scan | Offline security analysis, 63+ rules, 9 languages |
| sbom_generate | CycloneDX dependency tracking, 8 ecosystems |
| build_check | Runs your project's native build/typecheck |
| incremental_verify | Post-coder typecheck for TS/JS, Go, Rust, C# (v6.29.2) |
| quality_budget | Enforces complexity, duplication, and test ratio limits |
| pre_check_batch | Runs lint, secretscan, SAST, and quality budget in parallel (~15s vs ~60s sequential) |
| phase_complete | Enforces phase completion, verifies required agents, requires a valid retrospective evidence bundle, logs events, and resets state; appends to `events.jsonl` with file locking |


All tools run locally. No Docker, no network calls, no external APIs.

Optional enhancement: Semgrep (if on PATH).

### Gate Configuration

```json
{
  "gates": {
    "syntax_check": { "enabled": true },
    "placeholder_scan": { "enabled": true },
    "sast_scan": { "enabled": true },
    "quality_budget": {
      "enabled": true,
      "max_complexity_delta": 5,
      "min_test_to_code_ratio": 0.3
    }
  }
}
```

</details>

<details>
<summary><strong>File Locking for Concurrent Write Safety</strong></summary>

Swarm uses file locking to protect shared state files from concurrent write corruption. The locking strategy differs by file: `plan.json` uses hard locking (write blocked on contention), while `events.jsonl` uses advisory locking (write proceeds with a warning on contention).

### Locking Implementation

- **Library**: `proper-lockfile` with `retries: 0` (fail-fast — no polling retries)
- **Scope**: Each tool acquires an exclusive lock on the target file before writing
- **Agents**: Lock is tagged with the current agent name and task context for diagnostics

### Protected Files

| File | Tool | Lock Key |
|------|------|----------|
| `.swarm/plan.json` | `update_task_status` | `plan.json` |
| `.swarm/events.jsonl` | `phase_complete` | `events.jsonl` |

### Lock Semantics

The two protected tools use different strategies:

**`update_task_status` — Hard lock on `plan.json`**

When two calls contend for `plan.json`:
1. **Exactly one call wins** — only the first to acquire the lock proceeds
2. **Winner writes** — the lock holder writes to the file, then releases the lock
3. **Losers receive `success: false`** — with `recovery_guidance: "retry"` and an error message identifying the lock holder

```json
{
  "success": false,
  "message": "Task status write blocked: plan.json is locked by architect (task: update-task-status-1.1-1234567890)",
  "errors": ["Concurrent plan write detected — retry after the current write completes"],
  "recovery_guidance": "Wait a moment and retry update_task_status. The lock will expire automatically if the holding agent fails."
}
```

**What the caller should do**: Retry `update_task_status` after a short delay.

**`phase_complete` — Advisory lock on `events.jsonl`**

When two calls contend for `events.jsonl`:
1. **Lock is attempted** — if acquired, write is serialized
2. **If lock unavailable** — a warning is added to the result and the write proceeds anyway
3. **Both callers return `success: true`** — duplicate concurrent appends are possible but `events.jsonl` is an append-only log and duplicate phase entries do not corrupt state

This asymmetry is intentional: `plan.json` stores mutable structured JSON where concurrent overwrites produce malformed files; `events.jsonl` is an append-only log where a duplicate entry is a recoverable nuisance.

### Lock Recovery

If a lock-holding agent crashes or hangs, the lock file will eventually expire (handled by `proper-lockfile` stale-lock cleanup). On the next retry, the call will succeed. Swarm does not auto-retry on lock contention — the architect receives the error and decides when to retry.

</details>

<details>
<summary id="configuration-reference"><strong>Full Configuration Reference</strong></summary>

Config file location: `~/.config/opencode/opencode-swarm.json` (global) or `.opencode/opencode-swarm.json` (project). Project config merges over global.

```json
{
  "agents": {
    "architect": { "model": "anthropic/claude-opus-4-6" },
    "coder": { "model": "minimax-coding-plan/MiniMax-M2.5", "fallback_models": ["minimax-coding-plan/MiniMax-M2.1"] },
    "explorer": { "model": "minimax-coding-plan/MiniMax-M2.1" },
    "sme": { "model": "kimi-for-coding/k2p5" },
    "critic": { "model": "zai-coding-plan/glm-5" },
    "reviewer": { "model": "zai-coding-plan/glm-5", "fallback_models": ["opencode/big-pickle"] },
    "test_engineer": { "model": "minimax-coding-plan/MiniMax-M2.5" },
    "docs": { "model": "zai-coding-plan/glm-4.7-flash" },
    "designer": { "model": "kimi-for-coding/k2p5" }
  },
  "guardrails": {
    "max_tool_calls": 200,
    "max_duration_minutes": 30,
    "profiles": {
      "coder": { "max_tool_calls": 500 }
    }
  },
  "authority": {
    "enabled": true,
    "rules": {
      "coder": {
        "allowedPrefix": ["src/", "lib/"],
        "blockedPrefix": [".swarm/"],
        "blockedZones": ["generated"]
      }
    }
  },
  "review_passes": {
    "always_security_review": false,
    "security_globs": ["**/*auth*", "**/*crypto*", "**/*session*"]
  },
  "automation": {
    "mode": "manual",
    "capabilities": {
      "plan_sync": true,
      "phase_preflight": false,
      "config_doctor_on_startup": false,
      "config_doctor_autofix": false,
      "evidence_auto_summaries": true,
      "decision_drift_detection": true
    }
  },
  "knowledge": {
    "enabled": true,
    "swarm_max_entries": 100,
    "hive_max_entries": 1000,
    "auto_promote_days": 30,
    "max_inject_count": 5,
    "dedup_threshold": 0.6,
    "scope_filter": ["global"],
    "hive_enabled": true,
    "rejected_max_entries": 200,
    "validation_enabled": true,
    "evergreen_confidence": 0.8,
    "evergreen_utility": 0.5,
    "low_utility_threshold": 0.2,
    "min_retrievals_for_utility": 3,
    "schema_version": "v6.17"
  }
}
```

### Automation

## Mode Detection (v6.13)

Swarm now explicitly distinguishes five architect modes:

- **`DISCOVER`** — After the explorer finishes scanning the codebase.
- **`PLAN`** — When the architect writes or updates the plan.
- **`EXECUTE`** — During task implementation (the normal pipeline).
- **`PHASE-WRAP`** — After all tasks in a phase are completed, before docs are updated.
- **`UNKNOWN`** — Fallback when the current state does not match any known mode.

Each mode determines which injection blocks are added to the LLM prompt (e.g., plan cursor is injected in `PLAN`, tool output truncation in `EXECUTE`, etc.).

Default mode: `manual`. No background automation — all actions require explicit slash commands.

Modes:

- `manual` — No background automation. All actions via slash commands (default).
- `hybrid` — Background automation for safe operations, manual for sensitive ones.
- `auto` — Full background automation.

Capability defaults:

- `plan_sync`: `true` — Background plan synchronization using `fs.watch` with debounced writes (300ms) and 2-second polling fallback
- `phase_preflight`: `false` — Phase preflight checks before agent execution (opt-in)
- `config_doctor_on_startup`: `false` — Validate configuration on startup
- `config_doctor_autofix`: `false` — Auto-fix for config doctor (opt-in, security-sensitive)
- `evidence_auto_summaries`: `true` — Automatic summaries for evidence bundles
- `decision_drift_detection`: `true` — Detect drift between planned and actual decisions

## Plan Cursor (v6.13)

The `plan_cursor` config compresses the plan that is injected into the LLM context.

```json
{
  "plan_cursor": {
    "enabled": true,
    "max_tokens": 1500,
    "lookahead_tasks": 2
  }
}
```

- **enabled** – When `true` (default) Swarm injects a compact plan cursor instead of the full `plan.md`.
- **max_tokens** – Upper bound on the number of tokens emitted for the cursor (default 1500). The cursor contains the current phase summary, the full current task, and up to `lookahead_tasks` upcoming tasks. Earlier phases are reduced to one‑line summaries.
- **lookahead_tasks** – Number of future tasks to include in full detail (default 2). Set to `0` to show only the current task.

Disabling (`"enabled": false`) falls back to the pre‑v6.13 behavior of injecting the entire plan text.

## Tool Output Truncation (v6.13)

Control the size of tool outputs that are sent back to the LLM.

```json
{
  "tool_output": {
    "truncation_enabled": true,
    "max_lines": 150,
    "per_tool": {
      "diff": 200,
      "symbols": 100
    }
  }
}
```

- **truncation_enabled** – Global switch (default true).
- **max_lines** – Default line limit for any tool output.
- **per_tool** – Overrides `max_lines` for specific tools. The `diff` and `symbols` tools are truncated by default because their outputs can be very large.

When truncation is active, a footer is appended:

```
---
[output truncated to {maxLines} lines – use `tool_output.per_tool.<tool>` to adjust]
```

## Summarization Settings

Control how tool outputs are summarized for LLM context.

```json
{
  "summaries": {
    "threshold_bytes": 102400,
    "exempt_tools": ["retrieve_summary", "task", "read"]
  }
}
```

- **threshold_bytes** – Output size threshold in bytes before summarization is triggered (default 102400 = 100KB).
- **exempt_tools** – Tools whose outputs are never summarized. Defaults to `["retrieve_summary", "task", "read"]` to prevent re-summarization loops.

> **Note:** The `retrieve_summary` tool supports paginated retrieval via `offset` and `limit` parameters to fetch large summarized outputs in chunks.

---

### Disabling Agents

```json
{
  "sme": { "disabled": true },
  "designer": { "disabled": true },
  "test_engineer": { "disabled": true }
}
```

</details>

<details>
<summary><strong>All Slash Commands</strong></summary>

| Command | Description |
|---------|-------------|
| `/swarm status` | Current phase, task progress, agent count |
| `/swarm plan [N]` | Full plan or filtered by phase |
| `/swarm agents` | Registered agents with models and permissions |
| `/swarm history` | Completed phases with status |
| `/swarm config` | Current resolved configuration |
| `/swarm diagnose` | Health check for `.swarm/` files and config |
| `/swarm export` | Export plan and context as portable JSON |
| `/swarm evidence [task]` | Evidence bundles for a task or all tasks |
| `/swarm archive [--dry-run]` | Archive old evidence with retention policy |
| `/swarm benchmark` | Performance benchmarks |
| `/swarm retrieve [id]` | Retrieve auto-summarized tool outputs (supports offset/limit pagination) |
| `/swarm reset --confirm` | Clear swarm state files |
| `/swarm reset-session` | Clear session state files in `.swarm/session/` (preserves plan and context) |
| `/swarm preflight` | Run phase preflight checks |
| `/swarm config doctor [--fix]` | Config validation with optional auto-fix |
| `/swarm doctor tools` | Tool registration coherence and binary readiness check |
| `/swarm sync-plan` | Force plan.md regeneration from plan.json |
| `/swarm specify [description]` | Generate or import a feature specification |
| `/swarm clarify [topic]` | Clarify and refine an existing feature specification |
| `/swarm analyze` | Analyze spec.md vs plan.md for requirement coverage gaps |
| `/swarm close [--prune-branches]` | Idempotent session close-out: retrospectives, lesson curation, evidence archive, context.md reset, config-backup cleanup, optional branch pruning |
| `/swarm write-retro` | Write a phase retrospective manually |
| `/swarm handoff` | Generate a handoff summary for context-budget-critical sessions |
| `/swarm simulate` | Simulate plan execution without writing code |
| `/swarm promote` | Promote swarm-scoped knowledge to hive (global) knowledge |
| `/swarm evidence summary` | Generate a summary across all evidence bundles with completion ratio and blockers |
| `/swarm knowledge` | List knowledge entries |
| `/swarm knowledge migrate` | Migrate knowledge entries to the current format |
| `/swarm knowledge quarantine [id]` | Move a knowledge entry to quarantine |
| `/swarm knowledge restore [id]` | Restore a quarantined knowledge entry |
| `/swarm turbo` | Enable turbo mode for the current session (bypasses QA gates) |
| `/swarm full-auto` | Toggle Full-Auto Mode for the current session [on|off] |
| `/swarm checkpoint` | Save a git checkpoint for the current state |

</details>

---

## Role-Scoped Tool Filtering

Swarm limits which tools each agent can access based on their role. This prevents agents from using tools that aren't appropriate for their responsibilities, reducing errors and keeping agents focused.

### Default Tool Allocations

| Agent | Tools | Count | Rationale |
|-------|-------|:---:|-----------|
| **architect** | All registered tools | — | Orchestrator needs full visibility |
| **reviewer** | diff, imports, lint, pkg_audit, pre_check_batch, secretscan, symbols, complexity_hotspots, retrieve_summary, extract_code_blocks, test_runner, suggest_patch, batch_symbols | 13 | Security-focused QA |
| **coder** | diff, imports, lint, symbols, extract_code_blocks, retrieve_summary, search | 7 | Write-focused, minimal read tools |
| **test_engineer** | test_runner, diff, symbols, extract_code_blocks, retrieve_summary, imports, complexity_hotspots, pkg_audit, search | 9 | Testing and verification |
| **explorer** | complexity_hotspots, detect_domains, extract_code_blocks, gitingest, imports, retrieve_summary, schema_drift, symbols, todo_extract, search, batch_symbols | 11 | Discovery and analysis |
| **sme** | complexity_hotspots, detect_domains, extract_code_blocks, imports, retrieve_summary, schema_drift, symbols | 7 | Domain expertise research |
| **critic** | complexity_hotspots, detect_domains, imports, retrieve_summary, symbols | 5 | Plan review, minimal toolset |
| **docs** | detect_domains, doc_extract, doc_scan, extract_code_blocks, gitingest, imports, retrieve_summary, schema_drift, symbols, todo_extract | 10 | Documentation synthesis and discovery |
| **designer** | extract_code_blocks, retrieve_summary, symbols | 3 | UI-focused, minimal toolset |

### Configuration

Tool filtering is enabled by default. Customize it in your config:

```json
{
  "tool_filter": {
    "enabled": true,
    "overrides": {
      "coder": ["diff", "imports", "lint", "symbols", "test_runner"],
      "reviewer": ["diff", "secretscan", "sast_scan", "symbols"]
    }
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable tool filtering globally |
| `overrides` | Record<string, string[]> | `{}` | Per-agent tool whitelist. Empty array denies all tools. |

### Troubleshooting: Agent Missing a Tool

If an agent reports it doesn't have access to a tool it needs:

1. Check if the tool is in the agent's default allocation (see table above)
2. Add a custom override in your config:

```json
{
  "tool_filter": {
    "overrides": {
      "coder": ["diff", "imports", "lint", "symbols", "extract_code_blocks", "retrieve_summary", "test_runner"]
    }
  }
}
```

3. To completely disable filtering for all agents:

```json
{
  "tool_filter": {
    "enabled": false
  }
}
```

### Available Tools Reference

The following tools can be assigned to agents via overrides:

| Tool | Purpose |
|------|---------|
| `batch_symbols` | Extract exported symbols from multiple files in a single call; per-file error isolation; 75–98% call reduction vs sequential (v6.45); registered for architect, explorer, reviewer |
| `checkpoint` | Save/restore git checkpoints |
| `check_gate_status` | Read-only query of task gate status |
| `co_change_analyzer` | Scan git history for files that co-change frequently; generates dark matter architecture knowledge entries during DISCOVER mode (v6.41); architect-only |
| `complexity_hotspots` | Identify high-risk code areas |
| `declare_scope` | Pre-declare the file scope for the next coder delegation (architect-only); violations trigger warnings |
| `detect_domains` | Detect SME domains from text |
| `diff` | Analyze git diffs and changes |
| `doc_extract` | Extract actionable constraints from project documentation relevant to current task (Jaccard bigram scoring + dedup) |
| `doc_scan` | Scan project documentation and build index manifest at `.swarm/doc-manifest.json` (mtime-based caching) |
| `evidence_check` | Verify task evidence |
| `extract_code_blocks` | Extract code from markdown |
| `gitingest` | Ingest external repositories |
| `imports` | Analyze import relationships |
| `lint` | Run project linters |
| `phase_complete` | Enforces phase completion, verifies required agents, logs events, resets state; appends to `events.jsonl` with file locking |
| `pkg_audit` | Security audit of dependencies |
| `pre_check_batch` | Parallel pre-checks (lint, secrets, SAST, quality) |
| `retrieve_summary` | Retrieve summarized tool outputs |
| `save_plan` | Persist plan to `.swarm/plan.json`, `plan.md`, and ledger; also writes `SWARM_PLAN.md` / `SWARM_PLAN.json` checkpoint artifacts; requires explicit `working_directory` parameter |
| `schema_drift` | Detect OpenAPI/schema drift |
| `search` | Workspace-scoped ripgrep-style structured text search; literal and regex modes, glob filtering, result limits (v6.45); registered for architect, coder, reviewer, explorer, test_engineer |
| `secretscan` | Scan for secrets in code |
| `suggest_patch` | Generate contextual diff hunks without modifying files; read-only patch suggestions for reviewer→coder handoff (v6.45); registered for reviewer and architect |
| `symbols` | Extract exported symbols |
| `test_runner` | Run project tests |
| `update_task_status` | Mark plan tasks as pending/in_progress/completed/blocked; track phase progress; acquires lock on `plan.json` before writing |
| `todo_extract` | Extract TODO/FIXME comments |
| `write_retro` | Document phase retrospectives via the phase_complete workflow; capture lessons learned |
| `write_drift_evidence` | Write drift verification evidence after critic_drift_verifier completes; architect calls this after receiving the verifier’s verdict — the critic does not write files directly |

---

<details>
<summary><strong>Recent Changes (v6.12 – v6.31+)</strong></summary>

> For the complete version history, see [CHANGELOG.md](CHANGELOG.md) or [docs/releases/](docs/releases/).

### v6.47.0 — `/swarm close` Full Session Close-Out

- **`/swarm close` expanded**: Now performs complete close-out: resets `context.md`, deletes stale `config-backup-*.json` files, supports plan-free sessions (PR reviews, investigations), and accepts `--prune-branches` to delete local branches whose remote tracking ref is `gone` (merged/deleted upstream).
- **Lesson injection**: If `.swarm/close-lessons.md` exists when `/swarm close` runs, the architect’s explicit lessons are curated into the knowledge base before the file is deleted.

### v6.45.0 — New Search, Patch, and Batch Tools

- **`search` tool**: Workspace-scoped ripgrep-style structured search with literal/regex modes and glob filtering. Registered for architect, coder, reviewer, explorer, test_engineer.
- **`suggest_patch` tool**: Reviewer-safe context-anchored patch suggestion. Generates diff hunks without writing files. Registered for reviewer and architect.
- **`batch_symbols` tool**: Batched symbol extraction from multiple files in one call; per-file error isolation; 75–98% call reduction vs sequential single-file calls. Registered for architect, explorer, reviewer.
- **Step 5l-ter**: Test drift detection step added to the EXECUTE pipeline. Fires conditionally when changes involve command behaviour, parsing/routing logic, user-visible output, public contracts, assertion-heavy areas, or helper lifecycle changes.

### v6.44.0 — Durable Plan Ledger

- **`plan-ledger.jsonl`**: Append-only JSONL ledger is now the authoritative source of truth for plan state. `plan.json` and `plan.md` are projections derived from the ledger. `loadPlan()` auto-rebuilds projections from the ledger on hash mismatch.
- **Checkpoint artifacts**: `writeCheckpoint()` writes `SWARM_PLAN.md` and `SWARM_PLAN.json` at the project root on every `save_plan`, `phase_complete`, and `/swarm close`. Use `SWARM_PLAN.json` to restore after data loss.
- **Auto-generated tool lists**: Architect prompt `YOUR TOOLS` and `Available Tools` sections are now generated from `AGENT_TOOL_MAP.architect` — no more hand-maintained lists that drift.
- See [docs/plan-durability.md](docs/plan-durability.md) for migration notes.

### v6.42.0 — Curator LLM Delegation Wired

- **Curator now performs real LLM analysis**: Previously the LLM delegation was scaffolded but never connected — every call fell through to data-only mode. All three call sites now invoke the Explorer agent with curator-specific system prompts.
- **`curator.enabled` now defaults to `true`**: The curator falls back gracefully to data-only mode when no SDK client is available (e.g., in unit tests). If you relied on the previous `false` default, set `"curator": { "enabled": false }` explicitly.

### v6.41.0 — Dark Matter Detection + `/swarm close` + Drift Evidence Tool

- **Dark matter detection pipeline**: During DISCOVER mode, automatically scans git history for files that frequently co-change. Results are stored as `architecture` knowledge entries and the architect is guided to consider co-change partners when declaring scope. Silently skips repos with fewer than 20 commits or no git history.
- **`/swarm close` command**: New idempotent close command. Writes retrospectives for in-progress phases, curates session lessons via the knowledge pipeline, archives evidence, marks phases/tasks as `closed`, writes `.swarm/close-summary.md`, and cleans state.
- **`write_drift_evidence` tool**: New architect tool for persisting drift verification evidence after critic_drift_verifier delegation
  - Accepts phase number, verdict (APPROVED/NEEDS_REVISION), and summary
  - Normalizes verdict automatically (APPROVED → approved, NEEDS_REVISION → rejected)
  - Writes gate-contract formatted evidence to `.swarm/evidence/{phase}/drift-verifier.json`

### v6.31.0 — process.cwd() Cleanup + Watchdog + Knowledge Tools

- **process.cwd() cleanup**: All 14 source files now use plugin-injected `directory` parameter. Five tools migrated to `createSwarmTool` wrapper.
- **`curator_analyze` tool**: Architect can now explicitly trigger phase analysis and apply curator recommendations.
- **Watchdog system**: `scope_guard` (blocks out-of-scope writes), `delegation_ledger` (tracks per-session tool calls), and loop-detector escalation.
- **Self-correcting workflow**: `self_review` advisory hook after task transitions; `checkStaleImports` heuristic for unused import detection.
- **Knowledge memory tools**: `knowledge_recall`, `knowledge_add`, `knowledge_remove` — any agent can now directly access the persistent knowledge base.

### v6.30.1 — Bug Fixes

- **Package manager detection**: `incremental_verify` now detects bun/npm/pnpm/yarn from lockfiles instead of always using `bun`.
- **spawnAsync OOM fix**: 512KB output cap prevents infinite-output commands from OOM-crashing.
- **Windows spawn fix**: `npx.cmd`, `npm.cmd`, `pnpm.cmd`, `yarn.cmd` resolved correctly on Windows.
- **Curator config fix**: `applyCuratorKnowledgeUpdates` now receives fully-populated `KnowledgeConfig`.
- **Rehydration race guard**: Concurrent `loadSnapshot` calls no longer silently drop workflow state.

### v6.29.4 — Cross-Task Regression Sweep

- **Regression sweep**: Architect dispatches `scope:"graph"` test runs after each task to catch cross-task regressions (found 15 in RAGAPPv2 retrospective).
- **Curator data pipeline**: Curator outputs now visible to the architect via advisory injection.
- **Full-suite opt-in**: Explicit flag unlocks full `bun test` execution when needed.

### v6.29.3 — Curator Visibility + Documentation Refresh

- **Curator status in diagnose**: `/swarm diagnose` now reports whether Curator is enabled/disabled and validates `curator-summary.json`.
- **README and config docs refreshed**: Updated `.swarm/` directory tree, Curator configuration options, and drift report artifacts.

### v6.29.2 — Multi-Language Incremental Verify + Slop-Detector Hardening

- **Multi-language incremental_verify**: Post-coder typecheck supports TypeScript/JavaScript, Go, Rust, and C#.
- **Slop-detector hardening**: Multi-language heuristics for placeholder code detection across Go/Rust/C#/Python.
- **CODEBASE REALITY CHECK**: Explorer verifies referenced items before planning (NOT STARTED / PARTIALLY DONE / ALREADY COMPLETE / ASSUMPTION INCORRECT).
- **Evidence schema fix**: Evidence bundles now correctly validate against schema.

### v6.29.1 — Advisory Hook Message Injection

- **Advisory hook message injection**: Enhanced message formatting for self-coding detection, partial gate tracking, batch detection, and scope violation warnings.

### v6.26 through v6.28 — Session Durability + Turbo Mode

- **Turbo Mode**: Accelerated task delegation for faster pipeline execution.
- **Session durability**: Directory-based evidence writes, task ID recovery from `plan.json` for cold/resumed sessions.
- **Gate recovery fix** (v6.26.1): `update_task_status(completed)` no longer blocks pure-verification tasks without a prior coder delegation.

### v6.22 — Curator Background Analysis + Session State Persistence

This release adds the optional Curator system for phase-level intelligence and fixes session snapshot persistence for task workflow states.

- **Curator system**: Background analysis system (`curator.enabled = false` by default in v6.22; **changed to `true` in v6.42**). After each phase, collects events, checks compliance, and writes drift reports to `.swarm/drift-report-phase-N.json`. Three integration points: init on first phase, phase analysis after each phase, and drift injection into architect context at phase start.
- **Drift reports**: `runCriticDriftCheck` compares planned vs. actual decisions and writes structured drift reports with alignment scores (`ALIGNED` / `MINOR_DRIFT` / `MAJOR_DRIFT` / `OFF_SPEC`). Latest drift summary is prepended to the architect's knowledge context each phase.
- **Issue #81 fix — taskWorkflowStates persistence**: Session snapshots now correctly serialize and restore the per-task state machine. Invalid state values are filtered to `idle` on deserialization. `reconcileTaskStatesFromPlan` seeds task states from `plan.json` on snapshot load (completed → `tests_run`, in-progress → `coder_delegated`).

See the [Curator section](#curator) above for configuration details and the [v6.22 release notes](docs/releases/v6.22.0.md) for the full change list.

### v6.21 — Gate Enforcement Hardening

This release replaces soft advisory warnings with hard runtime blocks and adds structural compliance tooling for all model tiers.

#### Phase 1 — P0 Bug Fixes: Hard Blocks Replace Soft Warnings

- **`qaSkipCount` reset fixed**: The skip-detection counter in `delegation-gate.ts` now resets only when **both** reviewer **and** test_engineer have been seen since the last coder entry — not when either one runs alone.
- **`update_task_status` reviewer gate check**: Accepting `status='completed'` now validates that the reviewer gate is present in the session's `gateLog` for the given task. Missing reviewer returns a structured error naming the absent gate.
- **Architect self-coding hard block**: `architectWriteCount ≥ 3` now throws an `Error` with message `SELF_CODING_BLOCK` (previously a warning only). Counts 1–2 remain advisory warnings. Counter resets on coder delegation.

#### Phase 2 — Per-Task State Machine

Every task now has a tracked workflow state in the session:

| State | Meaning |
|-------|---------|
| `idle` | Task not started |
| `coder_delegated` | Coder has received the delegation |
| `pre_check_passed` | Automated gates (lint, SAST, secrets, quality) passed |
| `reviewer_run` | Reviewer agent has returned a verdict |
| `tests_run` | Test engineer has completed (verification + adversarial) |
| `complete` | `update_task_status` accepted the `completed` transition |

Transitions are forward-only. `advanceTaskState()` throws `INVALID_TASK_STATE_TRANSITION` if an illegal jump is attempted. `getTaskState()` returns `'idle'` for unknown tasks.

`session.lastGateOutcome` records the most recent gate result: `{ gate, taskId, passed, timestamp }`.

#### Phase 3 — State Machine Integration

- `update_task_status` now uses the state machine (not a raw `gateLog.has()` check): `status='completed'` is rejected unless the task is in `'tests_run'` or `'complete'` state.
- `delegation-gate.ts` protocol-violation check additionally verifies that the prior task's state has advanced past `'coder_delegated'` before allowing a new coder delegation.

#### Phase 4 — Context Engineering

- **Progressive task disclosure**: When >5 tasks are visible in the last user message, `delegation-gate.ts` trims to the current task ± a context window. A `[Task window: showing N of M tasks]` comment marks the trim point.
- **Deliberation preamble**: Each architect turn is prefixed with `[Last gate: {tool} {result} for task {taskId}]` sourced from `session.lastGateOutcome`, prompting the architect to identify the single next step.
- **Low-capability model detection**: `LOW_CAPABILITY_MODELS` constant (matches substrings `mini`, `nano`, `small`, `free`) and `isLowCapabilityModel(modelId)` helper added to `constants.ts`.
- **Behavioral guidance markers**: Three `<!-- BEHAVIORAL_GUIDANCE_START --> … <!-- BEHAVIORAL_GUIDANCE_END -->` pairs wrap the BATCHING DETECTION, ARCHITECT CODING BOUNDARIES, and QA gate behavioral sections in the architect prompt.
- **Tier-based prompt trimming**: When `session.activeModel` matches `isLowCapabilityModel()`, the behavioral guidance blocks are stripped from the architect prompt and replaced with `[Enforcement: programmatic gates active]`. Programmatic enforcement substitutes for verbose prompt instructions on smaller models.

#### Phase 5 — Structural Scope Declaration (`declare_scope`)

New architect-only tool and supporting runtime enforcement:

- **`declare_scope` tool**: Pre-declares which files the coder is allowed to modify for a given task. Input: `{ taskId, files, whitelist?, working_directory? }`. Validates task ID format, plan membership, and non-`complete` state. On success, sets `session.declaredCoderScope`. Architect-only.
- **Automatic scope from FILE: directives**: When a coder delegation is detected, `delegation-gate.ts` extracts FILE: directive values and stores them as `session.declaredCoderScope` automatically — no explicit `declare_scope` call required.
- **Scope containment tracking**: `guardrails.ts` appends every file the architect writes to `session.modifiedFilesThisCoderTask`. On coder delegation start, the list resets to `[]`.
- **Violation detection**: After a coder task completes, `toolAfter` compares `modifiedFilesThisCoderTask` against `declaredCoderScope`. If >2 files are outside the declared scope, `session.lastScopeViolation` is set. The next architect message receives a scope violation warning.
- **`isInDeclaredScope(filePath, scopeEntries)`**: Module-level helper using `path.resolve()` + `path.relative()` for proper directory containment (not string matching).

### v6.13.2 — Pipeline Enforcement

This release adds enforcement-layer tooling and self-healing guardrails:

- **`phase_complete` tool**: Verifies all required agents were dispatched before a phase closes; emits events to `.swarm/events.jsonl`; configurable `enforce`/`warn` policy
- **Summarization loop fix**: `exempt_tools` config prevents `retrieve_summary` and `task` outputs from being re-summarized (fixes Issue #8)
- **Same-model adversarial detection**: Warns when coder and reviewer share the same model; `warn`/`gate`/`ignore` policy
- **Architect test guardrail (HF-1b)**: Prevents architect from running full `bun test` suite — must target specific files one at a time
- **Docs**: `docs/swarm-briefing.md` (LLM pipeline briefing), Task Field Reference in `docs/planning.md`

### v6.13.1 — Consolidation & Defaults Fix

- **`consolidateSystemMessages`**: Merges multiple system messages into one at index 0
- **Test isolation helpers**: `createIsolatedTestEnv` and `assertSafeForWrite`
- **Coder self-verify guardrail (HF-1)**: Coder and test_engineer agents blocked from running build/test/lint
- **`/swarm` template fix**: `{{arguments}}` → `$ARGUMENTS`
- **DEFAULT_MODELS update**: `claude-sonnet-4-5` → `claude-sonnet-4-20250514`, `gemini-2.0-flash` → `gemini-2.5-flash`

### v6.13.0 — Context Efficiency

This release focuses on reducing context usage and improving mode-conditional behavior:

- **Role-Scoped Tool Filtering**: Agent tools filtered via AGENT_TOOL_MAP
- **Plan Cursor**: Compressed plan summary under 1,500 tokens
- **Mode Detection**: DISCOVER/PLAN/EXECUTE/PHASE-WRAP/UNKNOWN modes
- **Tool Output Truncation**: diff/symbols outputs truncated with footer
- **ZodError Fixes**: Optional current_phase, 'completed' status support

### v6.12.0 — Anti-Process-Violation Hardening

This release adds runtime detection hooks to catch and warn about architect workflow violations:

- **Self-coding detection**: Warns when the architect writes code directly instead of delegating
- **Partial gate tracking**: Detects when QA gates are skipped
- **Self-fix detection**: Warns when an agent fixes its own gate failure (should delegate to fresh agent)
- **Batch detection**: Catches "implement X and add Y" batching in task requests
- **Zero-delegation detection**: Warns when tasks complete without any coder delegation; supports parsing delegation envelopes from JSON or KEY: VALUE text format for validation.

These hooks are advisory (warnings only) and help maintain workflow discipline during long sessions.

### v6.19 — Critic Sounding Board + Complexity-Scaled Review

- **Critic sounding board**: Before escalating to the user, the Architect consults the critic in SOUNDING_BOARD mode. Returns: UNNECESSARY, REPHRASE, APPROVED, or RESOLVE.
- **Escalation discipline**: Three-tier hierarchy — self-resolve → critic consult → user escalation (requires critic APPROVED).
- **Retry circuit breaker**: After 3 coder rejections, the Architect simplifies the approach instead of adding more logic.
- **Intent reconstruction**: Reviewer reconstructs developer intent from task specs and diffs before evaluating changes.
- **Complexity-scaled review**: TRIVIAL → Tier 1 only; MODERATE → Tiers 1–2; COMPLEX → all three tiers.
- **`meta.summary` convention**: Agents include one-line summaries in state events for downstream agent consumption.

</details>

---

## Testing

6,000+ tests. Unit, integration, adversarial, and smoke. Zero additional test dependencies.

```bash
bun test
```

---

## Design Principles

1. **Plan before code.** The critic approves the plan before a single line is written.
2. **One task at a time.** The coder gets one task and full context. Nothing else.
3. **Review everything immediately.** Correctness, security, tests, adversarial tests. Every task.
4. **Different models catch different bugs.** The coder's blind spot is the reviewer's strength.
5. **Save everything to disk.** Any session, any model, any day, pick up where you left off.
6. **Document failures.** Rejections and retries are recorded. After 5 failures, it escalates to you.

---

## Supported Languages

OpenCode Swarm v6.46+ ships with language profiles for 12 languages across three quality tiers. All tools use graceful degradation — if a binary is not on PATH, the tool skips with a soft warning rather than a hard failure.

| Language | Tier | Syntax | Build | Test | Lint | Audit | SAST |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| TypeScript / JavaScript | 1 | ✅ | ✅ | ✅ | ✅ Biome / ESLint | ✅ npm audit | ✅ Semgrep |
| Python | 1 | ✅ | ✅ | ✅ pytest | ✅ ruff | ✅ pip-audit | ✅ Semgrep |
| Rust | 1 | ✅ | ✅ | ✅ cargo test | ✅ clippy | ✅ cargo audit | ✅ Semgrep |
| Go | 1 | ✅ | ✅ | ✅ go test | ✅ golangci-lint | ✅ govulncheck | ✅ Semgrep |
| Java | 2 | ✅ | ✅ Gradle / Maven | ✅ JUnit | ✅ Checkstyle | — | ✅ Semgrep |
| Kotlin | 2 | ✅ | ✅ Gradle | ✅ JUnit | ✅ ktlint | — | 🔶 Semgrep beta |
| C# / .NET | 2 | ✅ | ✅ dotnet build | ✅ dotnet test | ✅ dotnet format | ✅ dotnet list | ✅ Semgrep |
| C / C++ | 2 | ✅ | ✅ cmake / make | ✅ ctest | ✅ cppcheck | — | 🔶 Semgrep exp. |
| Swift | 2 | ✅ | ✅ swift build | ✅ swift test | ✅ swiftlint | — | 🔶 Semgrep exp. |
| Dart / Flutter | 3 | ✅ | ✅ dart pub | ✅ dart test | ✅ dart analyze | ✅ dart pub outdated | — |
| Ruby | 3 | ✅ | — | ✅ RSpec / minitest | ✅ RuboCop | ✅ bundle-audit | 🔶 Semgrep exp. |
| PHP / Laravel | 3 | ✅ | ✅ Composer install | ✅ PHPUnit / Pest / artisan test | ✅ Pint / PHP-CS-Fixer | ✅ composer audit | ✅ 10+ native rules |

> **PHP + Laravel baseline**: PHP v6.49+ ships with deterministic Laravel project detection (multi-signal: `artisan` file, `laravel/framework` dependency, `config/app.php`). When detected, commands are automatically overridden to `php artisan test`, Pint formatting, and PHPStan static analysis. Laravel-specific SAST rules cover SQL injection via raw queries, mass-assignment vulnerabilities, and destructive migrations without rollback. `.blade.php` files are included in all scanning pipelines.

**Tier definitions:**
- **Tier 1** — Full pipeline: all tools integrated and tested end-to-end.
- **Tier 2** — Strong coverage: most tools integrated; some optional (audit, SAST).
- **Tier 3** — Basic coverage: core tools integrated; advanced tooling limited.

> All binaries are optional. Missing tools produce a soft warning and skip — the pipeline never hard-fails on a missing linter or auditor.

---

## Curator

The Curator is a background analysis system that runs after each phase. It is **enabled by default** as of v6.42 (`curator.enabled = true`) and never blocks execution — all Curator operations are wrapped in try/catch. It falls back gracefully to data-only mode when no SDK client is available.

Since v6.42, the Curator performs real LLM analysis by delegating to the Explorer agent with curator-specific prompts. Before v6.42, the LLM delegation was scaffolded but never wired.

To disable, set `"curator": { "enabled": false }` in your config. When enabled, it writes `.swarm/curator-summary.json`, `.swarm/curator-briefing.md`, and `.swarm/drift-report-phase-N.json` files.

### What the Curator Does

- **Init** (`phase-monitor.ts`): On the first phase, initializes a curator summary file at `.swarm/curator-summary.json` and persists the init briefing to `.swarm/curator-briefing.md`.
- **Phase analysis** (`phase-complete.ts`): After each phase completes, collects phase events, checks compliance, and optionally invokes the curator explorer to summarize findings.
- **Compliance surfacing** (`phase-complete.ts`): Compliance observations are surfaced in the return value's warnings array (unless `suppress_warnings` is true).
- **Knowledge updates** (`phase-complete.ts`): Merges curator findings into the knowledge base up to the configured `max_summary_tokens` cap.
- **Briefing injection** (`knowledge-injector.ts`): The curator-briefing.md content is injected into the architect's context at session start.
- **Drift injection** (`knowledge-injector.ts`): Prepends the latest drift report summary to the architect's knowledge context at phase start, up to `drift_inject_max_chars` characters. Drift reports now inject even when no knowledge entries exist.

### Configuration

Add a `curator` block to `.opencode/opencode-swarm.json`:

```json
{
  "curator": {
    "enabled": true,
    "init_enabled": true,
    "phase_enabled": true,
    "max_summary_tokens": 2000,
    "min_knowledge_confidence": 0.7,
    "compliance_report": true,
    "suppress_warnings": true,
    "drift_inject_max_chars": 500
  }
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | `true` | Master switch. Set to `false` to disable the Curator pipeline. |
| `init_enabled` | `true` | Initialize curator summary on first phase (requires `enabled: true`). |
| `phase_enabled` | `true` | Run phase analysis and knowledge updates after each phase. |
| `max_summary_tokens` | `2000` | Maximum token budget for curator knowledge summaries. |
| `min_knowledge_confidence` | `0.7` | Minimum confidence threshold for curator knowledge entries. |
| `compliance_report` | `true` | Include phase compliance check results in curator summary. |
| `suppress_warnings` | `true` | Suppress non-critical curator warnings from the architect context. |
| `drift_inject_max_chars` | `500` | Maximum characters of drift report text injected into each phase context. |

### Drift Reports

Drift reports are written to `.swarm/drift-report-phase-N.json` after each phase. The `knowledge-injector.ts` hook reads the latest report and prepends a summary to the architect's knowledge context for the next phase, helping the architect stay aware of plan vs. reality divergence.

### Issue #81 Hotfix — taskWorkflowStates Persistence

v6.22 includes a fix for session snapshot persistence of per-task workflow states:

- **`SerializedAgentSession.taskWorkflowStates`**: Task workflow states are now serialized as `Record<string, string>` in session snapshots and deserialized back to a `Map` on load. Invalid state values are filtered out and default to `idle`.
- **`reconcileTaskStatesFromPlan`**: On snapshot load, task states are reconciled against the current plan — tasks marked `completed` in the plan are seeded to `tests_run` state, and `in_progress` tasks are seeded to `coder_delegated` if currently `idle`. This is best-effort and never throws.

See [CHANGELOG.md](CHANGELOG.md) for shipped features.

---

## FAQ

### Do I need to select a Swarm architect?

**Yes.** You must explicitly choose a Swarm architect agent in the OpenCode GUI before starting your session. The architect name shown in OpenCode is config-driven — you can define multiple architects with different model assignments in your configuration.

If you use the default OpenCode `Build` / `Plan` options without selecting a Swarm architect, the plugin is bypassed entirely.

### Why did Swarm start coding immediately on my second run?
Because Swarm resumes from `.swarm/` state when it exists. Check `/swarm status` to see the current mode.

### How do I know which agents and models are active?
Run `/swarm agents` and `/swarm config`.

### How do I start over?
Run `/swarm reset --confirm`.

---

## Documentation

- [Documentation Index](docs/index.md)
- [Getting Started](docs/getting-started.md)
- [Architecture Deep Dive](docs/architecture.md)
- [Design Rationale](docs/design-rationale.md)
- [Plan Durability & Ledger](docs/plan-durability.md)
- [Installation Guide](docs/installation.md)
- [Linux + Docker Desktop Install Guide](docs/installation-linux-docker.md)
- [LLM Operator Installation Guide](docs/installation-llm-operator.md)
- [Pre-Swarm Planning Guide](docs/planning.md)
- [Swarm Briefing for LLMs](docs/swarm-briefing.md)
- [Configuration](docs/configuration.md)

---

## License

MIT

---

**Stop hoping your agents figure it out. Start shipping code that actually works.**

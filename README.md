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
- 🔒 **Gated pipeline** — code never ships without reviewer + test engineer approval
- 🔄 **Phase completion gates** — completion-verify and drift verifier gates enforced before phase completion
- 🔁 **Resumable sessions** — all state saved to `.swarm/`; pick up any project any day
- 🌐 **20 languages** — TypeScript, Python, Go, Rust, Java, Kotlin, C/C++, C#, Ruby, Swift, Dart, PHP, JavaScript, CSS, Bash, PowerShell, INI, Regex
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
* architect runs regression sweep
* failures loop back with structured feedback

7. After each phase, docs and retrospectives are updated.

All project state lives in `.swarm/` — plans, evidence, context, knowledge, and telemetry. Resumable by design. If `.swarm/` already exists, the architect goes straight into **RESUME** → **EXECUTE** instead of repeating discovery.

---

## Execution Modes

Swarm has two independent mode systems:

**Session modes** — toggle per session with a slash command:

| Mode | Safety | Speed | When to Use |
|------|--------|-------|------------|
| **Balanced** (default) | High | Medium | Everyday development |
| **Turbo** | Medium | Fast | Rapid iteration; skips Stage B gates for non-Tier-3 files |
| **Full-Auto** | Depends on critic | Fast | Unattended multi-interaction runs |

**Project mode** — persistent via `execution_mode` config key:

| Value | Effect |
|-------|--------|
| `strict` | Maximum safety — adds slop-detector and incremental-verify hooks |
| `balanced` (default) | Standard hooks |
| `fast` | Skips compaction service — for short sessions under context pressure |

Switch session modes with `/swarm turbo [on|off]` or `/swarm full-auto [on|off]`. Set project mode in config. The two systems compose independently — see [docs/modes.md](docs/modes.md).

---

## Quick Start

**→ For a complete first-run walkthrough, see [Getting Started](docs/getting-started.md).**

The 15-minute guide covers:
- Installation (`bunx opencode-swarm install`)
- Selecting the architect in OpenCode
- Running your first task
- Troubleshooting common issues

---

## Commands

All 41 subcommands at a glance:

```bash
/swarm status              # Current phase and task
/swarm plan [N]            # Full plan or filtered by phase
/swarm agents              # Registered agents and models
/swarm diagnose            # Health check
/swarm evidence [task]     # Test and review results
/swarm reset --confirm     # Clear swarm state
```

See [docs/commands.md](docs/commands.md) for the full reference (41 commands).

---

## The Agents

Swarm has 11 specialized agents. You don't manually switch between them — the architect coordinates automatically.

| Agent | Role |
|---|---|
| **architect** | Orchestrates workflow, writes plans, enforces gates |
| **coder** | Implements one task at a time |
| **reviewer** | Checks correctness and security |
| **test_engineer** | Writes and runs tests |
| **critic** | Reviews plans and challenges findings |
| **explorer** | Scans codebase and gathers context |
| **sme** | Provides domain expertise guidance |
| **docs** | Updates documentation to match implementation |
| **designer** | Generates UI scaffolds and design tokens |
| **critic_sounding_board** | Pre-escalation pushback to the architect |
| **critic_drift_verifier** | Verifies implementation matches plan |

Run `/swarm status` and `/swarm agents` to see what's active.

---

## How It Compares

| Feature | Swarm | oh-my-opencode | get-shit-done |
|---|:-:|:-:|:-:|
| Multiple specialized agents | ✅ 11 agents | ❌ | ❌ |
| Plan reviewed before coding | ✅ | ❌ | ❌ |
| Every task reviewed + tested | ✅ | ❌ | ❌ |
| Different model for review vs. code | ✅ | ❌ | ❌ |
| Resumable sessions | ✅ | ❌ | ❌ |
| Built-in security scanning | ✅ | ❌ | ❌ |
| Learns from mistakes | ✅ | ❌ | ❌ |

---

## LLM Provider Guide

Swarm works with any provider supported by OpenCode.

### Free Tier (OpenCode Zen)

No API key required. Excellent starting point:

```json
{
  "agents": {
    "coder": { "model": "opencode/minimax-m2.5-free" },
    "reviewer": { "model": "opencode/big-pickle" },
    "explorer": { "model": "opencode/trinity-large-preview-free" }
  }
}
```

### Paid Providers

For production, mix providers by role:

| Agent | Recommended | Why |
|---|---|---|
| architect | OpenCode UI selection | Needs strongest reasoning |
| coder | minimax-coding-plan/MiniMax-M2.5 | Fast, accurate code generation |
| reviewer | zai-coding-plan/glm-5 | Different training from coder |
| test_engineer | minimax-coding-plan/MiniMax-M2.5 | Same strengths as coder |
| explorer | google/gemini-2.5-flash | Fast read-heavy analysis |
| sme | kimi-for-coding/k2p5 | Strong domain expertise |

### Provider Formats

| Provider | Format | Example |
|---|---|---|
| OpenCode Zen | `opencode/<model>` | `opencode/trinity-large-preview-free` |
| Anthropic | `anthropic/<model>` | `anthropic/claude-sonnet-4-20250514` |
| Google | `google/<model>` | `google/gemini-2.5-flash` |
| Z.ai | `zai-coding-plan/<model>` | `zai-coding-plan/glm-5` |
| MiniMax | `minimax-coding-plan/<model>` | `minimax-coding-plan/MiniMax-M2.5` |
| Kimi | `kimi-for-coding/<model>` | `kimi-for-coding/k2p5` |

### Model Fallback

Automatic fallback to a secondary model on transient errors:

```json
{
  "agents": {
    "coder": {
      "model": "anthropic/claude-sonnet-4-20250514",
      "fallback_models": ["opencode/gpt-5-nano"]
    }
  }
}
```

See [docs/configuration.md](docs/configuration.md) for full configuration reference.

---

<details>
<summary><strong>Advanced Topics (Technical Detail)</strong></summary>

### Process Remediation Model (PRM)

Swarm monitors agent trajectories and injects course-correction guidance before loops form. Detects five failure patterns:

1. **Repetition Loop** — Same agent performs the same action repeatedly
2. **Ping-Pong** — Agents hand off back and forth without progress
3. **Expansion Drift** — Plan scope grows beyond original task
4. **Stuck-on-Test** — Coder and tests fail in a loop
5. **Context Thrashing** — Agent requests increasingly large file sets

When detected, escalation levels trigger:
- Level 1: Advisory guidance injected
- Level 2: Architect alert sent
- Level 3: Hard stop directive

Configure via:

```json
{
  "prm": {
    "enabled": true,
    "pattern_thresholds": {
      "repetition_loop": 2,
      "ping_pong": 4,
      "expansion_drift": 3,
      "stuck_on_test": 3,
      "context_thrash": 5
    }
  }
}
```

> **Note:** Some configuration fields (`max_trajectory_lines`, `escalation_enabled`) are defined in schema but not yet enforced at runtime.

### Persistent Memory

**`.swarm/plan-ledger.jsonl`** — authoritative source of truth (v6.44 durability model)

**`.swarm/context.md`** — technical decisions and cached SME guidance

**`.swarm/evidence/`** — review/test results per task

**`.swarm/telemetry.jsonl`** — session observability events (fire-and-forget, never blocks execution)

**`.swarm/curator-summary.json`** — phase-level intelligence and drift reports

### Guardrails & Circuit Breakers

Every agent runs inside a circuit breaker that prevents runaway behavior:

| Signal | Default Limit |
|--------|:---:|
| Tool calls | 200 |
| Duration | 30 min |
| Same tool repeated | 10x |
| Consecutive errors | 5 |

Limits reset per task. Per-agent overrides available in config.

### File Authority (Per-Agent Write Permissions)

Each agent can only write to specific paths:

- **architect** — Everything (except `.swarm/plan.md`, `.swarm/plan.json`)
- **coder** — `src/`, `tests/`, `docs/`, `scripts/`
- **reviewer** — `.swarm/evidence/`
- **test_engineer** — `tests/`, `.swarm/evidence/`
- **explorer, sme** — Read-only

Override via `authority.rules` in config.

### Quality Gates

Built-in tools verify every task before it ships:

- **syntax_check** — Tree-sitter validation (12 languages)
- **placeholder_scan** — Catches TODOs, stubs, incomplete code
- **sast_scan** — 63+ security rules, 9 languages (offline)
- **sbom_generate** — Dependency tracking (CycloneDX)
- **quality_budget** — Complexity, duplication, test ratio limits

All tools run locally. No Docker, no network calls.

### Context Budget Guard

Monitors how much context Swarm injects to prevent overflow:

- **Warning threshold (70%)** — Advisory when context reaches ~2800 tokens
- **Critical threshold (90%)** — Alert at ~3600 tokens with `/swarm handoff` recommendation
- **Non-nagging** — One-time alerts per session

Disable entirely with `context_budget.enabled: false`.

### File Locking for Concurrent Safety

Hard lock on `plan.json` (serialized writes), advisory lock on `events.jsonl` (append-only log). Stale locks auto-expire via `proper-lockfile`.

</details>

---

## Supported Languages

Full Tier-1 support: TypeScript, JavaScript, Python, Go, Rust  
Tier-2 support: Java, Kotlin, C#, C/C++, Swift  
Tier-3 support: Dart, Ruby, PHP/Laravel

All binaries optional. Missing tools produce soft warnings, never hard-fail.

---

## Testing

6,000+ tests. Unit, integration, adversarial, and smoke. Run with:

```bash
bun test
```

---

## Design Principles

1. **Plan before code.** Critic approves the plan before a single line is written.
2. **One task at a time.** Coder gets one task and full context. Nothing else.
3. **Review everything immediately.** Correctness, security, tests, adversarial tests. Every task.
4. **Different models catch different bugs.** Blind spots of the coder are the reviewer's strength.
5. **Save everything to disk.** Resume any project any day from `.swarm/` state.
6. **Document failures.** Rejections and retries recorded. After 5 failures, escalate to you.

---

## Documentation

- [Getting Started](docs/getting-started.md) — 15-minute first-run guide
- [Documentation Index](docs/index.md) — navigate all docs
- [Installation Guide](docs/installation.md) — comprehensive reference
- [Architecture Deep Dive](docs/architecture.md) — control model, pipeline, tools
- [Design Rationale](docs/design-rationale.md) — why every major decision
- [Commands Reference](docs/commands.md) — all 41 `/swarm` subcommands
- [Modes Guide](docs/modes.md) — session modes (Turbo, Full-Auto) and project modes (strict/balanced/fast)
- [Configuration](docs/configuration.md) — all config keys and examples
- [Planning Guide](docs/planning.md) — task format, phase structure, sizing

---

## License

MIT

---

**Stop hoping your agents figure it out. Start shipping code that actually works.**

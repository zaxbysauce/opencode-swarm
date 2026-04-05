# OpenCode Swarm Documentation

This index covers all documentation available for OpenCode Swarm.

## For new users

| Document | What it covers |
|----------|---------------|
| [Getting Started](getting-started.md) | First-run workflow, common questions, and how to restart |
| [Installation Guide](installation.md) | Install steps, model configuration, and multiple-swarm setup |
| [Installation: Linux + Docker](installation-linux-docker.md) | Step-by-step for native Linux, native Windows, and Windows via Docker Desktop |
| [Installation: LLM Operator](installation-llm-operator.md) | Machine-executable install and validation runbook for LLM-driven setup |

## For day-to-day use

| Document | What it covers |
|----------|---------------|
| [Configuration Reference](configuration.md) | Config file locations, minimal example, and all config keys |
| [Pre-Swarm Planning Guide](planning.md) | How to plan tasks before running the swarm, task field reference, multi-model planning, and the built-in spec pipeline |
| [Swarm Briefing for LLMs](swarm-briefing.md) | Pipeline steps, task format, state machine, and scope enforcement — written for an LLM acting as plan author |
| [PHP and Laravel Practical Guide](php-laravel.md) | PHP/Composer project detection, Laravel framework detection and command override, Pest/PHPUnit coexistence, Composer audit, and Blade/Eloquent SAST coverage |

## Architecture and design

| Document | What it covers |
|----------|---------------|
| [Architecture Deep Dive](architecture.md) | Control model, agent roles, full execution flow, and mode labels |
| [Design Rationale](design-rationale.md) | The "why" behind every major design decision from serial execution to quality gates |

## Release history

| Release | Highlights |
|---------|-----------|
| [v6.45.0](releases/v6.45.0.md) | Structured workspace search (search), reviewer-safe patch suggestions (suggest_patch), batched symbol extraction (batch_symbols), canonical tool-name normalization, architect-led test drift review |
| [v6.44.3](releases/v6.44.3.md) | Patch release |
| [v6.31.0](releases/v6.31.0.md) | process.cwd() cleanup, curator pipeline wiring, watchdog enforcement, knowledge memory tools |
| [v6.29.4](releases/v6.29.4.md) | Cross-task regression sweep, curator data pipeline visibility, opt-in full-suite testing |
| [v6.29.3](releases/v6.29.3.md) | Curator status in `/swarm diagnose`, documentation refresh |
| [v6.29.2](releases/v6.29.2.md) | Multi-language incremental verify, slop-detector hardening, codebase reality check |
| [v6.29.1](releases/v6.29.1.md) | Advisory hook message injection improvements |
| [v6.27.0](releases/v6.27.0.md) | TypeScript compilation fixes from v6.26.0 |
| [v6.26.1](releases/v6.26.1.md) | Gate recovery fix for pure-verification tasks |
| [v6.26.0](releases/v6.26.0.md) | Session durability, evidence task resolution, Turbo Mode |
| [v6.22.0](releases/v6.22.0.md) | Curator background analysis system, Issue #81 session state persistence fix |
| [v6.19.1](releases/v6.19.1.md) | Patch release |
| [v6.19.0](releases/v6.19.0.md) | Critic sounding board, adversarial hardening, escalation discipline, intent reconstruction |
| [v6.18.1](releases/v6.18.1.md) | Patch release |
| [v6.18.0](releases/v6.18.0.md) | Release notes |
| [v6.17.3](releases/v6.17.3.md) | Patch release |
| [v6.17.2](releases/v6.17.2.md) | Patch release |
| [v6.17.1](releases/v6.17.1.md) | Patch release |
| [v6.17.0](releases/v6.17.0.md) | Release notes |
| [v6.16.1](releases/v6.16.1.md) | Patch release |
| [v6.16.0](releases/v6.16.0.md) | Language-aware prompt injection, multi-language support |
| [v6.15.0](releases/v6.15.0.md) | Release notes |

For the full version-by-version changelog, see [CHANGELOG.md](../CHANGELOG.md).

## Internal / development docs

These documents are for contributors working on the swarm codebase itself.

| Document | What it covers |
|----------|---------------|
| [dev/phase0-execution-plan.md](dev/phase0-execution-plan.md) | Stage 0 baseline recon and design freeze for v6.9.0 quality tooling |
| [dev/phase0-tool-architecture.md](dev/phase0-tool-architecture.md) | Tool contract, evidence schema, and CI-gate intake for v6.9.0 |
| [dev/v6-9-roadmap.md](dev/v6-9-roadmap.md) | Stages 1-8 implementation plan for v6.9.0 quality/anti-slop tooling |
| [dev/v6.9.0-release-checklist.md](dev/v6.9.0-release-checklist.md) | Pre-release verification checklist for v6.9.0 |
| [dev/sme-engagement-plan.md](dev/sme-engagement-plan.md) | SME consultation schedule for v6.9.0 implementation |
| [dev/stage1-plan.md](dev/stage1-plan.md) through [dev/stage8-plan.md](dev/stage8-plan.md) | Per-stage implementation plans for v6.9.0 |

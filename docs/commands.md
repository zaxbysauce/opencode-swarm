# Commands Reference

All `/swarm` subcommands available in OpenCode Swarm v6.81.0. The authoritative source is `src/commands/registry.ts`.

Commands are grouped by function. Compound commands (e.g., `/swarm config doctor`) resolve the two-word form first, then fall back to the first token.

---

## Status and Health

### `/swarm status`

Show current swarm state: active phase, task count, and registered agents.

```text
Phase: 2 [IN PROGRESS]
Tasks: 3/5 complete
Agents: 11 registered
```

### `/swarm diagnose`

Run a health check on `.swarm/` files, plan structure, and evidence completeness. Reports missing files, schema mismatches, and recovery steps.

### `/swarm history`

Show completed phases with status icons.

```text
/swarm history
```

### `/swarm agents`

List all registered agents with their model, temperature, read-only status, and guardrail profile.

---

## Plan Management

### `/swarm plan [N]`

Display the full `.swarm/plan.md`. With a phase number, show only that phase.

```text
/swarm plan          # full plan
/swarm plan 2        # Phase 2 tasks only
```

### `/swarm specify [description]`

Generate or import a feature specification from prose. Writes `.swarm/spec.md` using RFC 2119 keywords (MUST / SHOULD / MAY).

### `/swarm clarify [description]`

Refine an existing `spec.md` by clarifying ambiguous requirements.

### `/swarm analyze`

Compare `spec.md` against `plan.md` to find requirement coverage gaps. Useful before running a phase — identifies requirements not covered by any task.

### `/swarm brainstorm [topic]`

Enter architect BRAINSTORM mode: seven-phase planning workflow for new features needing requirement discovery. Sequence: CONTEXT SCAN → DIALOGUE → APPROACHES → DESIGN → SPEC → SELF-REVIEW → GATE SELECTION → TRANSITION.

### `/swarm council <question> [--preset <name>] [--spec-review]`

Enter architect MODE: COUNCIL — convene a configurable multi-model General Council for an advisory deliberation. Each council member independently web-searches and answers; the architect routes any disagreements back for one targeted reconciliation round; an optional moderator pass synthesizes the final user-facing answer.

| Flag | Effect |
|------|--------|
| `--preset <name>` | Use a named member group from `council.general.presets` instead of `council.general.members`. Preset name must match `[A-Za-z0-9_-]{1,64}`. |
| `--spec-review` | Switch to single-pass advisory mode. Used by the `council_general_review` QA gate during MODE: SPECIFY to fold council input into a draft spec — no Round 2 deliberation. |

**Prerequisites:** `council.general.enabled: true` and a configured search API key (Tavily or Brave) in `opencode-swarm.json`. See [Council guide — General Council Mode](council/README.md#general-council-mode) for setup.

**No-args behavior:** prints a usage string. The command never throws on bad input — invalid preset names and injected `[MODE: ...]` headers are silently dropped.

### `/swarm sync-plan`

Force `plan.md` regeneration from canonical `plan-ledger.jsonl`. Safe, read-only.

### `/swarm preflight`

Run preflight automation checks before starting a phase. Validates plan completeness, evidence requirements, and blockers.

---

## Execution Modes

### `/swarm turbo [on|off]`

Toggle Turbo Mode for the current session. Skips non-critical QA gates for faster iteration. Session-scoped; resets on new session.

```text
/swarm turbo         # toggle
/swarm turbo on      # enable
/swarm turbo off     # disable
```

See [Modes Guide](modes.md) for tradeoffs.

### `/swarm full-auto [on|off]`

Toggle Full-Auto Mode. Enables autonomous execution without confirmation prompts. Session-scoped.

---

## Configuration

### `/swarm config`

Show the current resolved plugin configuration (merged global + project + CLI overrides).

### `/swarm config doctor [--fix] [--restore <id>]`

Run config validation and integrity checks. Alias: `/swarm config-doctor` (hyphenated form for TUI shortcut compatibility).

- `--fix`: auto-repair issues where safe. Creates encrypted backup first.
- `--restore <id>`: revert to a previous backup.

### `/swarm doctor tools`

Run tool registration coherence check. Verifies all tools declared in the registry are available at runtime.

### `/swarm qa-gates [show|enable|override] <gate>...`

View or modify QA gate profile for the current plan.

- `show`: display spec-level, session-override, and effective gates.
- `enable`: persist gate(s) into the locked profile. Architect-only. Rejected after critic approval lock.
- `override`: session-only ratchet-tighter enable.

Valid gates: `reviewer`, `test_engineer`, `council_mode`, `sme_enabled`, `critic_pre_plan`, `hallucination_guard`, `sast_enabled`, `mutation_test`, `council_general_review`.

---

## Evidence and Telemetry

### `/swarm evidence [taskId]`

Show evidence bundles (review results, test verdicts, security findings) for a task. Without `taskId`, lists all tasks with evidence.

```text
/swarm evidence 2.1
```

### `/swarm evidence summary`

Generate an evidence summary showing completion ratio across all tasks, blockers, and missing evidence. Alias: `/swarm evidence-summary`.

### `/swarm archive [--dry-run]`

Archive old evidence bundles. Two-tier retention: age-based (`max_age_days`, default 90) then count-based (`max_bundles`, default 1000). Use `--dry-run` to preview.

### `/swarm benchmark [--cumulative] [--ci-gate]`

Show performance metrics: tool call rates, delegation chains, evidence pass rates.

- `--cumulative`: aggregate across sessions.
- `--ci-gate`: return non-zero exit if thresholds exceeded (for CI).

### `/swarm retrieve <summary-id>`

Load the full tool output that was previously summarized (IDs like `S1`, `S2`). Use when the summary is insufficient and you need the raw data.

---

## Knowledge System

### `/swarm knowledge`

List knowledge entries in `.swarm/knowledge.jsonl`. Filter by category, confidence, or utility.

### `/swarm knowledge migrate`

One-time migration from legacy `.swarm/context.md` SME cache to `.swarm/knowledge.jsonl`. Idempotent — skips if already migrated.

### `/swarm knowledge quarantine <entry-id> [reason]`

Move a knowledge entry to quarantine. Quarantined entries are excluded from agent queries.

### `/swarm knowledge restore <entry-id>`

Restore a quarantined entry back to active knowledge.

### `/swarm promote [--category <cat>] [--from-swarm <id>] <text>`

Manually promote a lesson to hive (cross-project) knowledge. Either pass lesson text directly or reference an existing swarm-level lesson by ID.

### `/swarm curate`

Run knowledge curation and review hive promotion candidates. Identifies evergreen lessons for cross-project reuse.

---

## State and Recovery

### `/swarm reset --confirm`

DELETE `plan.md`, `context.md`, and `summaries/` from `.swarm/`. Stops background automation and clears in-memory queues. **Requires `--confirm` — without it, shows a warning and a tip to export first.**

### `/swarm reset-session`

Clear only session state (`.swarm/session/state.json` and related files). Preserves plan, evidence, and knowledge. Use when starting a new model/session but continuing the same project.

### `/swarm checkpoint <save|restore|delete|list> <label>`

Named snapshots of `.swarm/` state.

- `save <label>`: create snapshot.
- `restore <label>`: soft-reset to checkpoint.
- `delete <label>`: remove checkpoint.
- `list`: show all checkpoints.

### `/swarm rollback <phase>`

Restore `.swarm/` to a phase checkpoint (`checkpoints/phase-<N>`). Writes a rollback event to `events.jsonl`. Without a phase argument, lists available checkpoints.

### `/swarm close [--prune-branches]`

Idempotent 4-stage project finalization:
1. **Finalize** — write retrospectives for in-progress phases.
2. **Archive** — timestamped bundle of swarm artifacts and evidence.
3. **Clean** — remove active-state files.
4. **Align** — safe git `ff-only` to `main`.

Reads `.swarm/close-lessons.md` for explicit lessons and runs curation.

---

## Session Handoff

### `/swarm handoff`

Prepare state for a clean model switch. Writes `handoff.md` with full session state snapshot (plan progress, decisions, delegation history) for prepending to the next session.

### `/swarm export`

Export the current plan and context as JSON to stdout. Useful for piping to external tools or debugging.

---

## Retrospectives

### `/swarm write-retro <json>`

Write a retrospective evidence bundle for a completed phase. Required JSON fields: `phase`, `summary`, `task_count`, `task_complexity`, `total_tool_calls`, `coder_revisions`, `reviewer_rejections`, `test_failures`, `security_findings`, `integration_issues`. Optional: `lessons_learned` (max 5), `top_rejection_reasons`, `task_id`, `metadata`.

Output: `.swarm/evidence/retro-{phase}/evidence.json`.

---

## Analysis Tools

### `/swarm dark-matter [--threshold <n>] [--min-commits <n>]`

Detect hidden file couplings via co-change NPMI (Normalized Pointwise Mutual Information) analysis of git history. Finds files that change together but aren't obviously related in code.

### `/swarm simulate [--threshold <n>] [--min-commits <n>]`

Dry-run the dark-matter analysis with configurable thresholds. Does not modify state.

### `/swarm acknowledge-spec-drift`

Acknowledge that the spec has drifted from the plan and suppress further warnings. Use after you've reviewed the drift and accepted it.

---

## Compound Command Resolution

When you type a two-word command like `/swarm config doctor`, Swarm tries the compound key first, then falls back to the single-token key. Aliases with hyphens exist for TUI shortcuts (which split on hyphens):

| Command | Alias |
|---------|-------|
| `/swarm config doctor` | `/swarm config-doctor` |
| `/swarm evidence summary` | `/swarm evidence-summary` |

---

## CLI Invocation

### Inside an OpenCode session

Type `/swarm <subcommand>` in the chat. All commands in this reference work here.

### Standalone CLI

The standalone binary accepts three top-level commands: `install`, `uninstall`, and `run`. To invoke a registry command from the shell, prefix it with `run`:

```bash
opencode-swarm run status
opencode-swarm run plan 2
opencode-swarm run evidence 2.1
```

Session-scoped commands (`turbo`, `full-auto`) require an active session and only work inside an OpenCode session — invoking them via the standalone CLI will fail.

Both routes share the same registry. See `src/commands/registry.ts` for the raw definitions and `src/cli/index.ts` for the standalone dispatcher.

---

## Related Documentation

- [Getting Started](getting-started.md) — first-run walkthrough
- [Modes Guide](modes.md) — Balanced vs Turbo vs Full-Auto tradeoffs
- [Configuration Reference](configuration.md) — all config keys
- [Knowledge System](knowledge.md) — hive vs swarm knowledge
- [Evidence and Telemetry](evidence-and-telemetry.md) — observability

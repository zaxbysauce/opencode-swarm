# Configuration

Swarm supports both global and per-project configuration.

## Config file locations

Global config:

```text
~/.config/opencode/opencode-swarm.json
```

Project config:

```text
.opencode/opencode-swarm.json
```

Project config merges over global config.

## Minimal example

```json
{
  "agents": {
    "coder": { "model": "opencode/minimax-m2.5-free" },
    "reviewer": { "model": "opencode/big-pickle" }
  }
}
```

You only need to define the agents you want to override.

> If `architect` is not set explicitly, it inherits the currently selected OpenCode UI model.

## How to verify the resolved config

Run:

```text
/swarm config
```

## Related commands

```text
/swarm diagnose
/swarm agents
/swarm config
```

## Hook Configuration

### incremental_verify

Runs a type-checking or linting command after the coder agent completes.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable the hook |
| `command` | `string \| string[] \| null` | `null` | Override auto-detected command. String is split on spaces. Array bypasses splitting for commands with special arguments. |
| `timeoutMs` | number | `30000` | Timeout in milliseconds (1000–300000) |
| `triggerAgents` | string[] | `["coder"]` | Which agent names trigger the hook |

**Auto-detection order**: TypeScript → Go → Rust → Python → C#. Python emits a `SKIPPED` advisory if no command is set.

**Example** — Python mypy configuration:

```json
{
  "incremental_verify": {
    "command": ["python", "-m", "mypy", "--config-file", "mypy.ini"]
  }
}
```

### slop_detector

Detects low-quality code patterns (AI slop) in generated output.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable the hook |
| `classThreshold` | number | `3` | Abstraction-bloat threshold (max methods/props per class) |
| `commentStripThreshold` | number | `5` | Comment-strip threshold (max consecutive comment lines) |
| `diffLineThreshold` | number | `200` | Boilerplate-explosion threshold (max lines per diff) |

### Curator

Optional knowledge-base curator that validates agent output against project knowledge.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Master switch for Curator |
| `init_enabled` | boolean | `true` | Run Curator at session start |
| `phase_enabled` | boolean | `true` | Run Curator at phase boundaries |
| `max_summary_tokens` | number | `2000` | Max tokens for Curator summary output |
| `min_knowledge_confidence` | number | `0.7` | Minimum confidence threshold for knowledge entries |
| `compliance_report` | boolean | `true` | Include compliance report in phase digest |
| `suppress_warnings` | boolean | `true` | Suppress TUI warnings; emit events only |
| `drift_inject_max_chars` | number | `500` | Max chars for drift report summary injected into architect context |

Curator is optional and disabled by default. When enabled, it writes `.swarm/curator-summary.json` and `.swarm/drift-report-phase-N.json` to track knowledge alignment and drift detection.

### todo_gate

Controls the TODO gate that warns about new high-priority TODO/FIXME/HACK comments introduced during a phase.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable the TODO gate |
| `max_high_priority` | number | `0` | Maximum allowed new high-priority TODOs (FIXME/HACK/XXX) before warning. `0` means warn on any occurrence. Set to `-1` to disable the threshold check. |
| `block_on_threshold` | boolean | `false` | If `true`, block phase completion when the threshold is exceeded. If `false`, the gate is advisory only (warns but does not block). |

The TODO gate scans for new `TODO`, `FIXME`, and `HACK` comments introduced in the current phase and compares the count against `max_high_priority`. The count is included in the `todo_scan` field returned by the `check_gate_status` tool.

## Phase Complete Configuration

Controls phase completion gating and validation.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable phase completion validation |
| `required_agents` | string[] | `["coder", "reviewer", "test_engineer"]` | Agents that must be dispatched before a phase can complete |
| `require_docs` | boolean | `true` | Require the docs agent to be dispatched |
| `policy` | `"enforce" \| "warn"` | `"enforce"` | When `"enforce"`: missing agents block phase completion. When `"warn"`: missing agents produce warnings only. |
| `regression_sweep.enforce` | boolean | `false` | If `true`, phase_complete warns when no regression-sweep result is found for any task in the phase. Advisory only — does not block phase completion. |

**Example** — Enable regression sweep enforcement:

```json
{
  "phase_complete": {
    "required_agents": ["coder", "reviewer", "test_engineer"],
    "require_docs": true,
    "policy": "enforce",
    "regression_sweep": {
      "enforce": true
    }
  }
}
```

For a full configuration reference, see the [Full Configuration Reference](../README.md) section in the README (expand the "Full Configuration Reference" details block).

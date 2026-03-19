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

For a full configuration reference, see the [README](../README.md#configuration-reference).

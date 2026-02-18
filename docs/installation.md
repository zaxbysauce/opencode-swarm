# Installation Guide

## Quick Start

### 1. Add to OpenCode

Add to your `opencode.json`:

```json
{
  "plugin": ["opencode-swarm"]
}
```

Or install via CLI:

```bash
bunx opencode-swarm install
```

### 2. Configure Models

Create `~/.config/opencode/opencode-swarm.json`:

```json
{
  "agents": {
    "architect": { "model": "anthropic/claude-sonnet-4-5" },
    "explorer": { "model": "google/gemini-2.0-flash" },
    "coder": { "model": "anthropic/claude-sonnet-4-5" },
    "sme": { "model": "google/gemini-2.0-flash" },
    "reviewer": { "model": "google/gemini-2.0-flash" },
    "critic": { "model": "google/gemini-2.0-flash" },
    "test_engineer": { "model": "google/gemini-2.0-flash" },
    "docs": { "model": "google/gemini-2.0-flash" },
    "designer": { "model": "google/gemini-2.0-flash" }
  }
}
```

### 3. Start OpenCode

```bash
opencode
```

### 4. Test It

```
@architect Review this codebase and suggest improvements
```

You should see:
1. Architect checking for `.swarm/plan.md`
2. Explorer scanning the codebase
3. SMEs providing domain guidance
4. A phased plan being created

---

## Configuration Reference

### Model Assignment

Each agent can use a different model:

```json
{
  "agents": {
    "architect": { "model": "anthropic/claude-sonnet-4-5" },
    "coder": { "model": "anthropic/claude-sonnet-4-5" },
    "explorer": { "model": "google/gemini-2.0-flash" }
  }
}
```

### Disable Agents

```json
{
  "agents": {
    "critic": { "disabled": true }
  }
}
```

### Temperature

Adjust creativity/determinism per agent:

```json
{
  "agents": {
    "architect": { "model": "...", "temperature": 0.1 },
    "coder": { "model": "...", "temperature": 0.2 }
  }
}
```

---

## Multiple Swarms

Run multiple independent swarms with different model configurations.

### Basic Multi-Swarm Setup

```json
{
  "swarms": {
    "cloud": {
      "name": "Cloud",
      "agents": {
        "architect": { "model": "anthropic/claude-sonnet-4-5" },
        "coder": { "model": "anthropic/claude-sonnet-4-5" },
        "sme": { "model": "google/gemini-2.0-flash" },
        "reviewer": { "model": "openai/gpt-4o" },
        "critic": { "model": "openai/gpt-4o" }
      }
    },
    "local": {
      "name": "Local",
      "agents": {
        "architect": { "model": "ollama/qwen2.5:32b" },
        "coder": { "model": "ollama/qwen2.5:32b" },
        "sme": { "model": "ollama/qwen2.5:14b" },
        "reviewer": { "model": "ollama/qwen2.5:14b" },
        "critic": { "model": "ollama/qwen2.5:14b" }
      }
    }
  }
}
```

### How It Works

1. **First swarm is default**: The first swarm (or one named "default") creates standard agent names (`architect`, `coder`, etc.)

2. **Additional swarms are prefixed**: Other swarms prefix all agents with the swarm ID:
   - `local_architect`
   - `local_coder`
   - `local_sme`
   - etc.

3. **Each architect knows its agents**: The `local_architect` prompt is automatically updated to reference `local_explorer`, `local_coder`, etc.

4. **Display names in UI**: The `name` field (e.g., "Local") appears in descriptions.

### Example: Three-Tier Configuration

```json
{
  "swarms": {
    "premium": {
      "name": "Premium (Cloud)",
      "agents": {
        "architect": { "model": "anthropic/claude-sonnet-4-5" },
        "coder": { "model": "anthropic/claude-sonnet-4-5" },
        "sme": { "model": "anthropic/claude-sonnet-4-5" },
        "reviewer": { "model": "openai/gpt-4o" },
        "critic": { "model": "openai/gpt-4o" }
      }
    },
    "balanced": {
      "name": "Balanced",
      "agents": {
        "architect": { "model": "anthropic/claude-sonnet-4-5" },
        "coder": { "model": "google/gemini-2.0-flash" },
        "sme": { "model": "google/gemini-2.0-flash" },
        "reviewer": { "model": "google/gemini-2.0-flash" },
        "critic": { "model": "google/gemini-2.0-flash" }
      }
    },
    "local": {
      "name": "Local (Offline)",
      "agents": {
        "architect": { "model": "ollama/qwen2.5:32b" },
        "coder": { "model": "ollama/qwen2.5:32b" },
        "sme": { "model": "ollama/qwen2.5:14b" },
        "reviewer": { "model": "ollama/qwen2.5:14b" },
        "critic": { "model": "ollama/qwen2.5:14b" }
      }
    }
  }
}
```

This creates:
- `architect` (Premium)
- `balanced_architect` (Balanced)
- `local_architect` (Local)

### Swarm-Specific Overrides

Each swarm supports the same configuration options as the legacy `agents` block:

```json
{
  "swarms": {
    "local": {
      "name": "Local",
      "agents": {
        "architect": { "model": "ollama/qwen2.5:32b" },
        "sme": { "model": "ollama/qwen2.5:14b" },
        "reviewer": { "model": "ollama/qwen2.5:14b" },
        "critic": { "disabled": true }
      }
    }
  }
}
```

### Legacy Compatibility

If you don't use `swarms`, the legacy `agents` config still works:

```json
{
  "agents": {
    "architect": { "model": "anthropic/claude-sonnet-4-5" }
  }
}
```

This creates a single swarm with standard agent names.

Lower (0.0-0.2) = more deterministic, better for code
Higher (0.5-0.8) = more creative, better for brainstorming

---

## Recommended Configurations

### Budget-Conscious

Use expensive models only where it matters:

```json
{
  "agents": {
    "architect": { "model": "anthropic/claude-sonnet-4-5" },
    "coder": { "model": "anthropic/claude-sonnet-4-5" },
    "explorer": { "model": "google/gemini-2.0-flash" },
    "sme": { "model": "google/gemini-2.0-flash" },
    "reviewer": { "model": "google/gemini-2.0-flash" },
    "critic": { "model": "google/gemini-2.0-flash" },
    "test_engineer": { "model": "google/gemini-2.0-flash" },
    "docs": { "model": "google/gemini-2.0-flash" },
    "designer": { "model": "google/gemini-2.0-flash" }
  }
}
```

### Maximum Diversity

Different vendors catch different bugs:

```json
{
  "agents": {
    "architect": { "model": "anthropic/claude-sonnet-4-5" },
    "coder": { "model": "anthropic/claude-sonnet-4-5" },
    "explorer": { "model": "google/gemini-2.0-flash" },
    "sme": { "model": "google/gemini-2.0-flash" },
    "reviewer": { "model": "openai/gpt-4o" },
    "critic": { "model": "google/gemini-2.0-flash" },
    "test_engineer": { "model": "openai/gpt-4o-mini" },
    "docs": { "model": "google/gemini-2.0-flash" },
    "designer": { "model": "google/gemini-2.0-flash" }
  }
}
```

### Local + Cloud Hybrid

Use local models for high-volume agents:

```json
{
  "agents": {
    "architect": { "model": "anthropic/claude-sonnet-4-5" },
    "coder": { "model": "anthropic/claude-sonnet-4-5" },
    "explorer": { "model": "ollama/qwen2.5:14b" },
    "sme": { "model": "ollama/qwen2.5:14b" },
    "reviewer": { "model": "ollama/qwen2.5:14b" },
    "critic": { "model": "ollama/qwen2.5:14b" },
    "test_engineer": { "model": "ollama/qwen2.5:14b" },
    "docs": { "model": "ollama/qwen2.5:14b" },
    "designer": { "model": "ollama/qwen2.5:14b" }
  }
}
```

### All-Claude (Enterprise)

Single vendor, premium quality:

```json
{
  "agents": {
    "architect": { "model": "anthropic/claude-sonnet-4-5" },
    "coder": { "model": "anthropic/claude-sonnet-4-5" },
    "explorer": { "model": "anthropic/claude-haiku" },
    "sme": { "model": "anthropic/claude-haiku" },
    "reviewer": { "model": "anthropic/claude-sonnet-4-5" },
    "critic": { "model": "anthropic/claude-sonnet-4-5" },
    "test_engineer": { "model": "anthropic/claude-haiku" },
    "docs": { "model": "anthropic/claude-haiku" },
    "designer": { "model": "anthropic/claude-haiku" }
  }
}
```

---

## Custom Prompts

Override or extend agent prompts.

### Directory

Place custom prompts in:
```
~/.config/opencode/opencode-swarm/
```

### Replace Entire Prompt

Create `{agent}.md`:
```
~/.config/opencode/opencode-swarm/architect.md
```

### Append to Default

Create `{agent}_append.md`:
```
~/.config/opencode/opencode-swarm/architect_append.md
```

### Example: Add Custom Guidelines

`~/.config/opencode/opencode-swarm/architect_append.md`:
```markdown
## Additional Project Guidelines

- All code must be HIPAA compliant
- Use PowerShell 7+ syntax only
- Include verbose logging with -Verbose support
- Follow company naming conventions: Verb-CompanyNoun
```

---

## Project Files

Swarm creates a `.swarm/` directory in your project:

```
.swarm/
├── plan.md        # Legacy phased roadmap (migrated to plan.json)
├── plan.json      # Machine-readable plan with Zod-validated schema
├── context.md     # Project knowledge, SME cache
├── evidence/      # Per-task execution evidence bundles
└── history/       # Archived phase summaries
```

### Should I Commit These?

**Yes.** These files are:
- Human-readable documentation
- Useful for onboarding
- Part of project history

Add to `.gitignore` if you prefer not to track:
```
.swarm/
```

---

## Resuming Projects

Swarm automatically resumes projects:

1. Architect checks for `.swarm/plan.md`
2. If found, reads current phase and task
3. Continues from where it left off

To start fresh:
```bash
rm -rf .swarm/
```

Or use the slash command:
```
/swarm reset --confirm
```

---

## Development

### Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test tests/unit/config/schema.test.ts

# Run tests in a specific directory
bun test tests/unit/agents/
```

### Build & Verify

```bash
# Build
bun run build

# Type check
bun run typecheck

# Lint
bun run lint

# Full verification
bun test && bun run build && bun run typecheck && bun run lint
```

---

## Troubleshooting

### Agents Not Loading

1. Verify plugin in `opencode.json`
2. Check config JSON syntax
3. Restart OpenCode

### Wrong Model Used

1. Check for typos in model names
2. Verify agent-specific overrides in config
3. Check swarm-level vs top-level config precedence

### SMEs Not Being Called

1. Check if domain is disabled
2. Verify Explorer is detecting relevant domains
3. Check context.md for cached guidance (may be skipping)

### Plan Not Created

1. Ensure Architect has write permissions
2. Check for `.swarm/` directory creation
3. Review Architect output for errors

### Tasks Failing Repeatedly

1. Check plan.md for attempt history
2. Review rejection reasons
3. Consider re-scoping task
4. May need clearer acceptance criteria

---

## Hooks Configuration

Control which hooks are active:

```json
{
  "hooks": {
    "system_enhancer": true,
    "compaction": true,
    "agent_activity": true,
    "delegation_tracker": false,
    "agent_awareness_max_chars": 300
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `system_enhancer` | boolean | `true` | Inject current phase, task, and decisions into agent system prompts |
| `compaction` | boolean | `true` | Enrich session compaction with plan.md and context.md data |
| `agent_activity` | boolean | `true` | Track tool usage per agent, flush activity summary to context.md |
| `delegation_tracker` | boolean | `false` | Log delegation chains in chat.message hook (diagnostic, opt-in) |
| `agent_awareness_max_chars` | number | `300` | Max characters for cross-agent context injection in system prompts |

---

## Context Budget Configuration

Monitor and warn about context window usage:

```json
{
  "context_budget": {
    "enabled": true,
    "warn_threshold": 0.7,
    "critical_threshold": 0.9,
    "model_limits": {
      "default": 128000,
      "anthropic/claude-sonnet-4-5": 200000
    }
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable token budget tracking and warnings |
| `warn_threshold` | number | `0.7` | Inject warning message at this percentage of token limit |
| `critical_threshold` | number | `0.9` | Inject critical warning at this percentage of token limit |
| `model_limits` | object | `{ "default": 128000 }` | Token limits per model. Use `"default"` as fallback. |
| `max_injection_tokens` | number | `4000` | Maximum tokens for system prompt injection. Priority-ordered: phase → task → decisions → agent context |

### How It Works

1. On each message transform, total tokens are estimated across all message parts
2. Token estimation uses a conservative ratio: `chars × 0.33`
3. When usage exceeds `warn_threshold`: `[CONTEXT WARNING: ~N% used. Consider summarizing to .swarm/context.md]`
4. When usage exceeds `critical_threshold`: `[CONTEXT CRITICAL: ~N% used. Offload details immediately]`

---

## Evidence Configuration

Configure evidence bundle retention:

```json
{
  "evidence": {
    "enabled": true,
    "max_age_days": 90,
    "max_bundles": 1000,
    "auto_archive": false
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable evidence bundle persistence |
| `max_age_days` | number | `90` | Archive evidence older than N days |
| `max_bundles` | number | `1000` | Maximum evidence bundles before auto-archive |
| `auto_archive` | boolean | `false` | Enable automatic archiving of old evidence |

---

## Guardrails Configuration

Control agent execution limits:

```json
{
  "guardrails": {
    "enabled": true,
    "max_tool_calls": 200,
    "max_duration_minutes": 30,
    "max_repetitions": 10,
    "max_consecutive_errors": 5,
    "warning_threshold": 0.5,
    "profiles": {
      "coder": { "max_tool_calls": 300, "max_duration_minutes": 60 },
      "explorer": { "max_tool_calls": 100, "max_duration_minutes": 10 }
    }
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable guardrail limits for all agents |
| `max_tool_calls` | number | `200` | Maximum tool calls per agent task |
| `max_duration_minutes` | number | `30` | Maximum minutes per agent task |
| `max_repetitions` | number | `10` | Maximum repetitions of similar tool calls |
| `max_consecutive_errors` | number | `5` | Maximum consecutive tool errors before circuit break |
| `warning_threshold` | number | `0.5` | Inject warning at this percentage of any limit |
| `profiles` | object | — | Per-agent overrides. Keys are agent names, values override base settings. |

**Architect is exempt/unlimited by default:** The architect agent has no guardrail limits by default (0 = unlimited). The system uses a 10-second stale delegation window to prevent the architect from inheriting subagent limits during rapid delegation transitions. To override, add a `profiles.architect` entry:

```jsonc
{
  "guardrails": {
    "profiles": {
      "architect": { "max_tool_calls": 500, "max_duration_minutes": 60 }
    }
  }
}
```

---

## Review Passes Configuration

Control the dual-pass security review behavior introduced in v6.0.0:

```jsonc
{
  "review_passes": {
    "always_security_review": false,
    "security_globs": [
      "**/*auth*", "**/*crypto*",
      "**/*session*", "**/*token*",
      "**/*middleware*", "**/*api*",
      "**/*security*"
    ]
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `always_security_review` | boolean | `false` | When `true`, run a security-only review pass on every task regardless of file path. When `false`, only trigger on files matching `security_globs`. |
| `security_globs` | string[] | 7 patterns | Glob patterns for security-sensitive files. When a changed file matches any pattern, the architect triggers an automatic security-only reviewer pass after the general review. |

The security review pass uses **OWASP Top 10 2021** categories as its review framework. It runs as a separate reviewer delegation with security-only framing — the same reviewer agent, different mission.

---

## Integration Analysis Configuration

Control whether contract change detection triggers automatic impact analysis:

```jsonc
{
  "integration_analysis": {
    "enabled": true
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | When `true`, the architect runs the `diff` tool after each coder task. If contract changes are detected (exported functions, interfaces, type definitions), the explorer is delegated to run impact analysis across dependent files before review begins. |

### What Counts as a Contract Change

The `diff` tool flags these patterns as contract changes:
- `export function`, `export const`, `export class`, `export interface`, `export type`
- `export default`
- `export { ... }` (re-exports)

When contract changes are detected, the explorer analyzes:
- Which files import the changed exports
- Whether the changes are additive (safe) or breaking (signature changes, removals)
- Downstream impact on dependent modules

---

## Slash Commands

Twelve commands are available under `/swarm`:

### `/swarm status`

Shows current swarm state:
- Current phase and phase status
- Task progress (completed / total) in current phase
- Number of registered agents

```
Phase: 2 [IN PROGRESS]
Tasks: 3/5 complete
Agents: 9 registered
```

### `/swarm plan`

Displays the full `.swarm/plan.md` content.

### `/swarm plan N`

Displays only Phase N from the plan. Example:

```
/swarm plan 2
```

Shows the Phase 2 section including all tasks, dependencies, and status.

### `/swarm agents`

Lists all registered agents with their configuration including guardrail profiles:

```
| Agent          | Model                        | Temp | Read-Only | Guardrails        |
|----------------|------------------------------|------|-----------|-------------------|
| architect      | anthropic/claude-sonnet-4-5   | 0.1  | No        | max_tools: 200    |
| explorer       | google/gemini-2.0-flash      | 0.1  | Yes       | max_tools: 200    |
| coder          | anthropic/claude-sonnet-4-5   | 0.2  | No        | max_tools: 200    |
| ...            | ...                          | ...  | ...       | ...               |
```

### `/swarm history`

View completed phases with status icons.

### `/swarm config`

View current resolved plugin configuration.

### `/swarm diagnose`

Health check for `.swarm/` files, plan structure, and evidence completeness.

### `/swarm export`

Export plan and context as portable JSON.

### `/swarm reset --confirm`

Clear swarm state files. Requires `--confirm` flag as a safety gate.

### `/swarm evidence [task]`

View evidence bundles for a specific task, or list all tasks with evidence when no task ID is provided.

### `/swarm archive [--dry-run]`

Archive old evidence bundles based on the retention policy. Use `--dry-run` to preview what would be archived.

### `/swarm benchmark`

Run performance benchmarks and display metrics. Tracks tool call rates, delegation chains, and evidence-derived pass rates.

### `/swarm retrieve [id]`

Retrieve auto-summarized tool outputs by ID. When tool outputs are too large, they are summarized automatically — use this command to retrieve the full content by ID.

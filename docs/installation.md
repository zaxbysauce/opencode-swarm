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
    "test_engineer": { "model": "google/gemini-2.0-flash" }
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

3. **Each architect knows its agents**: The `local_architect` prompt is automatically updated to reference `@local_explorer`, `@local_coder`, etc.

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
    "test_engineer": { "model": "google/gemini-2.0-flash" }
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
    "test_engineer": { "model": "openai/gpt-4o-mini" }
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
    "test_engineer": { "model": "ollama/qwen2.5:14b" }
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
    "test_engineer": { "model": "anthropic/claude-haiku" }
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
├── plan.md        # Phased roadmap with tasks
├── context.md     # Project knowledge, SME cache
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

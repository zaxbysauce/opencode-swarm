# Installation Guide

## Prerequisites

- [Bun](https://bun.sh/) runtime (for running the installer)
- [OpenCode](https://opencode.ai/) CLI installed and authenticated

## Quick Install

```bash
bunx opencode-swarm install
```

This will:
1. Add `opencode-swarm` to your OpenCode plugins
2. Create a default configuration file
3. Set up the custom prompts directory

## Manual Installation

If you prefer manual setup:

### 1. Install the package globally

```bash
bun add -g opencode-swarm
```

### 2. Add to OpenCode config

Edit `~/.config/opencode/config.json`:

```json
{
  "plugins": ["opencode-swarm"]
}
```

### 3. Create plugin config

Create `~/.config/opencode/opencode-swarm.json`:

```json
{
  "preset": "remote",
  "swarm_mode": "remote",
  "max_iterations": 5
}
```

## Configuration Options

### Presets

Presets define model assignments for all agents. The plugin includes two built-in presets:

**remote** - Uses cloud-based models:
```json
{
  "architect": { "model": "anthropic/claude-sonnet-4.5" },
  "coder": { "model": "openai/gpt-5.2-codex" },
  "_sme": { "model": "google/gemini-3-flash" },
  "_qa": { "model": "google/gemini-3-flash" },
  "test_engineer": { "model": "google/gemini-3-flash" }
}
```

**hybrid** - Uses local inference for SME/QA:
```json
{
  "architect": { "model": "anthropic/claude-sonnet-4.5" },
  "coder": { "model": "ollama/qwen3:72b" },
  "_sme": { "model": "npu/qwen3:14b" },
  "_qa": { "model": "npu/qwen3:14b" },
  "test_engineer": { "model": "npu/qwen3:14b" }
}
```

### Local Inference Setup

For hybrid mode with local models:

```json
{
  "swarm_mode": "hybrid",
  "gpu_url": "http://192.168.1.100:1234/v1",
  "gpu_model": "qwen3:72b",
  "npu_url": "http://localhost:11435/v1",
  "npu_model": "qwen3:14b"
}
```

The `ollama/` and `npu/` prefixes in model names tell the plugin to use local endpoints.

### Category Model Defaults

Use underscore-prefixed keys to set defaults for agent categories:

| Key | Applies To |
|-----|------------|
| `_sme` | All 11 SME agents |
| `_qa` | `security_reviewer`, `auditor` |

Individual agent overrides take priority over category defaults.

### Disabling Agents

To disable specific agents:

```json
{
  "agents": {
    "sme_ui_ux": { "disabled": true },
    "sme_vmware": { "disabled": true }
  }
}
```

### Temperature Overrides

```json
{
  "agents": {
    "coder": { "temperature": 0.1 },
    "architect": { "temperature": 0.2 }
  }
}
```

## Custom Prompts

Place markdown files in `~/.config/opencode/opencode-swarm/`:

### Replace Default Prompt

Create `{agent}.md` to completely replace an agent's prompt:

```
~/.config/opencode/opencode-swarm/architect.md
```

### Append to Default Prompt

Create `{agent}_append.md` to add instructions:

```
~/.config/opencode/opencode-swarm/coder_append.md
```

Example `coder_append.md`:
```markdown
## Additional Requirements

- Always use strict mode in PowerShell
- Include verbose logging for debugging
- Follow our internal coding standards at /docs/standards.md
```

## Project-Level Configuration

You can override settings per-project by creating:

```
<project>/.opencode/opencode-swarm.json
```

Project config is deep-merged with user config, with project taking precedence.

## Troubleshooting

### Plugin not loading

1. Check OpenCode config includes the plugin:
   ```bash
   cat ~/.config/opencode/config.json | grep opencode-swarm
   ```

2. Verify the package is installed:
   ```bash
   bun pm ls -g | grep opencode-swarm
   ```

### Models not found

Ensure your OpenCode authentication covers the models you're using:
```bash
opencode auth login
```

### Local inference not working

1. Verify endpoints are accessible:
   ```bash
   curl http://localhost:11435/v1/models
   ```

2. Check the model names match your local setup

### Debug mode

Enable verbose logging:
```bash
OPENCODE_SWARM_DEBUG=1 opencode
```

## Updating

```bash
bunx opencode-swarm@latest install
```

This preserves your existing configuration while updating the plugin.

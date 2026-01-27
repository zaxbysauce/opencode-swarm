# OpenCode Swarm

Architect-centric agentic swarm plugin for OpenCode. Hub-and-spoke orchestration with SME consultation, code generation, and QA review.

## Overview

OpenCode Swarm implements a multi-agent development pipeline where:

1. **Architect** (central orchestrator) analyzes requests and coordinates all agents
2. **SME Agents** provide domain-specific technical expertise (serial execution)
3. **Coder** implements unified specifications
4. **QA Agents** (Security Reviewer + Auditor) validate code quality
5. **Test Engineer** generates test cases for approved code

```
User → Architect (analyze) → [SME Pool - serial] → Architect (collate)
     → Coder → [QA: Security + Auditor] → Architect (triage) → Test
```

## Installation

```bash
bunx opencode-swarm install
```

Then start OpenCode:

```bash
opencode
```

## Configuration

Edit `~/.config/opencode/opencode-swarm.json`:

```json
{
  "preset": "hybrid",
  "presets": {
    "remote": {
      "architect": { "model": "anthropic/claude-sonnet-4.5" },
      "coder": { "model": "openai/gpt-5.2-codex" },
      "_sme": { "model": "google/gemini-3-flash" },
      "_qa": { "model": "google/gemini-3-flash" },
      "test_engineer": { "model": "google/gemini-3-flash" }
    },
    "hybrid": {
      "architect": { "model": "anthropic/claude-sonnet-4.5" },
      "coder": { "model": "ollama/qwen3:72b" },
      "_sme": { "model": "npu/qwen3:14b" },
      "_qa": { "model": "npu/qwen3:14b" },
      "test_engineer": { "model": "npu/qwen3:14b" }
    }
  },
  "swarm_mode": "hybrid",
  "gpu_url": "http://192.168.1.100:1234/v1",
  "npu_url": "http://localhost:11435/v1",
  "max_iterations": 5
}
```

### Category Defaults

Use `_sme` and `_qa` to set models for all agents in a category:

```json
{
  "agents": {
    "_sme": { "model": "npu/qwen3:14b" },
    "_qa": { "model": "npu/qwen3:14b" }
  }
}
```

To override a specific agent within a category:

```json
{
  "agents": {
    "_sme": { "model": "npu/qwen3:14b" },
    "sme_oracle": { "model": "ollama/qwen3:72b" }
  }
}
```

### Custom Prompts

Place custom prompts in `~/.config/opencode/opencode-swarm/`:

- `{agent}.md` - Replace the default prompt entirely
- `{agent}_append.md` - Append to the default prompt

Example: `architect_append.md` to add custom instructions to the Architect.

## Agents

### Orchestrator

| Agent | Role |
|-------|------|
| `architect` | Central orchestrator, coordinates all phases |

### SME Specialists (Domain Experts)

| Agent | Domain |
|-------|--------|
| `sme_windows` | Windows OS internals, registry, services |
| `sme_powershell` | PowerShell scripting, cmdlets, modules |
| `sme_python` | Python ecosystem, libraries, best practices |
| `sme_oracle` | Oracle Database, SQL/PLSQL, administration |
| `sme_network` | Networking, firewalls, DNS, TLS/SSL |
| `sme_security` | STIG compliance, hardening, encryption |
| `sme_linux` | Linux administration, systemd, packages |
| `sme_vmware` | VMware vSphere, ESXi, PowerCLI |
| `sme_azure` | Azure cloud services, Entra ID, ARM/Bicep |
| `sme_active_directory` | Active Directory, LDAP, Group Policy |
| `sme_ui_ux` | UI/UX design, interaction patterns |

### Pipeline Agents

| Agent | Role |
|-------|------|
| `coder` | Implements specifications, writes production code |
| `security_reviewer` | Security vulnerability assessment |
| `auditor` | Code correctness and quality review |
| `test_engineer` | Test case and validation script generation |

## Workflow Phases

1. **ANALYZE** - Parse request, identify domains, create initial spec
2. **SME_CONSULTATION** - Consult domain experts serially
3. **COLLATE** - Synthesize SME outputs into unified spec
4. **CODE** - Generate implementation
5. **QA_REVIEW** - Security and quality review (parallel)
6. **TRIAGE** - Approve, request revision, or block
7. **TEST** - Generate tests for approved code

## Delegation Rules

The Architect enforces resource-aware delegation:

- **SME agents**: Execute serially (one at a time) to avoid overwhelming local inference
- **QA agents**: May execute in parallel (independent analysis)
- **Cross-category**: One agent per category may run simultaneously

## Tools

| Tool | Description |
|------|-------------|
| `detect_domains` | Auto-detect SME domains from text |
| `extract_code_blocks` | Extract and save code blocks to files |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENCODE_SWARM_PRESET` | Override preset selection |
| `OPENCODE_SWARM_DEBUG` | Enable debug logging (`1` to enable) |

## License

MIT

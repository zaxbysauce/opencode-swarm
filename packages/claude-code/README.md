# @opencode-swarm/claude-code

Claude Code adapter for [opencode-swarm](https://github.com/zaxbysauce/opencode-swarm) — brings the full architect-centric swarm orchestration system to Claude Code.

## What This Provides

- **9 specialized agents** (swarm-architect, swarm-coder, swarm-reviewer, swarm-test-engineer, swarm-critic, swarm-explorer, swarm-sme, swarm-docs, swarm-designer)
- **7 lifecycle hooks** (SessionStart, PreToolUse, PostToolUse, UserPromptSubmit, Stop, SubagentStop, PreCompact)
- **Disk-based state bridge** for swarm state persistence across hook invocations
- **Telemetry** via session-scoped events files (`.swarm/events-{sessionId}.jsonl`)

## Installation

### Option 1: npm install (recommended)

```bash
npm install -g @opencode-swarm/claude-code
```

Then add to your Claude Code `settings.json`:
```json
{
  "plugins": [
    "/path/to/node_modules/@opencode-swarm/claude-code"
  ]
}
```

### Option 2: Manual clone

```bash
git clone https://github.com/zaxbysauce/opencode-swarm.git
cd opencode-swarm
bun install
```

Then add to your Claude Code `settings.json`:
```json
{
  "plugins": [
    "/path/to/opencode-swarm/packages/claude-code"
  ]
}
```

### Option 3: /plugin install (if marketplace available)

```
/plugin install @opencode-swarm/claude-code
```

## Usage

Once installed, the swarm agents are available via the Task tool:

```
Use swarm-architect to plan and orchestrate the implementation of [feature].
```

The architect will:
1. Analyze the codebase with swarm-explorer
2. Create a plan in `.swarm/plan.md`
3. Delegate implementation to swarm-coder
4. Run QA gates (swarm-reviewer + swarm-test-engineer)
5. Mark tasks complete

## Agents

| Agent | Role | Tools |
|-------|------|-------|
| swarm-architect | Orchestrator — plans, delegates, runs gates | Read, Glob, Grep, Bash, Task |
| swarm-coder | Implementation — writes code | Read, Write, Edit, Bash |
| swarm-reviewer | Code review — APPROVED/REJECTED | Read, Glob, Grep |
| swarm-test-engineer | Test generation + execution | Read, Write, Bash |
| swarm-critic | Plan review — APPROVED/NEEDS_REVISION | Read, Glob, Grep |
| swarm-explorer | Codebase analysis | Read, Glob, Grep, Bash |
| swarm-sme | Domain expertise | Read, Glob, Grep |
| swarm-docs | Documentation updates | Read, Write, Edit |
| swarm-designer | UI/UX scaffolding | Read, Write, Glob |

## Hooks

The adapter installs 7 lifecycle hooks:

- **SessionStart**: Initializes swarm state, injects context from `.swarm/context.md`
- **PreToolUse**: Tracks tool invocations, emits telemetry
- **PostToolUse**: Tracks file modifications
- **UserPromptSubmit**: Injects current task context from `.swarm/plan.md`
- **Stop**: Emits session-end telemetry
- **SubagentStop**: Tracks delegation completion
- **PreCompact**: Logs compaction events

## State Files

The adapter reads and writes to `.swarm/`:

| File | Purpose |
|------|---------|
| `.swarm/plan.json` | Task plan with statuses |
| `.swarm/plan.md` | Human-readable plan |
| `.swarm/context.md` | Decisions, patterns, SME cache |
| `.swarm/evidence/` | QA gate evidence per task |
| `.swarm/session/state.json` | Session state snapshot |
| `.swarm/state-cache.json` | Mtime-based state cache |
| `.swarm/events-{sessionId}.jsonl` | Telemetry event log |

## Requirements

- Claude Code (latest)
- Bun >= 1.0 (for running hook scripts)
- Node.js >= 18 (for TypeScript execution)

## License

MIT

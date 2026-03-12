# Getting Started

This page answers the two questions new users hit most often:

1. "How do I actually use Swarm?"
2. "Why did the second run behave differently from the first one?"

## How to use Swarm

You must explicitly choose a Swarm architect in the OpenCode GUI before starting. The architect names shown in OpenCode come from your config file, so they may differ from the defaults and you can define multiple architects with different model assignments. If you use the default OpenCode `Build` / `Plan` options instead of selecting a Swarm architect, the plugin is bypassed entirely.

Once you select a Swarm architect, you do **not** manually operate its internal sub-agents.

Normal workflow:

1. start OpenCode in your project: `opencode`
2. **Select a Swarm architect** from the agent/mode dropdown in the OpenCode GUI — do **not** use the default `Build` or `Plan` modes, those bypass the plugin entirely
3. verify Swarm once with:
   - `/swarm diagnose`
   - `/swarm agents`
   - `/swarm config`
4. describe the work you want done
5. monitor progress with:
   - `/swarm status`
   - `/swarm plan`
   - `/swarm evidence`

## What "Swarm activates automatically" means

After you select a Swarm architect in the OpenCode GUI, the plugin hooks into your session automatically.

It does **not** mean:
- you should manually switch between internal agents
- every run will start from the same phase
- Swarm always redoes discovery/planning from scratch

## Why the second run may look different

Swarm persists project state in `.swarm/`.

If a prior run already created `.swarm/plan.md`, the architect can resume immediately and continue execution.

That is expected behavior.

## How to tell what Swarm is doing right now

Run:

```text
/swarm status
```

Useful follow-ups:

```text
/swarm plan
/swarm history
/swarm agents
/swarm config
```

## How to restart from scratch

If you intentionally want to discard current Swarm state for this project:

```text
/swarm reset --confirm
```

## Config file locations

Global:

```text
~/.config/opencode/opencode-swarm.json
```

Project:

```text
.opencode/opencode-swarm.json
```

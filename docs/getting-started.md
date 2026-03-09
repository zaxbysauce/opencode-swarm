# Getting Started

This page answers the two questions new users hit most often:

1. "How do I actually use Swarm?"
2. "Why did the second run behave differently from the first one?"

## How to use Swarm

You do **not** manually operate Swarm's internal agents.

Normal workflow:

1. start OpenCode in your project
2. verify Swarm once with:
   - `/swarm diagnose`
   - `/swarm agents`
   - `/swarm config`
3. describe the work you want done
4. monitor progress with:
   - `/swarm status`
   - `/swarm plan`
   - `/swarm evidence`

## What "Swarm activates automatically" means

It means the plugin hooks into your OpenCode session automatically.

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

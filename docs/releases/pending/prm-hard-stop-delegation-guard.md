# PRM hard stop no longer fires on non-swarm agents

The PRM hard stop enforcement in `toolBefore` now gates on `delegationActive`,
matching the detection side in `src/prm/index.ts`. Previously, any session with
`prmHardStopPending: true` would be blocked regardless of whether it was a
swarm-delegated agent. This caused false hard stops on non-swarm agents (e.g.
custom build agents) sharing the same opencode desktop process when a concurrent
swarm session had triggered PRM escalation.

**What changed:** Added `&& prmSession.delegationActive` to the PRM hard stop
check in `src/hooks/guardrails.ts`. Non-delegated sessions (architect, non-swarm
agents) are no longer affected by PRM escalation state.

**Workaround (no longer needed):** Setting `"prm": { "escalation_enabled": false }`
in `.opencode/opencode-swarm.json` was the previous workaround and can now be
removed.

Fixes #942.

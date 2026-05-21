# PRM hard stop no longer fires on non-swarm agents or native OpenCode agents

The PRM hard stop enforcement in `toolBefore` now runs **after** `resolveSessionAndWindow`
so that architect sessions and native OpenCode agents (build, plan, general, explore,
compaction, title, summary) are exempted before the PRM check fires. Previously,
`delegation-tracker.ts` set `delegationActive=true` for all non-architect agents including
native ones, causing native agents to incorrectly hit the PRM hard stop when another
concurrent swarm session had triggered PRM escalation.

**What changed:**
- `resolveSessionAndWindow` is now called **before** the PRM hard stop check in
  `src/hooks/guardrails.ts`. It returns `null` for architect sessions and native
  OpenCode agents, causing an early return before the PRM check can fire.
- Added `&& prmSession.delegationActive` as a secondary guard so that even if
  `resolveSessionAndWindow` were refactored, non-delegated swarm sessions would
  still be protected. Fixes #942.
- Replaced hardcoded `/tmp/test.txt` paths in tests with `path.join(os.tmpdir(), 'test.txt')`
  for cross-platform compatibility.
- Added regression test covering native OpenCode agent with `delegationActive=true`
  to prevent future regression. Fixes #943.

**Workaround (no longer needed):** Setting `"prm": { "escalation_enabled": false }`
in `.opencode/opencode-swarm.json` was the previous workaround and can now be
removed.

Fixes #942, #943.

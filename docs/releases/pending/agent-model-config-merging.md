# Agent model configuration merging fix

## Problem
When users configured agent models using the top-level `agents` field in their config while also having a `swarms` section defined, the top-level agent configurations were silently ignored. This happened because `createAgents()` would enter swarms mode when swarms were configured, bypassing the fallback logic for top-level agents.

### Root Cause
- The schema accepts `agents` at the top level (`src/config/schema.ts:1757`)
- `createAgents()` checks `config?.swarms` and uses swarms mode exclusively if present
- Top-level `agents` config was never merged into swarm-specific agent configs
- Users expected top-level agents to work even when swarms were configured

## Solution
Updated `createAgents()` in `src/agents/index.ts` to merge top-level `agents` into the default swarm's agent configuration when both are present. Swarm-specific agent configs take precedence (more specific configuration wins).

### Key Changes
1. When processing the default swarm in multi-swarms mode, merge top-level `agents` into `swarmConfig.agents`
2. Use object spread to ensure swarm-specific configs override top-level configs
3. Added regression tests to prevent recurrence

### Migration Required
Users with both top-level `agents` and `swarms` in their config no longer need the workaround of duplicating agent configs in `swarms.default.agents`. The top-level configuration is now automatically merged.

No migration needed if you only have:
- Top-level `agents` (already worked)
- Only `swarms` with agent overrides (already worked)
- Both (now fixed; previously top-level agents were ignored)

### Testing
- Added test: "merges top-level agents with default swarm agents config (swarm-specific takes precedence)"
- Added test: "top-level agents are respected when swarms config exists with default swarm"
- All 35 agent factory tests pass
- No regressions in existing test suite

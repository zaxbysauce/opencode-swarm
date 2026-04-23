# PR 1 — Dark Foundation for Stacked Parallelization

## Purpose

This document records what is dark now, what is deferred to PR 2 and PR 3, and why runtime behavior remains unchanged after this PR lands.

---

## What is dark in PR 1

| Item | Location | Status |
|------|----------|--------|
| `parallelization` config block | `src/config/schema.ts` — `ParallelizationConfigSchema` | Dark: field exists, defaults all produce single-run behavior |
| Evidence lock helper | `src/evidence/lock.ts` — `withEvidenceLock` | Active: wired around every evidence read-modify-write path |
| `AgentRunContext` class | `src/state/agent-run-context.ts` | Dark: class exists, `defaultRunContext` backs existing `swarmState` facade |
| `getRunContext()` API | `src/state.ts` | Dark: returns `defaultRunContext` for all callers; no parallel contexts created |
| `retryCasWithBackoff` helper | `src/plan/manager.ts` | Active: replaces the old fixed-interval retry loop; behavior-compatible |
| Dispatcher types | `src/parallel/dispatcher/types.ts` | Dark: type-only, not imported by production code |
| `NoopDispatcher` | `src/parallel/dispatcher/noop-dispatcher.ts` | Dark: always returns `reject` / `parallelization_disabled` |
| Dispatcher barrel | `src/parallel/dispatcher/index.ts` | Dark: not imported by production code |

---

## What is deferred to PR 2 (runtime Stage B parallelism)

- Wiring `parallelization.enabled` into any runtime execution branch
- Activating `maxConcurrentTasks > 1` scheduling
- Pool management, worker threads, subprocess pools
- Dispatcher registration into the production orchestration path

## What is deferred to PR 3 (architect-facing concurrency controls)

- `execution_profile` persistence in plan schema
- Per-plan `parallelization` overrides surfaced to the architect
- Plan-scoped concurrency budget propagation
- Council-aware parallel dispatch

---

## Why runtime behavior is unchanged

All new config fields have defaults that produce exactly single-run behavior:

```ts
ParallelizationConfigSchema defaults:
  enabled: false          // no live parallel paths can activate
  maxConcurrentTasks: 1   // serial execution (current behavior)
  evidenceLockTimeoutMs: 60000  // timeout for evidence locks (locking itself is safe to add)
```

No production import path reaches `createNoopDispatcher` or any `AgentRunContext`-specific isolation logic. The `swarmState` facade delegates to `defaultRunContext`, so all existing call sites continue to function without modification.

Evidence locking (`withEvidenceLock`) is an additive safety layer. It wraps existing read-modify-write paths and preserves their temp-file-plus-rename semantics. A single-writer workload acquires the lock, performs the write, and releases it — behavioral outcome is identical to the pre-lock path.

The CAS backoff change in `retryCasWithBackoff` replaces a fixed-interval loop with an exponential-backoff loop with jitter. The final failure mode remains `PlanConcurrentModificationError`, unchanged.

---

## Process-global variable audit (`src/state.ts`)

The following variables in `src/state.ts` are classified for future isolation work:

| Variable | Classification | Rationale |
|----------|---------------|-----------|
| `swarmState.activeToolCalls` | isolate later | Per-run tool tracking; moved to `AgentRunContext` in PR 1 |
| `swarmState.toolAggregates` | intentionally global | Process-wide aggregate stats; shared across all runs by design |
| `swarmState.activeAgent` | isolate later | Per-session; moved to `AgentRunContext` in PR 1 |
| `swarmState.delegationChains` | isolate later | Per-session; moved to `AgentRunContext` in PR 1 |
| `swarmState.agentSessions` | isolate later | Per-session guardrail state; moved to `AgentRunContext` in PR 1 |
| `swarmState.environmentProfiles` | isolate later | Per-session environment; moved to `AgentRunContext` in PR 1 |
| `swarmState.opencodeClient` | intentionally global | SDK singleton; shared across all sessions |
| `swarmState.curatorInitAgentNames` | intentionally global | Set at plugin init; shared config |
| `swarmState.curatorPhaseAgentNames` | intentionally global | Set at plugin init; shared config |
| `swarmState.lastBudgetPct` | defer | Context-budget tracking; defer isolation until budget is per-run |
| `swarmState.pendingEvents` | defer | Flush counter; defer until event bus is per-run |
| `swarmState.pendingRehydrations` | defer | Session rehydration set; defer until session lifecycle is per-run |
| `swarmState.fullAutoEnabledInConfig` | intentionally global | Config flag; set once at init |
| `_rehydrationCache` | defer | Process-lifetime plan cache; defer until multi-plan support needed |
| `_councilDisagreementWarned` | intentionally global | Warn-once memo; intentionally process-global |
| `recoveryMutexes` (plan/manager.ts) | defer | In-process mutex map; defer until recovery path is per-run |
| `startupLedgerCheckedWorkspaces` (plan/manager.ts) | intentionally global | Startup check memo; process-global by design |

---

## Verification

After this PR, the following invariants are verifiable:

1. `bun run typecheck` passes with no new errors.
2. `bun run lint` passes with no new warnings.
3. `grep -rn "parallelization" src/ | grep -v "config\|parallel\|__tests__\|test"` returns only config-related hits.
4. `rg -n "from ['\"].*dispatcher" src/ | grep -v "dispatcher/" | grep -v "__tests__"` returns empty.
5. Default config parse of `{}` yields `parallelization === undefined` (field is optional; no live branching on it).

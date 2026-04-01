# Plan Durability Model

## Overview

**v6.42.0** introduced a durable plan durability model that provides crash recovery, audit logging, and corruption isolation for the swarm planning system. The core principle: the ledger is authoritative; projections are derived and can be rebuilt at any time.

## File Roles

| File | Purpose | Authority |
|------|---------|-----------|
| `.swarm/plan-ledger.jsonl` | Durable runtime record of all plan events | **Authoritative** — append-only, never delete |
| `.swarm/plan.json` | Machine-readable projection of current plan state | Derived — can be rebuilt from ledger |
| `.swarm/plan.md` | Human-readable plan view | Derived — generated from plan.json |
| `SWARM_PLAN.md` | Operator checkpoint artifact | Export-only — not live source of truth |
| `SWARM_PLAN.json` | Machine-readable checkpoint artifact | Export-only — for import/export workflows |

### Ledger Event Types

```json
{"type":"plan_created","phase":1,"data":{...},"ts":"ISO8601"}
{"type":"task_added","taskId":"1.1","data":{...},"ts":"ISO8601"}
{"type":"task_updated","taskId":"1.1","status":"completed","ts":"ISO8601"}
{"type":"task_status_changed","taskId":"1.1","status":"completed","ts":"ISO8601"}
{"type":"task_reordered","taskId":"1.1","afterTaskId":"1.2","ts":"ISO8601"}
{"type":"phase_completed","phase":1,"ts":"ISO8601"}
{"type":"snapshot","data":{"plan":{...},"payload_hash":"abc123"},"ts":"ISO8601"}
{"type":"plan_rebuilt","ts":"ISO8601"}
{"type":"plan_exported","path":"SWARM_PLAN.json","ts":"ISO8601"}
{"type":"plan_reset","ts":"ISO8601"}
```

## Rebuild / Import / Export

### Rebuild

`loadPlan()` detects a hash mismatch between the ledger and plan.json → replays all ledger events → writes fresh projections.

```
loadPlan()
  → computeLedgerHash() vs stored hash
  → if mismatch: replayLedger() → savePlan() → write plan.json + plan.md
```

### Import

`importCheckpoint()` reads `SWARM_PLAN.json` → validates schema → calls `savePlan()` → appends `plan_rebuilt` event to ledger.

```
importCheckpoint(SWARM_PLAN.json)
  → validateSchema()
  → savePlan(planData)
  → append {type:"plan_rebuilt"} to plan-ledger.jsonl
```

### Export

`writeCheckpoint()` is called on:
- `save_plan` command
- `phase_complete` command  
- `/swarm close` command

Writes `SWARM_PLAN.md` and `SWARM_PLAN.json` to the working directory.

## Snapshot System

Every **50 ledger events** and on `phase_complete`, a `snapshot` event is appended to the ledger itself:

```json
{"type":"snapshot","data":{"plan":{...},"payload_hash":"abc123"},"ts":"ISO8601"}
```

Snapshot events embed the full Plan payload and its `payload_hash`. During `loadPlan()`, `replayFromLedger()` scans for the latest snapshot event and uses it as the base state, then replays only events after that snapshot. This avoids replaying the entire ledger on every load.

## Corruption Handling

If a ledger entry fails validation:

1. The bad suffix is **quarantined** to `.swarm/plan-ledger.quarantine`
2. Replay continues from the last valid event

```
.swarm/plan-ledger.jsonl      ← continues with clean events
.swarm/plan-ledger.quarantine ← bad entries isolated (never replayed)
```

## Migration from v6.41.x

**No action required.**

On first `savePlan()` call in v6.42.0+, the ledger is created automatically:

- If no `.swarm/plan-ledger.jsonl` exists → initialize with `plan_created` event
- Existing `.swarm/plan.json` is used as the baseline state
- Hash is computed and stored for subsequent consistency checks

No data is lost, no manual migration steps needed.

## Quick Reference

| Operation | Command / Trigger |
|-----------|-------------------|
| Save plan | Automatic on plan changes |
| Export checkpoint | `/swarm close`, `save_plan`, `phase_complete` |
| Import checkpoint | `importCheckpoint()` function |
| Rebuild from ledger | Automatic on hash mismatch |
| View ledger | `cat .swarm/plan-ledger.jsonl` |

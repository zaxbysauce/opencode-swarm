# Durable Gate Evidence Consistency

## What changed

- Evidence summary, diagnose, and preflight now recognize durable gate evidence stored at `.swarm/evidence/<task-id>.json`.
- Completed tasks with durable gate evidence no longer appear as missing evidence when no legacy evidence bundle directory exists.
- Evidence summary now treats `required_gates` as authoritative, including non-review/test gates such as `critic`, `sme`, or `docs`.

## Why

`update_task_status` already accepts completed tasks when durable gate evidence proves all required QA gates passed. Other evidence surfaces still only counted legacy bundle evidence, so a task could be successfully completed but later reported as missing evidence by `evidence summary`, `diagnose`, or `preflight`.

## Migration steps

- No migration required. Existing durable gate evidence files are read in place.

## Breaking changes

- None.

## Known caveats

- Legacy evidence bundles remain supported. Durable gate evidence is used as an additional source of truth for gate completion consistency.

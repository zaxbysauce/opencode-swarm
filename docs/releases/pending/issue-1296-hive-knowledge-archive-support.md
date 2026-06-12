# Hive-tier support for knowledge_archive tool

## Summary

The `knowledge_archive` tool now supports archiving, quarantining, and purging entries from the hive tier (cross-project shared knowledge store), in addition to swarm-tier (project-local) entries. Bad lessons that reach the hive have the widest blast radius across all projects on the machine; this change enables remediation without manual JSONL file edits.

## Changes

### New `tier` argument on `knowledge_archive`

- `knowledge_archive { id, reason, tier: 'swarm' | 'hive' }`
- Default: `tier: 'swarm'` (backward compatible)
- When `tier: 'hive'`: archives/quarantines/purges from the shared hive knowledge store
- Audit tombstone records `tier` field for traceability

### Behavioral guarantees

- `knowledge_archive { id, tier: 'hive', reason }` archives a hive entry; it disappears from `searchKnowledge` results (existing archived filter already handles both tiers)
- Status transitions (archive/quarantine/purge) work identically for hive and swarm
- Purge operation requires `allow_purge: true` for both tiers
- Swarm-tier behavior unchanged; default remains 'swarm'

## Precedent

The knowledge escalator (`src/hooks/knowledge-escalator.ts`) already mutates hive entries atomically via `transactKnowledge`, establishing the pattern this implementation follows.

## Acceptance

All tools can now remediate cross-project bad lessons:
- Architects using `knowledge_archive { id, tier: 'hive', reason }` immediately quarantine or archive bad hive entries
- No hand-editing of XDG data directories required
- Audit trail captures which entries were remediated at which tier

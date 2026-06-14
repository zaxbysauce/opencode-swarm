# Generated Skills

Generated skills turn mature knowledge entries into reviewable `SKILL.md`
files that agents can load through the normal skill system.

## Lifecycle

1. Knowledge starts as swarm or hive entries in the knowledge store.
2. Event-sourced feedback records whether the entry was shown, acknowledged,
   applied, ignored, violated, or followed by a successful phase.
3. `skill_generate` and `skill_improve` select candidates using confirmations
   plus effective outcome rollups. Strong positive outcomes can mature a
   singleton; clearly negative outcome signal blocks compilation.
4. Drafts are written under `.swarm/skills/proposals/`.
5. `skill_apply` promotes a reviewed draft to
   `.opencode/skills/generated/<slug>/SKILL.md`.

Generated skills are never activated automatically. A human or architect must
review and apply the draft.

## File Layout

```text
.swarm/skills/proposals/<slug>.md
.opencode/skills/generated/<slug>/SKILL.md
```

Active generated skills include a generator marker comment. `skill_apply`
refuses to overwrite an active skill that lacks that marker unless `force=true`
is passed.

## Review Checklist

- Confirm the source knowledge IDs still match the intended behavior.
- Check that required and forbidden actions are concrete enough for an agent to
  follow.
- Remove stale project-specific references before applying a cross-project
  skill.
- Prefer a narrow skill over broad procedural advice when only one workflow is
  supported by evidence.

## Related Docs

- [Knowledge System](knowledge.md) - storage, lifecycle, scoring, and curation
- [Writing Tests Skill](../.opencode/skills/writing-tests/SKILL.md) - test
  authoring rules for generated-skill changes

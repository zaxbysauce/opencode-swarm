# Tie multiple swarms together with a shared knowledge "link"

## What

Adds a third, opt-in knowledge tier that sits between the per-worktree **swarm**
store (`.swarm/knowledge.jsonl`) and the global **hive** store. Several swarms
working on the same project — typically separate git worktrees — can now pool
their lessons into one shared store instead of each keeping an isolated
`.swarm/knowledge.jsonl` that the others can't see.

New commands:
- `/swarm link` — tie this worktree to a shared store using the project hash
  (so every worktree of the same repo agrees on the same store by default).
- `/swarm link <name>` — tie via an explicit shared name; use the same name in
  each worktree (or in deliberately "similar" but separate repos) to pool them.
- `/swarm link status` — show whether this worktree shares knowledge, and where.
- `/swarm unlink [--no-copy]` — stop sharing and return to the local store. By
  default the shared lessons are copied back into the local store (deduped) so
  nothing is lost; `--no-copy` skips the copy-back.

How it works:
- An opt-in pointer file `<worktree>/.swarm/link.json` declares membership. When
  it is active, the swarm knowledge *family* (store, events, rejected,
  retractions, counter baseline, quarantine, unactionable, legacy application
  log) redirects from `<worktree>/.swarm` to a shared directory
  `<dataDir>/links/<linkId>/`, co-located with the hive store. All existing
  retrieval, curation, sweep, and hive-promotion machinery then operates on the
  shared store unchanged — so the pooled store stays curated and pruned exactly
  like a per-worktree store.
- On link, the worktree's existing local lessons are merged (deduplicated by id
  and near-duplicate lesson) into the shared store.
- Per-worktree, phase-local bookkeeping is intentionally **not** shared:
  `.knowledge-shown.json`, `plan.json`, evidence, and session state stay local.
- Auto-detect + manual confirm: at session start, if the repo has more than one
  git worktree and this worktree is unlinked, a one-time, non-blocking
  suggestion to run `/swarm link` is printed. Sharing is never enabled
  automatically — the user always confirms with `/swarm link`.

## Why

The hive tier is global to every project on the machine and is intentionally
promotion-gated; it is the wrong place for "the lessons this one project's
parallel swarms are learning right now." Worktrees of one repo each root their
`.swarm/` at their own directory, so three swarms on three worktrees generated
three disjoint knowledge stores with no shared visibility. The link tier fills
that gap with an explicit, user-controlled grouping.

## Migration

No breaking changes; the feature is opt-in.
- Unlinked behavior is byte-identical to before: every redirected resolver
  returns the same `<directory>/.swarm/...` path it did previously when no
  pointer is present.
- The shared store lives in the platform data dir (like the hive), not under the
  repo, so `.swarm/` containment is preserved. Only the small `link.json`
  pointer lives in the project-root `.swarm/`.

## Caveats

- The resolver reads the `link.json` pointer through a short-TTL (2 s),
  FIFO-bounded in-process cache, so a `/swarm link` or `/swarm unlink` performed
  in one process is picked up by a concurrently running peer process within the
  TTL window (in-process changes are reflected immediately via cache
  invalidation).
- Merge-on-link migrates the *lessons* (knowledge.jsonl entries), not their
  accumulated outcome-history counters (shown/applied/violated, which live in the
  events log + counter baseline). A merged lesson keeps its text but its ranking
  counters start fresh in the shared store and re-accrue as the linked swarms
  run. This is a one-time, self-healing ranking effect on an opt-in action; no
  lesson data is lost. The link command output notes this.
- The full shared store is pooled, including unvalidated candidate lessons; the
  existing curator/sweep prunes low-value entries over time, and the FIFO cap now
  applies to the pooled store.

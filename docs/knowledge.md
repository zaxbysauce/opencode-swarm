# Knowledge System

Swarm tracks two kinds of knowledge:

- **Swarm knowledge** — project-specific lessons learned during a session. Lives in `.swarm/knowledge.jsonl`.
- **Hive knowledge** — evergreen lessons that have been confirmed across projects. Lives in your user data directory.

When an architect receives a new message, entries from both stores are merged and deduplicated before injection.

---

## Storage Locations

### Swarm (per-project)

```
.swarm/knowledge.jsonl            # active entries
.swarm/knowledge-rejected.jsonl   # entries that failed validation
```

### Hive (cross-project)

Resolved platform-specifically:

| Platform | Path |
|----------|------|
| Linux | `$XDG_DATA_HOME/opencode-swarm/shared-learnings.jsonl` (default `~/.local/share/opencode-swarm/`) |
| macOS | `~/Library/Application Support/opencode-swarm/shared-learnings.jsonl` |
| Windows | `%LOCALAPPDATA%\opencode-swarm\Data\shared-learnings.jsonl` |

Rejected hive lessons: `shared-learnings-rejected.jsonl` next to the main file.

---

## Entry Schema

Every entry is a JSON line with these fields (see `src/hooks/knowledge-types.ts`):

```json
{
  "id": "lesson-abc123",
  "tier": "swarm",
  "lesson": "Prefer stream.Readable.from(generator) over async iterators for backpressure.",
  "category": "pattern",
  "tags": ["node", "streams"],
  "scope": "global",
  "confidence": 0.9,
  "status": "active",
  "confirmed_by": ["..."],
  "retrieval_outcomes": [],
  "phases_alive": 0,
  "max_phases": 10
}
```

Swarm entries add `project_name` and a `PhaseConfirmationRecord[]`. Hive entries add `source_project` and `encounter_score`.

---

## Lifecycle

### Creation

Entries can be created four ways:

1. **Agents write via `knowledge_add` tool** — normal flow during a phase.
2. **Manual: `/swarm promote "<lesson>"`** — write directly to hive.
3. **Curator recommends** — LLM-driven promotions from the curator agent.
4. **Migration: `/swarm knowledge migrate`** — one-time import from legacy `.swarm/context.md`.

### Promotion (swarm → hive)

Three routes in `checkHivePromotions()`:

| Route | Trigger |
|-------|---------|
| Explicit | `hive_eligible=true` AND ≥3 distinct phases confirmed |
| Fast-track | Entry tagged `hive-fast-track` (bypasses phase count) |
| Age-based | Entry age ≥ `auto_promote_days` (default 90) |

Manual: `/swarm promote --from-swarm <id>`.

### Quarantine / Restore

Quarantined entries are hidden from queries but preserved:

```bash
/swarm knowledge quarantine lesson-abc123 "false positive"
/swarm knowledge restore lesson-abc123
```

### Expiration (N-phase TTL decay)

At every successful phase completion, `sweepAgedEntries()` runs:

1. Increments `phases_alive` on all active entries.
2. Archives entries whose `phases_alive > max_phases`.
3. TTLs: `default_max_phases` (10) for most, `todo_max_phases` (3) for `todo`-category entries.
4. **Promoted entries are TTL-exempt** — they live until explicitly quarantined.

TODO entries are *removed*, not archived, after their TTL.

---

## Query and Injection

Knowledge is injected into the architect's prompt at phase start via `createKnowledgeInjectorHook()`. The reader merges swarm + hive with near-duplicate removal (Jaccard bigram similarity).

**Injection budget** adapts to available context:

| Context headroom | Regime |
|------------------|--------|
| >60% | Full budget — up to `max_inject_count` entries, `inject_char_budget` chars |
| 20–60% | Half — half the entries, half the chars |
| 5–20% | Quarter — minimal injection |
| <5% | Skipped |

Defaults:

- `max_inject_count`: 5 entries
- `inject_char_budget`: 2000 chars total
- `max_lesson_display_chars`: 120 chars per lesson (truncation only; stored text unchanged)
- `dedup_threshold`: 0.6

---

## Configuration

All keys live under `knowledge.*` in your config (see `src/config/schema.ts:804`):

| Key | Type | Default | Purpose |
|-----|------|:---:|---------|
| `enabled` | bool | `true` | Master switch |
| `swarm_max_entries` | int | 100 | FIFO cap per project |
| `hive_max_entries` | int | 200 | FIFO cap cross-project |
| `auto_promote_days` | int | 90 | Age threshold for auto-promotion |
| `max_inject_count` | int | 5 | Max entries per injection |
| `inject_char_budget` | int | 2000 | Total injection block size |
| `max_lesson_display_chars` | int | 120 | Per-lesson truncation |
| `dedup_threshold` | float | 0.6 | Near-duplicate detection |
| `scope_filter` | array | `["global"]` | Scope tags to include |
| `hive_enabled` | bool | `true` | Read/write hive knowledge |
| `validation_enabled` | bool | `true` | Run 3-layer validator |
| `evergreen_confidence` | float | 0.9 | Confidence threshold for evergreen |
| `evergreen_utility` | float | 0.8 | Utility score for evergreen |
| `low_utility_threshold` | float | 0.3 | Flag for removal at or below |
| `min_retrievals_for_utility` | int | 3 | Retrievals before utility scoring |
| `default_max_phases` | int | 10 | General TTL |
| `todo_max_phases` | int | 3 | TODO-category TTL |
| `same_project_weight` | float | 1.0 | Encounter score (source project) |
| `cross_project_weight` | float | 0.5 | Encounter score (other projects) |

---

## Migration

`/swarm knowledge migrate` imports from legacy `.swarm/context.md` into `.swarm/knowledge.jsonl`. Idempotent — a sentinel file `.swarm/.knowledge-migrated` prevents re-runs.

Legacy sections mapped into the new schema:

- `lessons-learned` → category `lesson`
- `patterns` → category `pattern`
- `sme-cache` → category `domain`
- `decisions` → category `decision`

Entries that fail schema validation are dropped. Near-duplicates are collapsed via the dedup threshold.

---

## Validation

Three layers enforce quality. An entry must pass all three or it lands in `-rejected.jsonl`:

1. **Structural** — length 15–280 chars, valid category, scope, confidence in [0,1].
2. **Content safety** — rejects dangerous commands (`rm -rf`, `mkfs`, `chmod 777`, `eval`, etc.) even in lesson text.
3. **Semantic** — flags vague lessons (no technical reference + no action verb) and contradictions with existing entries.

---

## Quality Signals

### Evergreen

Entries with `confidence ≥ 0.9` AND `utility_score ≥ 0.8` are marked evergreen. They survive curation sweeps without review.

### Low-utility

Calculated after `min_retrievals_for_utility` retrievals (default 3). Entries at or below `low_utility_threshold` (default 0.3) with `applied_count ≥ 5` are flagged for removal.

### Encounter score (hive-only)

Hive entries track an `encounter_score` weighted by project:

- Same project encounter: × `same_project_weight` (default 1.0)
- Cross-project encounter: × `cross_project_weight` (default 0.5)

This prevents one noisy project from dominating hive promotions.

---

## Commands

| Command | Purpose |
|---------|---------|
| `/swarm knowledge` | List active entries |
| `/swarm knowledge migrate` | Import legacy `.swarm/context.md` |
| `/swarm knowledge quarantine <id> [reason]` | Hide entry from queries |
| `/swarm knowledge restore <id>` | Un-quarantine an entry |
| `/swarm promote <text>` | Write new hive entry |
| `/swarm promote --from-swarm <id>` | Promote existing swarm entry |
| `/swarm curate` | Run curator review and hive promotion pass |

See [Commands Reference](commands.md) for full flag details.

---

## Related

- [Architecture Deep Dive](architecture.md) — knowledge in the control loop
- [Evidence and Telemetry](evidence-and-telemetry.md) — how retrieval outcomes feed utility scoring
- [Configuration Reference](configuration.md) — full `knowledge.*` schema

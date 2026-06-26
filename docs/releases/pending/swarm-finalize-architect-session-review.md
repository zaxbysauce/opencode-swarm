# Architect Session Review in `/swarm finalize`

The finalize command now includes an **architect session review** step that analyzes the entire swarm session and produces an actionable report surfaced directly in the finalize output.

## What changed

- Added `src/services/session-reflection.ts` — a two-phase session reflection service:
  - **Phase 1 (deterministic):** Gathers tool failure statistics, gate rejection counts, agent dispatch patterns, retro lessons, and error taxonomy from in-memory state and `.swarm/evidence/` bundles.
  - **Phase 2 (LLM):** Sends the gathered data to the architect via the skill-improver LLM delegate, with a system prompt asking for Problems Encountered, Tools That Didn't Work, Skill Recommendations, and Process Improvements. Falls back gracefully to a deterministic report if no LLM client is available.
- The architect report is surfaced **directly in the finalize return message** so it can be acted on immediately — not buried in an artifact.
- Report is only shown in the return message when there are actual signals (tool failures, gate rejections, retro lessons, or error taxonomy). Clean sessions produce no noise.
- `session-reflection.md` is written to `.swarm/` and included in the archive bundle.
- A 90-second timeout (`CLOSE_REFLECTION_TIMEOUT_MS`) with AbortController prevents the LLM call from hanging the finalize command indefinitely.

## Why

Previously, swarm sessions had no mechanism for the architect to review what happened across the entire session — which tools caused problems, which gates repeatedly failed, what patterns emerged — and report that back for immediate improvement. The skill-improve pipeline (knowledge → `skill_improver` → `skill_generate`) handles skill file updates, but there was no high-level architect retrospective. This fills that gap.

## Migration steps

No migration required. The feature is additive and fail-open: if the LLM delegate is unavailable, a deterministic report is generated instead. Existing finalize workflows are unaffected.

## Known caveats

- The LLM delegate used is the `skill_improver` agent (with an overridden system prompt for session reflection context). This is intentional reuse of existing infrastructure rather than a dedicated delegate.
- `session-reflection.md` is a single-session snapshot and is cleaned from `.swarm/` at the start of the next finalize (consistent with `events.jsonl`, `telemetry.jsonl`, etc.).

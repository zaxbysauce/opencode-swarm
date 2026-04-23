# SME Engagement Plan

Tracks which domains have been consulted for v6.9.0, what guidance they delivered, and which consultations are still pending.

## Completed
- **security** — Covered Phase 0 gate hardening, Tree-sitter sandboxing, offline SBOM/build execution, evidence integrity (checksums), gate lockfile non-bypassability. Notes saved in `.swarm/context.md` under the `security` SME cache entry.

## Planned
- **quality** — Before implementing `quality_budget`, consult to determine acceptable complexity/API/duplication deltas and how to surface them via `.swarm/quality.json`. Target: after Phase 0 decisions but before the metric calculations in Phase 6. Track the scheduled call in this document so Phase 6 cannot start until we capture the SME's thresholds.
- **tooling** — Prior to Phase 4 and Phase 5, confirm external toolchain detection strategies (manifest parsing, command discovery) with an SME focused on build/test tooling. This will help codify safe `build_check` behavior and inform the Phase 5 gate enforcement.

## Scheduling
- Quality SME target window: before the Phase 6 kickoff (ideally while Phase 0 wraps up). Record any proposed dates here.
- Tooling SME target: during the Phase 0/1 handoff so the `build_check` command discovery strategy can be validated before manifest parsing work begins.

## Phase 0 Task 0.5
- Update this document with confirmed dates, attendees, and the gate-specific questions for each SME. Phase 4/5 cannot progress until the tooling SME entry is populated, and Phase 6 cannot begin until the quality SME entry is recorded here.

## Scheduled Consultations
- **Quality SME (security/quality budget)** – Target: 2026-03-01, Owner: mega_architect, Required inputs: complexity/API/duplication bounds, translation to `.swarm/quality.json`. Status: scheduled; invitation sent.
- **Tooling SME (build/check)** – Target: 2026-03-03, Owner: mega_architect, Required inputs: manifest detection order, fallback command strategy, and incremental toolchain checks. Status: scheduled; awaiting confirmation.

## Format
- Each engagement should cite the domain, prompt, summary, and any relevant files/outputs. Update this document and `.swarm/context.md` with the SME guidance immediately after the call.

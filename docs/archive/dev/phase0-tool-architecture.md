# Phase 0 Tool Architecture

Establishing the baseline for v6.9.0 means understanding the hooks that drive every gated tool, how evidence is stored, and how the CI gate consumes those signals.

## Tool Interface Contract

- All tools live under `src/tools/*` and are re-exported from `src/tools/index.ts`, which lets the architect, background workers, and automated runners import them consistently (see the existing exports for `secretscan`, `lint`, `diff`, `imports`, `test_runner`, etc.).
- Each tool exposes a Bun-friendly async function that takes structured arguments (`changed_files`, directories, mode flags, etc.) and returns a normalized JSON payload containing at least:
  - `verdict` (pass/fail/skip semantics),
  - `summary` (aggregate counts),
  - `findings`/`runs`/`files` (depending on the tool),
  - optional metadata (`rule_id`, `language`, `duration_ms`).
- Tools register themselves in the gate via evidence entries and prompt instructions; `secretscan` already demonstrates the `FINDINGS → return to coder. NO FINDINGS → reviewer` branching language we must replicate for every new gate.

## Evidence Schema & Storage

- Evidence bundles persist under `.swarm/evidence/<task>/evidence.json` through `src/evidence/manager.ts`. Each save operation validates the task ID, enforces the 500 KB bundle limit, and writes atomically (temp file + rename) to prevent partial uploads.
- The schema lives in `src/config/evidence-schema.ts`, where `EvidenceType` currently covers `review`, `test`, `diff`, `approval`, `note`, and `retrospective`. We will need to extend that discriminated union with the new types (`syntax`, `placeholder`, `sast`, `sbom`, `build`, `quality_budget`) so the aggregator and benchmark CLI can parse them without schema errors.
- During Phase 0 we should produce stub Zod definitions for each new type (e.g., `syntaxEvidenceSchema = BaseEvidenceSchema.extend({ type: z.literal('syntax'), details: z.unknown() })`). Later phases can replace `details` with typed structures once the tool contracts crystallize, and these stubs should be documented in this file so future work knows where to extend.
- Evidence entries feed both the prompt gating logic (via `phase`, `task_id`, `verdict`) and `/swarm benchmark --ci-gate` quality signals.

## CI Gate Consumption

- `src/commands/benchmark.ts` defines the existing CI gate: a `CI` constant with hardcoded thresholds (review pass rate ≥ 70%, test pass rate ≥ 80%, agent error rate ≤ 20%, hard limit hits ≤ 1) and an output that mixes agent health, tool performance, delegation counts, quality signals, and a `ci_gate` section. The CLI already supports `--ci-gate` to emit a `PASSED`/`FAILED` row.
- The cumulative quality section reads every evidence bundle (`listEvidenceTaskIds` + `loadEvidence`), aggregates reviews/tests/diff stats, and compares them against the thresholds. We'll need to widen this aggregation to include the new tools (e.g., `quality_budget` deltas, `build_check` passes/fails) and make the thresholds configurable per `opencode-swarm` config.
- Downstream consumers (e.g., release scripts, `/swarm benchmark --ci-gate`) expect the JSON block at the bottom of the output (`[BENCHMARK_JSON]...[/BENCHMARK_JSON]`), so ensure any new checks return deterministic numeric values and operators.

## Gate Hardening & Fallback Strategy

- Introduce a `gate.lock` artifact (e.g., `.swarm/gate.lock`) that records the fingerprint of the last approved tool run and the evidence bundle checksums. Any mismatch forces the architect to rerun the gate rather than proceeding to reviewer or reviewer bypass.
- Feature-flag each new tool and record the flag's config path/default beside the lockfile so we can toggle them safely. Suggested names (with default = true unless noted otherwise) living under `src/config/schema.ts`:
  - `syntax_check.enabled` (true)
  - `placeholder_scan.enabled` (true)
  - `sast_scan.enabled` (true)
  - `build_check.enabled` (true)
  - `sbom_generate.enabled` (true)
  - `quality_budget.enabled` (true)
  - `quality_budget.enforce_on_globs` (e.g., `src/**`)
  Each flag should be documented in the config schema so the CLI can expose them and the gate can disable a tool without losing the evidence trail.

- Mirror these metrics in the new `gates` section of `src/config/schema.ts` so runtime flags, default values, and optional metadata live next to the other plugin feature flags.
- Plan for Tree-sitter runtime choices (e.g., `tree-sitter` vs. `web-tree-sitter`) and bundling strategy (WASM vs. native) so Phase 1 implementers know whether to ship prebuilt grammars or compile them on the fly; document those decisions in this file or a linked architecture note.
- Provide a fallback path for parser hang/failure: record a `skipped_reason` when Tree-sitter fails (e.g., invalid binary) and optionally fall back to a lightweight regex scan. The fallback must still emit evidence so the gate can explain why the strict check was skipped.
- Tool executions should enforce resource/time caps (e.g., 5s per file, limited heap) and sanitize inputs (reject binaries, non-text files) to prevent ReDoS or parser crashes from destabilizing the swarm.

This document is the shared reference for Phase 0. Keep it in sync with the evolving architecture notes and link it from the broader plan doc once the baseline is stable.

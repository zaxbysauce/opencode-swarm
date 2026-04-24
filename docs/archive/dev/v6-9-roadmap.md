# v6.9.0 Roadmap

This companion document details Stages 1-8 of the v6.9.0 initiative. Stage 0 is covered in `docs/dev/phase0-execution-plan.md`; the remaining stages describe the implementation of the new quality/anti-slop tooling.

## Stage 1 | syntax_check Gate
- Build & test Tree-sitter runtime + parser loader for the selected languages.
- Implement tool contract (verdict/files/summary) and evidence output.
- Wire gate into `ARCHITECT_PROMPT` with anti-bypass tests.
- Finalize the `syntax` evidence stub by replacing `details: z.unknown()` with typed `errors[]`/`skipped_reason` fields that mirror the parser output.

## Stage 2 | placeholder_scan Gate
- Define placeholder policy config (enabled, deny_patterns, allow_globs, max findings).
- Implement Tree-sitter-driven placeholder scanner with fallback heuristics.
- Update gate sequence to require placeholder_scan before `imports`.
- Replace the `placeholder` evidence stub with the typed `findings[]` structure (path, line, kind, excerpt, rule_id) once the tool contract is stable.

## Stage 3 | sast_scan Gate
- Create Tier-A rule engine (Tree-sitter queries, heuristics) for high-signal patterns.
- Optionally invoke local `semgrep` (Tier B) when on PATH.
- Insert `sast_scan` after `secretscan` and block security reviewer on findings.
- Finalize the `sast` evidence schema by replacing `details` with typed `findings[]` plus severity/rule metadata that match the rule engine.

## Stage 4 | sbom_generate Evidence
- Detect/parse manifests/locks for Node/Python/Rust/Go/Java/.NET/Swift/Dart.
- Emit CycloneDX JSON and store under `.swarm/evidence/sbom/`.
- Capture artifacts during Stage 0 baseline and Stage 6 snapshots for benchmarking.
- Replace the `sbom` evidence stub with typed `components[]` and metadata once the parser output is defined.

## Stage 5 | build_check Gate
- Discover repo-native build/typecheck commands (scripts, manifests, toolchains).
- Implement `build_check` with `runs`, truncated outputs, and `verdict` semantics.
- Gate failures to return to coder; missing toolchains produce structured `skipped` results.
- Finalize the `build` evidence stub by replacing `details` with typed `runs[]`/`skipped_reason` data matching the actual command invocations.

## Stage 6 | quality_budget + CI Gate
- Add config for complexity/API/duplication/test deltas + enforce_on_globs.
- Emit `.swarm/quality.json` capturing delta metrics for changed files.
- Extend `/swarm benchmark --ci-gate` with new quality checks and thresholds.
- Replace the `quality_budget` evidence stub with typed metrics (complexity_delta, api_delta, duplication_ratio, test_to_code_ratio) before the CI gate consumes it.

## Stage 7 | QA Gate & Evidence Hardening
- Enumerate the full gate (diff → syntax_check → placeholder_scan → imports → lint fix/check → secretscan → sast_scan → build_check → reviewer → security reviewer → test_engineer/test_runner) using `secretscan` branching language.
- Extend evidence schema to include the new types and ensure the benchmark aggregator tolerates unknowns.

## Stage 8 | Documentation + Release
- README/Roadmap updates describing local-only tooling, Semgrep opt-in, and CI gate config.
- Version bump + changelog for v6.9.0 with upgrade guidance.

## Evidence Matrix
| Type | Core fields | Plan stage |
|------|-------------|------------|
| `syntax` | `verdict`, `files[]`, `errors[]`, `skipped_reason?` | Stage 1 |
| `placeholder` | `verdict`, `findings[] { path, line, kind, excerpt, rule_id }` | Stage 2 |
| `sast` | `verdict`, `findings[] { severity, rule_id, message, location }`, `engine` | Stage 3 |
| `sbom` | `verdict`, `components[] { name, version, type }`, `metadata` | Stage 4 |
| `build` | `verdict`, `runs[] { command, cwd, exit_code, stdout_tail, stderr_tail }`, `skipped_reason?` | Stage 5 |
| `quality_budget` | `verdict`, `complexity_delta`, `api_delta`, `duplication_ratio`, `test_to_code_ratio`, `thresholds` | Stage 6 |

- Refer to `opencode-swarm_phased-plan_quality-anti-slop.md` for the original sub-stage numbering (e.g., 1.2 = syntax_check implementation); the Stage numbers above align to those sub-stages as shown.

This roadmap is supplementary to the Phase 0 plan; implementation teams should reference both documents when working on downstream stages.

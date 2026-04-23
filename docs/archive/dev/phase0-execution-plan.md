# v6.9.0 Execution Plan (Phase 0)

This plan captures Stage 0 (Baseline Recon + Design Freeze) for v6.9.0 and ensures the new tooling slots into the existing Phase 5 QA gate. The numeric stages referenced in the downstream roadmap are tracked in `docs/dev/v6-9-roadmap.md` so there is no confusion with the current QA gate (also called Phase 5).

## Stage 0 | Baseline Recon + Design Freeze

- **0.1 Inventory the Phase 5 gate & tool framework**
  - Deliverable: `docs/dev/phase0-tool-architecture.md` (tool contract, evidence schema, CI-gate intake) documenting the current gate wiring and planned additions.
  - Acceptance: Clearly documents where `src/agents/architect.ts`, `src/tools/index.ts`, `src/evidence/*`, and `src/commands/benchmark.ts` coordinate tool wiring while articulating fallback strategies and feature flags (names/defaults/config paths) for each new tool, including the runtime flag-check contract (e.g., `if (!config.gates.syntax_check.enabled) return { verdict: 'skipped' }`).
- **0.2 Choose Tree-sitter runtime & bundling criteria**
  - Deliverable: Appendix in `docs/dev/phase0-tool-architecture.md` summarizing the runtime decision (e.g., `tree-sitter`, `web-tree-sitter`, or another Bun-compatible parser), Bun compatibility, grammar packaging (WASM vs prebuilt native), binary size, parse speed, maintenance risk, and the agreed grammar distribution plan (where grammars live, how they are versioned, and whether they are bundled or lazy-loaded) plus the benchmark harness `scripts/tree-sitter-benchmark.ts` with sample outputs produced from `examples/syntax-check/` files.
  - Acceptance: Decision matrix with candidates, criteria (compatibility, size, speed, maintenance), tie-breaker rule, and a mini-POC (via `scripts/tree-sitter-benchmark.ts` run with `bun run scripts/tree-sitter-benchmark.ts`) benchmarking `tree-sitter` vs. `web-tree-sitter` over JS/TS and Python files (sizes: 50, 500, 2000 lines). Capture cold parse time (<50ms for 500-line files, <200ms for 2000-line files), heap delta (<20MB), bundle size, and baseline memory usage. Document reversibility via a table (`Runtime`, `Estimated rework cost`, `Affected files`, `Migration complexity`) so we can quantify the cost if we must pivot. If both runtimes miss the thresholds, fall back to regex/diff-based syntax checking for Stage 1 while the runtime choice is scheduled for a post-Stage 1 revisit.
- **0.3 Finalize language coverage & parser metadata (depends: 0.2)**
  - Deliverable: `src/lang/registry.ts` (language ID, extensions, parser keys, comment nodes) plus consensus on Tree-sitter grammars for JS/TS, Python, Java, C, C++, C#, Go, Rust, PHP, HTML, CSS, Kotlin, Swift, Dart, as well as an `src/lang/index.ts` barrel export so the registry can be imported consistently.
  - Acceptance: Documented mapping, loader architecture (eager vs. lazy with explicit budgets: max 50 MB parser memory for tier-1 languages, parse <100 ms for files <1000 lines, startup penalty <500 ms), bundling approach (WASM vs. native), and prioritized language tiers (Stage 1 tier: JS/TS, Python, Go, Rust; later tiers: Java/C/C++/C#, PHP/HTML/CSS/Kotlin/Swift/Dart) plus explicit note that this task follows the runtime decision. Create `src/lang/` with an `index.ts` barrel export if it does not yet exist.
- **0.4 Define evidence schema extensions & checksum expectations (depends: 0.2)**
  - Deliverable: Notes in `docs/dev/phase0-tool-architecture.md` (or a companion doc) listing the new evidence types (`syntax`, `placeholder`, `sast`, `sbom`, `build`, `quality_budget`), checksum/metadata requirements, and aggregator expectations.
  - Acceptance: Captured JSON schema blueprints referencing the pending tool contracts (Stage 1.2, 2.2, 3.1, 4.2, 5.2, 6.2) plus a note that the `quality` SME consultation must occur before Stage 6 so the schema aligns with the final metrics. Each blueprint should list core fields, the stage that finalizes that shape, and review the existing stub Zod definitions (with `details: z.record(z.string(), z.unknown()).optional()`) in `src/config/evidence-schema.ts`, documenting how later stages must replace the `details` bucket with typed fields.
- **0.5 Schedule SME consultations**
  - Deliverable: Updated `docs/dev/sme-engagement-plan.md` with confirmed dates, owners, and required inputs for the `quality` domain (before Stage 6) and `tooling` domain (before Stages 4/5).
  - Acceptance: Stage 4/5 implementations cannot start until the tooling SME entry exists, and Stage 6 cannot begin until the quality SME entry exists; the doc must also record how the SME guidance maps to each gate. Because the scheduling happens in Stage 0, Stages 1-3 can proceed while we confirm availability, avoiding a sequential bottleneck.

> See `docs/dev/v6-9-roadmap.md` for the Stage 1-8 execution summary and the evidence matrix.

## Stage 0 Deliverables

- Tree-sitter runtime decision: `web-tree-sitter` was selected for Bun compatibility, published grammars are bundled as WASM assets, and the benchmark harness (`scripts/tree-sitter-benchmark.ts`) records parse/heaps metrics using `examples/syntax-check/` samples.
  The `examples/syntax-check/` directory now contains JS/TS, Python, Go, and Rust sample files at 50/500/2000 lines for benchmarking.
- Language registry scaffolding: `src/lang/index.ts`, `src/lang/registry.ts`, and `src/lang/runtime.ts` provide the initial map, comment metadata, and parser loader stub described in Task 0.3.
- Evidence schema validation: `src/config/evidence-schema.ts` already contains stub definitions for the new evidence types with `details` placeholders for later stages.
- SME engagements: `docs/dev/sme-engagement-plan.md` lists the scheduled quality and tooling consultations with owners/dates.

## Dependencies & Follow-ups
- Tree-sitter runtime + parser bundle
- Config schema updates (`src/config/schema.ts`, `src/config/evidence-schema.ts`)
- Prompt tests for non-bypass enforcement (`tests/unit/agents/architect-workflow-security.test.ts`)
- CLI/back-end hooks for new evidence types and benchmark output
- SME engagement tracker (`docs/dev/sme-engagement-plan.md`)

Next steps: complete Tasks 0.1-0.5 in Stage 0, keep `docs/dev/v6-9-roadmap.md` aligned with downstream implementation, and resubmit the plan to mega_critic once the baseline decisions are locked.

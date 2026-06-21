# Epic Mode (preview): outcome-based self-calibration

## What changed

- Epic Mode now ships Capability D — **outcome-based self-calibration**.
  After every task transitions to `completed`, the architect calls a new
  tool `epic_record_divergence(directory, taskId, sessionID)` which
  appends one record to `.swarm/epic/divergence.jsonl`. The record
  compares the task's DECLARED scope (from
  `.swarm/scopes/scope-{taskId}.json`) against the files the coder
  ACTUALLY modified (`session.modifiedFilesThisCoderTask`). On every
  subsequent `epic_decide_phase`, the calibration engine consumes any new
  divergence records and updates two knobs persisted at
  `.swarm/epic/calibration.json`:
  - `activationThresholdOverride` — tightens (toward zero) on each
    divergent task by `tighten_step`, capped at `floor_threshold`.
    Loosens (toward the static config) by `loosen_step` only after
    `loosen_window` consecutive clean tasks. Loosening counter resets on
    every divergent task.
  - `hotModuleAdditions` — files written without being declared get
    added permanently. **Monotonically grows** — auto-loosening here
    would defeat the safety guarantee, so removal requires manual
    intervention.
- New module surface in `src/turbo/epic/`:
  - `divergence-recorder.ts` — pure `computeDivergence(declared, actual)`
    + append-only JSONL writer for `.swarm/epic/divergence.jsonl`.
    Read-tolerant of partial trailing lines.
  - `calibration.ts` — durable state at `.swarm/epic/calibration.json`.
    Mirrors the `state.ts` pattern exactly (atomic `tmp + rename` with
    random suffix, per-directory fail-closed marker, repair seam).
  - `calibration-engine.ts` — pure `applyCalibration(state, newRecords,
    options) → newState` function plus
    `effectiveActivationThreshold(staticThreshold, state)` and
    `effectiveHotModules(staticHotModules, state)` helpers that the
    `epic_decide_phase` tool consults at decision time.
- New tool `epic_record_divergence` (`src/tools/epic-record-divergence.ts`).
  Best-effort — never blocks the calling agent. Returns one of
  `recorded | epic-mode-not-active | no-scope | no-session | persist-failed`.
- Existing `epic_decide_phase` tool now (a) consumes any new divergence
  records via the calibration engine before deciding, (b) passes the
  effective threshold and the calibration's `hotModuleAdditions` into
  `decideEpicActivation` as `activationThreshold` + new
  `extraHotModules`. The wiring is fail-soft — a calibration corruption
  logs a warning and falls back to the static knobs for that run.
- `decideEpicActivation` gains an optional `extraHotModules` field on
  its options. The static `isGlobalFile` / `isProtectedPath` predicates
  still apply unchanged; the extras are normalised paths the
  calibration loop has promoted on top.
- New `turbo.epic.calibration.*` config block: `enabled: true`,
  `floor_threshold: 0.05`, `tighten_step: 0.02`, `loosen_step: 0.01`,
  `loosen_window: 10`. All optional with safe defaults.
- The `EPIC_MODE_BANNER` (auto-injected into the architect's prompt by
  the system-enhancer hook) now instructs the architect to call
  `epic_record_divergence` after every `update_task_status(completed)`.
  No edit to `update_task_status` or any other maintainer file —
  composition-pure capture.
- 50 new tests covering:
  - `divergence-recorder` (10 tests) — pure-function semantics, dedup,
    path normalisation, append + read, malformed-line tolerance, error
    paths, sessionID + limit filters.
  - `calibration` (8 tests) — atomic write, seeding, fail-closed on
    malformed JSON / wrong version, repair seam, refuse-overwrite while
    unreadable.
  - `calibration-engine` (15 tests, includes the **simulation harness**):
    single-record behaviour, bounds (floor + ceiling), monotonic
    hot-module growth, and three named simulation invariants:
    1. **Convergence** — a long clean streak returns the threshold to
       the static value (and no further).
    2. **Monotonic-tighten** — any divergent stream moves the threshold
       monotonically toward the floor; never past it.
    3. **No-oscillation** — a divergent record between two clean
       streaks resets the clean counter, so noisy data cannot swing
       the threshold quickly back and forth.
    Plus a determinism test that re-runs the same input twice and
    asserts identical state.
  - `epic_record_divergence` tool (8 tests) — all reason codes, summary
    accuracy, plan-phase lookup, missing-plan tolerance, empty-actuals.
  - `epic_decide_phase` (4 new tests) — calibration → activation wiring,
    `applyCalibration` invocation when new records exist, fail-soft on
    calibration errors, `calibration.enabled=false` short-circuit.

## Why

Capability C makes a one-shot promote/demote decision per plan using
static thresholds. Capability D closes the loop: each task's outcome
(declared scope vs. actual writes) feeds back into the knobs for the
next decision. A repository that consistently writes outside its
declared scope tightens the activation threshold — Epic Mode becomes
more conservative there. A repository whose coders honour their
declared scope sees the threshold loosen toward the static value —
Epic Mode promotes more readily. The hot-module list ratchets in only
one direction (additions), so a real "this file is always touched
across decoupled-looking tasks" signal cannot be lost to a temporary
clean streak.

## Migration steps

None. With `turbo.epic.mode.enabled` left at its default (`false`), no
Epic-mode code runs at all and no calibration files are written.
Existing modes (Lean Turbo, Turbo, Full-Auto, standard serial) behave
exactly as before. When Epic Mode is enabled, calibration runs by
default — set `turbo.epic.calibration.enabled: false` to keep the
static knobs without any auto-tuning.

## Breaking changes

- None. All schema additions are optional fields with safe defaults.
  `extraHotModules` is an optional field on `EpicActivationOptions` —
  existing callers compile unchanged.

## Known caveats

- **Capture is architect-driven, not automatic.** Recording divergence
  requires the architect to call `epic_record_divergence` after
  `update_task_status(completed)`. The `EPIC_MODE_BANNER` instructs it
  to, but a missed call only costs one observation — Epic Mode keeps
  working. We deliberately avoided editing
  `src/tools/update-task-status.ts` to preserve the composition
  contract.
- **Defaults are reasoned estimates, not measured optima.** The
  `tighten_step / loosen_step / loosen_window` values flow from the
  brief's "conservative" framing; the simulation harness asserts the
  invariants hold across them, but the specific values have not been
  tuned against production outcomes.
- **Hot-module list is append-only by design.** Removing an entry that
  was promoted by a false-positive divergent task requires editing
  `.swarm/epic/calibration.json` by hand and restarting the session.
  Auto-shrinking here would let a long clean streak bury a real
  coupling signal, which is the failure mode this capability exists to
  prevent.

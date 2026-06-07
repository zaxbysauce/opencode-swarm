# Final Council: CONCERNS is advisory when there are no required fixes

## Overview

`write_final_council_evidence` previously normalized every non-`APPROVE` verdict to `rejected` in the evidence file. That collapsed two semantically distinct council outcomes — `CONCERNS` (advisory, 0 required fixes) and `REJECT` (blocking, ≥1 required fix) — into a single value. The `final_council` gate in `phase_complete` then treated `CONCERNS` as a hard block, which prevented the last phase from completing even when 4 of 5 council members voted `APPROVE` and the dissenting member had only advisory findings.

The symptom: `phase_complete` returned `FINAL_COUNCIL_REJECTED` (or, depending on the evidence layout, `FINAL_COUNCIL_INVALID_VERDICT`) on advisory-only council outcomes, forcing manual `/swarm finalize` workarounds.

This aligns the final-council gate with the existing phase-council gate, which already treats `CONCERNS` as non-blocking when `phaseConcernsAllowComplete` is enabled (default `true`).

## What changed

- `src/tools/write-final-council-evidence.ts:normalizeFinalVerdict` now returns one of three values instead of two:
  - `APPROVE` → `approved`
  - `CONCERNS` → `concerns` (new — was collapsed into `rejected` before)
  - `REJECT` → `rejected`
- `src/tools/phase-complete/gates/final-council-gate.ts` now recognizes `entry.verdict === 'concerns'` (and the uppercase `'CONCERNS'` for forward compatibility) as a non-blocking path. When the new `council.finalConcernsAllowComplete` config flag (default `true`) is enabled, the gate logs the advisory notes via `safeWarn` and lets `phase_complete` proceed. When set to `false`, `CONCERNS` blocks with the new `FINAL_COUNCIL_CONCERNS` reason.
- `src/config/schema.ts` and `src/council/types.ts` declare the new `council.finalConcernsAllowComplete: boolean` field (default `true`).
- Updated tests that encoded the buggy normalization:
  - `tests/unit/tools/phase-complete-final-council.test.ts` — replaced the test that expected `FINAL_COUNCIL_INVALID_VERDICT` for `CONCERNS` evidence with three new tests covering: `concerns` (lowercase, passes), `CONCERNS` (uppercase, passes), and `concerns` with `finalConcernsAllowComplete: false` (blocks as `FINAL_COUNCIL_CONCERNS`).
  - `tests/unit/tools/write-final-council-evidence.test.ts` — split the single "REJECT or CONCERNS → rejected" test into three tests: REJECT → `rejected`, advisory CONCERNS → `concerns`, and mixed REJECT+CONCERNS → `rejected` (REJECT wins).

## How to use

No action required. The fix is on by default (`finalConcernsAllowComplete: true`). To opt into blocking CONCERNS at the final council (matching phase-council's `phaseConcernsAllowComplete: false` behavior), set:

```json
{
  "council": {
    "finalConcernsAllowComplete": false
  }
}
```

in your `.opencode/opencode-swarm.json`.

## Migration

None. The evidence JSON shape gains a third value (`'concerns'`) but keeps the previous `'approved' | 'rejected'` values unchanged, so existing evidence readers continue to work.

Closes: #972

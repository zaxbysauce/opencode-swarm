# Work Complete Council

Opt-in, architect-driven verification gate that runs before a task is allowed
to advance to `completed`. This guide covers what the council does, how to
enable it, every config knob, and the runtime contract between the architect,
the five members, and the existing gate pipeline.

## 1. What is the Work Complete Council?

The Work Complete Council is a four-phase verification gate
(pre-declare → parallel dispatch → synthesize → act) that runs between the
coder signaling "done" and the architect calling `update_task_status` with
`completed`. Five specialized members evaluate the candidate in parallel
from isolated role-specific contexts. Synthesis is veto-aware, not vote-based:
any single `REJECT` blocks advancement. The council exists to reduce
single-context self-approval on high-risk work, surface slop patterns that a
generalist reviewer tends to rationalize away, and enforce criteria that were
pre-declared at plan time rather than invented at review time.

## 2. Enabling the council

Minimum configuration to turn it on:

```json
{
  "council": {
    "enabled": true
  }
}
```

Place the file at one of:

- `.opencode/opencode-swarm.json` — project-scoped (preferred)
- `~/.config/opencode/opencode-swarm.json` — user-scoped

With only `enabled: true` set, all other fields fall back to the defaults
documented below.

## 3. Full config reference

| Field                  | Type     | Default   | Description                                                                                                                  |
| ---------------------- | -------- | --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `enabled`              | boolean  | `false`   | Master switch. When `false` the council is completely inert and no gate is enforced.                                         |
| `maxRounds`            | number   | `3`       | Integer in `[1, 10]`. Maximum REJECT-retry rounds before the architect must escalate to the user.                            |
| `parallelTimeoutMs`    | number   | `30000`   | Integer in `[5000, 120000]`. Per-member dispatch timeout.                                                                    |
| `vetoPriority`         | boolean  | `true`    | When `true`, any single REJECT blocks advancement. When `false`, a lone REJECT downgrades to CONCERNS.                       |
| `requireAllMembers`    | boolean  | `false`   | When `true`, `convene_council` rejects with a structured error if fewer than five member verdicts are supplied.              |
| `escalateOnMaxRounds`  | string?  | undefined | Optional webhook URL or handler name invoked on max-rounds escalation. Reserved for a follow-up; no runtime behavior today.  |

Schema is strict — unknown keys under `council` are rejected at config load.

## 4. The five council members

All members run in parallel with isolated, role-scoped context. Each returns
a `CouncilMemberVerdict` with `verdict`, `confidence`, `findings[]`,
`criteriaAssessed[]`, and `criteriaUnmet[]`.

- **critic** — logic and correctness, spec compliance, edge cases, error
  handling, logic faults.
- **reviewer** — code quality, maintainability, architectural fit, security
  surface, style.
- **sme** — domain correctness; whether the implementation is sound against
  industry practice for the problem area.
- **test_engineer** — test completeness, mutation resistance, adversarial
  coverage, whether the test suite would actually catch a regression.
- **explorer** — anti-slop specialist. Detects lazy implementations,
  hallucinated APIs, cargo-cult patterns, spec drift, and lazy abstractions.
  Surfaces findings under `slop_pattern`, `hallucinated_api`,
  `lazy_abstraction`, `cargo_cult`, `spec_drift`.

## 5. The four-phase workflow

1. **Pre-declare.** At plan time (before the coder starts work), the
   architect calls `declare_council_criteria` with the task ID and the
   acceptance criteria. Criteria are persisted to `.swarm/council/{safeId}.json`.
2. **Parallel dispatch.** After the coder signals complete, the architect
   dispatches all five members simultaneously. Each receives a role-scoped
   context plus the pre-declared criteria.
3. **Synthesize.** The architect calls
   `convene_council(taskId, swarmId, verdicts[], roundNumber)`. The tool
   computes veto, conflict reconciliation, required-fix vs advisory
   classification, mandatory-criteria assessment, and builds a single
   `unifiedFeedbackMd` — the coder never sees contradictory instructions
   from different members.
4. **Act.** The architect interprets `overallVerdict`:
   - `APPROVE` → advance via `update_task_status`.
   - `CONCERNS` → send `unifiedFeedbackMd` to the coder as a single
     non-blocking advisory (via `pushCouncilAdvisory`), then advance.
   - `REJECT` → block. Send `unifiedFeedbackMd` to the coder as a blocking
     advisory. Retry up to `maxRounds`.
   - `roundNumber >= maxRounds && overallVerdict === 'REJECT'` → escalate
     to the user. Do not auto-advance.

## 6. Verdict semantics

- **APPROVE** — no veto, no unmet mandatory criteria. The task may advance
  immediately. `update_task_status` with `completed` passes the council gate.
- **CONCERNS** — non-veto findings exist (severity LOW or from non-veto
  members) but nothing blocks. The architect forwards the unified feedback
  and advances. `update_task_status` treats CONCERNS as a pass.
- **REJECT** — at least one member vetoed (with `vetoPriority: true`) or a
  mandatory criterion is unmet. `update_task_status` blocks the transition
  to `completed`. The architect must either satisfy `requiredFixes` and
  re-convene, or escalate when `maxRounds` is exhausted.

`update_task_status` enforces these semantics by reading
`evidence.gates.council.verdict` on the `completed` transition. A missing
gate is treated the same as REJECT: the task cannot advance without the
council having run.

## 7. Pre-declared criteria

Minimal call:

```json
{
  "taskId": "1.1",
  "criteria": [
    {"id": "C1", "description": "All tests pass with zero regressions", "mandatory": true},
    {"id": "C2", "description": "No placeholder bodies or stub implementations", "mandatory": true},
    {"id": "C3", "description": "Style guide conformance (biome clean)", "mandatory": false}
  ]
}
```

Rules:

- `id` must match `^C\d+$` (e.g. `C1`, `C12`).
- `description` is 10–500 characters.
- Between 1 and 20 criteria per declaration.
- `taskId` must be in `N.M` or `N.M.P` form.
- Calls are idempotent — re-declaring for the same `taskId` replaces the
  previous file and the response reports `replaced: true`.

Criteria are stored under `.swarm/council/{safeId}.json` and read back by
the synthesis step so each member assesses the same pre-committed contract.
`mandatory: true` criteria that appear in any member's `criteriaUnmet` block
advance.

## 8. Evidence storage

Council outcomes stamp into `.swarm/evidence/{taskId}.json` under
`gates.council`. The shape follows the existing `GateInfo` contract that
`check_gate_status` and `update_task_status` already consume
(`evidence.gates[gateName]`, not a top-level `evidence.council`):

- Standard fields — `sessionId`, `timestamp`, `agent` (always `'architect'`
  because the architect is the caller of `convene_council`).
- Council extras — `verdict`, `vetoedBy`, `roundNumber`, `allCriteriaMet`.

Pre-existing `gates[*]` entries and top-level keys are preserved across
writes. This is the only integration point with the gate pipeline: the
council does not introduce a parallel evidence format.

## 9. Retry protocol and `maxRounds`

- `roundNumber` is 1-indexed and tracked by the architect across retries.
- The advisory queue dedups via `council:${taskId}:${roundNumber}` so that
  repeated pushes within the same round are no-ops. Different rounds push
  distinct entries, so the coder sees the latest feedback each retry.
- On REJECT, the architect sends the blocking advisory, waits for the coder
  to address `requiredFixes`, then re-dispatches and re-convenes with
  `roundNumber + 1`.
- When `roundNumber >= maxRounds` and the verdict is still REJECT, the
  architect must escalate to the user rather than auto-advancing. This is
  a hard rule — `update_task_status` will continue to block, and
  `escalateOnMaxRounds` (if set) is reserved for a future webhook hand-off.

## 10. Minimal working example

```json
{
  "council": {
    "enabled": true,
    "maxRounds": 3,
    "vetoPriority": true,
    "requireAllMembers": false
  }
}
```

This is the recommended starting point: enable the gate, keep default
round budget, use strict veto semantics, allow partial councils (4-of-5
still synthesize). Turn `requireAllMembers: true` only if you want to
refuse synthesis when any member context fails to produce a verdict.

## 11. Troubleshooting

- **"Task won't advance to `completed`."** Inspect
  `.swarm/evidence/{taskId}.json` under `gates.council`. If the key is
  absent, the council never ran — the architect must call `convene_council`
  before retrying the transition. If `verdict === 'REJECT'`, resolve every
  item in `requiredFixes` and re-convene with an incremented `roundNumber`.
- **"Council tool returns `council feature is disabled`."** Verify
  `council.enabled: true` in either `.opencode/opencode-swarm.json` or
  `~/.config/opencode/opencode-swarm.json`. Config is strict; an unknown
  key alongside `enabled` will cause the entire `council` block to fail
  validation and fall back to disabled.
- **"`convene_council` rejects with `requireAllMembers is true but only N
  of 5 verdicts provided`."** You have `requireAllMembers: true` and one
  or more members failed to return a verdict. Either set
  `requireAllMembers: false` to synthesize on partial councils, or
  investigate why the missing member(s) did not dispatch — check
  `parallelTimeoutMs` and the member-specific context for dispatch errors.

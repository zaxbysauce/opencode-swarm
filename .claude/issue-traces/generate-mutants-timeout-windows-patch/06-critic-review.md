# Critic Review

Fallback self-critic: independent critic unavailable (running as subagent; nested subagent invocation not permitted per AGENTS.md / issue-tracer skill).

---

## Verdict
APPROVE

---

## Evidence Sufficiency
Root cause for both bugs is proven by direct code inspection:
- Bug 1: `grep "withTimeout" src/mutation/generator.ts` → zero results; lines 82 and 115 are bare `await` with no deadline. The `withTimeout` utility exists and is used in `src/index.ts`, so the mechanism is already proven safe.
- Bug 2: Lines 104 and 172 of `engine.ts` show `['apply', '--', patchFile]` and `['apply', '-R', '--', patchFile]` — no whitespace flag. The image explicitly states "known Windows patch application issue" and "patch application failed" for all 5 mutants.

Missing evidence: We cannot run `git apply` on a Windows machine from this sandbox. However, the CRLF/LF mismatch mechanism is well-documented (git upstream, Stack Overflow, Windows git defaults), and the `--ignore-whitespace` flag is the canonical fix.

---

## Plan Correctness
- **Bug 1**: Wrapping both LLM calls with `withTimeout` is necessary and sufficient. The 90-second ceiling prevents indefinite hang. The existing outer `catch` already converts any thrown error to `[]` (SKIP verdict). No side effects.
- **Bug 2**: `--ignore-whitespace` on `git apply` directly addresses the CRLF/LF context-line mismatch. The same flag on `git apply -R` ensures revert works symmetrically. On macOS and Linux (LF-native), the flag is a no-op.

---

## Unwired Functionality
None. The changes are:
- A timeout wrapper inside an existing function (no new entry points, exports, or routes).
- Two extra flags on subprocess arguments (no schema, API, config, or CLI surface change).
- No new tool, agent, hook, or config key is introduced.

---

## Edge Cases
All critical edge cases are covered:

| Scenario | Handled? |
|----------|----------|
| Timeout fires before `session.create` returns | ✅ withTimeout race fires; `finally` tries cleanup best-effort |
| Timeout fires after `session.create` but before `session.prompt` | ✅ `ephemeralSessionId` set; `finally`/cleanup deletes session |
| Timeout fires after both succeed (slow response) | ✅ catch path returns `[]` SKIP verdict |
| `--ignore-whitespace` on a fully invalid patch (wrong file) | ✅ `git apply` still exits non-zero; `outcome: error` correct |
| `--ignore-whitespace` on a LF-only system | ✅ No-op; existing tests unaffected |
| Revert fails after a successful apply | ✅ Pre-existing `revertError` path sets `outcome: error` |
| 90s timeout is too short for slow LLMs | Mitigated: 90s is generous for a single JSON generation prompt. Caller already handles SKIP gracefully. |

One edge case not fully covered: **what if `git apply` fails for a reason other than CRLF** (e.g. wrong base commit, malformed patch)? This is unchanged behaviour — the error is already reported as `outcome: error`. `--ignore-whitespace` does not mask real semantic failures.

---

## Test Gaps
- **New test needed**: generator timeout path — mock `session.prompt` to never resolve + artificially short GENERATE_MUTANTS_TIMEOUT_MS → confirm `[]` returned.
- **New test needed**: engine `executeMutation` passes `--ignore-whitespace` to `git apply` — verify via a `_internals` seam or command-capture spy following the project's DI pattern.
- **Existing tests**: all 31 pass today; no existing tests broken by the proposed changes.

One remaining gap: no test exercises `executeMutation` end-to-end with a real `git` binary (requires a live git repo fixture). This is a pre-existing gap, not introduced by this fix.

---

## Scope Risk
- No overreach: changes are localised to exactly two functions in two files.
- No public API change.
- No migration or data change.
- Rollback is a single-commit revert.
- `--ignore-whitespace` is present in all git versions ≥ 1.8 (released 2012); no version constraint risk.

---

## Required Revisions
- NONE — plan is approved as-is.

# Skill: writing-tests — add Documented-Example Regression Tests section

## What changed

Added a new `## Documented-Example Regression Tests` section to the canonical opencode-swarm writing-tests skill (`E:\OpenCode\opencode-swarm-dev\.opencode\skills\writing-tests\SKILL.md`, lines 644-663). The section captures the documented-example regression test pattern that emerged from issue #1456 (PR #1483).

The section includes:
- Pattern statement with `tests/unit/skills/<skill-name>-dry-run.test.ts` file path convention
- Four common drift modes the pattern catches: field-name drift, refusal-shape drift, value-level drift, field-presence drift
- A five-step concrete protocol with field-by-field deep-equality assertions
- A working example reference to `tests/unit/skills/swarm-pr-review-dry-run.test.ts` with the four specific drift cases caught during F-1456 review cycles
- A "When NOT to use this pattern" exclusion list

The skill update was prompted by a critic review verdict (issue #1456 PR feedback round 2): "MERGE-WITH-EXISTING — fold the test-documentation pattern into `writing-tests` rather than creating a new skill."

Follow-up PR_REVIEW fixes (PR #1489 round 1):
- Removed `assert.deepEqual` (Node API) reference from the protocol step 4; replaced with `bun:test`'s `toEqual` (deep-equality). Aligns with the skill's `## Framework: bun:test Only` rule.
- Updated test file `tests/unit/skills/swarm-pr-review-dry-run.test.ts:3` from `lines 866-1014` to `lines 866-1050` to match the actual range exercised by the test (including the refusal-case examples).

## Why

The candidate-parser implementation for issue #1456 (PR #1483) survived four review cycles to align the `swarm-pr-review` SKILL.md dry-run transcript (lines 866-1050) with the live `parse_lane_candidates` runtime output. The test that catches this drift (`tests/unit/skills/swarm-pr-review-dry-run.test.ts`) was written and refined across those cycles. Capturing the pattern in the canonical test-writing skill ensures future agents reuse it instead of reinventing the wheel.

## Migration

No migration required. The change is purely additive to the writing-tests skill. No source code, tests, or config files are modified. Future agents reading this skill will encounter the new section in their next skill-loading pass.

## Breaking changes

None. The change is purely additive.

## Known caveats

- The working example in the new section references hardcoded line numbers (`lines 866-1050`). These numbers will drift if `swarm-pr-review/SKILL.md` is refactored. The corresponding test file's header comment was updated to match the current range.
- The pattern is specifically about testing documented examples; it does not replace the existing `## Mock Isolation Rules` and `## Framework: bun:test Only` guidance in the same skill. Those sections continue to apply.
- Issue #1488 (F-007 follow-up) tracks the proper fix for the `mock.module('node:fs')` cross-file pollution in `tests/unit/background/candidate-sidecar-store.test.ts:1085-1171` — the new section does not address that; it's a separate workstream.

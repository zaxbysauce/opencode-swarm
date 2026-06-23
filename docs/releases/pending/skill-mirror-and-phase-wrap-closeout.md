# Add commit-pr skill mirror and document phase_complete closeout agent sequence

## What changed

Two `.opencode/skills/` documentation changes identified during the PR #1460 closeout review:

1. **Created `.opencode/skills/commit-pr/SKILL.md`** as a true byte-identical mirror of the canonical `.claude/skills/commit-pr/SKILL.md` (546 lines, SHA-256 `856384108D0519FDCB16D037949FB82598B7CE311EE2B45BC9932033963FA1B4`). Previously this file did not exist in `.opencode/skills/`, so OpenCode-side consumers could not load the commit-pr protocol locally — they had to read the `.claude` mirror or one of the adapter shims in `.agents/` and `.github/`. The canonical includes all 9 steps plus the Merge queue (current-base validation) section that addresses the GitHub auto-merge race condition.

2. **Added 5.59 "Required agent dispatch for phase_complete" subsection to `.opencode/skills/phase-wrap/SKILL.md`** documenting the closeout agent-dispatch sequence that `phase_complete` enforces. Updated the CATASTROPHIC VIOLATION CHECK to reference the full required-agent set (`coder`, `reviewer`, `test_engineer`, plus `docs` when `require_docs: true`) rather than only `reviewer`. Previously this enforcement was undocumented, which caused confusion during the PR #1460 closeout (phase_complete returned `incomplete` with `agentsMissing`).

## Why

PR #1460 closeout review identified two documentation gaps in the existing skills:

- Gap 1 (HIGH severity): `.opencode/skills/commit-pr/SKILL.md` was missing entirely. OpenCode-side agents had no local copy of the commit-pr protocol.
- Gap 2 (HIGH severity): `.opencode/skills/phase-wrap/SKILL.md` did not document the closeout agent-dispatch sequence that `phase_complete` enforces.

Both gaps were confirmed by an independent reviewer with file:line evidence. The reviewer recommended creating a true mirror of the canonical commit-pr skill and adding an explicit "Required agent dispatch" subsection to phase-wrap.

## Mirror-maintenance expectation

The `.opencode/skills/commit-pr/SKILL.md` mirror must be kept in sync with the canonical `.claude/skills/commit-pr/SKILL.md`. The mirror is a true byte-identical snapshot of the canonical as of the date of this fix commit — both files are 546 lines and share SHA-256 `856384108D0519FDCB16D037949FB82598B7CE311EE2B45BC9932033963FA1B4`.

When the canonical is updated, regenerate the mirror in the same commit so that `.opencode/` and `.claude/` stay aligned. Consider adding a CI drift check in a follow-up PR to detect divergence automatically.

## Migration

No migration required. Existing users will pick up the new skill files automatically on the next OpenCode plugin reload. The skill content matches the canonical `.claude/skills/commit-pr/SKILL.md` byte-for-byte, so behaviour is unchanged for Claude-side users.

## Breaking changes

None.

## Known caveats

- The `.opencode/skills/commit-pr/SKILL.md` mirror must be kept in sync with the canonical `.claude/skills/commit-pr/SKILL.md` going forward. If a future change updates the canonical, the mirror should be updated in the same PR. Consider adding a CI drift check to enforce this.
- The CATASTROPHIC VIOLATION CHECK text was enhanced to include "untested" and "undocumented" in the process violation message. This is more inclusive but does not change behaviour — `phase_complete` already enforces these gates.

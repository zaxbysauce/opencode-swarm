---
name: swarm-pr-review
description: Codex adapter for deep pull request review with swarm-like breadth and low false-positive tolerance. Use when asked to review a PR, inspect a branch diff, find regressions, validate review claims, or produce merge-risk recommendations.
---

# Swarm PR Review

Read `.claude/skills/swarm-pr-review/SKILL.md` for the source review protocol, then apply Codex's review rules.

Codex-specific execution notes:

- Default to code-review stance: findings first, ordered by severity, with file/line references.
- Inspect the diff, touched contracts, tests, docs, and relevant invariants.
- Verify suspected issues against actual code paths before reporting them.
- Use the GitHub app or `gh` for PR metadata when available.
- Run targeted checks only when they materially improve confidence.

For opencode-swarm invariant-sensitive PRs, also load `$engineering-conventions`; for test changes, load `$writing-tests`.

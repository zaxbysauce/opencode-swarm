# commit-pr skill: MCP environment note and invariant audit refresh guidance

## What changed

- Added **Environment note** section to `.claude/skills/commit-pr/SKILL.md`
  mapping `gh` CLI commands to `mcp__github__*` equivalents for use in remote
  execution environments where `gh` is not available: `create_pull_request`,
  `update_pull_request`, `pull_request_read` (get_check_runs / get),
  `actions_get` (get_workflow_run), `actions_list` (list_workflow_runs),
  `actions_run_trigger`, `add_issue_comment`. Includes ToolSearch caveat that
  MCP tool names are runtime-injected and should be verified before first use.
  Notes that `gh run cancel` has no direct MCP equivalent and that force-pushing
  supersedes stale runs via GitHub's concurrency model.

- Updated Step 7 item 4 in `.claude/skills/commit-pr/SKILL.md` to require
  refreshing the `## Invariant audit` when a follow-up commit changes which
  invariants are touched (e.g., a dist-check fix commit adds `dist/` changes to
  a PR that originally had none). Explicit: never leave an audit entry that says
  "not touched" when a later commit in the PR touched it.

- Added the same invariant audit scope-change rule to the "Existing PR updates"
  section of `.agents/skills/commit-pr/SKILL.md` so the Codex adapter captures
  the pattern without requiring agents to read the full canonical skill.

## Why

In remote Claude Code execution (web, mobile, GitHub Actions), the `gh` CLI is
not available and all GitHub interactions must go through MCP tools. The
commit-pr skill, originally written for desktop Windows use, had no MCP
equivalents documented, causing agents in remote environments to fail or guess
at tool names. The pattern was validated during PR #1106, which hit a dist-check
version-drift failure that required a rebase-and-rebuild fix commit — and the PR
body's invariant audit needed to be updated from "not touched" to "touched" for
invariant 2 after that fix commit landed.

## Migration

No migration required. Skill-only changes with no runtime impact.

## Known caveats

`gh run cancel` has no current MCP equivalent. The documented workaround
(force-pushing a correct commit supersedes the stale run via GitHub's CI
concurrency model) works in practice but does not guarantee the stale run is
cancelled immediately.

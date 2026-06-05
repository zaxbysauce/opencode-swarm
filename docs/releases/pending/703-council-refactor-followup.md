# PR #703 follow-up: council docs, config consistency, silent reduction warning

## What changed

Three medium-severity findings from the PR #703 review are addressed:

### 1. `docs/commands.md` — stale council interface removed

The `/swarm council` command signature and description have been updated to reflect
the post-#703 architecture:

- Removed the `--preset <name>` flag (preset-based member selection was removed in #703).
- Updated the description: the council is now a **fixed three-agent set**
  (`council_generalist`, `council_skeptic`, `council_domain_expert`); members no longer
  independently web-search; the architect owns the pre-search pass and supplies a
  RESEARCH CONTEXT block.
- Removed the reference to an "optional moderator pass" — the architect synthesizes
  the final answer directly.

### 2. Intentional `appendPrompt` omission documented

Council agents are created without the `appendPrompt` argument accepted by
`createReviewerAgent` / `createCriticAgent` / `createSMEAgent`. This is intentional:
council prompts are fixed and self-contained and must not inherit per-role workflow
customizations. An inline comment in `src/agents/index.ts` and two new notes in
`docs/configuration.md` make this explicit.

### 3. Deferred warning for silently reduced councils

When `council.general.enabled === true` but one or more of the `reviewer`, `critic`,
or `sme` base agents is disabled, the corresponding council role is now absent.
Previously this happened silently. A deferred warning is now emitted listing exactly
which council roles are missing and which base agents need to be re-enabled.

## Migration

No configuration changes required. Existing configs continue to work unchanged.

## Known caveats

None.

## Summary

Enhanced the `swarm-pr-review` skill to reduce false-positive noise from explorer agents by adding:

- **`pr_introduced` output field**: Explorers and micro-lane agents now annotate each candidate with `pr_introduced: YES/NO/UNKNOWN`, a factual classification of whether the flagged code was added by the PR. This enables the reviewer to filter out pre-existing findings that explorers previously reported as new issues.

- **CI built-artifact rule**: Added guidance to the context pack build phase explaining that CI checks like `dist-check` compare against the merge commit, not the PR branch head. Explorers and reviewers can distinguish genuine PR-introduced drift from branch-hygiene artifacts.

- **Semantic clarification**: Reframed the `pr_introduced: NO` classification as a factual origin marker (permitted for explorers) vs `PRE_EXISTING` as a verdict label (banned for explorers), eliminating a logical contradiction in the previous explorer rules.

## Migration

No migration required. The skill is a markdown-only change with no tool registration, config schema, or API changes.

## Known caveats

None.

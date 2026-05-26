Hardened the PR closeout workflow skills with conflict-resolution, current-head CI, and generated `dist` recovery guidance.

The commit/PR workflow now calls out remote `MERGEABLE`/`CLEAN` verification after conflict fixes, run-level CI inspection when `gh pr checks` lags, PR Standards reruns after body edits, and the known `bun install --frozen-lockfile --force` recovery path for source-touching `dist-check` drift.

No migration required.

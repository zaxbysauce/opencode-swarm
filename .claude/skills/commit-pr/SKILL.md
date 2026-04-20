---
name: commit-pr
description: >
  Apply when committing, pushing, opening a PR, writing a pull request, creating release
  notes, or updating a changelog. Enforces conventional commit format, mandatory release
  notes, 5-tier test suite, SHA-pinning for workflow changes, and correct PR body format.
effort: medium
---

## Commit & PR Protocol

Follow every step in order. Do not skip steps.

### Step 1 — Format every commit message correctly

Use `<type>(<scope>): <description>` exactly:
- Description must be **lowercase** and **not end with a period**
- Scope is optional but encouraged
- Allowed types: `feat`, `fix`, `perf`, `revert`, `docs`, `chore`, `refactor`, `test`, `ci`, `build`
- For a breaking change, append `!` to the type (e.g. `feat!:`) or add a `BREAKING CHANGE:` footer

Valid: `feat(architect): add retry backoff to SME delegation`
Invalid: `Fix stuff`, `feat: Add new feature.`, `feature: new thing`

### Step 2 — Choose the correct PR title type

The PR title is the squash merge commit message. Choose based on primary change:
- New capability → `feat` (minor bump)
- Bug fix only → `fix` (patch bump)
- Mixed feat + fix → use `feat` (minor subsumes patch)
- `docs`/`chore`/`refactor`/`test`/`ci`/`build` only → no version bump is triggered

### Step 3 — Determine NEXT_VERSION and create the release notes file

1. Read `.release-please-manifest.json` to find the current version
2. Determine the bump from your commit type:
   - `fix`, `perf`, `revert` → patch (e.g. `6.33.1` → `6.33.2`)
   - `feat` → minor (e.g. `6.33.1` → `6.34.0`)
   - breaking change (`!` or `BREAKING CHANGE:` footer) → major (e.g. `6.33.1` → `7.0.0`)
   - `docs`, `chore`, `refactor`, `test`, `ci`, `build` → no bump; use the current version as NEXT_VERSION (still create the file)
3. Create `docs/releases/v{NEXT_VERSION}.md` with freeform markdown covering:
   - **What changed** — changes grouped by theme
   - **Why** — motivation (bug report, feature request, hardening)
   - **Migration steps** — if any API, config, or behavior changed
   - **Breaking changes** — if any
   - **Known caveats** — anything users should watch out for

This file is **mandatory on every PR, no exceptions**, including one-line fixes.

### Step 4 — Never touch these files manually

Do **not** edit `package.json` version field, `CHANGELOG.md`, or `.release-please-manifest.json`. Release-please manages them; manual edits cause merge conflicts and break the pipeline.

### Step 5 — ⛔ MANDATORY: Run the full 5-tier test suite before pushing

**This step is MANDATORY. It is not optional, skippable, or conditional.**

Every tier MUST be run in order, regardless of:
- Whether the swarm's internal QA gates already ran lint/checks (swarm scope ≠ CI scope)
- Whether the change looks trivial or cosmetic
- Whether tests passed locally in isolation
- Whether you are in a hurry

Skipping this step WILL cause CI failures that waste time and require a follow-up commit.

Run every tier in order. Fix failures before proceeding.

```bash
# Tier 1 — quality
bun run typecheck
bunx biome ci .   # MUST run on the full project — never scope to modified files only.
                  # CI runs it on all files; a scoped run will miss errors in files you
                  # touched indirectly (e.g. reformatted by another tool, or modified via
                  # biome --write on one file but not re-checked globally).
                  #
                  # If you ran `bunx biome check --write` to auto-fix formatting,
                  # re-run `bunx biome ci .` afterwards and commit the auto-fixed files
                  # BEFORE pushing — biome --write produces unstaged changes that will
                  # cause the quality CI check to fail on the un-fixed commit.

# Tier 2 — unit tests (use per-file loop for tools/services/agents to avoid mock conflicts)
for f in tests/unit/tools/*.test.ts; do bun --smol test "$f" --timeout 30000; done
for f in tests/unit/services/*.test.ts; do bun --smol test "$f" --timeout 30000; done
for f in tests/unit/agents/*.test.ts; do bun --smol test "$f" --timeout 30000; done
bun --smol test tests/unit/hooks tests/unit/cli tests/unit/commands tests/unit/config --timeout 120000

# Tier 3 — integration tests
# IMPORTANT: always run Tier 3 after fixing Tier 2 failures — the same root cause
# often appears in integration test fixtures that unit tests don't cover.
bun test tests/integration ./test --timeout 120000

# Tier 4 — security and adversarial tests
bun test tests/security --timeout 120000
bun test tests/adversarial --timeout 120000

# Tier 5 — build + smoke (smoke requires a successful build first)
bun run build
# After building, commit any updated dist/ files if the repo tracks them.
# CI runs a dist-check that diffs committed dist/ against a fresh build and fails
# if they diverge. Check with: git status dist/
# If dist/ files are modified or new, stage and commit them before pushing:
#   git add dist/ && git commit -m "chore: update dist artifacts"
bun test tests/smoke --timeout 120000
```

**Schema or field name changes: extra step required.**
When you rename a field in a Zod schema, TypeScript interface, or serialized format (e.g. `task_id` → `taskId`):
1. Grep for the old field name across ALL test files — unit AND integration:
   ```bash
   grep -rn "old_field_name" tests/ --include="*.ts"
   ```
2. Update every test fixture that writes JSON with the old field name.
3. Update every assertion that reads the old field name from parsed JSON.
4. Run Tier 2 and Tier 3 together after fixing all fixtures.

Failing to do this causes test fixtures to write stale-format JSON that passes Zod validation for the write but fails on the read path — a silent correctness hazard.

If a failure is pre-existing and unrelated to your changes, note it in the PR description — do not skip the other tiers.

### Step 6 — SHA-pin any workflow changes

If you add or modify any file in `.github/workflows/`, every `uses:` reference to a third-party action must be pinned to a full 40-character commit SHA with the version as a comment:

```yaml
# Correct
- uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4

# Wrong — will fail security tests
- uses: actions/checkout@v4
- uses: actions/checkout@main
```

Find the SHA for a tag:
```bash
gh api repos/{owner}/{repo}/git/ref/tags/{tag} --jq '.object.sha'
```

### Step 7 — Squash to a single clean commit

Before pushing, collapse all interim commits into one. The PR must land as a single commit whose message is the canonical record of the change.

```bash
# See what you're about to squash (sanity check)
BASE=$(git merge-base HEAD main)
git log --oneline $BASE..HEAD

# Squash everything since branching from main
git reset --soft $BASE
git commit -m "type(scope): description"

# Force-push with lease (never plain --force)
git push --force-with-lease -u origin <branch-name>
```

**Rules:**
- The squash commit message must match the PR title exactly — they are the same thing.
- Use `--force-with-lease`, never `--force`. Lease rejects the push if the remote has commits you haven't seen.
- If a review cycle is already in progress (reviewer comments reference specific commit SHAs), do **not** squash until all review threads are resolved — squashing rewrites history and orphans inline comments.
- Any dist/ build artifact commits must be included in the squash (stage them before `git commit`).

**Why:** Interim commits (`fix attempt 1`, `wip`, `address review`) are noise in the project history. A single well-named commit makes `git log`, `git bisect`, and release notes meaningful. The PR title doubles as the squash commit message — both must be correct conventional-commit format.

### Step 8 — Open the PR with the correct body format

```bash
gh pr create --title "<type>(<scope>): <description>" --body "$(cat <<'EOF'
## Summary
- <bullet 1>
- <bullet 2 if needed>
- <bullet 3 if needed>

## Test plan
- [ ] <what you tested>
- [ ] <additional test step>

EOF
)" --base main
```

`## Summary` must have 1–3 bullets explaining what and why. `## Test plan` must be a markdown checklist. Do not replace the body of an existing release-please PR — prepend only.

### Step 9 — Pre-merge checklist

Verify every item before asking for a merge:
- [ ] Branch has exactly **one commit** — the squashed commit from Step 7 (`git log --oneline main..HEAD` shows one line)
- [ ] That commit message matches the PR title exactly, and both follow `<type>(<scope>): <description>`
- [ ] `docs/releases/v{NEXT_VERSION}.md` exists with meaningful release notes
- [ ] `package.json` version, `CHANGELOG.md`, `.release-please-manifest.json` are untouched
- [ ] All 5 test tiers from Step 5 were actually run (not assumed — you must have the output in context), including `bunx biome ci .` on the full project (not scoped)
- [ ] If the repo tracks `dist/` files: `bun run build` was run and dist/ artifacts are included in the squash commit
- [ ] All workflow `uses:` references are SHA-pinned (if workflows changed)
- [ ] PR body has `## Summary` and `## Test plan`
- [ ] All CI checks are green before merging

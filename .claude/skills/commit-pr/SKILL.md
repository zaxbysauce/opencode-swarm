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

### Step 5 — Run the full 5-tier test suite before pushing

Run every tier in order. Fix failures before proceeding.

```bash
# Tier 1 — quality
bun run typecheck
bunx biome ci .

# Tier 2 — unit tests (use per-file loop for tools/services/agents to avoid mock conflicts)
for f in tests/unit/tools/*.test.ts; do bun --smol test "$f" --timeout 30000; done
for f in tests/unit/services/*.test.ts; do bun --smol test "$f" --timeout 30000; done
for f in tests/unit/agents/*.test.ts; do bun --smol test "$f" --timeout 30000; done
bun --smol test tests/unit/hooks tests/unit/cli tests/unit/commands tests/unit/config --timeout 120000

# Tier 3 — integration tests
bun test tests/integration ./test --timeout 120000

# Tier 4 — security and adversarial tests
bun test tests/security --timeout 120000
bun test tests/adversarial --timeout 120000

# Tier 5 — build + smoke (smoke requires a successful build first)
bun run build
bun test tests/smoke --timeout 120000
```

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

### Step 7 — Open the PR with the correct body format

```bash
git push -u origin <branch-name>
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

### Step 8 — Pre-merge checklist

Verify every item before asking for a merge:
- [ ] Every commit follows `<type>(<scope>): <description>` (lowercase, no trailing period, allowed type)
- [ ] PR title matches the primary change type
- [ ] `docs/releases/v{NEXT_VERSION}.md` exists with meaningful release notes
- [ ] `package.json` version, `CHANGELOG.md`, `.release-please-manifest.json` are untouched
- [ ] All 5 test tiers pass locally
- [ ] All workflow `uses:` references are SHA-pinned (if workflows changed)
- [ ] PR body has `## Summary` and `## Test plan`
- [ ] All CI checks are green before merging

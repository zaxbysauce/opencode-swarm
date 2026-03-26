# Contributing to OpenCode Swarm

> **This file is the authoritative reference for any automated agent (LLM, Copilot, CI bot) or human contributor submitting a PR to this repository. Read it fully before making any commit.**

---

## How releases work

This repository uses [release-please](https://github.com/googleapis/release-please) (`release-type: node`) to automate versioning, changelog generation, and npm publishing. The entire release pipeline is driven **exclusively by commit messages and PR titles**. There is no manual versioning step.

When a PR is merged to `main`:
1. `release-please` reads every commit message merged since the last release tag
2. It determines the next semver version bump based on conventional commit types
3. It creates or updates a "release PR" that bumps `package.json`, updates `CHANGELOG.md`, and updates `.release-please-manifest.json`
4. When that release PR is merged, it publishes to npm and creates a GitHub Release

**If your commit messages are malformed, release-please will either ignore your changes in the changelog or produce the wrong version bump.** There is no recovery path other than a follow-up fix commit.

---

## Commit message format (Conventional Commits)

Every commit **and every PR title** must follow this format exactly:

```
<type>(<optional scope>): <description>
```

- The description must be lowercase and not end with a period
- The type must be one of the allowed types below
- Scope is optional but encouraged for clarity

### Allowed types and their semver effect

| Type | Changelog section | Version bump |
|---|---|---|
| `feat` | Features | **minor** (e.g. 6.30.1 → 6.31.0) |
| `fix` | Bug Fixes | **patch** (e.g. 6.30.1 → 6.30.2) |
| `perf` | Performance Improvements | **patch** |
| `revert` | Reverts | **patch** |
| `docs` | Documentation | none (not included in changelog) |
| `chore` | — | none (not included in changelog) |
| `refactor` | — | none (not included in changelog) |
| `test` | — | none (not included in changelog) |
| `ci` | — | none (not included in changelog) |
| `build` | — | none (not included in changelog) |

### Breaking changes → major bump

To trigger a **major** version bump (e.g. 6.30.1 → 7.0.0), add a footer to the commit body:

```
feat: redesign swarm orchestration API

BREAKING CHANGE: SwarmConfig.agents field renamed to SwarmConfig.workers
```

Or append `!` to the type:

```
feat!: redesign swarm orchestration API
```

### Valid examples

```
feat(architect): add retry backoff to SME delegation
fix(circuit-breaker): prevent race condition on concurrent invocations
perf(plan-sync): reduce lock contention in worker handoff
docs: update getting-started guide for bun 1.2
chore: bump @opencode-ai/sdk to 1.1.54
test(gate): add adversarial coverage for evidence summary init
ci: add tiered test pipeline and PR quality checks
refactor(swarm): extract phase orchestration into dedicated module
```

### Invalid examples (will be rejected by `pr-standards` CI check)

```
WIP
fix stuff
Update README
feat: Add new feature.        ← trailing period
Feat: new feature             ← uppercase type
feature: new thing            ← not an allowed type
```

---

## PR title requirement

The PR title is used by release-please as the squash merge commit message. **It must follow the same conventional commit format as individual commits.** The `pr-standards` CI check will block merging if the title is invalid.

---

## What CI checks must pass before merging

All of these must be green. They run automatically on every PR.

| Check | What it validates |
|---|---|
| `quality` | TypeScript compiles (`tsc --noEmit`), Biome lint + format clean |
| `unit` (Ubuntu, macOS, Windows) | Unit tests pass on all platforms |
| `integration` (Ubuntu) | Integration tests pass (circuit breakers, gate workflows, state machines) |
| `security` (Ubuntu) | Security and adversarial tests pass |
| `smoke` (Ubuntu, macOS, Windows) | Package builds successfully and smoke tests pass on all platforms |
| `pr-standards` | PR title is a valid conventional commit |
| `check-duplicates` | PR title does not match an already-open PR |

**Do not ask for a merge if any check is red.** Fix the issue first.

### Running checks locally before opening a PR

```bash
bun install --frozen-lockfile

# Tier 1 — quality
bun run typecheck
bunx biome ci .

# Tier 2 — unit
bun test tests/unit --timeout 120000

# Tier 3 — integration
bun test tests/integration ./test --timeout 120000

# Tier 4 — security
bun test tests/security --timeout 120000

# Tier 5 — smoke (requires a build first)
bun run build
bun test tests/smoke --timeout 120000
```

---

## Test directory map

When writing or modifying tests, place them in the correct directory:

| Directory | Purpose |
|---|---|
| `tests/unit/` | Pure logic tests, no I/O, fast (<5s total) |
| `tests/integration/` | Multi-component tests, orchestration flows, state machine transitions |
| `tests/smoke/` | Post-build packaging verification — does the built artifact actually work? |
| `tests/security/` | Adversarial inputs, injection attempts, CI security invariants |
| `tests/adversarial/` | Extended adversarial scenarios for swarm-specific attack surfaces |
| `tests/architect/` | Architect agent behavior and identity tests |
| `test/` | Top-level standalone tests (adversarial plan write, reviewer tiers, agent tagging) |

---

## Release notes (mandatory — no exceptions)

**Every PR MUST include a release notes file at `docs/releases/v{NEXT_VERSION}.md`.** This is not optional. This is not conditional on "user-facing changes." This is not a "nice to have." If your PR is merged without it, release-please publishes a generic changelog with no explanation of what changed or how to migrate. Every PR goes through a changelog. Every PR needs notes.

The release pipeline reads this file after merge and uses it as the GitHub Release body. If the file is missing, users see a bare list of commit messages — which is useless for anyone upgrading.

### How to determine the version

Find the current version in `.release-please-manifest.json` and increment it according to the bump your commit type will trigger (`fix`/`perf` → patch, `feat` → minor):

| Commit type | Current version | Next version |
|---|---|---|
| `fix`, `perf` | `6.33.1` | `6.33.2` |
| `feat` | `6.33.1` | `6.34.0` |

### What to include

The file is freeform markdown. Cover what changed for users, migration steps if any, and any known caveats. Even a one-line change deserves a note explaining why it matters. See `docs/releases/v6.35.0.md` for the canonical format.

---

## What release-please manages automatically — do not touch manually

- `package.json` → `version` field
- `CHANGELOG.md`
- `.release-please-manifest.json`

If you manually edit any of these files in a PR, release-please will conflict with itself on the next run. Leave them alone.

---

## SHA pinning for GitHub Actions

If you add or modify a workflow file in `.github/workflows/`, every `uses:` reference to a third-party action must be pinned to a full 40-character commit SHA with the version as a comment. This is a hard requirement enforced by the security tests.

```yaml
# Correct
- uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4

# Wrong — will fail security tests
- uses: actions/checkout@v4
- uses: actions/checkout@main
```

To find the SHA for a given tag, run:
```bash
gh api repos/{owner}/{repo}/git/ref/tags/{tag} --jq '.object.sha'
```

---

## Summary checklist for any PR

- [ ] Every commit message follows `<type>(<scope>): <description>` format
- [ ] PR title follows the same format and matches the primary change
- [ ] No manual edits to `package.json` version, `CHANGELOG.md`, or `.release-please-manifest.json`
- [ ] New tests are in the correct `tests/` subdirectory
- [ ] If adding a workflow, all `uses:` references are SHA-pinned
- [ ] All CI checks pass locally before opening the PR
- [ ] `docs/releases/v{NEXT_VERSION}.md` exists with release notes — this is MANDATORY for every PR, no exceptions

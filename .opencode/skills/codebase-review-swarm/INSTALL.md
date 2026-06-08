# Installation

The canonical portable package is the folder `codebase-review-swarm/` containing `SKILL.md`, `references/`, `assets/`, `scripts/`, and optional Codex metadata in `agents/openai.yaml`.

## Repository-local install

### Codex and OpenCode

From the repository root:

```sh
mkdir -p .agents/skills
cp -R codebase-review-swarm .agents/skills/
```

Then invoke explicitly as `$codebase-review-swarm` or ask for a comprehensive codebase review. Codex scans `.agents/skills` from the current directory to repo root. OpenCode also supports `.agents/skills`.

### opencode-swarm repository layout

Within the opencode-swarm plugin repository, keep the full canonical protocol in:

```sh
.opencode/skills/codebase-review-swarm/
```

Keep `.claude/skills/codebase-review-swarm/` and `.agents/skills/codebase-review-swarm/` as thin adapters that point to the canonical OpenCode skill.

### Claude Code

From the repository root:

```sh
mkdir -p .claude/skills
cp -R codebase-review-swarm .claude/skills/
```

Claude Code discovers project skills under `.claude/skills/<skill-name>/SKILL.md`.

### OpenCode alternative for other repositories

```sh
mkdir -p .opencode/skills
cp -R codebase-review-swarm .opencode/skills/
```

## User-global install

```sh
mkdir -p ~/.agents/skills
cp -R codebase-review-swarm ~/.agents/skills/
```

For Claude-only global use:

```sh
mkdir -p ~/.claude/skills
cp -R codebase-review-swarm ~/.claude/skills/
```

## Suggested repository instruction

Add this to `AGENTS.md`, `CLAUDE.md`, or equivalent repository agent instructions:

```markdown
When asked for a comprehensive codebase review, QA audit, security/supply-chain review, AI-slop review, accessibility review, performance/observability review, or enhancement catalog, invoke `$codebase-review-swarm`. Run Phase 0 inventory first, stop for review-mode selection unless the user already selected tracks, and do not modify source files.
```

## Validation

```sh
python3 codebase-review-swarm/scripts/validate-skill-package.py codebase-review-swarm
```

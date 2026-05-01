# Issue 724 Reproduction

## Reproduction Scenario

This issue is not reproducible in the current repository (no tracked `.swarm/` files,
`.swarm/` already in `.gitignore`). However, the root conditions are confirmed in code:

### Condition A: Tracked .swarm/ files (primary, matches screenshot)
Affected users previously committed `.swarm/` files (before ignore rule existed or in
a subdirectory not covered by the root `.gitignore`).

```bash
# Reproduction in a fresh temp repo:
mkdir /tmp/repro-724 && cd /tmp/repro-724
git init && git commit --allow-empty -m "init"
mkdir .swarm && touch .swarm/dark-matter.md .swarm/session/state.json
git add .swarm && git commit -m "accidentally track .swarm"
# Now add .swarm/ to .gitignore
echo ".swarm/" >> .gitignore
# Plugin runs, writes to .swarm/dark-matter.md
echo "updated content" > .swarm/dark-matter.md
git status  # → shows .swarm/dark-matter.md as MODIFIED — .gitignore does NOT help
```

### Condition B: Missing worktree support
```bash
# In a git worktree, .git is a file not a directory
git worktree add /tmp/wt feature-branch
cd /tmp/wt
ls .git  # → file (not directory)
# findGitRoot() returns null → protection skipped silently
```

### Condition C: Quiet mode suppression
```bash
# With quiet: true in .opencode/opencode-swarm.json
# warnIfSwarmNotGitignored(dir, true) → no console.warn ever fires
```

## Confirmed Code Paths

| File | Function | Issue |
|------|----------|-------|
| `src/utils/gitignore-warning.ts:22-42` | `findGitRoot()` | Only accepts `.git` directory, not file |
| `src/utils/gitignore-warning.ts:100-105` | `warnIfSwarmNotGitignored()` | Suppressed when `quiet=true` |
| `src/utils/gitignore-warning.ts:75-109` | whole function | Never writes to `.git/info/exclude` |
| `src/utils/gitignore-warning.ts:75-109` | whole function | Doesn't check tracked files |
| `src/index.ts:308-311` | `initializeOpenCodeSwarm()` | Warning runs AFTER writes |
| `src/hooks/diff-scope.ts:107-137` | `validateDiffScope()` | No `.swarm/` path filter |

## Non-Reproducibility Note
This ticket cannot be auto-reproduced with existing test infrastructure since it
requires tracked `.swarm/` files. A new integration test is needed.

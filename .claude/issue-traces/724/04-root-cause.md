# Root Cause — Issue 724

## Summary
The plugin writes runtime state under `.swarm/` on every initialization, but the only
protection against Git pollution is an advisory `console.warn()` that fires **after** the
writes, is suppressed in quiet mode, is blind to already-tracked `.swarm/` files, and
does not automatically write to `.git/info/exclude`. In the user's repository, `.swarm/`
files were tracked (committed) at some point; once files are tracked, `.gitignore` rules
cannot suppress them, so every plugin startup makes the repo appear dirty.

## Exact Locations

### Problem 1 — Protection runs after writes
- File: `src/index.ts`
- Symbol: `initializeOpenCodeSwarm`
- Lines: `308–311` (write order before warning)

```
308:  initTelemetry(ctx.directory);           // writes .swarm/telemetry.jsonl
309:  writeSwarmConfigExampleIfNew(...)        // writes .swarm/config.example.json
310:  writeProjectConfigIfNew(...)             // may write .swarm/
311:  warnIfSwarmNotGitignored(...)            // ← advisory warn fires here, too late
```

### Problem 2 — findGitRoot() fails for worktrees/submodules
- File: `src/utils/gitignore-warning.ts`
- Symbol: `findGitRoot`
- Lines: `26–29`

```typescript
const stat = fs.statSync(gitPath);
if (stat.isDirectory()) {   // ← only accepts .git/ dir, not .git file
    return current;
}
```
In a Git worktree, `.git` is a file pointing to the real git dir. `stat.isDirectory()`
returns false, the check silently continues walking up past the git root, and eventually
returns null — the entire protection is skipped.

### Problem 3 — Warning suppressed in quiet mode
- File: `src/utils/gitignore-warning.ts`
- Symbol: `warnIfSwarmNotGitignored`
- Lines: `100–105`

```typescript
if (!quiet) {
    console.warn('[opencode-swarm] WARNING: .swarm/ is not in your .gitignore...');
}
```
Desktop sessions typically use `quiet: true`. Warning never fires.

### Problem 4 — No tracked-file detection
- File: `src/utils/gitignore-warning.ts`
- Symbol: `warnIfSwarmNotGitignored`
- Lines: `75–109` (entire function)

Function reads `.gitignore` and `.git/info/exclude`, but never runs
`git ls-files -- .swarm` to detect already-tracked files. For tracked files,
`.gitignore` rules are irrelevant — only `git rm --cached` can fix them.

### Problem 5 — No automatic .git/info/exclude write
- File: `src/utils/gitignore-warning.ts`
- Lines: `75–109`

Function never writes anything. Users must add the rule manually after seeing the warning —
but many never do because of Problems 2/3.

### Problem 6 — validateDiffScope() includes .swarm/ paths
- File: `src/hooks/diff-scope.ts`
- Symbol: `validateDiffScope`
- Lines: `107–137`

`getChangedFiles()` returns all changed files including `.swarm/`. No filter applied.
When `.swarm/` files are tracked and modified, they appear as "undeclared scope changes"
in QA reviewer output, creating noise.

## Broken Contract
The plugin promises not to pollute the user's repository with uncommitted changes.
It writes runtime state to the project working tree without guaranteed Git exclusion,
and its only protection mechanism fires too late, is advisory-only, is suppressible,
and cannot handle the case where files are already tracked.

## Triggering Conditions
- `.swarm/` files were previously committed to the repo (tracked state)
- OR: Git worktree environment (`.git` is a file)
- OR: `quiet: true` in plugin config (default on desktop)
- ALWAYS: plugin writes to `.swarm/` before warning fires

## Evidence Chain
1. Screenshot shows `git:<sha>:dark-matter.md` URI — confirms tracked file
2. `src/index.ts:308–311` — writes happen before `warnIfSwarmNotGitignored`
3. `src/utils/gitignore-warning.ts:26–29` — `stat.isDirectory()` fails for worktrees
4. `src/utils/gitignore-warning.ts:100–105` — `!quiet` gate suppresses warning
5. No `git ls-files` call anywhere in the warning utility
6. `src/hooks/diff-scope.ts:107–137` — no `.swarm/` filter

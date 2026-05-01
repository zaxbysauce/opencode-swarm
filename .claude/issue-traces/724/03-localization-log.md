# Issue 724 Localization Log

## Hypothesis 1: git: URI prefix means actual files are written with that name
**Status: RULED OUT**  
Evidence: The `git:<sha>:` prefix is an editor URI scheme for showing the HEAD-side of a diff.
The actual file paths are `.swarm/dark-matter.md` etc. No code writes to `git:` filenames.

## Hypothesis 2: .swarm/ files are untracked and need a .gitignore entry
**Status: RULED OUT for primary issue, PARTIALLY VALID**  
Evidence: Current `.gitignore` already contains `.swarm/` (verified). But `.gitignore` does not
stop already-tracked files from showing as modified. The screenshot `git:<sha>:` prefix
confirms at least some `.swarm/` files are tracked.

## Hypothesis 3 (CONFIRMED): Tracked .swarm/ files + advisory-only protection
**Primary root cause for @Moeinich**

Files read:
- `src/utils/gitignore-warning.ts` — entire file
- `src/index.ts` — lines 308-311 (initialization sequence)
- `src/agents/index.ts` — lines 807-825 (evidence write)
- `src/session/snapshot-writer.ts` — writeSnapshot function
- `src/hooks/system-enhancer.ts` — lines 474-549 (dark-matter.md and doc-manifest.json writes)
- `src/hooks/diff-scope.ts` — entire file (validateDiffScope)
- `src/telemetry.ts` — lines 74-187 (telemetry.jsonl write to .swarm)

### Confirmed root cause chain:

**1. Warning runs too late:**  
`src/index.ts:308`: `initTelemetry(ctx.directory)` → writes `.swarm/telemetry.jsonl`  
`src/index.ts:309`: `writeSwarmConfigExampleIfNew(ctx.directory)` → writes `.swarm/config.example.json`  
`src/index.ts:310`: `writeProjectConfigIfNew(ctx.directory, config.quiet)` → may write  
`src/index.ts:311`: `warnIfSwarmNotGitignored(ctx.directory, config.quiet)` ← **warning fires here, AFTER writes**  
`src/index.ts:323`: `getAgentConfigs(config, ctx.directory)` → writes `.swarm/evidence/agent-tools-init-*.json`  
System enhancer hook → writes `.swarm/dark-matter.md`, `.swarm/doc-manifest.json`, `.swarm/knowledge.jsonl`  
Snapshot writer hook → writes `.swarm/session/state.json`  

**2. findGitRoot() misses worktrees/submodules:**  
`src/utils/gitignore-warning.ts:26-29`: `stat.isDirectory()` check — only accepts `.git` dir  
In worktrees, `.git` is a file → `stat.isDirectory()` returns false → error thrown → walk continues → null returned  
Result: protection silently skipped for all worktree users  

**3. Warning suppressed in quiet mode:**  
`src/utils/gitignore-warning.ts:101`: `if (!quiet) { console.warn(...) }`  
Default desktop config often uses `quiet: true` → warning never shown  

**4. No tracked-file detection:**  
`warnIfSwarmNotGitignored()` only reads `.gitignore`/`exclude` files  
No `git ls-files -- .swarm` call  
Result: users with tracked `.swarm/` files get no remediation guidance  

**5. No automatic protection:**  
Function only warns; never writes to `.git/info/exclude`  
Users must manually add the rule  

**6. validateDiffScope() polluted by tracked .swarm/ files:**  
`src/hooks/diff-scope.ts:54-99`: `getChangedFiles()` runs `git diff --name-only HEAD~1`  
No filtering of `.swarm/` paths  
Result: tracked `.swarm/` show up as "scope violations" in QA output  

## Ruled Out Hypotheses
- "git: filenames created on disk" — no code path creates such filenames
- "Issue with new gitignore entry" — `.swarm/` is already in `.gitignore`
- "Bug in snapshot writer" — writer works correctly; problem is upstream (tracked files)

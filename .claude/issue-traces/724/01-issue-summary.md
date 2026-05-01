# Issue 724 Summary

**Title:** git:xxxxx:dark-matter.md etc  
**Reporter:** @Moeinich  
**URL:** https://github.com/zaxbysauce/opencode-swarm/issues/724  
**State:** open  

## Observed Behavior
Screenshot shows Git UI diff entries like:
```
git:216ff9285db7b371b37cea89b8c409e5760004bc/.swarm/dark-matter.md
```
These `git:<sha>:` prefixes are the editor's URI scheme for "HEAD version of a tracked file."  
Actual files showing as modified:
- `.swarm/dark-matter.md`
- `.swarm/doc-manifest.json`
- `.swarm/evidence/agent-tools-init-<timestamp>.json`
- `.swarm/knowledge.jsonl`
- `.swarm/session/state.json`

## Expected Behavior
Runtime plugin state in `.swarm/` should never appear as uncommitted Git changes.

## Root Symptom Interpretation
The `git:<sha>:` URI prefix in the screenshot means `.swarm/` files have a version in Git HEAD (i.e., they are tracked/committed). `.gitignore` rules do not suppress already-tracked files, so the plugin's runtime writes create permanent diffs.

## Reproduction Steps
1. Use opencode-swarm in a repo where `.swarm/` files were committed before `.swarm/` was added to `.gitignore`
2. Plugin writes to `.swarm/` on every startup/session
3. `git status` shows all `.swarm/` files as modified

## Acceptance Criteria
- Plugin startup must not produce visible uncommitted changes in `git status`
- `.swarm/` must be automatically excluded from Git (via `.git/info/exclude`) before any `.swarm/` write
- Already-tracked `.swarm/` files must trigger an unsuppressed remediation warning
- `.swarm/` paths must be filtered from `validateDiffScope()` output

## Ambiguities
- We cannot safely auto-run `git rm --cached .swarm` — must only warn
- Fix must be non-fatal in no-Git, read-only, and worktree environments

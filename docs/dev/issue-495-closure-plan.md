# Issue #495 Closure Plan — and #496 Reopening Scope

**Branch:** `claude/plan-issue-495-zmJ6I`
**Status:** Draft (pending investigator results for #496 section)
**Baseline:** `main@959b188` (v6.71.0)

---

## 1. Issue #495 — Deferred / Out-of-Scope Test Quality Infrastructure Work

### 1.1 Decision framework (from user)

- Closure model: **split into sub-issues, then close the umbrella**.
- Command renames: **alias + deprecation** (`/swarm finalize` canonical, `/swarm close` alias with deprecation warning; same pattern for `/swarm show-plan` / `/swarm plan`).
- Auto-registration: user is leaning toward decorator-based but wants tradeoff analysis. See §1.4.
- Drop decisions: defer per-item, decide during triage.

### 1.2 Verified current state (per independent reviewer against `main@959b188`)

Five of nineteen items are already **resolved** on `main` but undocumented in #495. These need only a consolidation comment. Three additional items were previously thought closed — critic pass disagrees and they have been moved to §1.3.

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | `req_coverage` in `TOOL_DESCRIPTIONS` | CLOSED | `src/config/constants.ts:318-319` |
| 2 | Plugin-registration test derived from `TOOL_NAMES` | CLOSED | `src/tools/plugin-registration-adversarial.test.ts:10,17,268` — test iterates `TOOL_NAMES` dynamically; no hardcoded list |
| 3 | `executeMutation` direct unit tests | CLOSED | `tests/unit/mutation/engine-shell-injection{,.adversarial}.test.ts`, `engine-enoent{,.adversarial}.test.ts`, `engine-equivalence.test.ts` — 1,837 LOC importing `executeMutation` directly |
| 4 | Mutation engine adversarial error-path tests | CLOSED | `tests/unit/mutation/engine-shell-injection.adversarial.test.ts`, `engine-enoent.adversarial.test.ts` |
| 5 | History-store case-normalization | CLOSED | `src/test-impact/history-store.ts:141,236` (`toLowerCase()` applied to grouping and lookup keys) |

Three items previously marked closed are reclassified as open per critic pass — see §1.3 #14, #15, #16.

### 1.3 Genuinely open items (eleven)

Each item below becomes one GitHub sub-issue linked to #495, with per-item recommendation.

#### High priority

1. **Command rename with deprecation alias — `/swarm close` → `/swarm finalize`**
   - Severity: High (data-loss hazard — name implies "dismiss" but archives the project).
   - Scope: add `finalize` as canonical command in `src/commands/registry.ts`; register `close` as alias that prints a deprecation warning on invocation and forwards to the finalize handler. Update OpenCode subcommand templates in `src/index.ts`. Update docs and help text.
   - Removal target: next major version bump.
   - Acceptance: `/swarm finalize` works; `/swarm close` prints `DEPRECATED: use /swarm finalize` and still completes; docs updated; changelog entry.

2. **Command rename with deprecation alias — `/swarm plan` → `/swarm show-plan`**
   - Severity: Medium (UX confusion — verb `plan` sounds like creation, not display).
   - Same pattern as #1. Lower priority because there's no data-loss risk; bundle with #1 in a single PR.

3. **Tool auto-registration system** (see §1.4 for the tradeoff discussion)
   - Severity: High (root cause of the dead-tools bug class).
   - Acceptance: adding a new tool requires editing exactly one file; compile-time check catches any registration gap.

#### Medium priority

4. **FR-020 — council `mutation_gap` emission**
   - Severity: Medium; type already exists at `src/council/types.ts:23`.
   - Scope: emit when `test_runner` result shows no mutation coverage for newly-added source, or when `mutation_test` was skipped for a high-risk diff. Wire from the council evidence pipeline.

5. **`/swarm help` command + Claude Code command visibility**
   - Severity: Medium. OpenCode renders command templates; Claude Code users have no discovery path.
   - Scope: add `/swarm help` that lists all entries from `COMMAND_REGISTRY`. Optionally inject a command summary into the architect system prompt for Claude Code sessions.

6. **Per-test result parsing from framework JSON output**
   - Severity: Medium. Today `src/tools/test-runner.ts:1353` writes `testName: '(aggregate)'` per file, which limits clustering and flaky detection granularity.
   - Scope: parse `bun:test --reporter=json`, `vitest --outputFile`, `jest --json`; store a record per individual test; keep aggregate as a secondary signal.

7. **FR-014 — LLM-driven mutation patch generation** (recommend: DEFER / mark `wontfix-for-now`)
   - Severity: Medium per spec, but low user demand. Current flow (architect-crafted patches) is working. Keep as a tracked enhancement issue but mark "not planned for this cycle" unless a concrete use case appears.

8. **FR-019 — parallel mutation workers with 5-min budget** (recommend: DEFER)
   - Severity: Medium per spec. `src/mutation/engine.ts:386-422` is sequential. Parallelization requires concurrent git worktrees (non-trivial); the 5-min budget is already enforced sequentially. Track but defer until there is a concrete performance complaint.

#### Low priority

9. **Failure classifier — add `infrastructure_failure` category**
   - Severity: Low. `src/test-impact/failure-classifier.ts:3-7` only has `new_regression | pre_existing | flaky | unknown`. Adding `infrastructure_failure` (OOM, timeout, network) improves triage and unblocks downstream consumers.

10. **Flaky-detector pass-rate variance scoring**
    - Severity: Low. `src/test-impact/flaky-detector.ts:18-37` only scores alternation; non-alternating intermittent failures (pass-pass-fail-pass-pass) score 0 today.
    - Scope: add variance-based complementary signal; combine the two into a single flaky score.

11. **Analyzer — return ranked fuzzy suffix matches instead of first match**
    - Severity: Low. `src/test-impact/analyzer.ts:275-284` `break`s on first match.
    - Scope: collect all suffix matches; rank by (exact-dir > nearest-sibling-dir > other); return all for caller dedup.

12. **`analyzeFailures` scope — current-run only**
    - Severity: Low (semantic bug). `src/tools/test-runner.ts:1366-1389` re-classifies all historical failures each run; a failure labeled `flaky` last week should not be re-labeled based on this week's data.
    - Scope: pass current-run failure set into classifier; history is used only as signal, not re-classified.

13. **`appendTestRun` concurrent-write safety** (recommend: DEFER unless parallel test-runner is introduced)
    - Severity: Low in current architecture (swarm runs `test_runner` sequentially). Read-prune-rewrite pattern in `src/test-impact/history-store.ts:132-150` is unsafe under parallel callers. Track for the parallel-mutation (#8) dependency.

#### Reclassified from §1.2 after critic pass

14. **FR-020 `mutation_gap` emission in council evidence** (duplicates §1.3 #4) — the typedef exists at `src/council/types.ts:23` but the issue asks for emission, which is the open work. Retained once at §1.3 #4; this row exists only to record the reclassification.

15. **`/swarm help` command for Claude Code command visibility** (duplicates §1.3 #5) — registry-driven command metadata exists but that is not what the issue asked for. The issue asks for either `/swarm help` **or** architect-prompt injection of the command list. Retained once at §1.3 #5.

16. **`src/commands/command-names.ts` centralized registry** (triage needed)
    - Severity: Low.
    - The initial reviewer marked this "NOT NEEDED" because `COMMAND_REGISTRY` in `src/commands/registry.ts:76-338` is already a type-safe object literal. The critic pushed back: the issue explicitly asks for a centralized file paralleling `src/tools/tool-names.ts`, and grep-ability / import-hygiene are real reasons the tool side has one. This is a **design opinion**, not a closure.
    - Recommendation: triage with user. If we keep the single-registry design, document the reasoning in the sub-issue and close it as "intentional rejection." Otherwise introduce `command-names.ts` as a re-export of `Object.keys(COMMAND_REGISTRY) as CommandName[]` plus the `CommandName` union type.

### 1.4 Auto-registration: manifest vs decorator — my recommendation

**User preference:** leaning decorator; asked for full analysis because "we keep running into problems where tools are built but then not fully wired."

**Current failure mode (confirmed via reviewer):** adding a tool requires edits at **four** sites:
- `src/tools/tool-names.ts` — `TOOL_NAMES` array
- `src/tools/index.ts` — per-tool export
- `src/config/constants.ts` — `TOOL_DESCRIPTIONS` + `AGENT_TOOL_MAP`
- `src/index.ts` — plugin `tools` object wiring (line 565+)

Miss any one and you get "registered but dead." This is what happened to `diff_summary`, `test_impact`, `mutation_test`.

**Option A — Single manifest (recommended)**
```ts
// src/tools/manifest.ts
export const TOOL_MANIFEST = {
  diff_summary: {
    description: "Structural diff summary with risk ranking",
    agents: ["reviewer", "architect"],
    handler: diffSummaryTool,  // imported
  },
  // … one entry per tool
} satisfies Record<ToolName, ToolDef>;
```
- `TOOL_NAMES` becomes `Object.keys(TOOL_MANIFEST) as ToolName[]`.
- `TOOL_DESCRIPTIONS` becomes `mapValues(TOOL_MANIFEST, e => e.description)`.
- `AGENT_TOOL_MAP` is inverted from `manifest[tool].agents`.
- Plugin `tools` object is derived directly.
- Type assertion `satisfies Record<ToolName, ToolDef>` forces the compiler to complain if `ToolName` and manifest keys drift.
- A CI lint script (`scripts/check-tool-registration.ts`) adds runtime exhaustiveness as belt-and-braces.

**Pros:** one file, grep-friendly, no reflect-metadata runtime cost, works natively with Bun/TS5, enforces every tool has every field at compile time.
**Cons (revised after critic pass):**
- NOT tree-shakeable. The manifest is a single `Record<ToolName, ToolDef>`; bundlers retain every entry because `Object.keys(TOOL_MANIFEST)` reflects the whole record. If tree-shaking matters, expose individual tool entries as separate named exports and build the manifest from them lazily.
- Async initialization is awkward: storing `handler` as an imported value forces synchronous module-graph resolution. Tools that need DB handles, worker spawns, or WASM load must initialize via a deferred factory (`() => Promise<ToolHandler>`) rather than as a value. Bun supports top-level await but every consumer of the manifest would then become async. Design the manifest entry type as `handler: ToolHandler | (() => Promise<ToolHandler>)` up front.
- Runtime-conditional tools (e.g. Bun-only) still appear in the compile-time manifest. `satisfies` forces the compiler to require them even when the runtime drops them. Mitigate with a `runtime?: "bun" | "node" | "any"` field and a runtime filter.
- `satisfies Record<ToolName, ToolDef>` only enforces key completeness if `ToolDef` has no optional fields. Any optional field in `ToolDef` will silently be absent on specific tools. Make required fields non-optional; introduce a separate `ToolDefOptionalExtras` type for truly-optional metadata.

**Option B — Decorator-based (`@Tool`)**
```ts
@Tool({ name: "diff_summary", description: "...", agents: ["reviewer"] })
class DiffSummaryTool { … }
```
- Stage-3 TC39 decorators are stable in TS 5.x and Bun.
- Registration happens at class-definition side-effect.

**Pros:** definition lives next to the handler; no central file to edit.
**Cons:** side-effect-based registration is order-dependent (import graph matters); harder to statically enumerate tools; breaks when a tool file isn't imported; tree-shaking can drop a tool's registration if nothing else references it; compile-time exhaustiveness against `ToolName` becomes harder (you'd still need a central union type, so you haven't fully escaped the "edit two places" problem).

**Recommendation: Option A (manifest).** It solves the exact stated problem — "tools are built but not fully wired" — by making non-wiring a compile error, with a single file that cannot be forgotten. Decorators look more elegant but reintroduce the "is-this-file-imported" class of bug. The manifest is boring, safe, and diff-readable.

If Option A is accepted, implementation has three phases:
1. **Parallel run:** build the manifest, derive `TOOL_NAMES` / `TOOL_DESCRIPTIONS` / `AGENT_TOOL_MAP` / plugin tools from it, but keep the old sites and add a runtime assertion that the two sets are identical. Land behind a flag.
2. **Cut over:** delete the old sites; the manifest becomes the sole source of truth.
3. **Enforce:** add compile-time `satisfies` assertion and CI check.

### 1.5 Sequencing

| Phase | PRs | Content | Depends on |
|-------|-----|---------|------------|
| Phase 0 | comment only | Consolidate §1.2 evidence into a #495 comment. Mark verified closures with file:line links. No code. | — |
| Phase 2 | **1 PR, ships first** | Tool manifest auto-registration (#3). Biggest architectural change; touches `src/index.ts` plugin wiring. Landing first minimizes rebase pain for Phase 1. | — |
| Phase 1 | 1 PR | Command renames with deprecation aliases (§1.3 #1 + #2). Touches `src/commands/registry.ts` + `src/index.ts` subcommand templates. | Phase 2 (both phases modify `src/index.ts` — merging in this order avoids conflict) |
| Phase 3 | 1 PR | `mutation_gap` emission (§1.3 #4) + `/swarm help` (§1.3 #5). | Phase 2 (handler for `/swarm help` iterates the command registry, which Phase 2 does not change, but `/swarm help` copy should reflect the finalized command names from Phase 1) |
| Phase 4 | 1 PR | Per-test parsing (§1.3 #6) + analyzer multi-match (§1.3 #11) + `analyzeFailures` scope (§1.3 #12). | — (disjoint module) |
| Phase 5 | 1 PR | Failure classifier `infrastructure_failure` (§1.3 #9) + flaky variance (§1.3 #10). | Phase 4 (shared test-impact module; easier to land after per-test parsing) |
| Deferred (no schedule) | — | FR-014 (§1.3 #7), FR-019 (§1.3 #8), concurrent-write safety (§1.3 #13), `command-names.ts` triage (§1.3 #16). Track as sub-issues but do not schedule. | — |

**Ordering note (critic-pass correction):** Phase 2 (tool manifest) must ship before Phase 1 (command renames) because both modify `src/index.ts` plugin wiring and the manifest rewrite is substantially larger. Rebasing Phase 1 on Phase 2 is cheaper than the reverse.

**Phase 2 sub-plan:** the manifest migration is three logical commits in one PR (not three PRs): (a) introduce manifest alongside old sites with a runtime-assertion check that both produce identical sets; (b) delete old sites; (c) add `satisfies` compile-time assertion + CI lint. If any step breaks CI, partial rollback is trivial.

**Cut list if we slip:** Phase 5 (infrastructure_failure + flaky variance) is nice-to-have and the first thing to drop. Deferred items stay deferred. Phase 1 rename is the only item that should not be cut, because it prevents a user from running `/swarm close` thinking it means "dismiss."

Each PR closes its sub-issue(s). After the final shipped phase, close #495 with a summary comment.

### 1.6 Closure criteria for #495

- Every item in §1.2 or §1.3 is either linked to a merged PR with evidence, or has an active sub-issue that has been triaged (even if deferred).
- Final comment on #495 lists the full disposition table.
- `/swarm finalize` is live and `/swarm close` prints deprecation (the highest-risk item from the issue itself).

---

## 2. Issue #496 — Remediation Scope (reopened 2026-04-16)

### 2.1 User's new report summary

PR #501 (v6.70.0) shipped the declare_scope → authority wiring. User tested on the new release and hit two new failure modes:

1. **Bash bypasses the write guard.** Coder, blocked from writing `Gemfile` / `test/*.rb` / `application.css` via `Edit`, immediately switched to `sed -i`, `cat > file <<HEREDOC`, `rm -rf`, `printf >`, `bundle install` via bash and completed the task. Guard never fired.
2. **Architect prompt teaches the bypass.** Second delegation's task prompt contained: *"Use your bash or run_command tool to run: `echo \"{}\" > .eslintrc.json`"*. The architect, having observed a block, instructed the coder to use bash redirection instead of calling `declare_scope` to expand the authorized set.
3. **`declare_scope` did not persist across the boundary.** User's log shows `cat .swarm/scope-1.1.json` → "no scope file". The scope is held in in-memory session state that does not survive process transitions.

### 2.2 Verified root causes (independent reviewer, file:line evidence)

| # | Hypothesis | Verdict | Evidence |
|---|-----------|---------|----------|
| A | Bash is outside the write-authority guard. `isWriteTool` gates the check; bash is not in `WRITE_TOOL_NAMES`. | **CONFIRMED (Critical)** | `src/config/constants.ts:234-244` (WRITE_TOOL_NAMES does not include bash); `src/hooks/guardrails.ts:2021` (`if (isWriteTool(input.tool))` is the only authority entry point). `checkDestructiveCommand` at `src/hooks/guardrails.ts:1042-1348` inspects bash for **deletion** patterns only — it does not flag write redirects (`>`, `>>`), `sed -i`, `perl -i`, `cat > file`, `echo > file`, `printf > file`, or `tee > file`. |
| B | `declare_scope` is in-memory only; does not persist to disk, does not cross process boundaries. | **CONFIRMED (High)** | `src/tools/declare-scope.ts:322` — `session.declaredCoderScope = mergedFiles` (session memory). Fallback `pendingCoderScopeByTaskId` at `src/hooks/delegation-gate.ts:45` is a module-level in-memory Map. `resolveDeclaredScope` at `src/hooks/guardrails.ts:1515-1523` reads only in-memory state. `checkFileAuthorityWithRules` at `src/hooks/guardrails.ts:3399` accepts `declaredScope` param and applies it at lines 3552-3579 — but it is never reached from the bash path. |
| C | Architect prompt lacks `declare_scope` guidance and does not discourage bash workarounds. | **PARTIAL (High impact)** | `src/agents/architect.ts` — zero matches for `declare_scope` in the prompt. Architect is told to "DELEGATE all coding to coder" (~line 114) but has no rule for what to do when coder hits `WRITE BLOCKED`, nor any rule against bash write redirection. Not direct encouragement, but the vacuum lets the architect rationalize bash as a workaround. |
| D | Additional guard gaps also bypass bash. | **CONFIRMED (Medium)** | Symlink lstat guard `checkWriteTargetForSymlink` at `src/hooks/guardrails.ts:3319-3325` runs only for write tools, not bash. `normalizePathWithCache` at line 3420 is not applied to bash arguments. Cwd containment check at lines 3444-3455 is inside `checkFileAuthorityWithRules` and therefore never runs for bash. Net effect: bash also escapes symlink containment, path normalization, and cwd containment — the full authority model is void for shell writes. |

**Consequence:** every protection landed in PR #501 (write authority, lstat symlink guard, cwd containment) is confined to Edit/Write/Patch. A one-line bash command defeats all of it. Interpreter gating (`handleInterpreterGating` at `src/hooks/guardrails.ts:967`) can refuse bash by agent role, but once bash is allowed it has unrestricted filesystem write.

### 2.3 Proposed remediation

**Framing (critic pass):** the authority model today is a **tool-level boundary**, not a filesystem boundary. Any fix that stays at the tool layer is a **mitigation**. The only durable fix is filesystem-level interception (seccomp/Landlock on Linux, Seatbelt on macOS, Windows Job Objects / AppContainer) or running the coder in a sandbox (container / jailed worker). That is a significant project and is tracked as §2.6 below. The items in this section are **layered mitigations** that close the most common bypasses while the syscall-level fix is scoped.

**Ordering correction (critic pass):** #2 (scope persistence) must ship **before or with** #1 (bash interception). Shipping the interceptor without persistence denies bash writes to legitimately-declared paths, which would be a worse user experience than today and would likely cause users to disable the interceptor via the escape hatch.

1. **Persist declared scope to disk — ship first.**
   - Path: `.swarm/scope-{taskId}.json`.
   - Atomic write via temp file + `rename` (POSIX atomic). On Windows, use `fs.promises.rename` after `O_EXCL` write; Node/Bun handle the platform detail.
   - Concurrency: file-level lock around the atomic rename (use `proper-lockfile` or equivalent with stale-lock detection at 30s). Alternative: `O_EXCL | O_CREAT` on a lock sibling file.
   - Schema: `{ version: 1, taskId, declaredAt, expiresAt, files: [...], dirs: [...] }`. Readers fail closed on unknown `version`.
   - TTL: default 24h or until `/swarm finalize` clears it. `/swarm finalize` (Phase 1 of §1) must remove `.swarm/scope-*.json`. Expired scopes are treated as no scope.
   - Symlink guard on the scope file itself: use `lstat` before read, refuse if `.swarm/scope-*.json` is a symlink. This mirrors the existing lstat guard at `src/hooks/guardrails.ts:3319-3325` and prevents a hostile repo from pre-seeding a scope symlink that the guard would trust.
   - Write-authority path: `resolveDeclaredScope` at `src/hooks/guardrails.ts:1515-1523` is extended to prefer the on-disk file over in-memory state. In-memory state remains as a fast path only; disk is the ground truth.
   - Migration: leave `session.declaredCoderScope` and `pendingCoderScopeByTaskId` in place for one release; read disk first, fall back to memory. Remove the fallback in the next release.

2. **Bash write-interception (mitigation — not a fix).**
   - Layer 1: explicitly declare this as a mitigation in the code comment and release notes. The real fix is §2.6.
   - Layer 2: shell-command static analysis before execution. Use a real shell parser (`bash-parser`, `mvdan/sh` via subprocess, or equivalent) — not regex — to enumerate every command invocation in the command string, including subshells, command substitution, process substitution, heredocs, pipes, `eval`, `bash -c`, `sh -c`, and alias indirection. For each command:
     - If it is a known write-effect builtin (redirect `> >> <> |&`, `tee`, `exec N>`) extract the target paths and run the full authority check.
     - If it is a known write-effect binary (critic's list, expanded): `rm, rmdir, mv, cp, install, ln, truncate, dd of=, patch, sed -i, perl -i, awk -i inplace, ed, ex, vim -c :w, emacs --batch, python -c/-m, python3 -c/-m, node -e/--eval, bun -e/--eval, deno run --allow-write, ruby -e, perl -e, php -r, curl -o/--output/-O, wget -O/--output-document, scp, rsync, tar -x/--extract, unzip, gunzip, git checkout -- (destructive), git restore, git reset --hard, git clean -fd, git stash pop, docker cp, kubectl cp, make <target>, yes, seq` — ALL are routed to the authority check. When target paths cannot be statically determined (e.g. `python -c "…"`, `make foo`, `eval $cmd`), **fail closed**: deny the command unless the agent has elevated trust.
     - `watch`, `screen`, `tmux new-session`, any long-running background launcher — deny outright.
     - Process substitution `> >(tee …)` is decomposed; both the outer redirect and the inner `tee` are checked.
   - Layer 3: CI snapshot test of the full operator list. Any PR changing the list requires explicit reviewer approval. This is the anti-regression mechanism the critic asked for.
   - Layer 4: environment variable escape hatch (`SWARM_BASH_GUARD=off`) for local debugging only. Logs a loud warning and records to evidence that it was disabled.
   - Layer 5: CI fuzz harness (Linux) that generates random bash commands, runs them through the interceptor in dry-run mode, executes them under `strace -f -e trace=openat,creat,unlink,rename` in an ephemeral directory, and asserts every write syscall's target path was either (a) blocked by the interceptor or (b) within the declared scope. This is the only test that actually disproves bypasses rather than asserting known patterns.

3. **Architect prompt hardening (defense in depth, not boundary).**
   - Framing: the architect prompt is **not a security boundary**. The interceptor is. These rules reduce the rate of bad delegations; they do not prevent them. Document this in the prompt file header so future PRs don't remove the interceptor "because the prompt handles it."
   - Add rule: "If coder hits `WRITE BLOCKED`, the architect MUST call `declare_scope` with the missing path, not delegate a bash workaround."
   - Add rule: "Never instruct coder to use bash redirection, `sed -i`, or `echo >` to write files. Use Edit/Write."
   - Add rule: "Never wrap a write in `eval`, `bash -c`, `sh -c`, or a subshell."
   - Telemetry: architects that repeat a blocked pattern within a session are flagged in evidence logs; critic review treats it as a finding.

4. **Coder prompt hardening (defense in depth).**
   - Add rule: "If `Edit`/`Write` blocks, STOP and escalate to architect. Do not attempt bash alternatives."
   - Coder refuses to execute write-effect bash commands whose target paths are outside the declared scope, even when authorized, as an internal double-check.

5. **Regression test suite (expanded after critic pass).**
   - `tests/unit/guardrails/bash-write-interception.test.ts` — every operator in the Layer 2 list tested (accept inside scope, reject outside, reject when target paths are undeterminable).
   - `tests/unit/guardrails/scope-persistence.test.ts` — atomic write, concurrent declare_scope calls, stale lock recovery, schema-version fail-closed, TTL expiry, symlink rejection on scope file.
   - `tests/integration/scope-cross-process.test.ts` — architect process writes scope; separate coder process reads it and edits succeed; separate coder process attempts out-of-scope edit and it fails.
   - `tests/integration/bash-bypass-repro.test.ts` — the **exact 15 bypass patterns from the user's #496 comment**, end-to-end: architect declares `Gemfile`, coder attempts `sed -i 's/.../' Gemfile` (allowed), coder attempts `sed -i` on a non-declared file (blocked), coder attempts `cat > Procfile.dev <<HEREDOC` (allowed only if declared), coder attempts `rm -rf app/assets/tailwind` (blocked without declaration), coder attempts `bundle install` (allowed — doesn't write to source scope), etc.
   - `tests/fuzz/bash-write-syscall.test.ts` — Linux-only; strace-based fuzz harness from Layer 5 above. Runs in CI on Linux only; documented as platform-gated.
   - `tests/snapshot/bash-interceptor-operators.snap.test.ts` — asserts the operator list matches a committed snapshot. Any change requires deliberate review.
   - Architect-prompt regression test — fuzz architect with "coder got WRITE BLOCKED, what do you do?" scenarios. Run against current model AND at least one prior model snapshot. Assert `declare_scope` is called, never bash redirection. Re-run on model upgrades.

### 2.6 Separate tracked issue — filesystem-level enforcement (the real fix)

Filed as a new issue (not a sub-issue of #496). Scope: replace bash static analysis with syscall-level enforcement. Options to evaluate:
- **Linux:** seccomp-bpf with a write-syscall allowlist scoped to declared paths; or Landlock (Linux ≥ 5.13) for path-based restriction; or run coder under a bubblewrap/firejail sandbox.
- **macOS:** sandbox-exec profiles (deprecated but still functional) or `app-sandbox` entitlements; or run under a minimal container (Lima/Docker).
- **Windows:** Job Objects + `SetInformationJobObject` with restricted tokens; or Windows Sandbox.
- **Cross-platform alternative:** require the coder to run in a container (Docker/Podman) with a bind-mounted workspace and a read-only filesystem overlay for anything outside declared scope. Simpler to reason about; adds runtime dependency.

This issue carries the real security guarantee. §2.3 closes the immediate bleeding.

### 2.4 Relationship to #495

Issue #496 is **separate from #495** (#495 is TQI deferred work; #496 is a security/guardrail bug). They should not be bundled. However, the remediation cadence may share release windows; coordinate with the Phase 1-5 #495 sequencing so the guardrail fix ships first (it's security-critical and a user is waiting on v6.71+).

Proposed order (critic-pass correction: scope persistence ships first, not bash interception):
- **v6.71.1** (hotfix cadence): §2.3 #1 (scope persistence) + §2.3 #3 + §2.3 #4 (prompt hardening, defense in depth). These are safe to ship independently — they only broaden or document correct behavior.
- **v6.71.2**: §2.3 #2 (bash interception) + §2.3 #5 test suite. Requires #1 already shipped so that legitimate declared writes are actually granted instead of denied.
- **v6.72.0+**: #495 Phase 2 (tool manifest), then Phase 1 (command renames), per §1.5.
- **Parallel track (no release tie):** §2.6 filesystem-level enforcement as a new tracked issue; target v7.0 or a later minor after design review.

### 2.5 Open questions for user

- Confirm §2.3 approach or indicate preference (e.g., seccomp vs shell-parser for bash interception).
- Confirm #496 should not block #495 Phase 1 ship.
- Any constraints on changing architect/coder system prompts mid-release?

---

## 3. Execution checklist for this session

- [x] Read #495 and related issues/PRs.
- [x] Repo map via explorer subagent.
- [x] Clarifying questions answered.
- [x] Independent reviewer validation of per-item closure claims for #495.
- [x] Investigator validation of §2.2 hypotheses for #496.
- [x] Fill §2 with confirmed evidence.
- [x] Critic pass on the combined plan.
- [ ] Commit to `claude/plan-issue-495-zmJ6I` and push.
- [ ] No sub-issues created until user approves §1.3 list and §2.3 mitigation scope.
- [ ] No code changes in this session.

## 4. Open questions for user before execution

1. Confirm §1.4 manifest vs decorator recommendation. Default: manifest.
2. Confirm §2.3 bash-interception approach. Accept "mitigation now, syscall-level fix later" framing, or prefer jumping straight to §2.6 (e.g. Landlock/sandbox)?
3. Confirm §2.4 hotfix ordering (persistence v6.71.1 → interception v6.71.2 → #495 phases v6.72+).
4. Confirm scope / deferral decisions for §1.3 items #7 (FR-014), #8 (FR-019), #13 (concurrent-write safety), #16 (`command-names.ts`).
5. Approve sub-issue creation for items in §1.3, or request a different split (e.g. group related items into fewer umbrella sub-issues).
6. Any constraints on updating the architect / coder system prompts mid-release (§2.3 #3-4)?


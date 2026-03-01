# Context
Swarm: mega

## Project Overview
- Name: opencode-swarm v6.14 — Cross-Platform Compatibility & CI
- Type: TypeScript/Bun OpenCode plugin with tool, hook, and document automation
- Goals: Ensure install/build/run works on macOS, Windows, Linux. Add 3-OS CI matrix. Fix Issue #6 (npm packaging). Fix Issue #17 (architect self-coding false positives). Add LLM Provider Guide to README. Switch default config to free OpenCode Zen models.
- Baseline: v6.13.3 (commit 3460a34)
- Source plan: v6.14-cross-platform-fixes(1).md

## Decisions
- `package.json` already has no `postinstall` key — only need to remove `copy-grammars` script in Task 2.1.
- `containsPathTraversal` in test-runner.ts already handles `[/\\]` — Task 4.2 is verification only.
- `validateSwarmPath` in utils.test.ts already has backslash traversal test — Task 6.2 is verification only.
- `isCommandAvailable` in discovery.ts is already exported — Task 5.2 can import it directly.
- `architect` key intentionally OMITTED from DEFAULT_MODELS and defaultConfig — inherits OpenCode UI selection.
- Free OpenCode Zen model assignments: coder→opencode/minimax-m2.5-free, reviewer→opencode/big-pickle, test_engineer→opencode/gpt-5-nano, explorer/sme/critic/docs/designer/default→opencode/trinity-large-preview-free.
- `isSourceCodePath` helper gates self-coding detection to avoid false positives on docs/, package.json, .github/, README.md.
- Version bump: 6.13.3 → 6.14.0 in Phase 10.
- IMPORTANT: Do NOT use `pre_check_batch` with Windows absolute paths — reports false 'path traversal detected'. Use individual lint + secretscan calls instead.

## SME Cache
### security
- Validate `.swarm/events.jsonl` using `validateSwarmPath` before appending newline-delimited JSON to keep the event log parseable and safe.
- Always normalize agent names with `stripKnownSwarmPrefix` when checking required agents.
- Prevent summary loops by defaulting `exempt_tools` to `['retrieve_summary','task']`.

### cross-platform
- On Windows, `path.resolve` produces backslash paths — normalize with `.replace(/\\/g, '/')` before regex matching.
- `process.platform === 'win32'` is the standard guard for Windows-specific branching.
- `node -e "require('fs').rmSync('dist',{recursive:true,force:true})"` is the cross-platform clean command.
- `new URL(...).pathname` returns `/C:/path` on Windows — always use `fileURLToPath(new URL(...))`.

### evidence-system
- Evidence bundles at `.swarm/evidence/{task-id}/evidence.json` (EvidenceBundle schema with `entries: Evidence[]`).
- Retro convention: `task_id = 'retro-{N}'` stored at `evidence/retro-{N}/evidence.json`.

## Patterns
- Configure new tooling via `PluginConfigSchema`, keeping defaults backward-compatible.
- Tests that touch filesystem helpers always use `createIsolatedTestEnv` to keep sandboxed dirs clean.
- Documentation updates must be inserted without rearranging existing sections.
- `bun:test` framework used throughout; never jest/mocha.
- Use `createIsolatedTestEnv` from existing helpers, NOT raw `mkdtemp`.

## Codebase State (v6.14 baseline)
- `package.json`: version 6.13.3, no postinstall, HAS copy-grammars script (to remove), clean/build use `rm -rf` (to fix)
- `src/tools/test-runner.ts`: TEST_PATTERNS use hardcoded `/` — needs normalization before match; containsPathTraversal already handles `[/\\]`
- `src/build/discovery.ts`: java-gradle uses `./gradlew build` (Unix-only); isCommandAvailable IS already exported
- `src/hooks/guardrails.ts`: isArchitect/isWriteTool/isOutsideSwarmDir are private helpers; combined condition at ~line 181
- `src/cli/index.ts`: defaultConfig uses anthropic/claude-sonnet-4-20250514 — needs Zen model update
- `src/config/constants.ts`: DEFAULT_MODELS uses google/gemini-2.5-flash and anthropic models — needs Zen model update
- `tests/smoke/packaging.test.ts`: EXISTS with 8 tests for dist output
- `tests/unit/hooks/utils.test.ts`: EXISTS, backslash traversal test already present
- `.github/workflows/`: HAS release-and-publish.yml (ubuntu-only); needs ci.yml (3-OS matrix) added

## Stage Status
- Stage 0 (Baseline Recon): COMPLETE
- Stage 1 (Plan): COMPLETE (critic approved)
- Phase 1 (CI Workflow): COMPLETE
- Phase 2 (npm Packaging Fix): COMPLETE
- Phase 3 (Cross-Platform Build Scripts): COMPLETE
- Phase 4 (Path Handling test-runner.ts): COMPLETE
- Phase 5 (Platform Commands discovery.ts): COMPLETE
- Phase 6 (Cross-Platform Execution Tests): COMPLETE
- Phase 7A (Self-Coding False Positive Fix): COMPLETE
- Phase 7B (README LLM Provider Guide): COMPLETE
- Phase 8 (Test Isolation Audit): COMPLETE
- Phase 9 (Free Model Defaults): COMPLETE
- Phase 10 (Validation & Release): COMPLETE — v6.14.0 ready to commit

## Lessons Learned (carry-forward from v6.13.x)
- `pre_check_batch` reports false 'path traversal' on Windows absolute paths — use individual lint + secretscan instead
- `new URL(...).pathname` returns `/C:/path` on Windows — always use `fileURLToPath`
- Tree-sitter JS grammar recovers from missing function body brace — validate test snippets trigger errors
- Pre-filters that silently drop files before a loop hide diagnostic results — let loop emit skipped_reason
- `feat:` commit prefix triggers minor version bump in release-please — use `fix:`/`chore:` for patch work
- Always use `createIsolatedTestEnv` — raw mkdtemp leaks temp dirs on Windows
- Coder agents must not edit .swarm/plan.json (confuses with test fixture files)

## Phase Metrics — RESET
- phase_number: 0
- total_tool_calls: 0
- coder_revisions: 0
- reviewer_rejections: 0
- test_failures: 0
- security_findings: 0
- integration_issues: 0

## Agent Activity

| Tool | Calls | Success | Failed | Avg Duration |
|------|-------|---------|--------|--------------|
| bash | 804 | 804 | 0 | 7859ms |
| read | 761 | 761 | 0 | 6ms |
| todo_extract | 229 | 229 | 0 | 1ms |
| edit | 199 | 199 | 0 | 1613ms |
| grep | 173 | 173 | 0 | 58ms |
| task | 117 | 117 | 0 | 130369ms |
| glob | 78 | 78 | 0 | 58ms |
| write | 57 | 57 | 0 | 2381ms |
| retrieve_summary | 37 | 37 | 0 | 40ms |
| test_runner | 35 | 35 | 0 | 712ms |
| todowrite | 29 | 29 | 0 | 4ms |
| invalid | 22 | 22 | 0 | 2ms |
| lint | 15 | 15 | 0 | 2628ms |
| pre_check_batch | 9 | 9 | 0 | 2469ms |
| diff | 8 | 8 | 0 | 11ms |
| secretscan | 5 | 5 | 0 | 56ms |
| checkpoint | 1 | 1 | 0 | 9ms |
| webfetch | 1 | 1 | 0 | 330ms |

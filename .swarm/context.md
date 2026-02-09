# Context
Swarm: mega

## Decisions
- **Open-domain SME**: Single `sme` agent with NO hardcoded domain list. The architect determines what domain is needed and calls `@sme` with `DOMAIN: X`.
- **One SME call per domain**: Serial, not batched. Preserves full context window depth per domain.
- **Merged reviewer**: Single `reviewer` agent combines correctness + security. Architect specifies open-ended CHECK dimensions.
- **Identity in prompt only (Option C)**: Architects must NOT store swarm identity in memory blocks. System prompt is sole source of truth via {{SWARM_ID}} and {{AGENT_PREFIX}} template vars.
- **Phase 0 cleanup on mismatch (Option B)**: When swarm mismatch detected in plan.md, architect must purge stale identity memory blocks and SME cache before resuming.
- **detect_domains tool disabled by default**: Kept as optional helper but not registered unless explicitly enabled in config.
- **Breaking version bump**: 3.4.0 → 4.0.0. Agent names change (sme_* → sme, security_reviewer/auditor → reviewer).
- **Critic agent**: Read-only plan review gate. APPROVED/NEEDS_REVISION/REJECTED verdicts.
- **Advisor merged into explorer**: Gap analysis handled by second explorer call rather than separate agent.
- **Validator merged into test_engineer**: Test engineer writes AND runs tests, reports structured PASS/FAIL verdicts.
- **Architect workflow enhanced**: Phase 4.5 (Critic Gate), Phase 2 gap analysis, Phase 5 test verdict loop.
- **Delegation examples must match behavior**: Agent descriptions and delegation examples must reflect actual capabilities.

### v4.2.0 Decisions
- **Test framework: Bun test (built-in)**: Zero additional dependencies. `bun test` already in package.json scripts. `bun-types` already in devDeps.
- **Export private helpers for testability**: `deepMerge` from loader.ts and `extractFilename` from file-extractor.ts will be exported to enable direct unit testing. Critic approved this approach.
- **Test structure**: tests/unit/{config,tools,agents,hooks}/ — mirrors src/ structure.
- **Tools tested via .execute()**: ToolDefinition wrappers (detect_domains, extract_code_blocks, gitingest) tested by calling their .execute() method directly.
- **File-extractor tests use temp dirs**: extract_code_blocks writes files — tests create temp directories and clean up after.
- **Agent factory tests rely on no-custom-prompts**: loadAgentPrompt returns empty objects when no custom prompt files exist, which is the default test environment.

### v4.3.0 Decisions
- **Hook composition via composeHandlers**: Plugin API allows ONE handler per hook type. Multiple handlers composed via `composeHandlers<I,O>(...fns)` which runs handlers sequentially on shared output, each wrapped in safeHook.
- **safeHook is the safety net**: No registration rollback needed. Hooks mutate output in place; safeHook catches errors and leaves output unchanged. Log error stack at warning level.
- **Renamed "Agent Message Passing" → "Agent Awareness"**: No message queues or routing. Just activity tracking + cross-agent context injection via system prompts. Architect remains sole orchestrator.
- **Slash commands via config hook**: OpenCode Config type has `command?: { [key: string]: { template, description } }`. No separate `command.register` API exists. Use `config` hook to add `swarm` command, `command.execute.before` to handle it.
- **Context pruning leverages OpenCode compaction**: Use `experimental.session.compacting` hook to guide OpenCode's built-in session compaction. Inject plan.md phase + context.md decisions as compaction context.
- **Token estimation**: Conservative 0.33 chars-per-token ratio. Context limits configurable per-model via `context_budget.model_limits`.
- **Grouped config**: New flags under `hooks: {}` and `context_budget: {}` objects, not flat booleans.
- **All hook file I/O is async**: Use Bun.file().text() via readSwarmFileAsync, never sync fs calls.
- **Cross-agent context injection configurable**: `hooks.agent_awareness_max_chars` (default: 300).

## Architecture (Post-Enhancement)
Agents per swarm: 7 subagents + 1 architect = 8 total
- architect (primary, orchestrator)
- explorer (subagent, read-only, codebase analysis + gap analysis)
- sme (subagent, read-only, open-domain expertise)
- coder (subagent, read-write, implementation)
- reviewer (subagent, read-only, correctness + security)
- critic (subagent, read-only, plan review gate)
- test_engineer (subagent, write tests + run them, structured PASS/FAIL verdicts)

## OpenCode Plugin API Hooks (v1.1.19)
```typescript
interface Hooks {
  event?, config?, tool?, auth?,
  "chat.message"?          // New message (sessionID, agent, model, parts)
  "chat.params"?           // Modify LLM params (temperature, topP, topK)
  "chat.headers"?          // Modify request headers
  "permission.ask"?        // Permission gate
  "command.execute.before"? // Intercept slash commands
  "tool.execute.before"?   // Before tool use
  "tool.execute.after"?    // After tool use
  "experimental.chat.messages.transform"?  // Transform message array (USED: pipeline-tracker + context-budget)
  "experimental.chat.system.transform"?    // Transform system prompt (USED: system-enhancer)
  "experimental.session.compacting"?       // Customize compaction (USED: compaction-customizer)
  "experimental.text.complete"?            // Text completion
}
```

## Delegation Formats

### SME
```
@{{AGENT_PREFIX}}sme
TASK: Advise on [topic]
DOMAIN: [any domain]
INPUT: [context]
OUTPUT: CRITICAL, APPROACH, API, GOTCHAS, DEPS
```

### Critic
```
@{{AGENT_PREFIX}}critic
TASK: Review plan for [description]
PLAN: [plan.md content]
CONTEXT: [codebase summary]
OUTPUT: VERDICT + CONFIDENCE + ISSUES + SUMMARY
```

### Reviewer
```
@{{AGENT_PREFIX}}reviewer
TASK: Review [description]
FILE: [path]
CHECK: [security, correctness, edge-cases, etc.]
OUTPUT: VERDICT + RISK + ISSUES
```

## Patterns
- Agent factory: `createXAgent(model, customPrompt?, customAppendPrompt?) → AgentDefinition`
- Swarm prefixing: `prefix = isDefault ? '' : '${swarmId}_'`
- Config cascade: user (~/.config/opencode/) → project (.opencode/) with deep merge
- Custom prompts: `{agent}.md` replaces, `{agent}_append.md` appends
- Read-only agents: `tools: { write: false, edit: false, patch: false }`
- Hook pattern: `safeHook(handler)` wraps all hooks; `composeHandlers()` for same-type composition

## File Map
- Entry: `src/index.ts`
- Agent factory: `src/agents/index.ts`
- Agent defs: `src/agents/{name}.ts`
- Config: `src/config/schema.ts`, `constants.ts`, `loader.ts`
- Tools: `src/tools/domain-detector.ts`, `file-extractor.ts`, `gitingest.ts`
- Hooks: `src/hooks/pipeline-tracker.ts`, `src/hooks/index.ts`
- Hooks (v4.3.0): `src/hooks/utils.ts`, `system-enhancer.ts`, `compaction-customizer.ts`, `context-budget.ts`, `agent-activity.ts`, `delegation-tracker.ts`
- Commands (v4.3.0): `src/commands/index.ts`, `status.ts`, `plan.ts`, `agents.ts`
- Docs: `README.md`, `CHANGELOG.md`, `docs/architecture.md`, `docs/design-rationale.md`, `docs/installation.md`
- Tests: `tests/unit/{config,tools,agents,hooks,commands}/`

## SME Cache

### Plugin Architecture (v4.3.0)
- Fix inject_phase_reminders: use `!== false` instead of `=== true`
- safeHook pattern: try/catch wrapper, log warning, return original payload on error
- composeHandlers: run handlers sequentially on shared mutable output, each individually wrapped in safeHook
- All hooks stateless — mutable state belongs in service singletons or .swarm/ files
- Don't mutate incoming payload directly; for message transforms, modify the output object properties
- Guard experimental API usage with feature detection where possible
- Hook failures must never crash the plugin

### TypeScript Schema Design (v5.0.0)
- Schema versioning: literal `schema_version` field, version-specific schema registry, idempotent migration functions
- Zod v4: use `z.literal()` for version, `z.enum()` for status fields, `.extend()` for schema composition, `BaseEvidenceSchema.extend()` for evidence types
- Dates: always `z.string().datetime()` for JSON persistence, never `z.date()`
- Optional vs missing: `JSON.stringify()` omits undefined — use explicit null if "no value" must be preserved
- Atomic writes: temp file + `rename()` — atomic on both POSIX and Windows
- Migration: parse in phases (metadata → structure → tasks), warn but don't fail on ambiguous content, validate final output with Zod, backup original before overwriting
- Schema evolution: never remove fields in minor versions, only add optional ones. Breaking changes require major version + migration function.

### Security — Evidence & Plan I/O (v5.0.0)
- Task ID sanitization: regex `^[\w-]+(\.[\w-]+)*$` before path construction, reject `..`, null bytes, control chars
- Two-layer path validation: (1) sanitize task ID, (2) `validateSwarmPath()` on full constructed path
- Evidence file size limits: JSON files 500KB, diff.patch 5MB, total per task 20MB
- Content injection: evidence files safe to store as-is, must escape when rendering (never execute evidence content)
- Concurrent writes: `mkdir({ recursive: true })` handles EEXIST, use temp+rename for atomicity
- Symlink check: verify no symlinks with `fs.lstat()` before writing evidence on untrusted filesystems
- `validateSwarmPath()` needs verification for nested subdirectory paths like `evidence/1.1/review.json`

### LLM Context Management (v4.3.0)
- Can't delete messages from history, only transform/inject via hooks
- Main pruning lever: `experimental.session.compacting` hook — guide OpenCode's built-in compaction
- Token estimate: chars * 0.33 (conservative, sufficient for budget warnings)
- Phase-boundary summarization: at phase transitions, offload detail to .swarm/context.md
- Preserve verbatim: task requirements, file paths, key decisions, error messages
- Safe to summarize: intermediate discussion, exploration results, verbose tool output
- System prompt injection keeps agents focused post-compaction
- Budget warnings at 70% and 90% thresholds (configurable)
- Different agents need different context: coder needs code, reviewer needs code + requirements, architect needs everything

## Agent Activity

| Tool | Calls | Success | Failed | Avg Duration |
|------|-------|---------|--------|--------------|
| read | 246 | 246 | 0 | 5ms |
| bash | 155 | 155 | 0 | 1021ms |
| edit | 115 | 115 | 0 | 1225ms |
| task | 28 | 28 | 0 | 148571ms |
| write | 25 | 25 | 0 | 3050ms |
| todowrite | 18 | 18 | 0 | 2ms |
| grep | 16 | 16 | 0 | 70ms |
| glob | 15 | 15 | 0 | 29ms |
| memory_set | 1 | 1 | 0 | 8ms |
| invalid | 1 | 1 | 0 | 1ms |

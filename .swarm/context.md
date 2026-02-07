# Context
Swarm: paid

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
- **v4.3.0 deferred**: Context Pruning + Hooks Pipeline Enhancement + Agent Message Passing + Slash Commands planned for future release after test suite is established.

## Architecture (Post-Enhancement)
Agents per swarm: 7 subagents + 1 architect = 8 total
- architect (primary, orchestrator)
- explorer (subagent, read-only, codebase analysis + gap analysis)
- sme (subagent, read-only, open-domain expertise)
- coder (subagent, read-write, implementation)
- reviewer (subagent, read-only, correctness + security)
- critic (subagent, read-only, plan review gate)
- test_engineer (subagent, write tests + run them, structured PASS/FAIL verdicts)

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

## File Map
- Entry: `src/index.ts`
- Agent factory: `src/agents/index.ts`
- Agent defs: `src/agents/{name}.ts`
- Config: `src/config/schema.ts`, `constants.ts`, `loader.ts`
- Tools: `src/tools/domain-detector.ts`, `file-extractor.ts`, `gitingest.ts`
- Hooks: `src/hooks/pipeline-tracker.ts`
- Docs: `README.md`, `CHANGELOG.md`, `docs/architecture.md`, `docs/design-rationale.md`, `docs/installation.md`
- Tests: `tests/unit/{config,tools,agents,hooks}/` (v4.2.0)

## SME Cache
(No SME consultations needed for v4.2.0 — test suite is a well-understood domain)

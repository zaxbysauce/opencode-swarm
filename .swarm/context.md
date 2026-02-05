# Context
Swarm: mega

## Decisions
- **Open-domain SME**: Single `sme` agent with NO hardcoded domain list. The architect determines what domain is needed (could be ios, android, rust, anything) and calls `@sme` with `DOMAIN: X`. The LLM's training provides the expertise — no need for curated domain snippets.
- **One SME call per domain**: Architect calls `@sme` once per domain serially (not batched). This preserves full context window depth per domain and matches the existing serial consultation rhythm.
- **Merged reviewer**: Single `reviewer` agent combines correctness + security. Architect specifies open-ended CHECK dimensions (not a fixed list).
- **Identity in prompt only (Option C)**: Architects must NOT store swarm identity in memory blocks. System prompt is sole source of truth via {{SWARM_ID}} and {{AGENT_PREFIX}} template vars.
- **Phase 0 cleanup on mismatch (Option B)**: When swarm mismatch detected in plan.md, architect must purge stale identity memory blocks and SME cache before resuming.
- **detect_domains tool disabled by default**: Kept as optional helper but not registered unless explicitly enabled in config. Architect determines domains intelligently, not via regex.
- **DOMAIN_PATTERNS removed from constants.ts**: Only exists inside domain-detector.ts as the tool's own data. Not used for agent creation.
- **Breaking version bump**: 3.4.0 → 4.0.0. Agent names change (sme_* → sme, security_reviewer/auditor → reviewer), config options removed (multi_domain_sme, auto_detect_domains).
- **Reviewer naming follows swarm prefix**: `mega_reviewer`, `local_reviewer`, etc. Same pattern as all other agents.

## Architecture (Post-Refactor)
Agents per swarm: 6 subagents + 1 architect = 7 total
- architect (primary, orchestrator)
- explorer (subagent, read-only, codebase analysis)
- sme (subagent, read-only, open-domain expertise)
- coder (subagent, read-write, implementation)
- reviewer (subagent, read-only, correctness + security)
- test_engineer (subagent, read-only tools but can write test files)

## SME Delegation Format (New)
```
@{{AGENT_PREFIX}}sme
TASK: Advise on [topic]
DOMAIN: [any domain - ios, security, rust, mobile, etc.]
INPUT: [context]
OUTPUT: CRITICAL, APPROACH, API, GOTCHAS, DEPS
```
One call per domain. Architect calls serially.

## Reviewer Delegation Format (New)
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

## SME Cache
(No SME consultations needed - this is a self-referential refactor of the plugin itself)

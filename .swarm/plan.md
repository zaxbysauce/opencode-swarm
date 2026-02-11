# Remove @agent routing prefixes from delegation prompts
Swarm: paid
Phase: 1 [PENDING] | Updated: 2026-02-10

## Thesis
The architect's delegation prompts include `@agent_name` prefixes that leak into subagent context, causing subagents to waste tool calls attempting self-delegation via the Task tool. Remove all `@agent_name` routing metadata from prompt text — routing is handled by the `subagent_type` parameter on the Task tool.

---

## Phase 1: Remove @agent prefixes [PENDING]

- [ ] 1.1: Update src/agents/architect.ts — remove `@{{AGENT_PREFIX}}` from all delegation format examples, agent list, workflow steps, and rules. Keep `{{AGENT_PREFIX}}` (without @) in the IDENTITY section agent list for informational awareness only. [MEDIUM]
- [ ] 1.2: Update .swarm/context.md Delegation Formats section — remove `@{{AGENT_PREFIX}}` prefixes from SME, Critic, and Reviewer example formats [SMALL]
- [ ] 1.3: Update docs/installation.md line 143 — remove `@local_` prefix reference [SMALL]
- [ ] 1.4: Update tests/unit/agents/creation.test.ts if any assertions check for `@{{AGENT_PREFIX}}` patterns [SMALL]
- [ ] 1.5: Update persona memory block — add rule about not including @ prefixes in delegation prompts [SMALL]
- [ ] 1.6: Build, run full test suite, verify 883+ tests pass [SMALL]

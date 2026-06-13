## Unified injection budget pool (WP5, #1234)

### What changed

Added a per-request character budget coordinator that prevents multiple
injection systems (memory recall, knowledge directives, curator briefing,
delegate directives, skill recommendations) from exceeding a total
injection limit when sharing the same LLM context window.

Two pool scopes:

- **Architect pool** (messagesTransform): coordinates memory recall,
  knowledge directives, and curator briefing within a configurable char
  budget (default 3 000 chars).
- **Delegate pool** (tool.execute.before): coordinates delegate
  directives and skill recommendations within a configurable char budget
  (default 4 000 chars).

Each source has a proportional share with a minimum-chars floor. Draws
are first-come-first-served; committing less than allocated returns
surplus for lower-priority sources.

### Architecture decision

Memory = episodic recall (auto-retrieved). Knowledge = enforceable
directives (curator-curated, compliance-tracked). Formally partitioned,
not converged. The budget pool coordinates their char usage without
merging their retrieval or governance models.

### Configuration

New optional block under `context_budget`:

```yaml
context_budget:
  injection_budget:
    enabled: true             # default true; set false to disable pooling
    architect_pool_chars: 3000 # total chars for architect injections
    delegate_pool_chars: 4000  # total chars for delegate injections
    source_shares:             # optional per-source share overrides
      knowledge_directives: 0.45
      memory_recall: 0.40
      curator_briefing: 0.15
```

### Migration

No migration required. The pool is fail-open: when absent or disabled,
each injection system falls back to its standalone budget.

### Breaking changes

None.

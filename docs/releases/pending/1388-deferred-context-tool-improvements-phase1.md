# Deferred context-tool improvements (Phase 1)

## What changed

Phase 1 of issue #1388 delivers two related improvements to context management.

### FR-001: `context_status` tool

A new read-only tool (`src/tools/context-status.ts`) that architects can invoke on demand to query context-window headroom without triggering reactive warning injection. Returns:

- `tokensUsed` — estimated tokens across all text parts in the session
- `modelLimit` — resolved model context limit (falls back to 128,000 when unknown)
- `usagePercent` — ratio of tokens-used to model-limit
- `thresholdCrossed` — `'none' | 'warn' | 'critical'` using strict `>` boundary semantics matching the live hook
- `modelId` — model identifier detected from the most recent assistant message
- `provider` — provider identifier detected from the most recent assistant message

**Key properties:**
- Works whether `context_budget.enabled` is true or false
- No state mutation, no warning injection into the message stream
- Uses `_internals` DI seam so tests can replace `loadPluginConfig` and `fetchSessionMessages` without `mock.module` leakage
- Exported `computeContextHeadroom` for direct unit testing

Registered in `src/tools/index.ts`, `src/tools/manifest.ts`, and `src/tools/tool-metadata.ts` under agent `architect`.

### FR-002: Unified injection budget

The system-enhancer (system prompt injection, 4K token cap via `max_injection_tokens`) and knowledge-injector (knowledge injection, 2K char cap via `inject_char_budget`) now share a single configurable ceiling via `context_budget.unified_injection_tokens` (the `context_budget` config block, FR-002 in `src/config/schema.ts`).

**Behavior:**
- When `unified_injection_tokens` is set, the system-enhancer receives a proportional allocation via `allocateInjectionBudget()`; the knowledge-injector receives the remainder
- If one component alone exceeds the ceiling, the other gets zero
- When `unified_injection_tokens` is null/undefined (default), legacy independent caps apply unchanged

**Opt-in:** the field is `optional()` — no behavior change unless explicitly configured.

## Why

Architects needed a way to inspect context headroom on demand without the reactive advisory injection that the context-budget hook performs. The unified injection budget gives operators a single knob to control total swarm-injected context across both hooks rather than tuning them independently.

## Migration notes

- `context_status` is a new tool — no migration needed, available immediately to architects
- `unified_injection_tokens` is opt-in — existing configs are unaffected
- When `unified_injection_tokens` is set, `max_injection_tokens` still caps the system-enhancer's independent upper bound before proportional split

## Breaking changes

None.

## Test coverage

- `tests/unit/tools/context-status.test.ts` — unit tests for `context_status` tool surface and execute
- `tests/integration/unified-injection-budget.test.ts` — integration tests for unified budget proportional split and opt-in semantics

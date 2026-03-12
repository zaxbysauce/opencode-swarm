# Curator Implementation Plan

## Objective

Add a CURATOR mode to the explorer agent that runs at phase boundaries to consolidate context, update knowledge, and surface compliance deviations. After the curator gathers data, the critic runs an automated DRIFT-CHECK using the curator's structured output + the original plan to score total project drift. No new agent. No new agent slot. Explorer gets two new modes: `CURATOR_INIT` (session start) and `CURATOR_PHASE` (phase end). The critic's existing `DRIFT-CHECK` mode is reused with a new automated trigger path. Fully optional, disabled by default.

---

## Architecture

### Mode Design

Explorer currently runs in default discovery mode. This plan adds two curator modes triggered by the phase lifecycle:

- **CURATOR_INIT** — Runs once at session start (before Phase 1 begins). Reads prior session summaries + high-confidence hive entries. Produces an architect briefing. Flags contradictions between knowledge entries and current project state.
- **CURATOR_PHASE** — Runs at each phase boundary (after `phase_complete` succeeds). Consolidates the completed phase's events, evidence, and decisions into three outputs: (1) phase digest, (2) knowledge updates, (3) compliance report.

### Two-Stage Pipeline: Curator → Critic

After the curator produces its phase digest and compliance report, the critic automatically runs a DRIFT-CHECK using that data as structured input. This is a two-stage pipeline:

1. **Stage 1 — Curator (explorer, fast/cheap model)**: Gathers events, evidence, compliance observations. Produces phase digest. Writes `curator-summary.json`.
2. **Stage 2 — Critic (strong model)**: Reads curator output + `plan.json`/`plan.md` + `spec.md`. Compares planned vs actual. Scores drift severity. Produces drift report. Writes `.swarm/drift-report-phase-N.json`.

The critic's existing `DRIFT-CHECK` mode already does plan-vs-implementation comparison. The difference here is the trigger: instead of the architect manually delegating to the critic, the curator pipeline automatically invokes it with pre-gathered structured data. This means the critic only runs in drift-check mode when called by the curator pipeline — not on every general-purpose critic delegation (sounding board, plan review, etc.).

### Why Two Stages

- **Curator stays fast and cheap** — it reads files, filters events, builds structured data. No deep reasoning. Uses the explorer's fast model.
- **Critic does expensive reasoning** — compares plan trajectory across phases, identifies compounding drift, scores severity, recommends course corrections. Uses a stronger model (the critic's configured model).
- **Separation of concerns** — data gathering vs analysis. The curator can run even if the critic stage fails. The critic gets clean pre-structured input instead of parsing raw event logs.

### Context Strategy

Self-compressing. Each CURATOR_PHASE run reads:
1. Its own prior summary (`.swarm/curator-summary.json`) — the running digest
2. High-confidence swarm knowledge entries (confidence >= 0.7) from `.swarm/knowledge.jsonl`
3. Current phase events from `.swarm/events.jsonl` (filtered to current phase window)
4. Current phase evidence bundles from `.swarm/evidence/`
5. Current phase decisions from `.swarm/context.md`

This is O(1) history cost — the summary is iteratively extended per the anchored iterative summarization pattern. Never regenerated from scratch.

The critic's drift-check reads:
1. Curator's `CuratorPhaseResult` (structured, already summarized)
2. `.swarm/plan.md` or `plan.json` (the original plan)
3. `.swarm/spec.md` (the spec, if present)
4. Prior drift reports (`.swarm/drift-report-phase-*.json`) for trajectory analysis

### Compliance Auditing

Read-only observability. The curator does NOT enforce gates — that is R1-R12 gate enforcement scope. The curator surfaces patterns:
- Which agents were dispatched vs expected
- Whether reviewer was called for each coder task
- Whether retrospectives were written before phase_complete
- Whether SME was consulted when new domains were detected

The critic elevates this to project-level drift analysis:
- Spec alignment: are completed tasks actually satisfying FR-### requirements?
- Scope drift: are tasks being added/modified that weren't in the plan?
- Compounding drift: are small per-phase deviations accumulating into major trajectory changes?

Both are reports. The architect reads them and decides. No blocking.

### Drift Report Injection

The critic's drift report summary is injected into the architect's context for the next phase via the existing `knowledge-injector.ts` pattern. This ensures the architect sees drift observations before starting the next phase. The full drift report stays on disk at `.swarm/drift-report-phase-N.json` for reference.

---

## Config

### New Config Block: `curator`

Location: top-level in `opencode-swarm.json` alongside existing blocks.

```typescript
interface CuratorConfig {
  /** Enable curator mode. Default: false */
  enabled: boolean;
  /** Run CURATOR_INIT at session start. Default: true (when curator enabled) */
  init_enabled: boolean;
  /** Run CURATOR_PHASE at phase boundaries. Default: true (when curator enabled) */
  phase_enabled: boolean;
  /** Maximum tokens for curator summary. Default: 2000 */
  max_summary_tokens: number;
  /** Minimum confidence for knowledge entries to include in curator context. Default: 0.7 */
  min_knowledge_confidence: number;
  /** Include compliance report in phase digest. Default: true */
  compliance_report: boolean;
  /** Suppress TUI warnings from curator (emit events.jsonl only). Default: true */
  suppress_warnings: boolean;
  /** Maximum chars for drift report summary injected into architect context. Default: 500 */
  drift_inject_max_chars: number;
}
```

### Default Config

```json
{
  "curator": {
    "enabled": false,
    "init_enabled": true,
    "phase_enabled": true,
    "max_summary_tokens": 2000,
    "min_knowledge_confidence": 0.7,
    "compliance_report": true,
    "suppress_warnings": true,
    "drift_inject_max_chars": 500
  }
}
```

### Documentation Requirements

All config keys must be documented in `docs/planning.md` and the README config table. Document:
- Default behavior: curator is OFF. No change to existing behavior unless explicitly enabled.
- When enabled: explorer runs in CURATOR mode at phase boundaries, followed by critic DRIFT-CHECK. This adds latency at each phase transition (one fast explorer call + one stronger critic call).
- `suppress_warnings: true` means compliance deviations and drift observations are logged to `events.jsonl` and the curator/drift report files only — no TUI warnings. Set `false` to surface warnings to the architect's context.
- The critic drift-check is automatic when the curator is enabled. It only fires as part of the curator pipeline at phase boundaries — it does NOT fire on general-purpose critic delegations (sounding board, plan review, etc.).
- The drift report summary (capped at `drift_inject_max_chars`) is injected into the architect's context at the start of the next phase. Full report available at `.swarm/drift-report-phase-N.json`.

---

## File Changes

### New Files

| File | Purpose |
|------|---------|
| `src/hooks/curator.ts` | Core curator logic: `runCuratorInit()`, `runCuratorPhase()`, summary I/O, compliance check |
| `src/hooks/curator-drift.ts` | Critic drift analysis: `runCriticDriftCheck()`, drift report I/O, drift injection builder |
| `src/hooks/curator-types.ts` | Type definitions: `CuratorSummary`, `CuratorPhaseDigest`, `ComplianceReport`, `DriftReport`, `CuratorConfig` |
| `src/__tests__/hooks/curator.test.ts` | Unit tests for curator logic |
| `src/__tests__/hooks/curator-drift.test.ts` | Unit tests for critic drift analysis |
| `src/__tests__/hooks/curator.adversarial.test.ts` | Adversarial tests: corrupt summary, missing events, oversized context |

### Modified Files

| File | Change |
|------|--------|
| `src/config/schema.ts` | Add `CuratorConfigSchema` (Zod), add `curator` to `PluginConfigSchema` |
| `src/agents/explorer.ts` | Add `CURATOR_INIT_PROMPT` and `CURATOR_PHASE_PROMPT` constants, export `createExplorerCuratorAgent()` factory |
| `src/agents/critic.ts` | Add `CURATOR_DRIFT_PROMPT` constant for curator-triggered drift check, export `createCriticDriftAgent()` factory |
| `src/tools/phase-complete.ts` | After successful phase completion + knowledge curation, invoke `runCuratorPhase()` then `runCriticDriftCheck()` if curator enabled |
| `src/hooks/phase-monitor.ts` | On first phase detection (session init), invoke `runCuratorInit()` if curator enabled |
| `src/hooks/knowledge-injector.ts` | Add drift report injection path: read latest drift report, inject truncated summary into architect context |
| `src/background/event-bus.ts` | Add event types: `'curator.init.completed'`, `'curator.phase.completed'`, `'curator.drift.completed'`, `'curator.error'` |
| `src/config/constants.ts` | No change to `AGENT_TOOL_MAP` — curator reuses explorer's tool set, drift-check reuses critic's tool set |
| `src/hooks/knowledge-curator.ts` | Add optional curator knowledge-update path: `applyCuratorKnowledgeUpdates()` for promote/archive recommendations |
| `docs/planning.md` | Document curator config block, defaults, behavior, drift analysis |
| `README.md` | Add curator rows to config table |

---

## Type Definitions

### File: `src/hooks/curator-types.ts`

```typescript
/** Curator summary — anchored iterative format. Persisted to .swarm/curator-summary.json */
export interface CuratorSummary {
  schema_version: 1;
  session_id: string;
  last_updated: string; // ISO 8601
  last_phase_covered: number;
  /** Running digest — extended each phase, never regenerated */
  digest: string;
  /** Phase-level digests for lookup */
  phase_digests: PhaseDigestEntry[];
  /** Accumulated compliance observations */
  compliance_observations: ComplianceObservation[];
  /** Knowledge update recommendations from the last curator run */
  knowledge_recommendations: KnowledgeRecommendation[];
}

export interface PhaseDigestEntry {
  phase: number;
  timestamp: string;
  summary: string;
  agents_used: string[];
  tasks_completed: number;
  tasks_total: number;
  key_decisions: string[];
  blockers_resolved: string[];
}

export interface ComplianceObservation {
  phase: number;
  timestamp: string;
  type: 'missing_reviewer' | 'missing_retro' | 'missing_sme' | 'skipped_test' | 'workflow_deviation';
  description: string;
  severity: 'info' | 'warning';
}

export interface KnowledgeRecommendation {
  action: 'promote' | 'archive' | 'flag_contradiction';
  entry_id?: string;
  lesson: string;
  reason: string;
}

/** Drift report — produced by critic after curator phase run */
export interface DriftReport {
  schema_version: 1;
  phase: number;
  timestamp: string; // ISO 8601
  /** Overall alignment verdict */
  alignment: 'ALIGNED' | 'MINOR_DRIFT' | 'MAJOR_DRIFT' | 'OFF_SPEC';
  /** Severity score 0.0-1.0 (0 = perfectly aligned, 1 = completely off-spec) */
  drift_score: number;
  /** First deviation point if drift detected */
  first_deviation: {
    phase: number;
    task: string;
    description: string;
  } | null;
  /** Compounding effects across phases */
  compounding_effects: string[];
  /** Recommended course corrections */
  corrections: string[];
  /** Spec requirements checked */
  requirements_checked: number;
  /** Spec requirements satisfied */
  requirements_satisfied: number;
  /** Scope additions not in original plan */
  scope_additions: string[];
  /** Truncated summary for architect context injection */
  injection_summary: string;
}

export interface CuratorConfig {
  enabled: boolean;
  init_enabled: boolean;
  phase_enabled: boolean;
  max_summary_tokens: number;
  min_knowledge_confidence: number;
  compliance_report: boolean;
  suppress_warnings: boolean;
  drift_inject_max_chars: number;
}

export interface CuratorInitResult {
  briefing: string;
  contradictions: string[];
  knowledge_entries_reviewed: number;
  prior_phases_covered: number;
}

export interface CuratorPhaseResult {
  phase: number;
  digest: PhaseDigestEntry;
  compliance: ComplianceObservation[];
  knowledge_recommendations: KnowledgeRecommendation[];
  summary_updated: boolean;
}

export interface CriticDriftResult {
  phase: number;
  report: DriftReport;
  report_path: string; // .swarm/drift-report-phase-N.json
  injection_text: string; // truncated summary for architect context
}
```

---

## Implementation Tasks

### Task 1: Config Schema

**File**: `src/config/schema.ts`

1. Add `CuratorConfigSchema` using Zod:
```typescript
export const CuratorConfigSchema = z.object({
  enabled: z.boolean().default(false),
  init_enabled: z.boolean().default(true),
  phase_enabled: z.boolean().default(true),
  max_summary_tokens: z.number().min(500).max(8000).default(2000),
  min_knowledge_confidence: z.number().min(0).max(1).default(0.7),
  compliance_report: z.boolean().default(true),
  suppress_warnings: z.boolean().default(true),
  drift_inject_max_chars: z.number().min(100).max(2000).default(500),
});

export type CuratorConfig = z.infer<typeof CuratorConfigSchema>;
```

2. Add `curator` field to `PluginConfigSchema`:
```typescript
curator: CuratorConfigSchema.optional().default({}),
```

3. Export `CuratorConfig` type.

**Validation**: `bun test` passes. Schema parse of `{}` produces all defaults. Schema parse of `{ "curator": { "enabled": true } }` merges with defaults.

---

### Task 2: Type Definitions

**File**: `src/hooks/curator-types.ts`

Create the file with all types from the Type Definitions section above. No logic, types only. Includes both curator types (`CuratorSummary`, `CuratorPhaseResult`, etc.) and drift types (`DriftReport`, `CriticDriftResult`).

**Validation**: TypeScript compiles with no errors.

---

### Task 3: Event Bus Extension

**File**: `src/background/event-bus.ts`

Add four event types to `AutomationEventType`:
```typescript
| 'curator.init.completed'
| 'curator.phase.completed'
| 'curator.drift.completed'
| 'curator.error'
```

No other changes. These follow the existing event naming convention.

**Validation**: TypeScript compiles. Existing event-bus tests pass.

---

### Task 4: Explorer Curator Prompts

**File**: `src/agents/explorer.ts`

Add two new prompt constants after `EXPLORER_PROMPT`:

```typescript
const CURATOR_INIT_PROMPT = `## IDENTITY
You are Explorer in CURATOR_INIT mode. You consolidate prior session knowledge into an architect briefing.
DO NOT use the Task tool to delegate. You ARE the agent that does the work.

INPUT FORMAT:
TASK: CURATOR_INIT
PRIOR_SUMMARY: [JSON or "none"]
KNOWLEDGE_ENTRIES: [JSON array of high-confidence entries]
PROJECT_CONTEXT: [context.md excerpt]

ACTIONS:
- Read the prior summary to understand session history
- Cross-reference knowledge entries against project context
- Identify contradictions (knowledge says X, project state shows Y)
- Produce a concise briefing for the architect

RULES:
- Output under 2000 chars
- No code modifications
- Flag contradictions explicitly with CONTRADICTION: prefix
- If no prior summary exists, state "First session — no prior context"

OUTPUT FORMAT:
BRIEFING:
[concise summary of prior session state, key decisions, active blockers]

CONTRADICTIONS:
- [entry_id]: [description] (or "None detected")

KNOWLEDGE_STATS:
- Entries reviewed: [N]
- Prior phases covered: [N]
`;

const CURATOR_PHASE_PROMPT = `## IDENTITY
You are Explorer in CURATOR_PHASE mode. You consolidate a completed phase into a digest.
DO NOT use the Task tool to delegate. You ARE the agent that does the work.

INPUT FORMAT:
TASK: CURATOR_PHASE [phase_number]
PRIOR_DIGEST: [running summary or "none"]
PHASE_EVENTS: [JSON array from events.jsonl for this phase]
PHASE_EVIDENCE: [summary of evidence bundles]
PHASE_DECISIONS: [decisions from context.md]
AGENTS_DISPATCHED: [list]
AGENTS_EXPECTED: [list from config]

ACTIONS:
- Extend the prior digest with this phase's outcomes (do NOT regenerate from scratch)
- Identify workflow deviations: missing reviewer, missing retro, skipped test_engineer
- Recommend knowledge updates: entries to promote, archive, or flag as contradicted
- Summarize key decisions and blockers resolved

RULES:
- Output under 2000 chars
- No code modifications
- Compliance observations are READ-ONLY — report, do not enforce
- Extend the digest, never replace it

OUTPUT FORMAT:
PHASE_DIGEST:
phase: [N]
summary: [what was accomplished]
agents_used: [list]
tasks_completed: [N]/[total]
key_decisions: [list]
blockers_resolved: [list]

COMPLIANCE:
- [type]: [description] (or "No deviations observed")

KNOWLEDGE_UPDATES:
- [action] [entry_id or "new"]: [reason] (or "No recommendations")

EXTENDED_DIGEST:
[the full running digest with this phase appended]
`;
```

Add factory function:
```typescript
export function createExplorerCuratorAgent(
  model: string,
  mode: 'CURATOR_INIT' | 'CURATOR_PHASE',
  customAppendPrompt?: string,
): AgentDefinition {
  const basePrompt = mode === 'CURATOR_INIT' ? CURATOR_INIT_PROMPT : CURATOR_PHASE_PROMPT;
  const prompt = customAppendPrompt ? `${basePrompt}\n\n${customAppendPrompt}` : basePrompt;

  return {
    name: 'explorer',
    description: `Explorer in ${mode} mode — consolidates context at phase boundaries.`,
    config: {
      model,
      temperature: 0.1,
      prompt,
      tools: {
        write: false,
        edit: false,
        patch: false,
      },
    },
  };
}
```

**Validation**: TypeScript compiles. `createExplorerCuratorAgent()` returns valid `AgentDefinition`. Existing explorer tests pass unchanged.

---

### Task 5: Critic Drift Prompt

**File**: `src/agents/critic.ts`

Add a new prompt constant after the existing `CRITIC_PROMPT`. This is distinct from the manual DRIFT-CHECK mode already in the critic prompt. The manual DRIFT-CHECK is triggered by architect delegation with `"DRIFT-CHECK phase N"`. This new `CURATOR_DRIFT_PROMPT` is triggered only by the curator pipeline and receives pre-structured input from the curator instead of reading raw files.

```typescript
const CURATOR_DRIFT_PROMPT = `## IDENTITY
You are Critic in CURATOR_DRIFT mode. You analyze project drift using structured data from the curator.
DO NOT use the Task tool to delegate. You ARE the agent that does the work.

This mode is ONLY invoked by the curator pipeline at phase boundaries.
It is NOT the same as manual DRIFT-CHECK mode (which the architect triggers directly).

## PRESSURE IMMUNITY
Inherited from standard Critic. Verdicts are based ONLY on evidence, never urgency.

INPUT FORMAT:
TASK: CURATOR_DRIFT phase [N]
CURATOR_DIGEST: [JSON — the curator's phase digest and running summary]
CURATOR_COMPLIANCE: [JSON — compliance observations from curator]
PLAN: [plan.md content — the original plan with task statuses]
SPEC: [spec.md content or "none" if no spec file]
PRIOR_DRIFT_REPORTS: [JSON array of prior drift report summaries, or "none"]

ANALYSIS STEPS:
1. SPEC ALIGNMENT: Compare completed tasks against FR-### requirements from spec.
   - Which FR-### are fully satisfied by completed work?
   - Which FR-### are partially addressed?
   - Which FR-### have no covering implementation?

2. SCOPE ANALYSIS: Compare plan tasks vs actual work.
   - Were any tasks added that weren't in the plan?
   - Were any planned tasks skipped or deferred?
   - Were any tasks reinterpreted (same name but different implementation)?

3. TRAJECTORY ANALYSIS: Review phase-over-phase drift using prior drift reports.
   - Is drift increasing, stable, or being corrected?
   - Identify compounding drift: small deviations that collectively pull off-spec.
   - Find the FIRST deviation point if drift exists.

4. COMPLIANCE CORRELATION: Cross-reference curator compliance observations.
   - Do workflow deviations (missing reviewer, skipped tests) correlate with areas of drift?
   - Are phases with more compliance issues also showing more drift?

5. COURSE CORRECTIONS: If drift detected, recommend specific corrections.
   - Be actionable: reference specific task IDs, file paths, or FR-### numbers.
   - Prioritize by impact: fix the root deviation first, not symptoms.

SCORING:
- drift_score: 0.0 = perfectly aligned, 1.0 = completely off-spec
  - 0.0-0.2: ALIGNED — plan is on track
  - 0.2-0.5: MINOR_DRIFT — small deviations, addressable in next phase
  - 0.5-0.8: MAJOR_DRIFT — significant deviation, needs architect attention
  - 0.8-1.0: OFF_SPEC — project trajectory fundamentally diverged from spec

RULES:
- READ-ONLY: no file modifications
- Absence of drift ≠ evidence of alignment (SKEPTICAL posture)
- If no spec.md exists, limit analysis to plan-vs-actual and compliance correlation
- Report the first deviation point, not all downstream consequences
- injection_summary MUST be under 500 chars — this goes into architect context

OUTPUT FORMAT:
DRIFT_REPORT:
alignment: [ALIGNED | MINOR_DRIFT | MAJOR_DRIFT | OFF_SPEC]
drift_score: [0.0-1.0]
first_deviation: [phase N, task X — description] (or "None detected")
compounding_effects: [list or "None"]
corrections: [list or "None needed"]
requirements_checked: [N]
requirements_satisfied: [N]
scope_additions: [list or "None"]

INJECTION_SUMMARY:
[Under 500 chars. The architect sees this at the start of the next phase.
Be direct: "Phase N: ALIGNED, 8/8 requirements on track" or
"Phase N: MINOR_DRIFT (0.35) — Task 3.2 added OAuth scope not in spec.
3 FR-### remain unaddressed. Recommend re-evaluating Phase N+1 tasks."]
`;
```

Add factory function:
```typescript
export function createCriticDriftAgent(
  model: string,
  customAppendPrompt?: string,
): AgentDefinition {
  const prompt = customAppendPrompt
    ? `${CURATOR_DRIFT_PROMPT}\n\n${customAppendPrompt}`
    : CURATOR_DRIFT_PROMPT;

  return {
    name: 'critic',
    description: 'Critic in CURATOR_DRIFT mode — analyzes project drift at phase boundaries.',
    config: {
      model,
      temperature: 0.1,
      prompt,
      tools: {
        write: false,
        edit: false,
        patch: false,
      },
    },
  };
}
```

**Validation**: TypeScript compiles. `createCriticDriftAgent()` returns valid `AgentDefinition`. Existing critic tests pass unchanged. The new factory is only called by the curator pipeline, not by general critic delegation.

---

### Task 6: Core Curator Logic

**File**: `src/hooks/curator.ts`

This is the main implementation file. Dependencies:
- `src/hooks/curator-types.ts` — types
- `src/hooks/knowledge-store.ts` — `readKnowledge`, `resolveSwarmKnowledgePath`
- `src/hooks/knowledge-types.ts` — `SwarmKnowledgeEntry`, `KnowledgeConfig`
- `src/hooks/utils.ts` — `readSwarmFileAsync`, `validateSwarmPath`, `safeHook`
- `src/background/event-bus.ts` — `getGlobalEventBus`
- `src/config/schema.ts` — `CuratorConfig`

#### 6a: Summary I/O

```typescript
const CURATOR_SUMMARY_FILE = 'curator-summary.json';

export async function readCuratorSummary(directory: string): Promise<CuratorSummary | null> {
  // Read .swarm/curator-summary.json
  // Return null if file does not exist
  // Parse JSON, validate schema_version === 1
  // On parse error: log warning, return null (treat as first run)
}

export async function writeCuratorSummary(directory: string, summary: CuratorSummary): Promise<void> {
  // Write to .swarm/curator-summary.json
  // Use validateSwarmPath() to build path
  // JSON.stringify with 2-space indent
  // Ensure .swarm/ directory exists
}
```

#### 6b: Phase Event Filtering

```typescript
export function filterPhaseEvents(
  eventsJsonl: string,
  phase: number,
  sinceTimestamp?: string,
): object[] {
  // Parse events.jsonl lines
  // Filter to events where event.phase === phase OR timestamp > sinceTimestamp
  // Return parsed objects
  // Skip malformed lines (log warning, continue)
}
```

#### 6c: Compliance Checker

```typescript
export function checkPhaseCompliance(
  phaseEvents: object[],
  agentsDispatched: string[],
  requiredAgents: string[],
  phase: number,
): ComplianceObservation[] {
  // Check 1: Were all required agents dispatched?
  // Check 2: Was reviewer called for each coder delegation?
  //   - Parse delegation events, find coder tasks without subsequent reviewer
  // Check 3: Was retrospective written before phase_complete?
  //   - Check for retro-N evidence in events
  // Check 4: Was SME consulted when detect_domains found new domains?
  //   - Check for domain detection events without subsequent SME delegation
  //
  // Return array of ComplianceObservation
  // Each observation has type, description, severity
  // Missing reviewer = warning, missing retro = warning, missing SME = info
}
```

#### 6d: CURATOR_INIT Runner

```typescript
export async function runCuratorInit(
  directory: string,
  config: CuratorConfig,
): Promise<CuratorInitResult> {
  // 1. Read prior curator summary from .swarm/curator-summary.json
  // 2. Read high-confidence knowledge entries (confidence >= config.min_knowledge_confidence)
  //    from .swarm/knowledge.jsonl using readKnowledge<SwarmKnowledgeEntry>()
  // 3. Read context.md using readSwarmFileAsync()
  // 4. Build CURATOR_INIT input payload from the three sources
  // 5. Format as the INPUT FORMAT the prompt expects
  // 6. Return CuratorInitResult with briefing text, contradictions, stats
  // 7. Emit 'curator.init.completed' event via event bus
  //
  // NOTE: This function prepares the input and parses the output.
  // The actual LLM call is made by the caller (phase-monitor integration)
  // which delegates to the explorer agent using the existing Task tool pattern.
  //
  // If prior summary is null: return first-session briefing
  // On any error: emit 'curator.error' event, return safe default result
}
```

#### 6e: CURATOR_PHASE Runner

```typescript
export async function runCuratorPhase(
  directory: string,
  phase: number,
  agentsDispatched: string[],
  config: CuratorConfig,
  knowledgeConfig: KnowledgeConfig,
): Promise<CuratorPhaseResult> {
  // 1. Read prior curator summary
  // 2. Read events.jsonl filtered to this phase window
  // 3. Read evidence bundles for this phase (ls .swarm/evidence/)
  // 4. Read context.md decisions
  // 5. Read required_agents from phase_complete config
  // 6. Run compliance check via checkPhaseCompliance()
  // 7. Build CURATOR_PHASE input payload
  // 8. Parse output into PhaseDigestEntry + ComplianceObservation[] + KnowledgeRecommendation[]
  // 9. Update curator summary:
  //    a. Extend digest (append, don't replace)
  //    b. Add phase_digests entry
  //    c. Add compliance_observations
  //    d. Set knowledge_recommendations
  //    e. Update last_phase_covered, last_updated
  // 10. Write updated summary to .swarm/curator-summary.json
  // 11. Write compliance observations to events.jsonl as curator_compliance events
  // 12. Emit 'curator.phase.completed' event via event bus
  // 13. Return CuratorPhaseResult
  //
  // On any error: emit 'curator.error' event, return safe default result.
  // Curator failures must NEVER block phase_complete.
}
```

#### 6f: Knowledge Update Applicator

```typescript
export async function applyCuratorKnowledgeUpdates(
  directory: string,
  recommendations: KnowledgeRecommendation[],
  knowledgeConfig: KnowledgeConfig,
): Promise<{ applied: number; skipped: number }> {
  // Process each recommendation:
  // - promote: Set hive_eligible = true on matching entry, bump confidence
  // - archive: Set status = 'archived' on matching entry (new status value)
  // - flag_contradiction: Append contradiction note to entry tags
  //
  // Use readKnowledge + rewriteKnowledge pattern from knowledge-store.ts
  // Skip recommendations where entry_id is not found (log warning)
  // Return counts
}
```

**Validation**: Unit tests in Task 9 cover all functions. `bun test` passes.

---

### Task 7: Critic Drift Logic

**File**: `src/hooks/curator-drift.ts`

This file implements the critic's drift analysis stage. Dependencies:
- `src/hooks/curator-types.ts` — `DriftReport`, `CriticDriftResult`, `CuratorPhaseResult`, `CuratorConfig`
- `src/hooks/utils.ts` — `readSwarmFileAsync`, `validateSwarmPath`
- `src/background/event-bus.ts` — `getGlobalEventBus`
- `src/plan/manager.ts` — `loadPlan`

#### 7a: Drift Report I/O

```typescript
const DRIFT_REPORT_PREFIX = 'drift-report-phase-';

export async function readPriorDriftReports(directory: string): Promise<DriftReport[]> {
  // List .swarm/drift-report-phase-*.json files
  // Parse each, sorted by phase number ascending
  // Skip corrupt files (log warning)
  // Return array of DriftReport
}

export async function writeDriftReport(directory: string, report: DriftReport): Promise<string> {
  // Write to .swarm/drift-report-phase-{N}.json
  // Use validateSwarmPath() to build path
  // JSON.stringify with 2-space indent
  // Return the file path
}
```

#### 7b: Critic Drift Runner

```typescript
export async function runCriticDriftCheck(
  directory: string,
  phase: number,
  curatorResult: CuratorPhaseResult,
  config: CuratorConfig,
): Promise<CriticDriftResult> {
  // 1. Read plan.md using readSwarmFileAsync()
  // 2. Read spec.md using readSwarmFileAsync() (may not exist — handle gracefully)
  // 3. Read prior drift reports using readPriorDriftReports()
  // 4. Build CURATOR_DRIFT input payload:
  //    - CURATOR_DIGEST: JSON.stringify(curatorResult.digest + curator summary digest)
  //    - CURATOR_COMPLIANCE: JSON.stringify(curatorResult.compliance)
  //    - PLAN: plan.md content
  //    - SPEC: spec.md content or "none"
  //    - PRIOR_DRIFT_REPORTS: JSON.stringify(prior reports' injection_summary fields)
  // 5. Parse critic output into DriftReport structure
  // 6. Truncate injection_summary to config.drift_inject_max_chars
  // 7. Write drift report to .swarm/drift-report-phase-N.json
  // 8. Write drift event to events.jsonl
  // 9. Emit 'curator.drift.completed' event via event bus
  // 10. Return CriticDriftResult with report, path, and injection text
  //
  // On any error: emit 'curator.error' event, return safe default result.
  // Drift failures must NEVER block phase_complete or the curator pipeline.
  // If spec.md is missing, critic still analyzes plan-vs-actual and compliance correlation.
}
```

#### 7c: Drift Injection Builder

```typescript
export function buildDriftInjectionText(report: DriftReport, maxChars: number): string {
  // Build a truncated summary suitable for architect context injection.
  // Format: "<drift_report>Phase N: {alignment} ({drift_score}) — {key finding}. {correction if any}.</drift_report>"
  // Truncate to maxChars, ensuring valid XML tags are not broken.
  // If ALIGNED with drift_score < 0.1: minimal output "Phase N: ALIGNED, all requirements on track."
  // If MINOR_DRIFT or worse: include first_deviation and top correction.
}
```

**Validation**: Unit tests in Task 9 cover all functions. `bun test` passes.

---

### Task 8: Integration Points

#### 8a: phase-complete.ts Integration

**File**: `src/tools/phase-complete.ts`

After the existing knowledge curation block (after `curateAndStoreSwarm()` try/catch), add:

```typescript
// Curator pipeline: phase consolidation → critic drift check (if enabled)
try {
  const curatorConfig = CuratorConfigSchema.parse(config.curator ?? {});
  if (curatorConfig.enabled && curatorConfig.phase_enabled) {
    // Stage 1: Curator (explorer, fast) — gather and consolidate
    const curatorResult = await runCuratorPhase(
      dir,
      phase,
      agentsDispatched,
      curatorConfig,
      knowledgeConfig,
    );

    // Apply knowledge update recommendations
    if (curatorResult.knowledge_recommendations.length > 0) {
      await applyCuratorKnowledgeUpdates(
        dir,
        curatorResult.knowledge_recommendations,
        knowledgeConfig,
      );
    }

    // Stage 2: Critic drift check (strong model) — analyze drift
    try {
      const driftResult = await runCriticDriftCheck(
        dir,
        phase,
        curatorResult,
        curatorConfig,
      );

      // Append drift summary to warnings (only if suppress_warnings is false)
      if (!curatorConfig.suppress_warnings) {
        if (driftResult.report.alignment !== 'ALIGNED') {
          warnings.push(
            `[curator:drift] ${driftResult.report.alignment} (${driftResult.report.drift_score.toFixed(2)}) — see ${driftResult.report_path}`,
          );
        }
        for (const obs of curatorResult.compliance) {
          warnings.push(`[curator:${obs.type}] ${obs.description}`);
        }
      }
    } catch (driftError) {
      // Critic drift failure does not block curator or phase_complete
      console.warn('[phase_complete] Critic drift analysis failed:', driftError);
    }
  }
} catch (curatorError) {
  // Log warning but NEVER block phase completion
  console.warn(
    '[phase_complete] Curator pipeline failed:',
    curatorError,
  );
}
```

Add imports at top of file:
```typescript
import { CuratorConfigSchema } from '../config/schema.js';
import { runCuratorPhase, applyCuratorKnowledgeUpdates } from '../hooks/curator.js';
import { runCriticDriftCheck } from '../hooks/curator-drift.js';
```

**Validation**: With curator disabled (default), phase_complete behavior is identical to current. With curator enabled, curator runs after knowledge curation, critic runs after curator. Either stage can fail without affecting the other or phase_complete.

#### 8b: phase-monitor.ts Integration

**File**: `src/hooks/phase-monitor.ts`

In the `createPhaseMonitorHook` function, after the first-call initialization block (when `lastKnownPhase` transitions from `null`), add:

```typescript
// Curator init (if enabled) — runs once on session start
if (lastKnownPhase === null) {
  lastKnownPhase = currentPhase;

  // Async curator init — fire and forget, must not block phase monitoring
  try {
    const { loadPluginConfigWithMeta } = await import('../config.js');
    const { config } = loadPluginConfigWithMeta(directory);
    const curatorConfig = CuratorConfigSchema.parse(config.curator ?? {});
    if (curatorConfig.enabled && curatorConfig.init_enabled) {
      // runCuratorInit is fire-and-forget — errors are caught internally
      runCuratorInit(directory, curatorConfig).catch((err) => {
        console.warn('[phase-monitor] Curator init failed:', err);
      });
    }
  } catch {
    // Config load failure — skip curator init silently
  }

  return;
}
```

Add imports:
```typescript
import { CuratorConfigSchema } from '../config/schema.js';
import { runCuratorInit } from './curator.js';
```

**Validation**: With curator disabled, phase-monitor behavior is identical. Curator init errors never propagate.

#### 8c: knowledge-injector.ts Integration

**File**: `src/hooks/knowledge-injector.ts`

In the existing `createKnowledgeInjectorHook` factory, after the knowledge injection block, add drift report injection:

```typescript
// Drift report injection (if curator enabled and drift report exists for current phase - 1)
try {
  const curatorConfig = CuratorConfigSchema.parse(pluginConfig.curator ?? {});
  if (curatorConfig.enabled) {
    const prevPhase = currentPhaseNumber - 1;
    if (prevPhase >= 1) {
      const driftReportPath = validateSwarmPath(directory, `drift-report-phase-${prevPhase}.json`);
      const driftContent = await readSwarmFileAsync(directory, `drift-report-phase-${prevPhase}.json`);
      if (driftContent) {
        const driftReport: DriftReport = JSON.parse(driftContent);
        const injectionText = buildDriftInjectionText(driftReport, curatorConfig.drift_inject_max_chars);
        if (injectionText) {
          // Inject after knowledge block, before user messages
          injectDriftMessage(output, injectionText);
        }
      }
    }
  }
} catch {
  // Drift injection failure is silent — non-critical
}
```

Add helper function:
```typescript
function injectDriftMessage(
  output: { messages?: MessageWithParts[] },
  text: string,
): void {
  if (!output.messages) return;

  // Idempotency guard
  const alreadyInjected = output.messages.some((m) =>
    m.parts?.some((p) => p.text?.includes('<drift_report>')),
  );
  if (alreadyInjected) return;

  // Insert after knowledge message (if present), otherwise after system message
  const knowledgeIdx = output.messages.findIndex((m) =>
    m.parts?.some((p) => p.text?.includes('📚 Knowledge')),
  );
  const insertIdx = knowledgeIdx >= 0 ? knowledgeIdx + 1 : 1;

  const driftMessage: MessageWithParts = {
    info: { role: 'system' },
    parts: [{ type: 'text', text: `📊 Drift Report (Previous Phase)\n${text}` }],
  };

  output.messages.splice(insertIdx, 0, driftMessage);
}
```

Add imports:
```typescript
import { CuratorConfigSchema } from '../config/schema.js';
import type { DriftReport } from './curator-types.js';
import { buildDriftInjectionText } from './curator-drift.js';
```

**Validation**: With curator disabled, knowledge-injector behavior is identical. Drift injection only occurs if a drift report exists for the previous phase. Injection failure is silent.

---

### Task 9: Tests

#### 9a: Curator Unit Tests

**File**: `src/__tests__/hooks/curator.test.ts`

Test cases:

1. **readCuratorSummary** — returns null when file missing, parses valid JSON, handles corrupt JSON
2. **writeCuratorSummary** — creates .swarm/ if missing, writes valid JSON, overwrites existing
3. **filterPhaseEvents** — filters by phase number, handles empty events, skips malformed lines
4. **checkPhaseCompliance** — detects missing reviewer, missing retro, missing SME, no deviations case
5. **runCuratorInit** — first session (no prior summary), with prior summary, with contradictions
6. **runCuratorPhase** — basic consolidation, extends existing digest, compliance observations emitted
7. **applyCuratorKnowledgeUpdates** — promote sets hive_eligible, archive sets status, missing entry skipped

#### 9b: Drift Unit Tests

**File**: `src/__tests__/hooks/curator-drift.test.ts`

Test cases:

1. **readPriorDriftReports** — returns empty when no reports, parses multiple reports, handles corrupt files
2. **writeDriftReport** — writes valid JSON, creates .swarm/ if missing
3. **runCriticDriftCheck** — ALIGNED case, MINOR_DRIFT case, MAJOR_DRIFT case, no spec.md case
4. **buildDriftInjectionText** — truncation at max_chars, ALIGNED minimal output, MAJOR_DRIFT full output
5. **Drift injection in knowledge-injector** — injected when report exists, skipped when no report, idempotency guard

#### 9c: Adversarial Tests

**File**: `src/__tests__/hooks/curator.adversarial.test.ts`

Test cases:

1. **Corrupt summary file** — curator recovers gracefully, treats as first run
2. **Oversized events.jsonl** — curator truncates to most recent N events for phase window
3. **Missing .swarm/ directory** — curator creates it or fails gracefully
4. **Concurrent phase_complete calls** — curator summary write doesn't corrupt under race
5. **Curator enabled but explorer model unavailable** — graceful failure, phase_complete succeeds
6. **Malicious knowledge entry** — sanitization prevents prompt injection in curator prompts
7. **Empty phase (no events, no evidence)** — curator produces minimal valid digest
8. **Critic drift fails but curator succeeds** — curator results preserved, drift report absent, no crash
9. **Corrupt prior drift report** — critic skips it, analyzes current phase only
10. **Drift injection with missing drift report** — knowledge-injector skips silently

**Validation**: `bun test` — all curator and drift tests pass. All existing tests pass (no regressions).

---

### Task 10: Documentation

#### 10a: docs/planning.md

Add a new section `### Curator (Phase Context Consolidation & Drift Detection)` documenting:

- What it does: two-stage pipeline — explorer (curator) gathers data, critic analyzes drift
- When it runs: session start (CURATOR_INIT) and phase completion (CURATOR_PHASE → CRITIC_DRIFT)
- What it produces: phase digests, compliance reports, knowledge recommendations, drift reports
- Drift report injection: truncated summary injected into architect context at start of next phase
- Config reference: all `curator.*` keys with types and defaults
- Default behavior: disabled. No change to existing behavior unless `curator.enabled: true`
- Performance note: adds one explorer invocation + one critic invocation per phase boundary when enabled
- Compliance auditing is read-only — does not enforce, does not block
- Drift analysis is read-only — advisory only, architect decides
- The critic drift-check is triggered only by the curator pipeline, not by general critic delegations (sounding board, plan review)

#### 10b: README.md

Add to the config table:

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `curator.enabled` | boolean | `false` | Enable curator mode for phase context consolidation and drift detection |
| `curator.init_enabled` | boolean | `true` | Run context briefing at session start |
| `curator.phase_enabled` | boolean | `true` | Run phase digest and drift check at phase boundaries |
| `curator.max_summary_tokens` | number | `2000` | Token budget for curator summary |
| `curator.min_knowledge_confidence` | number | `0.7` | Minimum confidence for knowledge entries in curator context |
| `curator.compliance_report` | boolean | `true` | Include compliance observations in phase digest |
| `curator.suppress_warnings` | boolean | `true` | Suppress TUI warnings; log to events.jsonl and report files only |
| `curator.drift_inject_max_chars` | number | `500` | Maximum chars for drift report summary injected into architect context |

---

## Artifacts

### New .swarm/ Files

| File | Format | Purpose |
|------|--------|---------|
| `.swarm/curator-summary.json` | JSON | Running curator summary (anchored iterative) |
| `.swarm/drift-report-phase-N.json` | JSON | Per-phase drift report from critic analysis |

### New events.jsonl Event Types

| Event | Payload | When |
|-------|---------|------|
| `curator_init` | `{ session_id, knowledge_entries_reviewed, prior_phases_covered, contradictions_found }` | Session start |
| `curator_phase` | `{ phase, agents_used, tasks_completed, compliance_observations, knowledge_recommendations }` | Phase completion |
| `curator_compliance` | `{ phase, type, description, severity }` | Per compliance observation |
| `curator_drift` | `{ phase, alignment, drift_score, first_deviation, requirements_checked, requirements_satisfied }` | After critic drift analysis |

---

## Pipeline Flow

```
phase_complete(phase=N) succeeds
  │
  ├── [existing] curateAndStoreSwarm() — knowledge curation
  │
  ├── [new] Stage 1: runCuratorPhase() — explorer, fast model
  │     ├── Reads: events.jsonl, evidence/, context.md, curator-summary.json
  │     ├── Writes: curator-summary.json, curator_phase event, curator_compliance events
  │     └── Returns: CuratorPhaseResult { digest, compliance, knowledge_recommendations }
  │
  ├── [new] applyCuratorKnowledgeUpdates() — apply promote/archive/flag
  │
  └── [new] Stage 2: runCriticDriftCheck() — critic, strong model
        ├── Reads: CuratorPhaseResult, plan.md, spec.md, prior drift-report-phase-*.json
        ├── Writes: drift-report-phase-N.json, curator_drift event
        └── Returns: CriticDriftResult { report, report_path, injection_text }

Next phase starts:
  knowledge-injector.ts reads drift-report-phase-N.json
  → Injects truncated drift summary into architect context
  → Architect sees "📊 Drift Report (Previous Phase)" before planning next phase
```

---

## Prerequisites

- **Issue #81 hotfix must land first.** The task workflow state machine (`idle → coder_delegated → ... → tests_run → complete`) is broken on default config because `delegationChains` is only populated when `hooks.delegation_tracker: true` (defaults to `false`), but the state machine in `delegation-gate.ts` reads those chains. The Issue #81 hotfix decouples chain population from the diagnostic tracker config. Without this fix, the curator's compliance checker (Task 6c) would report misleading violations — it would observe reviewer delegations in `events.jsonl` but the state machine would show no gate progression, creating contradictory compliance data.

---

## Constraints

1. **No 10th agent.** Curator is the explorer in a different mode. Drift-check is the critic in a different mode. `ALL_AGENT_NAMES` in `src/config/constants.ts` is unchanged.
2. **Disabled by default.** `curator.enabled` defaults to `false`. Zero behavior change for existing users.
3. **Never blocks phase_complete.** All curator and critic calls are wrapped in try/catch. Failure = warning log, not blocked phase.
4. **suppress_warnings defaults true.** TUI users don't see curator/drift output unless they opt in. Events and reports always written to disk.
5. **No gate enforcement.** Curator reports compliance observations. Critic reports drift. Neither blocks, rejects, or enforces. Gate enforcement is R1-R12 scope.
6. **Critic drift-check only fires from curator pipeline.** General-purpose critic delegations (sounding board, plan review, analyze) are unaffected. The trigger is internal to `phase-complete.ts`, not a generic critic hook.
7. **Cross-platform.** All file paths use `path.join()`. Uses existing `validateSwarmPath()` utility. No platform-specific code.
8. **Commit prefix**: `fix:` — ensures release-please tags as patch.

---

## Dependency Order

```
Task 1 (config schema)
  └→ Task 2 (types) — no dependency, can parallel with Task 1
Task 3 (event bus) — no dependency, can parallel
Task 4 (explorer prompts) — depends on Task 2 for types
Task 5 (critic drift prompt) — depends on Task 2 for types
Task 6 (core curator logic) — depends on Tasks 1, 2, 3
Task 7 (critic drift logic) — depends on Tasks 2, 3, 5
Task 8 (integration) — depends on Tasks 1, 6, 7
Task 9 (tests) — depends on Tasks 6, 7, 8
Task 10 (docs) — depends on Task 1 for config reference
```

Parallelizable: Tasks 1+2+3 can run simultaneously. Tasks 4+5 can run simultaneously once Task 2 is done. Tasks 6+7 can run simultaneously once their deps are met. Tasks 9+10 can start once Task 8 is done.

# Stage 6 Implementation Plan: quality_budget + CI Gate

**Status**: APPROVED - Implementation Ready  
**Depends on**: Stage 5 (COMPLETE)  
**Swarm**: mega

## Overview

Stage 6 implements the `quality_budget` gate to enforce maintainability budgets and integrates with `/swarm benchmark --ci-gate`. This includes complexity delta tracking, public API delta monitoring, duplication detection, and test-to-code ratio enforcement.

## Stage 6 Tasks

### Task 6.1: Define quality_budget Configuration
**Complexity**: SMALL  
**Owner**: architect → coder

**Requirements**:
- Extend `GateConfigSchema` with `quality_budget` configuration block:
```typescript
interface QualityBudgetConfig {
  enabled: boolean;  // default: true
  max_complexity_delta: number;  // default: 5 (cyclomatic complexity)
  max_public_api_delta: number;  // default: 10 (new exports)
  max_duplication_ratio: number;  // default: 0.05 (5%)
  min_test_to_code_ratio: number;  // default: 0.3 (30%)
  enforce_on_globs: string[];  // default: ['src/**']
  exclude_globs: string[];  // default: ['docs/**', 'tests/**', '**/*.test.*']
}
```

**Acceptance Criteria**:
- [x] Config schema validates and merges correctly
- [x] Defaults are sensible for most projects
- [x] Type exports work correctly

**Status**: ✅ **COMPLETE** - QA Gate passed (typecheck clean, lint clean)

**Files**:
- `src/config/schema.ts` - Extend GateConfigSchema

---

### Task 6.2: Implement Metrics Collection
**Complexity**: MEDIUM  
**Owner**: coder

**Requirements**:
- Create `src/quality/metrics.ts` for metrics computation

**Metrics to Implement**:

1. **Complexity Delta**:
   - Use Tree-sitter to count cyclomatic complexity per function
   - Compare baseline vs current for changed files
   - Store per-file metrics

2. **Public API Delta**:
   - Use `symbols` tool concept to count exports/declarations
   - Track new public APIs introduced
   - Count by language

3. **Duplication Detection**:
   - Tokenize changed code blocks
   - Compute repeated n-gram ratios
   - Flag copy-pasted code blocks >10 lines

4. **Test-to-Code Ratio**:
   - Count lines in production code (src/) vs test code (tests/)
   - Compute ratio from diff additions
   - Track by file extension

**Types**:
```typescript
interface QualityMetrics {
  complexity_delta: number;
  public_api_delta: number;
  duplication_ratio: number;
  test_to_code_ratio: number;
  files_analyzed: string[];
  thresholds: QualityBudgetConfig;
  violations: QualityViolation[];
}

interface QualityViolation {
  type: 'complexity' | 'api' | 'duplication' | 'test_ratio';
  message: string;
  severity: 'error' | 'warning';
  files: string[];
}
```

**Acceptance Criteria**:
- [x] All 4 metrics implemented (complexity, API, duplication, test ratio)
- [x] Metrics computed from changed files only
- [x] 35+ unit tests

**Status**: ✅ **COMPLETE** - QA Gate passed (35 tests, lint clean)

**Files**:
- `src/quality/metrics.ts` - Metrics computation
- `tests/unit/quality/metrics.test.ts` - Metrics tests

---

### Task 6.3: Implement quality_budget Tool
**Complexity**: MEDIUM  
**Owner**: coder

**Requirements**:
- Implement `qualityBudget()` tool in `src/tools/quality-budget.ts`
- Tool Contract:
  - **Input**: `{ changed_files: string[], config?: QualityBudgetConfig }`
  - **Output**: `{ verdict: "pass" | "fail", metrics: QualityMetrics, summary }`

- Behavior:
  - Compute all 4 metrics for changed files
  - Compare against thresholds
  - Return 'fail' if any metric exceeds threshold
  - Save evidence with type 'quality_budget'

**Acceptance Criteria**:
- [x] Computes all quality metrics
- [x] Enforces configured thresholds
- [x] Returns structured findings
- [x] 38+ unit tests
- [x] Reviewer approved

**Status**: ✅ **COMPLETE** - QA Gate passed (38 tests, lint clean, reviewer approved)

**Files**:
- `src/tools/quality-budget.ts` - Main implementation
- `tests/unit/tools/quality-budget.test.ts` - Comprehensive tests
- `src/tools/index.ts` - Export qualityBudget

---

### Task 6.4: Wire quality_budget into Phase 5 Gate Sequence
**Complexity**: SMALL  
**Owner**: architect → coder

**Requirements**:
- Update `src/agents/architect.ts` Phase 5 sequence:
  - Insert `quality_budget` after `build_check` and before `reviewer`
  - Add branching: "QUALITY VIOLATIONS → return to coder. WITHIN BUDGET → proceed to reviewer"
- Add anti-bypass tests

**Acceptance Criteria**:
- [x] Prompt tests confirm quality_budget is mandatory
- [x] Prompt tests confirm ordering: build_check → quality_budget → reviewer
- [x] Violations block progression
- [x] Anti-bypass tests verify non-skippability
- [x] 66 total gate tests (added 13 quality_budget tests)

**Status**: ✅ **COMPLETE** - QA Gate passed (66 tests, lint clean)

**Files**:
- `src/agents/architect.ts` - Update Rule 7 / Phase 5
- `tests/unit/agents/architect-gates.test.ts` - Add quality gate tests

---

### Task 6.5: Replace QualityBudgetEvidenceSchema Stub with Typed Schema
**Complexity**: SMALL  
**Owner**: coder

**Requirements**:
- Replace stub `QualityBudgetEvidenceSchema` (with `details` field) with typed schema:
```typescript
export const QualityBudgetEvidenceSchema = BaseEvidenceSchema.extend({
  type: z.literal('quality_budget'),
  metrics: z.object({
    complexity_delta: z.number(),
    public_api_delta: z.number(),
    duplication_ratio: z.number(),
    test_to_code_ratio: z.number(),
  }),
  thresholds: z.object({
    max_complexity_delta: z.number(),
    max_public_api_delta: z.number(),
    max_duplication_ratio: z.number(),
    min_test_to_code_ratio: z.number(),
  }),
  violations: z.array(
    z.object({
      type: z.enum(['complexity', 'api', 'duplication', 'test_ratio']),
      message: z.string(),
      severity: z.enum(['error', 'warning']),
      files: z.array(z.string()),
    })
  ).default([]),
  files_analyzed: z.array(z.string()),
});
```

**Acceptance Criteria**:
- [x] Typed schema matches tool output contract
- [x] Schema validates correctly
- [x] No breaking changes to existing evidence types

**Status**: ✅ **COMPLETE** - QA Gate passed (typecheck clean)

**Files**:
- `src/config/evidence-schema.ts` - Update QualityBudgetEvidenceSchema

---

### Task 6.6: Integrate into `/swarm benchmark --ci-gate`
**Complexity**: MEDIUM  
**Owner**: coder

**Requirements**:
- Extend existing CI-gate implementation to include quality checks
- Add new check rows:
  - Complexity Delta ≤ threshold
  - Public API Delta ≤ threshold
  - Duplication Ratio ≤ threshold
  - Test-to-Code Ratio ≥ threshold
- Ensure JSON output remains parseable
- Add quality metrics to benchmark report

**Acceptance Criteria**:
- [x] CI-gate includes all 4 quality checks
- [x] Fails when thresholds exceeded
- [x] Passes when within thresholds
- [x] JSON output remains parseable
- [x] 15+ unit tests

**Status**: ✅ **COMPLETE** - QA Gate passed (15 tests, lint clean)

**Files**:
- `src/commands/benchmark.ts` - Extend with quality checks
- `tests/unit/commands/benchmark-ci-gate.test.ts` - CI-gate tests

---

## Evidence Schema Target (v6.9)

Per Evidence Matrix in roadmap:

| Type | Core fields | Status |
|------|-------------|--------|
| `quality_budget` | `verdict`, `metrics { complexity_delta, api_delta, duplication_ratio, test_ratio }`, `thresholds`, `violations[]` | Stage 6 |

## Dependencies

```
Task 6.1 (config)     Task 6.5 (schema)
       ↓                    ↓
       └─────────┬──────────┘
                 ↓
          Task 6.2 (metrics)
                 ↓
          Task 6.3 (tool)
                 ↓
          Task 6.4 (gate)
                 ↓
          Task 6.6 (ci-gate)
```

## QA Gate Process

Each task follows the mandatory QA gate:
1. coder implements
2. diff analysis
3. imports audit
4. lint fix → lint check
5. secretscan
6. reviewer (general)
7. test_engineer (verification tests)
8. coverage check

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Complexity calculation overhead | Medium | Medium | Cache results, incremental computation |
| False positives on duplication | Medium | Low | Tune n-gram thresholds, allow configuration |
| Large file processing | Medium | Medium | Respect size limits, stream processing |
| Config threshold tuning | High | Low | Sensible defaults, project-level overrides |

## Definition of Done

- [x] All 6 tasks complete with QA approval
- [x] 169+ tests passing (35 metrics + 38 tool + 66 gate + 15 ci-gate + 15 schema/config = 169)
- [x] Gate integration tests verify non-bypassability (66 tests)
- [x] CI-gate integration tested (15 tests)
- [x] Evidence schema properly typed
- [x] All lint checks pass

**STATUS**: ✅ **STAGE 6 COMPLETE**

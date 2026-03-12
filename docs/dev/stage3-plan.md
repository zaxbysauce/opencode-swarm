# Stage 3 Implementation Plan: sast_scan Gate

**Status**: APPROVED BY CRITIC - Implementation Ready  
**Depends on**: Stage 2 (COMPLETE)  
**Swarm**: mega

## Overview

Stage 3 implements the `sast_scan` gate for Static Application Security Testing. This gate detects high-signal security vulnerabilities using an offline rule engine (Tier A) with optional enhancement from Semgrep if available on PATH (Tier B).

## Stage 3 Tasks

### Task 3.1: Tier A Rule Engine (Offline SAST)
**Complexity**: MEDIUM  
**Owner**: coder

**Requirements**:
- Create `src/sast/rules/` directory structure for language-specific rule files
- Implement rule engine using Tree-sitter queries and heuristics
- Initial rule set (high-signal, low false-positive):

| Language | Patterns | Rule IDs |
|----------|----------|----------|
| JS/TS | `eval()`, `Function(...)`, unsanitized `child_process.exec` | sast/js-eval, sast/js-dangerous-function, sast/js-command-injection |
| Python | `pickle.loads`, `subprocess.*(shell=True)`, `yaml.load` without SafeLoader | sast/py-pickle, sast/py-shell-injection, sast/py-yaml-unsafe |
| Go | `exec.Command("sh","-c",...)`, weak TLS config | sast/go-shell-injection, sast/go-weak-tls |
| Java | `Runtime.exec`, insecure deserialization | sast/java-command-injection, sast/java-deserialization |
| PHP | `unserialize`, `exec/system` | sast/php-unserialize, sast/php-command-injection |
| C/C++ | `strcpy/strcat/sprintf` to fixed buffers | sast/c-buffer-overflow |
| C# | `Process.Start` with interpolated command strings | sast/cs-command-injection |

- Rule format:
```typescript
interface SastRule {
  id: string;
  name: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  languages: string[];
  // Either tree-sitter query OR regex pattern
  query?: string; // Tree-sitter query
  pattern?: RegExp; // Fallback regex
  // Validation function for context-aware checks
  validate?: (match: any) => boolean;
}
```

**Acceptance Criteria**:
- [x] Rule engine executes rules for all 9 languages (exceeded 7)
- [x] Each rule has unique stable ID and severity
- [x] Rules return structured findings with location (file, line, column)
- [x] 63 total rules: Critical 23 | High 27 | Medium 11 | Low 2
- [x] 65+ unit tests for rule engine and individual rules

**Status**: ✅ **COMPLETE** - QA Gate passed (65 tests, lint clean)

**Files**:
- `src/sast/rules/index.ts` - rule registry and loader
- `src/sast/rules/javascript.ts` - JS/TS rules
- `src/sast/rules/python.ts` - Python rules
- `src/sast/rules/go.ts` - Go rules
- `src/sast/rules/java.ts` - Java rules
- `src/sast/rules/php.ts` - PHP rules
- `src/sast/rules/c.ts` - C/C++ rules
- `src/sast/rules/csharp.ts` - C# rules
- `tests/unit/sast/rules.test.ts` - rule engine tests

---

### Task 3.2: Optional Semgrep Integration (Tier B)
**Complexity**: SMALL  
**Owner**: coder

**Requirements**:
- Detect if `semgrep` CLI is available on PATH
- If available: run with bundled local rules (no remote rulesets)
- Merge Tier B findings into same output schema with `engine: "tier_a+tier_b"` metadata
- If not available: return Tier A only with `engine: "tier_a"`
- Semgrep config: use `.swarm/semgrep-rules/` directory for local rules

**Acceptance Criteria**:
- [x] Detects Semgrep presence without shelling out on every run (cache)
- [x] With Semgrep absent: returns available=false, empty findings
- [x] With Semgrep present: returns findings with correct format
- [x] Graceful handling of Semgrep errors/crashes
- [x] 32 unit tests for detection, invocation, error handling

**Status**: ✅ **COMPLETE** - QA Gate passed (32 tests, lint clean)

**Files**:
- `src/sast/semgrep.ts` - Semgrep detection and invocation
- `.swarm/semgrep-rules/basic-rules.yml` - bundled Semgrep rules (YAML)
- `src/sast/semgrep.test.ts` - Semgrep tests

---

### Task 3.3: Implement sast_scan Tool
**Complexity**: MEDIUM  
**Owner**: coder

**Requirements**:
- Implement `sastScan()` tool in `src/tools/sast-scan.ts`
- Tool Contract:
  - **Input**: `{ changed_files: string[], rules?: string[], severity_threshold?: 'low'|'medium'|'high'|'critical' }`
  - **Output**: `{ verdict: "pass"|"fail", findings: [{ rule_id, severity, message, location: { file, line, column }, remediation? }], summary: { engine, files_scanned, findings_count, findings_by_severity } }`
- Respects severity_threshold (default: 'medium' - fail on medium+)
- Integrates with Tier A rule engine
- Optionally invokes Semgrep (Tier B) if available

**Acceptance Criteria**:
- [x] Detects security patterns in changed files
- [x] Respects severity_threshold configuration
- [x] Returns structured findings matching SastEvidenceSchema
- [x] Handles unsupported languages gracefully (skip with warning)
- [x] 33 unit tests covering rule detection and Semgrep integration
- [x] Security review passed (command injection fixed)

**Status**: ✅ **COMPLETE** - QA Gate passed (33 tests, lint clean, security review approved)

**Files**:
- `src/tools/sast-scan.ts` - main implementation
- `tests/unit/tools/sast-scan.test.ts` - comprehensive tests
- `src/tools/index.ts` - export sastScan

---

### Task 3.4: Wire sast_scan into Phase 5 Gate Sequence
**Complexity**: SMALL  
**Owner**: architect → coder

**Requirements**:
- Update `src/agents/architect.ts` Phase 5 sequence:
  - Insert `sast_scan` after `secretscan` and before `reviewer`
  - Add branching language: "SAST FINDINGS → block security reviewer. NO FINDINGS → proceed to reviewer"
- Update security reviewer prompt to explicitly consider `sast_scan` findings as blocking
- Add anti-bypass tests

**Acceptance Criteria**:
- [x] Prompt tests confirm sast_scan is mandatory
- [x] Prompt tests confirm ordering: secretscan → sast_scan → reviewer
- [x] SAST findings block progression to security reviewer
- [x] Security reviewer prompt references sast_scan findings
- [x] Anti-bypass tests verify non-skippability

**Status**: ✅ **COMPLETE** - QA Gate passed (37 tests, lint clean, reviewer approved)

**Files**:
- `src/agents/architect.ts` - update Rule 7 / Phase 5
- `tests/unit/agents/architect-gates.test.ts` - add sast gate tests

---

### Task 3.5: Replace SastEvidenceSchema Stub with Typed Schema
**Complexity**: SMALL  
**Owner**: coder

**Requirements**:
- Replace stub `SastEvidenceSchema` (with `details` field) with typed schema:
```typescript
export const SastEvidenceSchema = BaseEvidenceSchema.extend({
  type: z.literal('sast'),
  findings: z.array(
    z.object({
      rule_id: z.string(),
      severity: z.enum(['critical', 'high', 'medium', 'low']),
      message: z.string(),
      location: z.object({
        file: z.string(),
        line: z.number().int(),
        column: z.number().int().optional(),
      }),
      remediation: z.string().optional(),
    })
  ).default([]),
  engine: z.enum(['tier_a', 'tier_a+tier_b']),
  files_scanned: z.number().int(),
  findings_count: z.number().int(),
  findings_by_severity: z.object({
    critical: z.number().int(),
    high: z.number().int(),
    medium: z.number().int(),
    low: z.number().int(),
  }),
});
```

**Acceptance Criteria**:
- [x] Typed schema matches tool output contract
- [x] Schema validates correctly
- [x] No breaking changes to existing evidence types

**Status**: ✅ **COMPLETE** - QA Gate passed (typecheck clean)

**Files**:
- `src/config/evidence-schema.ts` - update SastEvidenceSchema

---

## Evidence Schema Target (v6.9)

Per Evidence Matrix in roadmap:

| Type | Core fields | Status |
|------|-------------|--------|
| `sast` | `verdict`, `findings[] { rule_id, severity, message, location }`, `engine` | Stage 3 |

## Dependencies

```
Task 3.1 (Tier A rules)     Task 3.5 (schema)
       ↓                           ↓
       └────────────┬──────────────┘
                    ↓
            Task 3.2 (Semgrep)
                    ↓
            Task 3.3 (tool)
                    ↓
            Task 3.4 (gate)
```

**Dependency Notes**:
- Task 3.1 and Task 3.5 are independent and can be done in parallel
- Task 3.2 depends on Task 3.1 (needs rule engine structure)
- Task 3.3 depends on Task 3.2 (needs both Tier A and Tier B)
- Task 3.4 depends on Task 3.3 (tool must be ready for gate integration)

## QA Gate Process

Each task follows the mandatory QA gate:
1. coder implements
2. diff analysis
3. imports audit
4. lint fix → lint check
5. secretscan
6. reviewer (general)
7. reviewer (security) - CRITICAL for security-related code
8. test_engineer (verification tests)
9. test_engineer (adversarial tests)
10. coverage check

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| False positives in rules | Medium | Medium | Start with high-signal patterns only, tune thresholds |
| Semgrep not available | High | Low | Graceful fallback to Tier A only |
| Tree-sitter query complexity | Medium | Medium | Use regex fallback for complex patterns |
| Performance on large codebases | Low | Medium | Incremental scanning (changed_files only) |

## Definition of Done

- [x] All 5 tasks complete with QA approval
- [x] 167+ tests passing (65 rule + 32 semgrep + 33 tool + 37 gate = 167)
- [x] Gate integration tests verify non-bypassability (37 tests)
- [x] Evidence schema properly typed
- [x] Security reviewer approved (command injection vulnerability fixed)
- [x] Both Tier A and Tier B modes tested
- [x] All lint checks pass

**STATUS**: ✅ **STAGE 3 COMPLETE**

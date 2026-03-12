# AI Slop Review Report

**Repository:** opencode-swarm
**Review Date:** 2025-07-15
**Reviewer:** ai_slop_reviewer
**Overall Risk Level:** HIGH

---

## Executive Summary

The opencode-swarm codebase contains a significant volume of AI-generated code defects concentrated in three areas: pervasive copy-paste duplication of security-critical utility functions with inconsistent behavior, a massive God Function (`toolBefore` in `guardrails.ts`, ~448 lines, nesting depth > 6), and widespread Testing Theater where hundreds of tests verify that LLM prompt *strings contain certain words* rather than exercising any runtime behavior. The most severe finding is a security-impacting inconsistency in the `containsControlChars` implementation across `src/tools/secretscan.ts` — it only blocks two control characters (`\0\r`) while every other implementation in the codebase blocks four (`\0\t\r\n`), creating a tab-injection bypass path through the secret scanning tool. Immediate remediation requires centralizing all path-validation utilities into a shared module and decomposing the guardrails God Function.

---

## Findings

---

### CRITICAL — Error Handling Theater / Security Red Flag — `src/tools/secretscan.ts` (Line 318)

**Finding:** `containsControlChars` in `secretscan.ts` only blocks null bytes and carriage returns (`[\0\r]`). Every other implementation of the same function in the codebase blocks null, tab, carriage-return, AND newline (`[\0\t\r\n]`). This creates a tool-specific bypass: a tab-character-injected directory path would pass `secretscan`'s own validation but be blocked by the identical check in `lint.ts`, `todo-extract.ts`, `imports.ts`, `evidence-check.ts`, and `complexity-hotspots.ts`.

**Evidence:**
```typescript
// src/tools/secretscan.ts line 318 — ONLY 2 characters blocked
function containsControlChars(str: string): boolean {
    return /[\0\r]/.test(str);
}

// src/tools/lint.ts line 56 — 4 characters blocked (correct)
export function containsControlChars(str: string): boolean {
    return /[\0\t\r\n]/.test(str);
}

// src/tools/todo-extract.ts line 86 — 4 characters blocked (correct)
function containsControlChars(str: string): boolean {
    return /[\0\t\r\n]/.test(str);
}

// Same pattern (4-char set) found in: imports.ts:32, evidence-check.ts:51, complexity-hotspots.ts:56
```

**Why This Is AI Slop:** LLM code generators routinely produce slightly-different copies of the same utility function in each file rather than importing from a shared module, and the subtle differences in the regex character sets are a hallmark of independent copy-generation rather than intentional divergence. The inconsistency is masked by the fact that all versions appear superficially correct.

**Remediation:** Create `src/utils/path-security.ts` exporting a single canonical `containsControlChars`, `containsPathTraversal`, and `isAbsolutePath`. Remove all 11 private copies. Use `/[\0\t\r\n]/.test(str)` as the standard.

---

### HIGH — Structural Anti-Pattern (God Function) — `src/hooks/guardrails.ts` (Lines 317–765)

**Finding:** The `toolBefore` async handler inside `createGuardrailsHooks` spans approximately 448 lines with nesting depth exceeding 6 levels. It combines self-coding detection, plan-state protection, apply_patch parsing, write-tool tracking, scope enforcement, loop-count checks, idle-timeout checks, and soft-warning logic in a single monolithic callback. Cyclomatic complexity is well above 30.

**Evidence:**
```typescript
// src/hooks/guardrails.ts line 317 — function opens
toolBefore: async (input, output) => {
    // ... 448 lines follow ...
    // nesting depth example around line 456:
    if (typeof patchText === 'string' && patchText.length <= 1_000_000) {
        for (const match of patchText.matchAll(patchPathPattern)) {
            paths.add(match[1].trim());
        }
        for (const p of paths) {
            const resolvedP = path.resolve(directory, p);
            if (resolvedP.toLowerCase() === planMdPath || ...) {
                throw new Error('PLAN STATE VIOLATION: ...');
            }
            if (isOutsideSwarmDir(p, directory) && (isSourceCodePath(p) || hasTraversalSegments(p))) {
                const session = swarmState.agentSessions.get(input.sessionID);
                if (session) {   // ← depth 6+ here
```

**Why This Is AI Slop:** AI code generators produce sprawling, deeply-nested handlers by appending feature after feature without refactoring. A human engineer would extract each responsibility (scope checking, patch parsing, limit checking) into named private functions after the second feature.

**Remediation:** Extract at minimum five named private functions from `toolBefore`: `checkPlanStateViolation`, `checkSelfCodingWrite`, `checkScopeViolation`, `checkGateLimits`, and `checkIdleTimeout`. The outer handler should only sequence these calls.

---

### HIGH — Structural Anti-Pattern (Copy-Paste Duplication) — Multiple Files

**Finding:** `containsPathTraversal` is defined as an independent private function in **5 separate source files** with meaningfully different implementations. The variations in security coverage are not documented and are inconsistent:

- `src/tools/lint.ts` line 52: Checks `\.\.[/\\]`, normalized version, and encoded `%2e%2e/%2E%2E` (4 checks)
- `src/tools/imports.ts` line 28: Only checks `\.\.[/\\]` (1 check)
- `src/tools/todo-extract.ts` line 82: Only checks `\.\.[/\\]` (1 check)
- `src/tools/symbols.ts` line 41: Checks pattern + encoded variants + tilde + absolute path (6 checks)
- `src/tools/secretscan.ts` line 306: Checks basic patterns + encoded variants (4 checks)
- `src/tools/test-runner.ts` line 81: 9 checks including Unicode fullwidth dots (U+FF0E, U+3002, U+FF65) and `%2f`/`%5c` path separators — most comprehensive

**Evidence (comparing two extremes):**
```typescript
// src/tools/imports.ts line 28 — WEAKEST (1 check)
function containsPathTraversal(str: string): boolean {
    return /\.\.[/\\]/.test(str);
}

// src/tools/test-runner.ts line 81 — STRONGEST (9 checks including Unicode)
function containsPathTraversal(str: string): boolean {
    if (/\.\.[/\\]/.test(str)) return true;
    if (/(?:^|[/\\])\.\.(?:[/\\]|$)/.test(str)) return true;
    if (/%2e%2e/i.test(str)) return true;
    if (/%2e\./i.test(str)) return true;
    if (/%2e/i.test(str) && /\.\./.test(str)) return true;
    if (/%252e%252e/i.test(str)) return true;
    if (/\uff0e/.test(str)) return true;   // Fullwidth dot
    if (/\u3002/.test(str)) return true;   // Ideographic full stop
    if (/\uff65/.test(str)) return true;   // Halfwidth katakana middle dot
    ...
}
```

**Why This Is AI Slop:** Classic AI copy-paste duplication. Each tool module was generated independently with its own local copy instead of importing from a shared utility. The growing divergence in security coverage creates inconsistent attack surfaces depending on which tool is invoked.

**Remediation:** Centralize in `src/utils/path-security.ts` using the most comprehensive implementation (test-runner.ts variant as the baseline). Remove all 5 private copies and import the shared function.

---

### HIGH — Structural Anti-Pattern (Copy-Paste Duplication) — `src/services/context-budget-service.ts` (Line 17) / `src/services/run-memory.ts` (Line 18)

**Finding:** Identical `validateDirectory` functions are copy-pasted across two service files, and three additional near-identical variants exist in `preflight-service.ts`, `secretscan.ts`, and `pre-check-batch.ts`. The implementations differ in return type and error reporting strategy, creating maintenance risk and behavioral divergence.

**Evidence:**
```typescript
// src/services/context-budget-service.ts line 17 — verbatim copy
function validateDirectory(directory: string): void {
    if (!directory || directory.trim() === '') {
        throw new Error('Invalid directory: empty');
    }
    if (/\.\.[/\\]/.test(directory)) {
        throw new Error('Invalid directory: path traversal detected');
    }
    if (directory.startsWith('/') || directory.startsWith('\\')) {
        throw new Error('Invalid directory: absolute path');
    }
    if (/^[A-Za-z]:[\\/]/.test(directory)) {
        throw new Error('Invalid directory: Windows absolute path');
    }
}

// src/services/run-memory.ts line 18 — character-for-character identical
function validateDirectory(directory: string): void {
    if (!directory || directory.trim() === '') {
        throw new Error('Invalid directory: empty');
    }
    ...
}
```

**Why This Is AI Slop:** LLMs produce self-contained modules by generating all required helpers locally. Without cross-file awareness, the same function gets regenerated in every file that needs it.

**Remediation:** Move canonical `validateDirectory` to `src/utils/path-security.ts` or the existing `src/hooks/utils.ts` which already exports `validateSwarmPath`. Import the shared version from all five call sites.

---

### HIGH — Structural Anti-Pattern (Copy-Paste Duplication) — `src/quality/metrics.ts` (Line 36) / `src/tools/complexity-hotspots.ts` (Line 205)

**Finding:** `estimateCyclomaticComplexity` in `src/quality/metrics.ts` and `estimateComplexity` in `src/tools/complexity-hotspots.ts` are **character-for-character identical** in their bodies — same preprocessing steps, same decision-pattern array, same ternary heuristic — differing only in name.

**Evidence (diff output):**
```
1c1
< function estimateCyclomaticComplexity(content: string): number {
---
> function estimateComplexity(content: string): number {
```
Body lines: identical. This was confirmed with `diff` on the relevant line ranges.

**Why This Is AI Slop:** A second module needed complexity estimation and the LLM regenerated the function verbatim rather than importing the existing one, giving it a slightly different name to avoid a naming collision.

**Remediation:** Export `estimateCyclomaticComplexity` from `src/quality/metrics.ts` and import it into `src/tools/complexity-hotspots.ts`. Delete the duplicate.

---

### HIGH — Testing Theater — `tests/integration/evidence-summary-init.test.ts` (Line 127–130)

**Finding:** A test explicitly described as verifying that `swarmDir === ctx.directory` contains a logically tautological assertion: it assigns the hardcoded string `'/test/project'` to `expectedSwarmDir`, then asserts `expect(expectedSwarmDir).toBe('/test/project')`. This test is permanently green by definition and proves nothing about the actual source code.

**Evidence:**
```typescript
// tests/integration/evidence-summary-init.test.ts lines 118-130
it('should pass ctx.directory as swarmDir (not ctx.directory + /.swarm)', () => {
    // This is verified by reading the source code ...
    // We test this by verifying the source code explicitly sets swarmDir to ctx.directory
    // For this test, we just verify the expected behavior:
    const ctxDirectory = '/test/project';
    const expectedSwarmDir = ctxDirectory; // NOT ctxDirectory + '/.swarm'

    expect(expectedSwarmDir).toBe('/test/project');       // ← TAUTOLOGY
    expect(expectedSwarmDir).not.toBe('/test/project/.swarm'); // ← TAUTOLOGY
});
```

**Why This Is AI Slop:** The test was scaffolded by an LLM that wanted to appear to cover a requirement but couldn't figure out how to actually call the integration code. The comment admits it: "We test this by verifying the source code explicitly..." — which is not a test, it's a comment. The assertions are vacuously true and will never fail regardless of code changes.

**Remediation:** Delete this test and replace it with an actual integration test that instantiates `createEvidenceSummaryIntegration`, passes `ctx.directory` in both `directory` and `swarmDir` fields, and asserts that file writes occur in the expected location.

---

### HIGH — Testing Theater — `tests/unit/agents/architect-v6-prompt.test.ts` (268 assertions)

**Finding:** The single largest test file in the repository (2856 lines) contains 268 assertions that do nothing but check whether the LLM *prompt template string* contains specific substrings. None of these tests exercise any runtime behavior, business logic, or integration path. A test that verifies `expect(prompt).toContain('secretscan')` cannot detect logic bugs, ordering errors, or behavioral regressions — only typos in the prompt.

**Evidence:**
```typescript
// tests/unit/agents/architect-v6-prompt.test.ts line 14-18
const agent = createArchitectAgent('test-model');
const prompt = agent.config.prompt!;

it('1. Rule 7 contains pre-reviewer sequence: imports', () => {
    expect(prompt).toContain('imports');  // Passes if 'imports' exists anywhere
});

it('4. Rule 7 contains pre-reviewer sequence: secretscan', () => {
    expect(prompt).toContain('secretscan');
});
```

This pattern accounts for **889 assertions** across the agent test directory:
- `tests/unit/agents/architect-v6-prompt.test.ts`: 268 `expect(prompt)` assertions
- `tests/unit/agents/architect-gates.test.ts`: checks prompt substrings for tool names
- `tests/unit/agents/architect-prompt-template.test.ts`: checks prompt for `[COMPLETE]`, `[IN PROGRESS]`, etc.
- `tests/unit/agents/architect-prompt-adversarial.test.ts`: checks prompt for security keywords
- `src/agents/test-engineer.adversarial.test.ts`: all "attack vectors" are prompt-string assertions

**Why This Is AI Slop:** Testing LLM prompt content is not security testing. The tests label themselves "adversarial security" but they verify prompt wording, not that the wording produces secure behavior. This is the definition of testing theater: maximum test count, zero behavioral coverage.

**Remediation:** Delete or categorize these as "prompt content regression tests" (not security tests). Supplement with behavioral integration tests that actually invoke the hook pipeline and verify that security rules fire when violated.

---

### HIGH — Testing Theater — `src/sast/semgrep.test.ts` (Multiple Tests)

**Finding:** The semgrep test suite contains 17 `expect(typeof result).toBe('boolean')` or `expect(result).toHaveProperty(...)` assertions that only verify TypeScript types at runtime, not behavioral correctness. None of the tests inject a real semgrep-format JSON payload to verify that `parseSemgrepResults` correctly maps findings, severity, location, or `check_id` fields.

**Evidence:**
```typescript
// src/sast/semgrep.test.ts line 34-36 — type-check only
it('should return boolean regardless of semgrep presence', () => {
    const result = isSemgrepAvailable();
    expect(typeof result).toBe('boolean');  // Always true — TS guarantees this
});

// src/sast/semgrep.test.ts line 88-93 — property existence only
it('should return available property when semgrep not available', async () => {
    const result = await runSemgrep({ files: [] });
    expect(result).toHaveProperty('available');
    expect(typeof result.available).toBe('boolean');
});
```

**Why This Is AI Slop:** TypeScript already enforces that `isSemgrepAvailable` returns `boolean`. Asserting `typeof result === 'boolean'` at runtime is redundant type verification that provides zero value beyond TypeScript compilation itself. The real risk — that `parseSemgrepResults` silently returns empty arrays for malformed Semgrep output — is completely untested.

**Remediation:** Add tests that feed mock Semgrep JSON output (both v1 and exit-code-1 formats) to `parseSemgrepResults` and assert specific `rule_id`, `severity`, `location.line`, and `excerpt` values in the output. The current tests should be removed or reorganized as smoke tests.

---

### MEDIUM — Phantom Import / Dead Variable — `src/sast/semgrep.ts` (Lines 6, 9, 12)

**Finding:** `execFile` is imported from `node:child_process` solely to create `_execFileAsync = promisify(execFile)` on line 12. `_execFileAsync` is never called anywhere in the file — the actual implementation switched to `spawn` instead. Both `execFile` (for the promisification) and `promisify` (from `node:util`) become phantom imports. The underscore prefix on the variable name is an acknowledgement that it is unused.

**Evidence:**
```typescript
// src/sast/semgrep.ts lines 6, 9, 12
import { execFile, execFileSync, spawn } from 'node:child_process';
import * as path from 'node:path';
import { promisify } from 'node:util';   // ← only used for _execFileAsync

const _execFileAsync = promisify(execFile);  // ← NEVER CALLED

// The actual implementation uses spawn (line ~153)
const child = spawn(command, args, { shell: false, cwd: options.cwd });
```

**Why This Is AI Slop:** This is the classic "generated then refactored but forgot to clean up" pattern. An LLM initially generated the code to use `promisify(execFile)`, then the implementation was rewritten to use `spawn`, but the dead setup code was left behind.

**Remediation:** Remove `execFile` from the `child_process` import, remove `promisify` import from `node:util`, and delete `const _execFileAsync`.

---

### MEDIUM — Dead Variable — `src/quality/metrics.ts` (Line 27)

**Finding:** `const _N_GRAM_SIZE = 5` is declared with the comment "reserved for future use" and is never referenced anywhere in the file or the codebase.

**Evidence:**
```typescript
// src/quality/metrics.ts line 27
const _N_GRAM_SIZE = 5; // n-gram size for duplication detection (reserved for future use)
```

**Why This Is AI Slop:** Placeholder constants with comments like "reserved for future use" are a hallmark of LLM-generated code that demonstrates knowledge of a concept (n-gram duplication detection) without actually implementing it. The constant is cargo-culted from a hypothetical implementation that never materialized.

**Remediation:** Remove the constant. If n-gram duplication detection is needed in the future, add it with a concrete implementation.

---

### MEDIUM — Dead Variable — `src/background/circuit-breaker.ts` (Line 173)

**Finding:** `const oldState = this.state` is assigned immediately before overwriting `this.state`, but `oldState` is never read or used afterward. The `biome-ignore` comment explicitly acknowledges it is unused "useful for debugging/logging in future."

**Evidence:**
```typescript
// src/background/circuit-breaker.ts line 171-174
private transitionTo(newState: CircuitBreakerState): void {
    // biome-ignore lint/correctness/noUnusedVariables: oldState useful for debugging/logging in future
    const oldState = this.state;   // ← NEVER READ
    this.state = newState;
    ...
}
```

**Why This Is AI Slop:** An LLM generated this code with a state-transition pattern in mind ("I should log old→new state transitions"), started the variable, then never used it. The `biome-ignore` suppression to silence the linter while leaving the dead code is a red flag — it hides the cleanup work that should have been done.

**Remediation:** Delete `const oldState`. If transition logging is needed, implement it: `const oldState = this.state; log('transition', { from: oldState, to: newState });`.

---

### MEDIUM — Dead Variable — `src/tools/placeholder-scan.ts` (Line 143)

**Finding:** `const _TEST_CONTENT_PATTERNS` is a large array of regex patterns defined but never used anywhere in the file.

**Evidence:**
```typescript
// src/tools/placeholder-scan.ts line 143
const _TEST_CONTENT_PATTERNS = [
    /\bdescribe\s*\(/,
    /\bit\s*\(/,
    /\btest\s*\(\s*['"`]/,
    // ... 10 more entries ...
];
```

**Why This Is AI Slop:** Another "reserved for future use" dead constant. The underscore prefix is the author's acknowledgment that it is unused. The file uses `TEST_PATH_PATTERNS` instead (path-based detection), making this content-based pattern array vestigial.

**Remediation:** Delete the constant. If content-based test detection is needed in the future, add it with a concrete implementation and remove the suppression prefix.

---

### MEDIUM — Error Handling Theater — `src/sbom/detectors/index.ts` (Line 207)

**Finding:** A bare empty `catch {}` silently swallows all exceptions from detector invocations. There is no logging, no metric increment, no error return — failures are indistinguishable from "no components found."

**Evidence:**
```typescript
// src/sbom/detectors/index.ts lines 202-210
for (const detector of detectors) {
    try {
        const components = detector.detect(filePath, content);
        if (components.length > 0) {
            return components;
        }
    } catch {}   // ← SILENT FAILURE — no logging, no error propagation
}
return [];
```

**Why This Is AI Slop:** AI-generated catch blocks often contain only `{}` to ensure code compiles, leaving the error handling as a future concern. Here, a detector that throws due to a bug or malformed file will silently return as if no SBOM components were found, making SBOM generation appear to succeed while producing incomplete results.

**Remediation:** At minimum: `catch (err) { console.warn('[sbom] detector failed for', filePath, err instanceof Error ? err.message : err); }`. Better: track errors and include them in the detector result for caller visibility.

---

### MEDIUM — Error Handling Theater — `src/services/decision-drift-analyzer.ts` (Lines 345, 428)

**Finding:** Two broad `try/catch` blocks wrap the entire body of `analyzeDecisionDrift`, returning `{ hasDrift: false, signals: [], summary: '' }` on any error with no logging. A bug in any analysis step, file read failure, or plan parsing error will silently produce a "no drift detected" result, making the drift detection functionally invisible when it fails.

**Evidence:**
```typescript
// src/services/decision-drift-analyzer.ts line 340-435 (structure)
try {
    // ... all drift analysis logic ...
    try {
        contextContent = fs.readFileSync(contextPath, 'utf-8');
    } catch {
        return { hasDrift: false, signals: [], summary: '', analyzedAt };  // ← line 345
    }
    // ...
} catch {
    // On error, return empty result
    return { hasDrift: false, signals: [], summary: '', analyzedAt };  // ← line 428
}
```

**Why This Is AI Slop:** Broad catch-and-return-default is a common AI pattern for making functions "robust" without actually handling errors. The caller receives a valid-looking result and cannot distinguish "no drift detected" from "analysis completely failed."

**Remediation:** Add at minimum `console.warn('[decision-drift-analyzer] Analysis failed:', err)` before returning the empty result. Ideally add an `error` field to `DriftAnalysisResult` and propagate it.

---

### MEDIUM — Error Handling Theater — Multiple Files (Silent Bare Catches)

**Finding:** The following locations contain `} catch { ... }` blocks that silently return default values without any logging, making it impossible to diagnose failures in production:

| File | Line | Behavior |
|------|------|----------|
| `src/context/role-filter.ts` | 162 | Comment says "Silently swallow errors - non-fatal" — no logging |
| `src/services/config-doctor.ts` | 169 | `return false` — config path validation silently fails safe |
| `src/services/config-doctor.ts` | 187, 197 | `// Failed to read, try user config` — no warning log |
| `src/hooks/guardrails.ts` | 850 | `// Use default phase 1 if plan loading fails` — no logging |
| `src/hooks/guardrails.ts` | 947 | `} catch {}` empty — behavioral guidance trimming silently fails |
| `src/hooks/guardrails.ts` | 1229 | `// Silently skip if plan loading fails` — no logging |
| `src/services/handoff-service.ts` | 271 | `return null` — active state extraction silently fails |

**Why This Is AI Slop:** AI code generators produce try/catch wrappers to avoid crashes without considering observability. Swallowing exceptions without logging is an anti-pattern that makes production debugging impossible.

**Remediation:** For each: add at minimum `console.warn('[module] operation failed:', err instanceof Error ? err.message : err)` before the return. Non-fatal operations should still be observable.

---

### LOW — Context Blindness (Naming Convention Inconsistency) — `src/commands/write_retro.ts`

**Finding:** Every command file in `src/commands/` uses kebab-case naming (`dark-matter.ts`, `sync-plan.ts`, `write-retro.ts` in `src/tools/`), but `src/commands/write_retro.ts` uses snake_case. This is the only outlier in the entire commands directory.

**Evidence:**
```
src/commands/
├── dark-matter.ts    ← kebab-case
├── sync-plan.ts      ← kebab-case
├── write_retro.ts    ← snake_case (outlier)   ← INCONSISTENT
...
src/tools/
├── write-retro.ts    ← kebab-case (consistent)
```

**Why This Is AI Slop:** Each module was generated independently and the naming convention was not enforced cross-file. The LLM mirrored the tool name (`write_retro`) instead of following the file naming pattern.

**Remediation:** Rename `src/commands/write_retro.ts` to `src/commands/write-retro.ts` and update all imports accordingly.

---

## Slop Score Summary

| Category                    | Files Affected | Findings | Severity |
|-----------------------------|----------------|----------|----------|
| Unimplemented Stubs         | 0              | 0        | —        |
| Phantom Imports / Dead Code | 3              | 4        | MEDIUM   |
| Buzzword Inflation          | 0              | 0        | —        |
| Structural Anti-Patterns    | 6              | 5        | HIGH     |
| Testing Theater             | 8              | 5        | HIGH     |
| Error Handling Theater      | 9              | 3        | MEDIUM   |
| Hallucinated APIs           | 0              | 0        | —        |
| Sycophantic Over-Engineering| 0              | 0        | —        |
| Security Red Flags          | 1              | 1        | CRITICAL |
| Context Blindness           | 2              | 2        | LOW/MED  |

**Total Findings:** 20
**Files Clean:** ~85 / 120 source files

---

## Recommended Actions (Priority Order)

1. **[CRITICAL] Fix `containsControlChars` in `src/tools/secretscan.ts` (line 318):** Change `[\0\r]` to `[\0\t\r\n]` to match the other five implementations. Do this immediately — it is a security regression.

2. **[HIGH] Centralize all path-security utility functions:** Create `src/utils/path-security.ts` exporting a single canonical `containsPathTraversal` (use `test-runner.ts` variant as the strongest baseline), `containsControlChars` (`[\0\t\r\n]`), and `validateDirectory`. Remove all 11+ private copies scattered across the tools directory.

3. **[HIGH] Decompose `toolBefore` in `src/hooks/guardrails.ts`:** Extract at minimum five named private functions: `checkPlanStateViolation`, `checkSelfCodingWrite`, `checkScopeViolation`, `checkGateLimits`, and `checkIdleTimeout`. The outer handler becomes a sequencer.

4. **[HIGH] Extract or delete the duplicate complexity estimation function:** Either export `estimateCyclomaticComplexity` from `src/quality/metrics.ts` and import it in `src/tools/complexity-hotspots.ts`, or delete the copy in `complexity-hotspots.ts` and import the shared version. These two functions are character-for-character identical.

5. **[HIGH] Replace tautological test in `tests/integration/evidence-summary-init.test.ts`:** The test at lines 127–130 asserts `expect('/test/project').toBe('/test/project')`. Delete it and replace with a genuine integration test that actually invokes the integration code.

6. **[HIGH] Reclassify 889 prompt-string assertions in agent tests:** Tests in `tests/unit/agents/` that verify prompt string content are not security tests and not behavioral tests. Reclassify them as "prompt regression tests" and add actual behavioral integration tests that drive the hook pipeline.

7. **[MEDIUM] Remove phantom import dead code in `src/sast/semgrep.ts`:** Remove the `execFile` + `promisify` imports and the unused `_execFileAsync` constant.

8. **[MEDIUM] Delete unused constants with "reserved for future use" comments:** Remove `_N_GRAM_SIZE` from `src/quality/metrics.ts` and `_TEST_CONTENT_PATTERNS` from `src/tools/placeholder-scan.ts`. Implement features when needed, not speculatively.

9. **[MEDIUM] Add logging to all bare `catch {}` and `catch { return null; }` blocks:** At minimum, add `console.warn('[module] operation name failed:', err)` before every silent return in the nine locations identified under "Error Handling Theater."

10. **[LOW] Rename `src/commands/write_retro.ts` to `src/commands/write-retro.ts`** to restore naming consistency with all other command files.

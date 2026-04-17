---
name: issue-tracer
description: >
  Trace GitHub issues end-to-end, localize root causes precisely, map the complete
  resolution surface, and produce an implementation-ready dossier with exhaustive wiring,
  no placeholders, and deferred-work tracking.
effort: high
context: fork
---

## When to Use This Skill

Apply this skill when asked to:
- **Trace, investigate, diagnose, or root-cause** a GitHub issue
- **Plan the complete resolution** for an issue (not implement unless explicitly requested)
- **Identify all affected surfaces** that must change together
- **Define a dossier** showing exactly what must be fixed, why, and how to verify

**PLANNING ONLY** — This skill produces a resolution dossier and plan, not code changes.
If the user explicitly asks for implementation, say so and proceed, but default to planning.

---

## Core Standard: Issue Resolution Dossier

The output of this skill is a structured **Issue Resolution Dossier** that includes:

- Complete issue summary and evidence
- Reproduction path (minimal repro, failing test, or static evidence)
- Fault localization via multi-pass search
- Verified call chain from entry point to failure
- Precise root-cause statement (violated invariant, not just symptom)
- Exhaustive mapping of affected surfaces
- Wiring matrix (area, file, symbol, change, why, verification, confidence)
- Atomic resolution plan (exact targets, acceptance criteria, verification methods)
- Verification matrix (command, expected result, confidence)
- Deferred items (with created GitHub issues if necessary)
- Definition of done checklist

**No vague bullets. No TODOs. No placeholders. No "future work" wishlist.**

---

## Operating Principles

1. **Evidence-First** — Never propose a fix without reproduction evidence or clear diagnostic proof.

2. **Reproduction Before Localization** — Identify the smallest repro path (test, script, scenario) before tracing code.

3. **Multi-Pass Localization** — Use parallel strategies to narrow the fault:
   - Direct symbol search (error message, function name, API endpoint)
   - Entry-point tracing (from HTTP handler, API call, or event trigger)
   - Stack-trace mapping (if available, follow each frame backward)
   - Dependency-neighborhood inspection (who calls the suspected function?)
   - Related issues / PRs / reverts search (has this been touched before?)

4. **Root-Cause Precision** — State the violated invariant, not just the symptom:
   - ❌ "NullPointerException in getUserById"
   - ✓ "getUserById assumes user_id is always in the database, but no guard prevents missing IDs"

5. **Exhaustive Surface Mapping** — Identify every surface that must change:
   - Business logic
   - Type and interface definitions
   - Data schemas and validators
   - Routes, handlers, API contracts
   - Import/export statements
   - Dependency injection setup
   - Database models and migrations (if applicable)
   - Configuration and environment variables
   - Feature flags
   - Telemetry and logging
   - Documentation
   - Unit, integration, e2e, and regression tests

6. **Atomic Resolution Plan** — No ambiguity:
   - Exact file paths and line numbers or symbol names
   - Acceptance criteria per change (before/after)
   - Explicit verification command or code inspection per step
   - Confidence level for each step

7. **Deferred-Work Protocol** — Default is no deferral:
   - If a separate, prerequisite-blocked, or out-of-scope item must be deferred, create a GitHub issue **before concluding**
   - Include the issue number and link in the dossier
   - Document acceptance criteria and risk of leaving it undone
   - Forbid naked "future work," "maybe," or TODO-style bullets

8. **Definition of Done** — All of these must be true:
   - Root cause addressed at the correct layer (not just patching a symptom)
   - All required wiring accounted for and listed in the matrix
   - Regression protection present (existing or new tests specified)
   - Verification is explicit and reproducible
   - Every deferred item is tracked by a created GitHub issue

---

## Required Workflow

### Phase 1: Intake & Issue Structure

1. Read the GitHub issue in full, including comments, related issues, and any linked PRs.
2. Extract and structure:
   - Observed behavior (exact error message, stack trace, or symptom)
   - Expected behavior
   - Steps to reproduce
   - Environment (language, version, platform, configuration if relevant)
3. If critical context is missing, ask clarifying questions before proceeding.

### Phase 2: Reproduction

1. Identify the smallest reproducible path:
   - Look for existing failing tests in the repo that demonstrate the issue
   - If no test exists, define a minimal test or script that reproduces the problem
   - If the issue cannot be reproduced (no environment, unclear steps), document all attempts and ask for more info
2. Run the reproduction to capture the exact error output, stack trace, or assertion failure
3. Do NOT proceed to localization until reproduction is confirmed or a clear reason for non-reproduction is documented

### Phase 3: Multi-Pass Fault Localization

Use all applicable strategies in parallel to narrow the fault:

**3a. Direct Symbol Search**
- Search for the error message or exception type
- Search for suspected function/method names from the stack trace
- Search for the API endpoint or event handler mentioned in the issue

**3b. Entry-Point Tracing**
- Start from the user-facing entry point (HTTP route, API call, event trigger)
- Follow the call chain forward to the failure point
- Document each layer (controller → service → domain → persistence)

**3c. Stack-Trace Mapping**
- If a stack trace is available, map each frame to the actual code
- Verify line numbers and trace backward from the failing frame to the origin

**3d. Dependency-Neighborhood Inspection**
- Find all callers of the suspected function
- Check if any recent changes broke the contract (type, behavior, return value)
- Review recent commits touching related files

**3e. Related Issues / PRs / Regressions**
- Search for issues mentioning the same component or symptom
- Check if the issue was introduced by a specific commit
- Look for reverts or hotfixes

### Phase 4: Root-Cause Identification

Stop localization when you can state a single, concrete root cause in this form:

```
FILE:LINE — <symbol or artifact>
VIOLATED INVARIANT: <what must be true but isn't>
INPUTS/ENVIRONMENT: <when does this occur>
EVIDENCE: <reproduction command, test name, or code evidence>
```

Example:
```
src/users/service.ts:42 — getUserById()
VIOLATED INVARIANT: all user IDs in the request must exist in the database before calling getUser
INPUTS: any missing or invalid user_id in the query parameter
EVIDENCE: test_getUserById_with_invalid_id fails with NullPointerException
```

### Phase 5: Surface Mapping

Map every surface that must change to resolve the issue:

| Category | Aspect | Status |
|----------|--------|--------|
| Business Logic | [describe] | Not Affected / Affected |
| Type/Interface | [describe] | Not Affected / Affected |
| Schema/Validator | [describe] | Not Affected / Affected |
| Routes/Handlers | [describe] | Not Affected / Affected |
| Imports/Exports | [describe] | Not Affected / Affected |
| Dependency Injection | [describe] | Not Affected / Affected |
| Database Models | [describe] | Not Affected / Affected |
| Configuration | [describe] | Not Affected / Affected |
| Feature Flags | [describe] | Not Affected / Affected |
| Telemetry/Logging | [describe] | Not Affected / Affected |
| Documentation | [describe] | Not Affected / Affected |
| Tests | [describe] | Not Affected / Affected |

### Phase 6: Wiring Matrix

Produce a table showing every wiring point that must be updated:

| Area | File | Symbol or Artifact | Required Change | Why Necessary | Verification Method | Confidence |
|------|------|-------------------|-----------------|---------------|---------------------|------------|
| [e.g., Business Logic] | [path/to/file] | [functionName] | [exact change description] | [why this fixes the root cause] | [command or code inspection] | High/Medium |

**Columns:**
- **Area**: Category from surface map (e.g., type, schema, route, test)
- **File**: Exact file path relative to repo root
- **Symbol or Artifact**: Function, class, constant, config key, schema name, test name, etc.
- **Required Change**: Concrete, unambiguous description (not "fix it" but "add null guard on line 42" or "add validation rule for x > 0")
- **Why Necessary**: How this change addresses the root cause
- **Verification Method**: Command to run (`pytest tests/x.py::test_y` or "inspect code at line X")
- **Confidence**: High (certain), Medium (likely), Low (exploratory)

### Phase 7: Atomic Resolution Plan

Create a step-by-step plan with no ambiguity:

```
## Step N: [Component/Layer Name]
FILE: path/to/file
SYMBOL: function_name or class_name
CHANGE: [exact description of what to change]
ACCEPTANCE CRITERIA:
  - [before]: [current behavior]
  - [after]: [desired behavior]
VERIFICATION:
  - COMMAND: pytest tests/x.py::test_y
  - EXPECTED: All assertions pass
  - CONFIDENCE: High
```

Repeat for every wiring point in the matrix.

### Phase 8: Deferred-Work Protocol

**Default: no deferral.** Every required change must be part of the plan.

**If a change must be deferred:**
1. Document exactly why (blocked by prerequisite, out of scope, architectural blocker)
2. Create a GitHub issue with:
   - Acceptance criteria
   - Impact if left undone
   - Estimated effort
   - Link to this dossier
3. Include the issue number in the dossier under "Deferred Items"
4. Do NOT mark the work "done" until the issue is created

---

## Output Format

The final output **must be** an "Issue Resolution Dossier" with these sections in order:

```markdown
# Issue Resolution Dossier: #<NUMBER> — <TITLE>

## Issue Summary
[Brief description of the problem, impact, and scope]

## Evidence
[Error messages, stack traces, reproduction output, or links to related issues]

## Reproduction
[Exact steps, command, or test to reproduce. Include output.]

## Fault Localization
[Summary of multi-pass search strategy and findings. List candidate locations and how each was ruled in/out.]

## Verified Call Chain
[Trace from entry point to failure point, line by line. Include exact file:line references.]

## Root Cause
[Precise violated-invariant statement. Include file:line, symbol, and condition.]

## Affected Surface Area
[Table showing which surfaces must change.]

## Wiring Matrix
[Table of all required changes with verification methods.]

## Resolution Plan
[Step-by-step atomic plan with file, symbol, change, acceptance criteria, verification per step.]

## Verification Matrix
[Table of all verification commands, expected results, and confidence per command.]

## Deferred Items
[If any changes are deferred: GitHub issue number, link, acceptance criteria, risk. If none: "None."]

## Definition of Done
Checklist:
- [ ] Root cause addressed at the correct layer
- [ ] All required wiring accounted for in the matrix
- [ ] Regression protection specified (test commands or files)
- [ ] Verification explicit and reproducible
- [ ] Every deferred item tracked by a created GitHub issue
```

---

## Definition of Done

You are finished only when:

1. ✓ Root cause is a precise violated-invariant statement, not a symptom description
2. ✓ All affected surfaces are identified and mapped
3. ✓ Wiring matrix is exhaustive (no ambiguous "fix auth flow" bullets)
4. ✓ Resolution plan has exact file:line or symbol targets
5. ✓ Every plan step has acceptance criteria and verification command
6. ✓ Regression protection is explicit (test file, command, or code inspection)
7. ✓ All deferred items are tracked by created GitHub issues
8. ✓ No placeholders, TODOs, TBDs, WIP items, or vague future-work bullets remain

---

## Hard Failure Conditions

**You MUST TELL THE USER these conditions are not met and stop before concluding:**

❌ Any unspecified files or symbols ("fix the auth layer" without naming the file)
❌ Any TODO, TBD, WIP, or placeholder in the dossier
❌ Any vague resolution bullet like "update tests" without naming the test file or writing the test
❌ Missing verification commands for any step
❌ Deferred work without a created GitHub issue and issue number
❌ Regression protection not explicitly mentioned or verified
❌ Root cause stated as a symptom ("NullPointerException") not an invariant violation

If any of these remain, **do not mark the work complete.** Return to the step that left the item unspecified and complete it.

---

## Heuristics & Example Invocations

### When to Use This Skill

```
User: "Help me trace this authentication bug — it's throwing a 401 on valid tokens"
→ Use issue-tracer. Full dossier.

User: "Can you investigate why the API returns 500 for GET /users/{id}?"
→ Use issue-tracer. Produce dossier.

User: "What would it take to fix the memory leak in the cache layer?"
→ Use issue-tracer to plan. Do not implement.

User: "This test is failing in CI. Root cause?"
→ Use issue-tracer. Provide dossier.
```

### When NOT to Use This Skill

- User asks for quick triaging (use direct code reading instead)
- User needs implementation (this skill is planning-only; explicitly note that)
- Issue is already well-documented in a GitHub issue with a clear fix (but feel free to validate and enhance)

### Expected Output Shape

```
# Issue Resolution Dossier: #1234 — Authentication fails on valid tokens

## Issue Summary
Users reporting 401 errors when presenting valid JWT tokens...

## Evidence
Stack trace from logs: NullPointerException at auth/middleware.ts:52
PR #999 merged 3 days ago touching token validation...

## Reproduction
Test case: `tests/auth/test_token_validation.ts::test_valid_token_should_return_200`
Command: `npm test -- --grep "valid.*token"`
Output: FAIL - expected 200, got 401

## Fault Localization
- Searched for "NullPointerException" → found in auth/middleware.ts:52
- Entry-point trace: HTTP handler → middleware → token validator
- Stack trace confirms failure in validateToken() at line 52
- Recent change: PR #999 modified token schema but didn't update validator
- Hypothesis ruled out: feature flag (checked, enabled)
- Hypothesis confirmed: schema mismatch between token and validator

## Verified Call Chain
1. HTTP handler receives token in Authorization header
2. Calls middleware → authenticate()
3. Calls tokenValidator.validate(token)
4. Line 52: attempts to access token.sub (subject claim)
5. NullPointerException: token.sub is undefined

## Root Cause
File: `src/auth/validator.ts:52`
Symbol: `validateToken()`
VIOLATED INVARIANT: assumes all JWT tokens have a 'sub' claim, but PR #999 changed the token schema to make 'sub' optional
INPUTS: any JWT token without a 'sub' claim
EVIDENCE: test fails; PR #999 diff shows schema change without validator update

## Affected Surface Area
| Category | Aspect | Status |
| Business Logic | token claim validation | Affected |
| Type/Interface | TokenPayload interface | Affected |
| Schema/Validator | JWT schema definition | Affected |
| Routes/Handlers | /auth/validate endpoint | Not Affected |
| Tests | token validation tests | Affected |

## Wiring Matrix
| Area | File | Symbol | Required Change | Why | Verification | Confidence |
| Type | src/types/auth.ts | TokenPayload | Add required: sub field OR add optional check | Align with validator assumption | grep -n "sub" src/types/auth.ts | High |
| Validator | src/auth/validator.ts | validateToken | Add null guard: if (!token.sub) throw | Prevent undefined access | npm test -- --grep "test_valid_token" | High |
| Test | tests/auth/test_validator.ts | test_missing_sub | Add test case for missing sub | Regression protection | npm test -- --grep "test_missing_sub" | High |

## Resolution Plan
### Step 1: Fix Validator Guard
FILE: src/auth/validator.ts
SYMBOL: validateToken()
CHANGE: Add guard on line 51: if (!token.sub) throw new Error("Missing subject claim")
ACCEPTANCE CRITERIA:
  - Before: NullPointerException on missing 'sub'
  - After: Clear error message "Missing subject claim"
VERIFICATION:
  - COMMAND: npm test -- --grep "test_missing_sub"
  - EXPECTED: PASS
  - CONFIDENCE: High

### Step 2: Update Type Definition
FILE: src/types/auth.ts
SYMBOL: TokenPayload interface
CHANGE: Make 'sub' required (remove optional ?)
ACCEPTANCE CRITERIA:
  - Before: sub?: string
  - After: sub: string
VERIFICATION:
  - COMMAND: npx tsc (type check)
  - EXPECTED: No type errors
  - CONFIDENCE: High

### Step 3: Add Regression Test
FILE: tests/auth/test_validator.ts
SYMBOL: test_missing_sub_claim_throws()
CHANGE: Add new test case that passes token without 'sub' claim, expects error
ACCEPTANCE CRITERIA:
  - Before: no such test
  - After: test exists and passes
VERIFICATION:
  - COMMAND: npm test -- --grep "test_missing_sub"
  - EXPECTED: PASS
  - CONFIDENCE: High

## Verification Matrix
| Command | Expected Result | Confidence |
| npm test -- --grep "test_valid_token" | PASS (all valid token tests) | High |
| npm test -- --grep "auth" | PASS (all auth tests) | High |
| npm test (full suite) | PASS | Medium |
| curl -H "Authorization: Bearer <valid-token>" http://localhost/users | 200 OK | Medium |

## Deferred Items
None.

## Definition of Done
✓ Root cause: NullPointerException due to undefined 'sub' claim access  
✓ Affected surfaces: validator, type, test  
✓ Wiring matrix: 3 changes listed  
✓ Resolution plan: 3 atomic steps with exact files/symbols  
✓ Verification: 3 test commands + 1 manual check  
✓ Regression protection: new test case specified  
✓ No TODOs or placeholders  
```

---

## Important Notes

- **This skill is planning-only.** If the user explicitly asks for implementation, note that explicitly.
- **Use parallel sub-agents** for multi-pass localization (symbol search, entry-point trace, dependency inspection can run in parallel).
- **Read the actual code end-to-end.** Do not guess; verify every claim against the real codebase.
- **Create GitHub issues for deferred work** before declaring the dossier complete.
- **Be precise.** "Fix the bug" is not a plan; "add null guard on line 42" is.

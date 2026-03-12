# Agent Prompt Modernization Plan

## Scope
Phase 1 (Critical) + Phase 2 (High-Impact Workers) + Phase 3 (Cross-Cutting) + Test file updates.
Does NOT include: A1/A2/A3 (architect polish), CR1/CR2 (critic medium/low), DS1/DS2 (designer polish), C3/C4 (coder medium/low), T5/E2/S2/R3 (medium items), LOW-priority items.

---

## Files to Modify

1. `src/agents/test-engineer.ts` — T1, T2, T3, T4 (CRITICAL/HIGH)
2. `src/agents/coder.ts` — C1, C2, X4 removal
3. `src/agents/reviewer.ts` — R1, R2, X4 removal
4. `src/agents/explorer.ts` — E1, X4 removal
5. `src/agents/sme.ts` — S1, X4 removal
6. `src/agents/docs.ts` — D1, X4 removal
7. `src/agents/architect.ts` — X2 (model-tier awareness note), X3 (output enforcement), X4 removal
8. `src/agents/critic.ts` — X4 removal
9. `src/agents/designer.ts` — X4 removal
10. `src/agents/test-engineer.adversarial.test.ts` — Update to cover T1-T4
11. `src/agents/test-engineer.security.test.ts` — Update to cover T1-T4

---

## Phase 1 — Test Engineer Overhaul (`test-engineer.ts`)

### T1: Assertion Quality Rules + Banned Patterns (CRITICAL)
Add `## ASSERTION QUALITY RULES` section with:
- BANNED patterns: `toBeTruthy()`, `toBeDefined()`, `toBeInstanceOf(Array)`, `not.toThrow()`, "it doesn't crash" tests
- REQUIRED: At least one EXACT VALUE / STATE CHANGE / ERROR / CALL VERIFICATION assertion per test
- TEST STRUCTURE requirements: happy path, error path, boundary, state mutation coverage

### T2: Property-Based Testing Guidance (HIGH)
Add `## PROPERTY-BASED TESTING` section with:
- When to use: mathematical/logical properties, idempotency, round-trip, monotonicity, preservation
- Why it breaks the "cycle of self-deception" (shared logical flaws in LLM code + tests)

### T3: Forced Self-Review Step (HIGH)
Add `## SELF-REVIEW` section (mandatory before reporting):
- Re-read source file
- Count public functions/methods/exports
- Confirm every public function has at least one test
- Confirm every test has an EXACT VALUE assertion
- COVERAGE FLOOR: <80% public functions = INCOMPLETE verdict

### T4: Test Execution Verification (HIGH)
Add `## EXECUTION VERIFICATION` section:
- Unexecuted test file = not a deliverable
- Fail classification: source bug (good) vs test bug (fix test)
- NEVER weaken assertions to make tests pass
- Enhanced VERDICT format: `VERDICT: PASS [N/N] | FAIL [N passed, M failed]` + `COVERAGE` + `BUGS FOUND`

---

## Phase 2 — Worker Agent Improvements

### C1 + C2: Coder Defensive Rules + Error Handling (`coder.ts`)
Add `## DEFENSIVE CODING RULES`:
- No `any` in TypeScript, no empty catch blocks, no path string concatenation, no relative path traversal >2 levels, no sync fs in async contexts, prefer early returns, const over let/var, match surrounding style

Add `## ERROR HANDLING`:
- Do not silently swallow errors, do not invent workarounds, do not expand constraint boundary
- Report: `BLOCKED: [what] NEED: [what would fix it]`

### R1 + R2: Reviewer Differential Focus + Reasoning Protocol (`reviewer.ts`)
Add `## REVIEW FOCUS` section:
- Review the CHANGE not the FILE
- Focus: what changed, what it affects, what could break
- Do NOT report pre-existing issues in unchanged code
- Do NOT flag style issues the linter catches

Add `## REVIEW REASONING` section:
- For each changed function: PRECONDITIONS → POSTCONDITIONS → INVARIANTS → EDGE CASES → CONTRACT
- Do NOT generate issues from vibes/pattern-matching alone

### E1: Explorer Structured Analysis Protocol (`explorer.ts`)
Add `## ANALYSIS PROTOCOL` section with four structured dimensions:
- STRUCTURE: entry points, public API, internal deps, external deps
- PATTERNS: design patterns, error handling, state management, configuration
- RISKS: cyclomatic complexity, circular deps, missing error paths, dead code, platform assumptions
- RELEVANT CONTEXT: existing test coverage, related docs, similar implementations

### S1: SME Structured Research Protocol (`sme.ts`)
Add `## RESEARCH PROTOCOL` with 7 steps:
1. FRAME, 2. CONTEXT, 3. CONSTRAINTS, 4. RECOMMENDATION, 5. ALTERNATIVES (max 2), 6. RISKS, 7. CONFIDENCE

Add explicit `## CONFIDENCE CALIBRATION`:
- HIGH: can cite specific docs/RFCs/well-known patterns
- MEDIUM: reasoning from general principles
- LOW: speculating or rapidly-evolving domain
- Warning: LOW-confidence honest answer > HIGH-confidence wrong answer

### D1: Docs Scope Rules (`docs.ts`)
Add `## DOCUMENTATION SCOPE` section:
- ALWAYS update: README (if public API changed), CHANGELOG (under ## [Unreleased]), API docs/JSDoc, type definitions
- NEVER create: unsolicited doc files, comments explaining obvious code, TODO comments in code
- CHANGELOG FORMAT: Keep a Changelog convention (Added/Changed/Fixed/Removed)

---

## Phase 3 — Cross-Cutting Standards

### X4: Remove Role-Relevance Tagging (ALL worker agents)
Remove the `ROLE-RELEVANCE TAGGING` block from: coder.ts, reviewer.ts, explorer.ts, sme.ts, docs.ts, designer.ts, test-engineer.ts, critic.ts.
The feature was planned for v6.20 but never implemented (now at v6.23.2).

### X2: Model-Tier Awareness (structural pass on all agents)
Audit each agent prompt for paragraph prose that should be structured numbered lists. Convert to structured format in the highest-impact locations (coder, test-engineer, reviewer, explorer, sme, docs). Section headers should use `##`, rules as numbered/bulleted lists.
This is applied as part of the per-agent edits above (not a separate pass).

### X3: Structured Output Enforcement
Add to each worker agent's OUTPUT FORMAT section:
```
(MANDATORY — deviations will be rejected)
Begin directly with the output header. Do NOT prepend "Here's my analysis..." or conversational preamble.
```
Applied as part of per-agent edits.

---

## Phase 4 — Test File Updates

### test-engineer.adversarial.test.ts
Add test cases verifying:
- Prompt includes BANNED assertion patterns list (T1)
- Prompt includes REQUIRED assertion categories (T1)
- Prompt includes PROPERTY-BASED TESTING section header (T2)
- Prompt includes SELF-REVIEW section with 80% coverage floor (T3)
- Prompt includes EXECUTION VERIFICATION section (T4)
- Prompt prohibits weakening assertions (T4)

### test-engineer.security.test.ts
Add/update tests verifying:
- Structured output enforcement (X3) — output format is MANDATORY
- New VERDICT format includes COVERAGE and BUGS FOUND fields (T4)
- SELF-REVIEW step present in baseline prompt (T3)
- No role-relevance tagging block in customAppendPrompt mode (X4)

---

## Commit Strategy
Single commit per phase group:
1. `feat(agents): overhaul test-engineer prompt (T1-T4)`
2. `feat(agents): strengthen worker agent prompts (C1-C2, R1-R2, E1, S1, D1)`
3. `chore(agents): cross-cutting improvements — remove stale tagging (X4), structured output (X3)`
4. `test(agents): update security tests to cover T1-T4 and X3/X4`
5. Push to `claude/review-agent-prompt-audit-Saj7d`

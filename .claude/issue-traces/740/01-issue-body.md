## Summary

7 findings from the holistic council review of the Swarm Command Conflict Prevention implementation (3 phases, 14 tasks). These are non-blocking advisory items that should be addressed to close remaining gaps in test coverage, runtime safety, spec accuracy, and quality assurance.

---

### Finding 1: Add FR-014 performance and idempotency tests (HIGH)

**Location:** `src/hooks/cc-command-intercept.ts` / `src/hooks/cc-command-intercept.test.ts`

**Issue:** The spec (FR-014, SC-004) requires automated verification that the runtime hook processes messages in under 5ms (for a 10,000-token message) and is idempotent (applying twice produces identical output to applying once). Neither test exists.

**Acceptance criteria:**
- [ ] Performance test: generate a ~10,000-token message, pass through `createCcCommandInterceptHook({}).messagesTransform`, assert processing time < 5ms
- [ ] Idempotency test: apply hook to a bare `/plan` message, save result; apply hook again to the result; assert both outputs are identical
- [ ] Both tests run as part of `bun test src/hooks/cc-command-intercept.test.ts`

---

### Finding 2: Add runtime protection for `/checkpoint` (MEDIUM)

**Location:** `src/hooks/cc-command-intercept.ts` lines 165-204

**Issue:** `/checkpoint` is classified as **CRITICAL** in the conflict registry but the runtime hook does nothing when it encounters bare `/checkpoint`. It's neither hard-blocked (like `/reset`/`/clear`) nor soft-corrected (like `/plan`).

**Proposed fix:** Add `/checkpoint` to the hard-block list or soft-correct it to `/swarm checkpoint <action>`.

**Acceptance criteria:**
- [ ] Bare `/checkpoint` in an agent message results in runtime intervention
- [ ] Existing adversarial tests still pass
- [ ] `/checkpoint` inside code blocks, URLs, comments, or `/swarm`-namespaced is unaffected

---

### Finding 3: Write task gate evidence for Phase 3 tasks 3.2 and 3.3 (MEDIUM)

**Location:** `.swarm/evidence/`

**Issue:** Task 3.2 (adversarial tests) and Task 3.3 (hook registration) have deliverables on disk but no gate evidence files (`3.2.json`, `3.3.json`) in `.swarm/evidence/`. Phase 3 completion-verify only reports 1 of 3 tasks checked.

**Acceptance criteria:**
- [ ] `.swarm/evidence/3.2.json` exists with reviewer + test_engineer gate results
- [ ] `.swarm/evidence/3.3.json` exists with reviewer + test_engineer gate results
- [ ] `completion-verify` for Phase 3 reports 3/3 tasks

---

### Finding 4: Add prompt content regression tests (MEDIUM)

**Location:** `tests/unit/agents/`

**Issue:** COMMAND NAMESPACE blocks exist in all 4 agent prompts but no automated tests verify they persist. A prompt refactor could silently remove hardening.

**Acceptance criteria:**
- [ ] Tests verify `## COMMAND NAMESPACE` presence in architect.ts, coder.ts, reviewer.ts, test-engineer.ts
- [ ] Specific command names flagged: `/plan`, `/reset`, `/checkpoint`, `/clear`, `/compact`
- [ ] Specific directive language checked: `NEVER`, `PROHIBITED`, `DO NOT INVOKE`
- [ ] Removing a COMMAND NAMESPACE block causes a test failure

---

### Finding 5: Update FR-012 spec text to match implementation (LOW)

**Location:** `.swarm/spec.md` FR-012

**Issue:** Spec says "throws a structured error" but implementation uses output mutation (replacing message content) — necessary because `composeHandlers` wraps in `safeHook` which catches thrown errors.

**Fix:** Update FR-012 to say "replaces the message content via output mutation with a structured advisory."

---

### Finding 6: Expand reviewer/test-engineer prompt coverage (LOW)

**Location:** `src/agents/reviewer.ts`, `src/agents/test-engineer.ts`

**Issue:** Prompts list 6 commands only. Missing: `/agents`, `/config`, `/export`, `/doctor`, `/history`.

**Fix:** Evaluate whether to expand to include all 9 conflicts or document the scope decision.

---

### Finding 7: Add config-option tests for the hook (LOW)

**Location:** `src/hooks/cc-command-intercept.ts`

**Issue:** All 45 tests use default config. No test exercises `blockDestructive: false`, `intercept: ['CRITICAL']`, or `logIntercepts: false`.

**Acceptance criteria:**
- [ ] `blockDestructive: false` — `/reset` passes through unblocked
- [ ] `intercept: ['CRITICAL']` — `/status` (HIGH) is not intercepted
- [ ] `logIntercepts: false` — logger.warn is NOT called for HIGH commands

---

## Priority

1. **Finding 1** (perf/idempotency tests) — highest priority, spec-requirement gap
2. **Finding 2** (/checkpoint runtime gap) — CRITICAL classification, no runtime protection
3. **Finding 4** (prompt regression tests) — protects against silent regression
4. **Finding 3** (gate evidence) — process completeness
5. **Findings 5-7** — polish and spec accuracy

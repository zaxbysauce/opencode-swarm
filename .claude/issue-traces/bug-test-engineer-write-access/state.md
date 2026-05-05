# Issue Trace State

## Current Phase
Phase 4: Implementation (approved)

## Completed Gates
- [x] Phase 0: Setup
- [x] Phase 1: Intake and Reproduction
- [x] Phase 2: Root-Cause Localization
- [x] Phase 3: Fix Plan + Critic Review
- [ ] Phase 4: Implementation
- [ ] Phase 5: Closure

## Active Hypothesis
CONFIRMED: `test_engineer`'s `allowedPrefix: ['tests/', '.swarm/evidence/']` is too narrow.
Paths like `src-tauri/tests/scoring_adversarial_test.rs` do NOT start with `tests/` 
when normalized relative to the project root, so the prefix check rejects them.

## Selected Fix
Add `allowedGlobs: ['**/tests/**', '**/test/**', '**/*.test.*', '**/*.spec.*']` to the 
`test_engineer` default rule in `DEFAULT_AGENT_AUTHORITY_RULES`.

## Unresolved Risks
- The `allowedGlobs` patterns are evaluated at Step 5, which runs BEFORE `blockedPrefix` 
  (Step 6). This means test files inside `src/` (e.g., `src/__tests__/foo.test.ts`) 
  would be allowed via the glob even though `blockedPrefix: ['src/']` would block them.
  This is INTENTIONAL and CORRECT — writing tests in `src/` test subdirectories is valid.

## Next Action
Implement the fix in `src/hooks/guardrails.ts` and add regression tests.

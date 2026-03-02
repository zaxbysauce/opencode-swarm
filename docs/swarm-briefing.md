# Swarm Briefing for LLMs

This document tells you — an AI model — everything you need to author a valid
`.swarm/plan.md` for the opencode-swarm plugin.

---

## What Is the Swarm

The Architect orchestrates a plan and delegates every coding task to the Coder.
The Coder implements one atomic task at a time. After every task a 12-step QA
gate verifies quality, security, and correctness before progress continues.

---

## Pipeline (12 Steps)

Each step must pass before the next begins:

1. `diff` — detect contract changes in the git diff
2. `syntax_check` — parse changed files; reject syntax errors
3. `placeholder_scan` — flag TODO/FIXME/stub markers left in the diff
4. `imports` — verify all imported symbols resolve; no circular deps
5. `lint fix` — auto-correct style violations with the project linter
6. `build_check` — compile/bundle to confirm the artifact can be produced
7. `pre_check_batch` — parallel: lint check + secrets scan + SAST + quality budget
8. `reviewer` — agent reviews logic, correctness, and alignment with plan
9. `security-reviewer` — triggered when files match auth/crypto/config globs
10. `test_engineer verification` — run test suite; report PASS/FAIL
11. `test_engineer adversarial` — edge-case and attack-vector tests
12. `coverage check` — fail if coverage drops below the project threshold

---

## Task Format

Every task in `.swarm/plan.md` must include these fields:

| Field | Required | Description |
|---|---|---|
| FILE | Yes | Relative path to the file the task modifies |
| TASK | Yes | Single imperative sentence — no "and" connecting two actions |
| CONSTRAINT | No | Limiting conditions (e.g., "do not modify other functions") |
| ACCEPTANCE CRITERIA | Yes | Bullet list of verifiable conditions the QA gate can check |

---

## Task Sizing Rules

- **SMALL** — 1 file, 1 function or class. Assign directly to plan.
- **MEDIUM** — 1 file with multiple functions, or up to 2 files. Plan as-is.
- **LARGE** — More than 2 files, or a compound concern. Must be split into
  SMALL/MEDIUM sub-tasks before adding to the plan. A LARGE task in the plan
  is a planning error.

Litmus test: if you cannot write TASK + FILE + CONSTRAINT in three bullet
points, the task is too large. Split it.

---

## Example Phase Header

```markdown
## Phase 2: Input Validation [IN PROGRESS]
- [x] 2.1: Add email validator to src/auth/login.ts [SMALL]
- [ ] 2.2: Add password policy to src/auth/login.ts [SMALL] (depends: 2.1)
- [ ] 2.3: Add tests/unit/auth/login.test.ts [MEDIUM] (depends: 2.2)
```

---

## Example Fully-Specified Task

```markdown
FILE: src/auth/login.ts
TASK: Add email format validation to the login handler
CONSTRAINT: Do not modify the password validation or session logic
ACCEPTANCE CRITERIA:
- Rejects inputs where email does not match RFC 5322 basic pattern
- Returns HTTP 400 with { error: "invalid_email" } on bad input
- All existing login tests pass unchanged
- New tests cover empty string, missing @, and valid address
```

---

## Key Rules for Plan Authors

- **One task = one file = one concern.** No batching.
- **No compound verbs.** "Add X and update Y" is two tasks.
- **Declare dependencies** with `(depends: N.M)` when ordering matters.
- **Phase headers** use `## Phase N: Title [STATUS]`.
- **Task lines** use `- [ ] N.M: description [SIZE] (depends: N.X)`.
- **Acceptance criteria** must be specific enough for the test engineer to
  verify with a unit test or integration test.

---

## The Spec File: `.swarm/spec.md`

Before writing a plan, you can optionally write a spec. The spec captures *what* users need and *why*, without any implementation details. The architect uses it to validate plans for completeness and catch gold-plating.

### Spec Structure

```markdown
# [Feature Name]

## Feature Description
A 2–4 sentence description of the feature: what users will be able to do and what problem it solves. No technology choices. No implementation details.

## User Scenarios
Given [context], when [action], then [outcome].

## Functional Requirements
- FR-001 [MUST]: [requirement — independently testable, no HOW]
- FR-002 [SHOULD]: [requirement]

## Success Criteria
- SC-001: [measurable outcome — technology-agnostic]
- SC-002: [measurable outcome]

## Key Entities (if data is involved)
- [Entity name]: [brief description — no schema or field definitions]

## Edge Cases and Known Failure Modes
- [edge case or failure mode]

## Open Questions
- [NEEDS CLARIFICATION]: [question — max 3 markers]
```

### Naming Conventions

- **`FR-###`** — Functional Requirements: what the system MUST or SHOULD do
- **`SC-###`** — Success Criteria: how you know the feature is working
- **`[NEEDS CLARIFICATION]`** — Uncertainty marker placed by the architect when an assumption could change scope, security impact, or core behavior. Use `/swarm clarify` to resolve.

### What the Spec MUST NOT Contain

The spec is technology-agnostic by design. It must not contain:
- Technology stack, framework, or library names
- File paths, API endpoint designs, database schema
- Implementation details ("using React", "via REST API", "stored in PostgreSQL")
- Any "how to build" language

Violating these rules degrades the spec's value as a requirements document and makes it harder for the architect to evaluate plans objectively.

### How It Connects to the Plan

When `.swarm/spec.md` exists and you ask the architect to plan:
1. Each `FR-###` requirement must map to at least one plan task
2. Plan tasks with no corresponding `FR-###` are flagged as potential gold-plating
3. `/swarm analyze` produces a full coverage table: requirements → tasks, gaps, and gold-plating risks

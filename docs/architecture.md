# OpenCode Swarm Architecture

## Design Philosophy

OpenCode Swarm is built on a simple premise: **multi-agent systems fail when they're unstructured**.

Most frameworks throw agents at a problem and hope coherence emerges. It doesn't. You get race conditions, conflicting changes, lost context, and code that doesn't work.

Swarm enforces discipline:
- One Architect owns all decisions
- One task executes at a time
- Every task gets QA'd before the next starts
- Project state persists in files, not memory

---

## Control Model

```
                    ┌─────────────┐
                    │  ARCHITECT  │
                    │  (control)  │
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│   EXPLORER    │  │     SMEs      │  │   PIPELINE    │
│  (discovery)  │  │  (advisory)   │  │ (execution)   │
└───────────────┘  └───────────────┘  └───────────────┘
                                              │
                                   ┌──────────┴──────────┐
                                   │                     │
                                   ▼                     ▼
                           ┌─────────────┐       ┌─────────────┐
                           │    CODER    │       │     QA      │
                           │ (implement) │       │  (verify)   │
                           └─────────────┘       └─────────────┘
```

### Architect: The Brain
- Owns the plan
- Makes all delegation decisions
- Synthesizes inputs from other agents
- Handles failures and escalations
- Maintains project memory

### Explorer: The Eyes
- Fast codebase scanning
- Structure and pattern identification
- Domain detection for SME routing
- Re-runs at phase boundaries to capture changes

### SME: The Advisor
- Single open-domain expert (any domain: security, ios, rust, kubernetes, etc.)
- Consulted serially, one call per domain
- Guidance cached in context.md
- Read-only (cannot write code)

### Pipeline Agents: The Hands
- Coder: Implements one task at a time
- Reviewer: Combined correctness + security review
- Test Engineer: Generates tests, runs them, reports PASS/FAIL

### Critic: The Gate
- Reviews architect's plan BEFORE implementation begins
- Returns APPROVED / NEEDS_REVISION / REJECTED
- Read-only (cannot write code)

---

## Execution Flow

### Phase 0: Initialize or Resume

```
Is .swarm/plan.md present?
├── YES → Read plan.md and context.md
│         Find current phase and task
│         Resume execution
│
└── NO  → New project
          Proceed to Phase 1
```

### Phase 1: Clarify

```
Is the user request clear?
├── YES → Proceed to Phase 2
│
└── NO  → Ask up to 3 clarifying questions
          Wait for answers
          Then proceed
```

### Phase 2: Discover

```
@explorer analyzes codebase
    │
    ├── Project structure
    ├── Languages and frameworks
    ├── Key files
    ├── Patterns observed
    └── Relevant SME domains
```

### Phase 3: Consult SMEs

```
For each relevant domain:
    │
    ├── Check context.md for cached guidance
    │   └── If cached → Skip this SME
    │
    └── If not cached:
        ├── Delegate to @sme with DOMAIN: [domain]
        ├── Wait for response
        └── Cache guidance in context.md
```

### Phase 4: Plan

```
Create/Update .swarm/plan.md:
    │
    ├── Project overview
    ├── Phases (logical groupings)
    │   └── Tasks (atomic units of work)
    │       ├── Dependencies
    │       ├── Acceptance criteria
    │       └── Complexity estimate
    │
    └── Status tracking
```

### Phase 4.5: Critic Gate

```
@critic reviews plan
    │
    ├── APPROVED → Proceed to Phase 5
    ├── NEEDS_REVISION → Revise plan, resubmit (max 2 cycles)
    └── REJECTED → Escalate to user
```

### Phase 5: Execute

```
For each task in current phase:
    │
    ├── Check dependencies complete
    │   └── If blocked → Skip, mark [BLOCKED]
    │
    ├── @coder implements (ONE task)
    │   └── Wait for completion
    │
    ├── @reviewer reviews
    │   ├── APPROVED → Continue
    │   └── REJECTED → Retry (max 3)
    │       └── After 3 failures → Escalate
    │
    ├── @test_engineer generates AND runs tests
    │   ├── PASS → Continue
    │   └── FAIL → Send failures to @coder, retest
    │
    └── Update plan.md [x] complete (only if PASS)
```

### Phase 6: Phase Complete

```
All tasks in phase done
    │
    ├── Re-run @explorer (codebase changed)
    ├── Update context.md with learnings
    ├── Archive to .swarm/history/phase-N.md
    │
    └── Ask user: "Ready for Phase [N+1]?"
        ├── YES → Proceed
        └── NO  → Wait
```

---

## File Structure

```
project/
├── .swarm/
│   ├── plan.md        # Phased roadmap with task status
│   ├── context.md     # Project knowledge, SME cache
│   └── history/
│       ├── phase-1.md # Archived phase summaries
│       └── phase-2.md
│
├── src/               # Source code
│   ├── agents/        # Agent definitions and factory
│   ├── config/        # Schema, constants, loader
│   ├── hooks/         # Pipeline tracker
│   └── tools/         # Domain detector, file extractor, gitingest
│
├── tests/unit/        # Unit tests (bun test)
│   ├── agents/        # Agent creation and factory tests
│   ├── config/        # Config constants, schema, loader tests
│   ├── hooks/         # Pipeline tracker tests
│   └── tools/         # Domain detector, file extractor, gitingest tests
│
└── dist/              # Build output
```

### plan.md Schema

```markdown
# Project: [Name]
Created: [ISO date]
Last Updated: [ISO date]
Current Phase: [N]

## Overview
[1-2 paragraph project summary]

## Phase 1: [Name] [STATUS]
Estimated: [SMALL/MEDIUM/LARGE]

- [x] Task 1.1: [Description] [SIZE]
  - Acceptance: [Criteria]
- [ ] Task 1.2: [Description] [SIZE] (depends: 1.1)
  - Acceptance: [Criteria]
  - Attempt 1: REJECTED - [Reason]
  - Attempt 2: REJECTED - [Reason]
- [BLOCKED] Task 1.3: [Description]
  - Reason: [Why blocked]

## Phase 2: [Name] [PENDING]
...
```

### context.md Schema

```markdown
# Project Context: [Name]

## Summary
[What the project does, who it's for]

## Technical Decisions
- [Decision]: [Rationale]

## Architecture
[Key patterns, file organization]

## SME Guidance Cache
### [Domain] (Phase [N])
- [Guidance point]

## Patterns Established
- [Pattern]: [Where/how used]

## Known Issues / Tech Debt
- [ ] [Issue to address later]

## File Map
- [path]: [Purpose]
```

---

## Agent Permissions

| Agent | Read | Write | Execute | Delegate |
|-------|:----:|:-----:|:-------:|:--------:|
| architect | ✅ | ✅ | ✅ | ✅ |
| explorer | ✅ | ❌ | ❌ | ❌ |
| sme | ✅ | ❌ | ❌ | ❌ |
| coder | ✅ | ✅ | ✅ | ❌ |
| reviewer | ✅ | ❌ | ❌ | ❌ |
| critic | ✅ | ❌ | ❌ | ❌ |
| test_engineer | ✅ | ✅ | ✅ | ❌ |

---

## Failure Handling

### Task Rejection

```
Attempt 1: @coder implements
           @reviewer rejects with feedback
           
Attempt 2: @coder fixes based on feedback
           @reviewer rejects again
           
Attempt 3: @coder fixes again
           @reviewer rejects
           
Escalation: Architect handles directly
            OR re-scopes task
            Document in plan.md
```

### Blocked Tasks

```
Task cannot proceed (external dependency):
├── Mark [BLOCKED] in plan.md
├── Record reason
├── Skip to next unblocked task
└── Inform user
```

### Agent Failure

```
Agent times out or errors:
├── Retry once
├── If still failing:
│   └── Architect handles directly
└── Document in context.md
```

---

## Why Serial Execution?

Parallel execution causes:
- Race conditions in file modifications
- Context inconsistency between agents
- Non-deterministic outputs
- Debugging nightmares

Serial execution provides:
- Predictable order of operations
- Clear causal chain
- Reproducible results
- Easy debugging

**Correctness > Speed**

---

## Why QA Per Task?

QA at the end causes:
- Accumulated bugs
- Cascading failures (Task 3 builds on buggy Task 2)
- Massive rework
- Lost context on what each task was supposed to do

QA per task provides:
- Immediate feedback
- Issues fixed while context is fresh
- No bug accumulation
- Clear task boundaries

---

## Why Persistent Files?

Session-only memory causes:
- Lost progress on session end
- No way to resume projects
- Re-explaining context every time
- No institutional knowledge

Persistent `.swarm/` files provide:
- Resume any project instantly
- Knowledge transfer between sessions
- Audit trail of decisions
- Cached SME guidance (no re-asking)

# Design Rationale

## Why OpenCode Swarm Exists

Every multi-agent framework promises autonomous coding. None deliver.

The fundamental problem: **LLMs are stateless, impatient, and overconfident**. Without structure, they:
- Start coding before understanding requirements
- Lose context mid-project
- Build on broken foundations
- Produce code that "works" but fails in production

Swarm adds the discipline that LLMs lack.

---

## Core Design Decisions

### 1. Serial Execution (Not Parallel)

**The temptation**: Run agents in parallel for speed.

**The reality**: Parallel agents cause:
- Race conditions (two agents modify same file)
- Context drift (Agent A assumes X, Agent B assumes Y)
- Conflict resolution hell
- Non-reproducible results

**Swarm's approach**: One agent at a time. Always.

```
WRONG:  Agent1 ──┐
        Agent2 ──┼── Merge conflicts, inconsistencies
        Agent3 ──┘

RIGHT:  Agent1 → Agent2 → Agent3 → Consistent result
```

Slower? Yes. Working code? Also yes.

---

### 2. Phased Planning (Not Ad-Hoc)

**The temptation**: Let the LLM figure out what to do.

**The reality**: Without a plan, LLMs:
- Jump into coding without understanding scope
- Miss requirements
- Build the wrong thing confidently
- Can't estimate effort

**Swarm's approach**: Mandatory planning phase.

```markdown
## Phase 1: Foundation [3 tasks, SMALL]
## Phase 2: Core Logic [5 tasks, MEDIUM]  
## Phase 3: Integration [4 tasks, MEDIUM]
## Phase 4: Polish [3 tasks, SMALL]
```

Every task has:
- Clear description
- Acceptance criteria
- Dependencies
- Complexity estimate

The Architect can't code until the plan exists.

---

### 3. Persistent Memory (Not Session-Based)

**The temptation**: Keep everything in context window.

**The reality**: Context windows:
- Have limits
- Get compacted (losing information)
- Reset between sessions
- Can't be shared

**Swarm's approach**: `.swarm/` directory with markdown files.

```
.swarm/
├── plan.md      # What we're building, what's done
├── context.md   # Technical decisions, SME guidance
└── history/     # Archived phase summaries
```

Benefits:
- **Resumable**: Pick up any project instantly
- **Transferable**: New Architect reads files, continues work
- **Auditable**: See what was decided and why
- **Cacheable**: SME guidance doesn't need re-asking

---

### 4. QA Per Task (Not Per Project)

**The temptation**: QA at the end, ship faster.

**The reality**: End-of-project QA means:
- Bugs compound (Task 3 builds on buggy Task 2)
- Context is lost (what was Task 1 supposed to do?)
- Massive rework
- "It worked on my machine"

**Swarm's approach**: Every task goes through QA.

```
Task → Coder → Review → Tests (run + verdict) → ✓ Complete
```

If QA rejects:
- Immediate feedback
- Fix while context is fresh
- Don't build on broken foundation

---

### 5. One Task at a Time (Not Batched)

**The temptation**: Send multiple tasks to Coder for efficiency.

**The reality**: Batched tasks cause:
- Context overload
- Quality degradation
- Unclear failures (which task broke?)
- Coder cuts corners

**Swarm's approach**: One task per Coder delegation.

```
WRONG:  "Implement auth, sessions, and API endpoints"
RIGHT:  "Implement login endpoint. Acceptance: Returns JWT on valid credentials."
```

Focused task = focused code.

---

### 6. Heterogeneous Models (Not Single Model)

**The temptation**: Use your best model everywhere.

**The reality**: Same model = correlated failures.
- Claude has Claude blindspots
- GPT has GPT blindspots
- If the same model writes and reviews, it misses its own mistakes

**Swarm's approach**: Different models for different roles.

```json
{
  "coder": "anthropic/claude-sonnet-4-5",
  "reviewer": "openai/gpt-4o",
  "critic": "google/gemini-2.0-flash"
}
```

Why this works:
- Different training data = different blindspots
- GPT catches what Claude misses
- Critic reviews the *plan*, Reviewer reviews the *code*
- Like having reviewers from different backgrounds

---

### 7. SME Caching (Not Re-Asking)

**The temptation**: Consult SMEs whenever uncertain.

**The reality**: Re-asking SMEs:
- Wastes tokens
- May get different answers
- Slows down execution
- Loses continuity

**Swarm's approach**: Cache SME guidance in context.md.

```markdown
## SME Guidance Cache

### Security (Phase 1)
- Use bcrypt with cost factor 12
- Never log tokens
- Implement rate limiting

### API (Phase 1)  
- Return 401 for auth failures
- Use RFC 7807 for errors
```

Before calling an SME, Architect checks the cache. Already answered? Skip.

---

### 8. User Checkpoints (Not Full Autonomy)

**The temptation**: Let agents run until done.

**The reality**: Full autonomy means:
- Building the wrong thing for hours
- No opportunity to course-correct
- Surprise outcomes
- Wasted resources

**Swarm's approach**: Pause at phase boundaries.

```
Phase 1 complete.
Created: user model, password hashing, migrations
Files: /src/models/user.ts, /src/auth/hash.ts

Ready to proceed to Phase 2: Core Auth?
```

User can:
- Approve and continue
- Request changes
- Adjust the plan
- Stop and resume later

---

### 9. Failure Tracking (Not Silent Retry)

**The temptation**: Just retry until it works.

**The reality**: Silent retries:
- Hide systemic problems
- Waste resources
- Never improve
- Frustrate users

**Swarm's approach**: Document all failures in plan.md.

```markdown
- [ ] Task 2.2: JWT generation
  - Attempt 1: REJECTED - Missing expiration claim
  - Attempt 2: REJECTED - Wrong signing algorithm
  - Attempt 3: ESCALATED - Architect implementing directly
```

Benefits:
- Visibility into what's hard
- Pattern detection (same failure = prompt problem)
- Accountability
- Learning opportunity

---

### 10. Explicit Dependencies (Not Implicit Order)

**The temptation**: Tasks are independent, run in any order.

**The reality**: Most tasks have dependencies:
- Can't test what isn't written
- Can't integrate what doesn't exist
- Order matters

**Swarm's approach**: Explicit dependency declaration.

```markdown
- [x] Task 2.1: Create user model
- [ ] Task 2.2: Add authentication (depends: 2.1)
- [ ] Task 2.3: Create API endpoints (depends: 2.1, 2.2)
- [ ] Task 2.4: Input validation (independent)
```

Architect respects dependencies. Won't start 2.2 until 2.1 is complete.

---

## The Result

When you combine all these decisions:

| Without Structure | With Swarm |
|-------------------|------------|
| Chaotic parallel execution | Predictable serial flow |
| Ad-hoc "figure it out" | Documented phased plan |
| Lost context between sessions | Persistent `.swarm/` memory |
| QA as afterthought | QA per task |
| Batched, unfocused work | One task at a time |
| Single model blindspots | Heterogeneous review |
| Repeated SME questions | Cached guidance |
| Full autonomy disasters | User checkpoints |
| Silent failures | Documented attempts |
| Implicit ordering | Explicit dependencies |

**The difference**: Code that actually works.

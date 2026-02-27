```markdown
# Pre-Swarm Planning: How to Build Implementation Plans Before Touching OpenCode

## Why This Matters

OpenCode Swarm is an execution engine. Feed it a great plan and it will produce
great code. Feed it a vague or contradictory plan and the Critic will struggle
to save it — garbage in, garbage out, regardless of how many QA gates run.

Every API call the Architect spends figuring out *what* to build is a wasted
call. The planning phase — requirements, architecture decisions, task
decomposition — should be completely finished before you open OpenCode. Free
web chat interfaces can do this work at zero API cost.

---

## The Core Idea

Use multiple AI models via their **free web chat interfaces** to debate,
challenge, and converge on a single implementation plan. Models have different
training data, different blind spots, and different failure modes. A plan that
survives scrutiny from Claude, Gemini, ChatGPT, Perplexity, Qwen, and Deepseek
simultaneously is a fundamentally stronger plan than one any single model
approved.

Once you have that plan, drop it into your project directory and tell the
Architect to implement it. The swarm handles everything from there.

---

## Step-by-Step Process

### Step 1 — Generate a Codebase Snapshot

Use [gitingest](https://gitingest.com) (or equivalent) to produce a single text
file containing your entire codebase. This gives every AI model the same
ground truth about your project's current state without requiring them to browse
files.

For a new project, prepare:
- Your requirements document
- Any existing architecture diagrams or notes
- Technology stack decisions

### Step 2 — Brief Every Model on the Swarm Workflow

Before asking for any plan, paste the gitingest of
[opencode-swarm](https://github.com/zaxbysauce/opencode-swarm) into each model's
context. This is critical. A plan written without understanding the swarm
workflow will produce tasks that are too large, incorrectly structured, or
missing required fields.

Every model needs to understand:
- The Architect delegates all coding to the Coder — it never writes code itself
- Each task goes through a full 12-step QA gate (diff → syntaxcheck → ... →
  adversarial tests)
- Tasks must be atomic: one file, one concern, one logical change
- Tasks need FILE, TASK, CONSTRAINT, and ACCEPTANCE CRITERIA fields
- The Critic reviews the plan before any implementation begins

### Step 3 — Generate an Initial Plan

Give one model your requirements and codebase snapshot. Ask it to produce a
full implementation plan in the swarm's markdown format. This is your starting
draft — not your final plan.

Prompt template:
```

Here is my codebase [paste gitingest]. Here is the opencode-swarm plugin
[paste swarm gitingest]. I need to implement [describe feature/change].

Generate a complete implementation plan in the swarm's markdown format.
Every task must include FILE, TASK, CONSTRAINT, and ACCEPTANCE CRITERIA.
Tasks must be atomic — one file, one concern. No task should touch more
than 2 files. No compound verbs in TASK lines.

```

### Step 4 — Cross-Examine With Other Models

Take the draft plan and paste it into every other model you have access to.
Ask each one to critique it, find gaps, identify ambiguities, and suggest
improvements. Be explicit about what you want them to look for:

Prompt template:
```

Here is an implementation plan for my project [paste plan]. Here is the
codebase context [paste gitingest]. Here is the swarm plugin that will
execute it [paste swarm gitingest].

Review this plan and tell me:

1. Are any tasks too large or batching multiple concerns?
2. Are there missing dependencies between tasks?
3. Are acceptance criteria testable and specific?
4. Are there architectural risks or edge cases not addressed?
5. Does anything conflict with the existing codebase?
```

### Step 5 — Iterate Until Convergence

Revise the plan based on feedback. Repeat Step 4 with the updated plan.
Continue until all models agree the plan is sound — no significant objections,
no missing pieces, no ambiguous tasks.

In practice this takes 2–4 rounds. A plan that Claude approves but Gemini
finds three gaps in needs another pass. A plan all six models approve with
minor wording suggestions is ready to ship to the swarm.

### Step 6 — Final Swarm-Specific Validation

Before handing the plan to the Architect, do a final check against the swarm's
requirements:

- [ ] Every task has `FILE:`, `TASK:`, `CONSTRAINT:`, `ACCEPTANCE CRITERIA:`
- [ ] No task touches more than 2 files
- [ ] No `TASK:` line contains "and" connecting two separate actions
- [ ] Dependencies are declared explicitly (`depends: X.Y`)
- [ ] Phase structure matches `.swarm/plan.md` format (`## Phase N:`)
- [ ] Acceptance criteria are specific enough for the test engineer to verify
- [ ] Security-sensitive files (auth, crypto, config, env) are flagged in task
  descriptions so the security reviewer gate triggers

### Step 7 — Hand Off to the Swarm

Save the plan as `.swarm/plan.md` (or the filename your workflow expects) and
start the Architect:

```

Implement the plan in .swarm/plan.md. Follow phases sequentially.
Run bun test after each phase. Report progress after each completed task.

```

The swarm handles the rest.

---

## Recommended Model Mix

You don't need paid subscriptions. Free tiers are sufficient for planning:

| Model | Strength for Planning | Free Access |
|---|---|---|
| **Claude** (Anthropic) | Strong reasoning, catches logical gaps | claude.ai free tier |
| **Gemini** (Google) | Good at finding undocumented edge cases | gemini.google.com |
| **ChatGPT** (OpenAI) | Broad knowledge, good at task decomposition | chatgpt.com free tier |
| **Perplexity** | Research-backed, good for API/library questions | perplexity.ai free tier |
| **Qwen** (Alibaba) | Different training distribution, catches different gaps | chat.qwen.ai |
| **Deepseek** | Strong at code architecture reasoning | chat.deepseek.com |

Using 3–4 models is enough for most plans. Using 5–6 gives you higher
confidence on complex or high-stakes implementations.

---

## What Good Convergence Looks Like

The models are converging when:
- Feedback shifts from "this task is missing X" to "minor wording preference"
- All models can trace every requirement to at least one task
- No model identifies a file that needs changing that isn't covered by a task
- The plan's phase structure makes logical sense to each model independently
- Acceptance criteria are concrete enough that a model can answer "pass or
  fail" without judgment calls

The models are NOT converging when:
- Different models recommend contradictory approaches to the same problem
- Each round of feedback introduces new structural concerns
- Models disagree on whether the existing codebase supports the approach
- Task sizes keep ballooning ("this should really be one task covering A, B,
  and C")

If you can't reach convergence after 4–5 rounds, the requirements themselves
are likely ambiguous. Resolve the ambiguity before writing more plan.

---

## Why Multiple Models Instead of One

Any single model has blind spots shaped by its training. Claude might approve
an approach that Gemini immediately flags as conflicting with a library's
documented behavior. ChatGPT might miss a security implication that Perplexity
surfaces from a recent CVE. Deepseek might catch an architectural contradiction
that the others rationalized past.

The disagreements between models are valuable signal. A plan that survives
multi-model scrutiny has been stress-tested against multiple failure modes.
The swarm's QA gates are your last line of defense during execution — the
pre-planning process is your first.

---

## The Cost Equation

| Activity | API Cost |
|---|---|
| Multi-model web chat planning (Steps 1–6) | **$0** |
| Swarm execution of a solid plan | Low — clear tasks, few coder retries |
| Swarm execution of a vague plan | High — Critic cycles, coder retries, gate failures |

The planning phase costs nothing but time. The execution phase costs API calls
proportional to how many times the Coder needs to retry, the Critic needs to
revise, or the Architect needs to re-clarify scope. Investing 1–2 hours in
web chat planning routinely saves 3–5x that time in swarm execution.

---

## Relationship to Spec Kit

[GitHub Spec Kit](https://github.com/github/spec-kit) automates a similar
planning workflow — spec → plan → tasks — using AI agents inside your editor.
The manual multi-model approach described here produces equivalent artifacts
but gives you direct control over which models review the plan and makes
cross-model disagreement visible rather than resolving it automatically.

The two approaches are complementary. Spec Kit is faster. The manual approach
gives you higher confidence on complex or security-sensitive implementations
where you want explicit human judgment at each review stage.

Either way, the output feeds into the same place: a structured `.swarm/plan.md`
that the Architect can execute.

---

## Quick Reference

```

1. gitingest your codebase + the swarm plugin
2. Generate initial plan with one model
3. Cross-examine with 3-5 other models
4. Iterate until convergence (2-4 rounds)
5. Final swarm-format validation checklist
6. Drop plan.md into .swarm/ and start the Architect
```

Total planning cost: $0 (free web chat tiers)
Total planning time: 1–2 hours for most features
Payoff: Faster execution, fewer retries, lower API spend
```
# Pre-Swarm Planning

## The Point

The swarm is an execution engine. Good plan in, good code out. Bad plan in, wasted API calls while the Critic tries to salvage it.

Every cycle the Architect spends figuring out *what* to build is a cycle not spent building. Do your planning in free web chat interfaces before you ever open OpenCode.

---

## How It Works

Use multiple AI models (their free web tiers) to debate and poke holes in a single implementation plan. Different models have different blind spots — Claude might approve something Gemini flags as conflicting with a library's actual behavior, or Perplexity might surface a recent CVE the others missed.

A plan that survives scrutiny from 3-6 models is stronger than anything one model produces alone. Once it's solid, drop it in your project and let the Architect run.

---

## Steps

### 1. Snapshot Your Codebase

Use [gitingest](https://gitingest.com) to dump your entire codebase into a single text file. This gives every model the same context.

For new projects, just gather your requirements, architecture notes, and stack decisions.

### 2. Brief Every Model on the Swarm

Paste the [opencode-swarm README](https://github.com/zaxbysauce/opencode-swarm) into each model. The README covers the workflow, task format, and QA gates — that's all they need to structure a plan correctly. You don't need the full plugin codebase unless you're planning changes to the swarm itself.

Each model needs to know:
- The Architect delegates all coding to the Coder — it never writes code itself
- Each task runs through a full 12-step QA gate
- Tasks must be atomic: one file, one concern, one logical change
- Tasks need `FILE`, `TASK`, `CONSTRAINT`, and `ACCEPTANCE CRITERIA` fields
- The Critic reviews the plan before implementation starts

---

## Task Field Reference

Every task in `.swarm/plan.md` must define these four fields:

| Field | Required | Good Example | Bad Example |
|---|---|---|---|
| FILE | Yes | `src/auth/login.ts` | `src/auth/` (directory, not file) |
| TASK | Yes | `Add email format validation to the login handler` | `Update login and add tests` (compound) |
| CONSTRAINT | No | `Do not modify the session logic` | `Be careful` (not actionable) |
| ACCEPTANCE CRITERIA | Yes | `Rejects emails missing @; existing tests pass` | `It works` (not verifiable) |

**Rules:**
- `TASK` must be a single imperative sentence with no "and" connecting two actions.
- `ACCEPTANCE CRITERIA` must be a bullet list specific enough for the test engineer to write a unit test.
- `CONSTRAINT` is optional but recommended when the task touches shared code.

### Task Sizing

| Size | Definition | Action |
|---|---|---|
| SMALL | 1 file, 1 function or class | Assign directly to plan |
| MEDIUM | 1 file with multiple functions, or up to 2 files | Plan as-is |
| LARGE | More than 2 files, or compound concern | **Must be split before adding to plan** |

If you cannot write `TASK + FILE + CONSTRAINT` in three bullet points, the task is too large.

---

### 3. Generate a Draft Plan

Give one model your requirements + codebase snapshot. Ask for a full plan in the swarm's markdown format. This is your starting point, not the final product.

```
Here is my codebase [paste gitingest]. Here is the opencode-swarm README
[paste README]. I need to implement [describe feature/change].

Generate a complete implementation plan in the swarm's markdown format.
Every task must include FILE, TASK, CONSTRAINT, and ACCEPTANCE CRITERIA.
Tasks must be atomic — one file, one concern. No task should touch more
than 2 files. No compound verbs in TASK lines.
```

### 4. Cross-Examine With Other Models

Paste the draft into every other model you have. Ask each to tear it apart:

```
Here is an implementation plan for my project [paste plan]. Here is the
codebase context [paste gitingest]. Here is the swarm plugin that will
execute it [paste swarm README].

Review this plan and tell me:

1. Are any tasks too large or batching multiple concerns?
2. Are there missing dependencies between tasks?
3. Are acceptance criteria testable and specific?
4. Are there architectural risks or edge cases not addressed?
5. Does anything conflict with the existing codebase?
```

### 5. Iterate Until They Agree

Revise based on feedback, then repeat step 4. Keep going until every model signs off — no major objections, no missing pieces, no vague tasks.

This usually takes 2-4 rounds. If you can't converge after 4-5 rounds, your requirements are probably ambiguous. Fix those first.

### 6. Final Validation Checklist

Before handing off to the Architect:

- [ ] Every task has `FILE:`, `TASK:`, `CONSTRAINT:`, `ACCEPTANCE CRITERIA:`
- [ ] No task touches more than 2 files
- [ ] No `TASK:` line contains "and" connecting two separate actions
- [ ] Dependencies are declared explicitly (`depends: X.Y`)
- [ ] Phase structure matches `.swarm/plan.md` format (`## Phase N:`)
- [ ] Acceptance criteria are specific enough for the test engineer to verify
- [ ] Security-sensitive files (auth, crypto, config, env) are flagged so the security reviewer gate triggers

### 7. Hand Off

Save as `.swarm/plan.md` and start the Architect:

```
Implement the plan in .swarm/plan.md. Follow phases sequentially.
Run bun test after each phase. Report progress after each completed task.
```

---

## Model Recommendations

Free tiers are fine for planning. 3-4 models is enough for most work; 5-6 for complex stuff.

| Model | Good At | Free Access |
|---|---|---|
| **Claude** | Reasoning, catching logical gaps | claude.ai |
| **Gemini** | Finding undocumented edge cases | gemini.google.com |
| **ChatGPT** | Broad knowledge, task decomposition | chatgpt.com |
| **Perplexity** | Research-backed, API/library questions | perplexity.ai |
| **Qwen** | Different training data, catches different things | chat.qwen.ai |
| **Deepseek** | Code architecture reasoning | chat.deepseek.com |

---

## How to Tell It's Working

**Converging** — feedback shifts from "this task is missing X" to minor wording nitpicks. All models can trace every requirement to a task. No one finds uncovered files.

**Not converging** — models recommend contradictory approaches, each round surfaces new structural problems, or they disagree on whether the codebase even supports the approach. If tasks keep getting bigger ("this should really be one task covering A, B, and C"), that's a red flag too.

---

## Cost

| Activity | API Cost |
|---|---|
| Multi-model planning in web chat | **$0** |
| Swarm execution of a solid plan | Low — clear tasks, few retries |
| Swarm execution of a vague plan | High — Critic cycles, retries, gate failures |

1-2 hours of free planning routinely saves 3-5x that in execution costs.

---

## Spec Kit

[GitHub Spec Kit](https://github.com/github/spec-kit) automates a similar workflow (spec → plan → tasks) using AI agents in your editor. It's faster. The manual multi-model approach gives you more control and makes cross-model disagreements visible, which matters more for complex or security-sensitive work.

Both produce the same output: a structured `.swarm/plan.md` the Architect can execute.

---

## TL;DR

1. gitingest your codebase + grab the swarm README
2. Generate a draft plan with one model
3. Cross-examine with 3-5 other models
4. Iterate until convergence (2-4 rounds)
5. Run the validation checklist
6. Drop `plan.md` into `.swarm/` and start the Architect

Planning cost: $0 | Planning time: 1-2 hours | Payoff: fewer retries, lower API spend

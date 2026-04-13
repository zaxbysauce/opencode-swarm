---
name: swarm-pr-review
description: Run a swarm-like PR review using parallel exploration, independent reviewer validation, and critic challenge. Use for deep pull request review with low false-positive tolerance.
disable-model-invocation: true
---

# /swarm-pr-review

Use this skill when reviewing a PR, branch diff, staged diff, or recent commit with maximum quality.

## Review architecture
Use this layered workflow:
1. Main thread determines scope.
2. Launch parallel explorer subagents for disjoint review dimensions.
3. Treat explorer output as candidate findings only.
4. Launch reviewer subagents to validate only the candidates that are high-risk, ambiguous, or likely false-positive-prone.
5. Launch critic subagents only for reviewer-confirmed high-impact findings or findings whose confidence is still borderline.
6. Synthesize a final report using only validated findings.

This is intentionally not a full-depth pass on every minor issue.
It is a speed-preserving, quality-maximizing review ladder.
Parallel breadth stays wide.
Deep validation is concentrated where bugs are expensive.

## Scope detection
Determine review scope using this priority:
1. explicit user-provided PR URL / PR number / commit / file scope
2. current feature branch diff vs main/master
3. staged changes
4. latest commit

## Explorer lanes
Launch in parallel where scopes are disjoint:
- correctness and edge cases
- security and trust boundaries
- dependency and deployment safety
- docs/release/intended-vs-actual behavior
- tests and falsifiability
- performance and architecture

Explorer lanes should optimize for recall and speed.
They should produce candidate findings with exact evidence, not final conclusions.

## Council pattern (default for "council", "5-agent review", "independent review")
When the user asks for a "council", "independent review", "N-agent review", or uses phrases like "assume all work is wrong", run the explorer lanes as a parallel **adversarial council**:

1. Launch all council agents in a **single message with multiple Agent tool calls** so they run in parallel, in the background (`run_in_background: true`), using the `Explore` subagent type.
2. Each agent is told to **assume all work is WRONG until code evidence proves otherwise** and to hunt for bugs in its lane only.
3. Default lane set for a 5-agent council:
   - correctness and edge cases
   - security and trust boundaries
   - dependency and deployment safety
   - docs and intent-vs-actual
   - tests and falsifiability
   A 6th `performance and architecture` lane may be added when risk justifies it.
4. Each agent's prompt must include: branch name, commit list (`git log origin/main..HEAD`), scope of files owned by that lane, explicit bug-hunting checklist, and a "return CONFIRMED / SUSPICIOUS / CLEAN with file:line evidence, cap N words" instruction.
5. Agents are launched in parallel so the orchestrator must NOT duplicate their work. The main thread only collates, validates, and synthesizes.
6. When all agents return, the main thread acts as the **independent reviewer**: re-read the flagged file:line evidence directly and classify each candidate CONFIRMED / DISPROVED / UNVERIFIED / PRE_EXISTING before reporting. DISPROVED findings must be called out — agents overclaim regularly.
7. Apply the **critic challenge** to every remaining CONFIRMED finding: challenge severity inflation, weak evidence, missing mitigating context (e.g., "is the architect single-threaded? is this exercised?"), and non-actionable fixes.
8. The final synthesis must distinguish: real ship blockers, low-severity real issues, pre-existing accepted caveats, disproved agent claims, and follow-up quality work. Do not copy agent severities verbatim.

## Reviewer validation
Validate every candidate finding that is:
- high-severity
- security-related
- business-logic-related
- claim-vs-actual-related
- cross-file or contract-sensitive
- likely to generate false positives without deeper context

Reviewer must classify each validated candidate as:
- CONFIRMED
- DISPROVED
- UNVERIFIED
- PRE_EXISTING

Reviewer should be hyper-critical and suspicious.
Default to disbelief until the issue is actually supported by code evidence.
If a mitigating runtime control may invalidate the claim, check that before confirming the finding.
Lower-risk suggestions can remain lightweight if they are clearly non-blocking and strongly evidenced.

## Critic challenge
Use critic only after reviewer validation.
Critic reviews small batches of reviewer-confirmed findings and challenges:
- false positives
- severity inflation
- weak evidence
- non-actionable fixes
- missing sibling-file checks

## Final output
Produce:
- PR intent
- implementation summary
- intended vs actual mapping
- confirmed findings
- pre-existing findings
- unverified but plausible risks
- test / coverage gaps
- verdict
- merge recommendation

Do not let speed degrade validation quality.

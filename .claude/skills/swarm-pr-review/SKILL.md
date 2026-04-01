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

---
name: research-first
description: >
  Apply when planning fixes, investigating tech debt, architecting solutions, or
  diagnosing unknown issues. Search online for current documentation and state-of-the-art
  approaches before tracing through code.
context: fork
agent: Explore
---

## Research Before Planning Protocol

Before planning any fix, tracing any issue, or proposing any solution:

1. Search online for current official documentation to confirm the behavior is NOT intended or already fixed
2. Search for state-of-the-art solutions, known community workarounds, and recent discussion on this problem type
3. Use parallel sub-agents to search multiple sources simultaneously
4. Report all findings before any code tracing begins

Then trace each problem end-to-end through the actual source code using parallel sub-agents.
Do not stop until ≥95% confident in the root cause for every issue being investigated.

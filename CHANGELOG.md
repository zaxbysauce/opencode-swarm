# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.1.0] - 2026-02-06
### Added
- **Critic agent** — New plan review gate that evaluates the architect's plan BEFORE implementation begins. Returns APPROVED/NEEDS_REVISION/REJECTED verdicts with confidence scores and up to 5 prioritized issues. Includes AI-slop detection.
- **Phase 4.5 (Critic Gate)** in architect workflow — Mandatory plan review between planning and execution. Max 2 revision cycles before escalating to user.
- **Gap analysis** in Phase 2 discovery — Architect now makes a second explorer call focused on hidden requirements, unstated assumptions, and scope risks.

### Changed
- **Test engineer** now writes AND runs tests, reporting structured PASS/FAIL verdicts instead of only generating test files. 3-step workflow: write → run → report.
- **Architect prompt** updated with test execution delegation examples and verdict loop in Phase 5 (5d-5f).
- Updated all documentation (README.md, architecture.md, design-rationale.md, installation.md) to reflect new agent structure and workflow.

## [4.0.1] - 2026-02-06
### Fixed
- Strengthened architect review gate enforcement — explicit STOP instruction on REJECTED verdict to prevent proceeding to test generation before code review passes.

## [4.0.0] - 2026-02-06
### Changed
- **BREAKING:** Replaced 16 individual SME agents (sme_security, sme_vmware, sme_python, etc.) with a single open-domain `sme` agent. The architect determines the domain and the LLM's training provides expertise.
- **BREAKING:** Merged `security_reviewer` and `auditor` into a single `reviewer` agent. Architect specifies CHECK dimensions per review.
- **BREAKING:** Removed `_sme` and `_qa` category prefix config options.
- **BREAKING:** Config schema changes — `multi_domain_sme` and `auto_detect_domains` options removed.
- Agent count reduced from 20+ to 7 per swarm (architect, explorer, sme, coder, reviewer, test_engineer).
- Swarm identity managed exclusively through system prompt template variables ({{SWARM_ID}}, {{AGENT_PREFIX}}).
- Phase 0 now cleans up stale identity memory blocks on swarm mismatch.
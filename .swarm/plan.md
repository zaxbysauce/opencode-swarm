# v5.0.0 — Verifiable Execution
Swarm: mega
Phase: 5 [PENDING] | Updated: 2026-02-09

## Thesis
Upgrade opencode-swarm from "workflow + prompts" to "workflow + verifiable execution" by making the plan machine-checkable and persisting evidence per task.

---

## Phase 1: Canonical Plan Schema [COMPLETE]

- [x] 1.1: Define PlanSchema + TaskSchema + PhaseSchema in src/config/plan-schema.ts [SMALL]
- [x] 1.2: Create src/plan/manager.ts — load/save/migrate/derive [MEDIUM]
- [x] 1.3: Update src/hooks/extractors.ts to use plan manager [SMALL]
- [x] 1.4: Update slash commands (plan, history, diagnose, export) [SMALL]
- [x] 1.5: Tests for plan schema, manager, migration, precedence [MEDIUM]

---

## Phase 2: Evidence Bundles [COMPLETE]

- [x] 2.1: Define evidence schemas in src/config/evidence-schema.ts [SMALL]
- [x] 2.2: Create src/evidence/manager.ts with sanitizeTaskId() [SMALL]
- [x] 2.3: Add /swarm evidence command [SMALL]
- [x] 2.4: Update /swarm diagnose for evidence completeness [SMALL]
- [x] 2.5: Tests for evidence schemas and manager [MEDIUM]
- [x] 2.6: Evidence retention policy + /swarm archive [SMALL]

---

## Phase 3: Per-Agent Guardrail Profiles [COMPLETE]

- [x] 3.1: Extend GuardrailsConfigSchema with profiles [SMALL]
- [x] 3.2: Update guardrails.ts for per-agent limit resolution [SMALL]
- [x] 3.3: Tests for profile resolution and merge [SMALL]

---

## Phase 4: Enhanced Agent View + CI Hardening [COMPLETE]

- [x] 4.1: Enhance /swarm agents output [SMALL]
- [x] 4.2: Add packaging smoke test [SMALL]
- [x] 4.3: Tests for enhanced agent view [SMALL]

---

## Phase 5: Context Injection Budget + Documentation [PENDING]

- [ ] 5.1: Structured injection budget in system-enhancer.ts [SMALL]
- [ ] 5.2: Update README, CHANGELOG, docs for v5.0.0 [SMALL]
- [ ] 5.3: Version bump to 5.0.0 + final verification [SMALL]

# opencode-swarm v4.0.0 Refactoring
Swarm: mega
Phase: 5 | Updated: 2026-02-05

## Overview
Three architectural changes:
1. **Open-Domain SME** - Replace 16 hardcoded SME agents with 1 open-domain SME agent (any domain, one call per domain)
2. **Merged Reviewer** - Merge `auditor` + `security_reviewer` into unified `reviewer`
3. **Swarm Handoff** - Fix architect identity confusion when switching swarms mid-project

Agent count: ~22 agents per swarm → 7 agents per swarm (architect, explorer, sme, coder, reviewer, test_engineer)

## Phase 1: Open-Domain SME [COMPLETE]
Replace 16 individual SME agents with a single `sme` agent. No hardcoded domain list — the architect determines what domain is needed and calls it. One call per domain for full context window depth.

- [x] 1.1: Create `src/agents/sme.ts` - Open-domain SME agent [MEDIUM]
- [x] 1.2: Update `src/config/constants.ts` - Remove SME infrastructure [SMALL]
- [x] 1.3: Update `src/agents/index.ts` - Replace SME factory loop [MEDIUM]
- [x] 1.4: Delete old SME files (19 files) [SMALL]
- [x] 1.5: Update `src/config/schema.ts` [SMALL]
- [x] 1.6: Update `src/config/index.ts` - Remove SME type exports [SMALL]
- [x] 1.7: Update `src/index.ts` - Remove `SMEAgentName` export [SMALL]

## Phase 2: Merged Reviewer [COMPLETE]
Merge `auditor` + `security_reviewer` into a single `reviewer` agent with architect-specified CHECK dimensions.

- [x] 2.1: Create `src/agents/reviewer.ts` [MEDIUM]
- [x] 2.2: Update `src/config/constants.ts` - Replace QA_AGENTS [SMALL]
- [x] 2.3: Update `src/agents/index.ts` - Replace dual QA creation [SMALL]
- [x] 2.4: Delete old QA files (auditor.ts, security-reviewer.ts) [SMALL]

## Phase 3: Swarm Handoff Fix [COMPLETE]
Fix architect identity confusion when switching swarms. Two-part approach: prevent identity storage in memory + improve Phase 0 resume check.

- [x] 3.1: Update architect prompt - Add identity guardrails + new agent references [MEDIUM]
- [x] 3.2: Update architect prompt - New delegation examples [SMALL]

## Phase 4: Supporting File Updates [COMPLETE]
Update all files that reference the old agent names/structure.

- [x] 4.1: Update `src/hooks/pipeline-tracker.ts` [SMALL]
- [x] 4.2: Update `src/tools/domain-detector.ts` [SMALL]
- [x] 4.3: Update `src/config/loader.ts` [SMALL]
- [x] 4.4: Update `src/index.ts` - Tool registration + exports [SMALL]
- [x] 4.5: Update `src/cli/index.ts` - Update presets [SMALL]

## Phase 5: Build & Verify [COMPLETE]
- [x] 5.1: Run typecheck (`bun run typecheck`) - 0 errors
- [x] 5.2: Fix biome.json - Migrate from 1.9.4 to 2.3.11 schema (`biome migrate --write`)
- [x] 5.3: Add `files.includes` to biome.json to scope linting to `src/` only
- [x] 5.4: Fix lint errors - Remove unused `isSubagent` import, unused `subagentNames` variable, use template literal in cli
- [x] 5.5: Run lint (`bun run lint`) - 0 errors, 24 files checked
- [x] 5.6: Run build (`bun run build`) - Success (index.js 1.00MB + cli/index.js 4.92KB)
- [x] 5.7: Version bump to 4.0.0 in package.json

## File Impact Summary

### New Files
- `src/agents/sme.ts` - Open-domain single SME agent
- `src/agents/reviewer.ts` - Merged QA agent

### Deleted Files (21 total)
- `src/agents/sme/` directory (base.ts, index.ts, 16 domain configs)
- `src/agents/sme-unified.ts`
- `src/agents/auditor.ts`
- `src/agents/security-reviewer.ts`

### Modified Files
- `src/agents/architect.ts` - New prompt (identity guardrails, open-domain SME, merged reviewer)
- `src/agents/index.ts` - Simplified factory (2 agents replace 18), removed unused imports
- `src/config/constants.ts` - Remove SME_AGENTS, DOMAIN_PATTERNS, simplify QA_AGENTS
- `src/config/schema.ts` - Remove multi_domain_sme, auto_detect_domains
- `src/config/index.ts` - Update exports
- `src/config/loader.ts` - Remove obsolete defaults
- `src/hooks/pipeline-tracker.ts` - Update agent references
- `src/tools/domain-detector.ts` - Disabled by default, self-contained DOMAIN_PATTERNS
- `src/index.ts` - Conditional tool registration, update exports
- `src/cli/index.ts` - Updated presets, template literal fix
- `biome.json` - Migrated to 2.3.11 schema, added files.includes
- `package.json` - Version bump 3.4.0 → 4.0.0

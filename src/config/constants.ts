import type { ToolName } from '../tools/tool-names';
import { TOOL_NAME_SET } from '../tools/tool-names';
export const QA_AGENTS = ['reviewer', 'critic', 'critic_oversight'] as const;

export const PIPELINE_AGENTS = ['explorer', 'coder', 'test_engineer'] as const;

export const ORCHESTRATOR_NAME = 'architect' as const;

export const ALL_SUBAGENT_NAMES = [
	'sme',
	'docs',
	'designer',
	'critic_sounding_board',
	'critic_drift_verifier',
	'critic_hallucination_verifier',
	'curator_init',
	'curator_phase',
	...QA_AGENTS,
	...PIPELINE_AGENTS,
] as const;

export const ALL_AGENT_NAMES = [
	ORCHESTRATOR_NAME,
	...ALL_SUBAGENT_NAMES,
] as const;

// Type definitions
export type QAAgentName = (typeof QA_AGENTS)[number];
export type PipelineAgentName = (typeof PIPELINE_AGENTS)[number];
export type AgentName = (typeof ALL_AGENT_NAMES)[number];

// Tool permissions by agent - architect gets all tools, others capped at 15
export const AGENT_TOOL_MAP: Record<AgentName, ToolName[]> = {
	architect: [
		'checkpoint',
		'check_gate_status',
		'completion_verify',
		'complexity_hotspots',
		'convene_council',
		'declare_council_criteria',
		'detect_domains',
		'evidence_check',
		'extract_code_blocks',
		'gitingest',
		'imports',
		'knowledge_query',
		'lint',
		'diff',
		'diff_summary',
		'pkg_audit',
		'pre_check_batch',
		'quality_budget',
		'retrieve_summary',
		'save_plan',
		'search',
		'batch_symbols',
		'schema_drift',
		'secretscan',
		'symbols',
		'test_runner',
		'test_impact',
		'mutation_test',
		'todo_extract',
		'update_task_status',
		'lint_spec',
		'write_retro',
		'write_drift_evidence',
		'write_hallucination_evidence',
		'declare_scope',
		'sast_scan',
		'sbom_generate',
		'build_check',
		'syntax_check',
		'placeholder_scan',
		'phase_complete',
		'doc_scan',
		'doc_extract',
		'curator_analyze',
		'knowledge_add',
		'knowledge_recall',
		'knowledge_remove',
		'co_change_analyzer',
		'suggest_patch',
		'repo_map',
		'get_qa_gate_profile',
		'set_qa_gates',
	],
	explorer: [
		'complexity_hotspots',
		'detect_domains',
		'extract_code_blocks',
		'gitingest',
		'imports',
		'retrieve_summary',
		'schema_drift',
		'search',
		'batch_symbols',
		'symbols',
		'todo_extract',
		'doc_scan',
		'knowledge_recall',
		'repo_map',
	],
	coder: [
		'diff',
		'imports',
		'lint',
		'symbols',
		'extract_code_blocks',
		'retrieve_summary',
		'search',
		'build_check',
		'syntax_check',
		'knowledge_add',
		'knowledge_recall',
		'repo_map',
	],
	test_engineer: [
		'test_runner',
		'test_impact',
		'mutation_test',
		'diff',
		'symbols',
		'extract_code_blocks',
		'retrieve_summary',
		'imports',
		'complexity_hotspots',
		'pkg_audit',
		'build_check',
		'syntax_check',
		'search',
	],
	sme: [
		'complexity_hotspots',
		'detect_domains',
		'extract_code_blocks',
		'imports',
		'retrieve_summary',
		'schema_drift',
		'symbols',
		'knowledge_recall',
	],
	reviewer: [
		'diff',
		'diff_summary',
		'imports',
		'lint',
		'pkg_audit',
		'pre_check_batch',
		'secretscan',
		'symbols',
		'complexity_hotspots',
		'retrieve_summary',
		'extract_code_blocks',
		'test_runner',
		'test_impact',
		'sast_scan',
		'placeholder_scan',
		'knowledge_recall',
		'search',
		'batch_symbols',
		'suggest_patch',
		'repo_map',
	],
	critic: [
		'complexity_hotspots',
		'detect_domains',
		'imports',
		'retrieve_summary',
		'symbols',
		'knowledge_recall',
		'req_coverage',
		'repo_map',
	],
	critic_sounding_board: [
		'complexity_hotspots',
		'detect_domains',
		'imports',
		'retrieve_summary',
		'symbols',
		'knowledge_recall',
		'req_coverage',
		'repo_map',
	],
	critic_drift_verifier: [
		'complexity_hotspots',
		'detect_domains',
		'imports',
		'retrieve_summary',
		'symbols',
		'knowledge_recall',
		'req_coverage',
		'get_approved_plan',
		'repo_map',
	],
	critic_hallucination_verifier: [
		'complexity_hotspots',
		'detect_domains',
		'imports',
		'retrieve_summary',
		'symbols',
		'batch_symbols',
		'search',
		'pkg_audit',
		'knowledge_recall',
		'req_coverage',
		'repo_map',
	],
	critic_oversight: [
		'complexity_hotspots',
		'detect_domains',
		'imports',
		'retrieve_summary',
		'symbols',
		'knowledge_recall',
	],
	docs: [
		'detect_domains',
		'extract_code_blocks',
		'gitingest',
		'imports',
		'retrieve_summary',
		'schema_drift',
		'symbols',
		'todo_extract',
		'knowledge_recall',
	],
	designer: [
		'extract_code_blocks',
		'retrieve_summary',
		'symbols',
		'knowledge_recall',
	],
	// Curator agents are read-only analysis roles — knowledge recall only
	curator_init: ['knowledge_recall'],
	curator_phase: ['knowledge_recall'],
};

/**
 * Human-readable descriptions for tools shown in the architect Available Tools block.
 * Used to generate the Available Tools section of the architect prompt at construction time.
 */
/**
 * Canonical set of tool names that write/modify file contents.
 * Used by scope-guard.ts and guardrails.ts to detect write operations.
 * NOTE: bash/shell tools are intentionally excluded — bash commands are opaque
 * to static scope analysis. Post-hoc detection via guardrails diff-scope provides secondary coverage.
 */
export const WRITE_TOOL_NAMES = [
	'write',
	'edit',
	'patch',
	'apply_patch',
	'create_file',
	'insert',
	'replace',
	'append',
	'prepend',
] as const;

export type WriteToolName = (typeof WRITE_TOOL_NAMES)[number];

export const TOOL_DESCRIPTIONS: Partial<Record<ToolName, string>> = {
	symbols: 'code symbol search',
	checkpoint: 'state snapshots',
	diff: 'structured git diff with contract change detection',
	diff_summary:
		'filter classified AST changes by category, risk level, or file for reviewer drill-down',
	imports: 'dependency audit',
	lint: 'code quality',
	placeholder_scan: 'placeholder/todo detection',
	secretscan: 'secret detection',
	sast_scan: 'static analysis security scan',
	syntax_check: 'syntax validation',
	test_runner: 'auto-detect and run tests',
	test_impact:
		'identify test files impacted by changed source files via import analysis',
	mutation_test:
		'executes pre-generated mutation patches against tests, evaluates kill rate against quality gate thresholds',
	pkg_audit: 'dependency vulnerability scan — npm/pip/cargo',
	complexity_hotspots: 'git churn × complexity risk map',
	schema_drift: 'OpenAPI spec vs route drift',
	todo_extract: 'structured TODO/FIXME extraction',
	evidence_check: 'verify task evidence completeness',
	sbom_generate: 'SBOM generation for dependency inventory',
	build_check: 'build verification',
	quality_budget: 'code quality budget check',
	pre_check_batch:
		'parallel verification: lint:check + secretscan + sast_scan + quality_budget',
	update_task_status: 'mark tasks complete, track phase progress',
	write_retro:
		'document phase retrospectives via phase_complete workflow, capture lessons learned',
	write_drift_evidence:
		'write drift verification evidence for a completed phase',
	write_hallucination_evidence:
		'write hallucination verification evidence for a completed phase',
	declare_scope: 'declare file scope for next coder delegation',
	phase_complete: 'mark a phase as complete and track dispatched agents',
	save_plan: 'save a structured implementation plan',
	doc_scan: 'scan project documentation files and build an index manifest',
	doc_extract: 'extract actionable constraints from project documentation',
	curator_analyze:
		'run curator phase analysis and optionally apply knowledge recommendations',
	knowledge_add: 'store a new lesson in the knowledge base',
	knowledge_recall: 'search the knowledge base for relevant past decisions',
	knowledge_remove: 'delete an outdated knowledge entry by ID',
	knowledge_query: 'query swarm or hive knowledge with optional filters',
	co_change_analyzer: 'detect hidden couplings by analyzing git history',
	check_gate_status: 'check the gate status of a specific task',
	completion_verify: 'verify completed tasks have required evidence',
	convene_council:
		'convene the Work Complete Council — parallel veto-aware verification gate across critic, reviewer, sme, test_engineer, and explorer verdicts',
	declare_council_criteria:
		'pre-declare acceptance criteria for a task before the coder starts work; criteria are read back during council evaluation',
	detect_domains: 'detect which SME domains are relevant for a given text',
	extract_code_blocks:
		'extract code blocks from text content and save them to files',
	gitingest: 'fetch a GitHub repository full content via gitingest.com',
	retrieve_summary: 'retrieve the full content of a stored tool output summary',
	search:
		'Workspace-scoped ripgrep-style text search with structured JSON output. Supports literal and regex modes, glob filtering, and result limits. NOTE: This is text search, not structural AST search — use symbols and imports tools for structural queries.',
	batch_symbols:
		'Batched symbol extraction across multiple files. Returns per-file symbol summaries with isolated error handling.',
	suggest_patch:
		'Reviewer-safe structured patch suggestion tool. Produces context-anchored patch artifacts without file modification. Returns structured diagnostics on context mismatch.',
	lint_spec: 'validate .swarm/spec.md format and required fields',
	get_approved_plan:
		'retrieve the last critic-approved immutable plan snapshot for baseline drift comparison',
	repo_map:
		'query the repo code graph: importers, dependencies, blast radius, and localization context for structural awareness before refactoring',
	get_qa_gate_profile:
		'retrieve the QA gate profile for the current plan: gates, lock state, and profile hash. Read-only.',
	set_qa_gates:
		'configure the QA gate profile for the current plan. Architect-only. Ratchet-tighter only — rejected once the profile is locked after critic approval.',
	req_coverage:
		'query requirement coverage status for tracked functional requirements',
};

// Runtime validation: ensure all tool names in AGENT_TOOL_MAP are registered
for (const [agentName, tools] of Object.entries(AGENT_TOOL_MAP)) {
	const invalidTools = tools.filter(
		(tool) => !TOOL_NAME_SET.has(tool as ToolName),
	);
	if (invalidTools.length > 0) {
		throw new Error(
			`Agent '${agentName}' has invalid tool names: [${invalidTools.join(', ')}]. ` +
				`All tools must be registered in TOOL_NAME_SET.`,
		);
	}
}

// Default models for each agent/category
// v6.14: switched to free OpenCode Zen models; architect key intentionally
// omitted so it inherits the OpenCode UI model selection.
export const DEFAULT_MODELS: Record<string, string> = {
	// Explorer — fast read-heavy analysis
	explorer: 'opencode/trinity-large-preview-free',

	// Pipeline agents — differentiated models for writing vs reviewing
	coder: 'opencode/minimax-m2.5-free',
	reviewer: 'opencode/big-pickle',
	test_engineer: 'opencode/gpt-5-nano',

	// SME, Critic variants, Docs, Designer — reasoning/general tasks
	sme: 'opencode/trinity-large-preview-free',
	critic: 'opencode/trinity-large-preview-free',
	critic_sounding_board: 'opencode/trinity-large-preview-free',
	critic_drift_verifier: 'opencode/trinity-large-preview-free',
	critic_hallucination_verifier: 'opencode/trinity-large-preview-free',
	critic_oversight: 'opencode/trinity-large-preview-free',
	docs: 'opencode/trinity-large-preview-free',
	designer: 'opencode/trinity-large-preview-free',

	// Curator agents — lightweight read-only analysis (same model family as explorer)
	curator_init: 'opencode/trinity-large-preview-free',
	curator_phase: 'opencode/trinity-large-preview-free',

	// Fallback
	default: 'opencode/trinity-large-preview-free',
};

// Check if agent is in QA category
export function isQAAgent(name: string): name is QAAgentName {
	return (QA_AGENTS as readonly string[]).includes(name);
}

// Check if agent is a subagent
export function isSubagent(name: string): boolean {
	return (ALL_SUBAGENT_NAMES as readonly string[]).includes(name);
}

import { deepMerge } from '../utils/merge';
import type { ScoringConfig } from './schema';

// Default scoring configuration
export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
	enabled: false,
	max_candidates: 100,
	weights: {
		phase: 1.0,
		current_task: 2.0,
		blocked_task: 1.5,
		recent_failure: 2.5,
		recent_success: 0.5,
		evidence_presence: 1.0,
		decision_recency: 1.5,
		dependency_proximity: 1.0,
	},
	decision_decay: {
		mode: 'exponential',
		half_life_hours: 24,
	},
	token_ratios: {
		prose: 0.25,
		code: 0.4,
		markdown: 0.3,
		json: 0.35,
	},
};

/**
 * Resolve scoring configuration by deep-merging user config with defaults.
 * Missing scoring block → use defaults; partial weights → merge with defaults.
 *
 * @param userConfig - Optional user-provided scoring configuration
 * @returns The effective scoring configuration with all defaults applied
 */
export function resolveScoringConfig(
	userConfig?: ScoringConfig,
): ScoringConfig {
	if (!userConfig) {
		return DEFAULT_SCORING_CONFIG;
	}

	// Deep merge user config with defaults
	const merged = deepMerge(
		DEFAULT_SCORING_CONFIG as Record<string, unknown>,
		userConfig as Record<string, unknown>,
	);

	return merged as ScoringConfig;
}

/**
 * Model ID substrings that identify low-capability models.
 * If a model's ID contains any of these substrings (case-insensitive),
 * it is considered a low-capability model.
 */
export const LOW_CAPABILITY_MODELS = ['mini', 'nano', 'small', 'free'] as const;

/**
 * Returns true if the given modelId contains any LOW_CAPABILITY_MODELS substring
 * (case-insensitive comparison).
 *
 * @param modelId - The model ID to check
 * @returns true if the model is considered low capability, false otherwise
 */
export function isLowCapabilityModel(modelId: string): boolean {
	if (!modelId) return false;
	const lower = modelId.toLowerCase();
	return LOW_CAPABILITY_MODELS.some((substr) => lower.includes(substr));
}

export const SLOP_DETECTOR_DEFAULTS = {
	enabled: true,
	classThreshold: 3,
	commentStripThreshold: 5,
	diffLineThreshold: 200,
} as const;

export const INCREMENTAL_VERIFY_DEFAULTS = {
	enabled: true,
	command: null,
	timeoutMs: 30000,
	triggerAgents: ['coder'],
} as const;

export const COMPACTION_DEFAULTS = {
	enabled: true,
	observationThreshold: 40,
	reflectionThreshold: 60,
	emergencyThreshold: 80,
	preserveLastNTurns: 5,
} as const;

// Banner messages for architect prompt
export const TURBO_MODE_BANNER = `## 🚀 TURBO MODE ACTIVE

**Speed optimization enabled for this session.**

While Turbo Mode is active:
- **Stage A gates** (lint, imports, pre_check_batch) are still REQUIRED for ALL tasks
- **Tier 3 tasks** (security-sensitive files matching: architect*.ts, delegation*.ts, guardrails*.ts, adversarial*.ts, sanitiz*.ts, auth*, permission*, crypto*, secret*, security) still require FULL review (Stage B)
- **Tier 0-2 tasks** can skip Stage B (reviewer, test_engineer) to speed up execution
- **Phase completion gates** (completion-verify and drift verification gate) are automatically bypassed — phase_complete will succeed without drift verification evidence when turbo is active. Note: turbo bypass is session-scoped; one session's turbo does not affect other sessions.

Classification still determines the pipeline:
- TIER 0 (metadata): lint + diff only — no change
- TIER 1 (docs): Stage A + reviewer — no change
- TIER 2 (standard code): Stage A + reviewer + test_engineer — CAN SKIP Stage B with turboMode
- TIER 3 (critical): Stage A + 2x reviewer + 2x test_engineer — Stage B REQUIRED (no turbo bypass)

Do NOT skip Stage A gates. Do NOT skip Stage B for TIER 3.
`;

export const FULL_AUTO_BANNER = `## ⚡ FULL-AUTO MODE ACTIVE

You are operating without a human in the loop. All escalations route to the Autonomous Oversight Critic instead of a user.

Behavioral changes:
- TIER 3 escalations go to the critic, not a human. Frame your questions technically, not conversationally.
- Phase completion approval comes from the critic. Ensure all evidence is written before requesting.
- The critic defaults to REJECT. Do not attempt to pressure, negotiate, or shortcut. Complete the evidence trail.
- If the critic returns ESCALATE_TO_HUMAN, the session will pause or terminate. Only the critic can trigger this.
- Do NOT ask "Ready for Phase N+1?" — call phase_complete directly. The critic reviews automatically.
`;

import type { ToolName } from '../tools/tool-names';
import { TOOL_NAME_SET } from '../tools/tool-names';
export const QA_AGENTS = ['reviewer', 'critic'] as const;

export const PIPELINE_AGENTS = ['explorer', 'coder', 'test_engineer'] as const;

export const ORCHESTRATOR_NAME = 'architect' as const;

export const ALL_SUBAGENT_NAMES = [
	'sme',
	'docs',
	'designer',
	'critic_sounding_board',
	'critic_drift_verifier',
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
		'detect_domains',
		'evidence_check',
		'extract_code_blocks',
		'gitingest',
		'imports',
		'knowledge_query',
		'lint',
		'diff',
		'pkg_audit',
		'pre_check_batch',
		'quality_budget',
		'retrieve_summary',
		'save_plan',
		'schema_drift',
		'secretscan',
		'symbols',
		'test_runner',
		'todo_extract',
		'update_task_status',
		'write_retro',
		'write_drift_evidence',
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
		'knowledgeAdd',
		'knowledgeRecall',
		'knowledgeRemove',
		'co_change_analyzer',
	],
	explorer: [
		'complexity_hotspots',
		'detect_domains',
		'extract_code_blocks',
		'gitingest',
		'imports',
		'retrieve_summary',
		'schema_drift',
		'symbols',
		'todo_extract',
		'doc_scan',
		'knowledgeRecall',
	],
	coder: [
		'diff',
		'imports',
		'lint',
		'symbols',
		'extract_code_blocks',
		'retrieve_summary',
		'build_check',
		'syntax_check',
		'knowledgeAdd',
		'knowledgeRecall',
	],
	test_engineer: [
		'test_runner',
		'diff',
		'symbols',
		'extract_code_blocks',
		'retrieve_summary',
		'imports',
		'complexity_hotspots',
		'pkg_audit',
		'build_check',
		'syntax_check',
	],
	sme: [
		'complexity_hotspots',
		'detect_domains',
		'extract_code_blocks',
		'imports',
		'retrieve_summary',
		'schema_drift',
		'symbols',
		'knowledgeRecall',
	],
	reviewer: [
		'diff',
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
		'sast_scan',
		'placeholder_scan',
		'knowledgeRecall',
	],
	critic: [
		'complexity_hotspots',
		'detect_domains',
		'imports',
		'retrieve_summary',
		'symbols',
		'knowledgeRecall',
	],
	critic_sounding_board: [
		'complexity_hotspots',
		'detect_domains',
		'imports',
		'retrieve_summary',
		'symbols',
		'knowledgeRecall',
	],
	critic_drift_verifier: [
		'complexity_hotspots',
		'detect_domains',
		'imports',
		'retrieve_summary',
		'symbols',
		'knowledgeRecall',
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
		'knowledgeRecall',
	],
	designer: [
		'extract_code_blocks',
		'retrieve_summary',
		'symbols',
		'knowledgeRecall',
	],
	// Curator agents are read-only analysis roles — knowledge recall only
	curator_init: ['knowledgeRecall'],
	curator_phase: ['knowledgeRecall'],
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
	imports: 'dependency audit',
	lint: 'code quality',
	placeholder_scan: 'placeholder/todo detection',
	secretscan: 'secret detection',
	sast_scan: 'static analysis security scan',
	syntax_check: 'syntax validation',
	test_runner: 'auto-detect and run tests',
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
	declare_scope: 'declare file scope for next coder delegation',
	phase_complete: 'mark a phase as complete and track dispatched agents',
	save_plan: 'save a structured implementation plan',
	doc_scan: 'scan project documentation files and build an index manifest',
	doc_extract: 'extract actionable constraints from project documentation',
	curator_analyze:
		'run curator phase analysis and optionally apply knowledge recommendations',
	knowledgeAdd: 'store a new lesson in the knowledge base',
	knowledgeRecall: 'search the knowledge base for relevant past decisions',
	knowledgeRemove: 'delete an outdated knowledge entry by ID',
	knowledge_query: 'query swarm or hive knowledge with optional filters',
	co_change_analyzer: 'detect hidden couplings by analyzing git history',
	check_gate_status: 'check the gate status of a specific task',
	completion_verify: 'verify completed tasks have required evidence',
	detect_domains: 'detect which SME domains are relevant for a given text',
	extract_code_blocks:
		'extract code blocks from text content and save them to files',
	gitingest: 'fetch a GitHub repository full content via gitingest.com',
	retrieve_summary: 'retrieve the full content of a stored tool output summary',
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

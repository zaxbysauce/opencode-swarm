import type { ToolName } from '../tools/tool-names';
import { TOOL_NAME_SET } from '../tools/tool-names';
export const QA_AGENTS = ['reviewer', 'critic'] as const;

export const PIPELINE_AGENTS = ['explorer', 'coder', 'test_engineer'] as const;

export const ORCHESTRATOR_NAME = 'architect' as const;

export const ALL_SUBAGENT_NAMES = [
	'sme',
	'docs',
	'designer',
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

// Tool permissions by agent - architect gets all tools, others capped at 12
export const AGENT_TOOL_MAP: Record<AgentName, ToolName[]> = {
	architect: [
		'checkpoint',
		'complexity_hotspots',
		'detect_domains',
		'evidence_check',
		'extract_code_blocks',
		'gitingest',
		'imports',
		'lint',
		'diff',
		'pkg_audit',
		'pre_check_batch',
		'retrieve_summary',
		'schema_drift',
		'secretscan',
		'symbols',
		'test_runner',
		'todo_extract',
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
	],
	coder: [
		'diff',
		'imports',
		'lint',
		'symbols',
		'extract_code_blocks',
		'retrieve_summary',
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
	],
	sme: [
		'complexity_hotspots',
		'detect_domains',
		'extract_code_blocks',
		'imports',
		'retrieve_summary',
		'schema_drift',
		'symbols',
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
	],
	critic: [
		'complexity_hotspots',
		'detect_domains',
		'imports',
		'retrieve_summary',
		'symbols',
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
	],
	designer: ['extract_code_blocks', 'retrieve_summary', 'symbols'],
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
export const DEFAULT_MODELS: Record<string, string> = {
	// Orchestrator — needs strong reasoning
	architect: 'anthropic/claude-sonnet-4-20250514',

	// Explorer — fast/cheap for file discovery
	explorer: 'google/gemini-2.5-flash',

	// Pipeline agents
	coder: 'anthropic/claude-sonnet-4-20250514',
	test_engineer: 'google/gemini-2.5-flash',

	// SME, Reviewer, Critic, Docs, Designer — fast/cheap
	sme: 'google/gemini-2.5-flash',
	reviewer: 'google/gemini-2.5-flash',
	critic: 'google/gemini-2.5-flash',
	docs: 'google/gemini-2.5-flash',
	designer: 'google/gemini-2.5-flash',

	// Fallback
	default: 'google/gemini-2.5-flash',
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

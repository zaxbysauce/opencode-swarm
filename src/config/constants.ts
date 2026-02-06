// QA agents
export const QA_AGENTS = ['reviewer', 'critic'] as const;

export const PIPELINE_AGENTS = ['explorer', 'coder', 'test_engineer'] as const;

export const ORCHESTRATOR_NAME = 'architect' as const;

export const ALL_SUBAGENT_NAMES = [
	'sme',
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

// Default models for each agent/category
export const DEFAULT_MODELS: Record<string, string> = {
	// Orchestrator
	architect: 'anthropic/claude-sonnet-4-5',

	// Fast explorer agent (use cheap/fast model)
	explorer: 'google/gemini-2.0-flash',

	// Pipeline agents
	coder: 'anthropic/claude-sonnet-4-5',
	test_engineer: 'google/gemini-2.0-flash',

	// SME agent
	sme: 'google/gemini-2.0-flash',

	// Reviewer agent (QA)
	reviewer: 'google/gemini-2.0-flash',

	// Critic agent (QA - plan review gate)
	critic: 'google/gemini-2.0-flash',

	// Fallback
	default: 'google/gemini-2.0-flash',
};

// Check if agent is in QA category
export function isQAAgent(name: string): name is QAAgentName {
	return (QA_AGENTS as readonly string[]).includes(name);
}

// Check if agent is a subagent
export function isSubagent(name: string): boolean {
	return (ALL_SUBAGENT_NAMES as readonly string[]).includes(name);
}

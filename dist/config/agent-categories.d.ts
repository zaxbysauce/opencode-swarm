/**
 * Single source of truth for agent categorization.
 * Used by the monitor server /metadata endpoint to classify agents.
 */
export type AgentCategory = 'orchestrator' | 'pipeline' | 'qa' | 'support';
export declare const AGENT_CATEGORY: Readonly<Record<string, AgentCategory>>;
/**
 * Resolve an agent's category.
 * @param agentName - Agent name (e.g. "architect", "critic_sounding_board")
 * @returns The agent's category, or undefined if the agent name is unknown
 */
export declare function getAgentCategory(agentName: string): AgentCategory | undefined;
